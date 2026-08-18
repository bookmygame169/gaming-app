"use client";

import dynamic from "next/dynamic";
import { ErrorBoundary } from "../../ErrorBoundary";
import { useOwnerDashboard } from "../../../context/OwnerDashboardContext";

const BookingsManagement = dynamic(
  () => import("../../BookingsManagement").then((mod) => mod.BookingsManagement),
  { ssr: false }
);

export function BookingsTab() {
  const {
    selectedCafeId,
    loadingData,
    handleBookingStatusChange,
    handleEditBooking,
    handleOpenTimeAdjustment,
    handleStationCommand,
    handlePaymentModeChange,
    refreshData,
    bookingsMgmtRefreshKey,
    setViewOrdersBookingId,
    setViewOrdersCustomerName,
    setViewOrdersModalOpen,
    handleViewCustomer,
    activeTimers,
    timerElapsed,
    subscriptions,
    bookings,
    setAddItemsBookingId,
    setAddItemsCustomerName,
    setAddItemsModalOpen,
    setSessionEndedInfo,
    setSessionEndedPopupOpen,
    handleStartTimer,
    handleStopTimer,
  } = useOwnerDashboard();

  return (
    <ErrorBoundary>
      <BookingsManagement
        cafeId={selectedCafeId || undefined}
        loading={loadingData}
        onUpdateStatus={handleBookingStatusChange}
        onEdit={handleEditBooking}
        onAdjustTime={handleOpenTimeAdjustment}
        onStationCommand={handleStationCommand}
        onPaymentModeChange={handlePaymentModeChange}
        onRefresh={() => refreshData()}
        refreshTrigger={bookingsMgmtRefreshKey}
        onViewOrders={(bookingId, customerName) => {
          setViewOrdersBookingId(bookingId);
          setViewOrdersCustomerName(customerName);
          setViewOrdersModalOpen(true);
        }}
        onViewCustomer={handleViewCustomer}
        activeTimers={activeTimers}
        timerElapsed={timerElapsed}
        pageSubscriptions={subscriptions}
        pageBookings={bookings}
        onAddItems={(bookingId, customerName) => {
          setAddItemsBookingId(bookingId);
          setAddItemsCustomerName(customerName);
          setAddItemsModalOpen(true);
        }}
        onSessionEnded={(info) => {
          setSessionEndedInfo(info);
          setSessionEndedPopupOpen(true);
          refreshData();
        }}
        onEndCollect={async (bookingId, paymentMode) => {
          await handlePaymentModeChange(bookingId, paymentMode);
          await handleBookingStatusChange(bookingId, "completed");
        }}
        onStartTimer={handleStartTimer}
        onStopTimer={handleStopTimer}
      />
    </ErrorBoundary>
  );
}
