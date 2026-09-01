"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState, createContext, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { type ConsoleId } from "@/lib/constants";
import { dispatchOwnerBookingsChanged } from "@/lib/ownerBookingsSync";
import { getBookingGamingTotal } from "@/lib/ownerRevenue";
import { BookingRow, NavTab } from "../types";
import { getLocalDateString, normaliseConsoleType } from "../utils";
import { getInitialOwnerBookingStatus, isBookingActiveNow } from "@/lib/bookingFilters";
import { uploadCafeImage, deleteCafeImage } from "../utils/uploads";
import { calcBillingPrice } from "../utils/pricing";
import { useOwnerAuth } from "../hooks/useOwnerAuth";
import { useOwnerData } from "../hooks/useOwnerData";
import { useToast } from "../hooks/useToast";
import { useStableHandler } from "../hooks/useStableHandler";
import { useOwnerSummary } from "../components/NeedsAttention";
import { ownerPathForTab } from "../navigation";
import type { OwnerRouteTab } from "../navigation";
import {
  debugLog,
  normaliseOwnerPaymentMode,
  getAssignedStationsFromItemTitle,
  getBookingItemDuration,
  buildBookingItemTitle,
  getDayPassDurationUntil10Pm,
  getPreferredConsoleForCafe,
  toWholeRupees,
  distributeWholeRupees,
  getDayPassEndAt,
  findMembershipSubscriptionForBooking,
  type TimeAdjustmentTarget,
} from "../utils/dashboardHelpers";

type OwnerDashboardContextValue = any;

/** How often the expired-booking sweep looks, in milliseconds. */
const SWEEP_TICK_MS = 30_000;

export const OwnerDashboardContext = createContext<OwnerDashboardContextValue | null>(null);

export function useOwnerDashboard(): OwnerDashboardContextValue {
  const ctx = useContext(OwnerDashboardContext);
  if (!ctx) {
    throw new Error("useOwnerDashboard must be used within OwnerDashboardProvider");
  }
  return ctx;
}

/**
 * The two values that change every second, kept out of the main context.
 *
 * `currentTime` and `timerElapsed` tick once a second so session cards can
 * count down. While they lived on the main context value, that object was
 * rebuilt every tick and all twelve consumers re-rendered with it - the whole
 * dashboard, once a second, whether or not anything on screen showed a clock.
 * That is what made typing and scrolling feel heavy.
 *
 * Split out, the main value stays referentially stable across a tick, so React
 * re-renders only what actually reads the clock. Read it as deep in the tree as
 * possible: a component that subscribes here re-renders every second, and takes
 * its children with it.
 */
export interface OwnerClock {
  currentTime: Date;
  timerElapsed: Map<string, number>;
}

const OwnerClockContext = createContext<OwnerClock | null>(null);

/**
 * Falls back to a still clock rather than throwing, so a card can be rendered
 * outside the provider (a modal, a test) without needing one wired up.
 */
export function useOwnerClock(): OwnerClock {
  const ctx = useContext(OwnerClockContext);
  const fallback = useMemo<OwnerClock>(
    () => ({ currentTime: new Date(), timerElapsed: new Map<string, number>() }),
    []
  );
  return ctx ?? fallback;
}

export function OwnerDashboardProvider({
  activeTab,
  children,
}: {
  activeTab: OwnerRouteTab;
  children: ReactNode;
}) {
  const router = useRouter();

  const { allowed, checkingRole } = useOwnerAuth();
  const { toasts, toast, removeToast } = useToast();
  const canFetchOwnerData = allowed && !checkingRole;
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

  // Navigate via route paths instead of in-page tab state
  const handleTabChange = useStableHandler((tab: NavTab) => {
    setMobileMenuOpen(false);
    router.push(ownerPathForTab(tab));
  });




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

  // Cross-feature counts for the dashboard cards and the sidebar badges.
  // Refetched whenever the tab changes: the mutations that move these numbers
  // happen inside the feature tabs, so coming back from one is exactly when the
  // count is stale.
  const [summaryTick, setSummaryTick] = useState(0);
  useEffect(() => {
    setSummaryTick((tick) => tick + 1);
  }, [activeTab]);
  const ownerSummary = useOwnerSummary(currentCafeId || undefined, summaryTick);

  const hideDeletedBookingLocally = useStableHandler((bookingId: string) => {
    setBookings((prev) => prev.filter((booking: any) => (
      booking.id !== bookingId && booking.originalBookingId !== bookingId
    )));
    setBookingsMgmtRefreshKey(k => k + 1);
  });

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
  const [timeAdjustment, setTimeAdjustment] = useState<TimeAdjustmentTarget | null>(null);
  const [savingTimeAdjustment, setSavingTimeAdjustment] = useState(false);

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

  // Prices the edit-booking modal's auto-calculation. The Billing component owns
  // its own form state and prices its own items, so nothing else is shared.
  const getBillingPrice = useCallback(
    (consoleType: string, quantity: number, duration: number) =>
      calcBillingPrice(consoleType, quantity, duration, selectedCafeId, consolePricing, stationPricing),
    [selectedCafeId, consolePricing, stationPricing]
  );


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

  // Redirect legacy ?tab= query bookmarks to route paths
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab) {
        router.replace(ownerPathForTab(urlTab));
      }
    } catch {
      // ignore
    }
  }, [router]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("ownerActiveTab", activeTab);
    }
  }, [activeTab]);

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
    // Only run timer when viewing dashboard or bookings tabs
    if (activeTab !== 'dashboard' && activeTab !== 'bookings') return;

    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, [activeTab]);

  /**
   * A coarse tick for work that only needs to notice that time has passed.
   *
   * The expired-booking sweep below used to hang off `currentTime`, so it
   * re-scanned every loaded booking - up to five hundred - once a second, and
   * could fire PUT requests from inside that loop. It completes bookings whose
   * end time has gone by, so a booking finishing up to half a minute before
   * anyone notices is the same outcome; second-level precision bought nothing
   * and cost a scan a second.
   */
  const [sweepTick, setSweepTick] = useState(0);
  useEffect(() => {
    if (activeTab !== 'dashboard' && activeTab !== 'bookings') return;

    const timer = setInterval(() => setSweepTick((n) => n + 1), SWEEP_TICK_MS);
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
    // toast is memoised in useToast, so naming it here does not make this run
    // more often than it did.
  }, [activeTab, currentCafeId, toast]);

  // Realtime subscription removed — ISP blocks WebSocket to Supabase (ERR_CERT_COMMON_NAME_INVALID)
  // Mutations call refreshData() directly to keep UI in sync

  const handleEndSessionNow = useStableHandler(() => {
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
  });

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
      const totalConsolesPrice = editingBookingItemId
        ? (() => {
            const editedItem = editItems.find((item) => item.id === editingBookingItemId) || editItems[0];
            if (!editedItem) return 0;
            const consoleType = normaliseConsoleType(editedItem.console || '') as ConsoleId;
            const quantity = editedItem.quantity || 1;
            const duration = editedItem.duration || editDuration || editingBooking.duration || 60;
            return getBillingPrice(consoleType, quantity, duration) || Number(editedItem.price) || 0;
          })()
        : editItems.reduce((sum, item) => {
            const consoleType = normaliseConsoleType(item.console || '') as ConsoleId;
            const quantity = item.quantity || 1;
            const duration = item.duration || editDuration || editingBooking.duration || 60;
            const price = getBillingPrice(consoleType, quantity, duration) || Number(item.price) || 0;
            return sum + price;
          }, 0);

      if (totalConsolesPrice > 0 || editItems.length > 0) {
        setEditAmount(totalConsolesPrice.toString());
      }
    }
  }, [editItems, editDuration, editingBooking, editingBookingItemId, editAmountManuallyEdited, getBillingPrice]);

  const handleOrdersUpdated = useStableHandler(({
    bookingId,
    orders,
    updatedAt,
  }: {
    amountDelta: number;
    bookingId: string;
    orders: any[];
    updatedAt: string | null;
  }) => {
    refreshData();
    setBookingsMgmtRefreshKey(k => k + 1);

    setBookings(prev => prev.map((booking: any) => {
      if (booking.id !== bookingId && booking.originalBookingId !== bookingId) {
        return booking;
      }

      return {
        ...booking,
        booking_orders: orders,
        ...(updatedAt ? { updated_at: updatedAt } : {}),
      };
    }));

    if (editingBooking?.id === bookingId) {
      setEditingBooking(prev => (
        prev && prev.id === bookingId
          ? {
              ...prev,
              booking_orders: orders,
              ...(updatedAt ? { updated_at: updatedAt } : {}),
            }
          : prev
      ));
    }
  });


  const handlePaymentModeChange = useStableHandler(async (bookingId: string, mode: string): Promise<boolean> => {
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
  });

  // Handle edit booking
  const handleBookingStatusChange = useStableHandler(async (id: string, status: string) => {
    const trueBookingId = id.includes('-item-') ? id.split('-item-')[0] : id;
    const targetBooking = bookings.find((b: any) => (
      b.id === id || b.id === trueBookingId || b.originalBookingId === trueBookingId
    )) as any;
    const resolvedStatus = status === 'confirmed' && targetBooking
      ? getInitialOwnerBookingStatus(targetBooking.booking_date, targetBooking.start_time)
      : status;

    // Optimistic update so badge changes immediately
    setBookings(prev => prev.map((b: any) =>
      b.id === trueBookingId || b.originalBookingId === trueBookingId ? { ...b, status: resolvedStatus } : b
    ));
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: trueBookingId, booking: { status: resolvedStatus } }),
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
  });

  /**
   * Unlocks or locks the physical machine(s) attached to a booking.
   *
   * The duration is worked out server-side from the booking, so nothing here
   * can influence how long the station stays open.
   */
  const handleStationCommand = useStableHandler(async (bookingId: string, action: 'unlock' | 'lock') => {
    // Flattened cards use a synthetic "<id>-item-<itemId>" id; the API needs
    // the real booking.
    const trueBookingId = bookingId.includes('-item-')
      ? bookingId.split('-item-')[0]
      : bookingId;

    try {
      const res = await fetch('/api/owner/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ bookingId: trueBookingId, action }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send the command');
      }

      const stations = Array.isArray(data.stations) ? data.stations.join(', ') : '';
      toast.success(
        action === 'unlock'
          ? `Unlocked ${stations || 'station'}`
          : `Locked ${stations || 'station'}`
      );
    } catch (err) {
      // Deliberately surfaced rather than swallowed: staff must not think a PC
      // was unlocked when the command never arrived.
      console.error('[handleStationCommand]', err);
      toast.error(err instanceof Error ? err.message : 'Could not reach the station');
    }
  });

  const handleOpenTimeAdjustment = useStableHandler(async (booking: BookingRow) => {
    const originalBookingId = (booking as any).originalBookingId;
    const targetBookingId = originalBookingId || booking.id;
    const specificItemId = originalBookingId && booking.booking_items?.[0]?.id
      ? booking.booking_items[0].id
      : null;

    if (booking.deleted_at) {
      toast.error('Deleted bookings cannot be edited.');
      hideDeletedBookingLocally(targetBookingId);
      dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: targetBookingId });
      return;
    }

    let actualBooking = originalBookingId
      ? bookings.find(b => b.id === originalBookingId) || booking
      : booking;

    try {
      const params = new URLSearchParams({ bookingId: targetBookingId });
      if (booking.booking_date) params.set('bookingDate', booking.booking_date);
      if (booking.cafe_id || currentCafeId) params.set('cafeId', booking.cafe_id || currentCafeId);
      const res = await fetch(`/api/owner/bookings?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (res.status === 404) {
        toast.error('This booking was deleted or is no longer available.');
        hideDeletedBookingLocally(targetBookingId);
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
      console.error('[handleOpenTimeAdjustment] Failed to load latest booking:', err);
      toast.error('Failed to load the latest booking details.');
      return;
    }

    if (actualBooking.source === 'membership') {
      toast.error('Membership time is managed from memberships.');
      return;
    }

    const targetItems = specificItemId
      ? (actualBooking.booking_items || []).filter((item) => item.id === specificItemId)
      : (actualBooking.booking_items || []);

    const targetItem = targetItems[0];
    if (!targetItem) {
      toast.error('This session has no game item to adjust.');
      return;
    }

    const currentDuration = targetItems.reduce((max, item) => (
      Math.max(max, getBookingItemDuration(item, actualBooking.duration || 60))
    ), 0) || actualBooking.duration || 60;
    const consoleName = String(targetItem.console || 'Session').toUpperCase();
    const assignedStation = targetItem.title?.split('|')[1]?.trim().toUpperCase();

    setTimeAdjustment({
      booking: actualBooking,
      bookingItemId: specificItemId,
      currentDuration,
      nextDuration: currentDuration,
      customerName: actualBooking.customer_name || actualBooking.user_name || 'Guest',
      stationName: assignedStation || consoleName,
    });
  });

  const handleSaveTimeAdjustment = useStableHandler(async () => {
    if (!timeAdjustment) return;

    const nextDuration = Math.max(30, Math.round(timeAdjustment.nextDuration));
    if (nextDuration === timeAdjustment.currentDuration) {
      setTimeAdjustment(null);
      return;
    }

    try {
      setSavingTimeAdjustment(true);

      const booking = timeAdjustment.booking;
      const nextBookingItems = (booking.booking_items || []).map((item: any) => {
        const shouldUpdate = timeAdjustment.bookingItemId ? item.id === timeAdjustment.bookingItemId : true;
        const itemDuration = shouldUpdate
          ? nextDuration
          : getBookingItemDuration(item, booking.duration || 60);
        const consoleType = normaliseConsoleType(item.console || '') as ConsoleId;
        const nextPrice = shouldUpdate
          ? (getBillingPrice(consoleType, item.quantity || 1, itemDuration) || Number(item.price) || 0)
          : (Number(item.price) || 0);

        return {
          ...item,
          title: buildBookingItemTitle(item.title, itemDuration),
          price: nextPrice,
        };
      });

      const bookingDuration = nextBookingItems.reduce((max: number, item: any) => (
        Math.max(max, getBookingItemDuration(item, booking.duration || 60))
      ), 0) || nextDuration;
      const amountToSave = nextBookingItems.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);

      const res = await fetch('/api/owner/billing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          bookingId: booking.id,
          items: nextBookingItems.map((item: any) => ({
            id: item.id,
            console: item.console,
            quantity: item.quantity,
            title: item.title,
            price: item.price,
          })),
          booking: {
            total_amount: amountToSave,
            duration: bookingDuration,
            status: booking.status || 'in-progress',
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update session time');
      }

      setBookings((prev) => prev.map((entry) => (
        entry.id === booking.id
          ? {
              ...entry,
              total_amount: amountToSave,
              duration: bookingDuration,
              booking_items: nextBookingItems,
            }
          : entry
      )));

      setTimeAdjustment(null);
      setBookingsMgmtRefreshKey(k => k + 1);
      toast.success('Session time updated.');
      dispatchOwnerBookingsChanged({ action: 'updated', bookingId: booking.id });
      refreshData();
    } catch (err) {
      console.error('Error updating session time:', err);
      toast.error('Failed to update session time: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSavingTimeAdjustment(false);
    }
  });

  const handleEditBooking = useStableHandler(async (booking: BookingRow) => {
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
      hideDeletedBookingLocally(targetBookingId);
      dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: targetBookingId });
      return;
    }

    let actualBooking = originalBookingId
      ? bookings.find(b => b.id === originalBookingId) || booking
      : booking;

    try {
      const params = new URLSearchParams({ bookingId: targetBookingId });
      if (booking.booking_date) params.set('bookingDate', booking.booking_date);
      if (booking.cafe_id || currentCafeId) params.set('cafeId', booking.cafe_id || currentCafeId);
      const res = await fetch(`/api/owner/bookings?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = await res.json();

      if (res.status === 404) {
        toast.error('This booking was deleted or is no longer available.');
        hideDeletedBookingLocally(targetBookingId);
        dispatchOwnerBookingsChanged({ action: 'deleted', bookingId: targetBookingId });
        return;
      }

      if (!res.ok || !data.booking) {
        throw new Error(data.error || 'Failed to load the latest booking');
      }

      actualBooking = data.booking;

      const isSnackOnlyBooking =
        (!actualBooking.booking_items || actualBooking.booking_items.length === 0) &&
        (actualBooking.booking_orders?.length || 0) > 0;

      if (isSnackOnlyBooking) {
        setViewOrdersBookingId(actualBooking.id);
        setViewOrdersCustomerName(actualBooking.customer_name || actualBooking.user_name || 'Walk-in');
        setViewOrdersModalOpen(true);
        return;
      }

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
    const seedItem = specificItemId
      ? actualBooking.booking_items?.find((item: any) => item.id === specificItemId)
      : null;
    const seedAmount = specificItemId && seedItem
      ? Number(seedItem.price) || 0
      : getBookingGamingTotal(actualBooking);
    setEditAmount(seedAmount.toString());
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
  });

  // Handle save booking
  const handleSaveBooking = useStableHandler(async () => {
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

      const parsedUpdatedAmount = parseFloat(editAmount);

      // Validate the amount
      if (!editAmount || editAmount.trim() === '') {
        setSaving(false);
        toast.error('Amount cannot be empty.');
        return;
      }
      if (isNaN(parsedUpdatedAmount)) {
        console.error('[handleSaveBooking] ERROR: Invalid amount - parseFloat returned NaN from:', editAmount);
        setSaving(false);
        toast.error('Invalid amount entered. Please enter a valid number.');
        return;
      }
      if (parsedUpdatedAmount < 0) {
        setSaving(false);
        toast.error('Amount cannot be negative.');
        return;
      }

      const updatedAmount = toWholeRupees(parsedUpdatedAmount);
      debugLog('[handleSaveBooking] Parsed amount:', updatedAmount);
      debugLog('[handleSaveBooking] Booking ID:', editingBooking.id);

      const isMembershipBooking = editingBooking.source === 'membership';
      const membershipSubscription = findMembershipSubscriptionForBooking(editingBooking, subscriptions);
      const isDayPassMembership = membershipSubscription?.membership_plans?.plan_type === 'day_pass';
      const forcedMembershipDuration = isDayPassMembership
        ? getDayPassDurationUntil10Pm(startTime12h)
        : null;
      const isSingleItemEdit = Boolean(editingBookingItemId);
      const buildItemPayload = (item: { id?: string; console: string; quantity: number; duration: number }, originalItem?: { title?: string | null }) => {
        const itemDuration = forcedMembershipDuration || item.duration || 60;

        return {
          id: item.id,
          console: item.console,
          quantity: item.quantity,
          title: buildBookingItemTitle(originalItem?.title, itemDuration),
          price: toWholeRupees(isMembershipBooking
            ? updatedAmount
            : getBillingPrice(item.console as ConsoleId, item.quantity, itemDuration) || 0),
        };
      };

      let nextBookingItems = isSingleItemEdit && editingBookingItemId
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

      const shouldApplyManualAmount = isMembershipBooking || editAmountManuallyEdited;
      if (shouldApplyManualAmount && nextBookingItems.length > 0) {
        if (isSingleItemEdit && editingBookingItemId) {
          // Only the targeted item's price should move — sibling items the
          // owner never saw in this modal must keep their existing price.
          nextBookingItems = nextBookingItems.map((item: any) => (
            item.id === editingBookingItemId
              ? { ...item, price: toWholeRupees(updatedAmount) }
              : item
          ));
        } else {
          nextBookingItems = distributeWholeRupees(nextBookingItems, updatedAmount);
        }
      }

      const calculatedGamingAmount = nextBookingItems.reduce((sum: number, item: any) => sum + (Number(item.price) || 0), 0);
      const amountToSave = toWholeRupees(calculatedGamingAmount);

      const buildServerItemPayload = (item: any) => ({
        ...(item.id && !String(item.id).startsWith('temp-item-') ? { id: item.id } : {}),
        console: item.console,
        quantity: item.quantity,
        title: item.title,
        price: toWholeRupees(Number(item.price) || 0),
      });

      // Auto-restore in-progress if a completed booking is extended into the future
      const newDuration = forcedMembershipDuration || nextBookingItems.reduce((max, item) => (
        Math.max(max, getBookingItemDuration(item, editingBooking.duration || 60))
      ), 0);
      let resolvedStatus = editStatus;
      if (isMembershipBooking) {
        resolvedStatus = editStatus;
      } else if (editStatus === 'in-progress') {
        resolvedStatus = getInitialOwnerBookingStatus(editDate, startTime12h);
      } else if (editStatus === 'completed') {
        const initialStatus = getInitialOwnerBookingStatus(editDate, startTime12h);
        if (initialStatus === 'confirmed') {
          resolvedStatus = 'confirmed';
        }
        const timeParts = startTime12h.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
        if (resolvedStatus === 'completed' && timeParts) {
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
          items: nextBookingItems.map(buildServerItemPayload),
          booking: {
            total_amount: amountToSave,
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update booking');
      }

      if (isMembershipBooking && membershipSubscription?.id) {
        const subscriptionUpdates: Record<string, unknown> = {
          amount_paid: amountToSave,
          payment_mode: normalizedPaymentMode,
          updated_at: new Date().toISOString(),
        };
        if (sanitizedCustomerName) subscriptionUpdates.customer_name = sanitizedCustomerName;
        if (sanitizedCustomerPhone) subscriptionUpdates.customer_phone = sanitizedCustomerPhone;

        const subRes = await fetch('/api/owner/subscriptions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            id: membershipSubscription.id,
            updates: subscriptionUpdates,
          }),
        });

        if (!subRes.ok) {
          const subData = await subRes.json().catch(() => ({}));
          throw new Error(subData.error || 'Booking saved but membership amount could not be updated');
        }

        setSubscriptions((prev) => prev.map((subscription: any) => (
          subscription.id === membershipSubscription.id
            ? { ...subscription, ...subscriptionUpdates }
            : subscription
        )));
      }

      // Update local state immediately for instant UI feedback
      setBookings((prev) =>
        prev.map((b) =>
          b.id === editingBooking.id
            ? {
              ...b,
              total_amount: amountToSave,
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
  });

  const handleDeleteBooking = useStableHandler(async () => {
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
        // Use gaming-only amount as base; snacks stay in booking_orders.
        const deletedItem = allItems.find(item => item.id === editingBookingItemId);
        const deletedPrice = (deletedItem as any)?.price || 0;
        const newTotalAmount = deletedPrice > 0
          ? Math.max(0, getBookingGamingTotal(editingBooking) - deletedPrice)
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
        hideDeletedBookingLocally(editingBooking.id);
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
  });

  // Subscription timer handlers
  const handleStartTimer = useStableHandler(async (subscriptionId: string) => {
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
    const occupiedStations = new Set(activeConsolesForType.map((station) => String(station).toLowerCase()));

    bookings
      .filter((booking: any) => booking.cafe_id === subscription.cafe_id && isBookingActiveNow(booking))
      .forEach((booking: any) => {
        (booking.booking_items || []).forEach((item: any) => {
          const itemConsoleType = normaliseConsoleType(item.console || '');
          if (itemConsoleType !== normConsoleType) return;
          getAssignedStationsFromItemTitle(item.title).forEach((stationName) => occupiedStations.add(stationName));
        });
      });

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
      const pricing = stationPricing[stationId];
      const isPoweredOff = poweredOffStations.has(stationId);
      const isInactive = pricing?.is_active === false;
      if (!occupiedStations.has(stationId) && !isPoweredOff && !isInactive) {
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
  });

  const handleStopTimer = useStableHandler(async (subscriptionId: string) => {
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
  });

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
    // setSubscriptions comes from useState and is stable for the life of the
    // component, so naming it here changes nothing about when this runs.
  }, [subscriptions, activeTimers, setSubscriptions]);

  // Day passes are valid only until 10:00 PM IST on the purchase day.
  useEffect(() => {
    if (activeTimers.size === 0) return;

    const expiredDayPasses = subscriptions.filter((subscription) => {
      const isDayPass = subscription.membership_plans?.plan_type === 'day_pass';
      if (!isDayPass || !subscription.timer_active || !activeTimers.has(subscription.id)) return false;

      const dayPassEndAt = getDayPassEndAt(subscription.timer_start_time || subscription.purchase_date || subscription.expiry_date);
      return Boolean(dayPassEndAt && Date.now() >= dayPassEndAt.getTime());
    });

    if (expiredDayPasses.length === 0) return;

    expiredDayPasses.forEach((subscription) => {
      debugLog('[Timer] Day pass reached 10:00 PM, auto-expiring:', subscription.id);

      setSubscriptions(prev => prev.map(s =>
        s.id === subscription.id
          ? {
              ...s,
              hours_remaining: 0,
              timer_active: false,
              timer_start_time: null,
              assigned_console_station: null,
              status: 'expired',
            }
          : s
      ));
      setActiveTimers(prev => {
        const next = new Map(prev);
        next.delete(subscription.id);
        return next;
      });
      setTimerElapsed(prev => {
        const next = new Map(prev);
        next.delete(subscription.id);
        return next;
      });

      fetch('/api/owner/subscriptions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: subscription.id,
          updates: {
            hours_remaining: 0,
            timer_active: false,
            timer_start_time: null,
            assigned_console_station: null,
            status: 'expired',
            updated_at: new Date().toISOString(),
          },
        }),
      }).catch(err => {
        console.error('[Timer] Failed to auto-expire day pass at 10 PM:', err);
        refreshData();
      });
    });
    // Stable useState setter; naming it changes nothing about when this runs.
  }, [activeTimers, sweepTick, refreshData, subscriptions, setSubscriptions]);

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

  // Auto-complete expired bookings client-side (avoids relying on server cron).
  // Driven by the coarse sweep tick, not the one-second clock - see SWEEP_TICK_MS.
  useEffect(() => {
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const todayStr = getLocalDateString(now);
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    const expiredBookings = bookings.filter((b: any) => {
      if (b.deleted_at) return false;
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
  }, [sweepTick]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleViewCustomer = useStableHandler((customer: {
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
  });

  // Handle settings save
  const handleSaveSettings = useStableHandler(async () => {
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
  });

  // Handle add new station
  const handleAddStation = useStableHandler(async () => {
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
  });

  // Handle toggle station power — shows confirmation before powering off
  const handleTogglePower = useStableHandler((stationName: string) => {
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
  });

  const executePowerToggle = useStableHandler(async (stationName: string, isCurrentlyOff: boolean) => {
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
  });

  const handleToggleMaintenance = (stationName: string) => {
    setMaintenanceStations(prev => {
      const next = new Set(prev);
      if (next.has(stationName)) next.delete(stationName);
      else next.add(stationName);
      return next;
    });
  };

  // Handle profile photo upload
  const handleProfilePhotoUpload = useStableHandler(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !currentCafe) return;

    const file = event.target.files[0];
    const previousCoverUrl = currentCafe.cover_url;

    setUploadingProfilePhoto(true);
    try {
      // Through this origin: a direct Supabase upload is blocked on the cafés'
      // ISP, and the server decides the storage path rather than the browser.
      const { url: publicUrl } = await uploadCafeImage(currentCafeId, file, 'profile');

      // Only once the new one is safely up. Removing the old photo first meant
      // a failed upload left the café with no cover at all.
      await deleteCafeImage(currentCafeId, previousCoverUrl);

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
      toast.error(error instanceof Error ? error.message : 'Failed to upload profile photo. Please try again.');
    } finally {
      setUploadingProfilePhoto(false);
      // Reset input
      event.target.value = '';
    }
  });

  // Handle profile photo delete
  const handleProfilePhotoDelete = useStableHandler(async () => {
    if (!currentCafe || !currentCafe.cover_url) return;

    try {
      await deleteCafeImage(currentCafeId, currentCafe.cover_url);

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
  });

  // Handle gallery photo upload
  const handleGalleryPhotoUpload = useStableHandler(async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !currentCafeId) return;

    const file = event.target.files[0];

    setUploadingGalleryPhoto(true);
    try {
      const { url: publicUrl } = await uploadCafeImage(currentCafeId, file, 'gallery');

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
      toast.error(error instanceof Error ? error.message : 'Failed to upload gallery photo. Please try again.');
    } finally {
      setUploadingGalleryPhoto(false);
      // Reset input
      event.target.value = '';
    }
  });

  // Handle gallery photo delete
  const handleGalleryPhotoDelete = useStableHandler(async (imageId: string, imageUrl: string) => {
    try {
      await deleteCafeImage(currentCafeId, imageUrl);

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
  });

  // Handle delete station
  const handleDeleteStation = useStableHandler(async () => {
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
  });

  const value = useMemo(
    () => ({
      activeTab,
      router,
      allowed,
      checkingRole,
      toasts,
      toast,
      removeToast,
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
      setConsolePricing,
      mobileMenuOpen,
      setMobileMenuOpen,
      isMobile,
      handleTabChange,
      viewingSubscription,
      setViewingSubscription,
      subscriptionUsageHistory,
      setSubscriptionUsageHistory,
      loadingUsageHistory,
      setLoadingUsageHistory,
      viewingCustomer,
      setViewingCustomer,
      customerBookings,
      setCustomerBookings,
      setLoadingCustomerData,
      selectedCafeId,
      setSelectedCafeId,
      bookingsMgmtRefreshKey,
      setBookingsMgmtRefreshKey,
      currentCafe,
      currentCafeId,
      summaryTick,
      ownerSummary,
      hideDeletedBookingLocally,
      activeTimers,
      setActiveTimers,
      setTimerElapsed,
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
      editingBooking,
      setEditingBooking,
      editingBookingItemId,
      setEditingBookingItemId,
      settingsChanged,
      setSettingsChanged,
      savingSettings,
      setSavingSettings,
      editedCafe,
      setEditedCafe,
      showAddStationModal,
      setShowAddStationModal,
      newStationType,
      setNewStationType,
      newStationCount,
      setNewStationCount,
      addingStation,
      setAddingStation,
      stationToDelete,
      setStationToDelete,
      deletingStation,
      setDeletingStation,
      pendingPowerToggle,
      setPendingPowerToggle,
      poweredOffStations,
      setPoweredOffStations,
      maintenanceStations,
      setMaintenanceStations,
      uploadingProfilePhoto,
      setUploadingProfilePhoto,
      uploadingGalleryPhoto,
      setUploadingGalleryPhoto,
      galleryImages,
      setGalleryImages,
      editAmount,
      setEditAmount,
      editAmountManuallyEdited,
      setEditAmountManuallyEdited,
      editStatus,
      setEditStatus,
      editPaymentMethod,
      setEditPaymentMethod,
      editCustomerName,
      setEditCustomerName,
      editCustomerPhone,
      setEditCustomerPhone,
      editDate,
      setEditDate,
      editStartTime,
      setEditStartTime,
      editDuration,
      setEditDuration,
      editItems,
      setEditItems,
      saving,
      setSaving,
      deletingBooking,
      setDeletingBooking,
      showDeleteConfirm,
      setShowDeleteConfirm,
      deleteRemark,
      setDeleteRemark,
      updateEditItem,
      snackSaleModalOpen,
      setSnackSaleModalOpen,
      addItemsModalOpen,
      setAddItemsModalOpen,
      addItemsBookingId,
      setAddItemsBookingId,
      addItemsCustomerName,
      setAddItemsCustomerName,
      timeAdjustment,
      setTimeAdjustment,
      savingTimeAdjustment,
      setSavingTimeAdjustment,
      viewOrdersModalOpen,
      setViewOrdersModalOpen,
      viewOrdersBookingId,
      setViewOrdersBookingId,
      viewOrdersCustomerName,
      setViewOrdersCustomerName,
      sessionEndedPopupOpen,
      setSessionEndedPopupOpen,
      sessionEndedInfo,
      setSessionEndedInfo,
      setCurrentTime,
      editingStation,
      setEditingStation,
      savingPricing,
      setSavingPricing,
      applyToAll,
      setApplyToAll,
      getBillingPrice,
      singleHalfHour,
      setSingleHalfHour,
      singleFullHour,
      setSingleFullHour,
      multiHalfHour,
      setMultiHalfHour,
      multiFullHour,
      setMultiFullHour,
      halfHour,
      setHalfHour,
      fullHour,
      setFullHour,
      controller1HalfHour,
      setController1HalfHour,
      controller1FullHour,
      setController1FullHour,
      controller2HalfHour,
      setController2HalfHour,
      controller2FullHour,
      setController2FullHour,
      controller3HalfHour,
      setController3HalfHour,
      controller3FullHour,
      setController3FullHour,
      controller4HalfHour,
      setController4HalfHour,
      controller4FullHour,
      setController4FullHour,
      enabledControllers,
      setEnabledControllers,
      handleEndSessionNow,
      handleOrdersUpdated,
      handlePaymentModeChange,
      handleBookingStatusChange,
      handleStationCommand,
      handleOpenTimeAdjustment,
      handleSaveTimeAdjustment,
      handleEditBooking,
      handleSaveBooking,
      handleDeleteBooking,
      handleStartTimer,
      handleStopTimer,
      handleViewCustomer,
      handleSaveSettings,
      handleAddStation,
      handleTogglePower,
      executePowerToggle,
      handleToggleMaintenance,
      handleProfilePhotoUpload,
      handleProfilePhotoDelete,
      handleGalleryPhotoUpload,
      handleGalleryPhotoDelete,
      handleDeleteStation,
    }),
    // Every handler in here has a stable identity now — see useStableHandler —
    // so naming them costs nothing and the memo does what it was written to do.
    [
      activeTab,
      router,
      allowed,
      checkingRole,
      toasts,
      cafes,
      bookings,
      loadingData,
      error,
      membershipPlans,
      subscriptions,
      consolePricing,
      stationPricing,
      hasLoadedData,
      mobileMenuOpen,
      isMobile,
      viewingSubscription,
      subscriptionUsageHistory,
      loadingUsageHistory,
      viewingCustomer,
      customerBookings,
      selectedCafeId,
      bookingsMgmtRefreshKey,
      currentCafe,
      currentCafeId,
      ownerSummary,
      activeTimers,
      customerSearch,
      hasSubscription,
      hasMembership,
      customerSortBy,
      customerSortOrder,
      editingBooking,
      editingBookingItemId,
      settingsChanged,
      savingSettings,
      editedCafe,
      showAddStationModal,
      newStationType,
      newStationCount,
      addingStation,
      stationToDelete,
      deletingStation,
      pendingPowerToggle,
      poweredOffStations,
      maintenanceStations,
      uploadingProfilePhoto,
      uploadingGalleryPhoto,
      galleryImages,
      editAmount,
      editAmountManuallyEdited,
      editStatus,
      editPaymentMethod,
      editCustomerName,
      editCustomerPhone,
      editDate,
      editStartTime,
      editDuration,
      editItems,
      saving,
      deletingBooking,
      showDeleteConfirm,
      deleteRemark,
      snackSaleModalOpen,
      addItemsModalOpen,
      addItemsBookingId,
      addItemsCustomerName,
      timeAdjustment,
      savingTimeAdjustment,
      viewOrdersModalOpen,
      viewOrdersBookingId,
      viewOrdersCustomerName,
      sessionEndedPopupOpen,
      sessionEndedInfo,
      editingStation,
      savingPricing,
      applyToAll,
      singleHalfHour,
      singleFullHour,
      multiHalfHour,
      multiFullHour,
      halfHour,
      fullHour,
      controller1HalfHour,
      controller1FullHour,
      controller2HalfHour,
      controller2FullHour,
      controller3HalfHour,
      controller3FullHour,
      controller4HalfHour,
      controller4FullHour,
      enabledControllers,
      // Stable for the life of the component: the handlers via
      // useStableHandler, the setters because useState returns the same
      // function every render, toast because useToast memoises it.
      executePowerToggle,
      getBillingPrice,
      handleAddStation,
      handleBookingStatusChange,
      handleDeleteBooking,
      handleDeleteStation,
      handleEditBooking,
      handleEndSessionNow,
      handleGalleryPhotoDelete,
      handleGalleryPhotoUpload,
      handleOpenTimeAdjustment,
      handleOrdersUpdated,
      handlePaymentModeChange,
      handleProfilePhotoDelete,
      handleProfilePhotoUpload,
      handleSaveBooking,
      handleSaveSettings,
      handleSaveTimeAdjustment,
      handleStartTimer,
      handleStationCommand,
      handleStopTimer,
      handleTabChange,
      handleTogglePower,
      handleViewCustomer,
      hideDeletedBookingLocally,
      refreshData,
      removeToast,
      setBookings,
      setCafes,
      setConsolePricing,
      setStationPricing,
      setSubscriptions,
      summaryTick,
      toast,
    ]
  );

  // Rebuilt every tick on purpose - that is the point of it being separate.
  // `value` above no longer names either of these, so it survives the tick
  // unchanged and its consumers are left alone.
  const clock = useMemo<OwnerClock>(
    () => ({ currentTime, timerElapsed }),
    [currentTime, timerElapsed]
  );

  return (
    <OwnerDashboardContext.Provider value={value}>
      <OwnerClockContext.Provider value={clock}>
        {children}
      </OwnerClockContext.Provider>
    </OwnerDashboardContext.Provider>
  );
}
