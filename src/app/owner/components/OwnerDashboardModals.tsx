"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { ChevronRight, Clock3, Loader2, X } from 'lucide-react';
import dynamic from 'next/dynamic';
import { buildStationPricingMap } from '@/lib/stationNames';
import { formatDurationLabel } from '../utils';
import { getBookingRevenueTotal } from '@/lib/ownerRevenue';
import { fonts } from '@/lib/constants';
import { theme } from '../utils/theme';
import { ToastContainer } from './ToastContainer';
import OwnerPWAInstaller from './OwnerPWAInstaller';
import { useOwnerDashboard } from '../context/OwnerDashboardContext';
import { findMembershipSubscriptionForBooking, type TimeAdjustmentTarget } from '../utils/dashboardHelpers';
import { fetchStationPricing } from "@/app/owner/ownerLookup";

const SnackSaleModal = dynamic(() => import('./SnackSaleModal'), { ssr: false });
const AddItemsModal = dynamic(() => import('./AddItemsModal'), { ssr: false });
const ViewOrdersModal = dynamic(() => import('./ViewOrdersModal'), { ssr: false });
const SessionEndedPopup = dynamic(() => import('./SessionEndedPopup').then((mod) => mod.SessionEndedPopup), { ssr: false });
const EditBookingModal = dynamic(() => import('./EditBookingModal').then((mod) => mod.EditBookingModal), { ssr: false });
const SubscriptionDetailsModal = dynamic(() => import('./SubscriptionDetailsModal'), { ssr: false });
const CustomerDetailsModal = dynamic(() => import('./CustomerDetailsModal'), { ssr: false });

export function OwnerDashboardModals() {
  const ctx = useOwnerDashboard();
  const {
    snackSaleModalOpen, setSnackSaleModalOpen, currentCafeId, refreshData,
    addItemsModalOpen, setAddItemsModalOpen, addItemsBookingId, addItemsCustomerName,
    viewOrdersModalOpen, setViewOrdersModalOpen, viewOrdersBookingId, setViewOrdersBookingId,
    viewOrdersCustomerName, setViewOrdersCustomerName,
    handleOrdersUpdated, timeAdjustment, setTimeAdjustment, savingTimeAdjustment,
    handleSaveTimeAdjustment, sessionEndedPopupOpen, setSessionEndedPopupOpen,
    sessionEndedInfo, editingBooking, editingBookingItemId, editCustomerName, setEditCustomerName,
    editCustomerPhone, setEditCustomerPhone, editDate, setEditDate, editStartTime, setEditStartTime,
    editDuration, editItems, setEditItems, updateEditItem, editAmount, setEditAmount,
    setEditAmountManuallyEdited, editStatus, editPaymentMethod, setEditPaymentMethod,
    saving, deletingBooking, handleSaveBooking, setEditingBooking, setEditingBookingItemId,
    setShowDeleteConfirm, handleEndSessionNow, cafes, currentCafe, getBillingPrice, subscriptions,
    viewingSubscription, setViewingSubscription, subscriptionUsageHistory, loadingUsageHistory,
    isMobile, setViewingCustomer, setSubscriptions, toast, viewingCustomer, customerBookings,
    showDeleteConfirm, deleteRemark, setDeleteRemark, handleDeleteBooking,
    showAddStationModal, setShowAddStationModal, newStationType, setNewStationType, newStationCount,
    setNewStationCount, addingStation, handleAddStation, stationToDelete, setStationToDelete,
    deletingStation, handleDeleteStation, pendingPowerToggle, setPendingPowerToggle, setStationPricing,
    executePowerToggle,
    editingStation, setEditingStation, savingPricing, setSavingPricing, applyToAll, setApplyToAll,
    singleHalfHour, setSingleHalfHour, singleFullHour, setSingleFullHour, multiHalfHour, setMultiHalfHour,
    multiFullHour, setMultiFullHour, halfHour, setHalfHour, fullHour, setFullHour,
    controller1HalfHour, setController1HalfHour, controller1FullHour, setController1FullHour,
    controller2HalfHour, setController2HalfHour, controller2FullHour, setController2FullHour,
    controller3HalfHour, setController3HalfHour, controller3FullHour, setController3FullHour,
    controller4HalfHour, setController4HalfHour, controller4FullHour, setController4FullHour,
    enabledControllers, setEnabledControllers, toasts, removeToast,
  } = ctx;

  return (
    <>
      {/* Snack-Only Sale Modal */}
      <SnackSaleModal
        isOpen={snackSaleModalOpen}
        onClose={() => setSnackSaleModalOpen(false)}
        cafeId={currentCafeId}
        onSaleComplete={() => refreshData()}
      />

      {/* Add Items Modal (F&B) */}
      <AddItemsModal
        isOpen={addItemsModalOpen}
        onClose={() => setAddItemsModalOpen(false)}
        bookingId={addItemsBookingId}
        cafeId={currentCafeId}
        customerName={addItemsCustomerName}
        onItemsAdded={() => {
          refreshData();
        }}
      />

      {/* View Orders Modal (F&B) */}
      <ViewOrdersModal
        isOpen={viewOrdersModalOpen}
        onClose={() => setViewOrdersModalOpen(false)}
        bookingId={viewOrdersBookingId}
        cafeId={currentCafeId}
        customerName={viewOrdersCustomerName}
        onOrdersUpdated={handleOrdersUpdated}
      />

      {/* Quick Time Adjustment Modal */}
      {timeAdjustment && (() => {
        const diffMinutes = timeAdjustment.nextDuration - timeAdjustment.currentDuration;
        const hasChange = diffMinutes !== 0;
        const diffLabel = !hasChange
          ? 'No change yet'
          : `${diffMinutes > 0 ? 'Extends by' : 'Reduces by'} ${formatDurationLabel(Math.abs(diffMinutes), { long: true })}`;
        const diffTone = diffMinutes > 0 ? 'text-[#d8ff3c]' : diffMinutes < 0 ? 'text-[#ff5c2b]' : 'text-[#f2f0ea]/50';
        const adjustDuration = (delta: number) => {
          setTimeAdjustment((prev: TimeAdjustmentTarget | null) => prev ? {
            ...prev,
            nextDuration: Math.max(30, prev.nextDuration + delta),
          } : prev);
        };

        return (
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0b0b0c]/90 backdrop-blur-sm p-4"
            onClick={() => {
              if (!savingTimeAdjustment) setTimeAdjustment(null);
            }}
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-[26px] border border-[#f2f0ea]/10 bg-[#111113]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-[#f2f0ea]/10 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#d8ff3c]/15 text-[#d8ff3c]">
                      <Clock3 size={17} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-[#f2f0ea]">Add or remove time</h2>
                      <p className="truncate text-xs text-[#f2f0ea]/40">
                        {timeAdjustment.stationName} · {timeAdjustment.customerName}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={savingTimeAdjustment}
                  onClick={() => setTimeAdjustment(null)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center bg-[#f2f0ea]/[0.06] text-[#f2f0ea]/50 transition hover:bg-white/[0.1] hover:text-[#f2f0ea] disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close time adjustment"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4 p-5">
                <div className="border border-[#f2f0ea]/10 bg-white/[0.035] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#f2f0ea]/40">Current</p>
                      <p className="mt-1 text-sm font-semibold text-[#f2f0ea]/70">
                        {formatDurationLabel(timeAdjustment.currentDuration, { long: true })}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-[#f2f0ea]/30" />
                    <div className="text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#d8ff3c]/70">New</p>
                      <p className="mt-1 text-2xl font-black tracking-tight text-[#d8ff3c]">
                        {formatDurationLabel(timeAdjustment.nextDuration, { long: true })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[
                    { label: '-1h', delta: -60, tone: 'remove' },
                    { label: '-30m', delta: -30, tone: 'remove' },
                    { label: '+30m', delta: 30, tone: 'add' },
                    { label: '+1h', delta: 60, tone: 'add' },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      disabled={savingTimeAdjustment || (option.delta < 0 && timeAdjustment.nextDuration <= 30)}
                      onClick={() => adjustDuration(option.delta)}
                      className={`flex h-12 items-center justify-center  border text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 ${
                        option.tone === 'add'
                          ? 'border-[#d8ff3c]/25 bg-[#d8ff3c]/10 text-[#d8ff3c] hover:border-[#d8ff3c]/50 hover:bg-[#d8ff3c]/18'
                          : 'border-[#ff5c2b]/25 bg-[#ff5c2b]/10 text-[#ff5c2b] hover:border-[#ff5c2b]/50 hover:bg-[#ff5c2b]/18'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between border border-[#f2f0ea]/10 bg-white/[0.035] px-4 py-3">
                  <span className="text-sm text-[#f2f0ea]/40">Change</span>
                  <span className={`text-sm font-bold ${diffTone}`}>{diffLabel}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-[#f2f0ea]/10 bg-white/[0.025] px-5 py-4">
                <button
                  type="button"
                  disabled={savingTimeAdjustment}
                  onClick={() => setTimeAdjustment(null)}
                  className="h-11 border border-white/[0.1] bg-[#f2f0ea]/[0.04] px-4 text-sm font-semibold text-[#f2f0ea]/70 transition hover:border-white/[0.18] hover:text-[#f2f0ea] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={savingTimeAdjustment || !hasChange}
                  onClick={handleSaveTimeAdjustment}
                  className="flex h-11 items-center justify-center gap-2 bg-[#d8ff3c] px-4 text-sm font-black text-[#0b0b0c] transition hover:bg-[#d8ff3c] disabled:cursor-not-allowed disabled:bg-[#f2f0ea]/[0.14] disabled:text-[#0b0b0c] disabled:shadow-none"
                >
                  {savingTimeAdjustment ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : hasChange ? (
                    <Clock3 size={16} />
                  ) : null}
                  {savingTimeAdjustment ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Session Ended Popup */}
      <SessionEndedPopup
        isOpen={sessionEndedPopupOpen}
        onClose={() => setSessionEndedPopupOpen(false)}
        customerName={sessionEndedInfo?.customerName || ''}
        stationName={sessionEndedInfo?.stationName || ''}
        duration={sessionEndedInfo?.duration || 0}
      />

      {/* Edit Booking Modal */}
      {editingBooking && (
        <EditBookingModal
          booking={editingBooking}
          bookingItemId={editingBookingItemId}
          customerName={editCustomerName} setCustomerName={setEditCustomerName}
          customerPhone={editCustomerPhone} setCustomerPhone={setEditCustomerPhone}
          date={editDate} setDate={setEditDate}
          startTime={editStartTime} setStartTime={setEditStartTime}
          duration={editDuration}
          items={editItems} setItems={setEditItems} updateItem={updateEditItem}
          amount={editAmount} setAmount={setEditAmount} setAmountManuallyEdited={setEditAmountManuallyEdited}
          status={editStatus}
          paymentMethod={editPaymentMethod} setPaymentMethod={setEditPaymentMethod}
          saving={saving} deleting={deletingBooking}
          onSave={handleSaveBooking}
          onClose={() => { setEditingBooking(null); setEditingBookingItemId(null); }}
          onDelete={() => setShowDeleteConfirm(true)}
          onEndNow={handleEndSessionNow}
          onManageSnacks={() => {
            setViewOrdersBookingId(editingBooking.id);
            setViewOrdersCustomerName(editingBooking.customer_name || editingBooking.user_name || editCustomerName || 'Guest');
            setViewOrdersModalOpen(true);
          }}
          cafe={cafes.find((c: any) => c.id === editingBooking.cafe_id) || currentCafe}
          getBillingPrice={getBillingPrice}
          membershipSubscription={findMembershipSubscriptionForBooking(editingBooking, subscriptions)}
        />
      )}

      {/* Delete Booking Confirmation Modal */}
      {
        showDeleteConfirm && editingBooking && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.8)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: "20px",
            }}
            onClick={() => { if (!deletingBooking) { setShowDeleteConfirm(false); setDeleteRemark(''); } }}
          >
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 20,
                border: `1px solid ${theme.border}`,
                maxWidth: "500px",
                width: "100%",
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ padding: "24px 28px", borderBottom: `1px solid ${theme.border}` }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 22 }}>🗑️</span>
                  Delete Booking
                </h2>
                <p style={{ margin: "6px 0 0 0", fontSize: 13, color: theme.textSecondary }}>
                  This booking will be soft-deleted. You can restore it later from the Deleted Bookings section.
                </p>
              </div>

              {/* Booking Details */}
              <div style={{ padding: "20px 28px" }}>
                <div style={{ padding: "16px", borderRadius: 12, background: "rgba(15,23,42,0.6)", border: `1px solid ${theme.border}`, marginBottom: 16 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
                    {[
                      { label: "Customer", value: editingBooking.customer_name || editingBooking.user_name || "Walk-in" },
                      { label: "Phone", value: editingBooking.customer_phone || editingBooking.user_phone || "—" },
                      { label: "Date", value: editingBooking.booking_date },
                      { label: "Start Time", value: editingBooking.start_time || "—" },
                      { label: "Duration", value: editingBooking.duration ? formatDurationLabel(editingBooking.duration, { long: true }) : "—" },
                      { label: "Amount", value: `₹${getBookingRevenueTotal(editingBooking).toLocaleString('en-IN')}` },
                      { label: "Status", value: editingBooking.status || "—" },
                      { label: "Booking ID", value: `#${editingBooking.id.slice(0, 8).toUpperCase()}` },
                    ].map(({ label, value }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 2 }}>{label}</div>
                        <div style={{ fontSize: 13, color: theme.textPrimary, fontWeight: 500 }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {editingBooking.booking_items && editingBooking.booking_items.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${theme.border}` }}>
                      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Consoles</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {editingBooking.booking_items.map((item: any) => (
                          <span key={item.id} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.2)", color: "#7dd3fc" }}>
                            {item.console} ×{item.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Remark field */}
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                    Reason for Deletion <span style={{ color: "#ff5c2b" }}>*</span>
                  </label>
                  <textarea
                    value={deleteRemark}
                    onChange={(e) => setDeleteRemark(e.target.value)}
                    placeholder="e.g. Customer cancelled, duplicate booking, wrong entry..."
                    rows={3}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 10,
                      border: `1px solid ${deleteRemark.trim() ? "rgba(56,189,248,0.4)" : "rgba(255, 92, 43,0.4)"}`,
                      background: "rgba(15,23,42,0.8)",
                      color: theme.textPrimary,
                      fontSize: 13,
                      fontFamily: "inherit",
                      resize: "vertical",
                      outline: "none",
                      transition: "border-color 0.2s",
                      boxSizing: "border-box",
                    }}
                  />
                  {!deleteRemark.trim() && (
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ff5c2b" }}>A reason is required to delete this booking.</p>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "16px 28px", borderTop: `1px solid ${theme.border}`, display: "flex", gap: 12, justifyContent: "flex-end" }}>
                <button
                  onClick={() => { setShowDeleteConfirm(false); setDeleteRemark(''); }}
                  disabled={deletingBooking}
                  style={{ padding: "11px 22px", background: "transparent", border: `1px solid ${theme.border}`, borderRadius: 10, color: theme.textSecondary, fontSize: 14, fontWeight: 600, cursor: deletingBooking ? "not-allowed" : "pointer", opacity: deletingBooking ? 0.5 : 1 }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteBooking}
                  disabled={deletingBooking || !deleteRemark.trim()}
                  style={{
                    padding: "11px 22px",
                    background: (deletingBooking || !deleteRemark.trim()) ? "rgba(242,240,234,0.08)" : "#ff5c2b",
                    border: "none",
                    borderRadius: 10,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: (deletingBooking || !deleteRemark.trim()) ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {deletingBooking ? "Deleting..." : "Delete Booking"}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Edit Station Pricing Modal */}
      {
        editingStation && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.75)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 9999,
              padding: 20,
            }}
            onClick={() => setEditingStation(null)}
          >
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 24,
                border: `1px solid ${theme.border}`,
                maxWidth: 600,
                width: "100%",
                maxHeight: "90vh",
                overflow: "auto",
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: "32px 32px 24px",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 16,
                      background: editingStation.bgColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 28,
                    }}
                  >
                    {editingStation.icon}
                  </div>
                  <div>
                    <h2
                      style={{
                        fontSize: 24,
                        fontWeight: 700,
                        color: theme.textPrimary,
                        margin: 0,
                        marginBottom: 4,
                      }}
                    >
                      Edit {editingStation.name}
                    </h2>
                    <p style={{ fontSize: 14, color: theme.textMuted, margin: 0 }}>
                      Configure pricing for this station
                    </p>
                  </div>
                </div>
              </div>

              {/* Modal Body */}
              <div style={{ padding: "32px" }}>
                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: 8,
                    }}
                  >
                    Station Name
                  </label>
                  <input
                    type="text"
                    value={editingStation.name}
                    disabled
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      background: theme.background,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textMuted,
                      fontSize: 15,
                      outline: "none",
                      cursor: "not-allowed",
                    }}
                  />
                </div>

                <div style={{ marginBottom: 24 }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: 14,
                      fontWeight: 600,
                      color: theme.textSecondary,
                      marginBottom: 8,
                    }}
                  >
                    Station Type
                  </label>
                  <div
                    style={{
                      padding: "12px 16px",
                      background: theme.background,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        borderRadius: 8,
                        background: editingStation.bgColor,
                        color: editingStation.color,
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {editingStation.type}
                    </span>
                  </div>
                </div>

                {/* Apply to All Checkbox */}
                <div style={{ marginBottom: 24, padding: 16, background: 'rgba(216, 255, 60, 0.08)', border: `1px solid rgba(216, 255, 60, 0.2)`, borderRadius: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      style={{
                        width: 20,
                        height: 20,
                        cursor: 'pointer',
                        accentColor: '#d8ff3c',
                      }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary, marginBottom: 4 }}>
                        Apply to all {editingStation.type} stations
                      </div>
                      <div style={{ fontSize: 12, color: theme.textMuted }}>
                        Set this pricing for all {editingStation.type} stations in your cafe
                      </div>
                    </div>
                  </label>
                </div>

                {/* Pricing Fields - Different based on console type */}
                {['PS5', 'Xbox'].includes(editingStation.type) ? (
                  <>
                    {/* PS5/Xbox - Per Controller Pricing (1-4 controllers) */}
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, margin: 0 }}>
                          Per-Controller Pricing
                        </h3>
                        <div style={{ display: 'flex', gap: 8 }}>
                          {enabledControllers.length < 4 && (
                            <button
                              onClick={() => {
                                const nextController = Math.max(...enabledControllers) + 1;
                                if (nextController <= 4) {
                                  setEnabledControllers([...enabledControllers, nextController]);
                                }
                              }}
                              style={{
                                padding: '6px 12px',
                                background: '#d8ff3c',
                                border: 'none',
                                borderRadius: 8,
                                color: 'white',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span>+</span> Add Controller
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Controller 1 - Always shown */}
                      {enabledControllers.includes(1) && (
                        <div style={{ marginBottom: 16, padding: 16, background: theme.background, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary }}>1 Controller</div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Half Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 75"
                                value={controller1HalfHour}
                                onChange={(e) => setController1HalfHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Full Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 150"
                                value={controller1FullHour}
                                onChange={(e) => setController1FullHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2 Controllers */}
                      {enabledControllers.includes(2) && (
                        <div style={{ marginBottom: 16, padding: 16, background: theme.background, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary }}>2 Controllers</div>
                            <button
                              onClick={() => {
                                setEnabledControllers(enabledControllers.filter((c: number) => c !== 2));
                                setController2HalfHour("");
                                setController2FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ff5c2b',
                                border: 'none',
                                borderRadius: 6,
                                color: 'white',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Half Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 120"
                                value={controller2HalfHour}
                                onChange={(e) => setController2HalfHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Full Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 240"
                                value={controller2FullHour}
                                onChange={(e) => setController2FullHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 3 Controllers */}
                      {enabledControllers.includes(3) && (
                        <div style={{ marginBottom: 16, padding: 16, background: theme.background, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary }}>3 Controllers</div>
                            <button
                              onClick={() => {
                                setEnabledControllers(enabledControllers.filter((c: number) => c !== 3));
                                setController3HalfHour("");
                                setController3FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ff5c2b',
                                border: 'none',
                                borderRadius: 6,
                                color: 'white',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Half Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 165"
                                value={controller3HalfHour}
                                onChange={(e) => setController3HalfHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Full Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 330"
                                value={controller3FullHour}
                                onChange={(e) => setController3FullHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 4 Controllers */}
                      {enabledControllers.includes(4) && (
                        <div style={{ marginBottom: 16, padding: 16, background: theme.background, borderRadius: 12, border: `1px solid ${theme.border}` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: theme.textSecondary }}>4 Controllers (Max)</div>
                            <button
                              onClick={() => {
                                setEnabledControllers(enabledControllers.filter((c: number) => c !== 4));
                                setController4HalfHour("");
                                setController4FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ff5c2b',
                                border: 'none',
                                borderRadius: 6,
                                color: 'white',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                              }}
                            >
                              Remove
                            </button>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Half Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 210"
                                value={controller4HalfHour}
                                onChange={(e) => setController4HalfHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                            <div>
                              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: theme.textMuted, marginBottom: 6 }}>
                                Full Hour (₹)
                              </label>
                              <input
                                type="number"
                                placeholder="e.g., 420"
                                value={controller4FullHour}
                                onChange={(e) => setController4FullHour(e.target.value)}
                                style={{ width: "100%", padding: "10px 12px", background: theme.cardBackground, border: `1px solid ${theme.border}`, borderRadius: 8, color: theme.textPrimary, fontSize: 14, outline: "none" }}
                                onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                                onBlur={(e) => (e.target.style.borderColor = theme.border)}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : ['PS4'].includes(editingStation.type) ? (
                  <>
                    {/* PS4 - Keep old Single/Multi format */}
                    <div style={{ marginBottom: 20 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, marginBottom: 12 }}>
                        Single Player Pricing
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Half Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 75" value={singleHalfHour} onChange={(e) => setSingleHalfHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Full Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 150" value={singleFullHour} onChange={(e) => setSingleFullHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                      </div>
                    </div>
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, marginBottom: 12 }}>
                        Multi Player Pricing
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Half Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 150" value={multiHalfHour} onChange={(e) => setMultiHalfHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Full Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 300" value={multiFullHour} onChange={(e) => setMultiFullHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Other stations - Half hour and full hour rates */}
                    <div style={{ marginBottom: 24 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, marginBottom: 12 }}>
                        Pricing
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 13,
                              fontWeight: 600,
                              color: theme.textSecondary,
                              marginBottom: 8,
                            }}
                          >
                            Half Hour (₹)
                          </label>
                          <input
                            type="number"
                            placeholder="e.g., 50"
                            value={halfHour}
                            onChange={(e) => setHalfHour(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              background: theme.background,
                              border: `1px solid ${theme.border}`,
                              borderRadius: 12,
                              color: theme.textPrimary,
                              fontSize: 15,
                              outline: "none",
                              transition: "border-color 0.2s",
                            }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                            onBlur={(e) => (e.target.style.borderColor = theme.border)}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: "block",
                              fontSize: 13,
                              fontWeight: 600,
                              color: theme.textSecondary,
                              marginBottom: 8,
                            }}
                          >
                            Full Hour (₹)
                          </label>
                          <input
                            type="number"
                            placeholder="e.g., 100"
                            value={fullHour}
                            onChange={(e) => setFullHour(e.target.value)}
                            style={{
                              width: "100%",
                              padding: "12px 16px",
                              background: theme.background,
                              border: `1px solid ${theme.border}`,
                              borderRadius: 12,
                              color: theme.textPrimary,
                              fontSize: 15,
                              outline: "none",
                              transition: "border-color 0.2s",
                            }}
                            onFocus={(e) => (e.target.style.borderColor = "#d8ff3c")}
                            onBlur={(e) => (e.target.style.borderColor = theme.border)}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Modal Footer */}
              <div
                style={{
                  padding: "24px 32px",
                  borderTop: `1px solid ${theme.border}`,
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                }}
              >
                <button
                  onClick={() => setEditingStation(null)}
                  style={{
                    padding: "12px 24px",
                    background: "transparent",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textSecondary,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (!currentCafeId || !currentCafe) return;

                    setSavingPricing(true);
                    try {
                      const isGamingConsole = ['PS5', 'PS4', 'Xbox'].includes(editingStation.type);
                      const stationNumber = parseInt(editingStation.name.split('-')[1]);

                      // Prepare pricing data
                      const pricingData: any = {
                        cafe_id: currentCafeId,
                        station_type: editingStation.type,
                        station_number: stationNumber,
                        station_name: editingStation.name,
                        is_active: true,
                      };

                      // Save controller pricing for PS5/Xbox - only save enabled controllers
                      if (['PS5', 'Xbox'].includes(editingStation.type)) {
                        // Controller 1 - always enabled
                        pricingData.controller_1_half_hour = parseFloat(controller1HalfHour) || 0;
                        pricingData.controller_1_full_hour = parseFloat(controller1FullHour) || 0;

                        // Controller 2 - only if enabled
                        if (enabledControllers.includes(2)) {
                          pricingData.controller_2_half_hour = parseFloat(controller2HalfHour) || 0;
                          pricingData.controller_2_full_hour = parseFloat(controller2FullHour) || 0;
                        } else {
                          pricingData.controller_2_half_hour = null;
                          pricingData.controller_2_full_hour = null;
                        }

                        // Controller 3 - only if enabled
                        if (enabledControllers.includes(3)) {
                          pricingData.controller_3_half_hour = parseFloat(controller3HalfHour) || 0;
                          pricingData.controller_3_full_hour = parseFloat(controller3FullHour) || 0;
                        } else {
                          pricingData.controller_3_half_hour = null;
                          pricingData.controller_3_full_hour = null;
                        }

                        // Controller 4 - only if enabled
                        if (enabledControllers.includes(4)) {
                          pricingData.controller_4_half_hour = parseFloat(controller4HalfHour) || 0;
                          pricingData.controller_4_full_hour = parseFloat(controller4FullHour) || 0;
                        } else {
                          pricingData.controller_4_half_hour = null;
                          pricingData.controller_4_full_hour = null;
                        }
                      } else if (isGamingConsole) {
                        // PS4 - keep old format
                        pricingData.single_player_half_hour_rate = parseFloat(singleHalfHour) || 0;
                        pricingData.single_player_rate = parseFloat(singleFullHour) || 0;
                        pricingData.multi_player_half_hour_rate = parseFloat(multiHalfHour) || 0;
                        pricingData.multi_player_rate = parseFloat(multiFullHour) || 0;
                      } else {
                        pricingData.half_hour_rate = parseFloat(halfHour) || 0;
                        pricingData.hourly_rate = parseFloat(fullHour) || 0;
                      }

                      // Apply to all stations of same type if checkbox is checked
                      if (applyToAll) {
                        // Get console count for this type - map display name to DB column
                        const cafe = currentCafe;
                        const typeToDbKey: Record<string, string> = {
                          'PC': 'pc_count', 'PS5': 'ps5_count', 'PS4': 'ps4_count',
                          'Xbox': 'xbox_count', 'VR': 'vr_count', 'Pool': 'pool_count',
                          'Snooker': 'snooker_count', 'Arcade': 'arcade_count',
                          'Steering Wheel': 'steering_wheel_count', 'Racing Sim': 'racing_sim_count',
                        };
                        const consoleTypeKey = (typeToDbKey[editingStation.type] || `${editingStation.type.toLowerCase()}_count`) as keyof typeof cafe;
                        const count = (cafe[consoleTypeKey] as number) || 0;

                        // Create pricing data for all stations of this type
                        // Use the same id-prefix as StationsTab (e.g. 'ps5' from 'ps5-01')
                        const stationIdPrefix = editingStation.name.split('-')[0];
                        const allPricingData = [];
                        for (let i = 1; i <= count; i++) {
                          const stationName = `${stationIdPrefix}-${String(i).padStart(2, '0')}`;
                          const data = { ...pricingData, station_number: i, station_name: stationName };
                          allPricingData.push(data);
                        }

                        // Upsert all via API route (bypasses RLS)
                        const res = await fetch('/api/station-pricing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ applyToAll: true, allPricingData }),
                        });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.error);
                      } else {
                        // Just save this one station via API route
                        const res = await fetch('/api/station-pricing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ pricingData }),
                        });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.error);
                      }

                      // Reload station pricing to update the table
                      const updatedPricing = await fetchStationPricing<Record<string, unknown>>(currentCafeId);

                      if (updatedPricing.length > 0) {
                        setStationPricing(buildStationPricingMap(updatedPricing as any[]));
                      }

                      const successMsg = applyToAll
                        ? `Pricing updated for all ${editingStation.type} stations!`
                        : 'Pricing updated successfully!';
                      toast.success(successMsg);
                      setEditingStation(null);
                      setApplyToAll(false);
                    } catch (err: any) {
                      console.error('Error saving pricing:', err);
                      toast.error(`Failed to save pricing: ${err?.message || err?.details || JSON.stringify(err)}`);
                    } finally {
                      setSavingPricing(false);
                    }
                  }}
                  disabled={savingPricing}
                  style={{
                    padding: "12px 32px",
                    background: savingPricing ? "rgba(216,255,60,0.45)" : "#d8ff3c",
                    border: "none",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: savingPricing ? "not-allowed" : "pointer",
                    boxShadow: savingPricing ? "none" : "0 4px 16px rgba(216, 255, 60, 0.3)",
                  }}
                >
                  {savingPricing ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Add New Station Modal */}
      {
        showAddStationModal && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.7)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setShowAddStationModal(false)}
          >
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 24,
                border: `1px solid ${theme.border}`,
                maxWidth: 500,
                width: "100%",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: "28px 32px",
                borderBottom: `1px solid ${theme.border}`,
                background: "#111113)",
              }}>
                <h2 style={{
                  fontFamily: fonts.heading,
                  fontSize: 26,
                  margin: "0 0 8px 0",
                  color: theme.textPrimary,
                  fontWeight: 700,
                }}>
                  ➕ Add New Station
                </h2>
                <p style={{
                  fontSize: 14,
                  color: theme.textSecondary,
                  margin: 0,
                  fontWeight: 500,
                }}>
                  Add gaming stations to your café
                </p>
              </div>

              {/* Content */}
              <div style={{
                padding: "32px",
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}>
                {/* Station Type */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    Station Type
                  </label>
                  <select
                    value={newStationType}
                    onChange={(e) => setNewStationType(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                      cursor: "pointer",
                    }}
                  >
                    <option value="ps5">PlayStation 5 (PS5)</option>
                    <option value="ps4">PlayStation 4 (PS4)</option>
                    <option value="xbox">Xbox</option>
                    <option value="pc">PC Gaming</option>
                    <option value="pool">Pool Table</option>
                    <option value="snooker">Snooker Table</option>
                    <option value="arcade">Arcade Machine</option>
                    <option value="vr">VR Station</option>
                    <option value="steering_wheel">Steering Wheel</option>
                    <option value="racing_sim">Racing Sim</option>
                  </select>
                </div>

                {/* Number of Stations */}
                <div>
                  <label style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textSecondary,
                    marginBottom: 10,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}>
                    Number of Stations
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={newStationCount}
                    onChange={(e) => setNewStationCount(parseInt(e.target.value) || 1)}
                    style={{
                      width: "100%",
                      padding: "14px 16px",
                      background: "rgba(15, 23, 42, 0.8)",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      color: theme.textPrimary,
                      fontSize: 15,
                      outline: "none",
                    }}
                  />
                  <p style={{ fontSize: 12, color: theme.textMuted, margin: "6px 0 0 0" }}>
                    How many {newStationType.toUpperCase()} stations do you want to add?
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: "20px 32px",
                borderTop: `1px solid ${theme.border}`,
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
              }}>
                <button
                  onClick={() => setShowAddStationModal(false)}
                  disabled={addingStation}
                  style={{
                    padding: "12px 24px",
                    background: "transparent",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textSecondary,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: addingStation ? "not-allowed" : "pointer",
                    opacity: addingStation ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddStation}
                  disabled={addingStation || newStationCount < 1}
                  style={{
                    padding: "12px 24px",
                    background: addingStation || newStationCount < 1
                      ? "rgba(242,240,234,0.08)"
                      : "#111113",
                    border: "none",
                    borderRadius: 12,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: addingStation || newStationCount < 1 ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                  onMouseEnter={(e) => {
                    if (!addingStation && newStationCount >= 1) {
                      e.currentTarget.style.transform = "scale(1.05)";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(216, 255, 60, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {addingStation ? "Adding..." : `Add ${newStationCount} Station${newStationCount > 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Power Off Station Confirmation Modal */}
      {pendingPowerToggle && (
        <div
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "20px",
          }}
          onClick={() => setPendingPowerToggle(null)}
        >
          <div
            style={{
              background: theme.cardBackground,
              borderRadius: 20,
              border: `1px solid ${theme.border}`,
              maxWidth: "420px",
              width: "100%",
              padding: "32px",
              boxShadow: "0 25px 50px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 48, textAlign: "center", marginBottom: 16 }}>⚡</div>
            <h3 style={{ fontSize: 20, fontWeight: 700, color: theme.textPrimary, textAlign: "center", marginBottom: 8 }}>
              Power Off Station?
            </h3>
            <p style={{ fontSize: 14, color: theme.textSecondary, textAlign: "center", marginBottom: 8 }}>
              Station <strong style={{ color: theme.textPrimary }}>{pendingPowerToggle.name}</strong> will be marked as offline.
            </p>
            {pendingPowerToggle.hasActiveSession && (
              <p style={{ fontSize: 13, color: "#f97316", textAlign: "center", background: "rgba(249,115,22,0.1)", border: "1px solid rgba(249,115,22,0.3)", borderRadius: 8, padding: "8px 12px", marginBottom: 8 }}>
                This station has an active session in progress.
              </p>
            )}
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setPendingPowerToggle(null)}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: "transparent", color: theme.textSecondary,
                  fontSize: 14, fontWeight: 500, cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const name = pendingPowerToggle.name;
                  setPendingPowerToggle(null);
                  void executePowerToggle(name, false);
                }}
                style={{
                  flex: 1, padding: "12px", borderRadius: 10,
                  border: "none",
                  background: "#ff5c2b",
                  color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                }}
              >
                Power Off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Station Confirmation Modal */}
      {
        stationToDelete && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.7)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10000,
              padding: "20px",
            }}
            onClick={() => !deletingStation && setStationToDelete(null)}
          >
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 20,
                border: `1px solid ${theme.border}`,
                maxWidth: "500px",
                width: "100%",
                boxShadow: "0 25px 50px rgba(0, 0, 0, 0.3)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{
                padding: "24px 32px",
                borderBottom: `1px solid ${theme.border}`,
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: theme.textPrimary,
                }}>
                  Delete Station
                </h2>
                <p style={{
                  margin: "8px 0 0 0",
                  fontSize: 14,
                  color: theme.textSecondary,
                }}>
                  Are you sure you want to delete this station?
                </p>
              </div>

              {/* Body */}
              <div style={{ padding: "24px 32px" }}>
                <div style={{
                  padding: "16px",
                  borderRadius: 12,
                  background: "rgba(255, 92, 43, 0.1)",
                  border: "1px solid rgba(255, 92, 43, 0.3)",
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    color: theme.textPrimary,
                    fontWeight: 600,
                  }}>
                    {stationToDelete.displayName}
                  </p>
                  <p style={{
                    margin: "8px 0 0 0",
                    fontSize: 13,
                    color: theme.textSecondary,
                  }}>
                    This will permanently remove this {stationToDelete.type} station from your café. This action cannot be undone.
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div style={{
                padding: "20px 32px",
                borderTop: `1px solid ${theme.border}`,
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
              }}>
                <button
                  onClick={() => setStationToDelete(null)}
                  disabled={deletingStation}
                  style={{
                    padding: "12px 24px",
                    background: "transparent",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textSecondary,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: deletingStation ? "not-allowed" : "pointer",
                    opacity: deletingStation ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteStation}
                  disabled={deletingStation}
                  style={{
                    padding: "12px 24px",
                    background: deletingStation
                      ? "rgba(242,240,234,0.08)"
                      : "#ff5c2b",
                    border: "none",
                    borderRadius: 12,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: deletingStation ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                  onMouseEnter={(e) => {
                    if (!deletingStation) {
                      e.currentTarget.style.transform = "scale(1.05)";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(255, 92, 43, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {deletingStation ? "Deleting..." : "Delete Station"}
                </button>
              </div>
            </div>
          </div>
        )
      }



      {/* View Subscription Detail Modal */}
      {
        viewingSubscription && (
          <SubscriptionDetailsModal
            subscription={viewingSubscription}
            usageHistory={subscriptionUsageHistory}
            loadingUsageHistory={loadingUsageHistory}
            isMobile={isMobile}
            onClose={() => setViewingSubscription(null)}
            onViewCustomer={(customer: any) => {
              setViewingCustomer(customer);
              setViewingSubscription(null);
            }}
            onDelete={async (id: string) => {
              const response = await fetch(`/api/owner/subscriptions?id=${id}`, {
                method: 'DELETE'
              });
              const payload = await response.json().catch(() => ({}));

              if (response.ok) {
                setSubscriptions(subscriptions.filter((s: any) => s.id !== id));
                setViewingSubscription(null);
                toast.success('Subscription deleted successfully!');
              } else {
                toast.error('Failed to delete subscription: ' + (payload.error || 'Unknown error'));
              }
            }}
          />
        )
      }

      {/* Customer Detail Modal */}
      {
        viewingCustomer && (
          <CustomerDetailsModal
            customer={viewingCustomer}
            customerBookings={customerBookings}
            isMobile={isMobile}
            onClose={() => setViewingCustomer(null)}
          />
        )
      }

      {/* PWA Install Prompt for Owner Dashboard */}
      <OwnerPWAInstaller />

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </>
  );
}
