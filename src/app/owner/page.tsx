// src/app/owner/page.tsx
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file contains complex React event handlers and UI code where explicit any types
// are used for flexibility. These can be refactored incrementally with proper typing.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fonts, CONSOLE_LABELS, CONSOLE_ICONS, type ConsoleId } from "@/lib/constants";
import { getEndTime } from "@/lib/timeUtils";
import {
  CafeRow,
  BookingRow,
  NavTab,
  PricingTier,
  BillingItem
} from "./types";
import { convertTo12Hour } from "./utils";
import { theme } from "./utils/theme";
import {
  Sidebar,
  DashboardLayout,
  DashboardStats,
  BookingsTable,
  ActiveSessions,
  LiveStatus,
  Billing,
  BookingsManagement,
  Card,
  Memberships,
  Coupons,
  Reports
} from './components';
import Inventory from './components/Inventory';
import AddItemsModal from './components/AddItemsModal';
import ViewOrdersModal from './components/ViewOrdersModal';
import OverviewTab from './components/tabs/OverviewTab';
import SettingsTab from './components/tabs/SettingsTab';
import SessionsTab from './components/tabs/SessionsTab';
import CustomersTab from './components/tabs/CustomersTab';
import OwnerPWAInstaller from './components/OwnerPWAInstaller';
import SubscriptionDetailsModal from './components/SubscriptionDetailsModal';
import CustomerDetailsModal from './components/CustomerDetailsModal';
import { SessionEndedPopup } from './components/SessionEndedPopup';
import StatCard from './components/StatCard';
import { useBilling } from "./hooks/useBilling";
import { useOwnerAuth } from "./hooks/useOwnerAuth";
import { useOwnerData } from "./hooks/useOwnerData";

// Helper function to get local date string (YYYY-MM-DD) instead of UTC
const getLocalDateString = (date: Date = new Date()): string => {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};




export default function OwnerDashboardPage() {
  const router = useRouter();

  const { ownerId, ownerUsername, allowed, checkingRole } = useOwnerAuth();

  const {
    stats,
    cafes,
    bookings,
    loadingData,
    error,
    membershipPlans,
    subscriptions,
    cafeConsoles,
    availableConsoleTypes,
    consolePricing,
    stationPricing,
    totalBookingsCount,
    setSubscriptions,
    setBookings,
    refreshData,
    bookingPage,
    setBookingPage,
    setCafes,
    setStationPricing,
    setConsolePricing
  } = useOwnerData(ownerId, allowed);

  // Constants
  const bookingsPerPage = 50;
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    // Restore active tab from localStorage
    if (typeof window !== 'undefined') {
      const savedTab = localStorage.getItem('ownerActiveTab');
      if (savedTab) {
        return savedTab as NavTab;
      }
    }
    return 'dashboard';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);




  const [viewingSubscription, setViewingSubscription] = useState<any>(null);
  const [subscriptionUsageHistory, setSubscriptionUsageHistory] = useState<any[]>([]);
  const [loadingUsageHistory, setLoadingUsageHistory] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<any>(null);
  const [customerBookings, setCustomerBookings] = useState<any[]>([]);
  const [loadingCustomerData, setLoadingCustomerData] = useState(false);
  const [newSubCustomerName, setNewSubCustomerName] = useState('');
  const [newSubCustomerPhone, setNewSubCustomerPhone] = useState('');
  const [newSubCustomerEmail, setNewSubCustomerEmail] = useState('');
  const [newSubPlanId, setNewSubPlanId] = useState('');
  const [newSubAmountPaid, setNewSubAmountPaid] = useState('');



  // Multi-café support
  const [selectedCafeId, setSelectedCafeId] = useState<string>('');

  // Subscription timer state
  const [activeTimers, setActiveTimers] = useState<Map<string, number>>(new Map()); // Now storing start time (epoch seconds or ms)
  const [timerElapsed, setTimerElapsed] = useState<Map<string, number>>(new Map());

  // Walk-in booking state (for billing tab)


  // Booking filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");
  const [dateRangeFilter, setDateRangeFilter] = useState<string>("all"); // today, week, month, quarter, custom, all
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");



  // Revenue filter for overview
  const [revenueFilter, setRevenueFilter] = useState<string>("today"); // today, week, month, quarter, all

  // Customer tab state
  const [customerSearch, setCustomerSearch] = useState("");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [hasMembership, setHasMembership] = useState(false);
  const [customerSortBy, setCustomerSortBy] = useState<'name' | 'sessions' | 'totalSpent' | 'lastVisit'>('lastVisit');
  const [customerSortOrder, setCustomerSortOrder] = useState<'asc' | 'desc'>('desc');

  // Edit modal state
  const [editingBooking, setEditingBooking] = useState<BookingRow | null>(null);
  const [editingBookingItemId, setEditingBookingItemId] = useState<string | null>(null); // Track specific item for bulk bookings

  // Settings state
  const [settingsChanged, setSettingsChanged] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editedCafe, setEditedCafe] = useState<{
    address: string;
    phone: string;
    email: string;
    description: string;
    opening_time: string;
    closing_time: string;
    google_maps_url: string;
    instagram_url: string;
    price_starts_from: string;
    monitor_details: string;
    processor_details: string;
    gpu_details: string;
    ram_details: string;
    accessories_details: string;
  }>({
    address: '',
    phone: '',
    email: '',
    description: '',
    opening_time: '09:00 AM',
    closing_time: '11:00 PM',
    google_maps_url: '',
    instagram_url: '',
    price_starts_from: '',
    monitor_details: '',
    processor_details: '',
    gpu_details: '',
    ram_details: '',
    accessories_details: '',
  });
  // Add Station modal state
  const [showAddStationModal, setShowAddStationModal] = useState(false);
  const [newStationType, setNewStationType] = useState<string>('ps5');
  const [newStationCount, setNewStationCount] = useState<number>(1);
  const [addingStation, setAddingStation] = useState(false);

  // Delete Station state
  const [stationToDelete, setStationToDelete] = useState<{ name: string, type: string } | null>(null);
  const [deletingStation, setDeletingStation] = useState(false);

  // Station power status (tracks which stations are powered off)
  const [poweredOffStations, setPoweredOffStations] = useState<Set<string>>(new Set());

  // Image upload state
  const [uploadingProfilePhoto, setUploadingProfilePhoto] = useState(false);
  const [uploadingGalleryPhoto, setUploadingGalleryPhoto] = useState(false);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string, image_url: string }>>([]);

  const [editAmount, setEditAmount] = useState<string>("");
  const [editAmountManuallyEdited, setEditAmountManuallyEdited] = useState(false);
  const [editStatus, setEditStatus] = useState<string>("");
  const [editPaymentMethod, setEditPaymentMethod] = useState<string>("");
  const [editCustomerName, setEditCustomerName] = useState<string>("");
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>("");
  const [editDate, setEditDate] = useState<string>("");
  const [editStartTime, setEditStartTime] = useState<string>(""); // Store as "HH:MM" 24-hour format
  const [editDuration, setEditDuration] = useState<number>(60);
  const [editConsole, setEditConsole] = useState<string>("");
  const [editControllers, setEditControllers] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);



  // Add Items Modal state (for F&B items)
  const [addItemsModalOpen, setAddItemsModalOpen] = useState(false);
  const [addItemsBookingId, setAddItemsBookingId] = useState<string>("");
  const [addItemsCustomerName, setAddItemsCustomerName] = useState<string>("");

  // View Orders Modal state (for viewing/removing F&B items)
  const [viewOrdersModalOpen, setViewOrdersModalOpen] = useState(false);
  const [viewOrdersBookingId, setViewOrdersBookingId] = useState<string>("");
  const [viewOrdersCustomerName, setViewOrdersCustomerName] = useState<string>("");

  // Session Ended Popup state
  const [sessionEndedPopupOpen, setSessionEndedPopupOpen] = useState(false);
  const [sessionEndedInfo, setSessionEndedInfo] = useState<{
    customerName: string;
    stationName: string;
    duration: number;
  } | null>(null);

  // Time update trigger for active sessions (updates every second)
  const [currentTime, setCurrentTime] = useState(new Date());

  // Station management state
  const [stationSearch, setStationSearch] = useState("");
  const [stationTypeFilter, setStationTypeFilter] = useState("all");
  const [stationStatusFilter, setStationStatusFilter] = useState("all");
  const [editingStation, setEditingStation] = useState<any>(null);
  const [savingPricing, setSavingPricing] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  // useBilling hook replacing old billing state
  const {
    customerName: billingCustomerName, setCustomerName: setBillingCustomerName,
    customerPhone: billingCustomerPhone, setCustomerPhone: setBillingCustomerPhone,
    bookingDate: billingBookingDate, setBookingDate: setBillingBookingDate,
    startTime: billingStartTime, setStartTime: setBillingStartTime,
    items: billingItems,
    paymentMode: billingPaymentMode, setPaymentMode: setBillingPaymentMode,
    totalAmount: billingTotalAmount,
    isSubmitting: billingSubmitting,
    availableConsoles: billingAvailableConsoles,
    showSuggestions: billingShowSuggestions, setShowSuggestions: setBillingShowSuggestions,
    filteredSuggestions: billingFilteredSuggestions,
    activeSuggestionField: billingActiveSuggestionField,
    addBillingItem,
    removeItem: removeBillingItem,
    updateItem: updateBillingItem,
    handleSubmit: handleBillingSubmit,
    handleNameChange: handleBillingNameChange,
    handlePhoneChange: handleBillingPhoneChange,
    handleSuggestionClick: handleBillingSuggestionClick,
    getBillingPrice
  } = useBilling({
    selectedCafeId,
    consolePricing,
    stationPricing,
    cafeData: cafes.find(c => c.id === selectedCafeId) || cafes[0] || null,
  });


  // Pricing form state
  const [singleHalfHour, setSingleHalfHour] = useState("");
  const [singleFullHour, setSingleFullHour] = useState("");
  const [multiHalfHour, setMultiHalfHour] = useState("");
  const [multiFullHour, setMultiFullHour] = useState("");
  const [halfHour, setHalfHour] = useState("");
  const [fullHour, setFullHour] = useState("");

  // Controller pricing state (for PS5, Xbox)
  const [controller1HalfHour, setController1HalfHour] = useState("");
  const [controller1FullHour, setController1FullHour] = useState("");
  const [controller2HalfHour, setController2HalfHour] = useState("");
  const [controller2FullHour, setController2FullHour] = useState("");
  const [controller3HalfHour, setController3HalfHour] = useState("");
  const [controller3FullHour, setController3FullHour] = useState("");
  const [controller4HalfHour, setController4HalfHour] = useState("");
  const [controller4FullHour, setController4FullHour] = useState("");

  // Controller enable/disable state
  const [enabledControllers, setEnabledControllers] = useState<number[]>([1]); // At least 1 controller enabled

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };

    // Set initial value
    handleResize();

    // Add event listener
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => window.removeEventListener('resize', handleResize);
  }, []);



  // Initialize pricing form when station is selected
  useEffect(() => {
    if (editingStation) {
      const savedPricing = stationPricing[editingStation.name];
      const isGamingConsole = ['PS5', 'PS4', 'Xbox'].includes(editingStation.type);

      if (isGamingConsole) {
        setSingleHalfHour(String(savedPricing?.single_player_half_hour_rate || 75));
        setSingleFullHour(String(savedPricing?.single_player_rate || 150));
        setMultiHalfHour(String(savedPricing?.multi_player_half_hour_rate || 150));
        setMultiFullHour(String(savedPricing?.multi_player_rate || 300));

        // Initialize controller pricing (for PS5, Xbox)
        if (['PS5', 'Xbox'].includes(editingStation.type)) {
          setController1HalfHour(String(savedPricing?.controller_1_half_hour || 75));
          setController1FullHour(String(savedPricing?.controller_1_full_hour || 150));
          setController2HalfHour(String(savedPricing?.controller_2_half_hour || 120));
          setController2FullHour(String(savedPricing?.controller_2_full_hour || 240));
          setController3HalfHour(String(savedPricing?.controller_3_half_hour || 165));
          setController3FullHour(String(savedPricing?.controller_3_full_hour || 330));
          setController4HalfHour(String(savedPricing?.controller_4_half_hour || 210));
          setController4FullHour(String(savedPricing?.controller_4_full_hour || 420));

          // Determine which controllers are enabled based on saved pricing
          const enabled = [1]; // Controller 1 is always enabled
          if (savedPricing?.controller_2_half_hour || savedPricing?.controller_2_full_hour) enabled.push(2);
          if (savedPricing?.controller_3_half_hour || savedPricing?.controller_3_full_hour) enabled.push(3);
          if (savedPricing?.controller_4_half_hour || savedPricing?.controller_4_full_hour) enabled.push(4);
          setEnabledControllers(enabled);
        }
      } else {
        const defaults: Record<string, { half: number, full: number }> = {
          'PC': { half: 50, full: 100 },
          'VR': { half: 100, full: 200 },
          'Steering': { half: 75, full: 150 },
          'Pool': { half: 40, full: 80 },
          'Snooker': { half: 40, full: 80 },
          'Arcade': { half: 40, full: 80 },
        };
        const stationDefaults = defaults[editingStation.type] || { half: 40, full: 80 };
        setHalfHour(String(savedPricing?.half_hour_rate || stationDefaults.half));
        setFullHour(String(savedPricing?.hourly_rate || stationDefaults.full));
      }
    }
  }, [editingStation, stationPricing]);

  // Save active tab to localStorage when it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ownerActiveTab', activeTab);
    }
  }, [activeTab]);

  // Save membership sub-tab to localStorage when it changes


  // Auto-refresh time every second for active sessions (only when sessions tab is active)
  useEffect(() => {
    // Only run timer when viewing sessions, live-status, or dashboard tabs
    if (activeTab !== 'sessions' && activeTab !== 'live-status' && activeTab !== 'dashboard') return;

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab]);

  // Auto-complete expired sessions: runs every second via currentTime
  // Immediately marks expired in-progress sessions as "completed" in DB + local state
  useEffect(() => {
    const now = currentTime;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const expiredBookings = bookings.filter(b => {
      if (b.status !== 'in-progress') return false;
      if (b.booking_date !== todayStr) return false;
      if (!b.start_time || !b.duration) return false;
      const match = b.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!match) return false;
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const period = match[3]?.toLowerCase();
      if (period === 'pm' && hours !== 12) hours += 12;
      else if (period === 'am' && hours === 12) hours = 0;
      return currentMinutes > hours * 60 + minutes + b.duration;
    });

    if (expiredBookings.length === 0) return;

    // Update local state immediately so UI clears right away
    const expiredIds = new Set(expiredBookings.map(b => b.id));
    setBookings(prev => prev.map(b =>
      expiredIds.has(b.id) ? { ...b, status: 'completed' } : b
    ));

    // Persist to DB via API (fire-and-forget)
    expiredBookings.forEach(b => {
      fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id, booking: { status: 'completed' } }),
      }).catch(err => console.error('Failed to auto-complete booking:', err));
    });
  }, [currentTime, bookings]);




  // Populate editedCafe when cafes data loads
  useEffect(() => {
    if (cafes.length > 0) {
      const cafe = cafes[0];
      // Parse opening_hours if it exists (format: "Mon-Sun: 10:00 AM - 11:00 PM")
      let openingTime = '09:00 AM';
      let closingTime = '11:00 PM';

      if (cafe.opening_hours) {
        const timeMatch = cafe.opening_hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
        if (timeMatch) {
          openingTime = timeMatch[1].trim();
          closingTime = timeMatch[2].trim();
        }
      }

      setEditedCafe({
        address: cafe.address || '',
        phone: cafe.phone || '',
        email: cafe.email || '',
        description: cafe.description || '',
        opening_time: openingTime,
        closing_time: closingTime,
        google_maps_url: cafe.google_maps_url || '',
        instagram_url: cafe.instagram_url || '',
        price_starts_from: cafe.price_starts_from?.toString() || '',
        monitor_details: cafe.monitor_details || '',
        processor_details: cafe.processor_details || '',
        gpu_details: cafe.gpu_details || '',
        ram_details: cafe.ram_details || '',
        accessories_details: cafe.accessories_details || '',
      });
    }
  }, [cafes]);

  // Initialize selected café when cafes load
  useEffect(() => {
    if (cafes.length > 0 && !selectedCafeId) {
      setSelectedCafeId(cafes[0].id);
    }
  }, [cafes, selectedCafeId]);

  // Fetch gallery images when cafes data loads
  useEffect(() => {
    async function fetchGalleryImages() {
      if (cafes.length === 0) return;

      const res = await fetch(`/api/owner/gallery?cafeId=${cafes[0].id}`);
      if (!res.ok) {
        console.error('Error fetching gallery images');
        return;
      }
      const { images } = await res.json();
      setGalleryImages(images || []);
    }

    fetchGalleryImages();
  }, [cafes]);

  // Realtime subscription removed — ISP blocks WebSocket to Supabase (ERR_CERT_COMMON_NAME_INVALID)
  // Mutations call refreshData() directly to keep UI in sync

  // Handle confirm booking (pending -> confirmed)
  async function handleConfirmBooking(booking: BookingRow) {
    if (booking.status !== "pending") {
      alert("Only pending bookings can be confirmed");
      return;
    }

    const confirmed = confirm(`Confirm booking for ${booking.customer_name || "customer"}?`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, booking: { status: 'confirmed' } }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert('Failed to confirm booking: ' + (data.error || 'Unknown error'));
        return;
      }
      refreshData();
      alert("Booking confirmed successfully!");
    } catch (err) {
      console.error("Error confirming booking:", err);
      alert("Failed to confirm booking");
    }
  }

  // Handle start booking (confirmed -> in-progress)
  async function handleStartBooking(booking: BookingRow) {
    if (booking.status !== "confirmed") {
      alert("Only confirmed bookings can be started");
      return;
    }

    const confirmed = confirm(`Start session for ${booking.customer_name || "customer"}?`);
    if (!confirmed) return;

    try {
      const currentTime = convertTo12Hour();
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id, booking: { status: 'in-progress', start_time: currentTime } }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert('Failed to start booking: ' + (data.error || 'Unknown error'));
        return;
      }
      refreshData();
      alert("Booking started successfully!");
    } catch (err) {
      console.error("Error starting booking:", err);
      alert("Failed to start booking");
    }
  }

  // Handle edit booking
  const handleBookingStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: id, booking: { status } }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Error updating status:', data.error);
        alert('Failed to update booking status: ' + (data.error || 'Unknown error'));
      } else {
        refreshData();
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update booking status');
    }
  };

  function handleEditBooking(booking: BookingRow) {
    // If this is a flattened booking entry (from bulk booking), find the original booking
    const originalBookingId = (booking as any).originalBookingId;
    const actualBooking = originalBookingId
      ? bookings.find(b => b.id === originalBookingId) || booking
      : booking;

    // Track which specific booking_item is being edited (for bulk bookings)
    // The flattened entry has only one item in booking_items array
    const specificItemId = originalBookingId && booking.booking_items?.[0]?.id
      ? booking.booking_items[0].id
      : null;

    // Allow editing all bookings, not just walk-ins
    console.log('[handleEditBooking] Opening edit modal for booking:', {
      id: actualBooking.id?.slice(0, 8),
      start_time_raw: actualBooking.start_time,
      booking_date: actualBooking.booking_date,
      total_amount: actualBooking.total_amount,
      isFromFlattenedEntry: !!originalBookingId,
      specificItemId: specificItemId,
    });

    setEditingBooking(actualBooking);
    setEditingBookingItemId(specificItemId);
    setEditAmount(actualBooking.total_amount?.toString() || "");
    setEditAmountManuallyEdited(false); // Allow auto-calculation when duration/console changes
    setEditStatus(actualBooking.status || "confirmed");
    setEditPaymentMethod(actualBooking.payment_mode || "cash");
    setEditCustomerName(actualBooking.user_name || actualBooking.customer_name || "");
    setEditCustomerPhone(actualBooking.user_phone || actualBooking.customer_phone || "");
    setEditDate(actualBooking.booking_date || "");
    setEditDuration(actualBooking.duration || 60);
    // Get console and controllers from booking_items
    let consoleType = actualBooking.booking_items?.[0]?.console || "";
    // Map 'steering' to 'steering_wheel' for the dropdown
    if (consoleType === 'steering') {
      consoleType = 'steering_wheel';
    }
    // If no console type, try to get first available console from cafe
    if (!consoleType && cafes.length > 0) {
      const cafe = cafes.find(c => c.id === actualBooking.cafe_id) || cafes[0];
      if (cafe?.ps5_count && cafe.ps5_count > 0) consoleType = 'ps5';
      else if (cafe?.ps4_count && cafe.ps4_count > 0) consoleType = 'ps4';
      else if (cafe?.xbox_count && cafe.xbox_count > 0) consoleType = 'xbox';
      else if (cafe?.pc_count && cafe.pc_count > 0) consoleType = 'pc';
      else if (cafe?.pool_count && cafe.pool_count > 0) consoleType = 'pool';
      else if (cafe?.snooker_count && cafe.snooker_count > 0) consoleType = 'snooker';
      else if (cafe?.arcade_count && cafe.arcade_count > 0) consoleType = 'arcade';
      else if (cafe?.vr_count && cafe.vr_count > 0) consoleType = 'vr';
      else if (cafe?.steering_wheel_count && cafe.steering_wheel_count > 0) consoleType = 'steering_wheel';
      else if ((cafe as any)?.racing_sim_count && (cafe as any).racing_sim_count > 0) consoleType = 'racing_sim';
    }
    const controllers = actualBooking.booking_items?.[0]?.quantity || 1;
    setEditConsole(consoleType);
    setEditControllers(controllers);
    // Parse booking time to 24-hour format for time input
    if (actualBooking.start_time) {
      // Try to parse the time (could be "10:30 am", "10:30 AM", "10:30:00 am", "14:30", etc.)
      const timeMatch = actualBooking.start_time.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
      if (timeMatch) {
        let hour = parseInt(timeMatch[1]);
        const minute = parseInt(timeMatch[2]);
        const period = timeMatch[3]?.toLowerCase();

        // Convert to 24-hour format
        if (period === 'pm' && hour !== 12) hour += 12;
        else if (period === 'am' && hour === 12) hour = 0;

        setEditStartTime(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
      } else {
        // Default to current time if parsing fails
        const now = new Date();
        setEditStartTime(`${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`);
      }
    } else {
      // Default to current time if no start_time
      const now = new Date();
      setEditStartTime(`${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`);
    }
  }

  // Handle save booking
  async function handleSaveBooking() {
    if (!editingBooking) return;

    try {
      setSaving(true);

      console.log('[handleSaveBooking] ===== SAVE BOOKING START =====');
      console.log('[handleSaveBooking] Raw editAmount value:', editAmount, 'Type:', typeof editAmount);
      console.log('[handleSaveBooking] editDuration:', editDuration);
      console.log('[handleSaveBooking] editConsole:', editConsole);
      console.log('[handleSaveBooking] editControllers:', editControllers);

      // Convert 24-hour time (HH:MM) to 12-hour format for DB (e.g., "10:30 am")
      const [hours, minutes] = editStartTime.split(':').map(Number);
      const period = hours >= 12 ? 'pm' : 'am';
      const hours12 = hours % 12 || 12;
      const startTime12h = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;

      const updatedAmount = parseFloat(editAmount);

      // Validate the amount
      if (isNaN(updatedAmount)) {
        console.error('[handleSaveBooking] ERROR: Invalid amount - parseFloat returned NaN from:', editAmount);
        alert('Invalid amount entered. Please enter a valid number.');
        return;
      }

      console.log('[handleSaveBooking] Parsed amount:', updatedAmount);
      console.log('[handleSaveBooking] Booking ID:', editingBooking.id);

      // Update booking via server API route (bypasses ISP block)
      const bookingItemId = editingBooking.booking_items?.[0]?.id;

      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: editingBooking.id,
          bookingItemId: bookingItemId || null,
          booking: {
            total_amount: updatedAmount,
            status: editStatus,
            payment_mode: editPaymentMethod,
            customer_name: editCustomerName,
            customer_phone: editCustomerPhone,
            booking_date: editDate,
            start_time: startTime12h,
            duration: editDuration,
          },
          item: bookingItemId ? {
            console: editConsole,
            quantity: editControllers,
            price: updatedAmount,
          } : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update booking');
      }

      // Update local state immediately for instant UI feedback
      setBookings((prev) =>
        prev.map((b) =>
          b.id === editingBooking.id
            ? {
              ...b,
              total_amount: parseFloat(editAmount),
              status: editStatus,
              payment_mode: editPaymentMethod,
              customer_name: editCustomerName,
              customer_phone: editCustomerPhone,
              user_name: editCustomerName,
              user_phone: editCustomerPhone,
              booking_date: editDate,
              start_time: startTime12h,
              duration: editDuration,
              booking_items: b.booking_items?.map(item => ({
                ...item,
                console: editConsole,
                quantity: editControllers,
                price: parseFloat(editAmount)
              }))
            }
            : b
        )
      );

      console.log('[handleSaveBooking] ✓ Update complete - Local state updated');

      setEditingBooking(null);
      setEditingBookingItemId(null);
      alert("Booking updated successfully!");

      // Force a refresh after 1 second to ensure UI shows updated data from database
      setTimeout(() => {
        console.log('[handleSaveBooking] Triggering delayed refresh to sync with database');
        refreshData();
      }, 1000);
    } catch (err) {
      console.error("Error updating booking:", err);
      alert("Failed to update booking: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBooking() {
    if (!editingBooking) return;

    try {
      setDeletingBooking(true);

      console.log('[handleDeleteBooking] ===== DELETE BOOKING START =====');
      console.log('[handleDeleteBooking] Booking ID:', editingBooking.id);
      console.log('[handleDeleteBooking] Specific item ID:', editingBookingItemId);
      console.log('[handleDeleteBooking] Booking details:', {
        customer: editingBooking.customer_name,
        amount: editingBooking.total_amount,
        date: editingBooking.booking_date,
        source: editingBooking.source,
        user_id: editingBooking.user_id,
        cafe_id: editingBooking.cafe_id,
        totalItems: editingBooking.booking_items?.length || 0
      });

      const allItems = editingBooking.booking_items || [];
      const isPartOfBulkBooking = editingBookingItemId && allItems.length > 1;

      if (isPartOfBulkBooking) {
        // Delete only the specific booking_item, not the whole booking
        const itemToDelete = allItems.find(item => item.id === editingBookingItemId);
        const itemPrice = itemToDelete?.price || 0;
        const newTotalAmount = (editingBooking.total_amount || 0) - itemPrice;

        const res = await fetch('/api/owner/billing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: editingBooking.id,
            specificItemId: editingBookingItemId,
            newTotalAmount,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete booking item');
        }

        // Update local state
        setBookings((prev) => prev.map((b) => {
          if (b.id === editingBooking.id) {
            return {
              ...b,
              booking_items: b.booking_items?.filter(item => item.id !== editingBookingItemId),
              total_amount: newTotalAmount
            };
          }
          return b;
        }));

        alert("Console removed from booking successfully!");
      } else {
        // Delete the entire booking (all items + booking)
        const bookingItemIds = allItems.map(item => item.id);

        const res = await fetch('/api/owner/billing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bookingId: editingBooking.id,
            bookingItemIds,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete booking');
        }

        // Update local state
        setBookings((prev) => prev.filter((b) => b.id !== editingBooking.id));

        alert("Booking deleted successfully!");
      }

      console.log('[handleDeleteBooking] ===== DELETE BOOKING COMPLETE =====');

      setEditingBooking(null);
      setEditingBookingItemId(null);
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error("[handleDeleteBooking] ===== DELETE BOOKING FAILED =====");
      console.error("Error deleting booking:", err);
      alert("Failed to delete booking: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingBooking(false);
    }
  }

  // Subscription timer handlers
  async function handleStartTimer(subscriptionId: string) {
    console.log('[Timer] Starting timer for subscription:', subscriptionId);
    // Don't start if already running
    if (activeTimers.has(subscriptionId)) {
      console.log('[Timer] Timer already running for:', subscriptionId);
      return;
    }

    const startTime = Date.now();
    const startTimeISO = new Date(startTime).toISOString();

    // Get subscription details to find console type
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    if (!subscription) {
      alert('Subscription not found');
      return;
    }

    const consoleType = subscription.membership_plans?.console_type;
    if (!consoleType) {
      alert('Console type not found for this membership');
      return;
    }

    // Find an available console station
    // Get all active subscriptions for this console type
    const activeConsolesForType = subscriptions.filter(s =>
      s.timer_active &&
      s.assigned_console_station &&
      s.membership_plans?.console_type === consoleType
    ).map(s => s.assigned_console_station);

    // Get total console count from cafe
    const cafe = cafes.find(c => c.id === subscription.cafe_id);
    if (!cafe) {
      alert('Cafe not found');
      return;
    }

    // Map console types to cafe count fields
    const consoleCountMap: Record<string, keyof typeof cafe> = {
      'PC': 'pc_count',
      'PS5': 'ps5_count',
      'PS4': 'ps4_count',
      'Xbox': 'xbox_count',
      'Pool': 'pool_count',
      'Snooker': 'snooker_count',
      'Arcade': 'arcade_count',
      'VR': 'vr_count',
      'Steering': 'steering_wheel_count',
      'Racing Sim': 'racing_sim_count'
    };

    const countField = consoleCountMap[consoleType];
    const totalConsoles = countField ? (cafe[countField] as number) || 0 : 0;

    if (totalConsoles === 0) {
      alert(`No ${consoleType} consoles available at this cafe`);
      return;
    }

    // Find first available console station
    let assignedStation: string | null = null;
    const consolePrefix = consoleType.toLowerCase();

    for (let i = 1; i <= totalConsoles; i++) {
      const stationId = `${consolePrefix}-${i.toString().padStart(2, '0')}`;
      if (!activeConsolesForType.includes(stationId)) {
        assignedStation = stationId;
        break;
      }
    }

    if (!assignedStation) {
      alert(`All ${consoleType} consoles are currently occupied`);
      return;
    }

    console.log('[Timer] Assigning console station:', assignedStation);

    // Save timer state and assigned console to database
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          timer_active: true,
          timer_start_time: startTimeISO,
          assigned_console_station: assignedStation,
          updated_at: new Date().toISOString()
        })
        .eq('id', subscriptionId);

      if (error) {
        console.error('[Timer] Failed to save timer state:', error);
        alert('Failed to start timer');
        return;
      }

      // Update local state to reflect timer is active
      setSubscriptions(prev => prev.map(s =>
        s.id === subscriptionId
          ? { ...s, timer_active: true, timer_start_time: startTimeISO, assigned_console_station: assignedStation }
          : s
      ));
    } catch (err) {
      console.error('[Timer] Exception saving timer state:', err);
      alert('Failed to start timer');
      return;
    }

    // Set local timer state
    setActiveTimers(prev => new Map(prev).set(subscriptionId, startTime));
    console.log('[Timer] Timer started successfully');
  }

  async function handleStopTimer(subscriptionId: string) {
    console.log('[Timer] Stopping timer for subscription:', subscriptionId);
    const startTime = activeTimers.get(subscriptionId);
    if (!startTime) {
      console.log('[Timer] No timer found for:', subscriptionId);
      return;
    }

    // Calculate total elapsed time in hours
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000); // Calculate directly from start time
    const elapsedHours = elapsedSeconds / 3600; // convert seconds to hours
    console.log('[Timer] Elapsed:', elapsedSeconds, 'seconds =', elapsedHours.toFixed(4), 'hours');

    // Update subscription hours in database
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    if (subscription) {
      const newHoursRemaining = Math.max(0, (subscription.hours_remaining || 0) - elapsedHours);
      console.log('[Timer] Updating hours:', subscription.hours_remaining, '->', newHoursRemaining);

      try {
        const { error } = await supabase
          .from('subscriptions')
          .update({
            hours_remaining: newHoursRemaining,
            timer_active: false,
            timer_start_time: null,
            assigned_console_station: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', subscriptionId);

        if (error) {
          console.error('[Timer] Database error:', error);
          alert('Failed to update subscription hours');
          return;
        }

        console.log('[Timer] Database updated successfully');

        // Save usage history
        const endTime = new Date();
        const startTimeDate = new Date(startTime);

        const { error: historyError } = await supabase
          .from('subscription_usage_history')
          .insert({
            subscription_id: subscriptionId,
            session_date: getLocalDateString(),
            start_time: startTimeDate.toISOString(),
            end_time: endTime.toISOString(),
            duration_hours: elapsedHours,
            assigned_console_station: subscription.assigned_console_station
          });

        if (historyError) {
          console.error('[Timer] Failed to save usage history:', historyError);
          // Don't fail the entire operation if history save fails
        }

        // Update local state
        setSubscriptions(prev => prev.map(s =>
          s.id === subscriptionId
            ? { ...s, hours_remaining: newHoursRemaining, timer_active: false, timer_start_time: null, assigned_console_station: null }
            : s
        ));

        // Clear timer state
        setActiveTimers(prev => {
          const newMap = new Map(prev);
          newMap.delete(subscriptionId);
          return newMap;
        });

        setTimerElapsed(prev => {
          const newMap = new Map(prev);
          newMap.delete(subscriptionId);
          return newMap;
        });

        console.log('[Timer] Timer stopped successfully');
        const hours = Math.floor(elapsedHours);
        const minutes = Math.floor((elapsedHours - hours) * 60);
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        alert(`Session ended. ${timeStr} deducted from subscription.`);
      } catch (err) {
        console.error('[Timer] Exception:', err);
        alert('Failed to stop timer');
      }
    } else {
      console.error('[Timer] Subscription not found:', subscriptionId);
    }
  }

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      // No longer need to clear individual intervals, as there's one global interval
      // The new timer effect handles its own cleanup
    };
  }, []); // Empty dependency array means this runs once on mount and cleanup on unmount

  // Timer effect to update elapsed time
  useEffect(() => {
    if (activeTimers.size === 0) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      setTimerElapsed(prev => {
        const newMap = new Map(prev);
        activeTimers.forEach((start, id) => {
          newMap.set(id, Math.floor((now - start) / 1000));
        });
        return newMap;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [activeTimers]);

  // Restore active timers from database on mount or when subscriptions change
  useEffect(() => {
    console.log('[Timer] Checking for active timers to restore...');
    subscriptions.forEach(subscription => {
      // Check if this subscription has an active timer in the database
      if (subscription.timer_active && subscription.timer_start_time && !activeTimers.has(subscription.id)) {
        console.log('[Timer] Restoring timer for subscription:', subscription.id);

        const dbStartTime = new Date(subscription.timer_start_time).getTime();

        // Add to active timers
        setActiveTimers(prev => new Map(prev).set(subscription.id, dbStartTime));

        console.log('[Timer] Timer restored.');
      }
    });
  }, [subscriptions, activeTimers]); // Run when subscriptions are loaded/updated

  // Fetch usage history when viewing a subscription
  useEffect(() => {
    async function fetchUsageHistory() {
      if (!viewingSubscription) {
        setSubscriptionUsageHistory([]);
        return;
      }

      console.log('[UsageHistory] Fetching usage history for subscription:', viewingSubscription.id);
      setLoadingUsageHistory(true);
      const { data, error } = await supabase
        .from('subscription_usage_history')
        .select('*')
        .eq('subscription_id', viewingSubscription.id)
        .order('session_date', { ascending: false });

      if (error) {
        console.error('[UsageHistory] Error fetching usage history:', error);
        setSubscriptionUsageHistory([]);
      } else {
        console.log('[UsageHistory] Fetched usage history:', data);
        setSubscriptionUsageHistory(data || []);
      }
      setLoadingUsageHistory(false);
    }
    fetchUsageHistory();
  }, [viewingSubscription]);

  // Auto-complete expired bookings client-side (avoids relying on server cron)
  useEffect(() => {
    const now = currentTime;
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayStr = getLocalDateString(now);

    const expiredBookings = bookings.filter((b: any) => {
      if (b.status !== 'in-progress') return false;
      if (b.booking_date !== todayStr) return false;
      if (!b.start_time || !b.duration) return false;

      const timeParts = b.start_time.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
      if (!timeParts) return false;

      let hours = parseInt(timeParts[1]);
      const minutes = parseInt(timeParts[2]);
      const period = timeParts[3];

      if (period) {
        if (period.toLowerCase() === 'pm' && hours !== 12) hours += 12;
        else if (period.toLowerCase() === 'am' && hours === 12) hours = 0;
      }

      const endMinutes = hours * 60 + minutes + b.duration;
      return currentMinutes >= endMinutes;
    });

    if (expiredBookings.length === 0) return;

    const expiredIds = new Set(expiredBookings.map((b: any) => b.id));

    // Immediately update local state so they disappear from Active Sessions
    setBookings((prev: any[]) =>
      prev.map((b: any) => expiredIds.has(b.id) ? { ...b, status: 'completed' } : b)
    );

    // Persist to DB
    expiredBookings.forEach((b: any) => {
      fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: b.id, booking: { status: 'completed' } }),
      }).catch((err: any) => console.error('Failed to auto-complete booking:', err));
    });
  }, [currentTime]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch customer data when viewing a customer
  useEffect(() => {
    async function fetchCustomerData() {
      if (!viewingCustomer || !selectedCafeId) {
        setCustomerBookings([]);
        return;
      }

      if (!viewingCustomer.phone) {
        console.log('No phone number for customer:', viewingCustomer);
        setCustomerBookings([]);
        setLoadingCustomerData(false);
        return;
      }

      setLoadingCustomerData(true);

      console.log('Fetching bookings for phone:', viewingCustomer.phone, 'cafe:', selectedCafeId);

      // Fetch all bookings for this customer (by phone number)
      // Walk-in bookings have customer_phone filled
      // For now, just get walk-in bookings - online bookings need user_id lookup
      const { data, error } = await supabase
        .from('bookings')
        .select('id, booking_date, start_time, duration, total_amount, status, source, created_at, customer_name')
        .eq('cafe_id', selectedCafeId)
        .eq('customer_phone', viewingCustomer.phone)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) {
        console.error('Error fetching bookings:', error.message, error);
        setCustomerBookings([]);
      } else {
        console.log('Successfully fetched bookings:', data?.length || 0, 'bookings');
        setCustomerBookings(data || []);
      }
      setLoadingCustomerData(false);
    }
    fetchCustomerData();
  }, [viewingCustomer, selectedCafeId]);

  const handleViewCustomer = (customer: { name: string; phone?: string | null; email?: string | null }) => {
    // Try to find active subscription
    const activeSub = customer.phone ? subscriptions.find(s =>
      (s.customer_phone === customer.phone || s.user?.phone === customer.phone) &&
      s.status === 'active' &&
      new Date(s.end_date) > new Date()
    ) : null;

    setViewingCustomer({
      ...customer,
      activeSubscription: activeSub
    });
  };

  // Walk-in booking handlers (for billing tab)
  const consoleOptions: { id: ConsoleId; label: string; icon: string }[] = [
    { id: "ps5", label: CONSOLE_LABELS.ps5, icon: CONSOLE_ICONS.ps5 },
    { id: "ps4", label: CONSOLE_LABELS.ps4, icon: CONSOLE_ICONS.ps4 },
    { id: "xbox", label: CONSOLE_LABELS.xbox, icon: CONSOLE_ICONS.xbox },
    { id: "pc", label: CONSOLE_LABELS.pc, icon: CONSOLE_ICONS.pc },
    { id: "pool", label: CONSOLE_LABELS.pool, icon: CONSOLE_ICONS.pool },
    { id: "snooker", label: CONSOLE_LABELS.snooker, icon: CONSOLE_ICONS.snooker },
    { id: "arcade", label: CONSOLE_LABELS.arcade, icon: CONSOLE_ICONS.arcade },
    { id: "vr", label: CONSOLE_LABELS.vr, icon: CONSOLE_ICONS.vr },
    { id: "steering", label: CONSOLE_LABELS.steering, icon: CONSOLE_ICONS.steering },
  ];



  // Auto-update billing time and date in real-time when billing tab is active
  useEffect(() => {
    if (activeTab !== 'billing') return;

    // Update immediately when tab is selected
    const updateTime = () => {
      const now = new Date();
      setBillingStartTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
      setBillingBookingDate(getLocalDateString(now));
    };

    updateTime();

    // Update every 10 seconds while on billing tab
    const interval = setInterval(updateTime, 10000);

    return () => clearInterval(interval);
  }, [activeTab, setBillingStartTime, setBillingBookingDate]);

  // Auto-calculate amount when duration, console, or controllers change in edit modal
  // Only auto-calculate if user hasn't manually edited the amount
  useEffect(() => {
    if (!editingBooking || !editDuration || !editConsole) return;
    if (editAmountManuallyEdited) return; // Don't auto-calculate if manually edited

    const cafeId = editingBooking.cafe_id;
    if (!cafeId) return;

    const calculatePrice = () => {
      // Get tier pricing for this cafe and console
      const cafePricing = consolePricing[cafeId];
      const baseHourlyRate = cafes.find(c => c.id === cafeId)?.hourly_price || 100;

      // Map console type if needed (e.g. steering -> steering_wheel)
      const dbConsole = editConsole === 'steering' ? 'steering_wheel' : editConsole;

      // Per-station console types (pricing is per station, not per controller group)
      const perStationTypes = ['pc', 'vr', 'steering_wheel', 'steering', 'arcade'];
      const isPerStation = perStationTypes.includes(editConsole.toLowerCase()) || perStationTypes.includes(dbConsole.toLowerCase());

      // Try to get tier-based pricing
      if (cafePricing && cafePricing[dbConsole]) {
        const tier = cafePricing[dbConsole];

        // Helper to get price for a specific duration and quantity
        const getBasePrice = (qty: number, durationMins: number): number | null => {
          const key = `qty${qty}_${durationMins}min`;
          if (tier[key] !== null && tier[key] !== undefined) {
            return tier[key];
          }
          // For per-station types, multiply qty1 price by quantity
          if (isPerStation && qty > 1) {
            const baseKey = `qty1_${durationMins}min`;
            if (tier[baseKey] !== null && tier[baseKey] !== undefined) {
              return tier[baseKey] * qty;
            }
          }
          return null;
        };

        // Direct lookup for 30 or 60 min
        if (editDuration === 30 || editDuration === 60) {
          const price = getBasePrice(editControllers, editDuration);
          if (price !== null) return price;
        }
        // 90 min = 60 + 30
        else if (editDuration === 90) {
          const p60 = getBasePrice(editControllers, 60);
          const p30 = getBasePrice(editControllers, 30);
          if (p60 !== null && p30 !== null) return p60 + p30;
        }
        // 120 min = 60 * 2
        else if (editDuration === 120) {
          const p60 = getBasePrice(editControllers, 60);
          if (p60 !== null) return p60 * 2;
        }
        // 150 min = 60 * 2 + 30
        else if (editDuration === 150) {
          const p60 = getBasePrice(editControllers, 60);
          const p30 = getBasePrice(editControllers, 30);
          if (p60 !== null && p30 !== null) return (p60 * 2) + p30;
        }
        // 180 min = 60 * 3
        else if (editDuration === 180) {
          const p60 = getBasePrice(editControllers, 60);
          if (p60 !== null) return p60 * 3;
        }
        // 210 min = 60 * 3 + 30
        else if (editDuration === 210) {
          const p60 = getBasePrice(editControllers, 60);
          const p30 = getBasePrice(editControllers, 30);
          if (p60 !== null && p30 !== null) return (p60 * 3) + p30;
        }
        // 240 min = 60 * 4
        else if (editDuration === 240) {
          const p60 = getBasePrice(editControllers, 60);
          if (p60 !== null) return p60 * 4;
        }
        // 270 min = 60 * 4 + 30
        else if (editDuration === 270) {
          const p60 = getBasePrice(editControllers, 60);
          const p30 = getBasePrice(editControllers, 30);
          if (p60 !== null && p30 !== null) return (p60 * 4) + p30;
        }
        // 300 min = 60 * 5
        else if (editDuration === 300) {
          const p60 = getBasePrice(editControllers, 60);
          if (p60 !== null) return p60 * 5;
        }
      }

      // Fallback to calculation based on hourly rate
      const durationMultiplier = editDuration / 60;
      return Math.round(baseHourlyRate * editControllers * durationMultiplier);
    };

    const newAmount = calculatePrice();
    setEditAmount(newAmount.toString());
  }, [editDuration, editConsole, editControllers, editingBooking, cafes, consolePricing, editAmountManuallyEdited]);

  // Handle settings save
  const handleSaveSettings = async () => {
    if (cafes.length === 0) return;

    setSavingSettings(true);
    try {
      // Combine opening and closing time into opening_hours format
      const opening_hours = `Mon-Sun: ${editedCafe.opening_time} - ${editedCafe.closing_time}`;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cafeId: cafes[0].id,
          updates: {
            address: editedCafe.address,
            phone: editedCafe.phone,
            email: editedCafe.email,
            description: editedCafe.description,
            opening_hours: opening_hours,
            google_maps_url: editedCafe.google_maps_url || null,
            instagram_url: editedCafe.instagram_url || null,
            price_starts_from: editedCafe.price_starts_from ? parseInt(editedCafe.price_starts_from) : null,
            monitor_details: editedCafe.monitor_details || null,
            processor_details: editedCafe.processor_details || null,
            gpu_details: editedCafe.gpu_details || null,
            ram_details: editedCafe.ram_details || null,
            accessories_details: editedCafe.accessories_details || null,
          },
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to save settings'); }

      // Update local state
      setCafes(prev => prev.map((c, i) => i === 0 ? {
        ...c,
        address: editedCafe.address,
        phone: editedCafe.phone,
        email: editedCafe.email,
        description: editedCafe.description,
        opening_hours: opening_hours,
        google_maps_url: editedCafe.google_maps_url || null,
        instagram_url: editedCafe.instagram_url || null,
        price_starts_from: editedCafe.price_starts_from ? parseInt(editedCafe.price_starts_from) : null,
        monitor_details: editedCafe.monitor_details || null,
        processor_details: editedCafe.processor_details || null,
        gpu_details: editedCafe.gpu_details || null,
        ram_details: editedCafe.ram_details || null,
        accessories_details: editedCafe.accessories_details || null,
      } : c));

      setSettingsChanged(false);
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Failed to save settings. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle add new station
  const handleAddStation = async () => {
    if (cafes.length === 0 || newStationCount < 1) return;

    setAddingStation(true);
    try {
      const columnName = `${newStationType}_count`;
      const currentCount = (cafes[0] as any)[columnName] || 0;
      const newCount = currentCount + newStationCount;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: cafes[0].id, updates: { [columnName]: newCount } }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add station'); }

      // Update local state
      setCafes(prev => prev.map((c, i) => i === 0 ? {
        ...c,
        [columnName]: newCount,
      } : c));

      setShowAddStationModal(false);
      alert(`Successfully added ${newStationCount} ${newStationType.toUpperCase()} station(s)!`);

      // Trigger a refresh to update the stations list
      refreshData();
    } catch (error) {
      console.error('Error adding station:', error);
      alert('Failed to add station. Please try again.');
    } finally {
      setAddingStation(false);
    }
  };

  // Handle toggle station power
  const handleTogglePower = (stationName: string) => {
    setPoweredOffStations(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stationName)) {
        newSet.delete(stationName);
      } else {
        newSet.add(stationName);
      }
      return newSet;
    });
  };

  // Handle profile photo upload
  const handleProfilePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || cafes.length === 0) return;

    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${cafes[0].id}/profile-${Date.now()}.${fileExt}`;

    setUploadingProfilePhoto(true);
    try {
      // Delete old profile photo if exists
      if (cafes[0].cover_url) {
        const oldPath = cafes[0].cover_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('cafe_images').remove([`${cafes[0].id}/${oldPath}`]);
        }
      }

      // Upload new photo
      const { error: uploadError } = await supabase.storage
        .from('cafe_images')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cafe_images')
        .getPublicUrl(fileName);

      // Update database via API
      const updateRes = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: cafes[0].id, updates: { cover_url: publicUrl } }),
      });
      if (!updateRes.ok) { const d = await updateRes.json(); throw new Error(d.error || 'Failed to update photo'); }

      // Update local state
      setCafes(prev => prev.map((c, i) => i === 0 ? { ...c, cover_url: publicUrl } : c));
      alert('Profile photo updated successfully!');
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      alert('Failed to upload profile photo. Please try again.');
    } finally {
      setUploadingProfilePhoto(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle profile photo delete
  const handleProfilePhotoDelete = async () => {
    if (cafes.length === 0 || !cafes[0].cover_url) return;

    if (!confirm('Are you sure you want to delete the profile photo?')) return;

    try {
      const oldPath = cafes[0].cover_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('cafe_images').remove([`${cafes[0].id}/${oldPath}`]);
      }

      // Update database via API
      const delRes = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: cafes[0].id, updates: { cover_url: null } }),
      });
      if (!delRes.ok) { const d = await delRes.json(); throw new Error(d.error || 'Failed to delete photo'); }

      // Update local state
      setCafes(prev => prev.map((c, i) => i === 0 ? { ...c, cover_url: null } : c));
      alert('Profile photo deleted successfully!');
    } catch (error) {
      console.error('Error deleting profile photo:', error);
      alert('Failed to delete profile photo. Please try again.');
    }
  };

  // Handle gallery photo upload
  const handleGalleryPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || cafes.length === 0) return;

    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${cafes[0].id}/gallery-${Date.now()}.${fileExt}`;

    setUploadingGalleryPhoto(true);
    try {
      // Upload photo
      const { error: uploadError } = await supabase.storage
        .from('cafe_images')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('cafe_images')
        .getPublicUrl(fileName);

      // Insert into gallery_images via API
      const galleryRes = await fetch('/api/owner/gallery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: cafes[0].id, imageUrl: publicUrl }),
      });
      if (!galleryRes.ok) { const d = await galleryRes.json(); throw new Error(d.error || 'Failed to save gallery image'); }
      const { image } = await galleryRes.json();

      // Update local state
      if (image) {
        setGalleryImages(prev => [image, ...prev]);
      }
      alert('Gallery photo added successfully!');
    } catch (error) {
      console.error('Error uploading gallery photo:', error);
      alert('Failed to upload gallery photo. Please try again.');
    } finally {
      setUploadingGalleryPhoto(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle gallery photo delete
  const handleGalleryPhotoDelete = async (imageId: string, imageUrl: string) => {
    if (!confirm('Are you sure you want to delete this gallery photo?')) return;

    try {
      const fileName = imageUrl.split('/').slice(-2).join('/');

      // Delete from storage
      await supabase.storage.from('cafe_images').remove([fileName]);

      // Delete from database via API
      const delGalleryRes = await fetch('/api/owner/gallery', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageId }),
      });
      if (!delGalleryRes.ok) { const d = await delGalleryRes.json(); throw new Error(d.error || 'Failed to delete gallery image'); }

      // Update local state
      setGalleryImages(prev => prev.filter(img => img.id !== imageId));
      alert('Gallery photo deleted successfully!');
    } catch (error) {
      console.error('Error deleting gallery photo:', error);
      alert('Failed to delete gallery photo. Please try again.');
    }
  };

  // Handle delete station
  const handleDeleteStation = async () => {
    if (!stationToDelete || cafes.length === 0) return;

    setDeletingStation(true);
    try {
      // Map station type to column name (e.g., "PS5" -> "ps5_count")
      const columnName = `${stationToDelete.type.toLowerCase().replace(/\s+/g, '_')}_count`;
      const currentCount = (cafes[0] as any)[columnName] || 0;

      if (currentCount <= 0) {
        alert('No stations to delete');
        setStationToDelete(null);
        return;
      }

      const newCount = currentCount - 1;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: cafes[0].id, updates: { [columnName]: newCount } }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete station'); }

      // Update local state
      setCafes(prev => prev.map((c, i) => i === 0 ? {
        ...c,
        [columnName]: newCount,
      } : c));

      setStationToDelete(null);
      alert(`Successfully deleted ${stationToDelete.name}!`);

      // Trigger a refresh to update the stations list
      refreshData();
    } catch (error) {
      console.error('Error deleting station:', error);
      alert('Failed to delete station. Please try again.');
    } finally {
      setDeletingStation(false);
    }
  };

  // Filter bookings
  const filteredBookings = bookings.filter((booking) => {
    // Status filter
    if (statusFilter !== "all" && booking.status?.toLowerCase() !== statusFilter) {
      return false;
    }

    // Specific date filter (for date picker)
    if (dateFilter && booking.booking_date) {
      if (booking.booking_date !== dateFilter) return false;
    }

    // Date Range filter
    if (dateRangeFilter !== "all" && booking.booking_date) {
      const bookingDate = new Date(booking.booking_date + 'T00:00:00');
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      if (dateRangeFilter === "today") {
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        if (bookingDate < todayStart || bookingDate > todayEnd) return false;
      } else if (dateRangeFilter === "week") {
        const weekAgo = new Date(todayStart);
        weekAgo.setDate(todayStart.getDate() - 7);
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        if (bookingDate < weekAgo || bookingDate > todayEnd) return false;
      } else if (dateRangeFilter === "month") {
        const monthAgo = new Date(todayStart);
        monthAgo.setMonth(todayStart.getMonth() - 1);
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        if (bookingDate < monthAgo || bookingDate > todayEnd) return false;
      } else if (dateRangeFilter === "quarter") {
        const quarterAgo = new Date(todayStart);
        quarterAgo.setMonth(todayStart.getMonth() - 3);
        const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);
        if (bookingDate < quarterAgo || bookingDate > todayEnd) return false;
      } else if (dateRangeFilter === "custom") {
        if (customStartDate) {
          const startDate = new Date(customStartDate + 'T00:00:00');
          if (bookingDate < startDate) return false;
        }
        if (customEndDate) {
          const endDate = new Date(customEndDate + 'T23:59:59');
          if (bookingDate > endDate) return false;
        }
      }
    }

    // Search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesId = booking.id.toLowerCase().includes(query);
      const matchesName = (booking.customer_name || booking.user_name || "").toLowerCase().includes(query);
      const matchesEmail = (booking.user_email || "").toLowerCase().includes(query);
      const matchesPhone = (booking.customer_phone || booking.user_phone || "").toLowerCase().includes(query);
      if (!matchesId && !matchesName && !matchesEmail && !matchesPhone) {
        return false;
      }
    }

    return true;
  });

  // Flatten filtered bookings so each booking_item appears as a separate row
  // This handles bulk bookings where one booking has multiple consoles
  const flattenedFilteredBookings = filteredBookings.flatMap(booking => {
    const items = booking.booking_items || [];
    if (items.length <= 1) {
      // Single item or no items - keep as is
      return [booking];
    }
    // Multiple items - create a separate entry for each
    return items.map((item, itemIndex) => ({
      ...booking,
      // Create a unique ID for each flattened entry
      id: `${booking.id}-item-${itemIndex}`,
      originalBookingId: booking.id,
      // Replace booking_items with just this single item
      booking_items: [item],
      // Use item price for display
      total_amount: item.price || (booking.total_amount || 0) / items.length,
    }));
  });

  // Loading state
  if (checkingRole) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#020617",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#f8fafc",
        }}
      >
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  // Dark theme colors


  // Navigation items
  const navItems: { id: NavTab; label: string; icon: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
    { id: 'live-status', label: 'Live Status', icon: '📡' },
    { id: 'billing', label: 'Billing', icon: '💳' },
    { id: 'bookings', label: 'Bookings', icon: '📅' },
    { id: 'customers', label: 'Customers', icon: '👥' },
    { id: 'stations', label: 'Stations', icon: '🖥️' },
    { id: 'memberships', label: 'Memberships', icon: '🎫' },
    { id: 'coupons', label: 'Coupons', icon: '🎟️' },
    { id: 'inventory', label: 'Inventory', icon: '🍿' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        onTabChange={(tab: string) => setActiveTab(tab as NavTab)}
        cafeName={cafes.length > 0 ? cafes[0].name || "Your Café" : "Loading..."}
        isMobile={isMobile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        title="Dashboard"
      >
        <div>
          {error && (
            <div
              style={{
                padding: "16px 20px",
                borderRadius: 12,
                background: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "#ef4444",
                marginBottom: 24,
                fontSize: 14,
              }}
            >
              {error}
            </div>
          )}

          {/* Dashboard Tab - New Design */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Top Stats Cards */}
              <DashboardStats
                bookings={bookings}
                subscriptions={subscriptions}
                activeTimers={activeTimers}
                loadingData={loadingData}
                isMobile={isMobile}
              />

              {/* Active Consoles Section - Only show occupied consoles */}
              <div style={{ marginTop: isMobile ? 20 : 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h2
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      color: theme.textPrimary,
                      margin: 0,
                    }}
                  >
                    Active Sessions
                  </h2>
                </div>

                {/* Show only in-progress bookings and active memberships */}
                <ActiveSessions
                  bookings={bookings}
                  subscriptions={subscriptions}
                  activeTimers={activeTimers}
                  timerElapsed={timerElapsed}
                  currentTime={currentTime}
                  isMobile={isMobile}
                  onAddItems={(bookingId, customerName) => {
                    setAddItemsBookingId(bookingId);
                    setAddItemsCustomerName(customerName);
                    setAddItemsModalOpen(true);
                  }}
                  onSessionEnded={(info) => {
                    setSessionEndedInfo(info);
                    setSessionEndedPopupOpen(true);
                    // Refresh data so the server auto-completes the session status
                    refreshData();
                  }}
                />
              </div>

              <div style={{ marginTop: isMobile ? 20 : 24 }}>
                <BookingsTable
                  title="Today's Bookings"
                  bookings={bookings.filter((b: any) => b.booking_date === getLocalDateString())}
                  loading={loadingData}
                  onViewAll={() => setActiveTab('bookings')}
                  onStatusChange={handleBookingStatusChange}
                  onEdit={handleEditBooking}
                  onViewOrders={(bookingId, customerName) => {
                    setViewOrdersBookingId(bookingId);
                    setViewOrdersCustomerName(customerName);
                    setViewOrdersModalOpen(true);
                  }}
                />
              </div>

              {/* Weekly Bookings Section */}
              <div style={{ marginTop: isMobile ? 24 : 40 }}>
                {(() => {
                  const today = new Date();
                  const lastWeek = new Date(today);
                  lastWeek.setDate(today.getDate() - 7);
                  const lastWeekStr = getLocalDateString(lastWeek);
                  const todayStr = getLocalDateString(today);

                  const weeklyBookings = bookings.filter((b: any) => {
                    const bDate = b.booking_date;
                    return bDate >= lastWeekStr && bDate <= todayStr;
                  });

                  const weeklyRevenue = weeklyBookings.reduce((sum: number, b: any) => sum + (b.total_amount || 0), 0);

                  return (
                    <BookingsTable
                      title={`Last 7 Days (₹${weeklyRevenue})`}
                      bookings={weeklyBookings}
                      loading={loadingData}
                      limit={10}
                      showActions={false}
                      onViewAll={() => setActiveTab('bookings')}
                    />
                  );
                })()}
              </div>
            </div>
          )}

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <OverviewTab
              isMobile={isMobile}
              theme={theme}
              fonts={fonts}
              loadingData={loadingData}
              cafes={cafes}
              stats={stats}
              revenueFilter={revenueFilter}
              setRevenueFilter={setRevenueFilter}
              bookings={bookings}
              setActiveTab={(tab: string) => setActiveTab(tab as NavTab)}
            />
          )}
          {activeTab === 'live-status' && cafes.length > 0 && (
            <div>
              {/* Café Selector (only show if multiple cafés) */}
              {cafes.length > 1 && (
                <div style={{
                  marginBottom: 24,
                  background: theme.cardBackground,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: 16,
                }}>
                  <label style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: theme.textMuted,
                    display: 'block',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Select Café
                  </label>
                  <select
                    value={selectedCafeId}
                    onChange={(e) => setSelectedCafeId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      background: theme.background,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      color: theme.textPrimary,
                      fontSize: 15,
                      fontWeight: 500,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {cafes.map(cafe => (
                      <option key={cafe.id} value={cafe.id}>
                        {cafe.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <LiveStatus cafeId={selectedCafeId || cafes[0].id} isMobile={isMobile} />
            </div>
          )}

          {activeTab === 'live-status' && cafes.length === 0 && (
            <div style={{
              padding: "60px 20px",
              textAlign: "center",
              background: theme.cardBackground,
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ fontSize: "64px", marginBottom: "16px" }}>🏪</div>
              <h3 style={{
                fontFamily: fonts.heading,
                fontSize: "20px",
                color: theme.textPrimary,
                marginBottom: "8px"
              }}>
                No Café Found
              </h3>
              <p style={{ fontSize: "14px", color: theme.textSecondary, marginBottom: "24px" }}>
                Please add a café first to view live console status
              </p>
              <button
                onClick={() => setActiveTab('cafe-details')}
                style={{
                  padding: "12px 24px",
                  background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  border: "none",
                  borderRadius: "10px",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: fonts.body,
                }}
              >
                Add Café →
              </button>
            </div>
          )}

          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <BookingsManagement
              bookings={bookings}
              loading={loadingData}
              onUpdateStatus={handleBookingStatusChange}
              onEdit={handleEditBooking}
              onRefresh={() => refreshData()}
              isMobile={isMobile}
              onViewOrders={(bookingId, customerName) => {
                setViewOrdersBookingId(bookingId);
                setViewOrdersCustomerName(customerName);
                setViewOrdersModalOpen(true);
              }}
              onViewCustomer={handleViewCustomer}
            />
          )}

          {/* Cafe Details Tab */}
          {activeTab === 'cafe-details' && (
            <div>
              {cafes.length === 0 ? (
                <div
                  style={{
                    background: theme.cardBackground,
                    borderRadius: 16,
                    border: `1px solid ${theme.border}`,
                    padding: "60px 20px",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🏪</div>
                  <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 8, fontWeight: 500 }}>
                    No café found
                  </p>
                  <p style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>
                    Contact admin to set up your café.
                  </p>
                </div>
              ) : (
                <div
                  style={{
                    background: "linear-gradient(135deg, rgba(30,41,59,0.8), rgba(15,23,42,0.9))",
                    borderRadius: 16,
                    border: `1px solid rgba(71, 85, 105, 0.3)`,
                    padding: "32px",
                    maxWidth: 800,
                    margin: "0 auto",
                  }}
                >
                  {/* Cafe Header */}
                  <div style={{ marginBottom: 32, textAlign: "center" }}>
                    <div style={{
                      fontSize: 48,
                      marginBottom: 16,
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      width: 80,
                      height: 80,
                      borderRadius: 20,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      margin: "0 auto 16px",
                    }}>
                      🏪
                    </div>
                    <h2 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: theme.textPrimary }}>
                      {cafes[0].name || "Your Gaming Café"}
                    </h2>
                    {cafes[0].address && (
                      <div style={{ fontSize: 15, color: theme.textSecondary, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                        <span>📍</span>
                        {cafes[0].address}
                      </div>
                    )}
                  </div>

                  {/* Café Description */}
                  {cafes[0].description && (
                    <div style={{
                      fontSize: 14,
                      color: theme.textSecondary,
                      lineHeight: 1.6,
                      marginBottom: 32,
                      padding: "20px",
                      background: "rgba(15,23,42,0.5)",
                      borderRadius: 12,
                      border: `1px solid ${theme.border}`,
                    }}>
                      {cafes[0].description}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => router.push(`/owner/cafes/${cafes[0].id}`)}
                    style={{
                      width: "100%",
                      padding: "18px 32px",
                      borderRadius: 12,
                      border: "none",
                      background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                      color: "#fff",
                      fontSize: 16,
                      fontWeight: 600,
                      cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(59, 130, 246, 0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(59, 130, 246, 0.4)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 4px 16px rgba(59, 130, 246, 0.3)";
                    }}
                  >
                    <span style={{ fontSize: 20 }}>⚙️</span>
                    Edit Café Details, Pricing & Photos
                  </button>

                  <p style={{
                    textAlign: "center",
                    fontSize: 13,
                    color: theme.textMuted,
                    marginTop: 16,
                    fontStyle: "italic"
                  }}>
                    Update your café information, console pricing, and photo gallery
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 16,
                border: `1px solid ${theme.border}`,
                padding: "60px 20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>📈</div>
              <p style={{ fontSize: 18, color: theme.textSecondary, marginBottom: 8, fontWeight: 500 }}>
                Analytics Coming Soon
              </p>
              <p style={{ fontSize: 14, color: theme.textMuted }}>
                Detailed insights and reports will be available here.
              </p>
            </div>
          )}

          {/* Sessions Tab */}
          {activeTab === 'sessions' && (
            <SessionsTab
              theme={theme}
              isMobile={isMobile}
              loadingData={loadingData}
              flattenedFilteredBookings={flattenedFilteredBookings}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              dateFilter={dateFilter}
              setDateFilter={setDateFilter}
              bookingPage={bookingPage}
              setBookingPage={setBookingPage}
              bookingsPerPage={bookingsPerPage}
              totalBookingsCount={totalBookingsCount}
              handleConfirmBooking={handleConfirmBooking}
              handleStartBooking={handleStartBooking}
              handleEditBooking={handleEditBooking}
            />
          )}

          {/* Customers Tab */}
          {activeTab === 'customers' && (
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
              setViewingCustomer={setViewingCustomer}
              handleViewCustomer={handleViewCustomer}
            />
          )}

          {/* Stations Tab */}
          {activeTab === 'stations' && cafes.length > 0 && (
            <div>
              {/* Header with Stats and Add Button */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div>
                  <h2 style={{ fontSize: 28, fontWeight: 700, color: theme.textPrimary, margin: 0, marginBottom: 8 }}>
                    Gaming Stations
                  </h2>
                  <p style={{ fontSize: 14, color: theme.textMuted, margin: 0 }}>
                    Configure pricing for all your gaming stations
                  </p>
                </div>

                {/* Add New Station Button */}
                <button
                  onClick={() => {
                    setNewStationType('ps5');
                    setNewStationCount(1);
                    setShowAddStationModal(true);
                  }}
                  style={{
                    padding: '12px 24px',
                    background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                    border: 'none',
                    borderRadius: 12,
                    color: '#ffffff',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    transition: 'all 0.2s',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.05)';
                    e.currentTarget.style.boxShadow = '0 8px 20px rgba(59, 130, 246, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <span style={{ fontSize: 18 }}>+</span>
                  Add New Station
                </button>
              </div>

              {/* Search and Filters */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                  padding: '20px',
                  marginBottom: 24,
                }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  {/* Search */}
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Search stations..."
                      value={stationSearch}
                      onChange={(e) => setStationSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '12px 16px 12px 44px',
                        background: 'rgba(15,23,42,0.6)',
                        border: `1px solid ${theme.border}`,
                        borderRadius: 10,
                        color: theme.textPrimary,
                        fontSize: 14,
                        outline: 'none',
                      }}
                    />
                    <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.5 }}>🔍</span>
                  </div>

                  {/* Type Filter */}
                  <select
                    value={stationTypeFilter}
                    onChange={(e) => setStationTypeFilter(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      background: 'rgba(15,23,42,0.6)',
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      color: theme.textPrimary,
                      fontSize: 14,
                      cursor: 'pointer',
                      minWidth: 140,
                    }}
                  >
                    <option value="all">All Types</option>
                    <option value="PC">PC</option>
                    <option value="PS5">PS5</option>
                    <option value="PS4">PS4</option>
                    <option value="Xbox">Xbox</option>
                    <option value="VR">VR</option>
                    <option value="Steering">Steering Wheel</option>
                    <option value="Racing Sim">Racing Sim</option>
                  </select>

                  {/* Status Filter */}
                  <select
                    value={stationStatusFilter}
                    onChange={(e) => setStationStatusFilter(e.target.value)}
                    style={{
                      padding: '12px 16px',
                      background: 'rgba(15,23,42,0.6)',
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      color: theme.textPrimary,
                      fontSize: 14,
                      cursor: 'pointer',
                      minWidth: 140,
                    }}
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>

                  {/* View Toggle */}
                  <div style={{ display: 'flex', gap: 4, background: 'rgba(15,23,42,0.6)', borderRadius: 8, padding: 4, border: `1px solid ${theme.border}` }}>
                    <button
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(59, 130, 246, 0.2)',
                        border: 'none',
                        borderRadius: 6,
                        color: '#3b82f6',
                        cursor: 'pointer',
                        fontSize: 18,
                      }}
                    >
                      ☰
                    </button>
                    <button
                      style={{
                        padding: '8px 12px',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 6,
                        color: theme.textMuted,
                        cursor: 'pointer',
                        fontSize: 18,
                      }}
                    >
                      ▦
                    </button>
                  </div>
                </div>
              </div>

              {/* Stations Table */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                  overflow: 'hidden',
                }}
              >
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(15,23,42,0.8)', borderBottom: `1px solid ${theme.border}` }}>
                      <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Station ↕️
                      </th>
                      <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Type ↕️
                      </th>
                      <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Rate ↕️
                      </th>
                      <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Sessions ↕️
                      </th>
                      <th style={{ padding: '16px 20px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Status
                      </th>
                      <th style={{ padding: '16px 20px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Dynamically generate station rows from cafe console counts */}
                    {(() => {
                      const cafe = cafes[0];
                      const allStations: any[] = [];

                      // Console type configurations
                      const consoleTypes = [
                        { key: 'pc_count', name: 'PC', icon: '🖥️', bgColor: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', rate: '₹100/hr' },
                        { key: 'ps5_count', name: 'PS5', icon: '🎮', bgColor: 'rgba(16, 185, 129, 0.15)', color: '#10b981', rate: '₹150 Single / ₹300 Multi' },
                        { key: 'ps4_count', name: 'PS4', icon: '🎮', bgColor: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', rate: '₹100 Single / ₹200 Multi' },
                        { key: 'xbox_count', name: 'Xbox', icon: '🎮', bgColor: 'rgba(34, 197, 94, 0.15)', color: '#22c55e', rate: '₹120 Single / ₹240 Multi' },
                        { key: 'vr_count', name: 'VR', icon: '🥽', bgColor: 'rgba(236, 72, 153, 0.15)', color: '#ec4899', rate: '₹200/hr' },
                        { key: 'steering_wheel_count', name: 'Steering Wheel', icon: '🏎️', bgColor: 'rgba(251, 146, 60, 0.15)', color: '#fb923c', rate: '₹150/hr' },
                        { key: 'racing_sim_count', name: 'Racing Sim', icon: '🏁', bgColor: 'rgba(255, 69, 0, 0.15)', color: '#ff4500', rate: '₹150/hr' },
                        { key: 'pool_count', name: 'Pool', icon: '🎱', bgColor: 'rgba(14, 165, 233, 0.15)', color: '#0ea5e9', rate: '₹80/hr' },
                        { key: 'snooker_count', name: 'Snooker', icon: '🎱', bgColor: 'rgba(132, 204, 22, 0.15)', color: '#84cc16', rate: '₹80/hr' },
                        { key: 'arcade_count', name: 'Arcade', icon: '🕹️', bgColor: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', rate: '₹50/hr' },
                      ];

                      // Calculate session count per station from bookings
                      const stationSessionCounts = new Map<string, number>();
                      bookings.forEach(booking => {
                        const console = booking.booking_items?.[0]?.console;
                        if (console) {
                          stationSessionCounts.set(console, (stationSessionCounts.get(console) || 0) + 1);
                        }
                      });

                      // Generate stations for each console type
                      consoleTypes.forEach((consoleType) => {
                        const count = cafe[consoleType.key as keyof CafeRow] as number || 0;
                        for (let i = 1; i <= count; i++) {
                          const stationName = `${consoleType.name}-${String(i).padStart(2, '0')}`;
                          allStations.push({
                            id: stationName,
                            name: stationName,
                            type: consoleType.name,
                            icon: consoleType.icon,
                            bgColor: consoleType.bgColor,
                            color: consoleType.color,
                            rate: consoleType.rate,
                            sessions: stationSessionCounts.get(stationName) || 0,
                            status: 'Active',
                          });
                        }
                      });

                      if (allStations.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} style={{ padding: '60px 20px', textAlign: 'center' }}>
                              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🎮</div>
                              <p style={{ fontSize: 16, color: theme.textSecondary, marginBottom: 6, fontWeight: 500 }}>
                                No stations configured
                              </p>
                              <p style={{ fontSize: 14, color: theme.textMuted }}>
                                Add your first gaming station to get started
                              </p>
                            </td>
                          </tr>
                        );
                      }

                      return allStations.map((station, index) => {
                        const isPoweredOff = poweredOffStations.has(station.name);
                        const stationStatus = isPoweredOff ? 'Inactive' : 'Active';

                        return (
                          <tr key={station.id} style={{ borderBottom: index < allStations.length - 1 ? `1px solid ${theme.border}` : 'none' }}>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    background: station.bgColor,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: 20,
                                    opacity: isPoweredOff ? 0.4 : 1,
                                  }}
                                >
                                  {station.icon}
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 600, color: theme.textPrimary, opacity: isPoweredOff ? 0.5 : 1 }}>{station.name}</span>
                              </div>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  background: station.bgColor,
                                  color: station.color,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  opacity: isPoweredOff ? 0.5 : 1,
                                }}
                              >
                                {station.type}
                              </span>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 1.6, opacity: isPoweredOff ? 0.5 : 1 }}>
                                {(() => {
                                  const savedPricing = stationPricing[station.name];

                                  // PS5/Xbox - Show base pricing only (half hour and full hour)
                                  if (['PS5', 'Xbox'].includes(station.type)) {
                                    const c1Half = savedPricing?.controller_1_half_hour || 75;
                                    const c1Full = savedPricing?.controller_1_full_hour || 150;

                                    return (
                                      <div>
                                        <span style={{ fontWeight: 600 }}>
                                          ₹{c1Half}/30m · ₹{c1Full}/hr
                                        </span>
                                      </div>
                                    );
                                  } else if (['PS4'].includes(station.type)) {
                                    // PS4 - Show single/multi
                                    const singleHalf = savedPricing?.single_player_half_hour_rate || 75;
                                    const singleFull = savedPricing?.single_player_rate || 150;
                                    const multiHalf = savedPricing?.multi_player_half_hour_rate || 150;
                                    const multiFull = savedPricing?.multi_player_rate || 300;

                                    return (
                                      <>
                                        <div style={{ marginBottom: 4 }}>
                                          <span style={{ color: theme.textMuted, fontSize: 11 }}>Single: </span>
                                          <span style={{ fontWeight: 600 }}>₹{singleHalf}/30m · ₹{singleFull}/hr</span>
                                        </div>
                                        <div>
                                          <span style={{ color: theme.textMuted, fontSize: 11 }}>Multi: </span>
                                          <span style={{ fontWeight: 600 }}>₹{multiHalf}/30m · ₹{multiFull}/hr</span>
                                        </div>
                                      </>
                                    );
                                  } else {
                                    const defaults: Record<string, { half: number, full: number }> = {
                                      'PC': { half: 50, full: 100 },
                                      'VR': { half: 100, full: 200 },
                                      'Steering': { half: 75, full: 150 },
                                      'Pool': { half: 40, full: 80 },
                                      'Snooker': { half: 40, full: 80 },
                                      'Arcade': { half: 40, full: 80 },
                                    };
                                    const stationDefaults = defaults[station.type] || { half: 40, full: 80 };
                                    const halfRate = savedPricing?.half_hour_rate || stationDefaults.half;
                                    const fullRate = savedPricing?.hourly_rate || stationDefaults.full;

                                    return (
                                      <div>
                                        <span style={{ fontWeight: 600 }}>
                                          ₹{halfRate}/30m · ₹{fullRate}/hr
                                        </span>
                                      </div>
                                    );
                                  }
                                })()}
                              </div>
                            </td>
                            <td style={{ padding: '16px 20px', fontSize: 14, color: theme.textSecondary, opacity: isPoweredOff ? 0.5 : 1 }}>
                              {station.sessions}
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <span
                                style={{
                                  display: 'inline-block',
                                  padding: '6px 12px',
                                  borderRadius: 6,
                                  background: stationStatus === 'Active' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                  color: stationStatus === 'Active' ? '#10b981' : '#ef4444',
                                  fontSize: 12,
                                  fontWeight: 600,
                                }}
                              >
                                {stationStatus}
                              </span>
                            </td>
                            <td style={{ padding: '16px 20px' }}>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                  style={{
                                    padding: '8px',
                                    background: 'transparent',
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 6,
                                    color: theme.textSecondary,
                                    cursor: 'pointer',
                                    fontSize: 16,
                                  }}
                                  title="Edit"
                                  onClick={() => setEditingStation(station)}
                                >
                                  ✏️
                                </button>
                                <button
                                  style={{
                                    padding: '8px',
                                    background: 'transparent',
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 6,
                                    color: isPoweredOff ? '#ef4444' : '#10b981',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                  }}
                                  title={isPoweredOff ? 'Power On' : 'Power Off'}
                                  onClick={() => handleTogglePower(station.name)}
                                >
                                  🔌
                                </button>
                                <button
                                  style={{
                                    padding: '8px',
                                    background: 'transparent',
                                    border: `1px solid ${theme.border}`,
                                    borderRadius: 6,
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    fontSize: 16,
                                  }}
                                  title="Delete"
                                  onClick={() => setStationToDelete({ name: station.name, type: station.type })}
                                >
                                  🗑️
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tournament Tab */}
          {activeTab === 'subscriptions' && (
            <div
              style={{
                background: theme.cardBackground,
                borderRadius: 16,
                border: `1px solid ${theme.border}`,
                padding: "60px 20px",
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }}>🏆</div>
              <p style={{ fontSize: 18, color: theme.textSecondary, marginBottom: 8, fontWeight: 500 }}>
                Tournament
              </p>
              <p style={{ fontSize: 14, color: theme.textMuted }}>
                Manage tournaments and competitions here.
              </p>
            </div>
          )}

          {/* Memberships Tab */}
          {activeTab === 'memberships' && (
            <Memberships
              isMobile={isMobile}
              cafeId={selectedCafeId || cafes[0]?.id || ''}
              cafeOpeningHours={cafes.find(c => c.id === (selectedCafeId || cafes[0]?.id))?.opening_hours || ''}
              subscriptions={subscriptions}
              membershipPlans={membershipPlans}
              activeTimers={activeTimers}
              timerElapsed={timerElapsed}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
              onRefresh={() => refreshData()}
            />
          )}

          {/* Coupons Tab */}
          {activeTab === 'coupons' && (
            <Coupons
              isMobile={isMobile}
              cafeId={selectedCafeId || cafes[0]?.id || ''}
              onRefresh={() => refreshData()}
            />
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <Reports
              cafeId={selectedCafeId || cafes[0]?.id || ''}
              isMobile={isMobile}
              openingHours={cafes[0]?.opening_hours ?? undefined}
            />
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <Inventory
              cafeId={selectedCafeId || cafes[0]?.id || ''}
            />
          )}

          {/* Billing Tab - Quick Booking Interface */}

          {activeTab === 'billing' && (
            <Billing
              cafeId={selectedCafeId || cafes[0]?.id}
              cafes={cafes}
              isMobile={isMobile}
              pricingData={consolePricing[selectedCafeId || cafes[0]?.id]}
              stationPricingList={Object.values(stationPricing)}
              onSuccess={() => {
                refreshData();
                setActiveTab('dashboard');
              }}
            />
          )}


          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <SettingsTab
              theme={theme}
              fonts={fonts}
              cafes={cafes}
              editedCafe={editedCafe}
              setEditedCafe={setEditedCafe}
              settingsChanged={settingsChanged}
              setSettingsChanged={setSettingsChanged}
              savingSettings={savingSettings}
              handleSaveSettings={handleSaveSettings}
              uploadingProfilePhoto={uploadingProfilePhoto}
              handleProfilePhotoUpload={handleProfilePhotoUpload}
              handleProfilePhotoDelete={handleProfilePhotoDelete}
              uploadingGalleryPhoto={uploadingGalleryPhoto}
              handleGalleryPhotoUpload={handleGalleryPhotoUpload}
              galleryImages={galleryImages}
              handleGalleryPhotoDelete={handleGalleryPhotoDelete}
            />
          )}
        </div>
      </DashboardLayout>

      {/* Add Items Modal (F&B) */}
      <AddItemsModal
        isOpen={addItemsModalOpen}
        onClose={() => setAddItemsModalOpen(false)}
        bookingId={addItemsBookingId}
        cafeId={selectedCafeId || cafes[0]?.id || ''}
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
        cafeId={selectedCafeId || cafes[0]?.id || ''}
        customerName={viewOrdersCustomerName}
        onOrdersUpdated={() => {
          refreshData();
        }}
      />

      {/* Session Ended Popup */}
      <SessionEndedPopup
        isOpen={sessionEndedPopupOpen}
        onClose={() => setSessionEndedPopupOpen(false)}
        customerName={sessionEndedInfo?.customerName || ''}
        stationName={sessionEndedInfo?.stationName || ''}
        duration={sessionEndedInfo?.duration || 0}
      />

      {/* Edit Booking Modal */}
      {
        editingBooking && (
          <>
            <style>{`
            input[type="number"]::-webkit-outer-spin-button,
            input[type="number"]::-webkit-inner-spin-button {
              -webkit-appearance: none;
              margin: 0;
            }
          `}</style>
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
              onClick={() => { setEditingBooking(null); setEditingBookingItemId(null); }}
            >
              <div
                style={{
                  background: "linear-gradient(180deg, #0f172a 0%, #1e293b 100%)",
                  borderRadius: 20,
                  border: `1px solid rgba(99, 102, 241, 0.2)`,
                  maxWidth: 700,
                  width: "100%",
                  maxHeight: "92vh",
                  overflowY: "auto",
                  boxShadow: "0 25px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(99, 102, 241, 0.1)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Header */}
                <div style={{
                  padding: "24px 28px",
                  borderBottom: `1px solid rgba(99, 102, 241, 0.15)`,
                  background: "linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1))",
                  position: "relative",
                  overflow: "hidden",
                }}>
                  <div style={{
                    position: "absolute",
                    top: -50,
                    right: -50,
                    width: 150,
                    height: 150,
                    background: "radial-gradient(circle, rgba(99, 102, 241, 0.15), transparent)",
                    borderRadius: "50%",
                    pointerEvents: "none",
                  }}></div>
                  <h2 style={{
                    fontFamily: fonts.heading,
                    fontSize: 24,
                    margin: "0 0 6px 0",
                    color: "#f8fafc",
                    fontWeight: 700,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                  }}>
                    <span style={{
                      fontSize: 28,
                      filter: "drop-shadow(0 2px 8px rgba(99, 102, 241, 0.3))",
                    }}>📝</span>
                    Edit Walk-In Booking
                  </h2>
                  <p style={{
                    fontSize: 13,
                    color: "#94a3b8",
                    margin: 0,
                    fontWeight: 500,
                  }}>
                    Booking ID: <span style={{
                      color: "#c7d2fe",
                      fontWeight: 600,
                      background: "rgba(99, 102, 241, 0.15)",
                      padding: "2px 8px",
                      borderRadius: 6,
                      fontSize: 12,
                    }}>#{editingBooking.id.slice(0, 8).toUpperCase()}</span>
                  </p>
                </div>

                {/* Content */}
                <div style={{
                  padding: "28px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 24,
                }}>
                  {/* Customer Info Section */}
                  <div style={{
                    background: "rgba(99, 102, 241, 0.05)",
                    border: "1px solid rgba(99, 102, 241, 0.1)",
                    borderRadius: 14,
                    padding: 20,
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 18,
                      paddingBottom: 12,
                      borderBottom: "1px solid rgba(99, 102, 241, 0.1)",
                    }}>
                      <span style={{
                        fontSize: 20,
                        background: "rgba(99, 102, 241, 0.15)",
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                      }}>👤</span>
                      <h3 style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        fontWeight: 700,
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                      }}>
                        Customer Information
                      </h3>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                      {/* Customer Name */}
                      <div>
                        <label style={{
                          fontSize: 12,
                          color: "#64748b",
                          display: "block",
                          marginBottom: 8,
                          fontWeight: 600,
                        }}>
                          Customer Name
                        </label>
                        <input
                          type="text"
                          value={editCustomerName}
                          onChange={(e) => setEditCustomerName(e.target.value)}
                          placeholder="Enter customer name"
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            background: "rgba(15, 23, 42, 0.6)",
                            border: `2px solid rgba(148, 163, 184, 0.15)`,
                            borderRadius: 10,
                            color: "#f1f5f9",
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "#6366f1";
                            e.target.style.background = "rgba(15, 23, 42, 0.8)";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "rgba(148, 163, 184, 0.15)";
                            e.target.style.background = "rgba(15, 23, 42, 0.6)";
                          }}
                        />
                      </div>

                      {/* Customer Phone */}
                      <div>
                        <label style={{
                          fontSize: 12,
                          color: "#64748b",
                          display: "block",
                          marginBottom: 8,
                          fontWeight: 600,
                        }}>
                          Customer Phone
                        </label>
                        <input
                          type="tel"
                          value={editCustomerPhone}
                          onChange={(e) => setEditCustomerPhone(e.target.value)}
                          placeholder="Enter phone number"
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            background: "rgba(15, 23, 42, 0.6)",
                            border: `2px solid rgba(148, 163, 184, 0.15)`,
                            borderRadius: 10,
                            color: "#f1f5f9",
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => {
                            e.target.style.borderColor = "#6366f1";
                            e.target.style.background = "rgba(15, 23, 42, 0.8)";
                          }}
                          onBlur={(e) => {
                            e.target.style.borderColor = "rgba(148, 163, 184, 0.15)";
                            e.target.style.background = "rgba(15, 23, 42, 0.6)";
                          }}
                        />
                      </div>
                    </div>

                    {editingBooking.user_email && (
                      <div style={{ fontSize: 13, color: theme.textSecondary, display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                        <span>✉️</span> {editingBooking.user_email}
                      </div>
                    )}
                  </div>

                  {/* Booking Details Section */}
                  <div style={{
                    background: "rgba(59, 130, 246, 0.05)",
                    border: "1px solid rgba(59, 130, 246, 0.1)",
                    borderRadius: 14,
                    padding: 20,
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 18,
                      paddingBottom: 12,
                      borderBottom: "1px solid rgba(59, 130, 246, 0.1)",
                    }}>
                      <span style={{
                        fontSize: 20,
                        background: "rgba(59, 130, 246, 0.15)",
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                      }}>📅</span>
                      <h3 style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        fontWeight: 700,
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                      }}>
                        Booking Details
                      </h3>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Date */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Booking Date *
                        </label>
                        <input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "14px",
                            background: theme.background,
                            border: `2px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                          onBlur={(e) => e.target.style.borderColor = theme.border}
                        />
                      </div>

                      {/* Start Time - 12 Hour Format */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Start Time *
                        </label>
                        <input
                          type="time"
                          value={editStartTime}
                          onChange={(e) => setEditStartTime(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "14px",
                            background: theme.background,
                            border: `2px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                          onBlur={(e) => e.target.style.borderColor = theme.border}
                        />
                      </div>
                    </div>

                    {/* Duration */}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                        Duration *
                      </label>
                      <select
                        value={editDuration}
                        onChange={(e) => setEditDuration(parseInt(e.target.value))}
                        style={{
                          width: "100%",
                          padding: "14px",
                          background: theme.background,
                          border: `2px solid ${theme.border}`,
                          borderRadius: 10,
                          color: theme.textPrimary,
                          fontSize: 14,
                          fontFamily: fonts.body,
                          fontWeight: 500,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                        onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                        onBlur={(e) => e.target.style.borderColor = theme.border}
                      >
                        <option value={30}>30 Minutes</option>
                        <option value={60}>1 Hour</option>
                        <option value={90}>1.5 Hours</option>
                        <option value={120}>2 Hours</option>
                        <option value={150}>2.5 Hours</option>
                        <option value={180}>3 Hours</option>
                        <option value={210}>3.5 Hours</option>
                        <option value={240}>4 Hours</option>
                        <option value={270}>4.5 Hours</option>
                        <option value={300}>5 Hours</option>
                      </select>
                    </div>

                    {/* End Time */}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                        End Time <span style={{ color: theme.textSecondary, fontSize: 11 }}>(Auto-calculated)</span>
                      </label>
                      <div style={{
                        padding: "14px",
                        background: "rgba(100, 116, 139, 0.1)",
                        border: `2px dashed ${theme.border}`,
                        borderRadius: 10,
                        color: theme.textSecondary,
                        fontSize: 14,
                        fontFamily: fonts.body,
                        fontWeight: 500,
                      }}>
                        {(() => {
                          // Calculate end time from 24-hour time input
                          const [hours, minutes] = editStartTime.split(':').map(Number);
                          const period = hours >= 12 ? 'pm' : 'am';
                          const hours12 = hours % 12 || 12;
                          const startTime12h = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;
                          const endTime = getEndTime(startTime12h, editDuration);
                          // Format consistently with uppercase AM/PM
                          return endTime.replace(/\s*(am|pm)$/i, (match) => ` ${match.trim().toUpperCase()}`);
                        })()}
                      </div>
                    </div>
                  </div>

                  {/* Console & Controllers Section */}
                  <div style={{
                    background: "rgba(139, 92, 246, 0.05)",
                    border: "1px solid rgba(139, 92, 246, 0.1)",
                    borderRadius: 14,
                    padding: 20,
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 18,
                      paddingBottom: 12,
                      borderBottom: "1px solid rgba(139, 92, 246, 0.1)",
                    }}>
                      <span style={{
                        fontSize: 20,
                        background: "rgba(139, 92, 246, 0.15)",
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                      }}>🎮</span>
                      <h3 style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        fontWeight: 700,
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                      }}>
                        Console & Controllers
                      </h3>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Console */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Console *
                        </label>
                        <select
                          value={editConsole}
                          onChange={(e) => setEditConsole(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "14px",
                            background: theme.background,
                            border: `2px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                          onBlur={(e) => e.target.style.borderColor = theme.border}
                        >
                          <option value="">Select Console</option>
                          {cafes.length > 0 && cafes[0].ps5_count && cafes[0].ps5_count > 0 && (
                            <option value="ps5">🎮 PS5</option>
                          )}
                          {cafes.length > 0 && cafes[0].ps4_count && cafes[0].ps4_count > 0 && (
                            <option value="ps4">🎮 PS4</option>
                          )}
                          {cafes.length > 0 && cafes[0].xbox_count && cafes[0].xbox_count > 0 && (
                            <option value="xbox">🎮 Xbox</option>
                          )}
                          {cafes.length > 0 && cafes[0].pc_count && cafes[0].pc_count > 0 && (
                            <option value="pc">💻 PC</option>
                          )}
                          {cafes.length > 0 && cafes[0].pool_count && cafes[0].pool_count > 0 && (
                            <option value="pool">🎱 Pool</option>
                          )}
                          {cafes.length > 0 && cafes[0].snooker_count && cafes[0].snooker_count > 0 && (
                            <option value="snooker">🎱 Snooker</option>
                          )}
                          {cafes.length > 0 && cafes[0].arcade_count && cafes[0].arcade_count > 0 && (
                            <option value="arcade">🕹️ Arcade</option>
                          )}
                          {cafes.length > 0 && cafes[0].vr_count && cafes[0].vr_count > 0 && (
                            <option value="vr">🥽 VR</option>
                          )}
                          {cafes.length > 0 && cafes[0].steering_wheel_count && cafes[0].steering_wheel_count > 0 && (
                            <option value="steering_wheel">🏎️ Steering Wheel</option>
                          )}
                          {cafes.length > 0 && (cafes[0] as any).racing_sim_count && (cafes[0] as any).racing_sim_count > 0 && (
                            <option value="racing_sim">🏁 Racing Sim</option>
                          )}
                        </select>
                      </div>

                      {/* Number of Controllers */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Controllers *
                        </label>
                        <select
                          value={editControllers}
                          onChange={(e) => setEditControllers(parseInt(e.target.value))}
                          style={{
                            width: "100%",
                            padding: "14px",
                            background: theme.background,
                            border: `2px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                          onBlur={(e) => e.target.style.borderColor = theme.border}
                        >
                          <option value={1}>1 Controller</option>
                          <option value={2}>2 Controllers</option>
                          <option value={3}>3 Controllers</option>
                          <option value={4}>4 Controllers</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Payment & Status Section */}
                  <div style={{
                    background: "rgba(34, 197, 94, 0.05)",
                    border: "1px solid rgba(34, 197, 94, 0.1)",
                    borderRadius: 14,
                    padding: 20,
                  }}>
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 18,
                      paddingBottom: 12,
                      borderBottom: "1px solid rgba(34, 197, 94, 0.1)",
                    }}>
                      <span style={{
                        fontSize: 20,
                        background: "rgba(34, 197, 94, 0.15)",
                        width: 36,
                        height: 36,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 10,
                      }}>💰</span>
                      <h3 style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        fontWeight: 700,
                        margin: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.8px",
                      }}>
                        Payment & Status
                      </h3>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                      {/* Amount */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Total Amount * <span style={{ color: theme.textSecondary, fontSize: 11 }}>(Editable)</span>
                        </label>
                        <div style={{ position: "relative" }}>
                          <span style={{
                            position: "absolute",
                            left: 14,
                            top: "50%",
                            transform: "translateY(-50%)",
                            fontSize: 16,
                            color: "#22c55e",
                            fontWeight: 700,
                          }}>₹</span>
                          <input
                            type="number"
                            value={editAmount}
                            onChange={(e) => {
                              setEditAmount(e.target.value);
                              setEditAmountManuallyEdited(true);
                            }}
                            min="0"
                            step="1"
                            style={{
                              width: "100%",
                              padding: "14px 14px 14px 32px",
                              background: "rgba(34, 197, 94, 0.1)",
                              border: `2px solid rgba(34, 197, 94, 0.3)`,
                              borderRadius: 10,
                              color: "#22c55e",
                              fontSize: 16,
                              fontFamily: fonts.body,
                              fontWeight: 700,
                              transition: "all 0.2s",
                              MozAppearance: "textfield",
                            } as React.CSSProperties & { MozAppearance?: string }}
                            onFocus={(e) => e.target.style.borderColor = "#22c55e"}
                            onBlur={(e) => e.target.style.borderColor = "rgba(34, 197, 94, 0.3)"}
                          />
                        </div>
                      </div>

                      {/* Status */}
                      <div>
                        <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                          Status *
                        </label>
                        <select
                          value={editStatus}
                          onChange={(e) => setEditStatus(e.target.value)}
                          style={{
                            width: "100%",
                            padding: "14px",
                            background: theme.background,
                            border: `2px solid ${theme.border}`,
                            borderRadius: 10,
                            color: theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 500,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#6366f1"}
                          onBlur={(e) => e.target.style.borderColor = theme.border}
                        >
                          <option value="pending">⏳ Pending</option>
                          <option value="confirmed">✅ Confirmed</option>
                          <option value="cancelled">❌ Cancelled</option>
                          <option value="completed">✔️ Completed</option>
                        </select>
                      </div>
                    </div>

                    {/* Payment Method */}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 8, fontWeight: 600 }}>
                        Payment Method *
                      </label>
                      <div style={{ display: "flex", gap: 12 }}>
                        <button
                          type="button"
                          onClick={() => setEditPaymentMethod("cash")}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: editPaymentMethod === "cash" ? "rgba(34, 197, 94, 0.1)" : theme.background,
                            border: `2px solid ${editPaymentMethod === "cash" ? "#22c55e" : theme.border}`,
                            borderRadius: 10,
                            color: editPaymentMethod === "cash" ? "#22c55e" : theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (editPaymentMethod !== "cash") {
                              e.currentTarget.style.borderColor = "#6366f1";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editPaymentMethod !== "cash") {
                              e.currentTarget.style.borderColor = theme.border;
                            }
                          }}
                        >
                          💵 Cash
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditPaymentMethod("upi")}
                          style={{
                            flex: 1,
                            padding: "14px",
                            background: editPaymentMethod === "upi" ? "rgba(99, 102, 241, 0.1)" : theme.background,
                            border: `2px solid ${editPaymentMethod === "upi" ? "#6366f1" : theme.border}`,
                            borderRadius: 10,
                            color: editPaymentMethod === "upi" ? "#6366f1" : theme.textPrimary,
                            fontSize: 14,
                            fontFamily: fonts.body,
                            fontWeight: 600,
                            cursor: "pointer",
                            transition: "all 0.2s",
                          }}
                          onMouseEnter={(e) => {
                            if (editPaymentMethod !== "upi") {
                              e.currentTarget.style.borderColor = "#6366f1";
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (editPaymentMethod !== "upi") {
                              e.currentTarget.style.borderColor = theme.border;
                            }
                          }}
                        >
                          📱 UPI
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer with Action Buttons */}
                <div style={{
                  padding: "20px 28px",
                  borderTop: `1px solid rgba(99, 102, 241, 0.15)`,
                  background: "rgba(15, 23, 42, 0.5)",
                  display: "flex",
                  gap: 12,
                  borderBottomLeftRadius: 20,
                  borderBottomRightRadius: 20,
                }}>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={saving || deletingBooking}
                    style={{
                      flex: 1,
                      padding: "13px 24px",
                      borderRadius: 12,
                      border: "none",
                      background: saving || deletingBooking
                        ? "rgba(239, 68, 68, 0.25)"
                        : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: saving || deletingBooking ? "not-allowed" : "pointer",
                      opacity: saving || deletingBooking ? 0.5 : 1,
                      transition: "all 0.2s",
                      boxShadow: saving || deletingBooking
                        ? "none"
                        : "0 4px 16px rgba(239, 68, 68, 0.3)",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving && !deletingBooking) {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 6px 20px rgba(239, 68, 68, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!saving && !deletingBooking) {
                        e.currentTarget.style.transform = "translateY(0)";
                        e.currentTarget.style.boxShadow = "0 4px 16px rgba(239, 68, 68, 0.3)";
                      }
                    }}
                  >
                    🗑️ Delete
                  </button>
                  <button
                    onClick={() => { setEditingBooking(null); setEditingBookingItemId(null); }}
                    disabled={saving || deletingBooking}
                    style={{
                      flex: 1,
                      padding: "13px 24px",
                      borderRadius: 12,
                      border: `2px solid rgba(148, 163, 184, 0.2)`,
                      background: "rgba(15, 23, 42, 0.6)",
                      color: "#cbd5e1",
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: saving || deletingBooking ? "not-allowed" : "pointer",
                      opacity: saving || deletingBooking ? 0.5 : 1,
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving && !deletingBooking) {
                        e.currentTarget.style.background = "rgba(15, 23, 42, 0.9)";
                        e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.4)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!saving && !deletingBooking) {
                        e.currentTarget.style.background = "rgba(15, 23, 42, 0.6)";
                        e.currentTarget.style.borderColor = "rgba(148, 163, 184, 0.2)";
                      }
                    }}
                  >
                    ✕ Cancel
                  </button>
                  <button
                    onClick={handleSaveBooking}
                    disabled={saving || !editAmount || !editDate || !editStartTime}
                    style={{
                      flex: 1.5,
                      padding: "13px 24px",
                      borderRadius: 12,
                      border: "none",
                      background:
                        saving || !editAmount || !editDate || !editStartTime
                          ? "rgba(99, 102, 241, 0.25)"
                          : "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: saving || !editAmount || !editDate || !editStartTime ? "not-allowed" : "pointer",
                      boxShadow:
                        saving || !editAmount || !editDate || !editStartTime
                          ? "none"
                          : "0 8px 24px rgba(99, 102, 241, 0.35), inset 0 1px 0 rgba(255,255,255,0.1)",
                      transition: "all 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      if (!saving && editAmount && editDate && editStartTime) {
                        e.currentTarget.style.transform = "translateY(-2px)";
                        e.currentTarget.style.boxShadow = "0 12px 32px rgba(99, 102, 241, 0.5), inset 0 1px 0 rgba(255,255,255,0.1)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = saving || !editAmount || !editDate || !editStartTime
                        ? "none"
                        : "0 8px 24px rgba(99, 102, 241, 0.4)";
                    }}
                  >
                    {saving ? "💾 Saving..." : "💾 Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      }

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
            onClick={() => !deletingBooking && setShowDeleteConfirm(false)}
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
              <div style={{
                padding: "24px 32px",
                borderBottom: `1px solid ${theme.border}`,
              }}>
                <h2 style={{
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 700,
                  color: theme.textPrimary,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}>
                  <span style={{ fontSize: 24 }}>⚠️</span>
                  Delete Booking
                </h2>
                <p style={{
                  margin: "8px 0 0 0",
                  fontSize: 14,
                  color: theme.textSecondary,
                }}>
                  Are you sure you want to delete this booking?
                </p>
              </div>

              {/* Body */}
              <div style={{ padding: "24px 32px" }}>
                <div style={{
                  padding: "16px",
                  borderRadius: 12,
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    color: theme.textPrimary,
                    fontWeight: 600,
                  }}>
                    Booking ID: #{editingBooking.id.slice(0, 8).toUpperCase()}
                  </p>
                  <p style={{
                    margin: "4px 0",
                    fontSize: 13,
                    color: theme.textSecondary,
                  }}>
                    Customer: {editingBooking.customer_name || editingBooking.user_name || "N/A"}
                  </p>
                  <p style={{
                    margin: "4px 0",
                    fontSize: 13,
                    color: theme.textSecondary,
                  }}>
                    Amount: ₹{editingBooking.total_amount}
                  </p>
                  <p style={{
                    margin: "12px 0 0 0",
                    fontSize: 13,
                    color: "#ef4444",
                    fontWeight: 600,
                  }}>
                    This will permanently remove this booking. This action cannot be undone.
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
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deletingBooking}
                  style={{
                    padding: "12px 24px",
                    background: "transparent",
                    border: `1px solid ${theme.border}`,
                    borderRadius: 12,
                    color: theme.textSecondary,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: deletingBooking ? "not-allowed" : "pointer",
                    opacity: deletingBooking ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteBooking}
                  disabled={deletingBooking}
                  style={{
                    padding: "12px 24px",
                    background: deletingBooking
                      ? "rgba(100, 116, 139, 0.3)"
                      : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
                    border: "none",
                    borderRadius: 12,
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: deletingBooking ? "not-allowed" : "pointer",
                    transition: "all 0.2s",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                  onMouseEnter={(e) => {
                    if (!deletingBooking) {
                      e.currentTarget.style.transform = "scale(1.05)";
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(239, 68, 68, 0.4)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow = "none";
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
                <div style={{ marginBottom: 24, padding: 16, background: 'rgba(59, 130, 246, 0.08)', border: `1px solid rgba(59, 130, 246, 0.2)`, borderRadius: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={applyToAll}
                      onChange={(e) => setApplyToAll(e.target.checked)}
                      style={{
                        width: 20,
                        height: 20,
                        cursor: 'pointer',
                        accentColor: '#3b82f6',
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
                                background: '#10b981',
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                setEnabledControllers(enabledControllers.filter(c => c !== 2));
                                setController2HalfHour("");
                                setController2FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ef4444',
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                setEnabledControllers(enabledControllers.filter(c => c !== 3));
                                setController3HalfHour("");
                                setController3FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ef4444',
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                setEnabledControllers(enabledControllers.filter(c => c !== 4));
                                setController4HalfHour("");
                                setController4FullHour("");
                              }}
                              style={{
                                padding: '4px 10px',
                                background: '#ef4444',
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Full Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 150" value={singleFullHour} onChange={(e) => setSingleFullHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
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
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
                        </div>
                        <div>
                          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: theme.textSecondary, marginBottom: 8 }}>
                            Full Hour (₹)
                          </label>
                          <input type="number" placeholder="e.g., 300" value={multiFullHour} onChange={(e) => setMultiFullHour(e.target.value)}
                            style={{ width: "100%", padding: "12px 16px", background: theme.background, border: `1px solid ${theme.border}`, borderRadius: 12, color: theme.textPrimary, fontSize: 15, outline: "none", transition: "border-color 0.2s" }}
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")} onBlur={(e) => (e.target.style.borderColor = theme.border)} />
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
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                            onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
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
                    if (!cafes[0]?.id) return;

                    setSavingPricing(true);
                    try {
                      const isGamingConsole = ['PS5', 'PS4', 'Xbox'].includes(editingStation.type);
                      const stationNumber = parseInt(editingStation.name.split('-')[1]);

                      // Prepare pricing data
                      const pricingData: any = {
                        cafe_id: cafes[0].id,
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
                        const cafe = cafes[0];
                        const typeToDbKey: Record<string, string> = {
                          'PC': 'pc_count', 'PS5': 'ps5_count', 'PS4': 'ps4_count',
                          'Xbox': 'xbox_count', 'VR': 'vr_count', 'Pool': 'pool_count',
                          'Snooker': 'snooker_count', 'Arcade': 'arcade_count',
                          'Steering Wheel': 'steering_wheel_count', 'Racing Sim': 'racing_sim_count',
                        };
                        const consoleTypeKey = (typeToDbKey[editingStation.type] || `${editingStation.type.toLowerCase()}_count`) as keyof typeof cafe;
                        const count = (cafe[consoleTypeKey] as number) || 0;

                        // Create pricing data for all stations of this type
                        const allPricingData = [];
                        for (let i = 1; i <= count; i++) {
                          const stationName = `${editingStation.type}-${String(i).padStart(2, '0')}`;
                          const data = { ...pricingData, station_number: i, station_name: stationName };
                          allPricingData.push(data);
                        }

                        // Upsert all via API route (bypasses RLS)
                        const res = await fetch('/api/station-pricing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ applyToAll: true, allPricingData }),
                        });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.error);
                      } else {
                        // Just save this one station via API route
                        const res = await fetch('/api/station-pricing', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pricingData }),
                        });
                        const result = await res.json();
                        if (!res.ok) throw new Error(result.error);
                      }

                      // Reload station pricing to update the table
                      const { data: updatedPricing } = await supabase
                        .from("station_pricing")
                        .select("*")
                        .eq("cafe_id", cafes[0].id);

                      if (updatedPricing) {
                        const pricingMap: Record<string, any> = {};
                        updatedPricing.forEach((pricing: any) => {
                          pricingMap[pricing.station_name] = pricing;
                        });
                        setStationPricing(pricingMap);
                      }

                      const successMsg = applyToAll
                        ? `Pricing updated for all ${editingStation.type} stations!`
                        : 'Pricing updated successfully!';
                      alert(successMsg);
                      setEditingStation(null);
                      setApplyToAll(false);
                    } catch (err: any) {
                      console.error('Error saving pricing:', err);
                      alert(`Failed to save pricing: ${err?.message || err?.details || JSON.stringify(err)}`);
                    } finally {
                      setSavingPricing(false);
                    }
                  }}
                  disabled={savingPricing}
                  style={{
                    padding: "12px 32px",
                    background: savingPricing ? "rgba(16, 185, 129, 0.5)" : "linear-gradient(135deg, #10b981, #059669)",
                    border: "none",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: savingPricing ? "not-allowed" : "pointer",
                    boxShadow: savingPricing ? "none" : "0 4px 16px rgba(16, 185, 129, 0.3)",
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
                background: "linear-gradient(135deg, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05))",
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
                      ? "rgba(100, 116, 139, 0.3)"
                      : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
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
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(59, 130, 246, 0.4)";
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
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}>
                  <p style={{
                    margin: 0,
                    fontSize: 14,
                    color: theme.textPrimary,
                    fontWeight: 600,
                  }}>
                    {stationToDelete.name}
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
                      ? "rgba(100, 116, 139, 0.3)"
                      : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
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
                      e.currentTarget.style.boxShadow = "0 8px 20px rgba(239, 68, 68, 0.4)";
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
              const { error } = await supabase
                .from('subscriptions')
                .delete()
                .eq('id', id);

              if (!error) {
                setSubscriptions(subscriptions.filter(s => s.id !== id));
                setViewingSubscription(null);
                alert('Subscription deleted successfully!');
              } else {
                alert('Failed to delete subscription: ' + error.message);
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
            loadingCustomerData={loadingCustomerData}
            isMobile={isMobile}
            onClose={() => setViewingCustomer(null)}
            onBackToSubscription={(sub: any) => {
              setViewingSubscription(sub);
              setViewingCustomer(null);
            }}
          />
        )
      }

      {/* PWA Install Prompt for Owner Dashboard */}
      <OwnerPWAInstaller />
    </>
  );
}
