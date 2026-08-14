"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { useAdminAuth } from "@/app/admin/hooks/useAdminAuth";
import { adminPathForTab } from "@/app/admin/navigation";
import type { AdminRouteTab } from "@/app/admin/navigation";
import type {
  AdminStats,
  CafeRow,
  UserRow,
  BookingRow,
  OfflineCustomer,
  NavTab,
  AnnouncementRow,
  AuditLogRow,
  CouponRow,
} from "@/app/admin/types";

export function useAdminDashboardController(activeTab: AdminRouteTab) {
  const router = useRouter();
  const { adminId, adminUsername, allowed: isAdmin, checkingRole: isChecking } = useAdminAuth();
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleTabChange = (tab: NavTab) => {
    setMobileMenuOpen(false);
    router.push(adminPathForTab(tab));
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const urlTab = new URLSearchParams(window.location.search).get("tab");
      if (urlTab) router.replace(adminPathForTab(urlTab));
    } catch {
      // ignore
    }
  }, [router]);

  // Data states
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [cafes, setCafes] = useState<CafeRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [coupons, setCoupons] = useState<CouponRow[]>([]);

  // Owner access state
  const [ownerEmails, setOwnerEmails] = useState<any[]>([]);
  const [ownerEmailsLoading, setOwnerEmailsLoading] = useState(false);
  const [newOwnerEmail, setNewOwnerEmail] = useState('');
  const [newOwnerCafeId, setNewOwnerCafeId] = useState('');
  const [ownerEmailMsg, setOwnerEmailMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cafe management panel
  const [managedCafeId, setManagedCafeId] = useState<string | null>(null);
  const [cafeManageSubTab, setCafeManageSubTab] = useState<'info' | 'stations' | 'memberships' | 'coupons' | 'bookings'>('info');
  const [editCafeForm, setEditCafeForm] = useState<Record<string, string>>({});
  const [savingCafeInfo, setSavingCafeInfo] = useState(false);
  const [cafeInfoMsg, setCafeInfoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addStationType, setAddStationType] = useState('ps5');
  const [addStationCount, setAddStationCount] = useState(1);
  const [savingStation, setSavingStation] = useState(false);
  const [stationPricing, setStationPricing] = useState<Record<string, any>>({});
  const [loadingStationPricing, setLoadingStationPricing] = useState(false);
  const [savingStationPricing, setSavingStationPricing] = useState(false);
  const [stationPricingMsg, setStationPricingMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  // Per-type price edit form: { [stationType]: { half_hour_rate, hourly_rate, ... } }
  const [stationPriceForm, setStationPriceForm] = useState<Record<string, Record<string, string>>>({});
  const [cafeMembershipPlans, setCafeMembershipPlans] = useState<any[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(false);
  const [membershipForm, setMembershipForm] = useState({ name: '', price: '', hours: '', validity_days: '30', plan_type: 'hourly_package', console_type: 'ps5', player_count: 'single' });
  const [savingMembership, setSavingMembership] = useState(false);
  const [membershipMsg, setMembershipMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cafeCoupons, setCafeCoupons] = useState<any[]>([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [couponForm, setCouponForm] = useState({ code: '', discount_type: 'percentage', discount_value: '', bonus_minutes: '0', max_uses: '', valid_until: '' });
  const [savingCoupon, setSavingCoupon] = useState(false);
  const [couponMsg, setCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editCouponId, setEditCouponId] = useState<string | null>(null);
  const [editCouponForm, setEditCouponForm] = useState({ discount_value: '', max_uses: '', valid_until: '' });
  const [savingEditCoupon, setSavingEditCoupon] = useState(false);

  // Cafe bookings sub-tab state
  const [cafeBookings, setCafeBookings] = useState<BookingRow[]>([]);
  const [loadingCafeBookings, setLoadingCafeBookings] = useState(false);

  // Bulk selection
  const [selectedCafeIds, setSelectedCafeIds] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);

  // Global coupons tab state
  const [showGlobalCouponForm, setShowGlobalCouponForm] = useState(false);
  const [globalCouponCafeId, setGlobalCouponCafeId] = useState('');
  const [globalCouponForm, setGlobalCouponForm] = useState({ code: '', discount_type: 'percentage', discount_value: '', bonus_minutes: '0', max_uses: '', valid_until: '' });
  const [savingGlobalCoupon, setSavingGlobalCoupon] = useState(false);
  const [globalCouponMsg, setGlobalCouponMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User management panel
  const [managedUserId, setManagedUserId] = useState<string | null>(null);
  const [userBookings, setUserBookings] = useState<BookingRow[]>([]);
  const [loadingUserBookings, setLoadingUserBookings] = useState(false);

  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Announcement form state
  const [showAnnouncementForm, setShowAnnouncementForm] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: '',
    message: '',
    type: 'info' as 'info' | 'warning' | 'success' | 'error',
    target_audience: 'all' as 'all' | 'users' | 'owners',
    expires_at: '',
  });

  // Admin settings state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [settingsMessage, setSettingsMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  // Filters
  const [cafeFilter, setCafeFilter] = useState<string>("all");
  const [showCreateCafe, setShowCreateCafe] = useState(false);
  const [createCafeForm, setCreateCafeForm] = useState({
    name: '', address: '', phone: '', email: '', owner_email: '',
    price_starts_from: '', hourly_price: '',
    ps5_count: '0', ps4_count: '0', xbox_count: '0', pc_count: '0',
    vr_count: '0', pool_count: '0', snooker_count: '0', arcade_count: '0',
    steering_wheel_count: '0', racing_sim_count: '0',
  });
  const [createCafeLoading, setCreateCafeLoading] = useState(false);
  const [createCafeMsg, setCreateCafeMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cafeSearch, setCafeSearch] = useState<string>("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("all");
  const [userSearch, setUserSearch] = useState<string>("");
  const [offlineCustomers, setOfflineCustomers] = useState<OfflineCustomer[]>([]);
  const [offlineCustomersLoading, setOfflineCustomersLoading] = useState(false);
  const [offlineSearch, setOfflineSearch] = useState("");
  const [offlineCafeFilter, setOfflineCafeFilter] = useState("all");
  const [offlineSort, setOfflineSort] = useState<'visits' | 'spend' | 'recent'>("recent");
  const [bookingStatusFilter, setBookingStatusFilter] = useState<string>("all");
  const [bookingDateFilter, setBookingDateFilter] = useState<string>("");
  const [bookingSearch, setBookingSearch] = useState<string>("");
  const [bookingDateFrom, setBookingDateFrom] = useState<string>("");
  const [bookingDateTo, setBookingDateTo] = useState<string>("");
  const [bookingSourceFilter, setBookingSourceFilter] = useState<string>("all");

  // Revenue tab filters
  const [revenueFrom, setRevenueFrom] = useState<string>("");
  const [revenueTo, setRevenueTo] = useState<string>("");
  const [revenueSourceBreakdown, setRevenueSourceBreakdown] = useState<{ online: number; walkin: number; membership: number }>({ online: 0, walkin: 0, membership: 0 });
  const [revenueCafeFilter, setRevenueCafeFilter] = useState<string>("all");

  // Reports tab data
  const [reportDailyData, setReportDailyData] = useState<{ date: string; bookings: number; revenue: number; cancelled: number }[]>([]);
  const [reportPeakHours, setReportPeakHours] = useState<{ hour: string; count: number }[]>([]);
  const [reportSourceSplit, setReportSourceSplit] = useState<{ online: number; walkin: number; membership: number; onlineRev: number; walkinRev: number; membershipRev: number }>({ online: 0, walkin: 0, membership: 0, onlineRev: 0, walkinRev: 0, membershipRev: 0 });
  const [loadingReport, setLoadingReport] = useState(false);
  const [reportDays, setReportDays] = useState<30 | 60 | 90>(30);

  // Subscriptions tab
  const [platformSubscriptions, setPlatformSubscriptions] = useState<any[]>([]);
  const [loadingSubscriptions, setLoadingSubscriptions] = useState(false);
  const [subscriptionSearch, setSubscriptionSearch] = useState("");
  const [subscriptionCafeFilter, setSubscriptionCafeFilter] = useState("all");

  // Audit log filters
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditEntityFilter, setAuditEntityFilter] = useState("all");

  // Maintenance mode

  // Pagination
  const [cafePage, setCafePage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [bookingPage, setBookingPage] = useState(1);
  const itemsPerPage = 10;

  // Sorting
  const [cafeSort, setCafeSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'created_at', order: 'desc' });
  const [userSort, setUserSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'created_at', order: 'desc' });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [bookingSort, setBookingSort] = useState<{ field: string; order: 'asc' | 'desc' }>({ field: 'created_at', order: 'desc' });
  const tabMeta: Record<NavTab, { title: string; subtitle: string; eyebrow: string }> = {
    overview: {
      title: "Mission Control",
      subtitle: "Watch platform growth, revenue pulse, and operator health from one control surface.",
      eyebrow: "Live Platform Feed",
    },
    cafes: {
      title: "Café Network",
      subtitle: "Review store performance, spotlight top operators, and intervene on weak locations.",
      eyebrow: "Operations",
    },
    users: {
      title: "Account Roster",
      subtitle: "Track customers, owners, and admin role changes across the network.",
      eyebrow: "Identity",
    },
    'offline-customers': {
      title: "Offline Customers",
      subtitle: "Walk-in customers entered manually by owners — grouped by phone number.",
      eyebrow: "Walk-ins",
    },
    bookings: {
      title: "Booking Traffic",
      subtitle: "Inspect live booking flow, anomalies, and booking quality across all cafés.",
      eyebrow: "Reservations",
    },
    revenue: {
      title: "Revenue Desk",
      subtitle: "Monitor gross earnings and identify the sharpest changes in platform monetization.",
      eyebrow: "Finance",
    },
    reports: {
      title: "Insight Lab",
      subtitle: "Deep-dive into trends, compare windows, and turn raw data into operator decisions.",
      eyebrow: "Analytics",
    },
    settings: {
      title: "Control Settings",
      subtitle: "Update admin credentials and platform controls without leaving the command deck.",
      eyebrow: "Security",
    },
    announcements: {
      title: "Broadcast Studio",
      subtitle: "Push platform-wide messaging with sharper targeting and cleaner oversight.",
      eyebrow: "Comms",
    },
    'audit-logs': {
      title: "Audit Trail",
      subtitle: "See who changed what, when they changed it, and what needs review.",
      eyebrow: "Governance",
    },
    coupons: {
      title: "Offer Engine",
      subtitle: "Track discount programs, café-level promotions, and redemption pressure points.",
      eyebrow: "Growth",
    },
    'owner-access': {
      title: "Owner Access",
      subtitle: "Manage which Google accounts can sign in to the owner dashboard.",
      eyebrow: "Access Control",
    },
    subscriptions: {
      title: "Subscriptions",
      subtitle: "Track active memberships, hours remaining, and subscription revenue across all cafés.",
      eyebrow: "Members",
    },
  };

  const activeTabMeta = tabMeta[activeTab];
  const averageBookingsPerCafe = stats?.totalCafes
    ? Math.round((stats.totalBookings || 0) / Math.max(stats.totalCafes, 1))
    : 0;
  const averageRevenuePerBooking = stats?.totalBookings
    ? Math.round((stats.totalRevenue || 0) / Math.max(stats.totalBookings, 1))
    : 0;
  const activeCafeRate = stats?.totalCafes
    ? Math.round(((stats.activeCafes || 0) / Math.max(stats.totalCafes, 1)) * 100)
    : 0;
  const formattedToday = new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Auth is handled by useAdminAuth hook above

  // Load platform statistics
  useEffect(() => {
    if (!isAdmin) return;

    async function loadStats() {
      try {
        setLoadingData(true);
        setError(null);

        // Use IST date (UTC+5:30) so "today" matches booking_date correctly
        const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const todayStr = istNow.toISOString().slice(0, 10);
        const weekStr = new Date(istNow.getTime() - 7 * 86400_000).toISOString().slice(0, 10);
        const monthStr = `${istNow.getFullYear()}-${String(istNow.getMonth() + 1).padStart(2, '0')}-01`;

        // Run all counts + revenue queries in parallel
        const [
          { count: totalCafes },
          { count: activeCafes },
          { count: pendingCafes },
          { count: totalBookings },
          { count: todayBookings },
          { count: totalUsers },
          { count: totalOwners },
          { data: todayRevData },
          { data: weekRevData },
          { data: monthRevData },
          { data: totalRevData },
        ] = await Promise.all([
          supabase.from("cafes").select("id", { count: "exact", head: true }),
          supabase.from("cafes").select("id", { count: "exact", head: true }).eq("is_active", true),
          supabase.from("cafes").select("id", { count: "exact", head: true }).eq("is_active", false),
          supabase.from("bookings").select("id", { count: "exact", head: true }).is("deleted_at", null),
          supabase.from("bookings").select("id", { count: "exact", head: true }).eq("booking_date", todayStr).is("deleted_at", null),
          supabase.from("profiles").select("id", { count: "exact", head: true }),
          supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "owner"),
          supabase.from("bookings").select("total_amount").eq("booking_date", todayStr).is("deleted_at", null).neq("status", "cancelled"),
          supabase.from("bookings").select("total_amount").gte("booking_date", weekStr).is("deleted_at", null).neq("status", "cancelled"),
          supabase.from("bookings").select("total_amount").gte("booking_date", monthStr).is("deleted_at", null).neq("status", "cancelled"),
          supabase.from("bookings").select("total_amount").is("deleted_at", null).neq("status", "cancelled"),
        ]);

        const sum = (rows: any[] | null) => (rows || []).reduce((s, b) => s + (b.total_amount || 0), 0);

        setStats({
          totalCafes: totalCafes || 0,
          activeCafes: activeCafes || 0,
          pendingCafes: pendingCafes || 0,
          totalBookings: totalBookings || 0,
          todayBookings: todayBookings || 0,
          totalUsers: totalUsers || 0,
          totalOwners: totalOwners || 0,
          todayRevenue: sum(todayRevData),
          weekRevenue: sum(weekRevData),
          monthRevenue: sum(monthRevData),
          totalRevenue: sum(totalRevData),
        });
      } catch (err) {
        console.error("Error loading stats:", err);
        setError("Failed to load platform statistics");
      } finally {
        setLoadingData(false);
      }
    }

    loadStats();
  }, [isAdmin]);

  // Load cafes data
  useEffect(() => {
    if (!isAdmin || (activeTab !== 'cafes' && activeTab !== 'owner-access')) return;

    async function loadCafes() {
      try {
        setLoadingData(true);

        const { data, error } = await supabase
          .from("cafes")
          .select(`
            id,
            name,
            slug,
            address,
            city,
            phone,
            email,
            description,
            opening_hours,
            owner_id,
            is_active,
            is_featured,
            created_at,
            price_starts_from,
            hourly_price,
            ps5_count,
            ps4_count,
            xbox_count,
            pc_count,
            vr_count,
            pool_count,
            snooker_count,
            arcade_count,
            steering_wheel_count,
            racing_sim_count
          `)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const enrichedCafes = await Promise.all(
          (data || []).map(async (cafe) => {
            const { data: owner } = await supabase
              .from("profiles")
              .select("first_name, last_name, phone, email")
              .eq("id", cafe.owner_id)
              .maybeSingle();

            const { count: bookingCount } = await supabase
              .from("bookings")
              .select("id", { count: "exact", head: true })
              .eq("cafe_id", cafe.id);

            const { data: revenueData } = await supabase
              .from("bookings")
              .select("total_amount")
              .eq("cafe_id", cafe.id);

            const totalRevenue = revenueData?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

            const ownerName = owner
              ? [owner.first_name, owner.last_name].filter(Boolean).join(" ") || "Unknown Owner"
              : "Unknown Owner";

            return {
              ...cafe,
              owner_name: ownerName,
              owner_email: owner?.email || null,
              owner_phone: owner?.phone || null,
              total_bookings: bookingCount || 0,
              total_revenue: totalRevenue,
            };
          })
        );

        setCafes(enrichedCafes);
      } catch (err) {
        console.error("Error loading cafes:", err);
        setError("Failed to load cafés data");
      } finally {
        setLoadingData(false);
      }
    }

    loadCafes();
  }, [isAdmin, activeTab]);

  // Load users data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'users') return;

    async function loadUsers() {
      try {
        setLoadingData(true);
        setError(null);

        // Fetch profiles with role - email comes from auth.users, not profiles table
        const { data, error } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, phone, role, created_at")
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Profiles query error details:", error);
          setError(`Failed to load users: ${error.message || 'Unknown error'}`);
          setLoadingData(false);
          return;
        }

        const enrichedUsers = await Promise.all(
          (data || []).map(async (profile) => {
            const { count: bookingCount } = await supabase
              .from("bookings")
              .select("id", { count: "exact", head: true })
              .eq("user_id", profile.id);

            const { data: bookingData } = await supabase
              .from("bookings")
              .select("total_amount, created_at")
              .eq("user_id", profile.id)
              .order("created_at", { ascending: false })
              .limit(1);

            const { data: revenueData } = await supabase
              .from("bookings")
              .select("total_amount")
              .eq("user_id", profile.id);

            const totalSpent = revenueData?.reduce((sum, b) => sum + (b.total_amount || 0), 0) || 0;

            // Combine first_name and last_name into name
            const name = [profile.first_name, profile.last_name]
              .filter(Boolean)
              .join(" ") || "Unknown User";

            // Get role from profiles table, default to 'user' if not set
            const role = profile.role || "user";

            return {
              id: profile.id,
              name,
              email: null, // Email not stored in profiles table
              phone: profile.phone,
              role: role,
              created_at: profile.created_at,
              total_bookings: bookingCount || 0,
              total_spent: totalSpent,
              last_booking: bookingData?.[0]?.created_at || null,
            };
          })
        );

        setUsers(enrichedUsers);
      } catch (err) {
        console.error("Error loading users:", err);
        setError("Failed to load users data");
      } finally {
        setLoadingData(false);
      }
    }

    loadUsers();
  }, [isAdmin, activeTab]);

  // Load bookings data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'bookings') return;

    async function loadBookings() {
      try {
        setLoadingData(true);

        const { data, error } = await supabase
          .from("bookings")
          .select(`
            id,
            cafe_id,
            user_id,
            booking_date,
            start_time,
            duration,
            total_amount,
            status,
            source,
            customer_name,
            customer_phone,
            created_at
          `)
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        const enrichedBookings = await Promise.all(
          (data || []).map(async (booking) => {
            const { data: cafe } = await supabase
              .from("cafes")
              .select("name")
              .eq("id", booking.cafe_id)
              .maybeSingle();

            let userName = booking.customer_name || "Walk-in";
            if (booking.user_id) {
              const { data: user } = await supabase
                .from("profiles")
                .select("first_name, last_name")
                .eq("id", booking.user_id)
                .maybeSingle();
              userName = user
                ? [user.first_name, user.last_name].filter(Boolean).join(" ") || "Online User"
                : "Online User";
            }

            return {
              ...booking,
              cafe_name: cafe?.name || "Unknown Café",
              user_name: userName,
            };
          })
        );

        setBookings(enrichedBookings);
      } catch (err) {
        console.error("Error loading bookings:", err);
        setError("Failed to load bookings data");
      } finally {
        setLoadingData(false);
      }
    }

    loadBookings();
  }, [isAdmin, activeTab]);

  // Load offline customers data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'offline-customers') return;
    async function loadOfflineCustomers() {
      try {
        setOfflineCustomersLoading(true);
        const { data, error } = await supabase
          .from("bookings")
          .select("customer_name, customer_phone, cafe_id, total_amount, booking_date, cafes(name)")
          .not("customer_phone", "is", null)
          .not("customer_name", "is", null)
          .neq("customer_name", "")
          .is("deleted_at", null)
          .order("booking_date", { ascending: false });
        if (error) throw error;
        // Group by phone number
        const map = new Map<string, OfflineCustomer>();
        for (const b of data || []) {
          const phone = b.customer_phone as string;
          const cafeName = (b.cafes as any)?.name || "Unknown";
          const amount = Number(b.total_amount) || 0;
          if (map.has(phone)) {
            const existing = map.get(phone)!;
            existing.total_bookings += 1;
            existing.total_spent += amount;
            if (b.booking_date > existing.last_visit) {
              existing.last_visit = b.booking_date;
              existing.cafe_name = cafeName;
              existing.cafe_id = b.cafe_id;
            }
          } else {
            map.set(phone, {
              phone,
              name: b.customer_name as string,
              cafe_name: cafeName,
              cafe_id: b.cafe_id,
              total_bookings: 1,
              total_spent: amount,
              last_visit: b.booking_date,
            });
          }
        }
        setOfflineCustomers(Array.from(map.values()).sort((a, b) => b.last_visit.localeCompare(a.last_visit)));
      } catch (err) {
        console.error("Error loading offline customers:", err);
      } finally {
        setOfflineCustomersLoading(false);
      }
    }
    loadOfflineCustomers();
  }, [isAdmin, activeTab]);

  // Load announcements data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'announcements') return;

    async function loadAnnouncements() {
      try {
        setLoadingData(true);
        setError(null);

        const { data, error } = await supabase
          .from("platform_announcements")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        setAnnouncements(data || []);
      } catch (err) {
        console.error("Error loading announcements:", err);
        setError("Failed to load announcements data");
      } finally {
        setLoadingData(false);
      }
    }

    loadAnnouncements();
  }, [isAdmin, activeTab]);

  // Load audit logs data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'audit-logs') return;

    async function loadAuditLogs() {
      try {
        setLoadingData(true);
        setError(null);

        const { data, error } = await supabase
          .from("audit_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) throw error;

        setAuditLogs(data || []);
      } catch (err) {
        console.error("Error loading audit logs:", err);
        setError("Failed to load audit logs data");
      } finally {
        setLoadingData(false);
      }
    }

    loadAuditLogs();
  }, [isAdmin, activeTab]);

  // Load coupons data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'coupons') return;

    async function loadCoupons() {
      try {
        setLoadingData(true);
        setError(null);

        const { data, error } = await supabase
          .from("coupons")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) throw error;

        // Enrich with cafe names
        const enrichedCoupons = await Promise.all(
          (data || []).map(async (coupon) => {
            const { data: cafe } = await supabase
              .from("cafes")
              .select("name")
              .eq("id", coupon.cafe_id)
              .maybeSingle();

            return {
              ...coupon,
              cafe_name: cafe?.name || "Unknown Café",
            };
          })
        );

        setCoupons(enrichedCoupons);
      } catch (err) {
        console.error("Error loading coupons:", err);
        setError("Failed to load coupons data");
      } finally {
        setLoadingData(false);
      }
    }

    loadCoupons();
  }, [isAdmin, activeTab]);

  // Load subscriptions
  useEffect(() => {
    if (!isAdmin || activeTab !== 'subscriptions') return;
    async function loadSubscriptions() {
      setLoadingSubscriptions(true);
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('id, cafe_id, customer_name, customer_phone, amount_paid, purchase_date, hours_remaining, timer_active, membership_plans(name, console_type, plan_type)')
          .order('purchase_date', { ascending: false })
          .limit(300);
        if (error) throw error;
        // Enrich with cafe name using already-loaded cafes if available
        const enriched = await Promise.all((data || []).map(async (s) => {
          const { data: cafe } = await supabase.from('cafes').select('name').eq('id', s.cafe_id).maybeSingle();
          return { ...s, cafe_name: cafe?.name || 'Unknown' };
        }));
        setPlatformSubscriptions(enriched);
      } catch (err) { console.error(err); }
      finally { setLoadingSubscriptions(false); }
    }
    loadSubscriptions();
  }, [isAdmin, activeTab]);

  // Load reports data
  useEffect(() => {
    if (!isAdmin || activeTab !== 'reports') return;
    async function loadReports() {
      setLoadingReport(true);
      try {
        const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
        const fromDate = new Date(istNow.getTime() - reportDays * 86400_000).toISOString().slice(0, 10);

        const { data } = await supabase
          .from('bookings')
          .select('booking_date, start_time, total_amount, status, source')
          .gte('booking_date', fromDate)
          .is('deleted_at', null)
          .order('booking_date', { ascending: true });

        const rows = data || [];

        // Daily aggregation
        const dailyMap = new Map<string, { bookings: number; revenue: number; cancelled: number }>();
        const hourMap = new Map<string, number>();
        let online = 0, walkin = 0, membership = 0;
        let onlineRev = 0, walkinRev = 0, membershipRev = 0;

        for (const b of rows) {
          const d = (b.booking_date || '').slice(0, 10);
          if (!dailyMap.has(d)) dailyMap.set(d, { bookings: 0, revenue: 0, cancelled: 0 });
          const entry = dailyMap.get(d)!;
          entry.bookings++;
          if (b.status !== 'cancelled') entry.revenue += b.total_amount || 0;
          if (b.status === 'cancelled') entry.cancelled++;

          // Peak hours
          const timeStr = (b.start_time || '').trim();
          const hour = timeStr ? timeStr.split(':')[0].replace(/[^0-9]/g, '') || '?' : '?';
          // Parse 12hr format
          let h = parseInt(hour) || 0;
          const isPM = /pm/i.test(timeStr);
          const isAM = /am/i.test(timeStr);
          if (isPM && h !== 12) h += 12;
          if (isAM && h === 12) h = 0;
          const label = h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`;
          hourMap.set(label, (hourMap.get(label) || 0) + 1);

          // Source split
          const src = (b.source || '').toLowerCase();
          const rev = b.status !== 'cancelled' ? (b.total_amount || 0) : 0;
          if (src === 'online') { online++; onlineRev += rev; }
          else if (src === 'membership') { membership++; membershipRev += rev; }
          else { walkin++; walkinRev += rev; }
        }

        const dailyArr = Array.from(dailyMap.entries()).map(([date, v]) => ({ date, ...v }));
        const hourArr = Array.from(hourMap.entries())
          .map(([hour, count]) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setReportDailyData(dailyArr);
        setReportPeakHours(hourArr);
        setReportSourceSplit({ online, walkin, membership, onlineRev, walkinRev, membershipRev });
      } catch (err) { console.error(err); }
      finally { setLoadingReport(false); }
    }
    loadReports();
  }, [isAdmin, activeTab, reportDays]);

  // Load owner emails when tab is active
  useEffect(() => {
    if (!isAdmin || activeTab !== 'owner-access') return;
    async function loadOwnerEmails() {
      setOwnerEmailsLoading(true);
      try {
        const res = await fetch('/api/admin/owner-emails', { credentials: 'include' });
        const data = await res.json();
        if (res.ok) setOwnerEmails(data.emails || []);
      } catch {}
      finally { setOwnerEmailsLoading(false); }
    }
    loadOwnerEmails();
  }, [isAdmin, activeTab]);

  async function handleAddOwnerEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newOwnerEmail || !newOwnerCafeId) return;
    setOwnerEmailMsg(null);
    try {
      const res = await fetch('/api/admin/owner-emails', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newOwnerEmail, cafe_id: newOwnerCafeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setNewOwnerEmail('');
      setNewOwnerCafeId('');
      setOwnerEmailMsg({ type: 'success', text: 'Email added successfully' });
      // Refresh list
      const r2 = await fetch('/api/admin/owner-emails', { credentials: 'include' });
      const d2 = await r2.json();
      if (r2.ok) setOwnerEmails(d2.emails || []);
    } catch (err: any) {
      setOwnerEmailMsg({ type: 'error', text: err.message });
    }
  }

  async function handleDeleteOwnerEmail(id: string) {
    if (!confirm('Remove this email from the allowed list?')) return;
    try {
      const res = await fetch(`/api/admin/owner-emails?id=${id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      setOwnerEmails(prev => prev.filter(e => e.id !== id));
    } catch { alert('Failed to remove email'); }
  }

  // Toggle cafe active status
  async function toggleCafeStatus(cafeId: string, currentStatus: boolean, cafeName: string) {
    try {
      const newStatus = !currentStatus;
      await updateCafeViaApi(cafeId, { is_active: newStatus });

      setCafes(prev => prev.map(c =>
        c.id === cafeId ? { ...c, is_active: newStatus } : c
      ));

      // Log the action
      await logAdminAction({
        action: newStatus ? "activate" : "deactivate",
        entityType: "cafe",
        entityId: cafeId,
        details: { cafeName, oldStatus: currentStatus, newStatus },
        adminId,
      });
    } catch (err) {
      console.error("Error toggling cafe status:", err);
      alert("Failed to update café status");
    }
  }

  // Delete cafe
  async function deleteCafe(cafeId: string, cafeName: string) {
    setDeleteConfirm({ id: cafeId, name: cafeName });
  }

  async function confirmDeleteCafe(cafeId: string, cafeName: string) {
    setDeleteConfirm(null);

    try {
      setLoadingData(true);

      // One request: the cascade used to be five separate deletes from the
      // browser, each able to fail on its own, and it missed subscriptions,
      // coupons, membership plans, inventory and the owner's sign-in mapping —
      // all left pointing at a café that no longer existed.
      await adminApi('cafes', 'DELETE', { cafeId });

      console.log("Café deleted successfully");

      // Update local state
      setCafes(prev => prev.filter(c => c.id !== cafeId));

      // Reload stats to reflect changes
      setStats(prev => prev ? {
        ...prev,
        totalCafes: prev.totalCafes - 1,
        activeCafes: prev.activeCafes - 1,
      } : null);

      // Log the action
      await logAdminAction({
        action: "delete",
        entityType: "cafe",
        entityId: cafeId,
        details: { cafeName },
        adminId,
      });

      alert("Café and all related data deleted successfully");
    } catch (err) {
      console.error("Error deleting cafe:", err);
      alert(`Failed to delete café: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoadingData(false);
    }
  }

  // Update user role
  async function updateUserRole(userId: string, newRole: string, userName: string) {
    try {
      const oldRole = users.find(u => u.id === userId)?.role;

      await adminApi('users', 'PUT', { userId, role: newRole });

      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, role: newRole } : u
      ));

      // Log the action
      await logAdminAction({
        action: "change_role",
        entityType: "user",
        entityId: userId,
        details: { userName, oldRole, newRole },
        adminId,
      });
    } catch (err) {
      console.error("Error updating user role:", err);
      alert("Failed to update user role");
    }
  }

  // Delete user
  async function deleteUser(userId: string, userName: string) {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await adminApi('users', 'DELETE', { userId });

      setUsers(prev => prev.filter(u => u.id !== userId));

      // Log the action
      await logAdminAction({
        action: "delete",
        entityType: "user",
        entityId: userId,
        details: { userName },
        adminId,
      });

      alert("User deleted successfully");
    } catch (err) {
      console.error("Error deleting user:", err);
      alert("Failed to delete user");
    }
  }

  // Create announcement
  async function createAnnouncement() {
    try {
      if (!announcementForm.title || !announcementForm.message) {
        alert("Please fill in title and message");
        return;
      }

      await adminApi('announcements', 'POST', {
        announcement: {
          title: announcementForm.title,
          message: announcementForm.message,
          type: announcementForm.type,
          target_audience: announcementForm.target_audience,
          expires_at: announcementForm.expires_at || null,
        },
      });

      // Log the action
      await logAdminAction({
        action: "create",
        entityType: "announcement",
        details: { title: announcementForm.title, type: announcementForm.type },
        adminId,
      });

      // Reset form
      setAnnouncementForm({
        title: '',
        message: '',
        type: 'info',
        target_audience: 'all',
        expires_at: '',
      });
      setShowAnnouncementForm(false);

      // Reload announcements
      const { data } = await supabase
        .from("platform_announcements")
        .select("*")
        .order("created_at", { ascending: false });

      setAnnouncements(data || []);
      alert("Announcement created successfully");
    } catch (err) {
      console.error("Error creating announcement:", err);
      alert("Failed to create announcement");
    }
  }

  // Toggle announcement status
  async function toggleAnnouncementStatus(id: string, currentStatus: boolean) {
    try {
      await adminApi('announcements', 'PUT', { id, updates: { is_active: !currentStatus } });

      setAnnouncements(prev => prev.map(a =>
        a.id === id ? { ...a, is_active: !currentStatus } : a
      ));
    } catch (err) {
      console.error("Error toggling announcement:", err);
      alert("Failed to update announcement");
    }
  }

  // Delete announcement
  async function deleteAnnouncement(id: string, title: string) {
    if (!confirm(`Are you sure you want to delete announcement "${title}"?`)) {
      return;
    }

    try {
      await adminApi('announcements', 'DELETE', { id });

      setAnnouncements(prev => prev.filter(a => a.id !== id));

      await logAdminAction({
        action: "delete",
        entityType: "announcement",
        entityId: id,
        details: { title },
        adminId,
      });

      alert("Announcement deleted successfully");
    } catch (err) {
      console.error("Error deleting announcement:", err);
      alert("Failed to delete announcement");
    }
  }

  // Save admin settings (username/password)
  async function saveAdminSettings() {
    setSettingsMessage(null);
    setSavingSettings(true);

    try {
      if (!adminId) {
        setSettingsMessage({ type: 'error', text: 'Admin session not found' });
        setSavingSettings(false);
        return;
      }

      // Get current admin credentials
      // The password check and the write both happen server-side now. This
      // used to fetch admin_password into the browser to compare it, which put
      // the credential on the page for anyone with the console open.
      await adminApi('settings', 'PUT', {
        currentPassword,
        newUsername: newUsername || undefined,
        newPassword: newPassword || undefined,
      });

      // Session username is managed server-side; no client update needed

      // Log the action
      await logAdminAction({
        action: "update",
        entityType: "settings",
        entityId: adminId,
        details: {
          username_changed: !!newUsername,
          password_changed: !!newPassword
        },
        adminId,
      });

      setSettingsMessage({ type: 'success', text: 'Admin credentials updated successfully!' });

      // Clear form
      setCurrentPassword('');
      setNewUsername('');
      setNewPassword('');
      setConfirmPassword('');

    } catch (err) {
      console.error("Error updating admin settings:", err);
      setSettingsMessage({ type: 'error', text: 'Failed to update credentials' });
    } finally {
      setSavingSettings(false);
    }
  }

  // Toggle featured café
  async function toggleFeaturedCafe(cafeId: string, currentStatus: boolean, cafeName: string) {
    try {
      const newStatus = !currentStatus;
      await updateCafeViaApi(cafeId, {
        is_featured: newStatus,
        featured_at: newStatus ? new Date().toISOString() : null,
      });

      setCafes(prev => prev.map(c =>
        c.id === cafeId ? { ...c, is_featured: newStatus } as CafeRow : c
      ));

      await logAdminAction({
        action: newStatus ? "feature" : "unfeature",
        entityType: "cafe",
        entityId: cafeId,
        details: { cafeName },
        adminId,
      });

      alert(`Café ${newStatus ? 'featured' : 'unfeatured'} successfully`);
    } catch (err) {
      console.error("Error toggling featured status:", err);
      alert("Failed to update featured status");
    }
  }

  // Sorting helper
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sortData = <T extends Record<string, any>>(data: T[], field: string, order: 'asc' | 'desc'): T[] => {
    return [...data].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return order === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      return order === 'asc'
        ? (aVal > bVal ? 1 : -1)
        : (bVal > aVal ? 1 : -1);
    });
  };

  // Handle sort click
  const handleSort = (
    currentSort: { field: string; order: 'asc' | 'desc' },
    setSort: React.Dispatch<React.SetStateAction<{ field: string; order: 'asc' | 'desc' }>>,
    field: string
  ) => {
    if (currentSort.field === field) {
      setSort({ field, order: currentSort.order === 'asc' ? 'desc' : 'asc' });
    } else {
      setSort({ field, order: 'asc' });
    }
  };

  // Filter and sort data
  const filteredCafes = sortData(
    cafes.filter(cafe => {
      if (cafeFilter === "active" && !cafe.is_active) return false;
      if (cafeFilter === "inactive" && cafe.is_active) return false;
      if (cafeSearch && !cafe.name.toLowerCase().includes(cafeSearch.toLowerCase()) &&
        !cafe.address.toLowerCase().includes(cafeSearch.toLowerCase())) return false;
      return true;
    }),
    cafeSort.field,
    cafeSort.order
  );

  const filteredUsers = sortData(
    users.filter(user => {
      if (userRoleFilter !== "all" && user.role !== userRoleFilter) return false;
      if (userSearch && !user.name.toLowerCase().includes(userSearch.toLowerCase()) &&
        !(user.email || "").toLowerCase().includes(userSearch.toLowerCase())) return false;
      return true;
    }),
    userSort.field,
    userSort.order
  );

  const filteredBookings = sortData(
    bookings.filter(booking => {
      if (bookingStatusFilter !== "all" && (booking.status || "confirmed") !== bookingStatusFilter) return false;
      if (bookingDateFilter && booking.booking_date !== bookingDateFilter) return false;
      if (bookingDateFrom && booking.booking_date < bookingDateFrom) return false;
      if (bookingDateTo && booking.booking_date > bookingDateTo) return false;
      if (bookingSourceFilter !== "all") {
        const src = (booking.source || '').toLowerCase();
        if (bookingSourceFilter === 'online' && src !== 'online') return false;
        if (bookingSourceFilter === 'walkin' && src !== 'walk_in' && src !== 'walk-in') return false;
        if (bookingSourceFilter === 'membership' && src !== 'membership') return false;
      }
      if (bookingSearch) {
        const q = bookingSearch.toLowerCase();
        const matchName = booking.user_name?.toLowerCase().includes(q);
        const matchCafe = booking.cafe_name?.toLowerCase().includes(q);
        const matchPhone = booking.customer_phone?.toLowerCase().includes(q);
        if (!matchName && !matchCafe && !matchPhone) return false;
      }
      return true;
    }),
    bookingSort.field,
    bookingSort.order
  );

  // Filtered audit logs
  const filteredAuditLogs = auditLogs.filter(log => {
    if (auditActionFilter !== 'all' && log.action !== auditActionFilter) return false;
    if (auditEntityFilter !== 'all' && log.entity_type !== auditEntityFilter) return false;
    return true;
  });

  // Revenue filtered cafes
  const revenueFilteredCafes = cafes
    .filter(c => revenueCafeFilter === 'all' || c.id === revenueCafeFilter)
    .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0));

  // Filtered subscriptions
  const filteredSubscriptions = platformSubscriptions.filter(s => {
    if (subscriptionCafeFilter !== 'all' && s.cafe_id !== subscriptionCafeFilter) return false;
    if (subscriptionSearch) {
      const q = subscriptionSearch.toLowerCase();
      if (!s.customer_name?.toLowerCase().includes(q) && !s.cafe_name?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const activeSubscriptions = filteredSubscriptions.filter(s => s.timer_active);
  const subscriptionRevenue = filteredSubscriptions.reduce((sum: number, s: any) => sum + (s.amount_paid || 0), 0);

  // Paginate data
  const paginatedCafes = filteredCafes.slice((cafePage - 1) * itemsPerPage, cafePage * itemsPerPage);
  const paginatedUsers = filteredUsers.slice((userPage - 1) * itemsPerPage, userPage * itemsPerPage);
  const paginatedBookings = filteredBookings.slice((bookingPage - 1) * itemsPerPage, bookingPage * itemsPerPage);

  const totalCafePages = Math.ceil(filteredCafes.length / itemsPerPage);
  const totalUserPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const totalBookingPages = Math.ceil(filteredBookings.length / itemsPerPage);

  // Offline customers filtered + sorted list
  const filteredOfflineCustomers = offlineCustomers
    .filter(c => {
      const q = offlineSearch.toLowerCase();
      const matchSearch = !q || c.name.toLowerCase().includes(q) || c.phone.includes(q);
      const matchCafe = offlineCafeFilter === 'all' || c.cafe_id === offlineCafeFilter;
      return matchSearch && matchCafe;
    })
    .sort((a, b) =>
      offlineSort === 'visits' ? b.total_bookings - a.total_bookings :
      offlineSort === 'spend'  ? b.total_spent - a.total_spent :
      b.last_visit.localeCompare(a.last_visit)
    );

  // Format currency
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Download offline customers as CSV
  const downloadOfflineCustomersCSV = () => {
    const rows = [
      ['Name', 'Phone', 'Last Café', 'Total Visits', 'Total Spent (₹)', 'Last Visit'],
      ...filteredOfflineCustomers.map(c => [
        c.name,
        c.phone,
        c.cafe_name,
        c.total_bookings,
        c.total_spent,
        c.last_visit,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `offline-customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Cafe management handlers ───────────────────────────────────────────────

  function openCafeManage(cafe: CafeRow) {
    setManagedCafeId(cafe.id);
    setCafeManageSubTab('info');
    setCafeInfoMsg(null);
    // Parse opening/closing time from opening_hours string e.g. "Mon-Sun: 10:00 AM - 11:00 PM"
    let openingTime = '';
    let closingTime = '';
    if (cafe.opening_hours) {
      const match = cafe.opening_hours.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      if (match) { openingTime = match[1].trim(); closingTime = match[2].trim(); }
    }
    setEditCafeForm({
      name: cafe.name || '',
      slug: cafe.slug || '',
      address: cafe.address || '',
      city: cafe.city || '',
      phone: cafe.phone || '',
      email: cafe.email || '',
      description: cafe.description || '',
      opening_time: openingTime,
      closing_time: closingTime,
      price_starts_from: cafe.price_starts_from?.toString() || '',
      hourly_price: cafe.hourly_price?.toString() || '',
      ps5_count: cafe.ps5_count?.toString() || '0',
      ps4_count: cafe.ps4_count?.toString() || '0',
      xbox_count: cafe.xbox_count?.toString() || '0',
      pc_count: cafe.pc_count?.toString() || '0',
    });
    setCafeMembershipPlans([]);
    setCafeCoupons([]);
    setCafeBookings([]);
    setEditCouponId(null);
  }

  async function handleCreateCafe(e: React.FormEvent) {
    e.preventDefault();
    setCreateCafeLoading(true);
    setCreateCafeMsg(null);
    try {
      const res = await fetch('/api/admin/cafes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(createCafeForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create café');
      setCreateCafeMsg({ type: 'success', text: `✓ "${data.cafe.name}" created! Slug: /${data.cafe.slug} — activate it from the café list.` });
      setCreateCafeForm({
        name: '', address: '', phone: '', email: '', owner_email: '',
        price_starts_from: '', hourly_price: '',
        ps5_count: '0', ps4_count: '0', xbox_count: '0', pc_count: '0',
        vr_count: '0', pool_count: '0', snooker_count: '0', arcade_count: '0',
        steering_wheel_count: '0', racing_sim_count: '0',
      });
      // Reload cafes list
      const { data: newCafes } = await supabase.from('cafes').select('id, name, slug, address, phone, email, owner_id, is_active, is_featured, created_at, price_starts_from, hourly_price, ps5_count, ps4_count, xbox_count, pc_count').order('created_at', { ascending: false });
      if (newCafes) setCafes(newCafes as any);
    } catch (err: any) {
      setCreateCafeMsg({ type: 'error', text: err.message });
    } finally {
      setCreateCafeLoading(false);
    }
  }

  /**
   * Every admin write goes through /api/admin/*: the direct Supabase call is
   * blocked on the cafés' ISP, which is where an admin usually is, and the
   * routes are where the fields being written can actually be checked.
   */
  async function adminApi(path: string, method: 'POST' | 'PUT' | 'DELETE', body: unknown) {
    const res = await fetch(`/api/admin/${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  /**
   * Café edits go through the API rather than straight to Supabase.
   */
  async function updateCafeViaApi(cafeId: string, updates: Record<string, unknown>) {
    const res = await fetch('/api/admin/cafes', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cafeId, updates }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to save');

    return data.cafe;
  }

  async function saveCafeInfoAdmin() {
    if (!managedCafeId) return;
    setSavingCafeInfo(true);
    setCafeInfoMsg(null);
    try {
      const opening_hours = editCafeForm.opening_time && editCafeForm.closing_time
        ? `Mon-Sun: ${editCafeForm.opening_time} - ${editCafeForm.closing_time}`
        : null;
      const updates: Record<string, string | number | null> = {
        name: editCafeForm.name,
        slug: editCafeForm.slug || null,
        address: editCafeForm.address,
        city: editCafeForm.city || null,
        phone: editCafeForm.phone || null,
        email: editCafeForm.email || null,
        description: editCafeForm.description || null,
        opening_hours,
        price_starts_from: editCafeForm.price_starts_from ? Number(editCafeForm.price_starts_from) : null,
        hourly_price: editCafeForm.hourly_price ? Number(editCafeForm.hourly_price) : null,
      };
      await updateCafeViaApi(managedCafeId, updates);
      setCafes(prev => prev.map(c => c.id === managedCafeId ? { ...c, ...updates, opening_hours } as CafeRow : c));
      setCafeInfoMsg({ type: 'success', text: 'Café info updated successfully' });
    } catch (err: any) {
      setCafeInfoMsg({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSavingCafeInfo(false);
    }
  }

  async function updateStationCount(type: string, delta: number) {
    if (!managedCafeId) return;
    const cafe = cafes.find(c => c.id === managedCafeId);
    if (!cafe) return;
    setSavingStation(true);
    try {
      const key = `${type}_count` as keyof CafeRow;
      const current = (cafe[key] as number) || 0;
      const newCount = Math.max(0, current + delta);
      await updateCafeViaApi(managedCafeId, { [key]: newCount });
      setCafes(prev => prev.map(c => c.id === managedCafeId ? { ...c, [key]: newCount } : c));
    } catch (err: any) {
      alert(err.message || 'Failed to update station count');
    } finally {
      setSavingStation(false);
    }
  }

  async function loadCafeMemberships(cafeId: string) {
    setLoadingMemberships(true);
    try {
      const { data, error } = await supabase
        .from('membership_plans')
        .select('*')
        .eq('cafe_id', cafeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCafeMembershipPlans(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingMemberships(false);
    }
  }

  async function loadStationPricing(cafeId: string) {
    setLoadingStationPricing(true);
    try {
      const res = await fetch(`/api/admin/station-pricing?cafeId=${cafeId}`, { credentials: 'include' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load pricing');
      // Aggregate pricing per type — take the first row found for each station_type
      const byType: Record<string, any> = {};
      for (const row of (json.pricing || [])) {
        const t = row.station_type;
        if (t && !byType[t]) byType[t] = row;
      }
      setStationPricing(byType);
      // Seed form from existing pricing
      const form: Record<string, Record<string, string>> = {};
      for (const [type, row] of Object.entries(byType) as [string, any][]) {
        form[type] = {
          half_hour_rate: String(row.half_hour_rate ?? ''),
          hourly_rate: String(row.hourly_rate ?? ''),
          single_player_half_hour_rate: String(row.single_player_half_hour_rate ?? ''),
          single_player_rate: String(row.single_player_rate ?? ''),
          multi_player_half_hour_rate: String(row.multi_player_half_hour_rate ?? ''),
          multi_player_rate: String(row.multi_player_rate ?? ''),
          controller_1_half_hour: String(row.controller_1_half_hour ?? ''),
          controller_1_full_hour: String(row.controller_1_full_hour ?? ''),
          controller_2_half_hour: String(row.controller_2_half_hour ?? ''),
          controller_2_full_hour: String(row.controller_2_full_hour ?? ''),
          controller_3_half_hour: String(row.controller_3_half_hour ?? ''),
          controller_3_full_hour: String(row.controller_3_full_hour ?? ''),
          controller_4_half_hour: String(row.controller_4_half_hour ?? ''),
          controller_4_full_hour: String(row.controller_4_full_hour ?? ''),
        };
      }
      setStationPriceForm(form);
    } catch (err: any) {
      console.error('Failed to load station pricing:', err);
    } finally {
      setLoadingStationPricing(false);
    }
  }

  async function saveStationTypePricing(cafeId: string, stationType: string, count: number) {
    setSavingStationPricing(true);
    setStationPricingMsg(null);
    try {
      const f = stationPriceForm[stationType] || {};
      const n = (v: string) => (v.trim() === '' ? null : parseFloat(v) || 0);
      const payload: Record<string, any> = { cafeId, stationType, count };

      if (stationType === 'PS5' || stationType === 'Xbox') {
        payload.controller_1_half_hour = n(f.controller_1_half_hour);
        payload.controller_1_full_hour = n(f.controller_1_full_hour);
        payload.controller_2_half_hour = n(f.controller_2_half_hour);
        payload.controller_2_full_hour = n(f.controller_2_full_hour);
        payload.controller_3_half_hour = n(f.controller_3_half_hour);
        payload.controller_3_full_hour = n(f.controller_3_full_hour);
        payload.controller_4_half_hour = n(f.controller_4_half_hour);
        payload.controller_4_full_hour = n(f.controller_4_full_hour);
      } else if (stationType === 'PS4') {
        payload.single_player_half_hour_rate = n(f.single_player_half_hour_rate);
        payload.single_player_rate = n(f.single_player_rate);
        payload.multi_player_half_hour_rate = n(f.multi_player_half_hour_rate);
        payload.multi_player_rate = n(f.multi_player_rate);
      } else {
        payload.half_hour_rate = n(f.half_hour_rate);
        payload.hourly_rate = n(f.hourly_rate);
      }

      const res = await fetch('/api/admin/station-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to save pricing');
      setStationPricingMsg({ type: 'success', text: `Saved pricing for all ${count} ${stationType} station${count !== 1 ? 's' : ''}` });
      await loadStationPricing(cafeId);
    } catch (err: any) {
      setStationPricingMsg({ type: 'error', text: err.message || 'Failed to save' });
    } finally {
      setSavingStationPricing(false);
    }
  }

  async function saveMembershipPlan(cafeId: string) {
    setSavingMembership(true);
    setMembershipMsg(null);
    try {
      const plan_type = membershipForm.plan_type === 'day_pass' ? 'day_pass' : 'hourly_package';
      const payload = {
        cafe_id: cafeId,
        name: membershipForm.name.trim(),
        price: Number(membershipForm.price),
        hours: plan_type === 'day_pass' ? null : (membershipForm.hours ? Number(membershipForm.hours) : null),
        validity_days: Number(membershipForm.validity_days) || 30,
        plan_type,
        console_type: membershipForm.console_type,
        player_count: membershipForm.player_count,
        is_active: true,
      };
      await adminApi('membership-plans', 'POST', { cafeId, plan: payload });
      setMembershipMsg({ type: 'success', text: 'Plan added' });
      setMembershipForm({ name: '', price: '', hours: '', validity_days: '30', plan_type: 'hourly_package', console_type: 'ps5', player_count: 'single' });
      await loadCafeMemberships(cafeId);
    } catch (err: any) {
      setMembershipMsg({ type: 'error', text: err.message || 'Failed to add plan' });
    } finally {
      setSavingMembership(false);
    }
  }

  async function deleteMembershipPlan(id: string, cafeId: string) {
    if (!confirm('Delete this membership plan?')) return;
    try {
      await adminApi('membership-plans', 'DELETE', { id });
      await loadCafeMemberships(cafeId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete plan');
    }
  }

  async function loadCafeCoupons(cafeId: string) {
    setLoadingCoupons(true);
    try {
      const { data, error } = await supabase
        .from('coupons')
        .select('*')
        .eq('cafe_id', cafeId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCafeCoupons(data || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingCoupons(false);
    }
  }

  async function saveCoupon(cafeId: string) {
    setSavingCoupon(true);
    setCouponMsg(null);
    try {
      const payload = {
        cafe_id: cafeId,
        code: couponForm.code.trim().toUpperCase(),
        discount_type: couponForm.discount_type,
        discount_value: Number(couponForm.discount_value) || 0,
        bonus_minutes: Number(couponForm.bonus_minutes) || 0,
        max_uses: couponForm.max_uses ? Number(couponForm.max_uses) : null,
        valid_from: new Date().toISOString(),
        valid_until: couponForm.valid_until || null,
        is_active: true,
        uses_count: 0,
      };
      await adminApi('coupons', 'POST', { cafeId, coupon: payload });
      setCouponMsg({ type: 'success', text: 'Coupon created' });
      setCouponForm({ code: '', discount_type: 'percentage', discount_value: '', bonus_minutes: '0', max_uses: '', valid_until: '' });
      await loadCafeCoupons(cafeId);
    } catch (err: any) {
      setCouponMsg({ type: 'error', text: err.message || 'Failed to create coupon' });
    } finally {
      setSavingCoupon(false);
    }
  }

  async function deleteCoupon(id: string, cafeId: string) {
    if (!confirm('Delete this coupon?')) return;
    try {
      await adminApi('coupons', 'DELETE', { id });
      await loadCafeCoupons(cafeId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete coupon');
    }
  }

  async function toggleCouponActiveInManage(id: string, currentStatus: boolean, cafeId: string) {
    try {
      await adminApi('coupons', 'PUT', { id, updates: { is_active: !currentStatus } });
      setCafeCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    } catch (err: any) {
      alert(err.message || 'Failed to update coupon');
    }
  }

  function startEditCoupon(coupon: any) {
    setEditCouponId(coupon.id);
    setEditCouponForm({
      discount_value: coupon.discount_value?.toString() || '',
      max_uses: coupon.max_uses?.toString() || '',
      valid_until: coupon.valid_until ? coupon.valid_until.slice(0, 10) : '',
    });
  }

  async function saveEditCoupon(cafeId: string) {
    if (!editCouponId) return;
    setSavingEditCoupon(true);
    try {
      const updates: Record<string, string | number | null> = {
        discount_value: Number(editCouponForm.discount_value) || 0,
        max_uses: editCouponForm.max_uses ? Number(editCouponForm.max_uses) : null,
        valid_until: editCouponForm.valid_until || null,
      };
      await adminApi('coupons', 'PUT', { id: editCouponId, updates });
      setCafeCoupons(prev => prev.map(c => c.id === editCouponId ? { ...c, ...updates } : c));
      setEditCouponId(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save coupon');
    } finally {
      setSavingEditCoupon(false);
    }
  }

  async function toggleMembershipActive(id: string, currentStatus: boolean, cafeId: string) {
    try {
      await adminApi('membership-plans', 'PUT', { id, updates: { is_active: !currentStatus } });
      setCafeMembershipPlans(prev => prev.map(p => p.id === id ? { ...p, is_active: !currentStatus } : p));
    } catch (err: any) {
      alert(err.message || 'Failed to update plan');
    }
  }

  async function loadCafeBookings(cafeId: string) {
    setLoadingCafeBookings(true);
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, cafe_id, user_id, booking_date, start_time, duration, total_amount, status, source, customer_name, customer_phone, created_at')
        .eq('cafe_id', cafeId)
        .order('booking_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      setCafeBookings((data || []).map(b => ({ ...b, cafe_name: '', user_name: b.customer_name || 'Walk-in' })));
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingCafeBookings(false);
    }
  }

  function downloadCafesCSV() {
    const rows = [
      ['Name', 'Slug', 'City', 'Address', 'Phone', 'Email', 'Owner', 'Owner Email', 'Status', 'Featured', 'Bookings', 'Revenue (₹)', 'Created'],
      ...filteredCafes.map(c => [
        c.name, c.slug, c.city || '', c.address, c.phone || '', c.email || '',
        c.owner_name || '', c.owner_email || '',
        c.is_active ? 'Active' : 'Inactive',
        c.is_featured ? 'Yes' : 'No',
        c.total_bookings || 0, c.total_revenue || 0,
        formatDate(c.created_at),
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cafes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadBookingsCSV() {
    const rows = [
      ['Café', 'Customer', 'Phone', 'Date', 'Time', 'Duration (min)', 'Amount (₹)', 'Source', 'Status'],
      ...filteredBookings.map(b => [
        b.cafe_name || '', b.user_name || '', b.customer_phone || '',
        b.booking_date, b.start_time, b.duration, b.total_amount,
        b.source, b.status,
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookings-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAuditCSV() {
    const rows = [
      ['Timestamp', 'Action', 'Entity Type', 'Entity ID', 'Details'],
      ...filteredAuditLogs.map(l => [
        new Date(l.created_at).toLocaleString('en-IN'),
        l.action, l.entity_type,
        l.entity_id || '',
        l.details ? JSON.stringify(l.details) : '',
      ]),
    ];
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function bulkToggleCafeStatus(newStatus: boolean) {
    if (!selectedCafeIds.size) return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedCafeIds);
      // One request each rather than a single .in(): the route edits one café,
      // and a bulk endpoint is not worth adding for a button that acts on a
      // handful of hand-picked rows.
      await Promise.all(ids.map((id) => updateCafeViaApi(id, { is_active: newStatus })));
      setCafes(prev => prev.map(c => selectedCafeIds.has(c.id) ? { ...c, is_active: newStatus } : c));
      setSelectedCafeIds(new Set());
    } catch (err: any) {
      alert(err.message || 'Bulk action failed');
    } finally {
      setBulkActionLoading(false);
    }
  }

  // Global coupons tab handlers
  async function toggleCouponActive(id: string, currentStatus: boolean) {
    try {
      await adminApi('coupons', 'PUT', { id, updates: { is_active: !currentStatus } });
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    } catch (err: any) {
      alert(err.message || 'Failed to update coupon');
    }
  }

  async function deleteGlobalCoupon(id: string, code: string) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try {
      await adminApi('coupons', 'DELETE', { id });
      setCoupons(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete coupon');
    }
  }

  async function saveGlobalCoupon() {
    if (!globalCouponCafeId) { setGlobalCouponMsg({ type: 'error', text: 'Select a café' }); return; }
    setSavingGlobalCoupon(true);
    setGlobalCouponMsg(null);
    try {
      const payload = {
        cafe_id: globalCouponCafeId,
        code: globalCouponForm.code.trim().toUpperCase(),
        discount_type: globalCouponForm.discount_type,
        discount_value: Number(globalCouponForm.discount_value) || 0,
        bonus_minutes: Number(globalCouponForm.bonus_minutes) || 0,
        max_uses: globalCouponForm.max_uses ? Number(globalCouponForm.max_uses) : null,
        valid_from: new Date().toISOString(),
        valid_until: globalCouponForm.valid_until || null,
        is_active: true,
        uses_count: 0,
      };
      await adminApi('coupons', 'POST', { cafeId: globalCouponCafeId, coupon: payload });
      setGlobalCouponMsg({ type: 'success', text: 'Coupon created' });
      setGlobalCouponForm({ code: '', discount_type: 'percentage', discount_value: '', bonus_minutes: '0', max_uses: '', valid_until: '' });
      setGlobalCouponCafeId('');
      setShowGlobalCouponForm(false);
      // Reload coupons list
      const { data } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
      const enriched = await Promise.all((data || []).map(async (c) => {
        const { data: cafe } = await supabase.from('cafes').select('name').eq('id', c.cafe_id).maybeSingle();
        return { ...c, cafe_name: cafe?.name || 'Unknown Café' };
      }));
      setCoupons(enriched);
    } catch (err: any) {
      setGlobalCouponMsg({ type: 'error', text: err.message || 'Failed to create coupon' });
    } finally {
      setSavingGlobalCoupon(false);
    }
  }

  // Booking status change + delete (admin)
  async function updateBookingStatus(bookingId: string, newStatus: string) {
    try {
      await adminApi('bookings', 'PUT', { bookingId, status: newStatus });
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  }

  async function deleteBookingAdmin(bookingId: string, cafeName: string) {
    if (!confirm(`Delete booking from "${cafeName}"? This cannot be undone.`)) return;
    try {
      await adminApi('bookings', 'DELETE', { bookingId });
      setBookings(prev => prev.filter(b => b.id !== bookingId));
      await logAdminAction({ action: 'delete', entityType: 'booking', entityId: bookingId, details: { cafeName }, adminId });
    } catch (err: any) {
      alert(err.message || 'Failed to delete booking');
    }
  }

  // User management panel
  async function openUserManage(userId: string) {
    setManagedUserId(userId);
    setLoadingUserBookings(true);
    try {
      const { data } = await supabase
        .from('bookings')
        .select('id, cafe_id, booking_date, start_time, duration, total_amount, status, source, customer_name, customer_phone, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      const enriched = await Promise.all((data || []).map(async (b) => {
        const { data: cafe } = await supabase.from('cafes').select('name').eq('id', b.cafe_id).maybeSingle();
        return { ...b, cafe_name: cafe?.name || 'Unknown', user_name: '', user_id: userId };
      }));
      setUserBookings(enriched);
    } catch { setUserBookings([]); }
    finally { setLoadingUserBookings(false); }
  }

  const loadingOfflineCustomers = offlineCustomersLoading;

  return {
    activeCafeRate,
    activeSubscriptions,
    activeTab,
    activeTabMeta,
    addStationCount,
    addStationType,
    adminApi,
    adminId,
    adminUsername,
    announcementForm,
    announcements,
    auditActionFilter,
    auditEntityFilter,
    auditLogs,
    averageBookingsPerCafe,
    averageRevenuePerBooking,
    bookingDateFilter,
    bookingDateFrom,
    bookingDateTo,
    bookingPage,
    bookingSearch,
    bookingSort,
    bookingSourceFilter,
    bookingStatusFilter,
    bookings,
    bulkActionLoading,
    bulkToggleCafeStatus,
    cafeBookings,
    cafeCoupons,
    cafeFilter,
    cafeInfoMsg,
    cafeManageSubTab,
    cafeMembershipPlans,
    cafePage,
    cafeSearch,
    cafeSort,
    cafes,
    confirmPassword,
    couponForm,
    couponMsg,
    coupons,
    createAnnouncement,
    createCafeForm,
    createCafeLoading,
    createCafeMsg,
    currentPassword,
    deleteAnnouncement,
    deleteBookingAdmin,
    deleteCafe,
    deleteConfirm,
    deleteCoupon,
    deleteGlobalCoupon,
    deleteMembershipPlan,
    deleteUser,
    downloadAuditCSV,
    downloadBookingsCSV,
    downloadCafesCSV,
    downloadOfflineCustomersCSV,
    editCafeForm,
    editCouponForm,
    editCouponId,
    error,
    filteredAuditLogs,
    filteredBookings,
    filteredCafes,
    filteredOfflineCustomers,
    filteredSubscriptions,
    filteredUsers,
    formatCurrency,
    formatDate,
    formattedToday,
    globalCouponCafeId,
    globalCouponForm,
    globalCouponMsg,
    handleAddOwnerEmail,
    handleCreateCafe,
    handleDeleteOwnerEmail,
    handleSort,
    handleTabChange,
    isAdmin,
    isChecking,
    isMobile,
    itemsPerPage,
    loadCafeBookings,
    loadCafeCoupons,
    loadCafeMemberships,
    loadStationPricing,
    loadingCafeBookings,
    loadingCoupons,
    loadingData,
    loadingMemberships,
    loadingOfflineCustomers,
    loadingReport,
    loadingStationPricing,
    loadingSubscriptions,
    loadingUserBookings,
    managedCafeId,
    managedUserId,
    membershipForm,
    membershipMsg,
    mobileMenuOpen,
    newOwnerCafeId,
    newOwnerEmail,
    newPassword,
    newUsername,
    offlineCafeFilter,
    offlineCustomers,
    offlineCustomersLoading,
    offlineSearch,
    offlineSort,
    openCafeManage,
    openUserManage,
    ownerEmailMsg,
    ownerEmails,
    ownerEmailsLoading,
    paginatedBookings,
    paginatedCafes,
    paginatedUsers,
    platformSubscriptions,
    reportDailyData,
    reportDays,
    reportPeakHours,
    reportSourceSplit,
    revenueCafeFilter,
    revenueFilteredCafes,
    revenueFrom,
    revenueSourceBreakdown,
    revenueTo,
    router,
    saveAdminSettings,
    saveCafeInfoAdmin,
    saveCoupon,
    saveEditCoupon,
    saveGlobalCoupon,
    saveMembershipPlan,
    saveStationTypePricing,
    savingCafeInfo,
    savingCoupon,
    savingEditCoupon,
    savingGlobalCoupon,
    savingMembership,
    savingSettings,
    savingStation,
    savingStationPricing,
    selectedCafeIds,
    setAddStationCount,
    setAddStationType,
    setAnnouncementForm,
    setAnnouncements,
    setAuditActionFilter,
    setAuditEntityFilter,
    setAuditLogs,
    setBookingDateFilter,
    setBookingDateFrom,
    setBookingDateTo,
    setBookingPage,
    setBookingSearch,
    setBookingSort,
    setBookingSourceFilter,
    setBookingStatusFilter,
    setBookings,
    setBulkActionLoading,
    setCafeBookings,
    setCafeCoupons,
    setCafeFilter,
    setCafeInfoMsg,
    setCafeManageSubTab,
    setCafeMembershipPlans,
    setCafePage,
    setCafeSearch,
    setCafeSort,
    setCafes,
    setConfirmPassword,
    setCouponForm,
    setCouponMsg,
    setCoupons,
    setCreateCafeForm,
    setCreateCafeLoading,
    setCreateCafeMsg,
    setCurrentPassword,
    setDeleteConfirm,
    setEditCafeForm,
    setEditCouponForm,
    setEditCouponId,
    setError,
    setGlobalCouponCafeId,
    setGlobalCouponForm,
    setGlobalCouponMsg,
    setIsMobile,
    setLoadingCafeBookings,
    setLoadingCoupons,
    setLoadingData,
    setLoadingMemberships,
    setLoadingReport,
    setLoadingStationPricing,
    setLoadingSubscriptions,
    setLoadingUserBookings,
    setManagedCafeId,
    setManagedUserId,
    setMembershipForm,
    setMembershipMsg,
    setMobileMenuOpen,
    setNewOwnerCafeId,
    setNewOwnerEmail,
    setNewPassword,
    setNewUsername,
    setOfflineCafeFilter,
    setOfflineCustomers,
    setOfflineCustomersLoading,
    setOfflineSearch,
    setOfflineSort,
    setOwnerEmailMsg,
    setOwnerEmails,
    setOwnerEmailsLoading,
    setPlatformSubscriptions,
    setReportDailyData,
    setReportDays,
    setReportPeakHours,
    setReportSourceSplit,
    setRevenueCafeFilter,
    setRevenueFrom,
    setRevenueSourceBreakdown,
    setRevenueTo,
    setSavingCafeInfo,
    setSavingCoupon,
    setSavingEditCoupon,
    setSavingGlobalCoupon,
    setSavingMembership,
    setSavingSettings,
    setSavingStation,
    setSavingStationPricing,
    setSelectedCafeIds,
    setSettingsMessage,
    setShowAnnouncementForm,
    setShowCreateCafe,
    setShowGlobalCouponForm,
    setStationPriceForm,
    setStationPricing,
    setStationPricingMsg,
    setStats,
    setSubscriptionCafeFilter,
    setSubscriptionSearch,
    setUserBookings,
    setUserPage,
    setUserRoleFilter,
    setUserSearch,
    setUserSort,
    setUsers,
    settingsMessage,
    showAnnouncementForm,
    showCreateCafe,
    showGlobalCouponForm,
    startEditCoupon,
    stationPriceForm,
    stationPricing,
    stationPricingMsg,
    stats,
    subscriptionCafeFilter,
    subscriptionRevenue,
    subscriptionSearch,
    toggleAnnouncementStatus,
    toggleCafeStatus,
    toggleCouponActive,
    toggleCouponActiveInManage,
    toggleFeaturedCafe,
    toggleMembershipActive,
    totalBookingPages,
    totalCafePages,
    totalUserPages,
    updateBookingStatus,
    updateCafeViaApi,
    updateStationCount,
    updateUserRole,
    userBookings,
    userPage,
    userRoleFilter,
    userSearch,
    userSort,
    users,
    closeCafeManage: () => setManagedCafeId(null),
    saveCafeEdits: saveCafeInfoAdmin,
    toggleCafeFeatured: toggleFeaturedCafe,
    toggleCafeActive: toggleCafeStatus,
    deleteCafeAdmin: deleteCafe,
    exportAuditLogsCsv: downloadAuditCSV,
  };
}