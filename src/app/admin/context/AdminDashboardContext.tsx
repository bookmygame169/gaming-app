"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminRouteTab } from "../navigation";
import { useAdminDashboardController } from "../hooks/useAdminDashboardController";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDashboardContextValue = any;

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
