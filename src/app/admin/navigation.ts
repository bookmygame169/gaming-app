export const ADMIN_ROUTE_TABS = [
  "overview",
  "cafes",
  "users",
  "offline-customers",
  "bookings",
  "subscriptions",
  "coupons",
  "revenue",
  "reports",
  "announcements",
  "audit-logs",
  "owner-access",
  "settings",
] as const;

export type AdminRouteTab = (typeof ADMIN_ROUTE_TABS)[number];

const ROUTE_TAB_SET = new Set<string>(ADMIN_ROUTE_TABS);

export function isValidAdminTab(tab: string): tab is AdminRouteTab {
  return ROUTE_TAB_SET.has(tab);
}

export function adminPathForTab(tab: string): string {
  if (tab === "overview") return "/admin";
  if (isValidAdminTab(tab)) return `/admin/${tab}`;
  return "/admin";
}

export function adminTabFromPath(pathname: string): AdminRouteTab {
  const normalized = pathname.replace(/\/$/, "");
  if (normalized === "/admin") return "overview";
  const match = normalized.match(/^\/admin\/([^/]+)/);
  const segment = match?.[1];
  if (segment && isValidAdminTab(segment)) return segment;
  return "overview";
}
