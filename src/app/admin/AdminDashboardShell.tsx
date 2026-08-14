"use client";

import { AdminSidebar, AdminMobileMenuButton } from "@/app/admin/components/AdminSidebar";
import { AdminTabContent } from "@/app/admin/components/AdminTabContent";
import { AdminDashboardProvider, useAdminDashboard } from "@/app/admin/context/AdminDashboardContext";
import type { AdminRouteTab } from "@/app/admin/navigation";
import { RefreshCw } from "lucide-react";

function AdminDashboardView() {
  const {
    activeTab,
    isChecking,
    isAdmin,
    isMobile,
    mobileMenuOpen,
    setMobileMenuOpen,
    handleTabChange,
    router,
    activeTabMeta,
    loadingData,
    stats,
    formatCurrency,
    formattedToday,
  } = useAdminDashboard();

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#09090e] flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen flex bg-[#09090e] text-slate-100">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={(tab) => handleTabChange(tab)}
        isMobile={isMobile}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onLogout={async () => {
          await fetch("/api/admin/login", { method: "DELETE", credentials: "include" });
          router.push("/admin/login");
        }}
      />

      <main className={`flex-1 overflow-auto ${isMobile ? "" : "ml-72"}`}>
        <header className="sticky top-0 z-30 bg-[#09090e]/90 backdrop-blur-md border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-5 py-3.5 md:px-8">
            <div className="flex items-center gap-3">
              {isMobile && <AdminMobileMenuButton onClick={() => setMobileMenuOpen(true)} />}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{activeTabMeta.eyebrow}</p>
                <h1 className="text-lg font-bold text-white leading-tight">{activeTabMeta.title}</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isMobile && (
                <div className="flex items-center gap-2 mr-2">
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Active Cafés</div>
                    <div className="text-base font-bold text-white">{loadingData ? "…" : stats?.activeCafes || 0}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Today</div>
                    <div className="text-base font-bold text-emerald-400">{loadingData ? "…" : formatCurrency(stats?.todayRevenue || 0)}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Bookings</div>
                    <div className="text-base font-bold text-blue-400">{loadingData ? "…" : stats?.totalBookings || 0}</div>
                  </div>
                </div>
              )}
              <span className="hidden md:block text-xs text-slate-600 mr-1">{formattedToday}</span>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <RefreshCw size={14} />Refresh
              </button>
            </div>
          </div>
        </header>

        <AdminTabContent />
      </main>
    </div>
  );
}

export default function AdminDashboardShell({ activeTab }: { activeTab: AdminRouteTab }) {
  return (
    <AdminDashboardProvider activeTab={activeTab}>
      <AdminDashboardView />
    </AdminDashboardProvider>
  );
}
