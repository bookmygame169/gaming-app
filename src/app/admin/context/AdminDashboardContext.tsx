"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminRouteTab } from "../navigation";
import { useAdminDashboardController } from "../hooks/useAdminDashboardController";

/**
 * Whatever the controller returns — derived, not restated.
 *
 * This was `any`, which switched off type checking for every consumer of this
 * context. AdminTabContent reads 100-odd values off it, so the compiler had
 * nothing to say about any of them, and two of those reads were to things that
 * do not exist: an icon that was never imported and a handler the controller
 * defines but never returns. Both threw at the moment a person clicked.
 *
 * ReturnType keeps this honest without a second copy of the shape to maintain:
 * remove something from the controller and every use of it stops compiling.
 */
type AdminDashboardContextValue = ReturnType<typeof useAdminDashboardController>;

const AdminDashboardContext = createContext<AdminDashboardContextValue | null>(null);

export function useAdminDashboard(): AdminDashboardContextValue {
  const ctx = useContext(AdminDashboardContext);
  if (!ctx) throw new Error("useAdminDashboard must be used within AdminDashboardProvider");
  return ctx;
}

export function AdminDashboardProvider({
  activeTab,
  children,
}: {
  activeTab: AdminRouteTab;
  children: ReactNode;
}) {
  const value = useAdminDashboardController(activeTab);
  return (
    <AdminDashboardContext.Provider value={value}>{children}</AdminDashboardContext.Provider>
  );
}
