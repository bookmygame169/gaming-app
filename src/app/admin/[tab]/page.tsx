import { notFound } from "next/navigation";
import AdminDashboardShell from "../AdminDashboardShell";
import { isValidAdminTab, type AdminRouteTab } from "../navigation";

type PageProps = {
  params: Promise<{ tab: string }>;
};

export default async function AdminTabPage({ params }: PageProps) {
  const { tab } = await params;

  if (!isValidAdminTab(tab) || tab === "overview") {
    notFound();
  }

  return <AdminDashboardShell activeTab={tab as AdminRouteTab} />;
}
