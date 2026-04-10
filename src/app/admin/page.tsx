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
  phone: string | null;
  email: string | null;
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
  owner_name?: string;
  owner_email?: string;
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

type NavTab = 'overview' | 'cafes' | 'users' | 'offline-customers' | 'bookings' | 'revenue' | 'reports' | 'settings' | 'announcements' | 'audit-logs' | 'coupons' | 'owner-access';

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
  const [cafeManageSubTab, setCafeManageSubTab] = useState<'info' | 'stations' | 'memberships' | 'coupons'>('info');
  const [editCafeForm, setEditCafeForm] = useState<Record<string, string>>({});
  const [savingCafeInfo, setSavingCafeInfo] = useState(false);
  const [cafeInfoMsg, setCafeInfoMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [addStationType, setAddStationType] = useState('ps5');
  const [addStationCount, setAddStationCount] = useState(1);
  const [savingStation, setSavingStation] = useState(false);
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
            phone,
            email,
            owner_id,
            is_active,
            is_featured,
            created_at,
            price_starts_from,
            hourly_price,
            ps5_count,
            ps4_count,
            xbox_count,
            pc_count
          `)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const enrichedCafes = await Promise.all(
          (data || []).map(async (cafe) => {
            const { data: owner } = await supabase
              .from("profiles")
              .select("first_name, last_name")
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

            // Combine first_name and last_name for owner name
            const ownerName = owner
              ? [owner.first_name, owner.last_name].filter(Boolean).join(" ") || "Unknown Owner"
              : "Unknown Owner";

            return {
              ...cafe,
              owner_name: ownerName,
              owner_email: "N/A", // Email not in profiles table
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
        details: { cafeName, oldStatus: currentStatus, newStatus }
      });
    } catch (err) {
      console.error("Error toggling cafe status:", err);
      alert("Failed to update café status");
    }
  }

  // Delete cafe
  async function deleteCafe(cafeId: string, cafeName: string) {
    if (!confirm(`Are you sure you want to delete "${cafeName}"? This will delete all related bookings, pricing, and images. This action cannot be undone.`)) {
      return;
    }

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
        details: { cafeName }
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
        details: { userName, oldRole, newRole }
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
        details: { userName }
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
        details: { title: announcementForm.title, type: announcementForm.type }
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
        details: { title }
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
        }
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
        details: { cafeName }
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
      if (bookingSearch && !booking.user_name?.toLowerCase().includes(bookingSearch.toLowerCase()) &&
        !booking.cafe_name?.toLowerCase().includes(bookingSearch.toLowerCase())) return false;
      return true;
    }),
    bookingSort.field,
    bookingSort.order
  );

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
    setEditCafeForm({
      name: cafe.name || '',
      address: cafe.address || '',
      phone: cafe.phone || '',
      email: cafe.email || '',
      price_starts_from: cafe.price_starts_from?.toString() || '',
      hourly_price: cafe.hourly_price?.toString() || '',
      ps5_count: cafe.ps5_count?.toString() || '0',
      ps4_count: cafe.ps4_count?.toString() || '0',
      xbox_count: cafe.xbox_count?.toString() || '0',
      pc_count: cafe.pc_count?.toString() || '0',
    });
    setCafeMembershipPlans([]);
    setCafeCoupons([]);
  }

  async function saveCafeInfoAdmin() {
    if (!managedCafeId) return;
    setSavingCafeInfo(true);
    setCafeInfoMsg(null);
    try {
      const updates: Record<string, string | number | null> = {
        name: editCafeForm.name,
        address: editCafeForm.address,
        phone: editCafeForm.phone || null,
        email: editCafeForm.email || null,
        price_starts_from: editCafeForm.price_starts_from ? Number(editCafeForm.price_starts_from) : null,
        hourly_price: editCafeForm.hourly_price ? Number(editCafeForm.hourly_price) : null,
      };
      const { error } = await supabase.from('cafes').update(updates).eq('id', managedCafeId);
      if (error) throw error;
      setCafes(prev => prev.map(c => c.id === managedCafeId ? { ...c, ...updates } as CafeRow : c));
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
      await logAdminAction({ action: 'delete', entityType: 'booking', entityId: bookingId, details: { cafeName } });
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
              </div>

              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.04] border-b border-white/[0.08]">
                      <tr>
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
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <button onClick={() => openCafeManage(cafe)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-violet-500/15 text-violet-400 hover:bg-violet-500/25 transition-colors">⚙ Manage</button>
                              <button onClick={() => router.push(`/cafes/${cafe.slug}`)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">View</button>
                              <button onClick={() => toggleCafeStatus(cafe.id, cafe.is_active, cafe.name)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${cafe.is_active ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                                {cafe.is_active ? 'Deactivate' : 'Activate'}
                              </button>
                              <button onClick={() => toggleFeaturedCafe(cafe.id, cafe.is_featured || false, cafe.name)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${cafe.is_featured ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.08]'}`}>
                                {cafe.is_featured ? '⭐ Featured' : '☆ Feature'}
                              </button>
                              <button onClick={() => deleteCafe(cafe.id, cafe.name)} className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
                            </div>
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
                  {(['info', 'stations', 'memberships', 'coupons'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => {
                        setCafeManageSubTab(tab);
                        if (tab === 'memberships' && cafeMembershipPlans.length === 0) loadCafeMemberships(managedCafeId);
                        if (tab === 'coupons' && cafeCoupons.length === 0) loadCafeCoupons(managedCafeId);
                      }}
                      className={`px-4 py-2 rounded-xl text-xs font-semibold capitalize transition-colors ${cafeManageSubTab === tab ? 'bg-blue-500 text-white' : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'}`}
                    >
                      {tab === 'info' ? 'Info' : tab === 'stations' ? 'Stations' : tab === 'memberships' ? 'Memberships' : 'Coupons'}
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
                        { label: 'Address', key: 'address' },
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
                            className="w-full px-3 py-2 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                          />
                        </div>
                      ))}
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
                      ].map(r => (
                        <div key={r.label} className="flex justify-between items-center py-2.5 border-b border-white/[0.06]">
                          <span className="text-xs text-slate-500">{r.label}</span>
                          <span className="text-sm font-semibold text-white">{r.value}</span>
                        </div>
                      ))}
                      <div className="pt-2 space-y-2">
                        <button onClick={() => toggleCafeStatus(mc.id, mc.is_active, mc.name!)} className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${mc.is_active ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25' : 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25'}`}>
                          {mc.is_active ? 'Deactivate Café' : 'Activate Café'}
                        </button>
                        <button onClick={() => toggleFeaturedCafe(mc.id, mc.is_featured || false, mc.name!)} className={`w-full py-2 rounded-xl text-xs font-semibold transition-colors ${mc.is_featured ? 'bg-amber-500/15 text-amber-400 hover:bg-amber-500/25' : 'bg-white/[0.06] text-slate-400 hover:bg-white/[0.08]'}`}>
                          {mc.is_featured ? '⭐ Remove Featured' : '☆ Mark as Featured'}
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
                                  <button onClick={() => deleteMembershipPlan(plan.id, managedCafeId)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
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
                                    <button onClick={() => deleteCoupon(coupon.id, managedCafeId)} className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Delete</button>
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
              <div className="flex flex-wrap gap-3 p-4 rounded-2xl bg-[#0d0d14] border border-white/[0.08]">
                <input
                  type="text"
                  placeholder="Search by customer or café…"
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
                <input
                  type="date"
                  value={bookingDateFilter}
                  onChange={(e) => { setBookingDateFilter(e.target.value); setBookingPage(1); }}
                  className="px-4 py-2.5 rounded-xl bg-white/[0.06] border border-white/[0.09] text-sm text-white outline-none"
                />
                <div className="flex items-center px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-xs text-slate-500">
                  {filteredBookings.length} result{filteredBookings.length !== 1 ? 's' : ''}
                </div>
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
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Today', value: formatCurrency(stats?.todayRevenue||0), sub: `${stats?.todayBookings||0} bookings`, colorClass: 'text-emerald-400', borderClass: 'border-emerald-500/20', bgClass: 'bg-emerald-500/5' },
                  { label: 'This Week', value: formatCurrency(stats?.weekRevenue||0), sub: 'Last 7 days', colorClass: 'text-blue-400', borderClass: 'border-blue-500/20', bgClass: 'bg-blue-500/5' },
                  { label: 'This Month', value: formatCurrency(stats?.monthRevenue||0), sub: `${new Date().toLocaleString('en-IN', { month: 'long' })} 1 onwards`, colorClass: 'text-violet-400', borderClass: 'border-violet-500/20', bgClass: 'bg-violet-500/5' },
                  { label: 'All Time', value: formatCurrency(stats?.totalRevenue||0), sub: `${stats?.totalBookings||0} total bookings`, colorClass: 'text-amber-400', borderClass: 'border-amber-500/20', bgClass: 'bg-amber-500/5' },
                ].map(c => (
                  <div key={c.label} className={`rounded-2xl ${c.bgClass} border ${c.borderClass} p-5`}>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">{c.label}</p>
                    <p className={`text-2xl font-bold ${c.colorClass}`}>{loadingData ? '…' : c.value}</p>
                    <p className="text-xs text-slate-600 mt-1.5">{c.sub}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.08]">
                  <h3 className="text-sm font-semibold text-white">Revenue by Café</h3>
                </div>
                {cafes.length === 0 ? (
                  <p className="px-5 py-8 text-sm text-slate-500">Visit the Cafés tab first to load café data.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-white/[0.03] border-b border-white/[0.08]">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Café</th>
                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Owner</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Bookings</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Revenue</th>
                        <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-widest">Share</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {[...cafes].sort((a,b)=>(b.total_revenue||0)-(a.total_revenue||0)).map(cafe => {
                        const share = stats?.totalRevenue ? ((cafe.total_revenue||0)/stats.totalRevenue*100).toFixed(1) : '0';
                        return (
                          <tr key={cafe.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="text-sm font-semibold text-white">{cafe.name}</div>
                              <div className="text-xs text-slate-500 mt-0.5 truncate max-w-[200px]">{cafe.address}</div>
                            </td>
                            <td className="px-4 py-3.5 text-sm text-slate-400">{cafe.owner_name||'—'}</td>
                            <td className="px-4 py-3.5 text-sm text-slate-300 text-right">{cafe.total_bookings||0}</td>
                            <td className="px-4 py-3.5 text-sm font-semibold text-emerald-400 text-right">{formatCurrency(cafe.total_revenue||0)}</td>
                            <td className="px-4 py-3.5 text-right">
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/15 text-violet-400">{share}%</span>
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

          {/* ─── REPORTS TAB ─── */}
          {activeTab === 'reports' && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Revenue', value: formatCurrency(stats?.totalRevenue||0), colorClass: 'text-emerald-400' },
                  { label: 'Total Bookings', value: `${stats?.totalBookings||0}`, colorClass: 'text-blue-400' },
                  { label: 'Total Cafés', value: `${stats?.totalCafes||0}`, colorClass: 'text-violet-400' },
                  { label: 'Registered Users', value: `${stats?.totalUsers||0}`, colorClass: 'text-amber-400' },
                ].map(c => (
                  <div key={c.label} className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5 text-center">
                    <p className={`text-2xl font-bold ${c.colorClass}`}>{loadingData ? '…' : c.value}</p>
                    <p className="text-xs text-slate-500 mt-1">{c.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Top Cafés by Revenue</h3>
                  {cafes.length === 0 ? (
                    <p className="text-sm text-slate-500">Visit the Cafés tab first.</p>
                  ) : (
                    <div className="space-y-3">
                      {[...cafes].sort((a,b)=>(b.total_revenue||0)-(a.total_revenue||0)).slice(0,5).map((cafe,i) => {
                        const max = Math.max(...cafes.map(c=>c.total_revenue||0), 1);
                        const w = ((cafe.total_revenue||0)/max*100).toFixed(0);
                        return (
                          <div key={cafe.id} className="flex items-center gap-3">
                            <span className={`w-5 text-xs font-bold shrink-0 ${i===0?'text-amber-400':'text-slate-500'}`}>#{i+1}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between mb-1">
                                <span className="text-sm text-slate-300 truncate">{cafe.name}</span>
                                <span className="text-sm font-semibold text-emerald-400 ml-2 shrink-0">{formatCurrency(cafe.total_revenue||0)}</span>
                              </div>
                              <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full" style={{width:`${w}%`}} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl bg-[#0d0d14] border border-white/[0.08] p-5">
                  <h3 className="text-sm font-semibold text-white mb-4">Revenue Breakdown</h3>
                  <div className="divide-y divide-white/[0.06]">
                    {[
                      { label: 'Today', value: formatCurrency(stats?.todayRevenue||0), colorClass: 'text-emerald-400' },
                      { label: 'This Week', value: formatCurrency(stats?.weekRevenue||0), colorClass: 'text-blue-400' },
                      { label: 'This Month', value: formatCurrency(stats?.monthRevenue||0), colorClass: 'text-violet-400' },
                      { label: 'All Time', value: formatCurrency(stats?.totalRevenue||0), colorClass: 'text-amber-400' },
                      { label: 'Active Cafés', value: `${stats?.activeCafes||0} / ${stats?.totalCafes||0}`, colorClass: 'text-slate-200' },
                      { label: 'Avg Revenue / Booking', value: formatCurrency(averageRevenuePerBooking), colorClass: 'text-slate-200' },
                      { label: 'Avg Bookings / Café', value: `${averageBookingsPerCafe}`, colorClass: 'text-slate-200' },
                    ].map(r => (
                      <div key={r.label} className="flex justify-between items-center py-3">
                        <span className="text-sm text-slate-400">{r.label}</span>
                        <span className={`text-sm font-semibold ${r.colorClass}`}>{loadingData ? '…' : r.value}</span>
                      </div>
                    ))}
                  </div>
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
                    ) : auditLogs.length === 0 ? (
                      <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">No audit logs found</td></tr>
                    ) : auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-3.5 text-sm text-slate-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString('en-IN')}</td>
                        <td className="px-4 py-3.5 text-sm">
                          {log.action === 'delete'
                            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Delete</span>
                            : log.action === 'create'
                            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Create</span>
                            : log.action === 'activate'
                            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400">Activate</span>
                            : log.action === 'deactivate'
                            ? <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/15 text-red-400">Deactivate</span>
                            : <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-400">{log.action}</span>}
                        </td>
                        <td className="px-4 py-3.5 text-sm font-medium text-slate-200">{log.entity_type}</td>
                        <td className="px-4 py-3.5 text-xs font-mono text-slate-500">{log.entity_id ? log.entity_id.substring(0,8)+'…' : '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-slate-400 max-w-[300px] truncate">{log.details ? JSON.stringify(log.details).substring(0,80)+'…' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
      </main>
    </div>
  );
}
