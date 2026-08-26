// src/components/AccountTabs.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The strip that sits across the top of every account screen.
 *
 * Five places one person's own things live, always in the same order and
 * always visible from each other — the design's answer to an account section
 * that used to be reachable only through the header menu. The current one is
 * filled lime; the rest are outlines.
 */
const TABS = [
  { href: "/dashboard", label: "BOOKINGS" },
  { href: "/membership", label: "MEMBERSHIPS" },
  { href: "/wallet", label: "WALLET" },
  { href: "/rewards", label: "POINTS" },
  { href: "/profile", label: "SETTINGS" },
];

export default function AccountTabs() {
  const pathname = usePathname() || "";

  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-[#f2f0ea]/[0.12] px-5 py-6 sm:px-8 lg:px-12 2xl:px-16 2xl:py-7">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={
              active
                ? "whitespace-nowrap border border-[#d8ff3c] bg-[#d8ff3c] px-5 py-[11px] font-mono text-[11px] font-semibold tracking-[0.18em] 2xl:px-6 2xl:py-3.5 2xl:text-[13px] text-[#0b0b0c]"
                : "whitespace-nowrap border border-[#f2f0ea]/[0.16] px-5 py-[11px] font-mono text-[11px] font-semibold tracking-[0.18em] 2xl:px-6 2xl:py-3.5 2xl:text-[13px] text-[#f2f0ea]/55 transition-colors hover:border-[#d8ff3c] hover:text-[#f2f0ea]"
            }
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
