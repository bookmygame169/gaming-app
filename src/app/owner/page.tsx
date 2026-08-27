import { cookies } from "next/headers";
import OwnerDashboardShell from "./OwnerDashboardShell";

/** Read before the first paint so the rail does not open and then snap shut. */
async function railCollapsed() {
  const store = await cookies();
  return store.get("bmg_owner_rail")?.value === "1";
}

export default async function OwnerDashboardPage() {
  return <OwnerDashboardShell activeTab="dashboard" railCollapsed={await railCollapsed()} />;
}
