"use client";

import { useState } from 'react';
import type { BookingRow } from "../../../types";
import { isBookingActiveNow, isSessionBooking } from '@/lib/bookingFilters';
import { getLocalDateString } from '../../../utils';
import { DashboardStats, ActiveSessions } from "../../";
import { NeedsAttention } from '../../NeedsAttention';
import { DashboardBookingsTable } from '../../DashboardBookingsTable';
import { ErrorBoundary } from '../../ErrorBoundary';
import { useOwnerDashboard } from '../../../context/OwnerDashboardContext';

export function DashboardTab() {
  const [activityFeed, setActivityFeed] = useState('sessions');
  const {
    loadingData,
    bookings: bookingsFromContext,
    ownerSummary,
    subscriptions,
    activeTimers,
    timerElapsed,
    currentTime,
    isMobile,
    handleTabChange,
    handleOpenTimeAdjustment,
    handleStationCommand,
    handlePaymentModeChange,
    handleBookingStatusChange,
    handleEditBooking,
    refreshData,
    setAddItemsBookingId,
    setAddItemsCustomerName,
    setAddItemsModalOpen,
    setSessionEndedInfo,
    setSessionEndedPopupOpen,
    handleStopTimer,
    setViewOrdersBookingId,
    setViewOrdersCustomerName,
    setViewOrdersModalOpen,
    currentCafeId,
  } = useOwnerDashboard();

  // The context is still typed `any`, so nothing below could be inferred and
  // every callback had to say `(b: any)`. Naming the shape once here types all
  // of them, and means a field that stops existing is caught at this line
  // rather than read as undefined at eleven others.
  const bookings = bookingsFromContext as BookingRow[];

  if (loadingData) return null;

  const todayOnly = (b: BookingRow) =>
    !b.deleted_at &&
    b.booking_date === getLocalDateString() &&
    (!currentCafeId || b.cafe_id === currentCafeId);

  // Three feeds over one table, as the design draws it: what played today,
  // what is booked, and what was sold over the counter. A snack sale is a
  // booking with no session on it, which is how this app has always stored it.
  const sessionFeed = bookings.filter((b) => todayOnly(b) && isSessionBooking(b));
  const snackFeed = bookings.filter((b) => todayOnly(b) && !isSessionBooking(b));
  const bookedFeed = bookings.filter(
    (b) => todayOnly(b) && isSessionBooking(b) && b.source !== 'walk-in'
  );

  const feedRows =
    activityFeed === 'snacks' ? snackFeed : activityFeed === 'booked' ? bookedFeed : sessionFeed;

  return (
    <ErrorBoundary>
    <div className="space-y-5">

              {/* Ending Soon Alert Banner */}
              {(() => {
                const now = new Date();
                const endingSoon = bookings.filter((b) => {
                  if (b.deleted_at) return false;
                  if (!isBookingActiveNow(b, now)) return false;
                  if (!b.start_time || !b.duration) return false;
                  const timeParts = b.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                  if (!timeParts) return false;
                  let hours = parseInt(timeParts[1]);
                  const mins = parseInt(timeParts[2]);
                  const period = timeParts[3];
                  if (period) {
                    if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
                    else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
                  }
                  const currentMinutes = now.getHours() * 60 + now.getMinutes();
                  const endMinutes = hours * 60 + mins + b.duration;
                  const remaining = endMinutes - currentMinutes;
                  return remaining > 0 && remaining <= 15;
                });
                if (endingSoon.length === 0) return null;
                return (
                  <div
                    className="flex items-center gap-3 bg-[#111113] px-[13px] py-3"
                    style={{ borderLeft: '2px solid #ff5c2b' }}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-bold text-[#f2f0ea]">
                        {endingSoon.length} session{endingSoon.length > 1 ? 's' : ''} ending in under 15 min
                      </span>
                      <span className="ml-2 truncate font-mono text-[10.5px] text-[#f2f0ea]/45">
                        {endingSoon.map((b) => b.customer_name || 'Guest').join(', ')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTabChange('bookings')}
                      className="whitespace-nowrap font-mono text-[10px] tracking-[0.12em] text-[#ff5c2b] transition-opacity hover:opacity-80"
                    >
                      VIEW
                    </button>
                  </div>
                );
              })()}


              {/* KPI Stats */}
              <DashboardStats
                bookings={bookings}
                subscriptions={subscriptions}
                activeTimers={activeTimers}
                loadingData={loadingData}
                isMobile={isMobile}
              />

              {/* Active Sessions */}
              <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_336px]">
              <section>
                <div className="mb-3 flex items-center gap-3">
                  <span className="font-mono text-[10px] tracking-[0.2em] text-[#f2f0ea]/50">
                    FLOOR · ACTIVE SESSIONS
                  </span>
                  {(() => {
                    const count = bookings.filter((b) => !b.deleted_at && isBookingActiveNow(b)).length;
                    return count > 0 ? (
                      <span className="flex items-center gap-1.5 font-mono text-[9.5px] tracking-[0.14em] text-[#d8ff3c]">
                        <span className="h-1.5 w-1.5 animate-pulse bg-[#d8ff3c]" />
                        {count} LIVE
                      </span>
                    ) : null;
                  })()}
                  <span className="h-px flex-1 bg-[#f2f0ea]/10" />
                  <button
                    onClick={() => handleTabChange('bookings')}
                    className="font-mono text-[10.5px] tracking-[0.14em] text-[#f2f0ea]/50 transition-colors hover:text-[#d8ff3c]"
                  >
                    SESSION HISTORY →
                  </button>
                </div>
                <ActiveSessions
                  bookings={bookings}
                  subscriptions={subscriptions}
                  activeTimers={activeTimers}
                  timerElapsed={timerElapsed}
                  currentTime={currentTime}
                  onAddTime={handleOpenTimeAdjustment}
                  onStationCommand={handleStationCommand}
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
                    await handleBookingStatusChange(bookingId, 'completed');
                  }}
                  onEndMembership={handleStopTimer}
                />
              </section>

              {/* Things from the other tabs that need a decision. Renders
                  nothing when there is nothing waiting. */}
              <NeedsAttention summary={ownerSummary} onNavigate={handleTabChange} />
              </div>

              {/* The day's activity, under the design's feed labels. */}
              <DashboardBookingsTable
                bookings={feedRows}
                feeds={[
                  { id: 'sessions', label: 'SESSIONS', count: sessionFeed.length },
                  { id: 'booked', label: 'BOOKINGS', count: bookedFeed.length },
                  { id: 'snacks', label: 'SNACK SALES', count: snackFeed.length },
                ]}
                activeFeed={activityFeed}
                onFeedChange={setActivityFeed}
                onViewAll={() => handleTabChange(activityFeed === 'snacks' ? 'inventory' : 'bookings')}
                // On the snack feed, editing means the items on the sale, not
                // the booking around them - that is the flow the old snack
                // block owned, kept here rather than dropped with it.
                onEdit={(booking) => {
                  if (activityFeed !== 'snacks') return handleEditBooking(booking);
                  setViewOrdersBookingId(booking.id);
                  setViewOrdersCustomerName(booking.customer_name || 'Guest');
                  setViewOrdersModalOpen(true);
                }}
                onPaymentModeChange={handlePaymentModeChange}
                onStatusChange={handleBookingStatusChange}
              />

            </div>
    </ErrorBoundary>
  );
}
