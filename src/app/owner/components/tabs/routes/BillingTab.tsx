"use client";

import type { ComponentProps } from 'react';
import dynamic from "next/dynamic";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const Billing = dynamic(() => import("../../Billing").then((mod) => mod.Billing), { ssr: false });

/**
 * The only field either of these filters reads.
 *
 * The owner context is still typed `any`, so nothing narrower flows in here
 * yet — but naming the field that matters is enough to catch it being renamed,
 * which `any` was not.
 */
type CafeScoped = { cafe_id?: string | null };

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
            (Object.values(stationPricing) as CafeScoped[]).filter(
              (station) => !currentCafeId || station?.cafe_id === currentCafeId
            ) as ComponentProps<typeof Billing>["stationPricingList"]
          }
          membershipPlans={membershipPlans.filter(
            (plan: CafeScoped) => plan.cafe_id === currentCafeId
          )}
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
