"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { colors, fonts } from "@/lib/constants";

/**
 * What a page shows when it has nothing to show.
 *
 * These pages used to render one small bordered box near the top of an
 * otherwise black screen, which on a phone reads as a page that failed to load
 * rather than a page with nothing in it yet. An empty state has to say what is
 * missing, why, and what to do about it — and it has to fill enough of the
 * screen to look deliberate.
 */

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  message: string;
  /** The one thing to do next. Optional: some empty states have no action. */
  action?: { label: string; href: string };
  /** Tints the icon. Defaults to the muted purple used for "nothing here yet". */
  tone?: "neutral" | "warning";
}

export default function EmptyState({
  icon: Icon,
  title,
  message,
  action,
  tone = "neutral",
}: EmptyStateProps) {
  const accent = tone === "warning" ? colors.orange : colors.purple;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        // Tall enough to own the screen rather than float in it, but not so
        // tall that it pushes itself out of view on a small phone.
        minHeight: "46vh",
        padding: "40px 24px",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 20,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: tone === "warning" ? "rgba(245,158,11,0.10)" : "rgba(168,85,247,0.10)",
          border: `1px solid ${tone === "warning" ? "rgba(245,158,11,0.22)" : "rgba(168,85,247,0.22)"}`,
          marginBottom: 18,
        }}
      >
        <Icon size={26} style={{ color: accent }} />
      </div>

      <h2
        style={{
          fontFamily: fonts.heading,
          fontSize: 18,
          fontWeight: 700,
          color: colors.textPrimary,
          marginBottom: 8,
        }}
      >
        {title}
      </h2>

      <p
        style={{
          fontSize: 13.5,
          lineHeight: 1.6,
          color: colors.textSecondary,
          maxWidth: 300,
        }}
      >
        {message}
      </p>

      {action && (
        <Link
          href={action.href}
          style={{
            marginTop: 22,
            padding: "12px 26px",
            borderRadius: 14,
            background: colors.cyan,
            color: colors.dark,
            fontSize: 14,
            fontWeight: 700,
            // Comfortably past the 44px touch minimum on a phone.
            minHeight: 46,
            display: "inline-flex",
            alignItems: "center",
          }}
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
