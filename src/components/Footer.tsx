// src/components/Footer.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The site footer, in the BookMyGame Site design: one slim mono rule at the
 * bottom of the page rather than the four-column block that was here before.
 *
 * The design draws it on every screen, and it now appears on every screen —
 * except the ones that are not really web pages. /play and /scan are what a
 * customer sees standing at a machine with a QR code in front of them, and a
 * list of policy links underneath that is noise at exactly the wrong moment.
 *
 * The contact line and the policy links stay. They were the only part of the
 * old footer carrying anything a customer might actually need, and a booking
 * site that takes payments has to say where its refund terms live.
 */
const LINKS = [
  { href: "/", label: "CAFES" },
  { href: "/tournaments", label: "TOURNAMENTS" },
  { href: "/membership", label: "MEMBERSHIP" },
  { href: "/wallet", label: "WALLET" },
  { href: "/help", label: "HELP" },
  { href: "/contact", label: "CONTACT" },
  { href: "/terms", label: "TERMS" },
  { href: "/privacy", label: "PRIVACY" },
  { href: "/refund", label: "REFUNDS" },
];

export default function Footer() {
  const pathname = usePathname() || "";

  const hidden =
    pathname.startsWith("/owner") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/play") ||
    pathname.startsWith("/scan") ||
    // Sign in carries its own legal line and its own back-to-home, in the
    // rail. A second footer under it repeats both.
    pathname.startsWith("/login");

  if (hidden) return null;

  return (
    <footer className="border-t border-[#f2f0ea]/[0.12] bg-[#0b0b0c] px-5 pb-28 pt-9 font-mono text-xs tracking-[0.18em] text-[#f2f0ea]/35 sm:px-8 sm:pb-9 lg:px-12">
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="block h-2.5 w-2.5 bg-[#d8ff3c]" />
          <span className="font-display text-[15px] font-black tracking-normal text-[#f2f0ea]">
            BOOKMYGAME
          </span>
        </Link>

        <div className="flex flex-wrap gap-x-7 gap-y-3">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap transition-colors hover:text-[#d8ff3c]"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <span className="whitespace-nowrap">BOOKMYGAME.CO.IN · DELHI NCR</span>
      </div>

      <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-[#f2f0ea]/[0.07] pt-6 text-[11px] tracking-[0.14em] text-[#f2f0ea]/25">
        <a href="mailto:bookmygame169@gmail.com" className="transition-colors hover:text-[#d8ff3c]">
          BOOKMYGAME169@GMAIL.COM
        </a>
        <a href="tel:+919910457855" className="transition-colors hover:text-[#d8ff3c]">
          +91 99104 57855
        </a>
        <span>© {new Date().getFullYear()} BOOKMYGAME</span>
      </div>
    </footer>
  );
}
