"use client";
// @ts-nocheck

import dynamic from "next/dynamic";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const Billing = dynamic(() => import("../../Billing").then((mod) => mod.Billing), { ssr: false });

export function BillingTab() {
  const {
    currentCafeId,
    cafes,
    isMobile,
    setSnackSaleModalOpen,
    consolePricing,
    stationPricing,
    membershipPlans,
    refreshData,
    handleTabChange,
  } = useOwnerDashboard();

  return (
    <ErrorBoundary>
      <div>
        <Billing
          cafeId={currentCafeId}
          cafes={cafes}
          isMobile={isMobile}
          onSnackOnlySale={() => setSnackSaleModalOpen(true)}
          pricingData={consolePricing[currentCafeId] || {}}
          stationPricingList={
            Object.values(stationPricing).filter(
              (station: any) => !currentCafeId || station?.cafe_id === currentCafeId
            ) as any
          }
          membershipPlans={membershipPlans.filter((p: any) => p.cafe_id === currentCafeId)}
          onSuccess={() => {
            refreshData();
            handleTabChange("dashboard");
          }}
          onMembershipSuccess={(result) => {
            refreshData();
            handleTabChange(result?.hasDayPass ? "bookings" : "memberships");
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
