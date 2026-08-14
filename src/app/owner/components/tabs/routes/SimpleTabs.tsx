"use client";
// @ts-nocheck

import dynamic from "next/dynamic";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const Memberships = dynamic(() => import("../../Memberships").then((mod) => mod.Memberships), { ssr: false });
const Coupons = dynamic(() => import("../../Coupons").then((mod) => mod.Coupons), { ssr: false });
const Reports = dynamic(() => import("../../Reports").then((mod) => mod.Reports), { ssr: false });
const Inventory = dynamic(() => import("../../Inventory"), { ssr: false });
const OwnerTournaments = dynamic(() => import("../../OwnerTournaments").then((mod) => mod.OwnerTournaments), { ssr: false });
const OwnerLoyalty = dynamic(() => import("../../OwnerLoyalty").then((mod) => mod.OwnerLoyalty), { ssr: false });
const OwnerReviews = dynamic(() => import("../../OwnerReviews").then((mod) => mod.OwnerReviews), { ssr: false });
const OwnerPayments = dynamic(() => import("../../OwnerPayments").then((mod) => mod.OwnerPayments), { ssr: false });
const OwnerWallet = dynamic(() => import("../../OwnerWallet").then((mod) => mod.OwnerWallet), { ssr: false });

export function MembershipsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <Memberships
        isMobile={ctx.isMobile}
        cafeId={ctx.currentCafeId}
        cafeOpeningHours={ctx.currentCafe?.opening_hours || ""}
        subscriptions={ctx.subscriptions}
        membershipPlans={ctx.membershipPlans}
        activeTimers={ctx.activeTimers}
        timerElapsed={ctx.timerElapsed}
        onStartTimer={ctx.handleStartTimer}
        onStopTimer={ctx.handleStopTimer}
        onRefresh={() => ctx.refreshData()}
      />
    </ErrorBoundary>
  );
}

export function CouponsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <Coupons isMobile={ctx.isMobile} cafeId={ctx.currentCafeId} onRefresh={() => ctx.refreshData()} />
    </ErrorBoundary>
  );
}

export function ReportsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <Reports
        cafeId={ctx.currentCafeId}
        cafeName={ctx.currentCafe?.name ?? undefined}
        isMobile={ctx.isMobile}
        openingHours={ctx.currentCafe?.opening_hours ?? undefined}
      />
    </ErrorBoundary>
  );
}

export function InventoryTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <Inventory cafeId={ctx.currentCafeId} />
    </ErrorBoundary>
  );
}

export function TournamentsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <OwnerTournaments cafeId={ctx.selectedCafeId || undefined} />
    </ErrorBoundary>
  );
}

export function LoyaltyTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <OwnerLoyalty cafeId={ctx.selectedCafeId || undefined} />
    </ErrorBoundary>
  );
}

export function ReviewsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <OwnerReviews cafeId={ctx.selectedCafeId || undefined} />
    </ErrorBoundary>
  );
}

export function WalletTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <OwnerWallet cafeId={ctx.selectedCafeId || undefined} />
    </ErrorBoundary>
  );
}

export function PaymentsTab() {
  const ctx = useOwnerDashboard();
  return (
    <ErrorBoundary>
      <OwnerPayments
        cafeId={ctx.selectedCafeId || undefined}
        cafeName={ctx.currentCafe?.name ?? undefined}
        upiId={(ctx.currentCafe as { upi_id?: string | null } | null)?.upi_id}
        upiDisplayName={(ctx.currentCafe as { upi_display_name?: string | null } | null)?.upi_display_name}
      />
    </ErrorBoundary>
  );
}
