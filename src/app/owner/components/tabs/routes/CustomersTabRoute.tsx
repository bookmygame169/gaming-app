"use client";

import dynamic from "next/dynamic";
import { theme } from "../../../utils/theme";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const CustomersTab = dynamic(() => import("../CustomersTab"), { ssr: false });

export function CustomersTabRoute() {
  const {
    bookings,
    customerSearch,
    setCustomerSearch,
    hasSubscription,
    setHasSubscription,
    hasMembership,
    setHasMembership,
    customerSortBy,
    setCustomerSortBy,
    customerSortOrder,
    setCustomerSortOrder,
    subscriptions,
    handleViewCustomer,
  } = useOwnerDashboard();

  return (
    <ErrorBoundary>
      <CustomersTab
        theme={theme}
        bookings={bookings}
        customerSearch={customerSearch}
        setCustomerSearch={setCustomerSearch}
        hasSubscription={hasSubscription}
        setHasSubscription={setHasSubscription}
        hasMembership={hasMembership}
        setHasMembership={setHasMembership}
        customerSortBy={customerSortBy}
        setCustomerSortBy={setCustomerSortBy}
        customerSortOrder={customerSortOrder}
        setCustomerSortOrder={setCustomerSortOrder}
        subscriptions={subscriptions}
        handleViewCustomer={handleViewCustomer}
      />
    </ErrorBoundary>
  );
}
