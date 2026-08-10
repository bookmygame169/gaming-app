"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, CalendarCheck, Sparkles, Trophy, User } from "lucide-react";
import { colors } from "@/lib/constants";

/**
 * The bottom tab bar, on phones only.
 *
 * Everything except booking lived behind the account menu, so a customer had to
 * open a drawer to reach their bookings, points or tournaments — three taps to
 * something an app puts one thumb-reach away. A phone user's hand is at the
 * bottom of the screen, and a top-right menu is the furthest point from it.
 *
 * Five is the ceiling. A sixth tab makes each one too narrow to hit reliably at
 * 360px, which is the width a lot of Android phones in India actually report.
 */

const TABS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Bookings", icon: CalendarCheck },
  { href: "/rewards", label: "Points", icon: Sparkles },
  { href: "/tournaments", label: "Events", icon: Trophy },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/**
 * Routes that own the whole screen. A tab bar over a checkout or a booking
 * flow invites someone to wander off mid-payment, and the booking pages
 * already have their own bottom bar which this would sit on top of.
 */
const HIDDEN_ON = [
  "/checkout",
  "/login",
  "/onboarding",
  "/offline",
  "/auth",
  "/book",
  "/bookings/success",
];

export default function MobileTabBar() {
  const pathname = usePathname() || "/";
  const router = useRouter();

  // Owner and admin have their own navigation, and self-excluding here is how
  // the Navbar does it too — the root layout renders everything unconditionally.
  if (pathname.startsWith("/owner") || pathname.startsWith("/admin")) {
    return null;
  }

  if (HIDDEN_ON.some((path) => pathname === path || pathname.includes(path))) {
    return null;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <nav
        className="mobile-tab-bar"
        aria-label="Main"
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          // display is left to the stylesheet below. Setting it inline here
          // beat the class rule that hides this on desktop — an inline style
          // outranks a class selector — so the bar sat across the bottom of
          // every laptop window too.
          background: "rgba(10,10,15,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: `1px solid ${colors.border}`,
          // Clears the home indicator on an iPhone. Without it the last row of
          // labels sits under the system gesture bar and cannot be tapped.
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;

          return (
            <button
              key={tab.href}
              type="button"
              onClick={() => router.push(tab.href)}
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                // 56px keeps every tab above the 44px minimum touch target even
                // once the label is included.
                minHeight: 56,
                padding: "8px 2px 6px",
                background: "none",
                border: "none",
                color: active ? colors.cyan : colors.textMuted,
                cursor: "pointer",
                // Stops the grey flash Android draws over a tapped element.
                WebkitTapHighlightColor: "transparent",
                transition: "color 160ms ease",
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span style={{ fontSize: 10, fontWeight: active ? 700 : 500, letterSpacing: 0.2 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      <style jsx global>{`
        .mobile-tab-bar {
          display: none;
        }

        /* Phones only. On a laptop the top navigation is already reachable and
           a bar pinned to the bottom of a tall window just wastes it. */
        @media (max-width: 767px) {
          .mobile-tab-bar {
            display: flex !important;
          }

          /* Room for the bar plus the home indicator, so the last card on a
             page is not permanently half-covered. */
          body {
            padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
          }
        }
      `}</style>
    </>
  );
}
