"use client";

import type { ComponentProps } from 'react';
import type { BookingRow } from "../../../types";
import { AlarmClock, ShoppingBag, BarChart3, ChevronRight } from 'lucide-react';
import { getBookingRevenueTotal, getOwnerPaymentBucket, isBillableRevenueBooking } from '@/lib/ownerRevenue';
import { isBookingActiveNow, isSessionBooking } from '@/lib/bookingFilters';
import { getLocalDateString } from '../../../utils';
import {
  DashboardStats,
  BookingsTable,
  ActiveSessions,
} from "../../";
import { NeedsAttention, FeatureStats } from '../../NeedsAttention';
import { TodaySnackOrders } from '../../TodaySnackOrders';
import { DashboardBookingsTable } from '../../DashboardBookingsTable';
import { ErrorBoundary } from '../../ErrorBoundary';
import { useOwnerDashboard } from '../../../context/OwnerDashboardContext';

export function DashboardTab() {
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
    setSnackSaleModalOpen,
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
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                      <AlarmClock size={16} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-amber-400 font-semibold text-sm">
                        {endingSoon.length} session{endingSoon.length > 1 ? 's' : ''} ending in under 15 min
                      </span>
                      <span className="text-amber-400/60 text-xs ml-2 truncate">
                        {endingSoon.map((b) => b.customer_name || 'Guest').join(', ')}
                      </span>
                    </div>
                    <button
                      onClick={() => handleTabChange('bookings')}
                      className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      View <ChevronRight size={12} />
                    </button>
                  </div>
                );
              })()}

              {/* Things from the other tabs that need a decision. Renders
                  nothing when there is nothing waiting. */}
              <NeedsAttention summary={ownerSummary} onNavigate={handleTabChange} />

              {/* KPI Stats */}
              <DashboardStats
                bookings={bookings}
                subscriptions={subscriptions}
                activeTimers={activeTimers}
                loadingData={loadingData}
                isMobile={isMobile}
              />

              {/* Standing numbers from loyalty, reviews and tournaments, each
                  linking to its own tab. */}
              <FeatureStats summary={ownerSummary} onNavigate={handleTabChange} />


              {/* Active Sessions */}
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

              {/* Today's Bookings — clean design-matching table */}
              <DashboardBookingsTable
                bookings={bookings.filter((b) =>
                  !b.deleted_at &&
                  b.booking_date === getLocalDateString() &&
                  (!currentCafeId || b.cafe_id === currentCafeId) &&
                  isSessionBooking(b)
                )}
                onViewAll={() => handleTabChange('bookings')}
                onEdit={handleEditBooking}
                onPaymentModeChange={handlePaymentModeChange}
                onStatusChange={handleBookingStatusChange}
              />

              {/* Today's Snack Orders */}
              <section>
                <div className="flex items-center gap-2.5 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                    <ShoppingBag size={14} className="text-orange-400" />
                  </div>
                  <h2 className="text-base font-semibold text-white">Snack Sales</h2>
                </div>
                <TodaySnackOrders
                  // Its prop type declares booking_date as non-null while its
                  // own code handles the null case. Narrowed here rather than
                  // loosening a shared type from the outside.
                  bookings={bookings as ComponentProps<typeof TodaySnackOrders>["bookings"]}
                  todayStr={getLocalDateString()}
                  onNewSale={() => setSnackSaleModalOpen(true)}
                  onEditSale={(bookingId, customerName) => {
                    setViewOrdersBookingId(bookingId);
                    setViewOrdersCustomerName(customerName);
                    setViewOrdersModalOpen(true);
                  }}
                />
              </section>

              {/* Last 7 Days */}
              {(() => {
                const today = new Date();
                const lastWeek = new Date(today);
                lastWeek.setDate(today.getDate() - 7);
                const lastWeekStr = getLocalDateString(lastWeek);
                const todayStr = getLocalDateString(today);

                const weeklyBookings = bookings.filter((b) => {
                  if (b.deleted_at) return false;
                  const bDate = b.booking_date;
                  // Explicit, and equivalent: comparing null against a date
                  // string is false in JavaScript either way, so a booking with
                  // no date was already excluded here. Now it says so.
                  if (!bDate) return false;
                  return bDate >= lastWeekStr && bDate <= todayStr;
                });

                const weeklyRevenue = weeklyBookings
                  .filter(isBillableRevenueBooking)
                  .reduce((sum, b) => sum + getBookingRevenueTotal(b), 0);

                return (
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
                          <BarChart3 size={14} className="text-violet-400" />
                        </div>
                        <h2 className="text-base font-semibold text-white">Last 7 Days</h2>
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 text-[11px] font-bold">
                          Rs.{weeklyRevenue.toLocaleString('en-IN')}
                        </span>
                      </div>
                      <button
                        onClick={() => handleTabChange('bookings')}
                        className="flex items-center gap-1 text-[11px] font-medium text-slate-400 hover:text-white transition-colors"
                      >
                        View all <ChevronRight size={12} />
                      </button>
                    </div>
                    <BookingsTable
                      title=""
                      bookings={weeklyBookings}
                      loading={loadingData}
                      limit={10}
                      showActions={false}
                      onViewAll={() => handleTabChange('bookings')}
                    />
                  </section>
                );
              })()}

              {/* End-of-Day Cash Summary */}
              {(() => {
                const todayStr = getLocalDateString();
                const todayDone = bookings.filter((b) =>
                  isBillableRevenueBooking(b) &&
                  b.booking_date === todayStr &&
                  b.source !== 'membership'
                );
                const cashTotal = todayDone
                  .filter((b) => getOwnerPaymentBucket(b.payment_mode) === 'cash')
                  .reduce((s, b) => s + getBookingRevenueTotal(b), 0);
                const upiTotal = todayDone
                  .filter((b) => getOwnerPaymentBucket(b.payment_mode) === 'upi')
                  .reduce((s, b) => s + getBookingRevenueTotal(b), 0);
                if (cashTotal === 0 && upiTotal === 0) return null;
                return (
                  <section className="rounded-2xl bg-white/[0.03] border border-white/[0.08] p-4">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Cash Drawer Summary</p>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-xl bg-emerald-500/8 border border-emerald-500/20 p-3 text-center">
                        <p className="text-[10px] text-emerald-400/70 uppercase tracking-widest mb-1">Cash</p>
                        <p className="text-lg font-bold text-emerald-400">₹{cashTotal.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="rounded-xl bg-blue-500/8 border border-blue-500/20 p-3 text-center">
                        <p className="text-[10px] text-blue-400/70 uppercase tracking-widest mb-1">UPI</p>
                        <p className="text-lg font-bold text-blue-400">₹{upiTotal.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="rounded-xl bg-white/[0.04] border border-white/[0.08] p-3 text-center">
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-lg font-bold text-white">₹{(cashTotal + upiTotal).toLocaleString('en-IN')}</p>
                      </div>
                    </div>
                  </section>
                );
              })()}

            </div>
    </ErrorBoundary>
  );
}
