"use client";

import { DashboardLayout } from './components';
import { NavTab } from './types';
import { OwnerDashboardProvider, useOwnerDashboard } from './context/OwnerDashboardContext';
import { OwnerTabContent } from './components/OwnerTabContent';
import { OwnerDashboardModals } from './components/OwnerDashboardModals';
import type { OwnerRouteTab } from './navigation';

function OwnerDashboardView({ railCollapsed }: { railCollapsed: boolean }) {
  const {
    activeTab,
    handleTabChange,
    currentCafe,
    cafes,
    isMobile,
    mobileMenuOpen,
    setMobileMenuOpen,
    refreshData,
    ownerSummary,
    setSnackSaleModalOpen,
    allowed,
    checkingRole,
    hasLoadedData,
    error,
  } = useOwnerDashboard();

  if (checkingRole && !hasLoadedData) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0b0c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f2f0ea",
          fontFamily: "ui-monospace, monospace",
          letterSpacing: "0.16em",
          fontSize: 12,
        }}
      >
        LOADING
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        onTabChange={(tab: string) => handleTabChange(tab as NavTab)}
        cafeName={currentCafe?.name || (cafes.length > 0 ? "Your Café" : "Loading...")}
        isMobile={isMobile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        title="Dashboard"
        onRefresh={refreshData}
        onNewSnackSale={() => setSnackSaleModalOpen(true)}
        initialCollapsed={railCollapsed}
        navBadges={{
          payments: ownerSummary?.payments.waiting ?? 0,
          reviews: ownerSummary?.reviews.needsReply ?? 0,
        }}
      >
        <div className="px-4 pt-5 pb-28 md:px-8 md:pb-10">
          {error && (
            <div
              style={{
                padding: "16px 20px",
                borderRadius: 12,
                background: "rgba(255, 92, 43, 0.1)",
                border: "1px solid rgba(255, 92, 43, 0.3)",
                color: "#ff5c2b",
                marginBottom: 24,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}
          <OwnerTabContent />
        </div>
      </DashboardLayout>
      <OwnerDashboardModals />
    </>
  );
}

export default function OwnerDashboardShell({
  activeTab,
  railCollapsed = false,
}: {
  activeTab: OwnerRouteTab;
  railCollapsed?: boolean;
}) {
  return (
    <OwnerDashboardProvider activeTab={activeTab}>
      <OwnerDashboardView railCollapsed={railCollapsed} />
    </OwnerDashboardProvider>
  );
}
