import { randomUUID } from "crypto";
import mqtt from "mqtt";

/**
 * Sends lock/unlock commands to the station agents (the app running on each
 * gaming PC, and later the Raspberry Pi on each PS5).
 *
 * All broker-specific code lives here so swapping provider or library later
 * touches nothing else.
 *
 * Note this only ever *publishes*. Receiving heartbeats needs a connection that
 * stays open, which a serverless deployment cannot hold — that will need a small
 * always-on listener alongside the broker.
 */

export type StationCommand =
  | { action: "unlock"; duration_seconds: number; session_id: string }
  | { action: "lock" }
  | { action: "warn"; remaining_seconds: number };

const CONNECT_TIMEOUT_MS = 8000;

function getBrokerUrl(): string {
  const url = process.env.MQTT_BROKER_URL;
  if (!url) {
    throw new Error(
      "MQTT_BROKER_URL is not set. Add it to .env.local, e.g. mqtt://127.0.0.1:1883"
    );
  }
  return url;
}

/**
 * Publishes one command to each station, then closes the connection.
 *
 * Connecting per request rather than holding a shared client: serverless
 * functions are frozen between invocations, so a long-lived client would be
 * silently dead by the time the next request arrived.
 */
export async function sendStationCommands(
  stationNames: string[],
  buildCommand: (stationName: string) => StationCommand
): Promise<void> {
  if (stationNames.length === 0) {
    return;
  }

  const client = await mqtt.connectAsync(getBrokerUrl(), {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // A fresh id per request; reusing one would make the broker drop the
    // previous connection when two requests overlap.
    clientId: `bookmygame-web-${Math.random().toString(16).slice(2, 10)}`,
    clean: true,
  });

  try {
    await Promise.all(
      stationNames.map((stationName) => {
        const topic = `cafe/station/${stationName}/command`;

        // Stamped so the agent can refuse a command it has already acted on,
        // or one old enough to have been captured off the broker and replayed.
        // An agent that predates these fields ignores them, so this can ship
        // before the PCs have updated.
        const payload = JSON.stringify({
          ...buildCommand(stationName),
          command_id: randomUUID(),
          issued_at: Math.floor(Date.now() / 1000),
        });

        // qos 1 so the broker acknowledges receipt. Never `retain` — a retained
        // unlock would be replayed to the station every time it reconnects,
        // silently opening a PC nobody paid for.
        return client.publishAsync(topic, payload, { qos: 1, retain: false });
      })
    );
  } finally {
    // Ends cleanly rather than leaving the socket to time out.
    await client.endAsync();
  }
}
