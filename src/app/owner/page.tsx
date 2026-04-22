// src/app/owner/page.tsx
"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Note: This file contains complex React event handlers and UI code where explicit any types
// are used for flexibility. These can be refactored incrementally with proper typing.

import { useEffect, useState } from "react";
import { AlarmClock, ShoppingBag, BarChart3, ChevronRight } from 'lucide-react';
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fonts, type ConsoleId } from "@/lib/constants";
import { buildStationPricingMap } from "@/lib/stationNames";
import { dispatchOwnerBookingsChanged } from "@/lib/ownerBookingsSync";
import {
  CafeRow,
  BookingRow,
  NavTab,
} from "./types";
import { getAvailableConsoleIds, getLocalDateString, normaliseConsoleType } from "./utils";
import { isSessionBooking } from "@/lib/bookingFilters";
import { theme } from "./utils/theme";
import {
  DashboardLayout,
  DashboardStats,
  BookingsTable,
  ActiveSessions,
  TabSkeleton,
} from './components';
import OwnerPWAInstaller from './components/OwnerPWAInstaller';
import { useBilling } from "./hooks/useBilling";
import { useOwnerAuth } from "./hooks/useOwnerAuth";
import { useOwnerData } from "./hooks/useOwnerData";
import { useToast } from "./hooks/useToast";
import { ToastContainer } from "./components/ToastContainer";
import { TodaySnackOrders } from "./components/TodaySnackOrders";
import { DashboardBookingsTable } from "./components/DashboardBookingsTable";
import SnackSaleModal from "./components/SnackSaleModal";
import { EditBookingModal } from "./components/EditBookingModal";
import { ErrorBoundary } from "./components/ErrorBoundary";

const Billing = dynamic(() => import('./components/Billing').then((mod) => mod.Billing), { ssr: false });
const BookingsManagement = dynamic(() => import('./components/BookingsManagement').then((mod) => mod.BookingsManagement), { ssr: false });
const Memberships = dynamic(() => import('./components/Memberships').then((mod) => mod.Memberships), { ssr: false });
const Coupons = dynamic(() => import('./components/Coupons').then((mod) => mod.Coupons), { ssr: false });
const Reports = dynamic(() => import('./components/Reports').then((mod) => mod.Reports), { ssr: false });
const StationsTab = dynamic(() => import('./components/StationsTab').then((mod) => mod.StationsTab), { ssr: false });
const Inventory = dynamic(() => import('./components/Inventory'), { ssr: false });
const SettingsTab = dynamic(() => import('./components/tabs/SettingsTab'), { ssr: false });
const CustomersTab = dynamic(() => import('./components/tabs/CustomersTab'), { ssr: false });
const AddItemsModal = dynamic(() => import('./components/AddItemsModal'), { ssr: false });
const ViewOrdersModal = dynamic(() => import('./components/ViewOrdersModal'), { ssr: false });
const SubscriptionDetailsModal = dynamic(() => import('./components/SubscriptionDetailsModal'), { ssr: false });
const CustomerDetailsModal = dynamic(() => import('./components/CustomerDetailsModal'), { ssr: false });
const SessionEndedPopup = dynamic(() => import('./components/SessionEndedPopup').then((mod) => mod.SessionEndedPopup), { ssr: false });

const debugLog: (...args: any[]) => void = process.env.NODE_ENV !== "production" ? console.log.bind(console) : () => {};

const DIGITAL_PAYMENT_MODES = new Set(['online', 'upi', 'paytm', 'gpay', 'phonepe', 'card']);

function normaliseOwnerPaymentMode(mode: string | null | undefined): string {
  const normalized = mode?.toLowerCase() || '';
  return DIGITAL_PAYMENT_MODES.has(normalized) ? 'upi' : 'cash';
}

function getAssignedStationsFromItemTitle(title: string | null | undefined): string[] {
  const stationPart = title?.split('|')[1]?.trim();
  if (!stationPart) return [];

  return stationPart
    .split(',')
    .map((station) => station.trim().toLowerCase())
    .filter(Boolean);
}

function getBookingItemDuration(item: { duration?: number; title?: string | null } | null | undefined, fallback = 60): number {
  if (typeof item?.duration === 'number' && item.duration > 0) {
    return item.duration;
  }

  const parsedDuration = parseInt(item?.title?.split('|')[0] || '', 10);
  return Number.isNaN(parsedDuration) || parsedDuration <= 0 ? fallback : parsedDuration;
}

function buildBookingItemTitle(existingTitle: string | null | undefined, duration: number): string {
  const stationPart = existingTitle?.split('|')[1]?.trim();
  return stationPart ? `${duration}|${stationPart}` : String(duration);
}

function getPreferredConsoleForCafe(cafe: CafeRow | null | undefined): ConsoleId {
  return getAvailableConsoleIds(cafe)[0] || 'ps5';
}




export default function OwnerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<NavTab>(() => {
    // Prefer URL ?tab= param, fall back to localStorage
    try {
      if (typeof window !== 'undefined') {
        const urlTab = new URLSearchParams(window.location.search).get('tab');
        if (urlTab) return urlTab as NavTab;
        const savedTab = localStorage.getItem('ownerActiveTab');
        if (savedTab) return savedTab as NavTab;
      }
    } catch {
      // localStorage or URLSearchParams unavailable (e.g., SSR, private browsing restrictions)
    }
    return 'dashboard';
  });

  const { allowed, checkingRole } = useOwnerAuth();
  const { toasts, toast, removeToast } = useToast();
  const canFetchOwnerData = checkingRole || allowed;
  const canAutoRefreshOwnerData = allowed && !checkingRole;

  const {
    cafes,
    bookings,
    loadingData,
    error,
    membershipPlans,
    subscriptions,
    consolePricing,
    stationPricing,
    hasLoadedData,
    setSubscriptions,
    setBookings,
    refreshData,
    setCafes,
    setStationPricing,
    setConsolePricing
  } = useOwnerData(canFetchOwnerData, canAutoRefreshOwnerData, activeTab);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Centralised tab-change: always close mobile menu when navigating
  const handleTabChange = (tab: NavTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };




  const [viewingSubscription, setViewingSubscription] = useState<any>(null);
  const [subscriptionUsageHistory, setSubscriptionUsageHistory] = useState<any[]>([]);
  const [loadingUsageHistory, setLoadingUsageHistory] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<any>(null);
  const [customerBookings, setCustomerBookings] = useState<any[]>([]);
  const [, setLoadingCustomerData] = useState(false);



  // Multi-café support
  const [selectedCafeId, setSelectedCafeId] = useState<string>('');
  // Incremented after any status/payment change to trigger BookingsManagement re-fetch
  const [bookingsMgmtRefreshKey, setBookingsMgmtRefreshKey] = useState(0);
  const currentCafe = cafes.find(c => c.id === selectedCafeId) || cafes[0] || null;
  const currentCafeId = currentCafe?.id || '';

  // Subscription timer state
  const [activeTimers, setActiveTimers] = useState<Map<string, number>>(new Map()); // Now storing start time (epoch seconds or ms)
  const [timerElapsed, setTimerElapsed] = useState<Map<string, number>>(new Map());

  // Walk-in booking state (for billing tab)


  // Booking filters



  // Customer tab state
  const [customerSearch, setCustomerSearch] = useState("");
  const [hasSubscription, setHasSubscription] = useState(false);
  const [hasMembership, setHasMembership] = useState(false);
  const [customerSortBy, setCustomerSortBy] = useState<'name' | 'sessions' | 'totalSpent' | 'lastVisit'>('lastVisit');
  const [customerSortOrder, setCustomerSortOrder] = useState<'asc' | 'desc'>('desc');

  // Edit modal state
  const [editingBooking, setEditingBooking] = useState<BookingRow | null>(null);
  const [editingBookingItemId, setEditingBookingItemId] = useState<string | null>(null); // Track specific item for bulk bookings
  const [editConflictBase, setEditConflictBase] = useState<string | null>(null); // updated_at when modal was opened

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
  const [stationToDelete, setStationToDelete] = useState<{ name: string, displayName: string, type: string } | null>(null);
  const [deletingStation, setDeletingStation] = useState(false);

  // Station power toggle confirmation state
  const [pendingPowerToggle, setPendingPowerToggle] = useState<{ name: string; hasActiveSession: boolean } | null>(null);

  // Station power status (tracks which stations are powered off)
  const [poweredOffStations, setPoweredOffStations] = useState<Set<string>>(new Set());
  const [maintenanceStations, setMaintenanceStations] = useState<Set<string>>(new Set());

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
  const [editItems, setEditItems] = useState<Array<{ id?: string, console: string, quantity: number, duration: number, price?: number }>>([]);
  const [saving, setSaving] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteRemark, setDeleteRemark] = useState('');

  // Helper function for editing multiple items
  const updateEditItem = (index: number, updates: Partial<{ console: string, quantity: number, duration: number }>) => {
    setEditItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
    setEditAmountManuallyEdited(false);
  };



  // Snack Sale Modal state (standalone snack sales without a session)
  const [snackSaleModalOpen, setSnackSaleModalOpen] = useState(false);

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
  const [editingStation, setEditingStation] = useState<any>(null);
  const [savingPricing, setSavingPricing] = useState(false);
  const [applyToAll, setApplyToAll] = useState(false);

  // useBilling hook — only getBillingPrice is used here; Billing component owns the full form state
  const { getBillingPrice } = useBilling({
    enabled: activeTab === 'billing',
    selectedCafeId,
    consolePricing,
    stationPricing,
    cafeData: currentCafe,
    toast,
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

  // Persist active tab to localStorage + URL
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('ownerActiveTab', activeTab);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', activeTab);
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [activeTab, router]);

  // Initialize poweredOffStations from stationPricing
  useEffect(() => {
    const offStations = new Set<string>();
    Object.values(stationPricing).forEach((pricing: any) => {
      if (pricing.is_active === false) {
        offStations.add(pricing.station_name);
      }
    });
    setPoweredOffStations(offStations);
  }, [stationPricing]);

  // Save membership sub-tab to localStorage when it changes


  // Auto-refresh time every second for active sessions (only when sessions tab is active)
  useEffect(() => {
    // Only run timer when viewing sessions, dashboard, or bookings tabs
    if (activeTab !== 'sessions' && activeTab !== 'dashboard' && activeTab !== 'bookings') return;

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab]);





  // Populate editedCafe when cafes data loads
  useEffect(() => {
    if (currentCafe) {
      const cafe = currentCafe;
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
  }, [currentCafe]);

  // Initialize selected café when cafes load
  useEffect(() => {
    if (cafes.length === 0) return;
    if (!selectedCafeId || !cafes.some(cafe => cafe.id === selectedCafeId)) {
      if (selectedCafeId) {
        console.warn('[selectedCafe] Saved cafeId not found in loaded cafes — falling back to first cafe:', cafes[0]?.id);
      }
      setSelectedCafeId(cafes[0].id);
    }
  }, [cafes, selectedCafeId]);

  // Fetch gallery images when cafes data loads
  useEffect(() => {
    async function fetchGalleryImages() {
      if (activeTab !== 'settings') {
        return;
      }

      if (!currentCafeId) {
        setGalleryImages([]);
        return;
      }

      try {
        const res = await fetch(`/api/owner/gallery?cafeId=${currentCafeId}`);
        if (!res.ok) {
          toast.error('Failed to load gallery images');
          return;
        }
        const data = await res.json();
        setGalleryImages(data.images || []);
      } catch (err) {
        console.error('Gallery fetch error:', err);
        toast.error('Failed to load gallery images');
      }
    }

    fetchGalleryImages();
  }, [activeTab, currentCafeId]);

  // Realtime subscription removed — ISP blocks WebSocket to Supabase (ERR_CERT_COMMON_NAME_INVALID)
  // Mutations call refreshData() directly to keep UI in sync

  const handleEndSessionNow = () => {
    if (!editingBooking?.start_time || !editingBooking?.booking_date) return;

    // Build a full start datetime from booking_date + start_time to handle cross-midnight correctly
    const timeMatch = editingBooking.start_time.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
    if (!timeMatch) return;

    let h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    const period = timeMatch[3]?.toLowerCase();
    if (period === 'pm' && h !== 12) h += 12;
    else if (period === 'am' && h === 12) h = 0;

    const [y, mo, d] = editingBooking.booking_date.split('-').map(Number);
    const startDate = new Date(y, mo - 1, d, h, m, 0);
    const now = new Date();

    const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / 60000));

    // Round up to nearest 30 mins (minimum 30 mins) — always favours the cafe
    const roundedDuration = Math.max(30, Math.ceil(elapsedMinutes / 30) * 30);

    setEditDuration(roundedDuration);
    setEditStatus('completed');
    setEditAmountManuallyEdited(false);
    return roundedDuration;
  };

  // Fetch pricing on-demand when edit modal opens and pricing not yet loaded (e.g. from dashboard tab)
  useEffect(() => {
    if (!editingBooking) return;
    const cafeId = editingBooking.cafe_id || selectedCafeId;
    if (consolePricing[cafeId] && Object.keys(consolePricing[cafeId]).length > 0) return;

    void (async () => {
      try {
        const r = await fetch('/api/owner/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scope: 'full', tab: 'billing' }),
          credentials: 'include',
          cache: 'no-store',
        });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (data.consolePricing) setConsolePricing(data.consolePricing);
        if (data.stationPricing) setStationPricing(data.stationPricing);
      } catch (err) {
        console.error('Failed to fetch pricing for edit modal:', err);
        toast.error('Could not load pricing data. Amount may not auto-calculate correctly.');
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingBooking]);

  // Auto-calculate editAmount when inputs change
  useEffect(() => {
    if (editingBooking && !editAmountManuallyEdited) {
      const snacksPrice = editingBooking.booking_orders?.reduce((sum: number, order: any) => sum + (order.total_price || 0), 0) || 0;

      if (editItems.length > 0) {
        // Calculate sum of all items in editItems array using their specific durations
        let totalConsolesPrice = 0;
        editItems.forEach((item) => {
          totalConsolesPrice += getBillingPrice(item.console as ConsoleId, item.quantity || 1, item.duration || editDuration || 60);
        });
        setEditAmount((totalConsolesPrice + snacksPrice).toString());
      }
    }
  }, [editItems, editDuration, editingBooking, editAmountManuallyEdited, getBillingPrice]);

  const handleOrdersUpdated = ({
    amountDelta,
    bookingId,
    orders,
    updatedAt,
  }: {
    amountDelta: number;
    bookingId: string;
    orders: any[];
    updatedAt: string | null;
  }) => {
    const safeDelta = Number.isFinite(amountDelta) ? amountDelta : 0;

    refreshData();
    setBookingsMgmtRefreshKey(k => k + 1);

    setBookings(prev => prev.map((booking: any) => {
      if (booking.id !== bookingId && booking.originalBookingId !== bookingId) {
        return booking;
      }

      return {
        ...booking,
        booking_orders: orders,
        total_amount: Math.max(0, (Number(booking.total_amount) || 0) + safeDelta),
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      };
    }));

    if (editingBooking?.id === bookingId) {
      setEditingBooking(prev => (
        prev && prev.id === bookingId
          ? {
              ...prev,
              booking_orders: orders,
              total_amount: Math.max(0, (Number(prev.total_amount) || 0) + safeDelta),
              ...(updatedAt ? { updated_at: updatedAt } : {}),
            }
          : prev
      ));
      setEditAmount(prev => {
        const current = Number(prev);
        if (Number.isNaN(current)) return prev;
        return Math.max(0, current + safeDelta).toString();
      });
      if (updatedAt) setEditConflictBase(updatedAt);
    }
  };


  async function handlePaymentModeChange(bookingId: string, mode: string): Promise<boolean> {
    const booking = bookings.find(b => b.id === bookingId) as any;
    const trueBookingId = booking?.originalBookingId || (bookingId.includes('-item-') ? bookingId.split('-item-')[0] : bookingId);
    const normalizedMode = normaliseOwnerPaymentMode(mode);
    const prevMode = booking?.payment_mode;

    // Optimistic update — avoids waiting for the full refreshData round-trip
    setBookings(prev => prev.map((b: any) => {
      if (b.id === bookingId || b.originalBookingId === trueBookingId) {
        return { ...b, payment_mode: normalizedMode };
      }
      return b;
    }));

    const revertPaymentMode = () => setBookings(prev => prev.map((b: any) => {
      if (b.id === bookingId || b.originalBookingId === trueBookingId) return { ...b, payment_mode: prevMode };
      return b;
    }));

    try {
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: trueBookingId, booking: { payment_mode: normalizedMode } }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error('Failed to update payment mode: ' + (data.error || 'Unknown error'));
        revertPaymentMode();
        return false;
      }

      setBookingsMgmtRefreshKey(k => k + 1);
      dispatchOwnerBookingsChanged({ action: 'updated', bookingId: trueBookingId });
      return true;
    } catch (err) {
      console.error('Error updating payment mode:', err);
      revertPaymentMode();
      if (err instanceof Error && err.name === 'TimeoutError') {
        toast.error('Request timed out — payment mode may not have saved.');
      }
      return false;
    }
  }

  // Handle edit booking
  const handleBookingStatusChange = async (id: string, status: string) => {
    const trueBookingId = id.includes('-item-') ? id.split('-item-')[0] : id;
    // Optimistic update so badge changes immediately
    setBookings(prev => prev.map((b: any) =>
      b.id === trueBookingId || b.originalBookingId === trueBookingId ? { ...b, status } : b
    ));
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: trueBookingId, booking: { status } }),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('Error updating status:', data.error);
        toast.error('Failed to update booking status: ' + (data.error || 'Unknown error'));
        refreshData(); // revert by reloading
      } else {
        refreshData();
        setBookingsMgmtRefreshKey(k => k + 1);
      }
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update booking status');
      refreshData(); // revert
    }
  };

  async function handleEditBooking(booking: BookingRow) {
    // If this is a flattened booking entry (from bulk booking), find the original booking
    const originalBookingId = (booking as any).originalBookingId;
    const targetBookingId = originalBookingId || booking.id;

    // Track which specific booking_item is being edited (for bulk bookings)
    // The flattened entry has only one item in booking_items array
    const specificItemId = originalBookingId && booking.booking_items?.[0]?.id
      ? booking.booking_items[0].id
      : null;

    if (booking.deleted_at) {
      toast.error('Deleted bookings cannot be edited.');
      setBookingsMgmtRefreshKey(k => k + 1);
      dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: targetBookingId });
      return;
    }

    let actualBooking = originalBookingId
      ? bookings.find(b => b.id === originalBookingId) || booking
      : booking;

    try {
      const params = new URLSearchParams({ bookingId: targetBookingId });
      const res = await fetch(`/api/owner/bookings?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (res.status === 404) {
        toast.error('This booking was deleted or is no longer available.');
        setBookingsMgmtRefreshKey(k => k + 1);
        dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: targetBookingId });
        return;
      }

      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Failed to load the latest booking');
      }

      actualBooking = data.booking;

      if (specificItemId && !actualBooking.booking_items?.some((item) => item.id === specificItemId)) {
        toast.error('That booking item no longer exists.');
        setBookingsMgmtRefreshKey(k => k + 1);
        dispatchOwnerBookingsChanged({ action: 'updated', bookingId: targetBookingId });
        return;
      }
    } catch (err) {
      console.error('[handleEditBooking] Failed to load latest booking:', err);
      toast.error('Failed to load the latest booking details.');
      return;
    }

    // Allow editing all bookings, not just walk-ins
    debugLog('[handleEditBooking] Opening edit modal for booking:', {
      id: actualBooking.id?.slice(0, 8),
      start_time_raw: actualBooking.start_time,
      booking_date: actualBooking.booking_date,
      total_amount: actualBooking.total_amount,
      isFromFlattenedEntry: !!originalBookingId,
      specificItemId: specificItemId,
    });

    setEditingBooking(actualBooking);
    setEditingBookingItemId(specificItemId);
    setEditConflictBase(actualBooking.updated_at ?? null);
    setEditAmount(actualBooking.total_amount?.toString() || "");
    setEditAmountManuallyEdited(true); // Preserve DB amount on open; set to false when user changes items
    setEditStatus(actualBooking.status || "confirmed");
    setEditPaymentMethod(normaliseOwnerPaymentMode(actualBooking.payment_mode));
    setEditCustomerName(actualBooking.user_name || actualBooking.customer_name || "");
    setEditCustomerPhone(actualBooking.user_phone || actualBooking.customer_phone || "");
    setEditDate(actualBooking.booking_date || "");
    setEditDuration(actualBooking.duration || 60);
    if (actualBooking.booking_items && actualBooking.booking_items.length > 0) {
      const editableItems = specificItemId
        ? actualBooking.booking_items.filter((item) => item.id === specificItemId)
        : actualBooking.booking_items;

      setEditItems(editableItems.map(item => {
        const consoleType = normaliseConsoleType(item.console || "") || "ps5";

        const itemDuration = getBookingItemDuration(item, actualBooking.duration || 60);
        return {
          id: item.id,
          console: consoleType,
          quantity: item.quantity || 1,
          duration: itemDuration,
          price: item.price ?? undefined
        };
      }));

      const initialDuration = editableItems.reduce((max, item) => (
        Math.max(max, getBookingItemDuration(item, actualBooking.duration || 60))
      ), 0);
      setEditDuration(initialDuration || actualBooking.duration || 60);
    } else {
      const cafe = cafes.find(c => c.id === actualBooking.cafe_id) || currentCafe;
      const defaultConsole = getPreferredConsoleForCafe(cafe);
      setEditItems([{ console: defaultConsole, quantity: 1, duration: actualBooking.duration || 60 }]);
      setEditDuration(actualBooking.duration || 60);
    }

    // Helper functions removed from here (now at component level)

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

    const isAppBooking = !!editingBooking.user_id;
    const sanitizedCustomerName = editCustomerName.trim() || null;
    const sanitizedCustomerPhone = editCustomerPhone.trim() || null;
    const normalizedPaymentMode = normaliseOwnerPaymentMode(editPaymentMethod);

    // Client-side validation
    if (!isAppBooking && !sanitizedCustomerName) {
      toast.error('Customer name is required.');
      return;
    }
    if (sanitizedCustomerPhone && !/^\+?\d[\d\s\-()]{7,14}$/.test(sanitizedCustomerPhone)) {
      toast.error('Invalid phone number format.');
      return;
    }
    if (!editDate) {
      toast.error('Booking date is required.');
      return;
    }

    try {
      setSaving(true);

      debugLog('[handleSaveBooking] ===== SAVE BOOKING START =====');
      debugLog('[handleSaveBooking] Raw editAmount value:', editAmount, 'Type:', typeof editAmount);
      debugLog('[handleSaveBooking] editDuration:', editDuration);
      debugLog('[handleSaveBooking] editItems:', editItems);

      // Convert 24-hour time (HH:MM) to 12-hour format for DB (e.g., "10:30 am")
      const [hours, minutes] = editStartTime.split(':').map(Number);
      const period = hours >= 12 ? 'pm' : 'am';
      const hours12 = hours % 12 || 12;
      const startTime12h = `${hours12}:${minutes.toString().padStart(2, "0")} ${period}`;

      const updatedAmount = parseFloat(editAmount);

      // Validate the amount
      if (!editAmount || editAmount.trim() === '') {
        setSaving(false);
        toast.error('Amount cannot be empty.');
        return;
      }
      if (isNaN(updatedAmount)) {
        console.error('[handleSaveBooking] ERROR: Invalid amount - parseFloat returned NaN from:', editAmount);
        setSaving(false);
        toast.error('Invalid amount entered. Please enter a valid number.');
        return;
      }
      if (updatedAmount < 0) {
        setSaving(false);
        toast.error('Amount cannot be negative.');
        return;
      }

      debugLog('[handleSaveBooking] Parsed amount:', updatedAmount);
      debugLog('[handleSaveBooking] Booking ID:', editingBooking.id);

      const isSingleItemEdit = Boolean(editingBookingItemId);
      const buildItemPayload = (item: { id?: string; console: string; quantity: number; duration: number }, originalItem?: { title?: string | null }) => ({
        id: item.id,
        console: item.console,
        quantity: item.quantity,
        title: buildBookingItemTitle(originalItem?.title, item.duration || 60),
        price: getBillingPrice(item.console as ConsoleId, item.quantity, item.duration || 60) || 0,
      });

      const nextBookingItems = isSingleItemEdit && editingBookingItemId
        ? (editingBooking.booking_items || []).map((existingItem: any) => {
            if (existingItem.id !== editingBookingItemId) return existingItem;
            const updatedItem = editItems[0];
            if (!updatedItem) return existingItem;
            const payload = buildItemPayload(updatedItem, existingItem);
            return {
              ...existingItem,
              console: payload.console,
              quantity: payload.quantity,
              title: payload.title,
              price: payload.price,
            };
          })
        : editItems.map((item, idx) => {
            const originalItem = editingBooking.booking_items?.find((existingItem: any) => existingItem.id === item.id);
            const payload = buildItemPayload(item, originalItem);
            return {
              id: item.id || `temp-item-${idx}`,
              booking_id: editingBooking.id,
              console: payload.console,
              quantity: payload.quantity,
              title: payload.title,
              price: payload.price,
            };
          });

      // Auto-restore in-progress if a completed booking is extended into the future
      const newDuration = nextBookingItems.reduce((max, item) => (
        Math.max(max, getBookingItemDuration(item, editingBooking.duration || 60))
      ), 0);
      let resolvedStatus = editStatus;
      if (editStatus === 'completed') {
        const timeParts = startTime12h.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (timeParts) {
          let h = parseInt(timeParts[1]);
          const m = parseInt(timeParts[2]);
          const period = timeParts[3];
          if (period?.toLowerCase() === 'pm' && h !== 12) h += 12;
          else if (period?.toLowerCase() === 'am' && h === 12) h = 0;
          const endMins = h * 60 + m + newDuration;
          const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
          if (endMins > nowMins) resolvedStatus = 'in-progress';
        }
      }

      // Update booking via server API route (bypasses ISP block)
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: editingBooking.id,
          updatedAtCheck: editConflictBase,
          ...(isSingleItemEdit && editingBookingItemId && editItems[0]
            ? {
                bookingItemId: editingBookingItemId,
                item: buildItemPayload(
                  editItems[0],
                  editingBooking.booking_items?.find((existingItem: any) => existingItem.id === editingBookingItemId)
                ),
              }
            : {
                items: editItems.map((item) => {
                  const originalItem = editingBooking.booking_items?.find((existingItem: any) => existingItem.id === item.id);
                  return buildItemPayload(item, originalItem);
                }),
              }),
          booking: {
            total_amount: updatedAmount,
            status: resolvedStatus,
            payment_mode: normalizedPaymentMode,
            customer_name: sanitizedCustomerName,
            customer_phone: sanitizedCustomerPhone,
            booking_date: editDate,
            start_time: startTime12h,
            duration: newDuration,
          },
        }),
      });

      if (res.status === 409) {
        setSaving(false);
        toast.error('This booking was modified by someone else. Please close and reopen it to get the latest version.');
        return;
      }

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
              status: resolvedStatus,
              payment_mode: normalizedPaymentMode,
              customer_name: sanitizedCustomerName,
              customer_phone: sanitizedCustomerPhone,
              user_name: sanitizedCustomerName ?? b.user_name ?? b.customer_name,
              user_phone: sanitizedCustomerPhone ?? b.user_phone ?? b.customer_phone,
              booking_date: editDate,
              start_time: startTime12h,
              duration: newDuration,
              booking_items: nextBookingItems.map((item: any, idx: number) => ({
                ...item,
                id: item.id || `temp-item-${idx}`,
                booking_id: b.id,
              })),
            }
            : b
        )
      );

      debugLog('[handleSaveBooking] Update complete - local state updated');

      setEditingBooking(null);
      setEditingBookingItemId(null);
      setBookingsMgmtRefreshKey(k => k + 1);
      toast.success("Booking updated successfully!");
      dispatchOwnerBookingsChanged({ action: 'updated', bookingId: editingBooking.id });
      refreshData();
    } catch (err) {
      console.error("Error updating booking:", err);
      toast.error("Failed to update booking: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteBooking() {
    if (!editingBooking) return;

    try {
      setDeletingBooking(true);

      debugLog('[handleDeleteBooking] ===== DELETE BOOKING START =====');
      debugLog('[handleDeleteBooking] Booking ID:', editingBooking.id);
      debugLog('[handleDeleteBooking] Specific item ID:', editingBookingItemId);
      debugLog('[handleDeleteBooking] Booking details:', {
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
        const remainingItems = allItems.filter(item => item.id !== editingBookingItemId);
        // Use editingBooking.total_amount as base and subtract the deleted item's price
        // to avoid wiping total to ₹0 when item.price is null (older bookings)
        const deletedItem = allItems.find(item => item.id === editingBookingItemId);
        const deletedPrice = (deletedItem as any)?.price || 0;
        const newTotalAmount = deletedPrice > 0
          ? Math.max(0, (editingBooking.total_amount || 0) - deletedPrice)
          : remainingItems.reduce((sum: number, item: any) => sum + (item.price || 0), 0);

        const res = await fetch('/api/owner/billing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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

        setBookingsMgmtRefreshKey(k => k + 1);
        dispatchOwnerBookingsChanged({ action: 'updated', bookingId: editingBooking.id });
        toast.success("Console removed from booking successfully!");
      } else {
        // Delete the entire booking (soft-delete)
        const bookingItemIds = allItems.map(item => item.id);

        const res = await fetch('/api/owner/billing', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            bookingId: editingBooking.id,
            bookingItemIds,
            deleted_remark: deleteRemark.trim() || null,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to delete booking');
        }

        // Remove from local state (soft-deleted = hidden from normal view)
        setBookings((prev) => prev.filter((b) => b.id !== editingBooking.id && (b as any).originalBookingId !== editingBooking.id));
        setBookingsMgmtRefreshKey(k => k + 1);
        dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: editingBooking.id });
      }

      debugLog('[handleDeleteBooking] ===== DELETE BOOKING COMPLETE =====');

      setEditingBooking(null);
      setEditingBookingItemId(null);
      setShowDeleteConfirm(false);
      setDeleteRemark('');
    } catch (err) {
      console.error("[handleDeleteBooking] ===== DELETE BOOKING FAILED =====");
      console.error("Error deleting booking:", err);
      toast.error("Failed to delete booking: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setDeletingBooking(false);
    }
  }

  // Subscription timer handlers
  async function handleStartTimer(subscriptionId: string) {
    debugLog('[Timer] Starting timer for subscription:', subscriptionId);
    // Don't start if already running
    if (activeTimers.has(subscriptionId)) {
      debugLog('[Timer] Timer already running for:', subscriptionId);
      return;
    }

    const startTime = Date.now();
    const startTimeISO = new Date(startTime).toISOString();

    // Get subscription details to find console type
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    if (!subscription) {
      toast.error('Subscription not found');
      return;
    }

    const rawConsoleType = subscription.membership_plans?.console_type;
    if (!rawConsoleType) {
      toast.error('Console type not found for this membership');
      return;
    }
    const normConsoleType = normaliseConsoleType(rawConsoleType);

    // Find an available console station
    // Get all active subscriptions for this console type
    const activeConsolesForType = subscriptions.filter(s =>
      s.timer_active &&
      s.assigned_console_station &&
      normaliseConsoleType(s.membership_plans?.console_type || '') === normConsoleType
    ).map(s => s.assigned_console_station);

    // Get total console count from cafe
    const cafe = cafes.find(c => c.id === subscription.cafe_id);
    if (!cafe) {
      toast.error('Cafe not found');
      return;
    }

    // Map normalised console types to cafe count fields
    const consoleCountMap: Record<string, keyof typeof cafe> = {
      'pc': 'pc_count',
      'ps5': 'ps5_count',
      'ps4': 'ps4_count',
      'xbox': 'xbox_count',
      'pool': 'pool_count',
      'snooker': 'snooker_count',
      'arcade': 'arcade_count',
      'vr': 'vr_count',
      'steering': 'steering_wheel_count',
      'racing_sim': 'racing_sim_count'
    };

    const countField = consoleCountMap[normConsoleType];
    const totalConsoles = countField ? (cafe[countField] as number) || 0 : 0;

    if (totalConsoles === 0) {
      toast.error(`No ${rawConsoleType} consoles available at this cafe`);
      return;
    }

    // Find first available console station
    let assignedStation: string | null = null;
    const consolePrefix = normConsoleType;

    for (let i = 1; i <= totalConsoles; i++) {
      const stationId = `${consolePrefix}-${i.toString().padStart(2, '0')}`;
      if (!activeConsolesForType.includes(stationId)) {
        assignedStation = stationId;
        break;
      }
    }

    if (!assignedStation) {
      toast.error(`All ${rawConsoleType} consoles are currently occupied`);
      return;
    }

    debugLog('[Timer] Assigning console station:', assignedStation);

    // Save timer state and assigned console to database
    try {
      const response = await fetch('/api/owner/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: subscriptionId,
          updates: {
            timer_active: true,
            timer_start_time: startTimeISO,
            assigned_console_station: assignedStation,
            updated_at: new Date().toISOString()
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Timer] Failed to save timer state:', errorData);
        toast.error('Failed to start timer');
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
      toast.error('Failed to start timer');
      return;
    }

    // Set local timer state
    setActiveTimers(prev => new Map(prev).set(subscriptionId, startTime));
    debugLog('[Timer] Timer started successfully');
  }

  async function handleStopTimer(subscriptionId: string) {
    debugLog('[Timer] Stopping timer for subscription:', subscriptionId);
    const startTime = activeTimers.get(subscriptionId);
    if (!startTime) {
      debugLog('[Timer] No timer found for:', subscriptionId);
      return;
    }

    // Calculate total elapsed time in hours
    const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000); // Calculate directly from start time
    const elapsedHours = elapsedSeconds / 3600; // convert seconds to hours
    debugLog('[Timer] Elapsed:', elapsedSeconds, 'seconds =', elapsedHours.toFixed(4), 'hours');

    // Update subscription hours in database
    const subscription = subscriptions.find(s => s.id === subscriptionId);
    if (subscription) {
      const newHoursRemaining = Math.max(0, (subscription.hours_remaining || 0) - elapsedHours);
      debugLog('[Timer] Updating hours:', subscription.hours_remaining, '->', newHoursRemaining);

      try {
        // Save usage history
        const endTime = new Date();
        const startTimeDate = new Date(startTime);

        const response = await fetch('/api/owner/subscriptions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: subscriptionId,
            updates: {
              hours_remaining: newHoursRemaining,
              timer_active: false,
              timer_start_time: null,
              assigned_console_station: null,
              updated_at: new Date().toISOString(),
              ...(subscription.membership_plans?.plan_type === 'day_pass' && { status: 'expired' }),
            },
            usageEntry: {
              session_date: getLocalDateString(),
              start_time: startTimeDate.toISOString(),
              end_time: endTime.toISOString(),
              duration_hours: elapsedHours,
              assigned_console_station: subscription.assigned_console_station
            }
          }),
        });

        const responseData = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error('[Timer] Database error:', responseData);
          toast.error('Failed to update subscription hours');
          return;
        }
        if (responseData?.partialSuccess) {
          console.warn('[Timer] Usage history insert failed but subscription updated:', subscriptionId);
          toast.warning('Session time deducted, but usage history could not be saved.');
        }

        debugLog('[Timer] Database updated successfully');

        // Update local state
        const isDayPass = subscription.membership_plans?.plan_type === 'day_pass';
        setSubscriptions(prev => prev.map(s =>
          s.id === subscriptionId
            ? { ...s, hours_remaining: newHoursRemaining, timer_active: false, timer_start_time: null, assigned_console_station: null, ...(isDayPass && { status: 'expired' }) }
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

        debugLog('[Timer] Timer stopped successfully');
        const hours = Math.floor(elapsedHours);
        const minutes = Math.floor((elapsedHours - hours) * 60);
        const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        toast.success(`Session ended. ${timeStr} deducted from subscription.`);
      } catch (err) {
        console.error('[Timer] Exception:', err);
        toast.error('Failed to stop timer');
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
    debugLog('[Timer] Checking for active timers to restore...');
    const todayStr = getLocalDateString();
    subscriptions.forEach(subscription => {
      // Check if this subscription has an active timer in the database
      if (subscription.timer_active && subscription.timer_start_time && !activeTimers.has(subscription.id) && (subscription.hours_remaining || 0) > 0) {
        const startDateStr = subscription.timer_start_time.slice(0, 10);
        const isDayPass = subscription.membership_plans?.plan_type === 'day_pass';

        // Day pass from a previous day — auto-expire instead of restoring
        if (isDayPass && startDateStr < todayStr) {
          debugLog('[Timer] Day pass from previous day, auto-expiring:', subscription.id);
          fetch('/api/owner/subscriptions', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: subscription.id,
              updates: {
                timer_active: false,
                timer_start_time: null,
                assigned_console_station: null,
                status: 'expired',
                updated_at: new Date().toISOString(),
              },
            }),
          }).then(() => {
            setSubscriptions(prev => prev.map(s =>
              s.id === subscription.id
                ? { ...s, timer_active: false, timer_start_time: null, assigned_console_station: null, status: 'expired' }
                : s
            ));
          }).catch(err => console.error('[Timer] Failed to auto-expire day pass:', err));
          return;
        }

        debugLog('[Timer] Restoring timer for subscription:', subscription.id);
        const dbStartTime = new Date(subscription.timer_start_time).getTime();
        const restoredElapsed = Math.floor((Date.now() - dbStartTime) / 1000);

        // Add to active timers and immediately seed elapsed so UI shows correct time on reload
        setActiveTimers(prev => new Map(prev).set(subscription.id, dbStartTime));
        setTimerElapsed(prev => new Map(prev).set(subscription.id, restoredElapsed));

        debugLog('[Timer] Timer restored.');
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

      debugLog('[UsageHistory] Fetching usage history for subscription:', viewingSubscription.id);
      setLoadingUsageHistory(true);
      const response = await fetch(
        `/api/owner/subscriptions/usage?subscriptionId=${viewingSubscription.id}`
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('[UsageHistory] Error fetching usage history:', payload);
        setSubscriptionUsageHistory([]);
      } else {
        debugLog('[UsageHistory] Fetched usage history:', payload.usageHistory);
        setSubscriptionUsageHistory(payload.usageHistory || []);
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
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    const expiredBookings = bookings.filter((b: any) => {
      if (b.status !== 'in-progress') return false;
      const isToday = b.booking_date === todayStr;
      const isYesterday = b.booking_date === yesterdayStr;
      if (!isToday && !isYesterday) return false;
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
      // For sessions from yesterday that cross midnight, add 1440 to current minutes
      const effectiveCurrentMinutes = isYesterday ? currentMinutes + 1440 : currentMinutes;
      return effectiveCurrentMinutes >= endMinutes;
    });

    if (expiredBookings.length === 0) return;

    const expiredIds = new Set(expiredBookings.map((b: any) => b.id));

    // Immediately update local state so they disappear from Active Sessions
    setBookings((prev: any[]) =>
      prev.map((b: any) => expiredIds.has(b.id) ? { ...b, status: 'completed' } : b)
    );

    // Persist to DB — revert local state if any call fails
    expiredBookings.forEach(async (b: any) => {
      try {
        const res = await fetch('/api/owner/billing', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: b.id, booking: { status: 'completed' } }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Unknown error');
      } catch (err) {
        console.error('Failed to auto-complete booking:', b.id, err);
        setBookings((prev: any[]) => prev.map((x: any) => x.id === b.id ? { ...x, status: 'in-progress' } : x));
      }
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
        debugLog('No phone number for customer:', viewingCustomer);
        setCustomerBookings([]);
        setLoadingCustomerData(false);
        return;
      }

      setLoadingCustomerData(true);

      debugLog('Fetching bookings for phone:', viewingCustomer.phone, 'cafe:', selectedCafeId);

      const response = await fetch(
        `/api/owner/customers/bookings?cafeId=${selectedCafeId}&phone=${encodeURIComponent(viewingCustomer.phone)}`
      );
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('Error fetching bookings:', payload);
        setCustomerBookings([]);
      } else {
        debugLog('Successfully fetched bookings:', payload.bookings?.length || 0, 'bookings');
        setCustomerBookings(payload.bookings || []);
      }
      setLoadingCustomerData(false);
    }
    fetchCustomerData();
  }, [viewingCustomer, selectedCafeId]);

  const handleViewCustomer = (customer: {
    activeSubscription?: any;
    email?: string | null;
    lastVisit?: string;
    name: string;
    phone?: string | null;
    sessions?: number;
    totalSpent?: number;
  }) => {
    const activeSub = customer.activeSubscription || (
      customer.phone
        ? subscriptions.find((subscription) =>
          (subscription.customer_phone === customer.phone || subscription.customer_name === customer.name) &&
          subscription.status === 'active' &&
          (!subscription.expiry_date || new Date(subscription.expiry_date) > new Date())
        )
        : null
    );

    setViewingCustomer({
      ...customer,
      activeSubscription: activeSub || null,
    });
  };

  // Handle settings save
  const handleSaveSettings = async () => {
    if (!currentCafeId) return;

    setSavingSettings(true);
    try {
      // Combine opening and closing time into opening_hours format
      const opening_hours = `Mon-Sun: ${editedCafe.opening_time} - ${editedCafe.closing_time}`;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cafeId: currentCafeId,
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
      setCafes(prev => prev.map((c) => c.id === currentCafeId ? {
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
      toast.success('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings. Please try again.');
    } finally {
      setSavingSettings(false);
    }
  };

  // Handle add new station
  const handleAddStation = async () => {
    if (!currentCafe || newStationCount < 1) return;

    setAddingStation(true);
    try {
      const columnName = `${newStationType}_count`;
      const currentCount = (currentCafe as any)[columnName] || 0;
      const newCount = currentCount + newStationCount;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cafeId: currentCafeId, updates: { [columnName]: newCount } }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to add station'); }

      // Update local state
      setCafes(prev => prev.map((c) => c.id === currentCafeId ? {
        ...c,
        [columnName]: newCount,
      } : c));

      setShowAddStationModal(false);
    } catch (error) {
      console.error('Error adding station:', error);
      toast.error('Failed to add station. Please try again.');
    } finally {
      setAddingStation(false);
    }
  };

  // Handle toggle station power — shows confirmation before powering off
  const handleTogglePower = (stationName: string) => {
    const isCurrentlyOff = poweredOffStations.has(stationName);
    if (isCurrentlyOff) {
      // Powering back on — no confirmation needed
      void executePowerToggle(stationName, true);
      return;
    }
    const hasActiveSession = bookings.some(
      b => b.status === 'in-progress' && b.booking_items?.some(
        (bi: any) => getAssignedStationsFromItemTitle(bi.title).includes(stationName.toLowerCase())
      )
    );
    setPendingPowerToggle({ name: stationName, hasActiveSession });
  };

  const executePowerToggle = async (stationName: string, isCurrentlyOff: boolean) => {
    // Optimistic update
    setPoweredOffStations(prev => {
      const newSet = new Set(prev);
      if (isCurrentlyOff) {
        newSet.delete(stationName);
      } else {
        newSet.add(stationName);
      }
      return newSet;
    });

    try {
      // Persist is_active toggle via upsert — conflict key is cafe_id,station_name
      const stationNumber = parseInt(stationName.split('-')[1]);
      // Reuse existing station_type from pricing map if available, otherwise derive from name
      const existingPricing = stationPricing[stationName];
      const stationType = existingPricing?.station_type || stationName.split('-')[0];

      const res = await fetch('/api/station-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          powerToggleOnly: true,
          pricingData: {
            cafe_id: currentCafeId,
            station_name: stationName,
            station_type: stationType,
            station_number: stationNumber,
            is_active: isCurrentlyOff // true = turning on, false = turning off
          }
        }),
      });

      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update power state'); }
    } catch (error) {
      console.error('Error toggling power:', error);
      // Revert optimistic update on error
      setPoweredOffStations(prev => {
        const newSet = new Set(prev);
        if (isCurrentlyOff) {
          newSet.add(stationName);
        } else {
          newSet.delete(stationName);
        }
        return newSet;
      });
      toast.error('Failed to update station power status. Please try again.');
    }
  };

  const handleToggleMaintenance = (stationName: string) => {
    setMaintenanceStations(prev => {
      const next = new Set(prev);
      if (next.has(stationName)) next.delete(stationName);
      else next.add(stationName);
      return next;
    });
  };

  // Handle profile photo upload
  const handleProfilePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !currentCafe) return;

    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentCafeId}/profile-${Date.now()}.${fileExt}`;

    setUploadingProfilePhoto(true);
    try {
      // Delete old profile photo if exists
      if (currentCafe.cover_url) {
        const oldPath = currentCafe.cover_url.split('/').pop();
        if (oldPath) {
          await supabase.storage.from('cafe_images').remove([`${currentCafeId}/${oldPath}`]);
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
        body: JSON.stringify({ cafeId: currentCafeId, updates: { cover_url: publicUrl } }),
      });
      if (!updateRes.ok) { const d = await updateRes.json(); throw new Error(d.error || 'Failed to update photo'); }

      // Update local state
      setCafes(prev => prev.map((c) => c.id === currentCafeId ? { ...c, cover_url: publicUrl } : c));
      toast.success('Profile photo updated successfully!');
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      toast.error('Failed to upload profile photo. Please try again.');
    } finally {
      setUploadingProfilePhoto(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle profile photo delete
  const handleProfilePhotoDelete = async () => {
    if (!currentCafe || !currentCafe.cover_url) return;

    try {
      const oldPath = currentCafe.cover_url.split('/').pop();
      if (oldPath) {
        await supabase.storage.from('cafe_images').remove([`${currentCafeId}/${oldPath}`]);
      }

      // Update database via API
      const delRes = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cafeId: currentCafeId, updates: { cover_url: null } }),
      });
      if (!delRes.ok) { const d = await delRes.json(); throw new Error(d.error || 'Failed to delete photo'); }

      // Update local state
      setCafes(prev => prev.map((c) => c.id === currentCafeId ? { ...c, cover_url: null } : c));
      toast.success('Profile photo deleted successfully!');
    } catch (error) {
      console.error('Error deleting profile photo:', error);
      toast.error('Failed to delete profile photo. Please try again.');
    }
  };

  // Handle gallery photo upload
  const handleGalleryPhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !currentCafeId) return;

    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${currentCafeId}/gallery-${Date.now()}.${fileExt}`;

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
        body: JSON.stringify({ cafeId: currentCafeId, imageUrl: publicUrl }),
      });
      if (!galleryRes.ok) { const d = await galleryRes.json(); throw new Error(d.error || 'Failed to save gallery image'); }
      const { image } = await galleryRes.json();

      // Update local state
      if (image) {
        setGalleryImages(prev => [image, ...prev]);
      }
      toast.success('Gallery photo added successfully!');
    } catch (error) {
      console.error('Error uploading gallery photo:', error);
      toast.error('Failed to upload gallery photo. Please try again.');
    } finally {
      setUploadingGalleryPhoto(false);
      // Reset input
      event.target.value = '';
    }
  };

  // Handle gallery photo delete
  const handleGalleryPhotoDelete = async (imageId: string, imageUrl: string) => {
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
      toast.success('Gallery photo deleted successfully!');
    } catch (error) {
      console.error('Error deleting gallery photo:', error);
      toast.error('Failed to delete gallery photo. Please try again.');
    }
  };

  // Handle delete station
  const handleDeleteStation = async () => {
    if (!stationToDelete || !currentCafe) return;

    setDeletingStation(true);
    try {
      // Map station type to column name (e.g., "PS5" -> "ps5_count")
      const columnName = `${stationToDelete.type.toLowerCase().replace(/\s+/g, '_')}_count`;
      const currentCount = (currentCafe as any)[columnName] || 0;

      if (currentCount <= 0) {
        toast.warning('No stations to delete');
        setStationToDelete(null);
        return;
      }

      const newCount = currentCount - 1;

      const res = await fetch('/api/owner/cafes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ cafeId: currentCafeId, updates: { [columnName]: newCount } }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete station'); }

      // Also delete the station_pricing row for this specific station (fire-and-forget)
      fetch(`/api/station-pricing?cafeId=${currentCafeId}&stationName=${encodeURIComponent(stationToDelete.name)}`, {
        method: 'DELETE',
        credentials: 'include',
      }).catch(() => {}); // non-critical — stale pricing rows don't break anything

      // Update local state — don't call refreshData() here because Supabase
      // read-after-write lag can return the old count and undo the local update
      setCafes(prev => prev.map((c) => c.id === currentCafeId ? {
        ...c,
        [columnName]: newCount,
      } : c));
      setStationToDelete(null);
      toast.success(`Station deleted successfully`);
    } catch (error) {
      console.error('Error deleting station:', error);
      toast.error('Failed to delete station. Please try again.');
    } finally {
      setDeletingStation(false);
    }
  };

  // Loading state
  if (checkingRole && !hasLoadedData) {
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

  if (!allowed && !hasLoadedData) {
    return null;
  }

  // Dark theme colors




  return (
    <>
      <DashboardLayout
        activeTab={activeTab}
        onTabChange={(tab: string) => handleTabChange(tab as NavTab)}
        cafeName={currentCafe?.name || (cafes.length > 0 ? "Your Café" : "Loading...")}
        isMobile={isMobile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        title="Dashboard"
        onRefresh={refreshData}
      >
        <div className="px-4 pt-5 pb-28 md:px-8 md:pb-10">
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

          {/* Loading skeleton — shown on first load before any data arrives */}
          {loadingData && !bookings.length && activeTab !== 'billing' && activeTab !== 'reports' && activeTab !== 'coupons' && (
            <TabSkeleton cards={4} tableRows={6} />
          )}

          {/* Dashboard Tab - New Design */}
          {!loadingData && activeTab === 'dashboard' && (
            <ErrorBoundary>
            <div className="space-y-5">

              {/* Ending Soon Alert Banner */}
              {(() => {
                const now = new Date();
                const currentMinutes = now.getHours() * 60 + now.getMinutes();
                const endingSoon = bookings.filter((b: any) => {
                  if (b.status !== 'in-progress' || b.booking_date !== getLocalDateString()) return false;
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
                        {endingSoon.map((b: any) => b.customer_name || 'Guest').join(', ')}
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

              {/* KPI Stats */}
              <DashboardStats
                bookings={bookings}
                subscriptions={subscriptions}
                activeTimers={activeTimers}
                loadingData={loadingData}
                isMobile={isMobile}
              />


              {/* Active Sessions */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm text-slate-500" style={{ fontVariant: 'all-small-caps', letterSpacing: '0.12em', fontWeight: 600 }}>Active Sessions</h2>
                    {(() => {
                      const count = bookings.filter((b: any) => b.status === 'in-progress' && b.booking_date === getLocalDateString()).length;
                      return count > 0 ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px]" style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5', border: '1px solid transparent' }}>
                          <span className="relative inline-block w-1.5 h-1.5 rounded-full bg-red-400 pulse-dot" style={{ color: '#ef4444' }} />
                          {count} live
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <button onClick={() => handleTabChange('bookings')} className="text-[12px] text-slate-500 hover:text-white flex items-center gap-1 transition-colors">
                    View all <ChevronRight size={12} />
                  </button>
                </div>
                <ActiveSessions
                  bookings={bookings}
                  subscriptions={subscriptions}
                  activeTimers={activeTimers}
                  timerElapsed={timerElapsed}
                  currentTime={currentTime}
                  onAddTime={handleEditBooking}
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
                />
              </section>

              {/* Today's Bookings — clean design-matching table */}
              <DashboardBookingsTable
                bookings={bookings.filter((b: any) =>
                  b.booking_date === getLocalDateString() &&
                  (!currentCafeId || b.cafe_id === currentCafeId) &&
                  isSessionBooking(b)
                )}
                onViewAll={() => handleTabChange('bookings')}
                onEdit={handleEditBooking}
                onPaymentModeChange={handlePaymentModeChange}
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
                  bookings={bookings as any[]}
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

                const weeklyBookings = bookings.filter((b: any) => {
                  const bDate = b.booking_date;
                  return bDate >= lastWeekStr && bDate <= todayStr && isSessionBooking(b);
                });

                const weeklyRevenue = weeklyBookings
                  .filter((b: any) => b.status !== 'cancelled' && b.status !== 'in-progress' && b.payment_mode !== 'owner')
                  .reduce((sum: number, b: any) => sum + (b.total_amount || 0), 0);

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
                const todayDone = bookings.filter((b: any) =>
                  b.booking_date === todayStr &&
                  b.status !== 'cancelled' &&
                  b.payment_mode !== 'owner' &&
                  b.source !== 'membership'
                );
                const cashTotal = todayDone
                  .filter((b: any) => b.payment_mode?.toLowerCase() === 'cash')
                  .reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
                const upiTotal = todayDone
                  .filter((b: any) => b.payment_mode?.toLowerCase() !== 'cash')
                  .reduce((s: number, b: any) => s + (b.total_amount || 0), 0);
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
          )}


          {/* Bookings Tab */}
          {activeTab === 'bookings' && (
            <ErrorBoundary>
            <BookingsManagement
              cafeId={selectedCafeId || undefined}
              loading={loadingData}
              onUpdateStatus={handleBookingStatusChange}
              onEdit={handleEditBooking}
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
                await handleBookingStatusChange(bookingId, 'completed');
              }}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
            />
            </ErrorBoundary>
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
                      {currentCafe?.name || "Your Gaming Café"}
                    </h2>
                    {currentCafe?.address && (
                      <div style={{ fontSize: 15, color: theme.textSecondary, display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                        <span>📍</span>
                        {currentCafe.address}
                      </div>
                    )}
                  </div>

                  {/* Café Description */}
                  {currentCafe?.description && (
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
                      {currentCafe.description}
                    </div>
                  )}

                  {/* Action Button */}
                  <button
                    onClick={() => {
                      if (!currentCafeId) return;
                      router.push(`/owner/cafes/${currentCafeId}`);
                    }}
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


          {/* Customers Tab */}
          {activeTab === 'customers' && (
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
          )}

          {/* Stations Tab */}
          {activeTab === 'stations' && cafes.length > 0 && (
            <ErrorBoundary>
            <StationsTab
              currentCafe={currentCafe}
              bookings={bookings}
              stationPricing={stationPricing}
              poweredOffStations={poweredOffStations}
              maintenanceStations={maintenanceStations}
              isMobile={isMobile}
              onTogglePower={handleTogglePower}
              onToggleMaintenance={handleToggleMaintenance}
              onEditPricing={(station) => setEditingStation(station)}
              onDeleteStation={(station) => setStationToDelete(station)}
              onAddStation={() => {
                setNewStationType('ps5');
                setNewStationCount(1);
                setShowAddStationModal(true);
              }}
              theme={theme}
            />
            </ErrorBoundary>
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
            <ErrorBoundary>
            <Memberships
              isMobile={isMobile}
              cafeId={currentCafeId}
              cafeOpeningHours={currentCafe?.opening_hours || ''}
              subscriptions={subscriptions}
              membershipPlans={membershipPlans}
              activeTimers={activeTimers}
              timerElapsed={timerElapsed}
              onStartTimer={handleStartTimer}
              onStopTimer={handleStopTimer}
              onRefresh={() => refreshData()}
            />
            </ErrorBoundary>
          )}

          {/* Coupons Tab */}
          {activeTab === 'coupons' && (
            <ErrorBoundary>
            <Coupons
              isMobile={isMobile}
              cafeId={currentCafeId}
              onRefresh={() => refreshData()}
            />
            </ErrorBoundary>
          )}

          {/* Reports Tab */}
          {activeTab === 'reports' && (
            <ErrorBoundary>
            <Reports
              cafeId={currentCafeId}
              cafeName={currentCafe?.name ?? undefined}
              isMobile={isMobile}
              openingHours={currentCafe?.opening_hours ?? undefined}
            />
            </ErrorBoundary>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <ErrorBoundary>
            <Inventory
              cafeId={currentCafeId}
            />
            </ErrorBoundary>
          )}

          {/* Billing Tab - Quick Booking Interface */}

          {activeTab === 'billing' && (
            <ErrorBoundary>
            <div>
              <Billing
                cafeId={currentCafeId}
                cafes={cafes}
                isMobile={isMobile}
                onSnackOnlySale={() => setSnackSaleModalOpen(true)}
                pricingData={consolePricing[currentCafeId] || {}}
                stationPricingList={Object.values(stationPricing).filter((station: any) => !currentCafeId || station?.cafe_id === currentCafeId)}
                membershipPlans={membershipPlans.filter((p: any) => p.cafe_id === currentCafeId)}
                onSuccess={() => {
                  refreshData();
                  handleTabChange('dashboard');
                }}
                onMembershipSuccess={() => {
                  refreshData();
                  handleTabChange('memberships');
                }}
              />
            </div>
            </ErrorBoundary>
          )}


          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <ErrorBoundary>
            <SettingsTab
              theme={theme}
              fonts={fonts}
              cafes={currentCafe ? [currentCafe] : []}
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
            </ErrorBoundary>
          )}
        </div>
      </DashboardLayout>

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
          status={editStatus} setStatus={setEditStatus}
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
          cafe={cafes.find(c => c.id === editingBooking.cafe_id) || currentCafe}
          getBillingPrice={getBillingPrice}
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
                      { label: "Duration", value: editingBooking.duration ? `${editingBooking.duration} min` : "—" },
                      { label: "Amount", value: `₹${editingBooking.total_amount?.toLocaleString() || 0}` },
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
                    Reason for Deletion <span style={{ color: "#ef4444" }}>*</span>
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
                      border: `1px solid ${deleteRemark.trim() ? "rgba(56,189,248,0.4)" : "rgba(239,68,68,0.4)"}`,
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
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#ef4444" }}>A reason is required to delete this booking.</p>
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
                    background: (deletingBooking || !deleteRemark.trim()) ? "rgba(100,116,139,0.3)" : "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
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
                      const { data: updatedPricing } = await supabase
                        .from("station_pricing")
                        .select("*")
                        .eq("cafe_id", currentCafeId);

                      if (updatedPricing) {
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
                  background: "linear-gradient(135deg, #ef4444, #dc2626)",
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
                  background: "rgba(239, 68, 68, 0.1)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
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
              const response = await fetch(`/api/owner/subscriptions?id=${id}`, {
                method: 'DELETE'
              });
              const payload = await response.json().catch(() => ({}));

              if (response.ok) {
                setSubscriptions(subscriptions.filter(s => s.id !== id));
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
