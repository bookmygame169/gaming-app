import { notFound } from "next/navigation";
import { isValidOwnerTab } from "../navigation";

type PageProps = {
  params: Promise<{ tab: string }>;
};

/**
 * Every console tab other than the dashboard.
 *
 * Renders nothing: the layout mounts the console once for all of /owner so it
 * is not torn down and rebuilt on every tab click, and reads the active tab
 * from the URL. What is left here is the check that the tab exists at all -
 * OwnerConsoleFrame deliberately falls through to this page for an unknown
 * segment so that notFound() still answers.
 */
export default async function OwnerTabPage({ params }: PageProps) {
  const { tab } = await params;

  if (!isValidOwnerTab(tab) || tab === "dashboard") {
    notFound();
  }

  return null;
}
