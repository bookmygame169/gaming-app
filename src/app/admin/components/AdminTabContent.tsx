// @ts-nocheck
"use client";

import {
  Store, Users, CalendarCheck, BarChart3, IndianRupee, KeyRound, Shield, Megaphone,
  Gamepad2, TrendingUp, Settings, ExternalLink, ChevronRight, AlertTriangle,
  // Used by the "Force Full Reload" button and never imported. The file carries
  // a @ts-nocheck, so the compiler had nothing to say about it and the button
  // threw the moment that panel rendered.
  RefreshCw,
} from "lucide-react";
import { useAdminDashboard } from "../context/AdminDashboardContext";
import type { NavTab } from "../types";
import { thCls, tdCls, badge, Pagination } from "./AdminTableHelpers";

export function AdminTabContent() {
  const props = useAdminDashboard() as any;
  const activeCafeRate = props.activeCafeRate;
  const activeSubscriptions = props.activeSubscriptions;
  const activeTab = props.activeTab;
  const activeTabMeta = props.activeTabMeta;
  const addStationCount = props.addStationCount;
  const addStationType = props.addStationType;
  const adminApi = props.adminApi;
  const adminId = props.adminId;
  const adminUsername = props.adminUsername;
  const announcementForm = props.announcementForm;
  const announcements = props.announcements;
  const auditActionFilter = props.auditActionFilter;
  const auditEntityFilter = props.auditEntityFilter;
  const auditLogs = props.auditLogs;
  const averageBookingsPerCafe = props.averageBookingsPerCafe;
  const averageRevenuePerBooking = props.averageRevenuePerBooking;
  const bookingDateFilter = props.bookingDateFilter;
  const bookingDateFrom = props.bookingDateFrom;
  const bookingDateTo = props.bookingDateTo;
  const bookingPage = props.bookingPage;
  const bookingSearch = props.bookingSearch;
  const bookingSort = props.bookingSort;
  const bookingSourceFilter = props.bookingSourceFilter;
  const bookingStatusFilter = props.bookingStatusFilter;
  const bookings = props.bookings;
  const bulkActionLoading = props.bulkActionLoading;
  const bulkToggleCafeStatus = props.bulkToggleCafeStatus;
  const cafeBookings = props.cafeBookings;
  const cafeCoupons = props.cafeCoupons;
  const cafeFilter = props.cafeFilter;
  const cafeInfoMsg = props.cafeInfoMsg;
  const cafeManageSubTab = props.cafeManageSubTab;
  const cafeMembershipPlans = props.cafeMembershipPlans;
  const cafePage = props.cafePage;
  const cafeSearch = props.cafeSearch;
  const cafeSort = props.cafeSort;
  const cafes = props.cafes;
  const closeCafeManage = props.closeCafeManage;
  const confirmPassword = props.confirmPassword;
  const couponForm = props.couponForm;
  const couponMsg = props.couponMsg;
  const coupons = props.coupons;
  const createAnnouncement = props.createAnnouncement;
  const createCafeForm = props.createCafeForm;
  const createCafeLoading = props.createCafeLoading;
  const createCafeMsg = props.createCafeMsg;
  const currentPassword = props.currentPassword;
  const deleteAnnouncement = props.deleteAnnouncement;
  const deleteBookingAdmin = props.deleteBookingAdmin;
  const deleteCafe = props.deleteCafe;
  const deleteCafeAdmin = props.deleteCafeAdmin;
  const deleteConfirm = props.deleteConfirm;
  const deleteCoupon = props.deleteCoupon;
  const deleteGlobalCoupon = props.deleteGlobalCoupon;
  const deleteMembershipPlan = props.deleteMembershipPlan;
  const deleteUser = props.deleteUser;
  const downloadAuditCSV = props.downloadAuditCSV;
  const downloadBookingsCSV = props.downloadBookingsCSV;
  const downloadCafesCSV = props.downloadCafesCSV;
  const downloadOfflineCustomersCSV = props.downloadOfflineCustomersCSV;
  const editCafeForm = props.editCafeForm;
  const editCouponForm = props.editCouponForm;
  const editCouponId = props.editCouponId;
  const error = props.error;
  const exportAuditLogsCsv = props.exportAuditLogsCsv;
  const filteredAuditLogs = props.filteredAuditLogs;
  const filteredBookings = props.filteredBookings;
  const filteredCafes = props.filteredCafes;
  const filteredOfflineCustomers = props.filteredOfflineCustomers;
  const filteredSubscriptions = props.filteredSubscriptions;
  const filteredUsers = props.filteredUsers;
  const formatCurrency = props.formatCurrency;
  const formatDate = props.formatDate;
  const formattedToday = props.formattedToday;
  const globalCouponCafeId = props.globalCouponCafeId;
  const globalCouponForm = props.globalCouponForm;
  const globalCouponMsg = props.globalCouponMsg;
  const handleAddOwnerEmail = props.handleAddOwnerEmail;
  const handleCreateCafe = props.handleCreateCafe;
  const handleDeleteOwnerEmail = props.handleDeleteOwnerEmail;
  const handleSort = props.handleSort;
  const handleTabChange = props.handleTabChange;
  const isAdmin = props.isAdmin;
  const isChecking = props.isChecking;
  const isMobile = props.isMobile;
  const itemsPerPage = props.itemsPerPage;
  const loadCafeBookings = props.loadCafeBookings;
  const loadCafeCoupons = props.loadCafeCoupons;
  const loadCafeMemberships = props.loadCafeMemberships;
  const loadStationPricing = props.loadStationPricing;
  const loadingCafeBookings = props.loadingCafeBookings;
  const loadingCoupons = props.loadingCoupons;
  const loadingData = props.loadingData;
  const loadingMemberships = props.loadingMemberships;
  const loadingOfflineCustomers = props.loadingOfflineCustomers;
  const loadingReport = props.loadingReport;
  const loadingStationPricing = props.loadingStationPricing;
  const loadingSubscriptions = props.loadingSubscriptions;
  const loadingUserBookings = props.loadingUserBookings;
  const managedCafeId = props.managedCafeId;
  const managedUserId = props.managedUserId;
  const membershipForm = props.membershipForm;
  const membershipMsg = props.membershipMsg;
  const mobileMenuOpen = props.mobileMenuOpen;
  const newOwnerCafeId = props.newOwnerCafeId;
  const newOwnerEmail = props.newOwnerEmail;
  const newPassword = props.newPassword;
  const newUsername = props.newUsername;
  const offlineCafeFilter = props.offlineCafeFilter;
  const offlineCustomers = props.offlineCustomers;
  const offlineCustomersLoading = props.offlineCustomersLoading;
  const offlineSearch = props.offlineSearch;
  const offlineSort = props.offlineSort;
  const openCafeManage = props.openCafeManage;
  const openUserManage = props.openUserManage;
  const ownerEmailMsg = props.ownerEmailMsg;
  const ownerEmails = props.ownerEmails;
  const ownerEmailsLoading = props.ownerEmailsLoading;
  const paginatedBookings = props.paginatedBookings;
  const paginatedCafes = props.paginatedCafes;
  const paginatedUsers = props.paginatedUsers;
  const platformSubscriptions = props.platformSubscriptions;
  const reportDailyData = props.reportDailyData;
  const reportDays = props.reportDays;
  const reportPeakHours = props.reportPeakHours;
  const reportSourceSplit = props.reportSourceSplit;
  const revenueCafeFilter = props.revenueCafeFilter;
  const revenueFilteredCafes = props.revenueFilteredCafes;
  const revenueFrom = props.revenueFrom;
  const revenueSourceBreakdown = props.revenueSourceBreakdown;
  const revenueTo = props.revenueTo;
  const router = props.router;
  const saveAdminSettings = props.saveAdminSettings;
  const saveCafeEdits = props.saveCafeEdits;
  const saveCafeInfoAdmin = props.saveCafeInfoAdmin;
  const saveCoupon = props.saveCoupon;
  const saveEditCoupon = props.saveEditCoupon;
  const saveGlobalCoupon = props.saveGlobalCoupon;
  const saveMembershipPlan = props.saveMembershipPlan;
  const saveStationTypePricing = props.saveStationTypePricing;
  const savingCafeInfo = props.savingCafeInfo;
  const savingCoupon = props.savingCoupon;
  const savingEditCoupon = props.savingEditCoupon;
  const savingGlobalCoupon = props.savingGlobalCoupon;
  const savingMembership = props.savingMembership;
  const savingSettings = props.savingSettings;
  const savingStation = props.savingStation;
  const savingStationPricing = props.savingStationPricing;
  const selectedCafeIds = props.selectedCafeIds;
  const setAddStationCount = props.setAddStationCount;
  const setAddStationType = props.setAddStationType;
  const setAnnouncementForm = props.setAnnouncementForm;
  const setAnnouncements = props.setAnnouncements;
  const setAuditActionFilter = props.setAuditActionFilter;
  const setAuditEntityFilter = props.setAuditEntityFilter;
  const setAuditLogs = props.setAuditLogs;
  const setBookingDateFilter = props.setBookingDateFilter;
  const setBookingDateFrom = props.setBookingDateFrom;
  const setBookingDateTo = props.setBookingDateTo;
  const setBookingPage = props.setBookingPage;
  const setBookingSearch = props.setBookingSearch;
  const setBookingSort = props.setBookingSort;
  const setBookingSourceFilter = props.setBookingSourceFilter;
  const setBookingStatusFilter = props.setBookingStatusFilter;
  const setBookings = props.setBookings;
  const setBulkActionLoading = props.setBulkActionLoading;
  const setCafeBookings = props.setCafeBookings;
  const setCafeCoupons = props.setCafeCoupons;
  const setCafeFilter = props.setCafeFilter;
  const setCafeInfoMsg = props.setCafeInfoMsg;
  const setCafeManageSubTab = props.setCafeManageSubTab;
  const setCafeMembershipPlans = props.setCafeMembershipPlans;
  const setCafePage = props.setCafePage;
  const setCafeSearch = props.setCafeSearch;
  const setCafeSort = props.setCafeSort;
  const setCafes = props.setCafes;
  const setConfirmPassword = props.setConfirmPassword;
  const setCouponForm = props.setCouponForm;
  const setCouponMsg = props.setCouponMsg;
  const setCoupons = props.setCoupons;
  const setCreateCafeForm = props.setCreateCafeForm;
  const setCreateCafeLoading = props.setCreateCafeLoading;
  const setCreateCafeMsg = props.setCreateCafeMsg;
  const setCurrentPassword = props.setCurrentPassword;
  const setDeleteConfirm = props.setDeleteConfirm;
  const setEditCafeForm = props.setEditCafeForm;
  const setEditCouponForm = props.setEditCouponForm;
  const setEditCouponId = props.setEditCouponId;
  const setError = props.setError;
  const setGlobalCouponCafeId = props.setGlobalCouponCafeId;
  const setGlobalCouponForm = props.setGlobalCouponForm;
  const setGlobalCouponMsg = props.setGlobalCouponMsg;
  const setIsMobile = props.setIsMobile;
  const setLoadingCafeBookings = props.setLoadingCafeBookings;
  const setLoadingCoupons = props.setLoadingCoupons;
  const setLoadingData = props.setLoadingData;
  const setLoadingMemberships = props.setLoadingMemberships;
  const setLoadingReport = props.setLoadingReport;
  const setLoadingStationPricing = props.setLoadingStationPricing;
  const setLoadingSubscriptions = props.setLoadingSubscriptions;
  const setLoadingUserBookings = props.setLoadingUserBookings;
  const setManagedCafeId = props.setManagedCafeId;
  const setManagedUserId = props.setManagedUserId;
  const setMembershipForm = props.setMembershipForm;
  const setMembershipMsg = props.setMembershipMsg;
  const setMobileMenuOpen = props.setMobileMenuOpen;
  const setNewOwnerCafeId = props.setNewOwnerCafeId;
  const setNewOwnerEmail = props.setNewOwnerEmail;
  const setNewPassword = props.setNewPassword;
  const setNewUsername = props.setNewUsername;
  const setOfflineCafeFilter = props.setOfflineCafeFilter;
  const setOfflineCustomers = props.setOfflineCustomers;
  const setOfflineCustomersLoading = props.setOfflineCustomersLoading;
  const setOfflineSearch = props.setOfflineSearch;
  const setOfflineSort = props.setOfflineSort;
  const setOwnerEmailMsg = props.setOwnerEmailMsg;
  const setOwnerEmails = props.setOwnerEmails;
  const setOwnerEmailsLoading = props.setOwnerEmailsLoading;
  const setPlatformSubscriptions = props.setPlatformSubscriptions;
  const setReportDailyData = props.setReportDailyData;
  const setReportDays = props.setReportDays;
  const setReportPeakHours = props.setReportPeakHours;
  const setReportSourceSplit = props.setReportSourceSplit;
  const setRevenueCafeFilter = props.setRevenueCafeFilter;
  const setRevenueFrom = props.setRevenueFrom;
  const setRevenueSourceBreakdown = props.setRevenueSourceBreakdown;
  const setRevenueTo = props.setRevenueTo;
  const setSavingCafeInfo = props.setSavingCafeInfo;
  const setSavingCoupon = props.setSavingCoupon;
  const setSavingEditCoupon = props.setSavingEditCoupon;
  const setSavingGlobalCoupon = props.setSavingGlobalCoupon;
  const setSavingMembership = props.setSavingMembership;
  const setSavingSettings = props.setSavingSettings;
  const setSavingStation = props.setSavingStation;
  const setSavingStationPricing = props.setSavingStationPricing;
  const setSelectedCafeIds = props.setSelectedCafeIds;
  const setSettingsMessage = props.setSettingsMessage;
  const setShowAnnouncementForm = props.setShowAnnouncementForm;
  const setShowCreateCafe = props.setShowCreateCafe;
  const setShowGlobalCouponForm = props.setShowGlobalCouponForm;
  const setStationPriceForm = props.setStationPriceForm;
  const setStationPricing = props.setStationPricing;
  const setStationPricingMsg = props.setStationPricingMsg;
  const setStats = props.setStats;
  const setSubscriptionCafeFilter = props.setSubscriptionCafeFilter;
  const setSubscriptionSearch = props.setSubscriptionSearch;
  const setUserBookings = props.setUserBookings;
  const setUserPage = props.setUserPage;
  const setUserRoleFilter = props.setUserRoleFilter;
  const setUserSearch = props.setUserSearch;
  const setUserSort = props.setUserSort;
  const setUsers = props.setUsers;
  const settingsMessage = props.settingsMessage;
  const showAnnouncementForm = props.showAnnouncementForm;
  const showCreateCafe = props.showCreateCafe;
  const showGlobalCouponForm = props.showGlobalCouponForm;
  const startEditCoupon = props.startEditCoupon;
  const stationPriceForm = props.stationPriceForm;
  const stationPricing = props.stationPricing;
  const stationPricingMsg = props.stationPricingMsg;
  const stats = props.stats;
  const subscriptionCafeFilter = props.subscriptionCafeFilter;
  const subscriptionRevenue = props.subscriptionRevenue;
  const subscriptionSearch = props.subscriptionSearch;
  const toggleAnnouncementStatus = props.toggleAnnouncementStatus;
  const toggleCafeActive = props.toggleCafeActive;
  const toggleCafeFeatured = props.toggleCafeFeatured;
  const toggleCafeStatus = props.toggleCafeStatus;
  const toggleCouponActive = props.toggleCouponActive;
  const toggleCouponActiveInManage = props.toggleCouponActiveInManage;
  const toggleFeaturedCafe = props.toggleFeaturedCafe;
  const toggleMembershipActive = props.toggleMembershipActive;
  const totalBookingPages = props.totalBookingPages;
  const totalCafePages = props.totalCafePages;
  const totalUserPages = props.totalUserPages;
  const updateBookingStatus = props.updateBookingStatus;
  const updateCafeViaApi = props.updateCafeViaApi;
  const updateStationCount = props.updateStationCount;
  const updateUserRole = props.updateUserRole;
  const userBookings = props.userBookings;
  const userPage = props.userPage;
  const userRoleFilter = props.userRoleFilter;
  const userSearch = props.userSearch;
  const userSort = props.userSort;
  const users = props.users;

  return (
    <div className="p-5 md:p-8 pb-16 space-y-6">
      {error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <AlertTriangle size={16} className="shrink-0" />{error}
        </div>
      )}
          {/* Error Message */}
          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
              {/* Revenue Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Today", value: formatCurrency(stats?.todayRevenue || 0), sub: `${stats?.todayBookings || 0} bookings today`, color: "text-emerald-400", glow: "from-emerald-500/10" },
                  { label: "This Month", value: formatCurrency(stats?.monthRevenue || 0), sub: `${new Date().toLocaleString('en-IN', { month: 'long' })} 1st onwards`, color: "text-blue-400", glow: "from-blue-500/10" },
                  { label: "This Week", value: formatCurrency(stats?.weekRevenue || 0), sub: "Last 7 days", color: "text-violet-400", glow: "from-violet-500/10" },
                  { label: "All Time", value: formatCurrency(stats?.totalRevenue || 0), sub: "Platform total", color: "text-amber-400", glow: "from-amber-500/10" },
                ].map(c => (
                  <div key={c.label} className={`relative overflow-hidden rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${c.glow} to-transparent pointer-events-none`} />
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{c.label} Revenue</p>
                    <p className={`text-2xl font-bold ${c.color} leading-none`}>{loadingData ? "…" : c.value}</p>
                    <p className="text-xs text-slate-600 mt-1.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Platform Stats Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total Cafés", value: stats?.totalCafes || 0, sub: `${stats?.activeCafes || 0} active · ${stats?.pendingCafes || 0} inactive`, icon: <Store size={16} />, iconBg: "bg-blue-500/10 text-blue-400", tab: "cafes" as NavTab },
                  { label: "Registered Users", value: stats?.totalUsers || 0, sub: `${stats?.totalOwners || 0} café owners`, icon: <Users size={16} />, iconBg: "bg-violet-500/10 text-violet-400", tab: "users" as NavTab },
                  { label: "Total Bookings", value: stats?.totalBookings || 0, sub: `${stats?.todayBookings || 0} booked today`, icon: <CalendarCheck size={16} />, iconBg: "bg-emerald-500/10 text-emerald-400", tab: "bookings" as NavTab },
                  { label: "Avg per Booking", value: formatCurrency(averageRevenuePerBooking), sub: `${averageBookingsPerCafe} bookings / café avg`, icon: <BarChart3 size={16} />, iconBg: "bg-amber-500/10 text-amber-400", tab: "revenue" as NavTab },
                ].map(c => (
                  <button key={c.label} onClick={() => handleTabChange(c.tab)} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 text-left hover:border-white/[0.09] hover:bg-white/[0.04] transition-all group">
                    <div className="flex items-start justify-between mb-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{c.label}</p>
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${c.iconBg}`}>{c.icon}</div>
                    </div>
                    <p className="text-2xl font-bold text-white leading-none">{loadingData ? "…" : c.value}</p>
                    <p className="text-xs text-slate-600 mt-1.5">{c.sub}</p>
                  </button>
                ))}
              </div>

              {/* Bottom row: Platform health + Quick actions */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Health metrics */}
                <div className="lg:col-span-2 rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Platform Health</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Network Activated", value: `${activeCafeRate}%`, note: `${stats?.activeCafes || 0} of ${stats?.totalCafes || 0} cafés live`, color: "text-emerald-400", bar: activeCafeRate },
                      { label: "Avg Booking Value", value: formatCurrency(averageRevenuePerBooking), note: "Gross ÷ total bookings", color: "text-blue-400", bar: Math.min(100, averageRevenuePerBooking / 10) },
                      { label: "Bookings / Café", value: `${averageBookingsPerCafe}`, note: "Platform activity density", color: "text-amber-400", bar: Math.min(100, averageBookingsPerCafe) },
                    ].map(m => (
                      <div key={m.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
                        <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{m.label}</p>
                        <p className={`text-xl font-bold ${m.color} mb-1`}>{loadingData ? "…" : m.value}</p>
                        <div className="h-1 rounded-full bg-white/[0.08] mb-2 overflow-hidden">
                          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${m.bar}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-600">{m.note}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Quick Actions</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Manage Cafés", icon: <Store size={14} />, tab: "cafes" as NavTab },
                      { label: "View Bookings", icon: <CalendarCheck size={14} />, tab: "bookings" as NavTab },
                      { label: "Revenue Report", icon: <IndianRupee size={14} />, tab: "revenue" as NavTab },
                      { label: "Owner Access", icon: <KeyRound size={14} />, tab: "owner-access" as NavTab },
                      { label: "Audit Trail", icon: <Shield size={14} />, tab: "audit-logs" as NavTab },
                      { label: "Announcements", icon: <Megaphone size={14} />, tab: "announcements" as NavTab },
                    ].map(a => (
                      <button key={a.tab} onClick={() => handleTabChange(a.tab)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-all">
                        <span className="flex items-center gap-2.5 text-slate-500">{a.icon}<span className="text-slate-300">{a.label}</span></span>
                        <ChevronRight size={14} className="text-slate-600" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* ─── CAFES TAB ─── */}
          {activeTab === 'cafes' && !managedCafeId && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search cafés by name or address…"
                  value={cafeSearch}
                  onChange={(e) => { setCafeSearch(e.target.value); setCafePage(1); }}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                />
                <select
                  value={cafeFilter}
                  onChange={(e) => { setCafeFilter(e.target.value); setCafePage(1); }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                >
                  <option value="all">All Cafés</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredCafes.length} result{filteredCafes.length !== 1 ? 's' : ''}
                </div>
                <button
                  onClick={downloadCafesCSV}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.09] text-slate-300 transition-colors"
                  title="Export current results as CSV"
                >
                  ↓ Export CSV
                </button>
                <button
                  onClick={() => { setShowCreateCafe(true); setCreateCafeMsg(null); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                >
                  + New Café
                </button>
              </div>

              {/* Bulk action bar */}
              {selectedCafeIds.size > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-blue-500/10 border border-blue-500/30">
                  <span className="text-xs text-blue-300 font-semibold">{selectedCafeIds.size} selected</span>
                  <button onClick={() => bulkToggleCafeStatus(true)} disabled={bulkActionLoading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">Activate All</button>
                  <button onClick={() => bulkToggleCafeStatus(false)} disabled={bulkActionLoading} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 disabled:opacity-50 transition-colors">Deactivate All</button>
                  <button onClick={() => setSelectedCafeIds(new Set())} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.06] text-slate-400 hover:bg-white/[0.08] transition-colors">Clear</button>
                </div>
              )}

              {/* ── CREATE CAFÉ MODAL ── */}
              {showCreateCafe && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setShowCreateCafe(false); }}>
                  <div className="w-full max-w-2xl bg-[#0d0d12] border border-white/[0.09] rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
                    {/* Modal header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08]">
                      <div>
                        <h2 className="text-base font-bold text-white">Create New Café</h2>
                        <p className="text-xs text-slate-500 mt-0.5">New café is created inactive — activate it from the list after setup</p>
                      </div>
                      <button onClick={() => setShowCreateCafe(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06] transition-colors">✕</button>
                    </div>

                    {/* Modal body */}
                    <form onSubmit={handleCreateCafe} className="overflow-y-auto p-6 space-y-5">
                      {createCafeMsg && (
                        <div className={`px-4 py-3 rounded-xl text-sm border ${createCafeMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                          {createCafeMsg.text}
                        </div>
                      )}

                      {/* Core info */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Basic Info</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {[
                            { label: 'Café Name *', key: 'name', placeholder: 'e.g. GameZone PS5 Lounge', required: true },
                            { label: 'Address *', key: 'address', placeholder: 'Full address', required: true },
                            { label: 'Phone', key: 'phone', placeholder: '+91 XXXXX XXXXX', required: false },
                            { label: 'Café Email', key: 'email', placeholder: 'cafe@example.com', required: false },
                          ].map(f => (
                            <div key={f.key} className={f.key === 'address' ? 'sm:col-span-2' : ''}>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{f.label}</label>
                              <input
                                type="text"
                                value={(createCafeForm as any)[f.key]}
                                onChange={e => setCreateCafeForm(p => ({ ...p, [f.key]: e.target.value }))}
                                placeholder={f.placeholder}
                                required={f.required}
                                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Owner link */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1">Owner Gmail *</h3>
                        <p className="text-[11px] text-slate-600 mb-2">This Gmail will be able to log in to the owner dashboard. A profile is created automatically if the owner hasn't signed up yet.</p>
                        <input
                          type="email"
                          value={createCafeForm.owner_email}
                          onChange={e => setCreateCafeForm(p => ({ ...p, owner_email: e.target.value }))}
                          placeholder="owner@gmail.com"
                          required
                          className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-600 outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30"
                        />
                      </div>

                      {/* Pricing */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Pricing</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { label: 'Starting Price (₹)', key: 'price_starts_from' },
                            { label: 'Hourly Price (₹)', key: 'hourly_price' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{f.label}</label>
                              <input
                                type="number"
                                min="0"
                                value={(createCafeForm as any)[f.key]}
                                onChange={e => setCreateCafeForm(p => ({ ...p, [f.key]: e.target.value }))}
                                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none focus:border-violet-500/60"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Stations */}
                      <div>
                        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Station Counts</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {[
                            { label: 'PS5', key: 'ps5_count' },
                            { label: 'PS4', key: 'ps4_count' },
                            { label: 'Xbox', key: 'xbox_count' },
                            { label: 'PC', key: 'pc_count' },
                            { label: 'VR', key: 'vr_count' },
                            { label: 'Pool', key: 'pool_count' },
                            { label: 'Snooker', key: 'snooker_count' },
                            { label: 'Arcade', key: 'arcade_count' },
                            { label: 'Steering', key: 'steering_wheel_count' },
                            { label: 'Racing Sim', key: 'racing_sim_count' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{f.label}</label>
                              <input
                                type="number"
                                min="0"
                                value={(createCafeForm as any)[f.key]}
                                onChange={e => setCreateCafeForm(p => ({ ...p, [f.key]: e.target.value }))}
                                className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white text-center outline-none focus:border-violet-500/60"
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Footer buttons */}
                      <div className="flex gap-3 pt-2">
                        <button type="button" onClick={() => setShowCreateCafe(false)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] text-slate-300 hover:bg-white/[0.09] transition-colors">
                          Cancel
                        </button>
                        <button type="submit" disabled={createCafeLoading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors">
                          {createCafeLoading ? 'Creating…' : 'Create Café'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Delete confirm modal */}
              {deleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                  <div className="w-full max-w-md bg-[#0d0d12] border border-red-500/30 rounded-2xl shadow-2xl p-6 space-y-4">
                    <h2 className="text-base font-bold text-white">Delete Café?</h2>
                    <p className="text-sm text-slate-400">This will permanently delete <span className="text-white font-semibold">&ldquo;{deleteConfirm.name}&rdquo;</span> and all related bookings, pricing, and images. This cannot be undone.</p>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] text-slate-300 hover:bg-white/[0.09] transition-colors">Cancel</button>
                      <button onClick={() => confirmDeleteCafe(deleteConfirm.id, deleteConfirm.name)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">Yes, Delete</button>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={selectedCafeIds.size === paginatedCafes.length && paginatedCafes.length > 0}
                            onChange={e => {
                              if (e.target.checked) setSelectedCafeIds(new Set(paginatedCafes.map(c => c.id)));
                              else setSelectedCafeIds(new Set());
                            }}
                            className="rounded"
                          />
                        </th>
                        {[
                          { label: 'Café', field: 'name' },
                          { label: 'Owner', field: 'owner_name' },
                          { label: 'Location', field: null },
                          { label: 'Consoles', field: null },
                          { label: 'Bookings', field: 'total_bookings' },
                          { label: 'Revenue', field: 'total_revenue' },
                          { label: 'Status', field: null },
                          { label: 'Actions', field: null },
                        ].map(col => (
                          <th
                            key={col.label}
                            onClick={col.field ? () => handleSort(cafeSort, setCafeSort, col.field!) : undefined}
                            className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest ${col.field ? 'cursor-pointer hover:text-white select-none' : ''}`}
                          >
                            {col.label}{col.field && cafeSort.field === col.field ? (cafeSort.order === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingData ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Loading cafés…</td></tr>
                      ) : paginatedCafes.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No cafés found</td></tr>
                      ) : paginatedCafes.map(cafe => (
                        <tr key={cafe.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5 w-10">
                            <input
                              type="checkbox"
                              checked={selectedCafeIds.has(cafe.id)}
                              onChange={e => {
                                const next = new Set(selectedCafeIds);
                                if (e.target.checked) next.add(cafe.id); else next.delete(cafe.id);
                                setSelectedCafeIds(next);
                              }}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-white">{cafe.name}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-300">{cafe.owner_name}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400 max-w-[160px] truncate">{cafe.address}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400 whitespace-nowrap">
                            {[cafe.ps5_count && `PS5×${cafe.ps5_count}`, cafe.ps4_count && `PS4×${cafe.ps4_count}`, cafe.xbox_count && `Xbox×${cafe.xbox_count}`, cafe.pc_count && `PC×${cafe.pc_count}`].filter(Boolean).join(' · ') || '—'}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-300 font-medium">{cafe.total_bookings}</td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400">{formatCurrency(cafe.total_revenue || 0)}</td>
                          <td className="px-4 py-3.5 text-sm">
                            {cafe.is_active
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Inactive</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <button onClick={() => openCafeManage(cafe)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors">
                              Manage
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalCafePages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-xs text-slate-500">{((cafePage-1)*itemsPerPage)+1}–{Math.min(cafePage*itemsPerPage, filteredCafes.length)} of {filteredCafes.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setCafePage(p=>Math.max(1,p-1))} disabled={cafePage===1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
                      {Array.from({length:Math.min(5,totalCafePages)},(_,i)=>{const n=totalCafePages<=5?i+1:cafePage<=3?i+1:cafePage>=totalCafePages-2?totalCafePages-4+i:cafePage-2+i;return <button key={n} onClick={()=>setCafePage(n)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${cafePage===n?'bg-blue-500 text-white':'bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]'}`}>{n}</button>;})}
                      <button onClick={() => setCafePage(p=>Math.min(totalCafePages,p+1))} disabled={cafePage===totalCafePages} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── CAFE MANAGE PANEL ─── */}
          {activeTab === 'cafes' && managedCafeId && (() => {
            const mc = cafes.find(c => c.id === managedCafeId);
            if (!mc) return null;
            const STATION_TYPES = [
              { id: 'ps5', label: 'PS5', key: 'ps5_count' },
              { id: 'ps4', label: 'PS4', key: 'ps4_count' },
              { id: 'xbox', label: 'Xbox', key: 'xbox_count' },
              { id: 'pc', label: 'PC', key: 'pc_count' },
              { id: 'vr', label: 'VR', key: 'vr_count' },
              { id: 'pool', label: 'Pool', key: 'pool_count' },
              { id: 'snooker', label: 'Snooker', key: 'snooker_count' },
              { id: 'arcade', label: 'Arcade', key: 'arcade_count' },
              { id: 'steering', label: 'Steering Wheel', key: 'steering_wheel_count' },
              { id: 'racing_sim', label: 'Racing Sim', key: 'racing_sim_count' },
            ];
            return (
              <div className="space-y-4">
                {/* Back + header */}
                <div className="flex items-center gap-4">
                  <button onClick={() => setManagedCafeId(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 bg-white/[0.06] hover:bg-white/[0.08] transition-colors">
                    ← Back to Cafés
                  </button>
                  <div>
                    <h2 className="text-base font-bold text-white">{mc.name}</h2>
                    <p className="text-xs text-slate-500">{mc.address}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    {mc.is_active
                      ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                      : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Inactive</span>}
                    <button onClick={() => router.push(`/cafes/${mc.slug}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
                      <ExternalLink size={11} />View Live Page
                    </button>
                    <button
                      onClick={() => window.open(`/owner`, '_blank')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors"
                      title="Open owner dashboard (owner must be logged in)"
                    >
                      <Gamepad2 size={11} />Owner Dashboard
                    </button>
                  </div>
                </div>

                {/* Sub-tabs */}
                <div className="flex gap-1 p-1 rounded-2xl bg-[#0d0d14] border border-white/[0.08] w-fit">
                  {(['info', 'stations', 'bookings', 'memberships', 'coupons'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setCafeManageSubTab(tab);
                        if (tab === 'memberships' && cafeMembershipPlans.length === 0) loadCafeMemberships(managedCafeId);
                        if (tab === 'coupons' && cafeCoupons.length === 0) loadCafeCoupons(managedCafeId);
                        if (tab === 'bookings' && cafeBookings.length === 0) loadCafeBookings(managedCafeId);
                        if (tab === 'stations') { setStationPricing({}); setStationPriceForm({}); loadStationPricing(managedCafeId); }
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${cafeManageSubTab === tab ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'}`}
                    >
                      {tab === 'info' ? 'Info' : tab === 'stations' ? 'Stations' : tab === 'memberships' ? 'Memberships' : tab === 'coupons' ? 'Coupons' : 'Bookings'}
                    </button>
                  ))}
                </div>

                {/* ── INFO SUB-TAB ── */}
                {cafeManageSubTab === 'info' && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-white">Basic Info</h3>
                      {cafeInfoMsg && (
                        <div className={`px-3 py-2 rounded-xl text-xs border ${cafeInfoMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{cafeInfoMsg.text}</div>
                      )}
                      {[
                        { label: 'Café Name', key: 'name' },
                        { label: 'URL Slug', key: 'slug', hint: 'e.g. gamezon-bandra' },
                        { label: 'Address', key: 'address' },
                        { label: 'City', key: 'city' },
                        { label: 'Phone', key: 'phone' },
                        { label: 'Email', key: 'email' },
                        { label: 'Starting Price (₹)', key: 'price_starts_from' },
                        { label: 'Hourly Price (₹)', key: 'hourly_price' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{f.label}</label>
                          <input
                            type={f.key.includes('price') ? 'number' : 'text'}
                            value={editCafeForm[f.key] || ''}
                            onChange={e => setEditCafeForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={(f as any).hint || ''}
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                          />
                        </div>
                      ))}
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Description</label>
                        <textarea
                          value={editCafeForm.description || ''}
                          onChange={e => setEditCafeForm(prev => ({ ...prev, description: e.target.value }))}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 resize-none"
                          placeholder="About this café…"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Opens At</label>
                          <input
                            type="text"
                            value={editCafeForm.opening_time || ''}
                            onChange={e => setEditCafeForm(prev => ({ ...prev, opening_time: e.target.value }))}
                            placeholder="10:00 AM"
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Closes At</label>
                          <input
                            type="text"
                            value={editCafeForm.closing_time || ''}
                            onChange={e => setEditCafeForm(prev => ({ ...prev, closing_time: e.target.value }))}
                            placeholder="11:00 PM"
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                          />
                        </div>
                      </div>
                      <button
                        onClick={saveCafeInfoAdmin}
                        disabled={savingCafeInfo}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors disabled:opacity-50"
                      >
                        {savingCafeInfo ? 'Saving…' : 'Save Info'}
                      </button>
                    </div>

                    {/* Quick stats card */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-3">
                      <h3 className="text-sm font-semibold text-white">Café Overview</h3>
                      {[
                        { label: 'Total Bookings', value: mc.total_bookings || 0 },
                        { label: 'Total Revenue', value: formatCurrency(mc.total_revenue || 0) },
                        { label: 'Owner', value: mc.owner_name || '—' },
                        { label: 'Owner Email', value: mc.owner_email || '—' },
                        { label: 'Owner Phone', value: mc.owner_phone || '—' },
                        { label: 'City', value: mc.city || '—' },
                        { label: 'Opening Hours', value: mc.opening_hours || '—' },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center py-2 border-b border-white/[0.06]">
                          <span className="text-xs text-slate-500">{r.label}</span>
                          <span className="text-xs font-semibold text-white max-w-[55%] text-right truncate">{r.value}</span>
                        </div>
                      ))}
                      <div className="pt-2 space-y-2">
                        <button onClick={() => toggleCafeStatus(mc.id, mc.is_active, mc.name!)} className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${mc.is_active ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                          {mc.is_active ? 'Deactivate Café' : 'Activate Café'}
                        </button>
                        <button onClick={() => toggleFeaturedCafe(mc.id, mc.is_featured || false, mc.name!)} className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${mc.is_featured ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.08]'}`}>
                          {mc.is_featured ? '⭐ Remove Featured' : '☆ Mark as Featured'}
                        </button>
                        <button onClick={() => { setManagedCafeId(null); deleteCafe(mc.id, mc.name!); }} className="w-full py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                          Delete Café
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── STATIONS SUB-TAB ── */}
                {cafeManageSubTab === 'stations' && (
                  <div className="space-y-4">
                    {/* Current station counts */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                      <h3 className="text-sm font-semibold text-white mb-4">Station Inventory</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {STATION_TYPES.map(st => {
                          const count = (mc as any)[st.key] || 0;
                          return (
                            <div key={st.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-3">
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{st.label}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-xl font-bold text-white">{count}</span>
                                <div className="flex gap-1">
                                  <button
                                    onClick={() => updateStationCount(st.id, -1)}
                                    disabled={savingStation || count === 0}
                                    className="w-6 h-6 rounded-lg bg-white/[0.08] text-slate-300 hover:bg-slate-600 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                                  >−</button>
                                  <button
                                    onClick={() => updateStationCount(st.id, 1)}
                                    disabled={savingStation}
                                    className="w-6 h-6 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                                  >+</button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Add stations in bulk */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                      <h3 className="text-sm font-semibold text-white mb-3">Add Stations in Bulk</h3>
                      <div className="flex flex-wrap gap-3">
                        <select
                          value={addStationType}
                          onChange={e => setAddStationType(e.target.value)}
                          className="px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                        >
                          {STATION_TYPES.map(st => <option key={st.id} value={st.id}>{st.label}</option>)}
                        </select>
                        <input
                          type="number"
                          min={1}
                          max={50}
                          value={addStationCount}
                          onChange={e => setAddStationCount(Math.max(1, Number(e.target.value)))}
                          className="w-20 px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                        />
                        <button
                          onClick={() => updateStationCount(addStationType, addStationCount)}
                          disabled={savingStation}
                          className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors disabled:opacity-50"
                        >
                          {savingStation ? 'Saving…' : `+ Add ${addStationCount}`}
                        </button>
                      </div>
                    </div>

                    {/* Station Prices */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-white">Station Prices</h3>
                        <button onClick={() => loadStationPricing(managedCafeId)} className="text-xs text-slate-500 hover:text-white transition-colors">↻ Refresh</button>
                      </div>

                      {stationPricingMsg && (
                        <div className={`mb-4 px-3 py-2 rounded-xl text-xs border ${stationPricingMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                          {stationPricingMsg.text}
                        </div>
                      )}

                      {loadingStationPricing ? (
                        <p className="text-xs text-slate-500 py-4 text-center">Loading pricing…</p>
                      ) : (
                        <div className="space-y-4">
                          {STATION_TYPES.filter(st => ((mc as any)[st.key] || 0) > 0).map(st => {
                            const count = (mc as any)[st.key] || 0;
                            const f = stationPriceForm[st.label] || {};
                            const setF = (field: string, val: string) =>
                              setStationPriceForm(prev => ({ ...prev, [st.label]: { ...prev[st.label], [field]: val } }));
                            const inp = (label: string, field: string) => (
                              <div key={field}>
                                <label className="block text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">₹</span>
                                  <input
                                    type="number"
                                    min={0}
                                    value={f[field] ?? ''}
                                    onChange={e => setF(field, e.target.value)}
                                    placeholder="0"
                                    className="w-full pl-6 pr-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
                                  />
                                </div>
                              </div>
                            );

                            return (
                              <div key={st.id} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="text-sm font-semibold text-white">{st.label}</p>
                                    <p className="text-[10px] text-slate-500">{count} station{count !== 1 ? 's' : ''} · prices apply to all</p>
                                  </div>
                                  <button
                                    onClick={() => saveStationTypePricing(managedCafeId, st.label, count)}
                                    disabled={savingStationPricing}
                                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors disabled:opacity-50"
                                  >
                                    {savingStationPricing ? 'Saving…' : 'Save'}
                                  </button>
                                </div>

                                {/* PS5 / Xbox — per-controller pricing */}
                                {(st.label === 'PS5' || st.label === 'Xbox') && (
                                  <div className="space-y-3">
                                    {[1, 2, 3, 4].map(n => (
                                      <div key={n}>
                                        <p className="text-[10px] text-slate-400 font-semibold mb-2">{n} Controller{n > 1 ? 's' : ''}</p>
                                        <div className="grid grid-cols-2 gap-2">
                                          {inp('30 min', `controller_${n}_half_hour`)}
                                          {inp('60 min', `controller_${n}_full_hour`)}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* PS4 — single / multi player */}
                                {st.label === 'PS4' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {inp('Single 30 min', 'single_player_half_hour_rate')}
                                    {inp('Single 60 min', 'single_player_rate')}
                                    {inp('Multi 30 min', 'multi_player_half_hour_rate')}
                                    {inp('Multi 60 min', 'multi_player_rate')}
                                  </div>
                                )}

                                {/* All other stations — simple half/full hour */}
                                {st.label !== 'PS5' && st.label !== 'Xbox' && st.label !== 'PS4' && (
                                  <div className="grid grid-cols-2 gap-2">
                                    {inp('30 min', 'half_hour_rate')}
                                    {inp('60 min', 'hourly_rate')}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {STATION_TYPES.filter(st => ((mc as any)[st.key] || 0) > 0).length === 0 && (
                            <p className="text-xs text-slate-500 text-center py-4">No stations added yet. Add stations above first.</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ── BOOKINGS SUB-TAB ── */}
                {cafeManageSubTab === 'bookings' && (
                  <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-white">Bookings</h3>
                      <button onClick={() => loadCafeBookings(managedCafeId)} className="text-xs text-slate-500 hover:text-white transition-colors">↻ Refresh</button>
                    </div>
                    {loadingCafeBookings ? (
                      <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                    ) : cafeBookings.length === 0 ? (
                      <div className="py-10 text-center text-sm text-slate-500">No bookings yet.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                            <tr>
                              <th className={thCls}>Date</th>
                              <th className={thCls}>Time</th>
                              <th className={thCls}>Customer</th>
                              <th className={thCls}>Duration</th>
                              <th className={thCls}>Source</th>
                              <th className={thCls}>Amount</th>
                              <th className={thCls}>Status</th>
                              <th className={`${thCls} text-right`}>Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {cafeBookings.map(b => (
                              <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                                <td className={tdCls}>{formatDate(b.booking_date)}</td>
                                <td className={`${tdCls} text-cyan-400`}>{b.start_time}</td>
                                <td className={tdCls}>{b.user_name || b.customer_name || 'Walk-in'}</td>
                                <td className={tdCls}>{b.duration} min</td>
                                <td className={tdCls}>{b.source === 'walk_in' ? 'Walk-in' : 'Online'}</td>
                                <td className={`${tdCls} font-semibold text-emerald-400`}>{formatCurrency(b.total_amount)}</td>
                                <td className={tdCls}>
                                  <select value={b.status} onChange={e => updateBookingStatus(b.id, e.target.value)} className="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-xs text-white outline-none">
                                    {['pending','confirmed','in-progress','completed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </td>
                                <td className={`${tdCls} text-right`}>
                                  <button onClick={() => deleteBookingAdmin(b.id, mc.name || '')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* ── MEMBERSHIPS SUB-TAB ── */}
                {cafeManageSubTab === 'memberships' && (
                  <div className="space-y-4">
                    {/* Add plan form */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-white">Add Membership Plan</h3>
                      {membershipMsg && (
                        <div className={`px-3 py-2 rounded-xl text-xs border ${membershipMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{membershipMsg.text}</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Plan Name</label>
                          <input type="text" placeholder="e.g. PS5 Day Pass" value={membershipForm.name} onChange={e => setMembershipForm(p => ({...p, name: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Type</label>
                          <select value={membershipForm.plan_type} onChange={e => setMembershipForm(p => ({...p, plan_type: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                            <option value="hourly_package">Hourly Package</option>
                            <option value="day_pass">Day Pass</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Console</label>
                          <select value={membershipForm.console_type} onChange={e => setMembershipForm(p => ({...p, console_type: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                            {['ps5','ps4','xbox','pc','vr','pool','snooker','arcade'].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Price (₹)</label>
                          <input type="number" placeholder="500" value={membershipForm.price} onChange={e => setMembershipForm(p => ({...p, price: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        {membershipForm.plan_type !== 'day_pass' && (
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Hours</label>
                            <input type="number" placeholder="10" value={membershipForm.hours} onChange={e => setMembershipForm(p => ({...p, hours: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                          </div>
                        )}
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Validity (days)</label>
                          <input type="number" placeholder="30" value={membershipForm.validity_days} onChange={e => setMembershipForm(p => ({...p, validity_days: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Players</label>
                          <select value={membershipForm.player_count} onChange={e => setMembershipForm(p => ({...p, player_count: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                            <option value="single">Single</option>
                            <option value="double">Double</option>
                          </select>
                        </div>
                      </div>
                      <button onClick={() => saveMembershipPlan(managedCafeId)} disabled={savingMembership || !membershipForm.name || !membershipForm.price} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-violet-500 hover:bg-violet-400 text-white transition-colors disabled:opacity-50">
                        {savingMembership ? 'Saving…' : '+ Add Plan'}
                      </button>
                    </div>

                    {/* Plans list */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Existing Plans</h3>
                        <button onClick={() => loadCafeMemberships(managedCafeId)} className="text-xs text-slate-500 hover:text-white transition-colors">↻ Refresh</button>
                      </div>
                      {loadingMemberships ? (
                        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                      ) : cafeMembershipPlans.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">No membership plans yet.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                            <tr>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Name</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Type</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Console</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Price</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Hours</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Validity</th>
                              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {cafeMembershipPlans.map(plan => (
                              <tr key={plan.id} className="hover:bg-white/[0.03] transition-colors">
                                <td className="px-4 py-3 text-sm font-semibold text-white">{plan.name}</td>
                                <td className="px-4 py-3 text-sm">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${plan.plan_type === 'day_pass' ? 'bg-amber-500/15 text-amber-400' : 'bg-violet-500/15 text-violet-400'}`}>
                                    {plan.plan_type === 'day_pass' ? 'Day Pass' : 'Hourly'}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-slate-400 uppercase">{plan.console_type}</td>
                                <td className="px-4 py-3 text-sm font-semibold text-emerald-400">{formatCurrency(plan.price)}</td>
                                <td className="px-4 py-3 text-sm text-slate-400">{plan.hours ? `${plan.hours}h` : '—'}</td>
                                <td className="px-4 py-3 text-sm text-slate-400">{plan.validity_days}d</td>
                                <td className="px-4 py-3 text-right">
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button onClick={() => toggleMembershipActive(plan.id, plan.is_active, managedCafeId)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${plan.is_active ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                                      {plan.is_active ? 'Disable' : 'Enable'}
                                    </button>
                                    <button onClick={() => deleteMembershipPlan(plan.id, managedCafeId)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}

                {/* ── COUPONS SUB-TAB ── */}
                {cafeManageSubTab === 'coupons' && (
                  <div className="space-y-4">
                    {/* Edit coupon modal */}
                    {editCouponId && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="w-full max-w-sm bg-[#0d0d12] border border-white/[0.09] rounded-2xl shadow-2xl p-6 space-y-4">
                          <h2 className="text-sm font-bold text-white">Edit Coupon</h2>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Discount Value</label>
                            <input type="number" value={editCouponForm.discount_value} onChange={e => setEditCouponForm(p => ({...p, discount_value: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Max Uses (blank = ∞)</label>
                            <input type="number" value={editCouponForm.max_uses} onChange={e => setEditCouponForm(p => ({...p, max_uses: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" placeholder="∞" />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Valid Until</label>
                            <input type="date" value={editCouponForm.valid_until} onChange={e => setEditCouponForm(p => ({...p, valid_until: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                          </div>
                          <div className="flex gap-3 pt-1">
                            <button onClick={() => setEditCouponId(null)} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-white/[0.06] text-slate-300 hover:bg-white/[0.09] transition-colors">Cancel</button>
                            <button onClick={() => saveEditCoupon(managedCafeId)} disabled={savingEditCoupon} className="flex-1 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50">{savingEditCoupon ? 'Saving…' : 'Save'}</button>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Add coupon form */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-4">
                      <h3 className="text-sm font-semibold text-white">Create Coupon</h3>
                      {couponMsg && (
                        <div className={`px-3 py-2 rounded-xl text-xs border ${couponMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{couponMsg.text}</div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Coupon Code</label>
                          <input type="text" placeholder="SAVE20" value={couponForm.code} onChange={e => setCouponForm(p => ({...p, code: e.target.value.toUpperCase()}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white font-mono outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Discount Type</label>
                          <select value={couponForm.discount_type} onChange={e => setCouponForm(p => ({...p, discount_type: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                            <option value="percentage">Percentage %</option>
                            <option value="fixed">Fixed ₹</option>
                            <option value="bonus_minutes">Bonus Minutes</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Discount Value</label>
                          <input type="number" placeholder={couponForm.discount_type === 'percentage' ? '20' : couponForm.discount_type === 'fixed' ? '100' : '30'} value={couponForm.discount_value} onChange={e => setCouponForm(p => ({...p, discount_value: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Bonus Minutes</label>
                          <input type="number" placeholder="0" value={couponForm.bonus_minutes} onChange={e => setCouponForm(p => ({...p, bonus_minutes: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Max Uses (blank = ∞)</label>
                          <input type="number" placeholder="∞" value={couponForm.max_uses} onChange={e => setCouponForm(p => ({...p, max_uses: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Valid Until (optional)</label>
                          <input type="date" value={couponForm.valid_until} onChange={e => setCouponForm(p => ({...p, valid_until: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                        </div>
                      </div>
                      <button onClick={() => saveCoupon(managedCafeId)} disabled={savingCoupon || !couponForm.code} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50">
                        {savingCoupon ? 'Saving…' : '+ Create Coupon'}
                      </button>
                    </div>

                    {/* Coupons list */}
                    <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                      <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-white">Existing Coupons</h3>
                        <button onClick={() => loadCafeCoupons(managedCafeId)} className="text-xs text-slate-500 hover:text-white transition-colors">↻ Refresh</button>
                      </div>
                      {loadingCoupons ? (
                        <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                      ) : cafeCoupons.length === 0 ? (
                        <div className="py-10 text-center text-sm text-slate-500">No coupons for this café yet.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                            <tr>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Code</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Discount</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Usage</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Valid Until</th>
                              <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                              <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {cafeCoupons.map(coupon => {
                              const expired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
                              const display = coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : coupon.bonus_minutes > 0 ? `${coupon.bonus_minutes} mins FREE` : `₹${coupon.discount_value} OFF`;
                              return (
                                <tr key={coupon.id} className="hover:bg-white/[0.03] transition-colors">
                                  <td className="px-4 py-3 font-mono text-sm font-semibold text-white">{coupon.code}</td>
                                  <td className="px-4 py-3 text-sm">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${coupon.discount_type === 'percentage' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>{display}</span>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-slate-400">{coupon.uses_count} / {coupon.max_uses || '∞'}</td>
                                  <td className="px-4 py-3 text-sm text-slate-400">{coupon.valid_until ? formatDate(coupon.valid_until) : 'No expiry'}</td>
                                  <td className="px-4 py-3 text-sm">
                                    {expired
                                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Expired</span>
                                      : coupon.is_active
                                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                                      : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">Inactive</span>}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button onClick={() => startEditCoupon(coupon)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">Edit</button>
                                      <button onClick={() => toggleCouponActiveInManage(coupon.id, coupon.is_active, managedCafeId)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${coupon.is_active ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                                        {coupon.is_active ? 'Pause' : 'Resume'}
                                      </button>
                                      <button onClick={() => deleteCoupon(coupon.id, managedCafeId)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ─── USERS TAB ─── */}
          {activeTab === 'users' && managedUserId && (() => {
            const mu = users.find(u => u.id === managedUserId);
            if (!mu) return null;
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <button onClick={() => { setManagedUserId(null); setUserBookings([]); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-400 bg-white/[0.06] hover:bg-white/[0.08] transition-colors">← Back to Users</button>
                  <div>
                    <h2 className="text-base font-bold text-white">{mu.name}</h2>
                    <p className="text-xs text-slate-500">{mu.phone || 'No phone'} · {mu.role}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <select value={mu.role} onChange={e => updateUserRole(mu.id, e.target.value, mu.name)} className="px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-xs text-white outline-none">
                      <option value="user">User</option>
                      <option value="owner">Owner</option>
                      <option value="admin">Admin</option>
                    </select>
                    <button onClick={() => deleteUser(mu.id, mu.name)} className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors">Delete User</button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Total Bookings', value: mu.total_bookings || 0, color: 'text-blue-400' },
                    { label: 'Total Spent', value: formatCurrency(mu.total_spent || 0), color: 'text-emerald-400' },
                    { label: 'Role', value: mu.role, color: 'text-violet-400' },
                    { label: 'Joined', value: formatDate(mu.created_at), color: 'text-amber-400' },
                  ].map(s => (
                    <div key={s.label} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-4">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                      <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.08]">
                    <h3 className="text-sm font-semibold text-white">Booking History</h3>
                  </div>
                  {loadingUserBookings ? (
                    <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
                  ) : userBookings.length === 0 ? (
                    <div className="py-10 text-center text-sm text-slate-500">No bookings for this user.</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                        <tr>
                          <th className={thCls}>Café</th>
                          <th className={thCls}>Date</th>
                          <th className={thCls}>Time</th>
                          <th className={thCls}>Duration</th>
                          <th className={thCls}>Amount</th>
                          <th className={thCls}>Source</th>
                          <th className={thCls}>Status</th>
                          <th className={`${thCls} text-right`}>Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {userBookings.map(b => (
                          <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className={`${tdCls} font-semibold text-white`}>{b.cafe_name}</td>
                            <td className={tdCls}>{formatDate(b.booking_date)}</td>
                            <td className={tdCls}>{b.start_time}</td>
                            <td className={tdCls}>{b.duration} min</td>
                            <td className={`${tdCls} font-semibold text-emerald-400`}>{formatCurrency(b.total_amount)}</td>
                            <td className={tdCls}>{b.source}</td>
                            <td className={tdCls}>
                              <select value={b.status} onChange={e => updateBookingStatus(b.id, e.target.value)} className="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-xs text-white outline-none">
                                {['pending','confirmed','in-progress','completed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <button onClick={() => deleteBookingAdmin(b.id, b.cafe_name || '')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            );
          })()}

          {activeTab === 'users' && !managedUserId && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search users by name…"
                  value={userSearch}
                  onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                />
                <select
                  value={userRoleFilter}
                  onChange={(e) => { setUserRoleFilter(e.target.value); setUserPage(1); }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                >
                  <option value="all">All Roles</option>
                  <option value="user">Users</option>
                  <option value="owner">Owners</option>
                  <option value="admin">Admins</option>
                </select>
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredUsers.length} result{filteredUsers.length !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        {[
                          { label: 'Name', field: 'name' },
                          { label: 'Phone', field: null },
                          { label: 'Role', field: 'role' },
                          { label: 'Bookings', field: 'total_bookings' },
                          { label: 'Total Spent', field: 'total_spent' },
                          { label: 'Joined', field: 'created_at' },
                          { label: 'Actions', field: null },
                        ].map(col => (
                          <th
                            key={col.label}
                            onClick={col.field ? () => handleSort(userSort, setUserSort, col.field!) : undefined}
                            className={`px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest ${col.field ? 'cursor-pointer hover:text-white select-none' : ''}`}
                          >
                            {col.label}{col.field && userSort.field === col.field ? (userSort.order === 'asc' ? ' ↑' : ' ↓') : ''}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingData ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Loading users…</td></tr>
                      ) : paginatedUsers.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No users found</td></tr>
                      ) : paginatedUsers.map(u => (
                        <tr key={u.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5 text-sm font-semibold text-white">{u.name}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{u.phone || '—'}</td>
                          <td className="px-4 py-3.5 text-sm">
                            <select
                              value={u.role}
                              onChange={(e) => updateUserRole(u.id, e.target.value, u.name)}
                              className="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-xs text-white outline-none"
                            >
                              <option value="user">User</option>
                              <option value="owner">Owner</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-300">{u.total_bookings}</td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400">{formatCurrency(u.total_spent || 0)}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{formatDate(u.created_at)}</td>
                          <td className="px-4 py-3.5 text-sm">
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => openUserManage(u.id)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors">⚙ Manage</button>
                              <button onClick={() => deleteUser(u.id, u.name)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalUserPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-xs text-slate-500">{((userPage-1)*itemsPerPage)+1}–{Math.min(userPage*itemsPerPage, filteredUsers.length)} of {filteredUsers.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setUserPage(p=>Math.max(1,p-1))} disabled={userPage===1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
                      {Array.from({length:Math.min(5,totalUserPages)},(_,i)=>{const n=totalUserPages<=5?i+1:userPage<=3?i+1:userPage>=totalUserPages-2?totalUserPages-4+i:userPage-2+i;return <button key={n} onClick={()=>setUserPage(n)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${userPage===n?'bg-blue-500 text-white':'bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]'}`}>{n}</button>;})}
                      <button onClick={() => setUserPage(p=>Math.min(totalUserPages,p+1))} disabled={userPage===totalUserPages} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── OFFLINE CUSTOMERS TAB ─── */}
          {activeTab === 'offline-customers' && (
            <div className="space-y-4">
              {/* Stats strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Unique Customers', value: offlineCustomers.length, color: 'text-blue-400' },
                  { label: 'Filtered Results', value: filteredOfflineCustomers.length, color: 'text-violet-400' },
                  { label: 'Total Walk-in Bookings', value: offlineCustomers.reduce((s, c) => s + c.total_bookings, 0), color: 'text-emerald-400' },
                  { label: 'Total Walk-in Revenue', value: formatCurrency(offlineCustomers.reduce((s, c) => s + c.total_spent, 0)), color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-4">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`}>{offlineCustomersLoading ? '…' : s.value}</p>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search by name or phone…"
                  value={offlineSearch}
                  onChange={e => setOfflineSearch(e.target.value)}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-violet-500/50"
                />
                <select
                  value={offlineCafeFilter}
                  onChange={e => setOfflineCafeFilter(e.target.value)}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                >
                  <option value="all">All Cafés</option>
                  {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {/* Sort buttons */}
                <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {([
                    { key: 'recent', label: 'Recent' },
                    { key: 'visits', label: 'Top Visits' },
                    { key: 'spend',  label: 'Top Spend' },
                  ] as const).map(s => (
                    <button
                      key={s.key}
                      onClick={() => setOfflineSort(s.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${offlineSort === s.key ? 'bg-violet-600 text-white' : 'text-slate-400 hover:text-white'}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredOfflineCustomers.length} result{filteredOfflineCustomers.length !== 1 ? 's' : ''}
                </div>
                <button
                  onClick={downloadOfflineCustomersCSV}
                  disabled={filteredOfflineCustomers.length === 0}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ↓ Export CSV
                </button>
              </div>

              {/* Table */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className={thCls}>Customer</th>
                        <th className={thCls}>Phone</th>
                        <th className={thCls}>Last Café</th>
                        <th className={thCls}>Bookings</th>
                        <th className={thCls}>Total Spent</th>
                        <th className={thCls}>Last Visit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {offlineCustomersLoading ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">Loading offline customers…</td></tr>
                      ) : filteredOfflineCustomers.length === 0 ? (
                        <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-500">No offline customers found</td></tr>
                      ) : filteredOfflineCustomers.map(c => (
                        <tr key={c.phone} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-full bg-violet-500/15 flex items-center justify-center text-violet-400 text-xs font-bold shrink-0">
                                {c.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-white">{c.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-sm font-mono text-slate-300">{c.phone}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{c.cafe_name}</td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400">
                              {c.total_bookings} {c.total_bookings === 1 ? 'visit' : 'visits'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400">{formatCurrency(c.total_spent)}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{formatDate(c.last_visit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── BOOKINGS TAB ─── */}
          {activeTab === 'bookings' && (
            <div className="space-y-4">
              {/* Quick stats bar */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Showing', value: `${filteredBookings.length} bookings`, color: 'text-white' },
                  { label: 'Total Revenue', value: formatCurrency(filteredBookings.filter(b => b.status !== 'cancelled').reduce((s, b) => s + (b.total_amount || 0), 0)), color: 'text-emerald-400' },
                  { label: 'Online', value: `${filteredBookings.filter(b => (b.source || '').toLowerCase() === 'online').length}`, color: 'text-blue-400' },
                  { label: 'Walk-in', value: `${filteredBookings.filter(b => { const s = (b.source || '').toLowerCase(); return s === 'walk_in' || s === 'walk-in'; }).length}`, color: 'text-amber-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-[#0d0d14] border border-white/[0.08] px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">{s.label}</p>
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search by customer, café or phone…"
                  value={bookingSearch}
                  onChange={(e) => { setBookingSearch(e.target.value); setBookingPage(1); }}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                />
                <select
                  value={bookingStatusFilter}
                  onChange={(e) => { setBookingStatusFilter(e.target.value); setBookingPage(1); }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <select
                  value={bookingSourceFilter}
                  onChange={(e) => { setBookingSourceFilter(e.target.value); setBookingPage(1); }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                >
                  <option value="all">All Sources</option>
                  <option value="online">Online</option>
                  <option value="walkin">Walk-in</option>
                  <option value="membership">Membership</option>
                </select>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-500">From</span>
                  <input
                    type="date"
                    value={bookingDateFrom}
                    onChange={(e) => { setBookingDateFrom(e.target.value); setBookingDateFilter(''); setBookingPage(1); }}
                    className="px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                  />
                  <span className="text-xs text-slate-500">To</span>
                  <input
                    type="date"
                    value={bookingDateTo}
                    onChange={(e) => { setBookingDateTo(e.target.value); setBookingDateFilter(''); setBookingPage(1); }}
                    className="px-3 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                  />
                </div>
                {(bookingDateFrom || bookingDateTo || bookingSourceFilter !== 'all' || bookingStatusFilter !== 'all' || bookingSearch) && (
                  <button onClick={() => { setBookingDateFrom(''); setBookingDateTo(''); setBookingDateFilter(''); setBookingSourceFilter('all'); setBookingStatusFilter('all'); setBookingSearch(''); setBookingPage(1); }} className="px-3 py-2.5 rounded-xl text-xs font-semibold bg-white/[0.06] text-slate-400 hover:bg-white/[0.09] transition-colors">
                    ✕ Clear
                  </button>
                )}
                <button onClick={downloadBookingsCSV} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.09] text-slate-300 transition-colors">
                  ↓ Export CSV
                </button>
              </div>
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Café</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Customer</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Date</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Time</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Duration</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Amount</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Source</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingData ? (
                        <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">Loading bookings…</td></tr>
                      ) : paginatedBookings.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-500">No bookings found</td></tr>
                      ) : paginatedBookings.map(b => (
                        <tr key={b.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5 text-sm font-semibold text-white">{b.cafe_name}</td>
                          <td className="px-4 py-3.5 text-sm">
                            <div className="text-slate-200">{b.user_name}</div>
                            {b.customer_phone && <div className="text-xs text-slate-500 mt-0.5">{b.customer_phone}</div>}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{formatDate(b.booking_date)}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{b.start_time}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{b.duration} min</td>
                          <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400">{formatCurrency(b.total_amount)}</td>
                          <td className="px-4 py-3.5 text-sm">
                            {b.source === 'online'
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400">Online</span>
                              : b.source === 'membership'
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400">Member</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">Walk-in</span>}
                          </td>
                          <td className="px-4 py-3.5 text-sm">
                            <select value={b.status} onChange={e => updateBookingStatus(b.id, e.target.value)} className="px-2 py-1 rounded-lg bg-white/[0.06] border border-white/[0.09] text-xs text-white outline-none">
                              {['pending','confirmed','in-progress','completed','cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button onClick={() => deleteBookingAdmin(b.id, b.cafe_name || '')} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalBookingPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
                    <span className="text-xs text-slate-500">{((bookingPage-1)*itemsPerPage)+1}–{Math.min(bookingPage*itemsPerPage, filteredBookings.length)} of {filteredBookings.length}</span>
                    <div className="flex gap-1">
                      <button onClick={() => setBookingPage(p=>Math.max(1,p-1))} disabled={bookingPage===1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
                      {Array.from({length:Math.min(5,totalBookingPages)},(_,i)=>{const n=totalBookingPages<=5?i+1:bookingPage<=3?i+1:bookingPage>=totalBookingPages-2?totalBookingPages-4+i:bookingPage-2+i;return <button key={n} onClick={()=>setBookingPage(n)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${bookingPage===n?'bg-blue-500 text-white':'bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]'}`}>{n}</button>;})}
                      <button onClick={() => setBookingPage(p=>Math.min(totalBookingPages,p+1))} disabled={bookingPage===totalBookingPages} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── REVENUE TAB ─── */}
          {activeTab === 'revenue' && (
            <div className="space-y-5">
              {/* Summary cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Today', value: formatCurrency(stats?.todayRevenue||0), sub: `${stats?.todayBookings||0} bookings`, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/20', bgClass: 'bg-emerald-500/5' },
                  { label: 'This Week', value: formatCurrency(stats?.weekRevenue||0), sub: 'Last 7 days', colorClass: 'text-blue-400', borderClass: 'border-blue-500/20', bgClass: 'bg-blue-500/5' },
                  { label: 'This Month', value: formatCurrency(stats?.monthRevenue||0), sub: `${new Date().toLocaleString('en-IN', { month: 'long' })} 1st onwards`, colorClass: 'text-violet-400', borderClass: 'border-violet-500/20', bgClass: 'bg-violet-500/5' },
                  { label: 'All Time', value: formatCurrency(stats?.totalRevenue||0), sub: `${stats?.totalBookings||0} total bookings`, colorClass: 'text-amber-400', borderClass: 'border-amber-500/20', bgClass: 'bg-amber-500/5' },
                ].map(c => (
                  <div key={c.label} className={`rounded-2xl ${c.bgClass} border ${c.borderClass} p-5`}>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.colorClass}`}>{loadingData ? '…' : c.value}</p>
                    <p className="text-xs text-slate-600 mt-1.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Source breakdown */}
              {bookings.length > 0 && (() => {
                const onlineRev = bookings.filter(b => b.source?.toLowerCase() === 'online' && b.status !== 'cancelled').reduce((s, b) => s + (b.total_amount || 0), 0);
                const walkinRev = bookings.filter(b => { const src = b.source?.toLowerCase() || ''; return (src === 'walk_in' || src === 'walk-in') && b.status !== 'cancelled'; }).reduce((s, b) => s + (b.total_amount || 0), 0);
                const memberRev = bookings.filter(b => b.source?.toLowerCase() === 'membership' && b.status !== 'cancelled').reduce((s, b) => s + (b.total_amount || 0), 0);
                const total = onlineRev + walkinRev + memberRev || 1;
                return (
                  <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                    <h3 className="text-sm font-semibold text-white mb-4">Revenue by Source <span className="text-[11px] text-slate-500 font-normal ml-1">(from loaded bookings)</span></h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {[
                        { label: 'Online', rev: onlineRev, pct: (onlineRev/total*100).toFixed(1), color: 'bg-blue-500', textColor: 'text-blue-400' },
                        { label: 'Walk-in', rev: walkinRev, pct: (walkinRev/total*100).toFixed(1), color: 'bg-amber-500', textColor: 'text-amber-400' },
                        { label: 'Membership', rev: memberRev, pct: (memberRev/total*100).toFixed(1), color: 'bg-violet-500', textColor: 'text-violet-400' },
                      ].map(s => (
                        <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-4">
                          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                          <p className={`text-xl font-bold ${s.textColor} mb-2`}>{formatCurrency(s.rev)}</p>
                          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">{s.pct}% of loaded revenue</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Café filter + export */}
              <div className="flex flex-wrap gap-3 items-center">
                <select value={revenueCafeFilter} onChange={e => setRevenueCafeFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-sm text-white outline-none">
                  <option value="all">All Cafés</option>
                  {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button onClick={() => {
                  const rows = [['Café', 'Owner', 'City', 'Bookings', 'Revenue (₹)', 'Share %', 'Status']];
                  const total = revenueFilteredCafes.reduce((s, c) => s + (c.total_revenue || 0), 0) || 1;
                  revenueFilteredCafes.forEach(c => rows.push([c.name, c.owner_name||'', c.city||'', String(c.total_bookings||0), String(c.total_revenue||0), ((c.total_revenue||0)/total*100).toFixed(1), c.is_active ? 'Active' : 'Inactive']));
                  const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a'); a.href = url; a.download = `revenue-by-cafe-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
                }} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.09] text-slate-300 transition-colors">
                  ↓ Export CSV
                </button>
                <span className="text-xs text-slate-500">{revenueFilteredCafes.length} café{revenueFilteredCafes.length !== 1 ? 's' : ''} · Total: {formatCurrency(revenueFilteredCafes.reduce((s, c) => s + (c.total_revenue||0), 0))}</span>
              </div>

              {/* Revenue by Café table */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-white">Revenue by Café</h3>
                </div>
                {cafes.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-500">Visit the Cafés tab first to load café data.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                        <tr>
                          <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Café</th>
                          <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Owner</th>
                          <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">City</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Bookings</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Revenue</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Share</th>
                          <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Avg / Booking</th>
                          <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {revenueFilteredCafes.map(cafe => {
                          const totalRev = revenueFilteredCafes.reduce((s, c) => s + (c.total_revenue||0), 0) || 1;
                          const share = ((cafe.total_revenue||0)/totalRev*100).toFixed(1);
                          const avgPerBooking = (cafe.total_bookings || 0) > 0 ? Math.round((cafe.total_revenue||0) / cafe.total_bookings!) : 0;
                          const barWidth = ((cafe.total_revenue||0)/totalRev*100).toFixed(0);
                          return (
                            <tr key={cafe.id} className="hover:bg-white/[0.03] transition-colors">
                              <td className="px-4 py-3.5">
                                <div className="text-sm font-semibold text-white">{cafe.name}</div>
                                <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[180px]">{cafe.address}</div>
                                <div className="mt-1.5 h-1 bg-white/[0.06] rounded-full overflow-hidden w-32">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${barWidth}%` }} />
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-sm text-slate-400">{cafe.owner_name||'—'}</td>
                              <td className="px-4 py-3.5 text-sm text-slate-400">{cafe.city||'—'}</td>
                              <td className="px-4 py-3.5 text-sm text-slate-300 text-right">{cafe.total_bookings||0}</td>
                              <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400 text-right">{formatCurrency(cafe.total_revenue||0)}</td>
                              <td className="px-4 py-3.5 text-right">
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400">{share}%</span>
                              </td>
                              <td className="px-4 py-3.5 text-sm text-slate-400 text-right">{avgPerBooking > 0 ? formatCurrency(avgPerBooking) : '—'}</td>
                              <td className="px-4 py-3.5">
                                {cafe.is_active
                                  ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                                  : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Inactive</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── REPORTS TAB ─── */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              {/* Period selector */}
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-widest">Period:</span>
                {([30, 60, 90] as const).map(d => (
                  <button key={d} onClick={() => setReportDays(d)} className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${reportDays === d ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.08]'}`}>Last {d} days</button>
                ))}
                {loadingReport && <span className="text-xs text-slate-500">Loading…</span>}
              </div>

              {/* KPI row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: `Total Bookings (${reportDays}d)`, value: reportDailyData.reduce((s, d) => s + d.bookings, 0), color: 'text-blue-400' },
                  { label: `Revenue (${reportDays}d)`, value: formatCurrency(reportDailyData.reduce((s, d) => s + d.revenue, 0)), color: 'text-emerald-400' },
                  { label: `Cancellations (${reportDays}d)`, value: reportDailyData.reduce((s, d) => s + d.cancelled, 0), color: 'text-red-400' },
                  { label: 'Cancellation Rate', value: (() => { const total = reportDailyData.reduce((s, d) => s + d.bookings, 0); const cancelled = reportDailyData.reduce((s, d) => s + d.cancelled, 0); return total > 0 ? `${(cancelled/total*100).toFixed(1)}%` : '0%'; })(), color: 'text-amber-400' },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.color}`}>{loadingReport ? '…' : c.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Daily trend table */}
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">Daily Trend</h3>
                    <button onClick={() => {
                      const rows = [['Date','Bookings','Revenue (₹)','Cancelled'], ...reportDailyData.map(d => [d.date, d.bookings, d.revenue, d.cancelled])];
                      const csv = rows.map(r => r.join(',')).join('\n');
                      const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `daily-report-${reportDays}d.csv`; a.click(); URL.revokeObjectURL(url);
                    }} className="text-xs text-slate-500 hover:text-white transition-colors">↓ CSV</button>
                  </div>
                  <div className="overflow-y-auto max-h-80">
                    {reportDailyData.length === 0 ? (
                      <p className="px-5 py-8 text-sm text-slate-500 text-center">{loadingReport ? 'Loading…' : 'No data for this period.'}</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-white/[0.03] border-b border-white/[0.08] sticky top-0">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Date</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Bookings</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Revenue</th>
                            <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Cancelled</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.04]">
                          {[...reportDailyData].reverse().map(d => (
                            <tr key={d.date} className="hover:bg-white/[0.02]">
                              <td className="px-4 py-2.5 text-xs text-slate-300">{formatDate(d.date)}</td>
                              <td className="px-4 py-2.5 text-xs text-blue-400 text-right font-semibold">{d.bookings}</td>
                              <td className="px-4 py-2.5 text-xs text-emerald-400 text-right font-semibold">{formatCurrency(d.revenue)}</td>
                              <td className="px-4 py-2.5 text-xs text-right">{d.cancelled > 0 ? <span className="text-red-400">{d.cancelled}</span> : <span className="text-slate-600">—</span>}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Peak hours */}
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Peak Booking Hours</h3>
                  {reportPeakHours.length === 0 ? (
                    <p className="text-sm text-slate-500">{loadingReport ? 'Loading…' : 'No data.'}</p>
                  ) : (
                    <div className="space-y-2.5">
                      {reportPeakHours.map((h, i) => {
                        const max = reportPeakHours[0].count || 1;
                        const w = (h.count / max * 100).toFixed(0);
                        return (
                          <div key={h.hour} className="flex items-center gap-3">
                            <span className={`w-14 text-xs shrink-0 ${i === 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>{h.hour}</span>
                            <div className="flex-1">
                              <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${i === 0 ? 'bg-amber-400' : 'bg-blue-500/70'}`} style={{ width: `${w}%` }} />
                              </div>
                            </div>
                            <span className="text-xs text-slate-400 w-10 text-right">{h.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Source split */}
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Booking Source Split</h3>
                  {loadingReport ? <p className="text-sm text-slate-500">Loading…</p> : (
                    <div className="space-y-3">
                      {[
                        { label: 'Online', count: reportSourceSplit.online, rev: reportSourceSplit.onlineRev, color: 'bg-blue-500', textColor: 'text-blue-400' },
                        { label: 'Walk-in', count: reportSourceSplit.walkin, rev: reportSourceSplit.walkinRev, color: 'bg-amber-500', textColor: 'text-amber-400' },
                        { label: 'Membership', count: reportSourceSplit.membership, rev: reportSourceSplit.membershipRev, color: 'bg-violet-500', textColor: 'text-violet-400' },
                      ].map(s => {
                        const total = (reportSourceSplit.online + reportSourceSplit.walkin + reportSourceSplit.membership) || 1;
                        const pct = (s.count / total * 100).toFixed(1);
                        return (
                          <div key={s.label} className="rounded-xl bg-white/[0.04] p-3">
                            <div className="flex justify-between mb-1.5">
                              <span className={`text-sm font-semibold ${s.textColor}`}>{s.label}</span>
                              <span className="text-xs text-slate-400">{s.count} bookings · {formatCurrency(s.rev)}</span>
                            </div>
                            <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                              <div className={`h-full ${s.color} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1">{pct}% of bookings</p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Top cafés */}
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Top Cafés by Revenue</h3>
                  {cafes.length === 0 ? (
                    <p className="text-sm text-slate-500">Visit Cafés tab first.</p>
                  ) : (
                    <div className="space-y-3">
                      {[...cafes].sort((a,b)=>(b.total_revenue||0)-(a.total_revenue||0)).slice(0,7).map((cafe, i) => {
                        const max = Math.max(...cafes.map(c=>c.total_revenue||0), 1);
                        const w = ((cafe.total_revenue||0)/max*100).toFixed(0);
                        return (
                          <div key={cafe.id} className="flex items-center gap-3">
                            <span className={`w-5 text-xs font-bold shrink-0 ${i===0?'text-amber-400':i===1?'text-slate-300':i===2?'text-amber-700':'text-slate-600'}`}>#{i+1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between mb-1">
                                <span className="text-xs text-slate-300 truncate">{cafe.name}</span>
                                <span className="text-xs font-semibold text-emerald-400 ml-2 shrink-0">{formatCurrency(cafe.total_revenue||0)}</span>
                              </div>
                              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full" style={{width:`${w}%`}} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ─── ANNOUNCEMENTS TAB ─── */}
          {activeTab === 'announcements' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-base font-semibold text-white">Platform Announcements</h3>
                <button
                  onClick={() => setShowAnnouncementForm(v => !v)}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors"
                >
                  {showAnnouncementForm ? '✕ Cancel' : '+ New Announcement'}
                </button>
              </div>

              {showAnnouncementForm && (
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-white">New Announcement</h4>
                  <input
                    type="text"
                    placeholder="Title"
                    value={announcementForm.title}
                    onChange={e => setAnnouncementForm({...announcementForm, title: e.target.value})}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none"
                  />
                  <textarea
                    placeholder="Message"
                    value={announcementForm.message}
                    onChange={e => setAnnouncementForm({...announcementForm, message: e.target.value})}
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none resize-none"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <select value={announcementForm.type} onChange={e => setAnnouncementForm({...announcementForm, type: e.target.value as 'info'|'warning'|'success'|'error'})} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="success">Success</option>
                      <option value="error">Error</option>
                    </select>
                    <select value={announcementForm.target_audience} onChange={e => setAnnouncementForm({...announcementForm, target_audience: e.target.value as 'all'|'users'|'owners'})} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                      <option value="all">All Users</option>
                      <option value="users">Users Only</option>
                      <option value="owners">Owners Only</option>
                    </select>
                    <input type="datetime-local" value={announcementForm.expires_at} onChange={e => setAnnouncementForm({...announcementForm, expires_at: e.target.value})} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                  </div>
                  <button onClick={createAnnouncement} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors">
                    Create Announcement
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {loadingData ? (
                  <div className="py-12 text-center text-slate-500 text-sm">Loading announcements…</div>
                ) : announcements.length === 0 ? (
                  <div className="py-12 text-center text-slate-500 text-sm">No announcements yet. Create the first one above.</div>
                ) : announcements.map(a => (
                  <div key={a.id} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <h4 className="text-sm font-semibold text-white">{a.title}</h4>
                          {a.type === 'info' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400">Info</span>}
                          {a.type === 'warning' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400">Warning</span>}
                          {a.type === 'success' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Success</span>}
                          {a.type === 'error' && <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Error</span>}
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400">{a.target_audience}</span>
                          {a.is_active
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">Inactive</span>}
                        </div>
                        <p className="text-sm text-slate-400 leading-relaxed">{a.message}</p>
                        <p className="text-xs text-slate-600 mt-2">Created: {formatDate(a.created_at)}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={() => toggleAnnouncementStatus(a.id, a.is_active)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${a.is_active ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                          {a.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                        <button onClick={() => deleteAnnouncement(a.id, a.title)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─── AUDIT LOGS TAB ─── */}
          {activeTab === 'audit-logs' && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <select value={auditActionFilter} onChange={e => setAuditActionFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                  <option value="all">All Actions</option>
                  {Array.from(new Set(auditLogs.map(l => l.action))).sort().map(a => <option key={a} value={a}>{a}</option>)}
                </select>
                <select value={auditEntityFilter} onChange={e => setAuditEntityFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                  <option value="all">All Entities</option>
                  {Array.from(new Set(auditLogs.map(l => l.entity_type))).sort().map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredAuditLogs.length} of {auditLogs.length} log{auditLogs.length !== 1 ? 's' : ''}
                </div>
                <button onClick={downloadAuditCSV} className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.09] text-slate-300 transition-colors">
                  ↓ Export CSV
                </button>
              </div>
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Timestamp</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Action</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Entity</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Entity ID</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingData ? (
                        <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Loading audit logs…</td></tr>
                      ) : filteredAuditLogs.length === 0 ? (
                        <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No audit logs found</td></tr>
                      ) : filteredAuditLogs.map(log => (
                        <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5 text-xs text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                          <td className="px-4 py-3.5 text-sm">
                            {['delete','deactivate','disable_maintenance'].includes(log.action)
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">{log.action}</span>
                              : ['create','activate','enable_maintenance'].includes(log.action)
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">{log.action}</span>
                              : ['update','change_role','feature','unfeature'].includes(log.action)
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400">{log.action}</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">{log.action}</span>}
                          </td>
                          <td className="px-4 py-3.5 text-sm font-medium text-slate-200">{log.entity_type}</td>
                          <td className="px-4 py-3.5 text-xs font-mono text-slate-500">{log.entity_id ? log.entity_id.substring(0,8)+'…' : '—'}</td>
                          <td className="px-4 py-3.5 text-xs text-slate-400 max-w-[320px]">
                            {log.details
                              ? <span title={JSON.stringify(log.details, null, 2)} className="cursor-help">{JSON.stringify(log.details).substring(0, 100)}{JSON.stringify(log.details).length > 100 ? '…' : ''}</span>
                              : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── COUPONS TAB ─── */}
          {activeTab === 'coupons' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="text-xs text-slate-500">{coupons.length} coupon{coupons.length !== 1 ? 's' : ''} across all cafés</div>
                <button onClick={() => setShowGlobalCouponForm(v => !v)} className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors">
                  {showGlobalCouponForm ? '✕ Cancel' : '+ New Coupon'}
                </button>
              </div>

              {showGlobalCouponForm && (
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 space-y-4">
                  <h4 className="text-sm font-semibold text-white">Create New Coupon</h4>
                  {globalCouponMsg && (
                    <div className={`px-3 py-2 rounded-xl text-xs border ${globalCouponMsg.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>{globalCouponMsg.text}</div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Café</label>
                      <select value={globalCouponCafeId} onChange={e => setGlobalCouponCafeId(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                        <option value="">— Select Café —</option>
                        {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Coupon Code</label>
                      <input type="text" placeholder="SAVE20" value={globalCouponForm.code} onChange={e => setGlobalCouponForm(p => ({...p, code: e.target.value.toUpperCase()}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white font-mono outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Discount Type</label>
                      <select value={globalCouponForm.discount_type} onChange={e => setGlobalCouponForm(p => ({...p, discount_type: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                        <option value="percentage">Percentage %</option>
                        <option value="fixed">Fixed ₹</option>
                        <option value="bonus_minutes">Bonus Minutes</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Discount Value</label>
                      <input type="number" placeholder="20" value={globalCouponForm.discount_value} onChange={e => setGlobalCouponForm(p => ({...p, discount_value: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Max Uses (blank = ∞)</label>
                      <input type="number" placeholder="∞" value={globalCouponForm.max_uses} onChange={e => setGlobalCouponForm(p => ({...p, max_uses: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Valid Until (optional)</label>
                      <input type="date" value={globalCouponForm.valid_until} onChange={e => setGlobalCouponForm(p => ({...p, valid_until: e.target.value}))} className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none" />
                    </div>
                  </div>
                  <button onClick={saveGlobalCoupon} disabled={savingGlobalCoupon || !globalCouponForm.code || !globalCouponCafeId} className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-white transition-colors disabled:opacity-50">
                    {savingGlobalCoupon ? 'Saving…' : '+ Create Coupon'}
                  </button>
                </div>
              )}

              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Code</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Café</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Discount</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Usage</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Valid Until</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingData ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">Loading coupons…</td></tr>
                      ) : coupons.length === 0 ? (
                        <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-500">No coupons found across any café</td></tr>
                      ) : coupons.map(coupon => {
                        const isExpired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
                        const discountDisplay = coupon.discount_type === 'percentage' ? `${coupon.discount_value}% OFF` : coupon.bonus_minutes > 0 ? `${coupon.bonus_minutes} mins FREE` : `₹${coupon.discount_value} OFF`;
                        return (
                          <tr key={coupon.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-4 py-3.5 font-mono text-sm font-semibold text-white">{coupon.code}</td>
                            <td className="px-4 py-3.5 text-sm text-slate-400">{coupon.cafe_name}</td>
                            <td className="px-4 py-3.5 text-sm">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${coupon.discount_type === 'percentage' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-blue-500/15 text-blue-400'}`}>
                                {discountDisplay}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-sm text-slate-400">{coupon.uses_count} / {coupon.max_uses || '∞'}</td>
                            <td className="px-4 py-3.5 text-sm text-slate-400">{coupon.valid_until ? formatDate(coupon.valid_until) : 'No expiry'}</td>
                            <td className="px-4 py-3.5 text-sm">
                              {isExpired
                                ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Expired</span>
                                : coupon.is_active
                                ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                                : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">Inactive</span>}
                            </td>
                            <td className="px-4 py-3.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button onClick={() => toggleCouponActive(coupon.id, coupon.is_active)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${coupon.is_active ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                                  {coupon.is_active ? 'Disable' : 'Enable'}
                                </button>
                                <button onClick={() => deleteGlobalCoupon(coupon.id, coupon.code)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── SUBSCRIPTIONS TAB ─── */}
          {activeTab === 'subscriptions' && (
            <div className="space-y-4">
              {/* Stats row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Subscriptions', value: filteredSubscriptions.length, color: 'text-white' },
                  { label: 'Currently Active', value: activeSubscriptions.length, color: 'text-emerald-400' },
                  { label: 'Total Revenue', value: formatCurrency(subscriptionRevenue), color: 'text-amber-400' },
                  { label: 'Avg Paid', value: filteredSubscriptions.length > 0 ? formatCurrency(Math.round(subscriptionRevenue / filteredSubscriptions.length)) : '—', color: 'text-blue-400' },
                ].map(s => (
                  <div key={s.label} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{loadingSubscriptions ? '…' : s.value}</p>
                  </div>
                ))}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search by customer name or café…"
                  value={subscriptionSearch}
                  onChange={e => setSubscriptionSearch(e.target.value)}
                  className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                />
                <select value={subscriptionCafeFilter} onChange={e => setSubscriptionCafeFilter(e.target.value)} className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none">
                  <option value="all">All Cafés</option>
                  {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredSubscriptions.length} result{filteredSubscriptions.length !== 1 ? 's' : ''}
                </div>
                <button onClick={() => {
                  const rows = [['Customer', 'Phone', 'Café', 'Plan', 'Console', 'Amount Paid (₹)', 'Hours Remaining', 'Timer Active', 'Purchase Date']];
                  filteredSubscriptions.forEach((s: any) => rows.push([s.customer_name||'', s.customer_phone||'', s.cafe_name||'', s.membership_plans?.name||'', s.membership_plans?.console_type||'', s.amount_paid||0, s.hours_remaining||0, s.timer_active?'Yes':'No', s.purchase_date||'']));
                  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`subscriptions-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
                }} className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.09] text-slate-300 transition-colors">
                  ↓ Export CSV
                </button>
              </div>

              {/* Table */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
                        <th className={thCls}>Customer</th>
                        <th className={thCls}>Café</th>
                        <th className={thCls}>Plan</th>
                        <th className={thCls}>Console</th>
                        <th className={thCls}>Hours Left</th>
                        <th className={thCls}>Amount Paid</th>
                        <th className={thCls}>Status</th>
                        <th className={thCls}>Purchase Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {loadingSubscriptions ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Loading subscriptions…</td></tr>
                      ) : filteredSubscriptions.length === 0 ? (
                        <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No subscriptions found</td></tr>
                      ) : filteredSubscriptions.map((s: any) => (
                        <tr key={s.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5">
                            <div className="text-sm font-semibold text-white">{s.customer_name || 'Unknown'}</div>
                            {s.customer_phone && <div className="text-xs text-slate-500 mt-0.5">{s.customer_phone}</div>}
                          </td>
                          <td className={tdCls}>{s.cafe_name}</td>
                          <td className="px-4 py-3.5">
                            <div className="text-sm text-slate-300">{s.membership_plans?.name || '—'}</div>
                            <div className="text-xs text-slate-500 mt-0.5 uppercase">{s.membership_plans?.plan_type || ''}</div>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400 uppercase">
                              {s.membership_plans?.console_type || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3.5">
                            <span className={`text-sm font-semibold ${(s.hours_remaining || 0) <= 1 ? 'text-red-400' : (s.hours_remaining || 0) <= 3 ? 'text-amber-400' : 'text-emerald-400'}`}>
                              {s.hours_remaining != null ? `${Number(s.hours_remaining).toFixed(1)}h` : '—'}
                            </span>
                          </td>
                          <td className={`${tdCls} font-semibold text-emerald-400`}>{formatCurrency(s.amount_paid || 0)}</td>
                          <td className="px-4 py-3.5">
                            {s.timer_active
                              ? <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />Active</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/[0.06] text-slate-400">Idle</span>}
                          </td>
                          <td className={tdCls}>{s.purchase_date ? formatDate(s.purchase_date.slice(0, 10)) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ─── SETTINGS TAB ─── */}
          {activeTab === 'settings' && (
            <div className="max-w-2xl space-y-5">
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-6 space-y-5">
                <div>
                  <h3 className="text-base font-semibold text-white">Admin Credentials</h3>
                  <p className="text-xs text-slate-500 mt-1">Update your admin login username and password</p>
                </div>

                {settingsMessage && (
                  <div className={`px-4 py-3 rounded-xl text-sm border ${settingsMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                    {settingsMessage.text}
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">Current Password *</label>
                    <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" />
                  </div>
                  <div className="h-px bg-white/[0.06]" />
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">New Username <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">New Password <span className="text-slate-600 normal-case font-normal">(optional)</span></label>
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-widest">Confirm Password</label>
                    <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-enter new password" disabled={!newPassword} className="w-full px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50 disabled:opacity-40 disabled:cursor-not-allowed" />
                  </div>
                  <button
                    onClick={saveAdminSettings}
                    disabled={savingSettings || !currentPassword}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {savingSettings ? 'Saving…' : 'Save Changes'}
                  </button>
                  <p className="text-xs text-slate-600">* Current password is required to make any changes</p>
                </div>
              </div>

              {/* Platform Info */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Platform Overview</h3>
                  <p className="text-xs text-slate-500 mt-1">Live stats across the entire BookMyGame network</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    { label: 'Total Cafés', value: stats?.totalCafes || 0 },
                    { label: 'Active Cafés', value: stats?.activeCafes || 0 },
                    { label: 'Total Users', value: stats?.totalUsers || 0 },
                    { label: 'Total Bookings', value: stats?.totalBookings || 0 },
                    { label: 'Today Revenue', value: formatCurrency(stats?.todayRevenue || 0) },
                    { label: 'Platform Revenue', value: formatCurrency(stats?.totalRevenue || 0) },
                  ].map(s => (
                    <div key={s.label} className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-4 py-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">{s.label}</p>
                      <p className="text-lg font-bold text-white">{loadingData ? '…' : s.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Danger Zone */}
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-red-400">Danger Zone</h3>
                  <p className="text-xs text-slate-500 mt-1">Destructive admin actions — proceed with extreme caution</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { if (window.confirm('Reload all platform data from database?')) window.location.reload(); }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/[0.06] border border-white/[0.09] text-slate-300 hover:bg-white/[0.09] transition-colors"
                  >
                    <RefreshCw size={14} />Force Full Reload
                  </button>
                  <button
                    onClick={() => { if (window.confirm('Clear all browser caches and reload?')) { localStorage.clear(); sessionStorage.clear(); window.location.reload(); } }}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/15 transition-colors"
                  >
                    <AlertTriangle size={14} />Clear Client Cache
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── OWNER ACCESS TAB ─── */}
          {activeTab === 'owner-access' && (
            <div className="space-y-5 max-w-3xl">
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                <h3 className="text-sm font-semibold text-white mb-1">Authorize Gmail Account</h3>
                <p className="text-xs text-slate-500 mb-4">Add a Google account that can sign in to the owner dashboard. Must be linked to a café.</p>
                <form onSubmit={handleAddOwnerEmail} className="flex flex-wrap gap-3">
                  <input
                    type="email"
                    value={newOwnerEmail}
                    onChange={e => setNewOwnerEmail(e.target.value)}
                    placeholder="owner@gmail.com"
                    required
                    className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                  />
                  <select
                    value={newOwnerCafeId}
                    onChange={e => setNewOwnerCafeId(e.target.value)}
                    required
                    className="flex-1 min-w-[180px] px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                  >
                    <option value="">— Select Café —</option>
                    {cafes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors whitespace-nowrap">
                    + Add Email
                  </button>
                </form>
                {ownerEmailMsg && (
                  <p className={`mt-3 text-xs font-medium ${ownerEmailMsg.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {ownerEmailMsg.type === 'success' ? '✓' : '⚠'} {ownerEmailMsg.text}
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-white">Authorized Accounts</h3>
                </div>
                {ownerEmailsLoading ? (
                  <div className="py-10 text-center text-slate-500 text-sm">Loading…</div>
                ) : ownerEmails.length === 0 ? (
                  <div className="py-10 text-center text-slate-500 text-sm">No authorized emails yet. Add one above.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Gmail Address</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Café</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Status</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {ownerEmails.map(row => (
                        <tr key={row.id} className="hover:bg-white/[0.03] transition-colors">
                          <td className="px-4 py-3.5 text-sm">
                            <div className="flex items-center gap-2">
                              <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                              </svg>
                              <span className="text-slate-200">{row.email}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-400">{(row as any).cafes?.name || row.cafe_id}</td>
                          <td className="px-4 py-3.5 text-sm">
                            {row.active
                              ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Active</span>
                              : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Disabled</span>}
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <button onClick={() => handleDeleteOwnerEmail(row.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors border border-red-500/20">
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
    </div>
  );
}
