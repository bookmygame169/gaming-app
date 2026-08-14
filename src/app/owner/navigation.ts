import type { NavTab } from "./types";

/** Tabs that have a dedicated /owner/[tab] route (dashboard lives at /owner). */
export const OWNER_ROUTE_TABS = [
  "dashboard",
  "billing",
  "bookings",
  "customers",
  "reports",
  "stations",
  "memberships",
  "tournaments",
  "loyalty",
  "reviews",
  "payments",
  "wallet",
  "inventory",
  "coupons",
  "settings",
  "cafe-details",
] as const;

export type OwnerRouteTab = (typeof OWNER_ROUTE_TABS)[number];

const ROUTE_TAB_SET = new Set<string>(OWNER_ROUTE_TABS);

export function isValidOwnerTab(tab: string): tab is OwnerRouteTab {
  return ROUTE_TAB_SET.has(tab);
}

export function ownerPathForTab(tab: NavTab | string): string {
  if (tab === "dashboard") return "/owner";
  if (isValidOwnerTab(tab)) return `/owner/${tab}`;
  return "/owner";
}

export function ownerTabFromPath(pathname: string): OwnerRouteTab {
  const normalized = pathname.replace(/\/$/, "");
  if (normalized === "/owner") return "dashboard";
  const match = normalized.match(/^\/owner\/([^/]+)/);
  const segment = match?.[1];
  if (segment && isValidOwnerTab(segment)) return segment;
  return "dashboard";
}
