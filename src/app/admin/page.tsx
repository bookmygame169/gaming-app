// src/app/admin/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fonts } from "@/lib/constants";
import { logAdminAction } from "@/lib/auditLog";
import { useAdminAuth } from "@/app/admin/hooks/useAdminAuth";
import { AdminSidebar, AdminMobileMenuButton } from "@/app/admin/components/AdminSidebar";

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

type NavTab = 'overview' | 'cafes' | 'users' | 'bookings' | 'revenue' | 'reports' | 'settings' | 'announcements' | 'audit-logs' | 'coupons' | 'owner-access';

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

  // Theme (matching owner dashboard)
  const theme = {
    background:
      "radial-gradient(circle at top left, rgba(34,197,94,0.12), transparent 30%), radial-gradient(circle at top right, rgba(56,189,248,0.16), transparent 28%), linear-gradient(180deg, #09111f 0%, #050915 100%)",
    cardBackground:
      "linear-gradient(145deg, rgba(12, 22, 38, 0.92), rgba(8, 15, 28, 0.96))",
    sidebarBackground:
      "linear-gradient(180deg, rgba(7, 13, 25, 0.98) 0%, rgba(4, 9, 20, 0.98) 100%)",
    border: "rgba(148, 163, 184, 0.16)",
    textPrimary: "#f8fafc",
    textSecondary: "#c7d2fe",
    textMuted: "#7c8aa5",
    headerBackground: "rgba(5, 10, 22, 0.72)",
    statCardBackground: "#ffffff",
    statCardText: "#111827",
    hoverBackground: "rgba(56, 189, 248, 0.08)",
    activeNavBackground:
      "linear-gradient(135deg, rgba(56, 189, 248, 0.22), rgba(34, 197, 94, 0.16))",
    activeNavText: "#f8fafc",
    accent: "#38bdf8",
    accentStrong: "#22c55e",
    warning: "#f59e0b",
    danger: "#fb7185",
  };

  const navItems: { id: NavTab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'cafes', label: 'Cafés', icon: '🏪' },
    { id: 'users', label: 'Users', icon: '👥' },
    { id: 'bookings', label: 'Bookings', icon: '📅' },
    { id: 'coupons', label: 'Coupons', icon: '🎟️' },
    { id: 'revenue', label: 'Revenue', icon: '💰' },
    { id: 'announcements', label: 'Announcements', icon: '📢' },
    { id: 'audit-logs', label: 'Audit Logs', icon: '📋' },
    { id: 'reports', label: 'Reports', icon: '📈' },
    { id: 'owner-access', label: 'Owner Access', icon: '🔑' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

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
        const monthStr = new Date(istNow.getTime() - 30 * 86400_000).toISOString().slice(0, 10);

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

  // Format currency
  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (isChecking) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
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

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        display: "flex",
        fontFamily: fonts.body,
        color: theme.textPrimary,
      }}
    >
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
      {/* REMOVE OLD SIDEBAR START */}
      <aside style={{ display: "none" }}>
        {/* Logo */}
        <div
          style={{
            padding: "28px 24px 24px",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <div
            style={{
              padding: 18,
              borderRadius: 24,
              border: `1px solid ${theme.border}`,
              background:
                "linear-gradient(135deg, rgba(56, 189, 248, 0.18), rgba(34, 197, 94, 0.08) 55%, rgba(8, 15, 28, 0.92) 100%)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    display: "grid",
                    placeItems: "center",
                    background: "linear-gradient(135deg, #38bdf8, #22c55e)",
                    color: "#04101d",
                    fontSize: 22,
                    fontWeight: 800,
                    boxShadow: "0 14px 28px rgba(34,197,94,0.18)",
                  }}
                >
                  A
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#8fe7ff",
                      fontWeight: 700,
                      letterSpacing: "0.24em",
                      textTransform: "uppercase",
                    }}
                  >
                    BookMyGame
                  </div>
                  <div
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 28,
                      fontWeight: 800,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                    }}
                  >
                    Admin Deck
                  </div>
                </div>
              </div>
              <div
                style={{
                  fontSize: 13,
                  lineHeight: 1.6,
                  color: theme.textSecondary,
                }}
              >
                Operating surface for network health, bookings, revenue, compliance, and café quality.
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: "20px 16px 12px" }}>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              style={{
                width: "100%",
                padding: "14px 16px",
                marginBottom: 8,
                borderRadius: 18,
                border: `1px solid ${activeTab === item.id ? "rgba(56, 189, 248, 0.24)" : "transparent"}`,
                background: activeTab === item.id
                  ? theme.activeNavBackground
                  : "transparent",
                color: activeTab === item.id ? theme.activeNavText : theme.textSecondary,
                fontSize: 15,
                fontWeight: activeTab === item.id ? 600 : 500,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 16,
                transition: "all 0.24s ease",
                textAlign: "left",
                boxShadow: activeTab === item.id ? "0 16px 30px rgba(2, 132, 199, 0.12)" : "none",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.background = theme.hoverBackground;
                  e.currentTarget.style.borderColor = "rgba(56, 189, 248, 0.12)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== item.id) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.borderColor = "transparent";
                }
              }}
            >
              <span
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 14,
                  display: "grid",
                  placeItems: "center",
                  background: activeTab === item.id ? "rgba(255,255,255,0.12)" : "rgba(148, 163, 184, 0.08)",
                  fontSize: 20,
                }}
              >
                {item.icon}
              </span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span>{item.label}</span>
                <span style={{ fontSize: 11, color: activeTab === item.id ? "rgba(255,255,255,0.72)" : theme.textMuted, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {tabMeta[item.id].eyebrow}
                </span>
              </div>
            </button>
          ))}
        </nav>

        <div
          style={{
            margin: "0 16px 16px",
            padding: 18,
            borderRadius: 20,
            border: `1px solid ${theme.border}`,
            background:
              "linear-gradient(180deg, rgba(12, 22, 38, 0.94), rgba(7, 13, 25, 0.96))",
          }}
        >
          <div style={{ fontSize: 11, color: "#8fe7ff", letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 12 }}>
            Platform Pulse
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: theme.textMuted, fontSize: 13 }}>Today revenue</span>
              <strong style={{ fontSize: 20, color: theme.textPrimary }}>{formatCurrency(stats?.todayRevenue || 0)}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: theme.textMuted, fontSize: 13 }}>Today bookings</span>
              <strong style={{ fontSize: 20, color: "#8fe7ff" }}>{stats?.todayBookings || 0}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span style={{ color: theme.textMuted, fontSize: 13 }}>Active cafés</span>
              <strong style={{ fontSize: 20, color: "#86efac" }}>{activeCafeRate}%</strong>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "18px 16px 20px",
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <button
            onClick={() => router.push("/dashboard")}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 16,
              border: `1px solid ${theme.border}`,
              background: "rgba(148, 163, 184, 0.04)",
              color: theme.textSecondary,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = theme.hoverBackground;
              e.currentTarget.style.borderColor = theme.activeNavText;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = theme.border;
            }}
          >
            👤 User Dashboard
          </button>
          <button
            onClick={async () => {
              await fetch("/api/admin/login", { method: "DELETE", credentials: "include" });
              router.push("/admin/login");
            }}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 16,
              border: `1px solid rgba(251, 113, 133, 0.28)`,
              background: "rgba(251, 113, 133, 0.06)",
              color: "#fda4af",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(248, 113, 113, 0.1)";
              e.currentTarget.style.borderColor = "#f87171";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(248, 113, 113, 0.3)";
            }}
          >
            🚪 Logout Admin
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, overflow: "auto", position: "relative", marginLeft: isMobile ? 0 : 288 }}>
        {/* Header — matches owner portal style */}
        <header className="sticky top-0 z-30 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/50">
          <div className="flex items-center justify-between px-4 py-4 md:px-8">
            <div className="flex items-center gap-4">
              {isMobile && (
                <AdminMobileMenuButton onClick={() => setMobileMenuOpen(true)} />
              )}
              <div>
                <h1 className="text-xl font-bold text-white md:text-2xl" style={{ fontFamily: fonts.heading }}>
                  {activeTabMeta.title}
                </h1>
                {!isMobile && (
                  <p className="text-sm text-slate-400 mt-0.5">{activeTabMeta.subtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {!isMobile && (
                <>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "rgba(56, 189, 248, 0.08)",
                      border: "1px solid rgba(56, 189, 248, 0.12)",
                    }}
                  >
                    <div style={{ color: theme.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em" }}>Active cafés</div>
                    <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: theme.textPrimary }}>{stats?.activeCafes || 0}</div>
                  </div>
                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      background: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.12)",
                    }}
                  >
                    <div style={{ color: theme.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em" }}>Today revenue</div>
                    <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700, color: theme.textPrimary }}>{formatCurrency(stats?.todayRevenue || 0)}</div>
                  </div>
                </>
              )}
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-500 to-cyan-500 text-slate-900 hover:opacity-90 transition-opacity"
              >
                Refresh
              </button>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div style={{ padding: "34px 36px 48px" }}>
          {/* Error Message */}
          {error && (
            <div
              style={{
                marginBottom: 24,
                padding: "16px 20px",
                borderRadius: 12,
                border: "1px solid rgba(248, 113, 113, 0.5)",
                background: "rgba(248, 113, 113, 0.1)",
                color: "#fca5a5",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 20 }}>⚠️</span>
              {error}
            </div>
          )}

          {/* OVERVIEW TAB */}
          {activeTab === 'overview' && (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.45fr) minmax(320px, 0.95fr)",
                  gap: 24,
                  marginBottom: 28,
                }}
              >
                <div
                  style={{
                    padding: "28px",
                    borderRadius: 28,
                    background:
                      "radial-gradient(circle at top right, rgba(56,189,248,0.18), transparent 35%), linear-gradient(145deg, rgba(11, 27, 46, 0.98), rgba(6, 14, 27, 0.98))",
                    border: `1px solid ${theme.border}`,
                    boxShadow: "0 30px 80px rgba(2, 6, 23, 0.28)",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
                    <div>
                      <div style={{ color: "#8fe7ff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 12 }}>
                        Performance Snapshot
                      </div>
                      <h2
                        style={{
                          fontFamily: fonts.heading,
                          fontSize: 42,
                          lineHeight: 1,
                          letterSpacing: "-0.05em",
                          margin: 0,
                          maxWidth: 560,
                        }}
                      >
                        {loadingData ? "Loading live platform pulse..." : `₹${(stats?.todayRevenue || 0).toLocaleString()} collected today.`}
                      </h2>
                    </div>
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: 999,
                        background: "rgba(34, 197, 94, 0.12)",
                        color: "#86efac",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {stats?.todayBookings || 0} live bookings today
                    </div>
                  </div>

                  <p style={{ margin: 0, color: theme.textSecondary, fontSize: 15, lineHeight: 1.7, maxWidth: 620 }}>
                    Keep operators pointed at the right problems: today&apos;s volume, month-scale revenue, and location activation all in one glance.
                  </p>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                      gap: 14,
                      marginTop: 24,
                    }}
                  >
                    {[
                      { label: "Today Revenue", value: formatCurrency(stats?.todayRevenue || 0), tone: "rgba(34, 197, 94, 0.12)" },
                      { label: "Week Revenue", value: formatCurrency(stats?.weekRevenue || 0), tone: "rgba(56, 189, 248, 0.12)" },
                      { label: "Month Revenue", value: formatCurrency(stats?.monthRevenue || 0), tone: "rgba(245, 158, 11, 0.12)" },
                    ].map((metric) => (
                      <div
                        key={metric.label}
                        style={{
                          padding: "18px 18px 16px",
                          borderRadius: 20,
                          border: `1px solid ${theme.border}`,
                          background: metric.tone,
                        }}
                      >
                        <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 10 }}>
                          {metric.label}
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.03em" }}>
                          {loadingData ? "..." : metric.value}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: 24,
                    borderRadius: 28,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                    boxShadow: "0 24px 64px rgba(2, 6, 23, 0.24)",
                  }}
                >
                  <div style={{ color: "#8fe7ff", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.2em", marginBottom: 16 }}>
                    Signal Board
                  </div>
                  <div style={{ display: "grid", gap: 14 }}>
                    {[
                      { label: "Active cafés", value: `${stats?.activeCafes || 0}/${stats?.totalCafes || 0}`, note: `${activeCafeRate}% network activated`, color: "#86efac" },
                      { label: "Average booking value", value: formatCurrency(averageRevenuePerBooking), note: "Gross earnings / total bookings", color: "#8fe7ff" },
                      { label: "Average bookings per café", value: `${averageBookingsPerCafe}`, note: "Platform activity density", color: "#fde68a" },
                    ].map((signal) => (
                      <div
                        key={signal.label}
                        style={{
                          padding: 16,
                          borderRadius: 20,
                          border: `1px solid ${theme.border}`,
                          background: "rgba(148, 163, 184, 0.05)",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                          <div>
                            <div style={{ color: theme.textMuted, fontSize: 12, marginBottom: 8 }}>{signal.label}</div>
                            <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.1, color: signal.color }}>
                              {loadingData ? "..." : signal.value}
                            </div>
                          </div>
                          <div
                            style={{
                              width: 14,
                              height: 14,
                              borderRadius: 999,
                              background: signal.color,
                              boxShadow: `0 0 24px ${signal.color}`,
                              marginTop: 6,
                            }}
                          />
                        </div>
                        <div style={{ marginTop: 10, color: theme.textSecondary, fontSize: 13, lineHeight: 1.6 }}>
                          {signal.note}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: 18,
                  marginBottom: 28,
                }}
              >
                {[
                  {
                    label: "Total Cafés",
                    value: stats?.totalCafes || 0,
                    subtext: `${stats?.activeCafes || 0} active • ${stats?.pendingCafes || 0} pending`,
                    icon: "🏪",
                    color: "#38bdf8",
                  },
                  {
                    label: "Total Users",
                    value: stats?.totalUsers || 0,
                    subtext: `${stats?.totalOwners || 0} café owners`,
                    icon: "👥",
                    color: "#a3e635",
                  },
                  {
                    label: "Total Bookings",
                    value: stats?.totalBookings || 0,
                    subtext: `${stats?.todayBookings || 0} today`,
                    icon: "📅",
                    color: "#f59e0b",
                  },
                  {
                    label: "Total Revenue",
                    value: formatCurrency(stats?.totalRevenue || 0),
                    subtext: `Platform gross since launch`,
                    icon: "💰",
                    color: "#22c55e",
                  },
                ].map((card) => (
                  <div
                    key={card.label}
                    style={{
                      padding: "22px",
                      borderRadius: 24,
                      background: theme.cardBackground,
                      border: `1px solid ${theme.border}`,
                      position: "relative",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        right: -12,
                        top: -12,
                        width: 84,
                        height: 84,
                        borderRadius: 999,
                        background: `${card.color}20`,
                        filter: "blur(8px)",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                      <div style={{ color: theme.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em" }}>
                        {card.label}
                      </div>
                      <span style={{ fontSize: 24 }}>{card.icon}</span>
                    </div>
                    <div style={{ fontFamily: fonts.heading, fontSize: 34, lineHeight: 1, letterSpacing: "-0.04em", marginBottom: 8 }}>
                      {loadingData ? "..." : card.value}
                    </div>
                    <div style={{ color: theme.textSecondary, fontSize: 13 }}>
                      {card.subtext}
                    </div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.2fr 0.8fr",
                  gap: 22,
                }}
              >
                <div
                  style={{
                    padding: "24px",
                    borderRadius: 24,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 22,
                      margin: "0 0 18px",
                      color: theme.textPrimary,
                    }}
                  >
                    Strategic Readout
                  </h2>
                  <div style={{ display: "grid", gap: 14, fontSize: 14 }}>
                    {[
                      {
                        title: "Network activation",
                        body: `${activeCafeRate}% of your café network is currently active, with ${stats?.pendingCafes || 0} locations still pending approval or intervention.`,
                        tone: "rgba(56, 189, 248, 0.08)",
                      },
                      {
                        title: "Revenue quality",
                        body: `Average revenue per booking is ${formatCurrency(averageRevenuePerBooking)}, which gives you a clean benchmark for testing price or offer changes.`,
                        tone: "rgba(34, 197, 94, 0.08)",
                      },
                      {
                        title: "Capacity signal",
                        body: `The platform is averaging ${averageBookingsPerCafe} bookings per café. Use that as your baseline to spot underperformers or sudden spikes.`,
                        tone: "rgba(245, 158, 11, 0.08)",
                      },
                    ].map((item) => (
                      <div
                        key={item.title}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 18,
                          background: item.tone,
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div style={{ fontSize: 12, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8 }}>
                          {item.title}
                        </div>
                        <div style={{ color: theme.textSecondary, lineHeight: 1.7 }}>{item.body}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: "24px",
                    borderRadius: 24,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <h2
                    style={{
                      fontFamily: fonts.heading,
                      fontSize: 22,
                      margin: "0 0 18px",
                    }}
                  >
                    Quick Actions
                  </h2>
                  <div style={{ display: "grid", gap: 12 }}>
                    {[
                      { label: "Review cafés", tab: "cafes" as NavTab, accent: "#38bdf8" },
                      { label: "Inspect bookings", tab: "bookings" as NavTab, accent: "#f59e0b" },
                      { label: "Check audit trail", tab: "audit-logs" as NavTab, accent: "#a3e635" },
                      { label: "Launch announcements", tab: "announcements" as NavTab, accent: "#fb7185" },
                    ].map((action) => (
                      <button
                        key={action.tab}
                        onClick={() => setActiveTab(action.tab)}
                        style={{
                          padding: "16px 18px",
                          borderRadius: 18,
                          border: `1px solid ${theme.border}`,
                          background: "rgba(148, 163, 184, 0.05)",
                          color: theme.textPrimary,
                          textAlign: "left",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontWeight: 600,
                        }}
                      >
                        <span>{action.label}</span>
                        <span style={{ color: action.accent, fontSize: 18 }}>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CAFES TAB */}
          {activeTab === 'cafes' && (
            <div>
              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 24,
                  flexWrap: "wrap",
                  padding: "20px",
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <input
                  type="text"
                  placeholder="Search cafés..."
                  value={cafeSearch}
                  onChange={(e) => setCafeSearch(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                  }}
                />
                <select
                  value={cafeFilter}
                  onChange={(e) => setCafeFilter(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Cafés</option>
                  <option value="active">Active Only</option>
                  <option value="inactive">Inactive Only</option>
                </select>
              </div>

              {/* Cafes Table */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.1)", borderBottom: `1px solid ${theme.border}` }}>
                        <th onClick={() => handleSort(cafeSort, setCafeSort, 'name')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Café Name {cafeSort.field === 'name' && (cafeSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort(cafeSort, setCafeSort, 'owner_name')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Owner {cafeSort.field === 'owner_name' && (cafeSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Location</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Consoles</th>
                        <th onClick={() => handleSort(cafeSort, setCafeSort, 'total_bookings')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Bookings {cafeSort.field === 'total_bookings' && (cafeSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort(cafeSort, setCafeSort, 'total_revenue')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Revenue {cafeSort.field === 'total_revenue' && (cafeSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Status</th>
                        <th style={{ padding: "16px", textAlign: "center", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingData ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            Loading cafés...
                          </td>
                        </tr>
                      ) : paginatedCafes.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No cafés found
                          </td>
                        </tr>
                      ) : (
                        paginatedCafes.map((cafe) => (
                          <tr
                            key={cafe.id}
                            style={{
                              borderBottom: `1px solid ${theme.border}`,
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary, fontWeight: 500 }}>
                              {cafe.name}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              <div>{cafe.owner_name}</div>
                              <div style={{ fontSize: 11, color: theme.textMuted }}>{cafe.owner_email}</div>
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary, maxWidth: 200 }}>
                              {cafe.address}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              PS5: {cafe.ps5_count} | PS4: {cafe.ps4_count} | Xbox: {cafe.xbox_count} | PC: {cafe.pc_count}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary, fontWeight: 500 }}>
                              {cafe.total_bookings}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "#10b981", fontWeight: 600 }}>
                              {formatCurrency(cafe.total_revenue || 0)}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: cafe.is_active ? "rgba(16, 185, 129, 0.2)" : "rgba(248, 113, 113, 0.2)",
                                  color: cafe.is_active ? "#10b981" : "#f87171",
                                }}
                              >
                                {cafe.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td style={{ padding: "16px", textAlign: "center" }}>
                              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                                <button
                                  onClick={() => router.push(`/cafes/${cafe.slug}`)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "rgba(59, 130, 246, 0.2)",
                                    color: "#3b82f6",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => toggleCafeStatus(cafe.id, cafe.is_active, cafe.name)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: cafe.is_active ? "rgba(248, 113, 113, 0.2)" : "rgba(16, 185, 129, 0.2)",
                                    color: cafe.is_active ? "#f87171" : "#10b981",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {cafe.is_active ? "Deactivate" : "Activate"}
                                </button>
                                <button
                                  onClick={() => toggleFeaturedCafe(cafe.id, cafe.is_featured || false, cafe.name)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: cafe.is_featured ? "rgba(245, 158, 11, 0.2)" : "rgba(139, 92, 246, 0.2)",
                                    color: cafe.is_featured ? "#f59e0b" : "#8b5cf6",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  {cafe.is_featured ? "⭐ Featured" : "☆ Feature"}
                                </button>
                                <button
                                  onClick={() => deleteCafe(cafe.id, cafe.name)}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: 8,
                                    border: "none",
                                    background: "rgba(248, 113, 113, 0.2)",
                                    color: "#f87171",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalCafePages > 1 && (
                  <div style={{ padding: "20px", borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, color: theme.textSecondary }}>
                      Showing {((cafePage - 1) * itemsPerPage) + 1} - {Math.min(cafePage * itemsPerPage, filteredCafes.length)} of {filteredCafes.length} cafés
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => setCafePage(p => Math.max(1, p - 1))}
                        disabled={cafePage === 1}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                          background: cafePage === 1 ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground,
                          color: cafePage === 1 ? theme.textMuted : theme.textPrimary,
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: cafePage === 1 ? "not-allowed" : "pointer",
                        }}
                      >
                        Previous
                      </button>
                      <div style={{ display: "flex", gap: 4 }}>
                        {Array.from({ length: Math.min(5, totalCafePages) }, (_, i) => {
                          let pageNum;
                          if (totalCafePages <= 5) {
                            pageNum = i + 1;
                          } else if (cafePage <= 3) {
                            pageNum = i + 1;
                          } else if (cafePage >= totalCafePages - 2) {
                            pageNum = totalCafePages - 4 + i;
                          } else {
                            pageNum = cafePage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              onClick={() => setCafePage(pageNum)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: `1px solid ${theme.border}`,
                                background: cafePage === pageNum ? "linear-gradient(135deg, #a855f7, #9333ea)" : theme.cardBackground,
                                color: cafePage === pageNum ? "#fff" : theme.textPrimary,
                                fontSize: 14,
                                fontWeight: cafePage === pageNum ? 600 : 500,
                                cursor: "pointer",
                                minWidth: 40,
                              }}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => setCafePage(p => Math.min(totalCafePages, p + 1))}
                        disabled={cafePage === totalCafePages}
                        style={{
                          padding: "8px 16px",
                          borderRadius: 8,
                          border: `1px solid ${theme.border}`,
                          background: cafePage === totalCafePages ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground,
                          color: cafePage === totalCafePages ? theme.textMuted : theme.textPrimary,
                          fontSize: 14,
                          fontWeight: 500,
                          cursor: cafePage === totalCafePages ? "not-allowed" : "pointer",
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* USERS TAB */}
          {activeTab === 'users' && (
            <div>
              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 24,
                  flexWrap: "wrap",
                  padding: "20px",
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                  }}
                />
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Roles</option>
                  <option value="user">Users</option>
                  <option value="owner">Owners</option>
                  <option value="admin">Admins</option>
                </select>
              </div>

              {/* Users Table */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.1)", borderBottom: `1px solid ${theme.border}` }}>
                        <th onClick={() => handleSort(userSort, setUserSort, 'name')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Name {userSort.field === 'name' && (userSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Email</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Phone</th>
                        <th onClick={() => handleSort(userSort, setUserSort, 'role')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Role {userSort.field === 'role' && (userSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort(userSort, setUserSort, 'total_bookings')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Bookings {userSort.field === 'total_bookings' && (userSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort(userSort, setUserSort, 'total_spent')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Total Spent {userSort.field === 'total_spent' && (userSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th onClick={() => handleSort(userSort, setUserSort, 'created_at')} style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1, cursor: "pointer", userSelect: "none" }}>
                          Joined {userSort.field === 'created_at' && (userSort.order === 'asc' ? '↑' : '↓')}
                        </th>
                        <th style={{ padding: "16px", textAlign: "center", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingData ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            Loading users...
                          </td>
                        </tr>
                      ) : paginatedUsers.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No users found
                          </td>
                        </tr>
                      ) : (
                        paginatedUsers.map((userRow) => (
                          <tr
                            key={userRow.id}
                            style={{
                              borderBottom: `1px solid ${theme.border}`,
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary, fontWeight: 500 }}>
                              {userRow.name}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {userRow.email || "N/A"}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {userRow.phone || "N/A"}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <select
                                value={userRow.role}
                                onChange={(e) => updateUserRole(userRow.id, e.target.value, userRow.name)}
                                style={{
                                  padding: "6px 10px",
                                  borderRadius: 8,
                                  border: `1px solid ${theme.border}`,
                                  background: "rgba(15, 23, 42, 0.8)",
                                  color: theme.textPrimary,
                                  fontSize: 12,
                                  cursor: "pointer",
                                }}
                              >
                                <option value="user">User</option>
                                <option value="owner">Owner</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary }}>
                              {userRow.total_bookings}
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "#10b981", fontWeight: 600 }}>
                              {formatCurrency(userRow.total_spent || 0)}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {formatDate(userRow.created_at)}
                            </td>
                            <td style={{ padding: "16px", textAlign: "center" }}>
                              <button
                                onClick={() => deleteUser(userRow.id, userRow.name)}
                                style={{
                                  padding: "8px 12px",
                                  borderRadius: 8,
                                  border: "none",
                                  background: "rgba(248, 113, 113, 0.2)",
                                  color: "#f87171",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: "pointer",
                                }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalUserPages > 1 && (
                  <div style={{ padding: "20px", borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, color: theme.textSecondary }}>
                      Showing {((userPage - 1) * itemsPerPage) + 1} - {Math.min(userPage * itemsPerPage, filteredUsers.length)} of {filteredUsers.length} users
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPage === 1} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: userPage === 1 ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground, color: userPage === 1 ? theme.textMuted : theme.textPrimary, fontSize: 14, fontWeight: 500, cursor: userPage === 1 ? "not-allowed" : "pointer" }}>Previous</button>
                      {Array.from({ length: Math.min(5, totalUserPages) }, (_, i) => { const pageNum = totalUserPages <= 5 ? i + 1 : userPage <= 3 ? i + 1 : userPage >= totalUserPages - 2 ? totalUserPages - 4 + i : userPage - 2 + i; return (<button key={pageNum} onClick={() => setUserPage(pageNum)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: userPage === pageNum ? "linear-gradient(135deg, #a855f7, #9333ea)" : theme.cardBackground, color: userPage === pageNum ? "#fff" : theme.textPrimary, fontSize: 14, fontWeight: userPage === pageNum ? 600 : 500, cursor: "pointer", minWidth: 40 }}>{pageNum}</button>); })}
                      <button onClick={() => setUserPage(p => Math.min(totalUserPages, p + 1))} disabled={userPage === totalUserPages} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: userPage === totalUserPages ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground, color: userPage === totalUserPages ? theme.textMuted : theme.textPrimary, fontSize: 14, fontWeight: 500, cursor: userPage === totalUserPages ? "not-allowed" : "pointer" }}>Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BOOKINGS TAB */}
          {activeTab === 'bookings' && (
            <div>
              {/* Filters */}
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 24,
                  flexWrap: "wrap",
                  padding: "20px",
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <input
                  type="text"
                  placeholder="Search bookings..."
                  value={bookingSearch}
                  onChange={(e) => setBookingSearch(e.target.value)}
                  style={{
                    flex: 1,
                    minWidth: 200,
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                  }}
                />
                <select
                  value={bookingStatusFilter}
                  onChange={(e) => setBookingStatusFilter(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                    cursor: "pointer",
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <input
                  type="date"
                  value={bookingDateFilter}
                  onChange={(e) => setBookingDateFilter(e.target.value)}
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    border: `1px solid ${theme.border}`,
                    background: "rgba(15, 23, 42, 0.8)",
                    color: theme.textPrimary,
                    fontSize: 14,
                  }}
                />
              </div>

              {/* Bookings Table */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.1)", borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Café</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Customer</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Date</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Time</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Duration</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Amount</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Source</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingData ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            Loading bookings...
                          </td>
                        </tr>
                      ) : paginatedBookings.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No bookings found
                          </td>
                        </tr>
                      ) : (
                        paginatedBookings.map((booking) => (
                          <tr
                            key={booking.id}
                            style={{
                              borderBottom: `1px solid ${theme.border}`,
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary, fontWeight: 500 }}>
                              {booking.cafe_name}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              <div>{booking.user_name}</div>
                              {booking.customer_phone && (
                                <div style={{ fontSize: 11, color: theme.textMuted }}>{booking.customer_phone}</div>
                              )}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {formatDate(booking.booking_date)}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {booking.start_time}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {booking.duration} min
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: "#10b981", fontWeight: 600 }}>
                              {formatCurrency(booking.total_amount)}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: booking.source === "online" ? "rgba(59, 130, 246, 0.2)" : "rgba(245, 87, 108, 0.2)",
                                  color: booking.source === "online" ? "#3b82f6" : "#f5576c",
                                }}
                              >
                                {booking.source}
                              </span>
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background:
                                    booking.status === "confirmed"
                                      ? "rgba(16, 185, 129, 0.2)"
                                      : booking.status === "pending"
                                        ? "rgba(251, 191, 36, 0.2)"
                                        : booking.status === "completed"
                                          ? "rgba(59, 130, 246, 0.2)"
                                          : "rgba(248, 113, 113, 0.2)",
                                  color:
                                    booking.status === "confirmed"
                                      ? "#10b981"
                                      : booking.status === "pending"
                                        ? "#fbbf24"
                                        : booking.status === "completed"
                                          ? "#3b82f6"
                                          : "#f87171",
                                }}
                              >
                                {booking.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalBookingPages > 1 && (
                  <div style={{ padding: "20px", borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ fontSize: 14, color: theme.textSecondary }}>
                      Showing {((bookingPage - 1) * itemsPerPage) + 1} - {Math.min(bookingPage * itemsPerPage, filteredBookings.length)} of {filteredBookings.length} bookings
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setBookingPage(p => Math.max(1, p - 1))} disabled={bookingPage === 1} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: bookingPage === 1 ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground, color: bookingPage === 1 ? theme.textMuted : theme.textPrimary, fontSize: 14, fontWeight: 500, cursor: bookingPage === 1 ? "not-allowed" : "pointer" }}>Previous</button>
                      {Array.from({ length: Math.min(5, totalBookingPages) }, (_, i) => { const pageNum = totalBookingPages <= 5 ? i + 1 : bookingPage <= 3 ? i + 1 : bookingPage >= totalBookingPages - 2 ? totalBookingPages - 4 + i : bookingPage - 2 + i; return (<button key={pageNum} onClick={() => setBookingPage(pageNum)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${theme.border}`, background: bookingPage === pageNum ? "linear-gradient(135deg, #a855f7, #9333ea)" : theme.cardBackground, color: bookingPage === pageNum ? "#fff" : theme.textPrimary, fontSize: 14, fontWeight: bookingPage === pageNum ? 600 : 500, cursor: "pointer", minWidth: 40 }}>{pageNum}</button>); })}
                      <button onClick={() => setBookingPage(p => Math.min(totalBookingPages, p + 1))} disabled={bookingPage === totalBookingPages} style={{ padding: "8px 16px", borderRadius: 8, border: `1px solid ${theme.border}`, background: bookingPage === totalBookingPages ? "rgba(15, 23, 42, 0.5)" : theme.cardBackground, color: bookingPage === totalBookingPages ? theme.textMuted : theme.textPrimary, fontSize: 14, fontWeight: 500, cursor: bookingPage === totalBookingPages ? "not-allowed" : "pointer" }}>Next</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* REVENUE TAB */}
          {activeTab === 'revenue' && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Time-based Revenue Cards */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 16,
                }}
              >
                <div style={{ padding: "24px", background: "rgba(16, 185, 129, 0.1)", borderRadius: 16, border: "1px solid rgba(16, 185, 129, 0.2)" }}>
                  <p style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    Today
                  </p>
                  <p style={{ fontFamily: fonts.heading, fontSize: 32, color: "#10b981", margin: 0, fontWeight: 700 }}>
                    {formatCurrency(stats?.todayRevenue || 0)}
                  </p>
                  <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{stats?.todayBookings || 0} bookings</p>
                </div>
                <div style={{ padding: "24px", background: "rgba(59, 130, 246, 0.1)", borderRadius: 16, border: "1px solid rgba(59, 130, 246, 0.2)" }}>
                  <p style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    This Week
                  </p>
                  <p style={{ fontFamily: fonts.heading, fontSize: 32, color: "#3b82f6", margin: 0, fontWeight: 700 }}>
                    {formatCurrency(stats?.weekRevenue || 0)}
                  </p>
                </div>
                <div style={{ padding: "24px", background: "rgba(139, 92, 246, 0.1)", borderRadius: 16, border: "1px solid rgba(139, 92, 246, 0.2)" }}>
                  <p style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    This Month
                  </p>
                  <p style={{ fontFamily: fonts.heading, fontSize: 32, color: "#8b5cf6", margin: 0, fontWeight: 700 }}>
                    {formatCurrency(stats?.monthRevenue || 0)}
                  </p>
                </div>
                <div style={{ padding: "24px", background: "rgba(168, 85, 247, 0.1)", borderRadius: 16, border: "1px solid rgba(168, 85, 247, 0.2)" }}>
                  <p style={{ fontSize: 11, color: theme.textMuted, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.5 }}>
                    All Time
                  </p>
                  <p style={{ fontFamily: fonts.heading, fontSize: 32, color: "#a855f7", margin: 0, fontWeight: 700 }}>
                    {formatCurrency(stats?.totalRevenue || 0)}
                  </p>
                  <p style={{ fontSize: 12, color: theme.textMuted, marginTop: 8 }}>{stats?.totalBookings || 0} total bookings</p>
                </div>
              </div>

              {/* Revenue by Café Table */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 16,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "20px 24px", borderBottom: `1px solid ${theme.border}` }}>
                  <h3 style={{ fontSize: 18, color: theme.textPrimary, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
                    📊 Revenue by Café
                  </h3>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.08)", borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Café</th>
                        <th style={{ padding: "14px 20px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Owner</th>
                        <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Bookings</th>
                        <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Revenue</th>
                        <th style={{ padding: "14px 20px", textAlign: "right", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cafes.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No café data available
                          </td>
                        </tr>
                      ) : (
                        [...cafes]
                          .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
                          .map((cafe) => {
                            const sharePercent = stats?.totalRevenue ? ((cafe.total_revenue || 0) / stats.totalRevenue * 100).toFixed(1) : '0';
                            return (
                              <tr
                                key={cafe.id}
                                style={{
                                  borderBottom: `1px solid ${theme.border}`,
                                  transition: "background 0.2s",
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)"; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                              >
                                <td style={{ padding: "16px 20px" }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.textPrimary }}>{cafe.name}</div>
                                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>{cafe.address?.substring(0, 40)}...</div>
                                </td>
                                <td style={{ padding: "16px 20px", fontSize: 14, color: theme.textSecondary }}>
                                  {cafe.owner_name || 'Unknown'}
                                </td>
                                <td style={{ padding: "16px 20px", textAlign: "right", fontSize: 14, color: theme.textSecondary }}>
                                  {cafe.total_bookings || 0}
                                </td>
                                <td style={{ padding: "16px 20px", textAlign: "right", fontSize: 14, fontWeight: 600, color: "#10b981" }}>
                                  {formatCurrency(cafe.total_revenue || 0)}
                                </td>
                                <td style={{ padding: "16px 20px", textAlign: "right" }}>
                                  <span style={{ padding: "4px 8px", borderRadius: 6, fontSize: 12, background: "rgba(168, 85, 247, 0.15)", color: "#a855f7" }}>
                                    {sharePercent}%
                                  </span>
                                </td>
                              </tr>
                            );
                          })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* REPORTS TAB */}
          {activeTab === 'reports' && (
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Top Cafés by Revenue */}
              <div
                style={{
                  padding: "24px",
                  borderRadius: 16,
                  background: theme.cardBackground,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <h3 style={{ fontSize: 18, marginBottom: 20, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                  🏆 Top Cafés by Revenue
                </h3>
                {cafes.length === 0 ? (
                  <p style={{ color: theme.textMuted }}>No café data available</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {[...cafes]
                      .sort((a, b) => (b.total_revenue || 0) - (a.total_revenue || 0))
                      .slice(0, 5)
                      .map((cafe, index) => {
                        const maxRevenue = Math.max(...cafes.map(c => c.total_revenue || 0), 1);
                        const widthPercent = ((cafe.total_revenue || 0) / maxRevenue) * 100;
                        return (
                          <div key={cafe.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ width: 24, fontSize: 14, fontWeight: 600, color: index === 0 ? "#fbbf24" : theme.textSecondary }}>
                              #{index + 1}
                            </span>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                <span style={{ fontSize: 14, color: theme.textPrimary }}>{cafe.name}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#10b981" }}>{formatCurrency(cafe.total_revenue || 0)}</span>
                              </div>
                              <div style={{ height: 8, background: "rgba(16, 185, 129, 0.1)", borderRadius: 4, overflow: "hidden" }}>
                                <div style={{ height: "100%", width: `${widthPercent}%`, background: "linear-gradient(90deg, #10b981, #34d399)", borderRadius: 4, transition: "width 0.5s" }} />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Platform Stats Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <div style={{ padding: "20px", borderRadius: 12, background: theme.cardBackground, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#10b981" }}>{formatCurrency(stats?.totalRevenue || 0)}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Total Revenue</div>
                </div>
                <div style={{ padding: "20px", borderRadius: 12, background: theme.cardBackground, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#3b82f6" }}>{stats?.totalBookings || 0}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Total Bookings</div>
                </div>
                <div style={{ padding: "20px", borderRadius: 12, background: theme.cardBackground, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#a855f7" }}>{stats?.totalCafes || 0}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Active Cafés</div>
                </div>
                <div style={{ padding: "20px", borderRadius: 12, background: theme.cardBackground, border: `1px solid ${theme.border}`, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#f59e0b" }}>{stats?.totalUsers || 0}</div>
                  <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>Registered Users</div>
                </div>
              </div>

              {/* Revenue Breakdown */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div
                  style={{
                    padding: "24px",
                    borderRadius: 16,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <h3 style={{ fontSize: 18, marginBottom: 20, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                    💰 Revenue Breakdown
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>Today</span>
                      <span style={{ fontWeight: 600, color: "#10b981" }}>{formatCurrency(stats?.todayRevenue || 0)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>This Week</span>
                      <span style={{ fontWeight: 600, color: "#3b82f6" }}>{formatCurrency(stats?.weekRevenue || 0)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>This Month</span>
                      <span style={{ fontWeight: 600, color: "#a855f7" }}>{formatCurrency(stats?.monthRevenue || 0)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
                      <span style={{ color: theme.textSecondary }}>All Time</span>
                      <span style={{ fontWeight: 600, color: "#f59e0b" }}>{formatCurrency(stats?.totalRevenue || 0)}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "24px",
                    borderRadius: 16,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <h3 style={{ fontSize: 18, marginBottom: 20, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 10 }}>
                    📊 Café Performance
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>Active Cafés</span>
                      <span style={{ fontWeight: 600, color: "#10b981" }}>{stats?.activeCafes || 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>Pending Cafés</span>
                      <span style={{ fontWeight: 600, color: "#f59e0b" }}>{stats?.pendingCafes || 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{ color: theme.textSecondary }}>Café Owners</span>
                      <span style={{ fontWeight: 600, color: "#3b82f6" }}>{stats?.totalOwners || 0}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
                      <span style={{ color: theme.textSecondary }}>Avg. Revenue/Café</span>
                      <span style={{ fontWeight: 600, color: "#a855f7" }}>{formatCurrency(stats?.totalCafes ? Math.round((stats?.totalRevenue || 0) / stats.totalCafes) : 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ANNOUNCEMENTS TAB */}
          {activeTab === 'announcements' && (
            <div>
              {/* Create Announcement Button */}
              <div style={{ marginBottom: 24 }}>
                <button
                  onClick={() => setShowAnnouncementForm(!showAnnouncementForm)}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 10,
                    border: "none",
                    background: "linear-gradient(135deg, #a855f7, #9333ea)",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {showAnnouncementForm ? '✕ Cancel' : '+ Create Announcement'}
                </button>
              </div>

              {/* Announcement Form */}
              {showAnnouncementForm && (
                <div
                  style={{
                    marginBottom: 24,
                    padding: "24px",
                    borderRadius: 12,
                    background: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  <h3 style={{ fontSize: 18, marginBottom: 16, color: theme.textPrimary }}>New Announcement</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <input
                      type="text"
                      placeholder="Title"
                      value={announcementForm.title}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                      style={{
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        background: "rgba(15, 23, 42, 0.8)",
                        color: theme.textPrimary,
                        fontSize: 14,
                      }}
                    />
                    <textarea
                      placeholder="Message"
                      value={announcementForm.message}
                      onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                      rows={4}
                      style={{
                        padding: "12px 16px",
                        borderRadius: 10,
                        border: `1px solid ${theme.border}`,
                        background: "rgba(15, 23, 42, 0.8)",
                        color: theme.textPrimary,
                        fontSize: 14,
                        fontFamily: fonts.body,
                        resize: "vertical",
                      }}
                    />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                      <select
                        value={announcementForm.type}
                        onChange={(e) => setAnnouncementForm({ ...announcementForm, type: e.target.value as 'info' | 'warning' | 'success' | 'error' })}
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          border: `1px solid ${theme.border}`,
                          background: "rgba(15, 23, 42, 0.8)",
                          color: theme.textPrimary,
                          fontSize: 14,
                        }}
                      >
                        <option value="info">Info</option>
                        <option value="warning">Warning</option>
                        <option value="success">Success</option>
                        <option value="error">Error</option>
                      </select>
                      <select
                        value={announcementForm.target_audience}
                        onChange={(e) => setAnnouncementForm({ ...announcementForm, target_audience: e.target.value as 'all' | 'users' | 'owners' })}
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          border: `1px solid ${theme.border}`,
                          background: "rgba(15, 23, 42, 0.8)",
                          color: theme.textPrimary,
                          fontSize: 14,
                        }}
                      >
                        <option value="all">All Users</option>
                        <option value="users">Users Only</option>
                        <option value="owners">Owners Only</option>
                      </select>
                      <input
                        type="datetime-local"
                        placeholder="Expires At (optional)"
                        value={announcementForm.expires_at}
                        onChange={(e) => setAnnouncementForm({ ...announcementForm, expires_at: e.target.value })}
                        style={{
                          padding: "12px 16px",
                          borderRadius: 10,
                          border: `1px solid ${theme.border}`,
                          background: "rgba(15, 23, 42, 0.8)",
                          color: theme.textPrimary,
                          fontSize: 14,
                        }}
                      />
                    </div>
                    <button
                      onClick={createAnnouncement}
                      style={{
                        padding: "12px 24px",
                        borderRadius: 10,
                        border: "none",
                        background: "linear-gradient(135deg, #10b981, #059669)",
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: 600,
                        cursor: "pointer",
                        alignSelf: "flex-start",
                      }}
                    >
                      Create Announcement
                    </button>
                  </div>
                </div>
              )}

              {/* Announcements List */}
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                {loadingData ? (
                  <div style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                    Loading announcements...
                  </div>
                ) : announcements.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                    No announcements yet
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "20px" }}>
                    {announcements.map((announcement) => (
                      <div
                        key={announcement.id}
                        style={{
                          padding: "20px",
                          borderRadius: 12,
                          background: "rgba(15, 23, 42, 0.8)",
                          border: `1px solid ${theme.border}`,
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                          <div style={{ flex: 1 }}>
                            <h4 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, margin: "0 0 8px 0" }}>
                              {announcement.title}
                            </h4>
                            <p style={{ fontSize: 14, color: theme.textSecondary, margin: "0 0 12px 0" }}>
                              {announcement.message}
                            </p>
                            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                              <span style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: announcement.type === 'info' ? 'rgba(59, 130, 246, 0.2)' : announcement.type === 'warning' ? 'rgba(245, 158, 11, 0.2)' : announcement.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(248, 113, 113, 0.2)', color: announcement.type === 'info' ? '#3b82f6' : announcement.type === 'warning' ? '#f59e0b' : announcement.type === 'success' ? '#10b981' : '#f87171' }}>
                                {announcement.type}
                              </span>
                              <span style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: 'rgba(168, 85, 247, 0.2)', color: '#a855f7' }}>
                                {announcement.target_audience}
                              </span>
                              <span style={{ padding: "4px 12px", borderRadius: 6, fontSize: 12, fontWeight: 600, background: announcement.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(100, 116, 139, 0.2)', color: announcement.is_active ? '#10b981' : theme.textMuted }}>
                                {announcement.is_active ? 'Active' : 'Inactive'}
                              </span>
                              <span style={{ fontSize: 12, color: theme.textMuted }}>
                                Created: {formatDate(announcement.created_at)}
                              </span>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              onClick={() => toggleAnnouncementStatus(announcement.id, announcement.is_active)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "none",
                                background: announcement.is_active ? "rgba(248, 113, 113, 0.2)" : "rgba(16, 185, 129, 0.2)",
                                color: announcement.is_active ? "#f87171" : "#10b981",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              {announcement.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => deleteAnnouncement(announcement.id, announcement.title)}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "none",
                                background: "rgba(248, 113, 113, 0.2)",
                                color: "#f87171",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AUDIT LOGS TAB */}
          {activeTab === 'audit-logs' && (
            <div>
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.1)", borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Timestamp</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Action</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Entity Type</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Entity ID</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingData ? (
                        <tr>
                          <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            Loading audit logs...
                          </td>
                        </tr>
                      ) : auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No audit logs found
                          </td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr
                            key={log.id}
                            style={{
                              borderBottom: `1px solid ${theme.border}`,
                              transition: "background 0.2s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                            }}
                          >
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                            <td style={{ padding: "16px" }}>
                              <span
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: 8,
                                  fontSize: 12,
                                  fontWeight: 600,
                                  background: log.action === 'delete' ? "rgba(248, 113, 113, 0.2)" : log.action === 'create' ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)",
                                  color: log.action === 'delete' ? "#f87171" : log.action === 'create' ? "#10b981" : "#3b82f6",
                                }}
                              >
                                {log.action}
                              </span>
                            </td>
                            <td style={{ padding: "16px", fontSize: 14, color: theme.textPrimary }}>
                              {log.entity_type}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textMuted, fontFamily: "monospace" }}>
                              {log.entity_id ? log.entity_id.substring(0, 8) + '...' : 'N/A'}
                            </td>
                            <td style={{ padding: "16px", fontSize: 13, color: theme.textSecondary }}>
                              {log.details ? JSON.stringify(log.details).substring(0, 100) + '...' : 'N/A'}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* COUPONS TAB */}
          {activeTab === 'coupons' && (
            <div>
              <div
                style={{
                  background: theme.cardBackground,
                  borderRadius: 12,
                  border: `1px solid ${theme.border}`,
                  overflow: "hidden",
                }}
              >
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "rgba(168, 85, 247, 0.1)", borderBottom: `1px solid ${theme.border}` }}>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Code</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Café</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Discount</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Usage</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Valid Until</th>
                        <th style={{ padding: "16px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textSecondary, textTransform: "uppercase", letterSpacing: 1 }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingData ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            Loading coupons...
                          </td>
                        </tr>
                      ) : coupons.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ padding: "40px", textAlign: "center", color: theme.textMuted }}>
                            No coupons found across any café
                          </td>
                        </tr>
                      ) : (
                        coupons.map((coupon) => {
                          const isExpired = coupon.valid_until && new Date(coupon.valid_until) < new Date();
                          const discountDisplay = coupon.discount_type === 'percentage'
                            ? `${coupon.discount_value}% OFF`
                            : coupon.bonus_minutes > 0
                              ? `${coupon.bonus_minutes} mins FREE`
                              : `₹${coupon.discount_value} OFF`;

                          return (
                            <tr
                              key={coupon.id}
                              style={{
                                borderBottom: `1px solid ${theme.border}`,
                                transition: "background 0.2s",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(168, 85, 247, 0.05)";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "transparent";
                              }}
                            >
                              <td style={{ padding: "16px", fontFamily: "monospace", fontSize: 14, color: theme.textPrimary, fontWeight: 600 }}>
                                {coupon.code}
                              </td>
                              <td style={{ padding: "16px", fontSize: 14, color: theme.textSecondary }}>
                                {coupon.cafe_name}
                              </td>
                              <td style={{ padding: "16px" }}>
                                <span
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: coupon.discount_type === 'percentage' ? "rgba(16, 185, 129, 0.2)" : "rgba(59, 130, 246, 0.2)",
                                    color: coupon.discount_type === 'percentage' ? "#10b981" : "#3b82f6",
                                  }}
                                >
                                  {discountDisplay}
                                </span>
                              </td>
                              <td style={{ padding: "16px", fontSize: 14, color: theme.textSecondary }}>
                                {coupon.uses_count} / {coupon.max_uses || '∞'}
                              </td>
                              <td style={{ padding: "16px", fontSize: 13, color: theme.textMuted }}>
                                {coupon.valid_until ? formatDate(coupon.valid_until) : 'No expiry'}
                              </td>
                              <td style={{ padding: "16px" }}>
                                <span
                                  style={{
                                    padding: "6px 12px",
                                    borderRadius: 8,
                                    fontSize: 12,
                                    fontWeight: 600,
                                    background: !coupon.is_active || isExpired ? "rgba(248, 113, 113, 0.2)" : "rgba(16, 185, 129, 0.2)",
                                    color: !coupon.is_active || isExpired ? "#f87171" : "#10b981",
                                  }}
                                >
                                  {isExpired ? 'Expired' : coupon.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* SETTINGS TAB */}
          {activeTab === 'settings' && (
            <div
              style={{
                padding: "40px",
                borderRadius: 16,
                background: theme.cardBackground,
                border: `1px solid ${theme.border}`,
              }}
            >
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: fonts.heading, fontSize: 24, marginBottom: 8, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 12 }}>
                  ⚙️ Admin Settings
                </h2>
                <p style={{ fontSize: 14, color: theme.textSecondary }}>
                  Manage your admin login credentials
                </p>
              </div>

              {/* Success/Error Message */}
              {settingsMessage && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 8,
                    marginBottom: 24,
                    background: settingsMessage.type === 'success'
                      ? "rgba(34, 197, 94, 0.1)"
                      : "rgba(239, 68, 68, 0.1)",
                    border: `1px solid ${settingsMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: settingsMessage.type === 'success' ? '#22c55e' : '#ef4444',
                    fontSize: 14,
                  }}
                >
                  {settingsMessage.text}
                </div>
              )}

              <div style={{ maxWidth: 600 }}>
                {/* Current Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: theme.textSecondary, marginBottom: 8 }}>
                    Current Password *
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: theme.background,
                      color: theme.textPrimary,
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                <div style={{ height: 1, background: theme.border, marginBottom: 24 }} />

                {/* New Username */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: theme.textSecondary, marginBottom: 8 }}>
                    New Username (optional)
                  </label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Leave blank to keep current username"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: theme.background,
                      color: theme.textPrimary,
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                {/* New Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: theme.textSecondary, marginBottom: 8 }}>
                    New Password (optional)
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: theme.background,
                      color: theme.textPrimary,
                      fontSize: 14,
                      outline: "none",
                    }}
                  />
                </div>

                {/* Confirm New Password */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: "block", fontSize: 14, fontWeight: 500, color: theme.textSecondary, marginBottom: 8 }}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    disabled={!newPassword}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: newPassword ? theme.background : theme.cardBackground,
                      color: theme.textPrimary,
                      fontSize: 14,
                      outline: "none",
                      cursor: newPassword ? "text" : "not-allowed",
                    }}
                  />
                </div>

                {/* Save Button */}
                <button
                  onClick={saveAdminSettings}
                  disabled={savingSettings || !currentPassword}
                  style={{
                    padding: "12px 24px",
                    borderRadius: 8,
                    border: "none",
                    background: savingSettings || !currentPassword
                      ? "rgba(168, 85, 247, 0.3)"
                      : "linear-gradient(135deg, #a855f7, #8b5cf6)",
                    color: "#ffffff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: savingSettings || !currentPassword ? "not-allowed" : "pointer",
                    opacity: savingSettings || !currentPassword ? 0.5 : 1,
                    transition: "all 0.2s",
                  }}
                >
                  {savingSettings ? "Saving..." : "Save Changes"}
                </button>

                <p style={{ fontSize: 13, color: theme.textMuted, marginTop: 16 }}>
                  * Current password is required to make changes
                </p>
              </div>
            </div>
          )}

          {/* Owner Access Tab */}
          {activeTab === 'owner-access' && (
            <div style={{ padding: "40px", borderRadius: 16, background: theme.cardBackground, border: `1px solid ${theme.border}` }}>
              <div style={{ marginBottom: 32 }}>
                <h2 style={{ fontFamily: fonts.heading, fontSize: 24, marginBottom: 8, color: theme.textPrimary, display: "flex", alignItems: "center", gap: 12 }}>
                  🔑 Owner Access — Gmail Login
                </h2>
                <p style={{ fontSize: 14, color: theme.textSecondary }}>
                  Add Gmail addresses that can sign in to the owner dashboard. Each email must be linked to a café.
                </p>
              </div>

              {/* Add new email form */}
              <form onSubmit={handleAddOwnerEmail} style={{ marginBottom: 32, padding: 24, borderRadius: 12, background: "rgba(255,255,255,0.03)", border: `1px solid ${theme.border}` }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: theme.textPrimary, marginBottom: 16 }}>Add Authorized Email</h3>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <input
                    type="email"
                    value={newOwnerEmail}
                    onChange={e => setNewOwnerEmail(e.target.value)}
                    placeholder="owner@gmail.com"
                    required
                    style={{ flex: "1 1 220px", padding: "10px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "rgba(15,23,42,0.8)", color: theme.textPrimary, fontSize: 14, outline: "none" }}
                  />
                  <select
                    value={newOwnerCafeId}
                    onChange={e => setNewOwnerCafeId(e.target.value)}
                    required
                    style={{ flex: "1 1 200px", padding: "10px 14px", borderRadius: 8, border: `1px solid ${theme.border}`, background: "rgba(15,23,42,0.8)", color: theme.textPrimary, fontSize: 14, outline: "none" }}
                  >
                    <option value="">— Select Café —</option>
                    {cafes.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button type="submit" style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #8b5cf6, #6366f1)", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                    + Add Email
                  </button>
                </div>
                {ownerEmailMsg && (
                  <div style={{ marginTop: 12, fontSize: 13, color: ownerEmailMsg.type === 'success' ? '#22c55e' : '#ef4444' }}>
                    {ownerEmailMsg.type === 'success' ? '✓' : '⚠'} {ownerEmailMsg.text}
                  </div>
                )}
              </form>

              {/* Allowed emails list */}
              {ownerEmailsLoading ? (
                <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>Loading…</div>
              ) : ownerEmails.length === 0 ? (
                <div style={{ textAlign: "center", padding: 40, color: theme.textMuted }}>
                  No authorized emails yet. Add one above.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                      {["Gmail Address", "Café", "Added By", "Status", ""].map(h => (
                        <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, fontWeight: 600, color: theme.textMuted, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ownerEmails.map(row => (
                      <tr key={row.id} style={{ borderBottom: `1px solid rgba(51,65,85,0.3)` }}>
                        <td style={{ padding: "12px", color: theme.textPrimary, fontSize: 14 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                            </svg>
                            {row.email}
                          </div>
                        </td>
                        <td style={{ padding: "12px", color: theme.textSecondary, fontSize: 14 }}>{(row as any).cafes?.name || row.cafe_id}</td>
                        <td style={{ padding: "12px", color: theme.textMuted, fontSize: 13 }}>{row.added_by || '—'}</td>
                        <td style={{ padding: "12px" }}>
                          <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: row.active ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: row.active ? "#22c55e" : "#ef4444" }}>
                            {row.active ? "Active" : "Disabled"}
                          </span>
                        </td>
                        <td style={{ padding: "12px", textAlign: "right" }}>
                          <button
                            onClick={() => handleDeleteOwnerEmail(row.id)}
                            style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#ef4444", fontSize: 12, cursor: "pointer" }}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
