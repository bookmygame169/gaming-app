"use client";

import { usePathname } from "next/navigation";
import OwnerDashboardShell from "./OwnerDashboardShell";
import { isValidOwnerTab, ownerTabFromPath } from "./navigation";

/**
 * Keeps one console mounted for the whole of /owner.
 *
 * Every tab is its own route, and each route's page used to render the shell -
 * so the provider inside it was torn down and built again on every tab click.
 * That meant re-checking the session and re-fetching cafes, bookings, pricing,
 * subscriptions and plans before anything could be drawn, which is why moving
 * between tabs sat on LOADING for several seconds.
 *
 * Mounted from the layout instead, this survives navigation between the tabs
 * underneath it: the active tab arrives as a prop derived from the URL, and the
 * data layer already keys its fetches by scope, so same-scope tabs re-render
 * from memory without asking the server for anything.
 *
 * The layout also covers /owner/login and /owner/offline, which must not mount
 * a console at all - one of them is where an unauthenticated visitor lands.
 * Those render the page underneath untouched, as does a URL naming a tab that
 * does not exist, so its page can still call notFound().
 */
export function OwnerConsoleFrame({
  railCollapsed,
  children,
}: {
  railCollapsed: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() || "/owner";
  const normalized = pathname.replace(/\/$/, "");

  const isConsolePath =
    normalized === "/owner" ||
    (normalized.startsWith("/owner/") &&
      isValidOwnerTab(normalized.slice("/owner/".length).split("/")[0]));

  if (!isConsolePath) return <>{children}</>;

  return (
    <OwnerDashboardShell
      activeTab={ownerTabFromPath(normalized)}
      railCollapsed={railCollapsed}
    />
  );
}
