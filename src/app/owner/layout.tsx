// src/app/owner/layout.tsx
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { OwnerConsoleFrame } from './OwnerConsoleFrame';

// Force dynamic rendering for owner pages
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Owner Dashboard | BookMyGame",
  description: "Manage your gaming cafe business",
  manifest: "/owner-manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "BMG Owner",
  },
};

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read before the first paint so the rail does not open and then snap shut.
  // Read here rather than per page: the console is mounted once for all of
  // /owner now, so this is only needed once.
  const store = await cookies();
  const railCollapsed = store.get("bmg_owner_rail")?.value === "1";

  return (
    <OwnerConsoleFrame railCollapsed={railCollapsed}>
      {children}
    </OwnerConsoleFrame>
  );
}
