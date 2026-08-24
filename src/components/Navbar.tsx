// src/components/Navbar.tsx
"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/hooks/useUser";

/**
 * The site header, in the BookMyGame Site design.
 *
 * Lime on near-black, Archivo for names and IBM Plex Mono for anything that
 * behaves like a reading off an instrument — the same identity the café PCs
 * now run, so a customer meets one product rather than two.
 *
 * Everything it shows is real. The wallet chip carries the balance from the
 * customer's own ledger and is simply absent when they have none; the account
 * menu's right-hand figures are left to the pages behind them rather than
 * invented here, because a number on a menu that disagrees with the page it
 * opens is worse than no number.
 */
export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isLoginPage = pathname === "/login";
  const isOwnerPage = pathname?.startsWith("/owner");
  const isAdminPage = pathname?.startsWith("/admin");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setUserRole(null);
        setWalletBalance(null);
        return;
      }

      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!cancelled) setUserRole(profile?.role?.toLowerCase() || null);
      } catch (err) {
        console.error("Error fetching user role:", err);
      }

      // The balance is the sum across cafés, which is what the chip means: money
      // this person can spend on BookMyGame, wherever they spend it.
      try {
        const res = await fetch("/api/wallet/mine", { credentials: "include" });
        if (!res.ok) return;

        const data = await res.json();
        const total = (data?.cafes ?? []).reduce(
          (sum: number, entry: { balance?: number }) => sum + (Number(entry.balance) || 0),
          0
        );

        if (!cancelled) setWalletBalance(total);
      } catch {
        // A header is not worth an error message. No balance means no chip.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("[Navbar] logout error:", err);
    } finally {
      setMenuOpen(false);
      router.push("/login");
    }
  };

  // Renders nothing on these routes — but only after every hook above has run.
  //
  // This return used to sit before those effects. React identifies hooks by
  // call order, so navigating from a normal page to /owner rendered this
  // component with fewer hooks than the render before it. That is not a lint
  // preference; it is the condition React throws on.
  if (isOwnerPage || isAdminPage) {
    return null;
  }

  const links = [
    { href: "/", label: "CAFES", match: (path: string) => path === "/" },
    { href: "/tournaments", label: "TOURNAMENTS", match: (path: string) => path.startsWith("/tournaments") },
    { href: "/membership", label: "MEMBERSHIP", match: (path: string) => path.startsWith("/membership") },
    { href: "/wallet", label: "WALLET", match: (path: string) => path.startsWith("/wallet") },
  ];

  const menu = [
    { label: "My Bookings", note: "Upcoming reservations", href: "/dashboard" },
    { label: "My Membership", note: "Hours left on your plan", href: "/membership" },
    { label: "My Wallet", note: "Balance across cafés", href: "/wallet" },
    { label: "My Points", note: "Rewards earned", href: "/rewards" },
    { label: "Tournaments", note: "Compete and win prizes", href: "/tournaments" },
    { label: "Profile Settings", note: "Account and payments", href: "/profile" },
  ];

  return (
    <header className="sticky top-0 z-50 flex h-[76px] items-center gap-4 border-b border-[#f2f0ea]/[0.12] bg-[#0b0b0c]/90 px-5 backdrop-blur-[14px] sm:gap-8 sm:px-8 lg:px-12">
      <Link href="/" className="flex shrink-0 items-center gap-2.5">
        <span className="block h-3.5 w-3.5 bg-[#d8ff3c]" />
        <span className="font-display text-[19px] font-black tracking-[-0.01em] text-[#f2f0ea]">
          BOOKMYGAME
        </span>
      </Link>

      <nav className="hidden min-w-0 flex-initial gap-4 overflow-hidden font-mono text-[13px] tracking-[0.14em] text-[#f2f0ea]/55 md:flex lg:gap-7">
        {links.map((link) => {
          const active = link.match(pathname || "");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                active
                  ? "whitespace-nowrap border-b-2 border-[#d8ff3c] pb-[3px] text-[#f2f0ea]"
                  : "whitespace-nowrap transition-colors hover:text-[#d8ff3c]"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </nav>

      <span className="min-w-[8px] flex-1" />

      <div className="flex min-w-0 flex-initial items-center gap-3.5 overflow-hidden">
        {walletBalance !== null && (
          <Link
            href="/wallet"
            className="hidden whitespace-nowrap border border-[#f2f0ea]/[0.18] px-4 py-[11px] font-mono text-xs font-semibold tracking-[0.18em] text-[#f2f0ea]/70 transition-colors hover:border-[#d8ff3c] hover:text-[#d8ff3c] sm:block"
          >
            ₹ {walletBalance.toLocaleString("en-IN")}
          </Link>
        )}

        {loading ? (
          <span className="h-12 w-12 animate-pulse bg-[#f2f0ea]/[0.06]" />
        ) : user ? (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-3 border border-[#f2f0ea]/[0.16] p-2 pr-3.5 transition-colors hover:border-[#f2f0ea]/40"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#d8ff3c] font-display text-[13px] font-black text-[#0b0b0c]">
                {initialsFromUser(user)}
              </span>
              <span className="hidden min-w-0 flex-col gap-0.5 overflow-hidden text-left lg:flex">
                <span className="whitespace-nowrap text-[13px] font-bold leading-none text-[#f2f0ea]">
                  {displayName(user)}
                </span>
                <span className="font-mono text-[10px] tracking-[0.16em] text-[#d8ff3c]">
                  {(userRole ? userRole : "player").toUpperCase()}
                </span>
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 top-[calc(100%+18px)] z-[60] w-[340px] border border-[#f2f0ea]/[0.14] bg-[#111113] shadow-[0_40px_80px_rgba(0,0,0,0.7)]">
                <div className="border-b border-[#f2f0ea]/10 px-6 py-5">
                  <div className="text-base font-extrabold text-[#f2f0ea]">{displayName(user)}</div>
                  <div className="mt-1 truncate font-mono text-xs text-[#f2f0ea]/45">{user.email}</div>
                </div>

                {menu.map((item) => (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push(item.href);
                    }}
                    className="group flex w-full items-center justify-between border-b border-[#f2f0ea]/[0.06] px-6 py-4 text-left transition-all hover:bg-[#d8ff3c]/[0.08] hover:pl-7"
                  >
                    <span className="flex flex-col gap-[3px]">
                      <span className="text-sm font-bold text-[#f2f0ea]">{item.label}</span>
                      <span className="font-mono text-[11px] text-[#f2f0ea]/40">{item.note}</span>
                    </span>
                    <span className="font-mono text-xs text-[#d8ff3c] opacity-0 transition-opacity group-hover:opacity-100">
                      →
                    </span>
                  </button>
                ))}

                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full px-6 py-4 text-left font-mono text-xs font-semibold tracking-[0.18em] text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b]/10"
                >
                  LOG OUT
                </button>
              </div>
            )}
          </div>
        ) : (
          !isLoginPage && (
            <Link
              href="/login"
              className="whitespace-nowrap bg-[#d8ff3c] px-5 py-[13px] font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110"
            >
              LOG IN
            </Link>
          )
        )}
      </div>
    </header>
  );
}

type NamedUser = {
  email?: string | null;
  user_metadata?: { full_name?: string | null } | null;
};

function displayName(user: NamedUser) {
  return user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Player";
}

function initialsFromUser(user: NamedUser) {
  const name: string = displayName(user);
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
