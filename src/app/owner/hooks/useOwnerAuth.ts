import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function useOwnerAuth() {
  const router = useRouter();
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [ownerUsername, setOwnerUsername] = useState<string>("Owner");
  const [allowed, setAllowed] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function checkRole() {
      try {
        const res = await fetch('/api/owner/verify', {
          method: 'GET',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.isOwner) {
          if (!cancelled) {
            setAllowed(false);
            setCheckingRole(false);
          }
          router.replace("/owner/login");
          return;
        }

        if (!cancelled) {
          setOwnerId(data.userId || null);
          setOwnerUsername(data.username || "Owner");
          setAllowed(true);
          setCheckingRole(false);
        }
      } catch (err) {
        console.error("Error checking role:", err);
        if (!cancelled) {
          setAllowed(false);
          setCheckingRole(false);
        }
        router.replace("/owner/login");
      }
    }

    checkRole();

    return () => {
      cancelled = true;
    };
  }, [router]);

  return { ownerId, ownerUsername, allowed, checkingRole };
}
