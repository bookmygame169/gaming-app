import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import OwnerDashboardShell from "../OwnerDashboardShell";
import { isValidOwnerTab, type OwnerRouteTab } from "../navigation";

type PageProps = {
  params: Promise<{ tab: string }>;
};

export default async function OwnerTabPage({ params }: PageProps) {
  const { tab } = await params;

  if (!isValidOwnerTab(tab) || tab === "dashboard") {
    notFound();
  }

  // Read before the first paint so the rail does not open and then snap shut.
  const store = await cookies();
  const railCollapsed = store.get("bmg_owner_rail")?.value === "1";

  return <OwnerDashboardShell activeTab={tab as OwnerRouteTab} railCollapsed={railCollapsed} />;
}
