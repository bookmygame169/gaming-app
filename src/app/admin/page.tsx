// src/app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { logAdminAction } from "@/lib/auditLog";
import { useAdminAuth } from "@/app/admin/hooks/useAdminAuth";
import { AdminSidebar, AdminMobileMenuButton } from "@/app/admin/components/AdminSidebar";
import {
  Store, Users, CalendarCheck, BarChart3, IndianRupee, KeyRound, Shield, Megaphone,
  Gamepad2, TrendingUp, Settings, ExternalLink, RefreshCw, AlertTriangle,
  ChevronRight,
} from "lucide-react";

type AdminStats = {
  totalCafes: number;
  activeCafes: number;
  pendingCafes: number;
  totalBookings: number;
  todayBookings: number;
  totalUsers: number;
  totalOwners: number;
  totalRevenue: number;
  todayRevenue: number;
  weekRevenue: number;
  monthRevenue: number;
};

type CafeRow = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
  opening_hours: string | null;
  owner_id: string;
  is_active: boolean;
  is_featured?: boolean;
  created_at: string;
  price_starts_from: number | null;
  hourly_price: number | null;
  ps5_count: number;
  ps4_count: number;
  xbox_count: number;
  pc_count: number;
  vr_count: number;
  pool_count: number;
  snooker_count: number;
  arcade_count: number;
  steering_wheel_count: number;
  racing_sim_count: number;
  owner_name?: string;
  owner_email?: string;
  owner_phone?: string;
  total_bookings?: number;
  total_revenue?: number;
};

type UserRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
  total_bookings?: number;
  total_spent?: number;
  last_booking?: string;
};

type BookingRow = {
  id: string;
  cafe_id: string;
  user_id: string | null;
  booking_date: string;
  start_time: string;
  duration: number;
  total_amount: number;
  status: string;
  source: string;
  customer_name: string | null;
  customer_phone: string | null;
  created_at: string;
  cafe_name?: string;
  user_name?: string;
};

type OfflineCustomer = {
  phone: string;
  name: string;
  cafe_name: string;
  cafe_id: string;
  total_bookings: number;
  total_spent: number;
  last_visit: string;
};

type NavTab = 'overview' | 'cafes' | 'users' | 'offline-customers' | 'bookings' | 'revenue' | 'reports' | 'settings' | 'announcements' | 'audit-logs' | 'coupons' | 'owner-access' | 'subscriptions';

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  target_audience: 'all' | 'users' | 'owners';
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
};

type AuditLogRow = {
  id: string;
  admin_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type CouponRow = {
  id: string;
  cafe_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  bonus_minutes: number;
  max_uses: number | null;
  uses_count: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  created_at: string;
  cafe_name?: string;
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const { adminId, adminUsername, allowed: isAdmin, checkingRole: isChecking } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('overview');
  const [isMobile, setIsMobile] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);

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
      const { error } = await supabase
        .from("cafes")
        .update({ is_active: newStatus })
        .eq("id", cafeId);

      if (error) throw error;

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

      console.log("Starting deletion process for cafe:", cafeId);

      // Delete related records first (cascading delete)
      // 1. Delete booking items
      const { data: bookings, error: bookingsError } = await supabase
        .from("bookings")
        .select("id")
        .eq("cafe_id", cafeId);

      if (bookingsError) {
        console.error("Error fetching bookings:", bookingsError);
      }

      if (bookings && bookings.length > 0) {
        console.log(`Deleting booking items for ${bookings.length} bookings`);
        const bookingIds = bookings.map(b => b.id);
        const { error: bookingItemsError } = await supabase
          .from("booking_items")
          .delete()
          .in("booking_id", bookingIds);

        if (bookingItemsError) {
          console.error("Error deleting booking items:", bookingItemsError);
        }
      }

      // 2. Delete bookings
      console.log("Deleting bookings...");
      const { error: deleteBookingsError } = await supabase
        .from("bookings")
        .delete()
        .eq("cafe_id", cafeId);

      if (deleteBookingsError) {
        console.error("Error deleting bookings:", deleteBookingsError);
      }

      // 3. Delete console pricing
      console.log("Deleting console pricing...");
      const { error: pricingError } = await supabase
        .from("console_pricing")
        .delete()
        .eq("cafe_id", cafeId);

      if (pricingError) {
        console.error("Error deleting console pricing:", pricingError);
      }

      // 4. Delete cafe images
      console.log("Deleting cafe images...");
      const { error: galleryError } = await supabase
        .from("cafe_images")
        .delete()
        .eq("cafe_id", cafeId);

      if (galleryError) {
        console.error("Error deleting cafe images:", galleryError);
      }

      // 5. Finally, delete the café
      console.log("Deleting café...");
      const { error } = await supabase
        .from("cafes")
        .delete()
        .eq("id", cafeId);

      if (error) {
        console.error("Error deleting cafe:", error);
        throw error;
      }

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

      const { error } = await supabase
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);

      if (error) throw error;

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
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (error) throw error;

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

      const { error } = await supabase
        .from("platform_announcements")
        .insert({
          title: announcementForm.title,
          message: announcementForm.message,
          type: announcementForm.type,
          target_audience: announcementForm.target_audience,
          expires_at: announcementForm.expires_at || null,
        });

      if (error) throw error;

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
      const { error } = await supabase
        .from("platform_announcements")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

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
      const { error } = await supabase
        .from("platform_announcements")
        .delete()
        .eq("id", id);

      if (error) throw error;

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
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("admin_username, admin_password")
        .eq("id", adminId)
        .single();

      if (profileError || !profile) {
        setSettingsMessage({ type: 'error', text: 'Unable to load admin credentials' });
        setSavingSettings(false);
        return;
      }

      // Verify current password
      const currentAdminPassword = profile.admin_password || 'admin123';
      if (currentPassword !== currentAdminPassword) {
        setSettingsMessage({ type: 'error', text: 'Current password is incorrect' });
        setSavingSettings(false);
        return;
      }

      // Validate new credentials
      if (!newUsername && !newPassword) {
        setSettingsMessage({ type: 'error', text: 'Please enter a new username or password' });
        setSavingSettings(false);
        return;
      }

      if (newPassword && newPassword !== confirmPassword) {
        setSettingsMessage({ type: 'error', text: 'New passwords do not match' });
        setSavingSettings(false);
        return;
      }

      if (newPassword && newPassword.length < 6) {
        setSettingsMessage({ type: 'error', text: 'Password must be at least 6 characters' });
        setSavingSettings(false);
        return;
      }

      // Update credentials
      const updates: { admin_username?: string; admin_password?: string } = {};
      if (newUsername) updates.admin_username = newUsername;
      if (newPassword) updates.admin_password = newPassword;

      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", adminId);

      if (updateError) throw updateError;

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
      const { error } = await supabase
        .from("cafes")
        .update({
          is_featured: newStatus,
          featured_at: newStatus ? new Date().toISOString() : null
        })
        .eq("id", cafeId);

      if (error) throw error;

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
      if (bookingStatusFilter !== "all" && booking.status !== bookingStatusFilter) return false;
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
      const { error } = await supabase.from('cafes').update(updates).eq('id', managedCafeId);
      if (error) throw error;
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
      const { error } = await supabase.from('cafes').update({ [key]: newCount }).eq('id', managedCafeId);
      if (error) throw error;
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
      const { error } = await supabase.from('membership_plans').insert([payload]);
      if (error) throw error;
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
      const { error } = await supabase.from('membership_plans').delete().eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('coupons').insert([payload]);
      if (error) throw error;
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
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
      await loadCafeCoupons(cafeId);
    } catch (err: any) {
      alert(err.message || 'Failed to delete coupon');
    }
  }

  async function toggleCouponActiveInManage(id: string, currentStatus: boolean, cafeId: string) {
    try {
      const { error } = await supabase.from('coupons').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('coupons').update(updates).eq('id', editCouponId);
      if (error) throw error;
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
      const { error } = await supabase.from('membership_plans').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
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

  async function toggleMaintenanceMode() {
    setSavingMaintenance(true);
    try {
      const newVal = !maintenanceMode;
      const { error } = await supabase
        .from('platform_settings')
        .upsert({ key: 'maintenance_mode', value: newVal ? 'true' : 'false' }, { onConflict: 'key' });
      if (error) throw error;
      setMaintenanceMode(newVal);
      await logAdminAction({ action: newVal ? 'enable_maintenance' : 'disable_maintenance', entityType: 'settings', details: { maintenance_mode: newVal }, adminId });
    } catch (err: any) {
      alert(err.message || 'Failed to toggle maintenance mode');
    } finally {
      setSavingMaintenance(false);
    }
  }

  async function bulkToggleCafeStatus(newStatus: boolean) {
    if (!selectedCafeIds.size) return;
    setBulkActionLoading(true);
    try {
      const ids = Array.from(selectedCafeIds);
      const { error } = await supabase.from('cafes').update({ is_active: newStatus }).in('id', ids);
      if (error) throw error;
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
      const { error } = await supabase.from('coupons').update({ is_active: !currentStatus }).eq('id', id);
      if (error) throw error;
      setCoupons(prev => prev.map(c => c.id === id ? { ...c, is_active: !currentStatus } : c));
    } catch (err: any) {
      alert(err.message || 'Failed to update coupon');
    }
  }

  async function deleteGlobalCoupon(id: string, code: string) {
    if (!confirm(`Delete coupon "${code}"?`)) return;
    try {
      const { error } = await supabase.from('coupons').delete().eq('id', id);
      if (error) throw error;
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
      const { error } = await supabase.from('coupons').insert([payload]);
      if (error) throw error;
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
      const { error } = await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
      if (error) throw error;
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    } catch (err: any) {
      alert(err.message || 'Failed to update status');
    }
  }

  async function deleteBookingAdmin(bookingId: string, cafeName: string) {
    if (!confirm(`Delete booking from "${cafeName}"? This cannot be undone.`)) return;
    try {
      await supabase.from('booking_items').delete().eq('booking_id', bookingId);
      const { error } = await supabase.from('bookings').delete().eq('id', bookingId);
      if (error) throw error;
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

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#09090e] flex items-center justify-center">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm">Verifying admin access...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  // ─── Shared table helpers ───────────────────────────────────────────────────
  const thCls = "px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest";
  const tdCls = "px-4 py-3.5 text-sm text-slate-300";
  const badge = (label: string, color: "green"|"red"|"blue"|"yellow"|"purple"|"slate") => {
    const map: Record<string, string> = {
      green: "bg-emerald-500/15 text-emerald-400",
      red: "bg-red-500/15 text-red-400",
      blue: "bg-blue-500/15 text-blue-400",
      yellow: "bg-amber-500/15 text-amber-400",
      purple: "bg-violet-500/15 text-violet-400",
      slate: "bg-white/[0.06] text-slate-400",
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${map[color]}`}>{label}</span>;
  };

  const Pagination = ({ page, total, setPage }: { page: number; total: number; setPage: (p: number) => void }) => {
    if (total <= 1) return null;
    return (
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.06]">
        <span className="text-xs text-slate-500">{((page-1)*itemsPerPage)+1}–{Math.min(page*itemsPerPage, total*itemsPerPage)} of page {page}/{total}</span>
        <div className="flex gap-1">
          <button onClick={() => setPage(Math.max(1,page-1))} disabled={page===1} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Prev</button>
          {Array.from({length: Math.min(5,total)}, (_,i) => {
            const n = total<=5?i+1:page<=3?i+1:page>=total-2?total-4+i:page-2+i;
            return <button key={n} onClick={()=>setPage(n)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${page===n?"bg-blue-500 text-white":"bg-white/[0.06] text-slate-300 hover:bg-white/[0.08]"}`}>{n}</button>;
          })}
          <button onClick={() => setPage(Math.min(total,page+1))} disabled={page===total} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] text-slate-300 hover:bg-white/[0.08] disabled:opacity-30 disabled:cursor-not-allowed transition-colors">Next</button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#09090e] text-slate-100">
      <AdminSidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as NavTab)}
        isMobile={isMobile}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        onLogout={async () => {
          await fetch("/api/admin/login", { method: "DELETE", credentials: "include" });
          router.push("/admin/login");
        }}
      />

      {/* Main Content */}
      <main className={`flex-1 overflow-auto ${isMobile ? '' : 'ml-72'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-[#09090e]/90 backdrop-blur-md border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-5 py-3.5 md:px-8">
            <div className="flex items-center gap-3">
              {isMobile && <AdminMobileMenuButton onClick={() => setMobileMenuOpen(true)} />}
              <div>
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">{activeTabMeta.eyebrow}</p>
                <h1 className="text-lg font-bold text-white leading-tight">
                  {activeTabMeta.title}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isMobile && (
                <div className="flex items-center gap-2 mr-2">
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Active Cafés</div>
                    <div className="text-base font-bold text-white">{loadingData ? "…" : stats?.activeCafes || 0}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Today</div>
                    <div className="text-base font-bold text-emerald-400">{loadingData ? "…" : formatCurrency(stats?.todayRevenue || 0)}</div>
                  </div>
                  <div className="px-3 py-1.5 rounded-xl bg-[#0d0d14] border border-white/[0.08] text-center min-w-[80px]">
                    <div className="text-[9px] text-slate-500 uppercase tracking-widest">Bookings</div>
                    <div className="text-base font-bold text-blue-400">{loadingData ? "…" : stats?.totalBookings || 0}</div>
                  </div>
                </div>
              )}
              <span className="hidden md:block text-xs text-slate-600 mr-1">{formattedToday}</span>
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                <RefreshCw size={14} />Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="p-5 md:p-8 pb-16 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <AlertTriangle size={16} className="shrink-0" />{error}
            </div>
          )}

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
                  <button key={c.label} onClick={() => setActiveTab(c.tab)} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 text-left hover:border-white/[0.09] hover:bg-white/[0.04] transition-all group">
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
                      <button key={a.tab} onClick={() => setActiveTab(a.tab)} className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-white/[0.03] hover:bg-white/[0.06] hover:text-white transition-all">
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

              {/* Maintenance Mode */}
              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-white">Maintenance Mode</h3>
                  <p className="text-xs text-slate-500 mt-1">When enabled, users see a maintenance banner. Owners and admin can still access their dashboards.</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${maintenanceMode ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.04] border-white/[0.08]'}`}>
                    <div className={`w-2.5 h-2.5 rounded-full ${maintenanceMode ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                    <span className={`text-sm font-semibold ${maintenanceMode ? 'text-amber-400' : 'text-slate-400'}`}>
                      {maintenanceMode ? 'Maintenance ON' : 'Platform Normal'}
                    </span>
                  </div>
                  <button
                    onClick={toggleMaintenanceMode}
                    disabled={savingMaintenance}
                    className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${maintenanceMode ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25'}`}
                  >
                    {savingMaintenance ? 'Saving…' : maintenanceMode ? 'Disable Maintenance' : 'Enable Maintenance'}
                  </button>
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
      </main>
    </div>
  );
}
