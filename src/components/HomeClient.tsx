// src/components/HomeClient.tsx
"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import CafeList from "@/components/CafeList";
import ActiveSessionTimer from "@/components/ActiveSessionTimer";
import type { Cafe } from "../types/cafe";
import {
  Search,
  X,
  Filter,
  ChevronRight,
  Award,
  Trophy,
  Users,
  Clock,
  Zap,
  Sparkles,
  GamepadDirectional,
  Monitor,
  CircleDollarSign,
  Car,
  RectangleGoggles,
  Target,
  Frown,
  Check,
  TrendingUp,
  TrendingDown

} from "lucide-react";
import PWAInstaller from "@/components/PWAInstaller";

type Props = {
  cafes: Cafe[];
};

type SortKey = "relevance" | "price_asc" | "price_desc";
type TabType = "book" | "membership" | "tournaments";
/**
 * A membership plan as the cafés actually sell them: a day pass, or a bundle of
 * hours to use within a number of days.
 *
 * This replaced a monthly/yearly subscription tier shape that no table ever
 * matched, which is why this section failed on every homepage load.
 */
type MembershipTierPreview = {
  id: string;
  cafeId: string;
  cafeName: string;
  planType: string;
  name: string;
  description?: string | null;
  price: number;
  hours?: number | null;
  validityDays: number;
};
type TournamentPreview = {
  id: string;
  name: string;
  game: string;
  icon?: string | null;
  status?: string | null;
  tournament_date: string;
  tournament_time?: string | null;
  prize_amount?: number | null;
  prize_currency?: string | null;
  max_participants?: number | null;
  current_participants?: number | null;
  location?: string | null;
  color?: string | null;
};

export default function HomeClient({ cafes }: Props) {
  const router = useRouter();
  const safeCafes: Cafe[] = Array.isArray(cafes) ? cafes : [];

  const [activeTab, setActiveTab] = useState<TabType>("book");
  const [query, setQuery] = useState("");
  const [onlyPs5, setOnlyPs5] = useState(false);
  const [onlyPc, setOnlyPc] = useState(false);
  const [onlyPool, setOnlyPool] = useState(false);
  const [onlyWheel, setOnlyWheel] = useState(false);
  const [onlyVr, setOnlyVr] = useState(false);
  const [onlySnooker, setOnlySnooker] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>("relevance");
  const [mounted, setMounted] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [membershipTiers, setMembershipTiers] = useState<MembershipTierPreview[]>([]);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<TournamentPreview[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let isCancelled = false;

    async function loadPreviewData() {
      try {
        const [membershipResponse, tournamentResponse] = await Promise.all([
          fetch("/api/memberships/plans"),
          fetch("/api/tournaments?status=upcoming"),
        ]);

        if (isCancelled) {
          return;
        }

        if (membershipResponse.ok) {
          const membershipData = await membershipResponse.json();
          setMembershipTiers(Array.isArray(membershipData.plans) ? membershipData.plans : []);
          setMembershipError(null);
        } else {
          setMembershipError("Membership plans are not available right now.");
        }

        if (tournamentResponse.ok) {
          const tournamentData = await tournamentResponse.json();
          setTournaments(Array.isArray(tournamentData.tournaments) ? tournamentData.tournaments : []);
          setTournamentsError(null);
        } else {
          setTournamentsError("Tournaments are not available right now.");
        }
      } catch {
        if (!isCancelled) {
          setMembershipError("Membership plans are not available right now.");
          setTournamentsError("Tournaments are not available right now.");
        }
      } finally {
        if (!isCancelled) {
          setMembershipLoading(false);
          setTournamentsLoading(false);
        }
      }
    }

    loadPreviewData();

    return () => {
      isCancelled = true;
    };
  }, []);

  // Lock body scroll when filter sheet is open
  useEffect(() => {
    if (showFilters) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showFilters]);

  const handleScrollToList = () => {
    if (!listRef.current) return;
    listRef.current.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const filteredCafes = useMemo(() => {
    let list = [...safeCafes];

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((c) =>
        [c.name, c.address, c.city].some((field) =>
          field?.toLowerCase().includes(q)
        )
      );
    }

    if (onlyPs5) list = list.filter((c) => (c.ps5_count ?? 0) > 0);
    if (onlyPc) list = list.filter((c) => (c.pc_count ?? 0) > 0);
    if (onlyPool) list = list.filter((c) => (c.pool_count ?? 0) > 0);
    if (onlyWheel)
      list = list.filter((c) => ((c as any).steering_wheel_count ?? 0) > 0);
    if (onlyVr) list = list.filter((c) => ((c as any).vr_count ?? 0) > 0);
    if (onlySnooker)
      list = list.filter((c) => ((c as any).snooker_count ?? 0) > 0);

    if (sortBy === "price_asc") {
      list.sort(
        (a, b) =>
          (a.hourly_price ?? Number.POSITIVE_INFINITY) -
          (b.hourly_price ?? Number.POSITIVE_INFINITY)
      );
    } else if (sortBy === "price_desc") {
      list.sort((a, b) => (b.hourly_price ?? 0) - (a.hourly_price ?? 0));
    }

    return list;
  }, [
    safeCafes,
    query,
    onlyPs5,
    onlyPc,
    onlyPool,
    onlyWheel,
    onlyVr,
    onlySnooker,
    sortBy,
  ]);

  const activeFiltersCount = useMemo(() => {
    let n = 0;
    if (onlyPs5) n++;
    if (onlyPc) n++;
    if (onlyPool) n++;
    if (onlyWheel) n++;
    if (onlyVr) n++;
    if (onlySnooker) n++;
    return n;
  }, [onlyPs5, onlyPc, onlyPool, onlyWheel, onlyVr, onlySnooker]);

  const featuredMemberships = useMemo(
    () => membershipTiers.slice(0, 3),
    [membershipTiers]
  );

  const featuredTournaments = useMemo(
    () => tournaments.slice(0, 3),
    [tournaments]
  );

  const clearAllFilters = () => {
    setOnlyPs5(false);
    setOnlyPc(false);
    setOnlyPool(false);
    setOnlyWheel(false);
    setOnlyVr(false);
    setOnlySnooker(false);
    setQuery("");
    setSortBy("relevance");
  };

  const filterButtons = [
    {
      key: "ps5",
      label: "PS5",
      icon: <GamepadDirectional className="w-4 h-4" />,
      active: onlyPs5,
      toggle: () => setOnlyPs5((v) => !v)
    },
    {
      key: "pc",
      label: "PC",
      icon: <Monitor className="w-4 h-4" />,
      active: onlyPc,
      toggle: () => setOnlyPc((v) => !v)
    },
    {
      key: "pool",
      label: "Pool",
      icon: <CircleDollarSign className="w-4 h-4" />,
      active: onlyPool,
      toggle: () => setOnlyPool((v) => !v)
    },
    {
      key: "wheel",
      label: "Racing",
      icon: <Car className="w-4 h-4" />,
      active: onlyWheel,
      toggle: () => setOnlyWheel((v) => !v)
    },
    {
      key: "vr",
      label: "VR",
      icon: <RectangleGoggles className="w-4 h-4" />,
      active: onlyVr,
      toggle: () => setOnlyVr((v) => !v)
    },
    {
      key: "snooker",
      label: "Snooker",
      icon: <Target className="w-4 h-4" />,
      active: onlySnooker,
      toggle: () => setOnlySnooker((v) => !v)
    },
  ];

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap');

        :root {
          --neon-red: #ff073a;
          --neon-red-dim: #cc0530;
          --neon-cyan: #00f0ff;
          --dark-bg: #08080c;
          --card-bg: #101016;
        }

        * {
          -webkit-tap-highlight-color: transparent;
        }

        /* Cyber Grid Background - Reference code se */
        .cyber-grid {
          background-image: 
            linear-gradient(rgba(34, 211, 238, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34, 211, 238, 0.1) 1px, transparent 1px);
          background-size: 40px 40px;
        }

        /* Circuit Pattern - Reference code se */
        .circuit-pattern {
          background-image: 
            radial-gradient(circle at 20% 50%, rgba(255, 7, 58, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 80% 20%, rgba(0, 240, 255, 0.1) 0%, transparent 50%);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(100%); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        @keyframes pulseGlow {
          0%, 100% { 
            box-shadow: 0 0 20px rgba(255, 7, 58, 0.3),
                        inset 0 0 10px rgba(255, 7, 58, 0.1);
          }
          50% { 
            box-shadow: 0 0 40px rgba(255, 7, 58, 0.5),
                        inset 0 0 20px rgba(255, 7, 58, 0.2);
          }
        }

        @keyframes featureHighlight {
          0% { 
            opacity: 0; 
            transform: scale(0.8) translateY(20px); 
          }
          20% { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
          80% { 
            opacity: 1; 
            transform: scale(1) translateY(0); 
          }
          100% { 
            opacity: 0; 
            transform: scale(0.9) translateY(-10px); 
          }
        }

        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }

        .animate-slide-up {
          animation: slideUp 0.3s ease-out forwards;
        }

        .animate-float {
          animation: float 3s ease-in-out infinite;
        }

        .animate-pulse-glow {
          animation: pulseGlow 2s ease-in-out infinite;
        }

        .animate-feature-highlight {
          animation: featureHighlight 1.5s ease-out forwards;
        }

        .glow-red {
          text-shadow: 0 0 8px rgba(255, 7, 58, 0.45),
                       0 0 14px rgba(255, 7, 58, 0.25);
        }

        .glow-cyan {
          text-shadow: 0 0 20px rgba(0, 240, 255, 0.7),
                       0 0 40px rgba(0, 240, 255, 0.4);
        }

        /* Main Background - Reference code jaise */
        .bg-main {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
        }

        .bg-main::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 0;
          background: var(--dark-bg);
        }

        .bg-main::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(
            to bottom,
            rgba(8, 8, 12, 0) 0%,
            rgba(8, 8, 12, 0.3) 20%,
            rgba(8, 8, 12, 0.6) 40%,
            rgba(8, 8, 12, 0.8) 60%,
            rgba(8, 8, 12, 0.9) 80%,
            rgba(8, 8, 12, 1) 100%
          );
          z-index: 1;
        }

        @media (max-width: 768px) {
          .bg-main::before {
            background-attachment: scroll;
          }
        }

        .card-glass {
          background: rgba(16, 16, 22, 0.85);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .btn-glow {
          background: linear-gradient(135deg, var(--neon-red) 0%, var(--neon-red-dim) 100%);
          box-shadow: 
            0 4px 20px rgba(255, 7, 58, 0.3),
            0 1px 0 rgba(255, 255, 255, 0.1) inset;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
        }

        .btn-glow::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.2),
            transparent
          );
          transition: 0.5s;
        }

        .btn-glow:hover::before {
          left: 100%;
        }

        .btn-glow:hover {
          transform: translateY(-2px);
          box-shadow: 
            0 8px 30px rgba(255, 7, 58, 0.5),
            0 1px 0 rgba(255, 255, 255, 0.1) inset;
        }

        .btn-glow:active {
          transform: translateY(0);
        }

        .btn-ghost {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .btn-ghost:hover {
          background: rgba(255, 255, 255, 0.08);
          border-color: rgba(255, 255, 255, 0.12);
        }

        .btn-ghost:active {
          background: rgba(255, 255, 255, 0.12);
        }

        .chip {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          transition: all 0.2s ease;
        }

        .chip:hover {
          border-color: rgba(255, 255, 255, 0.1);
        }

        .chip-active {
          background: linear-gradient(135deg, var(--neon-red) 0%, var(--neon-red-dim) 100%);
          border-color: transparent;
          box-shadow: 
            0 4px 20px rgba(255, 7, 58, 0.3),
            0 0 20px rgba(255, 7, 58, 0.2);
        }

        .input-field {
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.08);
          transition: all 0.2s ease;
        }

        .input-field:focus-within {
          border-color: var(--neon-cyan);
          box-shadow: 
            0 0 0 3px rgba(0, 240, 255, 0.1),
            inset 0 0 20px rgba(0, 240, 255, 0.05);
        }

        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

        .safe-bottom {
          padding-bottom: max(env(safe-area-inset-bottom), 24px);
        }

        /* MOBILE OPTIMIZATIONS - Everything made more compact */
        @media (max-width: 768px) {
          /* Main container spacing */
          .hero-content .mx-auto {
            padding-left: 12px !important;
            padding-right: 12px !important;
          }
          
          /* Hero Section - Made more compact */
          .hero-content section {
            padding-top: 1rem !important;
            margin-bottom: 1.5rem !important;
          }
          
          /* Main title - Smaller font */
          .hero-content h1 {
            font-size: 2rem !important;
            line-height: 1.2 !important;
            margin-bottom: 0.5rem !important;
          }
          
          /* Subtitle - Smaller */
          .hero-content .subtitle p {
            font-size: 0.75rem !important;
            padding: 0.25rem 0.5rem !important;
          }
          
          /* Stats grid - Hide completely on mobile */
          .stat-card {
            display: none !important;
          }
          
          /* CTA Buttons - Smaller */
          .hero-content .cta-buttons button {
            padding: 0.75rem 1rem !important;
            font-size: 0.875rem !important;
            border-radius: 0.75rem !important;
            margin: 0.25rem !important;
          }
          
          /* Search & Filters section - More compact */
          .filters-compact {
            padding: 0.75rem !important;
            margin-bottom: 1rem !important;
            border-radius: 1rem !important;
          }
          
          /* Search input - Smaller */
          .input-field {
            height: 2.5rem !important;
            padding: 0.5rem 2.5rem !important;
            font-size: 0.875rem !important;
            margin-bottom: 0.75rem !important;
          }
          
          /* Search icon position */
          .search-icon-mobile {
            left: 0.75rem !important;
          }
          
          /* Filter header - Smaller */
          .filters-compact h2 {
            font-size: 1rem !important;
            margin: 0 !important;
          }
          
          .filters-compact .space-y-6 {
            gap: 0.5rem !important;
          }
          
          /* Sort buttons - More compact */
          .compact-sort-btn {
            padding: 0.375rem 0.75rem !important;
            font-size: 0.75rem !important;
            height: 2rem !important;
            margin: 0.125rem !important;
          }
          
          /* Results section header - Smaller */
          .results-header h2 {
            font-size: 1.25rem !important;
            margin-bottom: 0.25rem !important;
          }
          
          .results-header p {
            font-size: 0.875rem !important;
          }
          
          /* Café cards - Reduce padding */
          .cafe-card {
            padding: 0.75rem !important;
            margin-bottom: 0.75rem !important;
            border-radius: 0.75rem !important;
          }
          
          /* Empty state - More compact */
          .empty-state {
            padding: 1.5rem !important;
          }
          
          .empty-state h3 {
            font-size: 1.25rem !important;
          }
          
          .empty-state p {
            font-size: 0.875rem !important;
            margin-bottom: 1rem !important;
          }
          
          /* Mobile filter sheet - More compact */
          .mobile-filter-sheet .px-6 {
            padding-left: 1rem !important;
            padding-right: 1rem !important;
          }
          
          .mobile-filter-sheet .py-4 {
            padding-top: 0.75rem !important;
            padding-bottom: 0.75rem !important;
          }
          
          .mobile-filter-sheet h3 {
            font-size: 1.125rem !important;
          }
          
          .mobile-filter-sheet h4 {
            font-size: 0.875rem !important;
          }
          
          /* Filter buttons in sheet - Smaller */
          .mobile-filter-sheet button {
            padding: 0.75rem !important;
            font-size: 0.875rem !important;
          }
          
          /* Action buttons in sheet - Smaller */
          .mobile-filter-sheet .action-buttons button {
            padding: 0.75rem !important;
            font-size: 0.875rem !important;
          }
        }
        
        /* Tablet optimizations */
        @media (min-width: 769px) and (max-width: 1024px) {
          /* Medium compact size for tablets */
          .hero-content h1 {
            font-size: 3rem !important;
          }
          
          .input-field {
            height: 3rem !important;
          }
          
          .btn-glow, .btn-ghost {
            padding: 0.875rem 1.5rem !important;
            font-size: 0.875rem !important;
          }
        }

        .overlay-bg {
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .stat-card {
          background: linear-gradient(135deg, 
            rgba(255, 7, 58, 0.1) 0%,
            rgba(0, 240, 255, 0.1) 100%);
          border: 1px solid rgba(255, 7, 58, 0.2);
          position: relative;
          overflow: hidden;
        }

        .stat-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, 
            rgba(255, 7, 58, 0.1) 0%,
            transparent 50%,
            rgba(0, 240, 255, 0.1) 100%);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .stat-card:hover::before {
          opacity: 1;
        }

        .tournament-pattern {
          background-image: 
            radial-gradient(circle at 25% 25%, rgba(255, 7, 58, 0.1) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
            repeating-linear-gradient(
              45deg,
              transparent,
              transparent 2px,
              rgba(255, 255, 255, 0.02) 2px,
              rgba(255, 255, 255, 0.02) 4px
            );
        }

        .esports-pattern {
          background: 
            linear-gradient(45deg, transparent 48%, rgba(255, 7, 58, 0.1) 50%, transparent 52%),
            linear-gradient(-45deg, transparent 48%, rgba(0, 240, 255, 0.1) 50%, transparent 52%);
          background-size: 40px 40px;
        }

        .hero-content {
          position: relative;
          z-index: 2;
        }
      `}</style>

      <main className="min-h-screen bg-main text-white relative">
        {/* Background Patterns */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-slate-950/80 z-10" />
          <div className="absolute inset-0 cyber-grid z-[11] opacity-50" />
          <div className="absolute inset-0 circuit-pattern z-[12] opacity-60" />
          <div className="absolute inset-0 tournament-pattern z-[13]" />
        </div>

        {/* Tournament Stage Effect */}
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#08080c] via-transparent to-transparent z-20"></div>

        <div className="hero-content">
          {/* Active Session Timer (Prototype) */}
          <div className="pt-24 lg:pt-28">
            <ActiveSessionTimer />
          </div>

          <div className="mx-auto max-w-7xl px-4 pb-12 lg:px-8 relative z-30">

            {/* ===== HERO SECTION ===== */}
            <section className={`pt-6 lg:pt-16 mb-6 lg:mb-16 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
              <div className="text-center relative">
                {/* Main Title */}
                <div className="relative inline-block mb-2">
                  <div className="absolute -inset-4 bg-gradient-to-r from-[#ff073a] via-[#00f0ff] to-[#ff073a] blur-2xl opacity-10 rounded-full"></div>

                  {/* Championship Badge */}
                  <div className="hidden md:flex absolute -top-6 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ff073a] to-[#ff3366] shadow-lg">
                      <Trophy className="w-3 h-3 text-white" />
                      <span className="text-xs font-bold uppercase tracking-wider">Gaming Café Booking</span>
                    </div>
                  </div>

                  <h1
                    className="relative text-3xl md:text-6xl lg:text-7xl font-black tracking-tight leading-tight"
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#910320] via-white to-[#ffffff] glow-red">
                      BOOK
                    </span>
                    <span className="text-white">MY</span>
                    <span className="text-white">GAME</span>
                  </h1>

                  {/* Subtitle */}
                  <div className="mt-2 relative subtitle">
                    <p className="relative text-xs md:text-base text-white px-2 py-1 inline-block">
                      Book your gaming seat instantly at nearby cafes!
                    </p>
                  </div>
                </div>


                {/* Tournament Stats Grid - Hidden on mobile */}
                <div className="hidden md:grid grid-cols-2 lg:grid-cols-4 gap-3 max-w-3xl mx-auto mb-6">
                  <div className="stat-card rounded-xl p-3 text-center border border-[#ff073a]/30">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Trophy className="w-4 h-4 text-[#ff073a]" />
                      <div
                        className="text-xl md:text-3xl font-bold text-white"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        {safeCafes.length}+
                      </div>
                    </div>
                    <div
                      className="text-xs text-zinc-300 uppercase tracking-wider"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Cafes
                    </div>
                  </div>

                  <div className="stat-card rounded-xl p-3 text-center border border-[#00f0ff]/30">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Clock className="w-4 h-4 text-[#00f0ff]" />
                      <div
                        className="text-xl md:text-3xl font-bold text-white"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        24/7
                      </div>
                    </div>
                    <div
                      className="text-xs text-zinc-300 uppercase tracking-wider"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Open
                    </div>
                  </div>

                  <div className="stat-card rounded-xl p-3 text-center border border-[#ff073a]/30">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-[#ff073a]" />
                      <div
                        className="text-xl md:text-3xl font-bold text-white"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        50K+
                      </div>
                    </div>
                    <div
                      className="text-xs text-zinc-300 uppercase tracking-wider"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Gamers
                    </div>
                  </div>

                  <div className="stat-card rounded-xl p-3 text-center border border-[#00f0ff]/30">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Award className="w-4 h-4 text-[#00f0ff]" />
                      <div
                        className="text-xl md:text-3xl font-bold text-white"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        10+
                      </div>
                    </div>
                    <div
                      className="text-xs text-zinc-300 uppercase tracking-wider"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Achivment
                    </div>
                  </div>
                </div>

                {/* Tabs Navigation */}
                <div className="flex flex-col items-center gap-2 mb-4">
                  {/* Book Now - Top Row */}
                  <button
                    onClick={() => {
                      setActiveTab("book");
                      handleScrollToList();
                    }}
                    className={`px-6 py-3 rounded-xl text-sm md:text-lg font-bold tracking-wide uppercase flex items-center gap-2 group transition-all ${activeTab === "book"
                      ? 'btn-glow'
                      : 'btn-ghost'
                      }`}
                    style={{ fontFamily: 'Orbitron, sans-serif' }}
                  >
                    <Zap className="w-4 h-4 md:w-5 md:h-5 group-hover:scale-125 transition-transform" />
                    <span>Book Now</span>
                  </button>

                  {/* Membership & Tournaments - Bottom Row */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setActiveTab("membership");
                        handleScrollToList();
                      }}
                      className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === "membership"
                        ? 'btn-glow'
                        : 'btn-ghost'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <Trophy className={`w-4 h-4 ${activeTab === "membership" ? 'text-white' : 'text-zinc-400'}`} />
                      <span>Membership</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab("tournaments");
                        handleScrollToList();
                      }}
                      className={`px-4 py-3 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all ${activeTab === "tournaments"
                        ? 'btn-glow'
                        : 'btn-ghost'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <Award className={`w-4 h-4 ${activeTab === "tournaments" ? 'text-white' : 'text-zinc-400'}`} />
                      <span>Tournaments</span>
                    </button>
                  </div>
                </div>


              </div>
            </section>

            {/* ===== SEARCH & FILTERS (Only for Book Now tab) ===== */}
            {activeTab === "book" && (
              <section
                ref={listRef}
                className={`sticky top-16 z-30 mb-3 sm:mb-4 lg:mb-12 bg-[#08080c]/95 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/5 p-2.5 sm:p-4 shadow-xl filters-compact ${mounted ? 'animate-fade-in' : 'opacity-0'
                  }`}
                style={{ animationDelay: '0.1s' }}
              >
                {/* Search Bar */}
                <div className="relative mb-2.5 sm:mb-4 h-10 sm:h-12">
                  <div className="absolute inset-0 flex items-center pointer-events-none pl-3">
                    <Search className="w-4 h-4 text-zinc-500" />
                  </div>
                  <input
                    id="cafe-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search cafes..."
                    className="input-field w-full h-full pl-10 pr-10 rounded-lg sm:rounded-xl text-xs sm:text-sm placeholder:text-zinc-600 focus:outline-none"
                    style={{ fontFamily: 'Inter, sans-serif' }}
                  />
                  {query && (
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <button
                        onClick={() => setQuery("")}
                        className="hover:bg-white/5 rounded-lg transition-colors p-1"
                      >
                        <X className="w-4 h-4 text-zinc-500" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Filters Section */}
                <div className="space-y-2 sm:space-y-4">
                  {/* Filter Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#ff073a]" />
                      <h2
                        className="text-sm sm:text-lg font-bold"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        Find Your Cafes
                      </h2>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <button
                        onClick={() => setShowFilters(true)}
                        className="md:hidden relative p-1.5 sm:p-2 rounded-lg btn-ghost"
                      >
                        <Filter className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        {activeFiltersCount > 0 && (
                          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 bg-[#ff073a] text-white text-[10px] sm:text-xs font-bold rounded-full flex items-center justify-center">
                            {activeFiltersCount}
                          </span>
                        )}
                      </button>

                      <select
                        id="sort-by"
                        name="sort-by"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as SortKey)}
                        className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-medium appearance-none cursor-pointer"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <option value="relevance">Tournament Ready</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                      </select>

                      {activeFiltersCount > 0 && (
                        <button
                          onClick={clearAllFilters}
                          className="text-[10px] sm:text-xs font-medium text-[#ff073a] hover:text-[#ff073a]/80 transition-colors"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Grid */}
                  <div className="hidden md:grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
                    {filterButtons.map((filter) => (
                      <button
                        key={filter.key}
                        onClick={filter.toggle}
                        className={`flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${filter.active
                          ? 'chip-active text-white'
                          : 'chip text-zinc-400 hover:text-white'
                          }`}
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <div className={`p-1.5 rounded ${filter.active
                          ? 'bg-white/20'
                          : 'bg-white/5'
                          }`}>
                          {filter.icon}
                        </div>
                        <span className="text-sm font-semibold">{filter.label}</span>
                        {filter.active && (
                          <Check className="w-3 h-3 ml-1" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Sort Options (Mobile) */}
                  <div className="md:hidden flex gap-1.5 overflow-x-auto hide-scrollbar py-0.5">
                    <button
                      onClick={() => setSortBy("relevance")}
                      className={`shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all ${sortBy === "relevance"
                        ? 'bg-[#ff073a] text-white'
                        : 'bg-white/5 text-zinc-400'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Tournament
                    </button>
                    <button
                      onClick={() => setSortBy("price_asc")}
                      className={`shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${sortBy === "price_asc"
                        ? 'bg-[#00f0ff] text-black'
                        : 'bg-white/5 text-zinc-400'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <TrendingUp className="w-2.5 h-2.5" />
                      Price Low
                    </button>
                    <button
                      onClick={() => setSortBy("price_desc")}
                      className={`shrink-0 px-2.5 py-1.5 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all ${sortBy === "price_desc"
                        ? 'bg-[#00f0ff] text-black'
                        : 'bg-white/5 text-zinc-400'
                        }`}
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      <TrendingDown className="w-2.5 h-2.5" />
                      Price High
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* ===== CONTENT SECTION ===== */}
            <section
              ref={activeTab !== "book" ? listRef : undefined}
              className={`${mounted ? 'animate-fade-in' : 'opacity-0'}`}
              style={{ animationDelay: '0.15s' }}
            >
              {/* Book Now Tab Content */}
              {activeTab === "book" && (
                <>
                  {/* Results Header */}
                  <div className="flex items-center justify-between mb-4 results-header">
                    <div>
                      <h2
                        className="text-xl font-bold text-white mb-1"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        {query || activeFiltersCount > 0 ? 'Filtered Cafes' : 'All Gaming Cafes'}
                      </h2>
                      <p
                        className="text-zinc-400"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {filteredCafes.length} venue{filteredCafes.length !== 1 ? 's' : ''} found
                      </p>
                    </div>

                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearAllFilters}
                        className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        <X className="w-3 h-3" />
                        <span className="text-sm">Clear Filters</span>
                      </button>
                    )}
                  </div>

                  {/* Café List or Empty State */}
                  {filteredCafes.length > 0 ? (
                    <CafeList cafes={filteredCafes} />
                  ) : (
                    <div className="card-glass rounded-2xl p-6 text-center empty-state">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#ff073a]/10 to-[#00f0ff]/10 flex items-center justify-center">
                        <Frown className="w-8 h-8 text-zinc-600" />
                      </div>
                      <h3
                        className="text-xl font-bold text-white mb-2"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        No Venues Found
                      </h3>
                      <p
                        className="text-zinc-400 mb-6 max-w-md mx-auto"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        Try adjusting your filters or search terms.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-3 justify-center">
                        <button
                          onClick={clearAllFilters}
                          className="btn-glow px-6 py-2.5 rounded-lg text-sm font-bold"
                          style={{ fontFamily: 'Orbitron, sans-serif' }}
                        >
                          Clear All Filters
                        </button>
                        <button
                          onClick={() => setQuery("")}
                          className="btn-ghost px-6 py-2.5 rounded-lg text-sm font-semibold"
                          style={{ fontFamily: 'Inter, sans-serif' }}
                        >
                          Clear Search
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === "membership" && (
                <MembershipPreviewSection
                  memberships={featuredMemberships}
                  loading={membershipLoading}
                  error={membershipError}
                  onOpenMembershipPage={() => router.push("/membership")}
                />
              )}

              {/* Membership Tab Content */}
              {false && activeTab === "membership" && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2
                      className="text-3xl md:text-4xl font-bold text-white mb-3"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff073a] to-[#00f0ff]">
                        Premium Memberships
                      </span>
                    </h2>
                    <p
                      className="text-zinc-400 text-lg"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Unlimited gaming at exclusive cafes
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Demo Membership Cards */}
                    {[
                      {
                        cafeName: "GameZone Pro",
                        image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600",
                        price: 3000,
                        duration: "3 months",
                        features: ["Unlimited Gaming", "Priority Booking", "Free Drinks", "Tournament Access"]
                      },
                      {
                        cafeName: "Elite Gaming Arena",
                        image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600",
                        price: 5000,
                        duration: "6 months",
                        features: ["Unlimited Gaming", "VIP Lounge", "Free Snacks", "Exclusive Events"]
                      },
                      {
                        cafeName: "Pro Gamer Hub",
                        image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600",
                        price: 2000,
                        duration: "2 months",
                        features: ["Unlimited Gaming", "Weekend Priority", "Discount on Food", "Friends Bonus"]
                      }
                    ].map((membership, idx) => (
                      <div
                        key={idx}
                        className="card-glass rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-300"
                      >
                        {/* Image */}
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={membership.image}
                            alt={membership.cafeName}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-transparent to-transparent" />
                          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#ff073a] to-[#ff3366] text-white text-xs font-bold">
                            {membership.duration}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                          <h3
                            className="text-xl font-bold text-white mb-2"
                            style={{ fontFamily: 'Orbitron, sans-serif' }}
                          >
                            {membership.cafeName}
                          </h3>

                          <div className="flex items-baseline gap-2 mb-4">
                            <span
                              className="text-3xl font-bold text-[#00f0ff]"
                              style={{ fontFamily: 'Orbitron, sans-serif' }}
                            >
                              ₹{membership.price}
                            </span>
                            <span className="text-zinc-400 text-sm">
                              for {membership.duration}
                            </span>
                          </div>

                          <div className="space-y-2 mb-6">
                            {membership.features.map((feature, i) => (
                              <div key={i} className="flex items-center gap-2 text-zinc-300">
                                <Check className="w-4 h-4 text-[#00f0ff]" />
                                <span className="text-sm">{feature}</span>
                              </div>
                            ))}
                          </div>

                          <button
                            className="w-full btn-glow py-3 rounded-xl font-bold"
                            style={{ fontFamily: 'Orbitron, sans-serif' }}
                          >
                            Buy Membership
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "tournaments" && (
                <TournamentPreviewSection
                  tournaments={featuredTournaments}
                  loading={tournamentsLoading}
                  error={tournamentsError}
                  onOpenTournamentsPage={() => router.push("/tournaments")}
                />
              )}

              {/* Tournaments Tab Content */}
              {false && activeTab === "tournaments" && (
                <div className="space-y-6">
                  <div className="text-center mb-8">
                    <h2
                      className="text-3xl md:text-4xl font-bold text-white mb-3"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff073a] to-[#00f0ff]">
                        Upcoming Tournaments
                      </span>
                    </h2>
                    <p
                      className="text-zinc-400 text-lg"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Compete with the best and win amazing prizes
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Demo Tournament Cards */}
                    {[
                      {
                        name: "BGMI Championship",
                        image: "https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600",
                        date: "Jan 15, 2026",
                        prize: "₹50,000",
                        participants: "256",
                        game: "BGMI"
                      },
                      {
                        name: "FIFA Pro League",
                        image: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=600",
                        date: "Jan 20, 2026",
                        prize: "₹30,000",
                        participants: "128",
                        game: "FIFA 24"
                      },
                      {
                        name: "Valorant Masters",
                        image: "https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=600",
                        date: "Jan 25, 2026",
                        prize: "₹75,000",
                        participants: "64",
                        game: "Valorant"
                      }
                    ].map((tournament, idx) => (
                      <div
                        key={idx}
                        className="card-glass rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-300"
                      >
                        {/* Image */}
                        <div className="relative h-48 overflow-hidden">
                          <img
                            src={tournament.image}
                            alt={tournament.name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#101016] via-transparent to-transparent" />
                          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-gradient-to-r from-[#00f0ff] to-[#00d4e6] text-black text-xs font-bold">
                            {tournament.game}
                          </div>
                        </div>

                        {/* Content */}
                        <div className="p-6">
                          <h3
                            className="text-xl font-bold text-white mb-3"
                            style={{ fontFamily: 'Orbitron, sans-serif' }}
                          >
                            {tournament.name}
                          </h3>

                          <div className="space-y-2 mb-4">
                            <div className="flex items-center gap-2 text-zinc-300">
                              <Clock className="w-4 h-4 text-[#00f0ff]" />
                              <span className="text-sm">{tournament.date}</span>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-300">
                              <Trophy className="w-4 h-4 text-[#ff073a]" />
                              <span className="text-sm">Prize Pool: {tournament.prize}</span>
                            </div>
                            <div className="flex items-center gap-2 text-zinc-300">
                              <Users className="w-4 h-4 text-[#00f0ff]" />
                              <span className="text-sm">{tournament.participants} Players</span>
                            </div>
                          </div>

                          <button
                            className="w-full btn-glow py-3 rounded-xl font-bold"
                            style={{ fontFamily: 'Orbitron, sans-serif' }}
                          >
                            Register Now
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* ===== MOBILE FILTER SHEET ===== */}
            {showFilters && (
              <div
                className="fixed inset-0 z-50 mobile-filter-sheet"
                onClick={() => setShowFilters(false)}
              >
                {/* Overlay */}
                <div className="overlay-bg absolute inset-0 animate-fade-in" style={{ animationDuration: '0.2s' }} />

                {/* Sheet */}
                <div
                  className="absolute bottom-0 left-0 right-0 bg-[#101016] rounded-t-[28px] border-t border-white/10 animate-slide-up safe-bottom shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Handle bar */}
                  <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-white/20" />
                  </div>

                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                    <div>
                      <h3
                        className="text-lg font-bold"
                        style={{ fontFamily: 'Orbitron, sans-serif' }}
                      >
                        Filters
                      </h3>
                      <p
                        className="text-xs text-zinc-400"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        {activeFiltersCount} filter{activeFiltersCount !== 1 ? 's' : ''} active
                      </p>
                    </div>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      aria-label="Close filters"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Content */}
                  <div className="px-4 py-3 max-h-[60vh] overflow-y-auto">
                    {/* Equipment Filters */}
                    <div className="mb-4">
                      <h4
                        className="text-xs font-semibold text-zinc-300 mb-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        EQUIPMENT
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        {filterButtons.map((filter) => (
                          <button
                            key={filter.key}
                            onClick={filter.toggle}
                            className={`flex items-center gap-2 p-3 rounded-lg transition-all ${filter.active
                              ? 'bg-gradient-to-r from-[#ff073a] to-[#ff073a]/80 text-white'
                              : 'bg-white/5 text-zinc-400 border border-white/10'
                              }`}
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            <div className={`p-1.5 rounded ${filter.active
                              ? 'bg-white/20'
                              : 'bg-white/5'
                              }`}>
                              {filter.icon}
                            </div>
                            <span className="text-sm font-semibold">{filter.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Sort Options */}
                    <div className="pt-3 border-t border-white/10">
                      <h4
                        className="text-xs font-semibold text-zinc-300 mb-2"
                        style={{ fontFamily: 'Inter, sans-serif' }}
                      >
                        SORT BY
                      </h4>
                      <div className="space-y-1">
                        {[
                          { value: 'relevance', label: 'Tournament Ready', icon: <Trophy className="w-3 h-3" /> },
                          { value: 'price_asc', label: 'Price: Low to High', icon: <TrendingUp className="w-3 h-3" /> },
                          { value: 'price_desc', label: 'Price: High to Low', icon: <TrendingDown className="w-3 h-3" /> },
                        ].map((option) => (
                          <button
                            key={option.value}
                            onClick={() => setSortBy(option.value as SortKey)}
                            className={`flex items-center justify-between w-full p-3 rounded-lg transition-all ${sortBy === option.value
                              ? 'bg-gradient-to-r from-[#00f0ff] to-[#00f0ff]/80 text-black'
                              : 'bg-white/5 text-zinc-400 hover:bg-white/10'
                              }`}
                            style={{ fontFamily: 'Inter, sans-serif' }}
                          >
                            <div className="flex items-center gap-2">
                              {option.icon}
                              <span className="text-sm">{option.label}</span>
                            </div>
                            {sortBy === option.value && (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-2 px-4 py-3 border-t border-white/10 action-buttons">
                    <button
                      onClick={() => {
                        clearAllFilters();
                        setShowFilters(false);
                      }}
                      className="flex-1 py-3 rounded-lg text-sm font-semibold bg-white/5 hover:bg-white/10 transition-colors"
                      style={{ fontFamily: 'Inter, sans-serif' }}
                    >
                      Reset All
                    </button>
                    <button
                      onClick={() => setShowFilters(false)}
                      className="flex-[2] py-3 rounded-lg text-sm font-bold btn-glow"
                      style={{ fontFamily: 'Orbitron, sans-serif' }}
                    >
                      Show {filteredCafes.length} Venues
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <PWAInstaller />
    </>
  );
}

function MembershipPreviewSection({
  memberships,
  loading,
  error,
  onOpenMembershipPage,
}: {
  memberships: MembershipTierPreview[];
  loading: boolean;
  error: string | null;
  onOpenMembershipPage: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-3xl md:text-4xl font-bold text-white mb-3"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff073a] to-[#00f0ff]">
              Premium Memberships
            </span>
          </h2>
          <p
            className="text-zinc-400 text-lg"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Live plans pulled from the membership catalog.
          </p>
        </div>

        <button
          onClick={onOpenMembershipPage}
          className="btn-ghost self-start px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          <span>See all plans</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Loading membership plans...
          </p>
        </div>
      ) : error ? (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400 mb-4"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {error}
          </p>
          <button
            onClick={onOpenMembershipPage}
            className="btn-glow px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            Open Membership Page
          </button>
        </div>
      ) : memberships.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {memberships.map((membership) => (
            <div
              key={membership.id}
              className="card-glass rounded-2xl p-6 flex flex-col gap-4 group hover:scale-[1.02] transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(0,240,255,0.2) 0%, rgba(255,255,255,0.05) 100%)",
                    }}
                  >
                    {membership.planType === "day_pass" ? "🎟️" : "⏱️"}
                  </div>
                  <div>
                    <h3
                      className="text-xl font-bold text-white"
                      style={{ fontFamily: "Orbitron, sans-serif" }}
                    >
                      {membership.name}
                    </h3>
                    <p
                      className="text-sm text-zinc-400"
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      {membership.cafeName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-baseline gap-2">
                <span
                  className="text-3xl font-bold text-[#00f0ff]"
                  style={{ fontFamily: "Orbitron, sans-serif" }}
                >
                  ₹{membership.price.toLocaleString("en-IN")}
                </span>
              </div>

              <div className="space-y-2 flex-1">
                {/* Built from the plan's own fields rather than a features list,
                    which the real plans do not have. */}
                {(membership.planType === "day_pass"
                  ? ["Unlimited play for the day", "Any available station"]
                  : [
                      `${membership.hours} hours of play`,
                      `Use within ${membership.validityDays} days`,
                    ]
                ).map((feature) => (
                  <div key={feature} className="flex items-center gap-2 text-zinc-300">
                    <Check className="w-4 h-4 text-[#00f0ff]" />
                    <span
                      className="text-sm"
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      {feature}
                    </span>
                  </div>
                ))}
                {membership.description && (
                  <p
                    className="text-xs text-zinc-500 pt-1"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {membership.description}
                  </p>
                )}
              </div>

              <button
                onClick={onOpenMembershipPage}
                className="w-full btn-glow py-3 rounded-xl font-bold"
                style={{ fontFamily: "Orbitron, sans-serif" }}
              >
                Explore Memberships
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400 mb-4"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            No membership plans are live yet.
          </p>
          <button
            onClick={onOpenMembershipPage}
            className="btn-glow px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            Check Membership Hub
          </button>
        </div>
      )}
    </div>
  );
}

function TournamentPreviewSection({
  tournaments,
  loading,
  error,
  onOpenTournamentsPage,
}: {
  tournaments: TournamentPreview[];
  loading: boolean;
  error: string | null;
  onOpenTournamentsPage: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2
            className="text-3xl md:text-4xl font-bold text-white mb-3"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff073a] to-[#00f0ff]">
              Upcoming Tournaments
            </span>
          </h2>
          <p
            className="text-zinc-400 text-lg"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Real upcoming events from the tournament schedule.
          </p>
        </div>

        <button
          onClick={onOpenTournamentsPage}
          className="btn-ghost self-start px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{ fontFamily: "Inter, sans-serif" }}
        >
          <span>See all tournaments</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Loading tournaments...
          </p>
        </div>
      ) : error ? (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400 mb-4"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            {error}
          </p>
          <button
            onClick={onOpenTournamentsPage}
            className="btn-glow px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            Open Tournament Page
          </button>
        </div>
      ) : tournaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tournaments.map((tournament) => (
            <div
              key={tournament.id}
              className="card-glass rounded-2xl p-6 flex flex-col gap-4 group hover:scale-[1.02] transition-all duration-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl"
                    style={{
                      background: `linear-gradient(135deg, ${tournament.color || "#00f0ff"}33 0%, rgba(255,255,255,0.05) 100%)`,
                    }}
                  >
                    {tournament.icon || "T"}
                  </div>
                  <div>
                    <h3
                      className="text-xl font-bold text-white"
                      style={{ fontFamily: "Orbitron, sans-serif" }}
                    >
                      {tournament.name}
                    </h3>
                    <p
                      className="text-sm text-zinc-400"
                      style={{ fontFamily: "Inter, sans-serif" }}
                    >
                      {tournament.game}
                    </p>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-bold bg-white/10 text-[#00f0ff] uppercase">
                  {tournament.status || "upcoming"}
                </span>
              </div>

              <div className="space-y-2 text-zinc-300">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#00f0ff]" />
                  <span
                    className="text-sm"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {formatTournamentDate(tournament.tournament_date)}
                    {tournament.tournament_time ? ` at ${tournament.tournament_time}` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-[#ff073a]" />
                  <span
                    className="text-sm"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    Prize Pool: {tournament.prize_currency || "INR "}{formatCompactNumber(tournament.prize_amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#00f0ff]" />
                  <span
                    className="text-sm"
                    style={{ fontFamily: "Inter, sans-serif" }}
                  >
                    {tournament.current_participants || 0}/{tournament.max_participants || 0} registered
                  </span>
                </div>
              </div>

              <div
                className="text-sm text-zinc-400 flex-1"
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {tournament.location || "Location to be announced"}
              </div>

              <button
                onClick={onOpenTournamentsPage}
                className="w-full btn-glow py-3 rounded-xl font-bold"
                style={{ fontFamily: "Orbitron, sans-serif" }}
              >
                View Tournament Hub
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-glass rounded-2xl p-6 text-center">
          <p
            className="text-zinc-400 mb-4"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            No upcoming tournaments are live yet.
          </p>
          <button
            onClick={onOpenTournamentsPage}
            className="btn-glow px-5 py-2.5 rounded-xl text-sm font-bold"
            style={{ fontFamily: "Orbitron, sans-serif" }}
          >
            Check Tournament Hub
          </button>
        </div>
      )}
    </div>
  );
}

function formatTournamentDate(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "Date TBA";
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatCompactNumber(value?: number | null) {
  if (!value) {
    return "0";
  }

  return new Intl.NumberFormat("en-IN").format(value);
}
