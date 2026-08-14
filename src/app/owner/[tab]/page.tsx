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

  return <OwnerDashboardShell activeTab={tab as OwnerRouteTab} />;
}
