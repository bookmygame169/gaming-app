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
  | {
      action: "unlock";
      duration_seconds: number;
      session_id: string;

      // An unlimited membership: the seconds above are a backstop against
      // somebody walking out, not time the customer is spending. A station
      // told this shows no countdown and gives no time warnings, because
      // there is no time to run out of.
      open_ended?: boolean;
    }
  | { action: "lock" }
  | { action: "warn"; remaining_seconds: number }

  // Asked for so a PC picks up a new version of the lock: the updater runs at
  // startup and refuses to replace a running agent, so a machine signed in all
  // day never gives it the chance. The agent decides for itself whether obeying
  // is safe - it is the only thing that knows for certain whether somebody is
  // playing.
  | { action: "restart" };

export type SendStationCommandOptions = {
  cafeId?: string | null;
};

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

export function stationCommandTopics(stationName: string, cafeId?: string | null): string[] {
  const legacy = `cafe/station/${stationName}/command`;
  if (!cafeId) return [legacy];
  return [legacy, `cafe/${cafeId}/station/${stationName}/command`];
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
  buildCommand: (stationName: string) => StationCommand,
  options: SendStationCommandOptions = {}
): Promise<void> {
  if (stationNames.length === 0) {
    return;
  }

  const client = await mqtt.connectAsync(getBrokerUrl(), {
    username: process.env.MQTT_USERNAME || undefined,
    password: process.env.MQTT_PASSWORD || undefined,
    connectTimeout: CONNECT_TIMEOUT_MS,
    clientId: `bookmygame-web-${randomUUID()}`,
    clean: true,
  });

  try {
    await Promise.all(
      stationNames.flatMap((stationName) => {
        const payload = JSON.stringify({
          ...buildCommand(stationName),
          command_id: randomUUID(),
          issued_at: Math.floor(Date.now() / 1000),
          cafe_id: options.cafeId || undefined,
        });

        return stationCommandTopics(stationName, options.cafeId).map((topic) =>
          client.publishAsync(topic, payload, { qos: 1, retain: false })
        );
      })
    );
  } finally {
    await client.endAsync();
  }
}
