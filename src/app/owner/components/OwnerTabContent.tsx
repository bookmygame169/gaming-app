"use client";

import { TabSkeleton } from "./";
import { useOwnerDashboard } from "../context/OwnerDashboardContext";
import type { OwnerRouteTab } from "../navigation";
import { DashboardTab } from "./tabs/routes/DashboardTab";
import { BookingsTab } from "./tabs/routes/BookingsTab";
import { CafeDetailsTab } from "./tabs/routes/CafeDetailsTab";
import { CustomersTabRoute } from "./tabs/routes/CustomersTabRoute";
import { StationsTabRoute } from "./tabs/routes/StationsTabRoute";
import { BillingTab } from "./tabs/routes/BillingTab";
import { SettingsTabRoute } from "./tabs/routes/SettingsTabRoute";
import {
  MembershipsTab,
  CouponsTab,
  ReportsTab,
  InventoryTab,
  ExpensesTab,
  TournamentsTab,
  LoyaltyTab,
  ReviewsTab,
  WalletTab,
  PaymentsTab,
} from "./tabs/routes/SimpleTabs";

const TAB_COMPONENTS: Record<OwnerRouteTab, React.ComponentType> = {
  dashboard: DashboardTab,
  billing: BillingTab,
  bookings: BookingsTab,
  customers: CustomersTabRoute,
  reports: ReportsTab,
  stations: StationsTabRoute,
  memberships: MembershipsTab,
  tournaments: TournamentsTab,
  loyalty: LoyaltyTab,
  reviews: ReviewsTab,
  payments: PaymentsTab,
  wallet: WalletTab,
  inventory: InventoryTab,
  expenses: ExpensesTab,
  coupons: CouponsTab,
  settings: SettingsTabRoute,
  "cafe-details": CafeDetailsTab,
};

const SKELETON_EXCLUDED: OwnerRouteTab[] = ["billing", "reports", "coupons"];

export function OwnerTabContent() {
  const { activeTab, loadingData, bookings } = useOwnerDashboard();
  const TabComponent = TAB_COMPONENTS[activeTab as OwnerRouteTab];

  return (
    <>
      {loadingData && !bookings.length && !SKELETON_EXCLUDED.includes(activeTab) && (
        <TabSkeleton cards={4} tableRows={6} />
      )}
      {TabComponent ? <TabComponent /> : null}
    </>
  );
}
