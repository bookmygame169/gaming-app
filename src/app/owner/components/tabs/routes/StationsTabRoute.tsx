"use client";
// @ts-nocheck

import dynamic from "next/dynamic";
import { theme } from "../../../utils/theme";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const StationsTab = dynamic(() => import("../../StationsTab").then((mod) => mod.StationsTab), { ssr: false });
const StationLiveStatus = dynamic(() => import("../../StationLiveStatus").then((mod) => mod.StationLiveStatus), { ssr: false });
const AddStationPc = dynamic(() => import("../../AddStationPc").then((mod) => mod.AddStationPc), { ssr: false });
const UnlockHistory = dynamic(() => import("../../UnlockHistory").then((mod) => mod.UnlockHistory), { ssr: false });

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
        onAddStation={() => {
          setNewStationType("ps5");
          setNewStationCount(1);
          setShowAddStationModal(true);
        }}
        theme={theme}
      />
      <div className="mt-4 flex flex-col gap-4">
        <StationLiveStatus cafeId={selectedCafeId || undefined} />
        <AddStationPc
          cafeId={selectedCafeId || undefined}
          downloadUrl={process.env.NEXT_PUBLIC_AGENT_DOWNLOAD_URL}
        />
        <UnlockHistory cafeId={selectedCafeId || undefined} />
      </div>
    </ErrorBoundary>
  );
}
