"use client";

import { usePathname, useRouter } from "next/navigation";
import { Home, CalendarCheck, ScanLine, Sparkles, User } from "lucide-react";

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
  { href: "/scan", label: "Scan", icon: ScanLine },
  { href: "/rewards", label: "Points", icon: Sparkles },
  { href: "/profile", label: "Profile", icon: User },
] as const;

/**
 * Scan took the slot Events used to have, and tournaments moved to the home
 * page.
 *
 * Not because tournaments matter less, but because of when each is wanted.
 * Scanning happens standing at a machine, wanting to sit down, and anything
 * beyond one tap there sends the customer to the counter instead. Events is
 * something people browse when they have a minute, which is exactly the
 * situation where an extra tap costs nothing.
 *
 * It is the middle slot deliberately: the easiest place on the bar to hit with
 * a thumb, on the one action that is done in a hurry.
 */

/**
 * Routes that own the whole screen. A tab bar over a checkout or a booking
 * flow invites someone to wander off mid-payment, and the booking pages
 * already have their own bottom bar which this would sit on top of.
 */
const HIDDEN_ON = [
  "/checkout",
  // The scanner is a fullscreen camera. A tab bar across the bottom of it both
  // covers the picture and offers a way out of a screen that already has one.
  "/scan",
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
          background: "rgba(11,11,12,0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderTop: "1px solid rgba(242,240,234,0.12)",
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
                color: active ? "#d8ff3c" : "rgba(242,240,234,0.45)",
                cursor: "pointer",
                // Stops the grey flash Android draws over a tapped element.
                WebkitTapHighlightColor: "transparent",
                transition: "color 160ms ease",
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span
                className="font-mono"
                style={{
                  fontSize: 9,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                }}
              >
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
