"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { theme } from "../../../utils/theme";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const StationsTab = dynamic(() => import("../../StationsTab").then((mod) => mod.StationsTab), { ssr: false });
const StationLiveStatus = dynamic(() => import("../../StationLiveStatus").then((mod) => mod.StationLiveStatus), { ssr: false });
const StationLockSetupModal = dynamic(
  () => import("../../StationLockSetupModal").then((mod) => mod.StationLockSetupModal),
  { ssr: false }
);
const UnlockHistory = dynamic(() => import("../../UnlockHistory").then((mod) => mod.UnlockHistory), { ssr: false });
const CafePcGamesEditor = dynamic(
  () => import("../../CafePcGamesEditor").then((mod) => mod.CafePcGamesEditor),
  { ssr: false }
);

type LiveStationRow = {
  station_name: string;
  status: string;
  seconds_since_seen: number;
  online: boolean;
};

type SetupStation = {
  name: string;
  displayName: string;
};

export function StationsTabRoute() {
  const {
    cafes,
    currentCafe,
    bookings,
    stationPricing,
    poweredOffStations,
    maintenanceStations,
    isMobile,
    handleTogglePower,
    handleToggleMaintenance,
    setEditingStation,
    setStationToDelete,
    setNewStationType,
    setNewStationCount,
    setShowAddStationModal,
    selectedCafeId,
  } = useOwnerDashboard();

  const [setupStation, setSetupStation] = useState<SetupStation | null>(null);
  const [liveStations, setLiveStations] = useState<LiveStationRow[]>([]);

  const loadLiveStatus = useCallback(async () => {
    if (!selectedCafeId) return;

    try {
      const res = await fetch(
        `/api/owner/stations/status?cafeId=${encodeURIComponent(selectedCafeId)}`,
        { credentials: "include" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setLiveStations(Array.isArray(data.stations) ? data.stations : []);
    } catch {
      // Live status is optional during setup.
    }
  }, [selectedCafeId]);

  useEffect(() => {
    // loadLiveStatus sets state only after `await fetch(...)`. Nothing runs
    // synchronously here; the rule cannot see past the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLiveStatus();
    const timer = setInterval(loadLiveStatus, 20000);
    return () => clearInterval(timer);
  }, [loadLiveStatus]);

  const liveInfoForSetup = setupStation
    ? liveStations.find((row) => row.station_name === setupStation.name)
    : null;

  if (cafes.length === 0) return null;

  return (
    <ErrorBoundary>
      <StationsTab
        currentCafe={currentCafe}
        bookings={bookings}
        stationPricing={stationPricing}
        poweredOffStations={poweredOffStations}
        maintenanceStations={maintenanceStations}
        isMobile={isMobile}
        onTogglePower={handleTogglePower}
        onToggleMaintenance={handleToggleMaintenance}
        onEditPricing={(station) => setEditingStation(station)}
        onDeleteStation={(station) => setStationToDelete(station)}
        onSetupLock={(station) =>
          setSetupStation({ name: station.name, displayName: station.displayName })
        }
        onAddStation={() => {
          setNewStationType("ps5");
          setNewStationCount(1);
          setShowAddStationModal(true);
        }}
        theme={theme}
      />
      <div className="mt-4 flex flex-col gap-4">
        <StationLiveStatus cafeId={selectedCafeId || undefined} />
        <CafePcGamesEditor cafeId={selectedCafeId || undefined} />
        <UnlockHistory cafeId={selectedCafeId || undefined} />
      </div>

      {setupStation && selectedCafeId && (
        <StationLockSetupModal
          cafeId={selectedCafeId}
          stationName={setupStation.name}
          displayName={setupStation.displayName}
          liveInfo={liveInfoForSetup}
          onLiveRefresh={loadLiveStatus}
          onClose={() => setSetupStation(null)}
        />
      )}
    </ErrorBoundary>
  );
}
