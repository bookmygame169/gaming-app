// src/hooks/useProfileComplete.ts
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import useUser from "@/hooks/useUser";

type ProfileStatus = {
  isComplete: boolean;
  isLoading: boolean;
  profile: {
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    dob: string | null;
  } | null;
};

/**
 * Whether the signed-in customer has filled in their details.
 *
 * The redirect used to point at /onboarding, which was a copy of the dashboard
 * with no form on it — so someone sent there was never actually asked for
 * anything. It now goes to the profile page, which already has a "phone
 * required" mode and returns the customer to where they were.
 *
 * @param redirectToProfile - send incomplete profiles to /profile to finish
 * @returns isComplete, isLoading, and the profile data
 */
export default function useProfileComplete(redirectToProfile: boolean = false): ProfileStatus {
  const { user, loading: userLoading } = useUser();
  const router = useRouter();
  
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileStatus["profile"]>(null);

  useEffect(() => {
    async function checkProfile() {
      // If still loading user, wait
      if (userLoading) return;

      // If no user, not complete
      if (!user) {
        setIsComplete(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone, date_of_birth, onboarding_complete")
          .eq("id", user.id)
          .maybeSingle();

        if (error) {
          console.error("Error checking profile:", error);
          setIsComplete(false);
          setIsLoading(false);
          return;
        }

        const complete = data?.onboarding_complete === true;
        
        setProfile(data ? {
          firstName: data.first_name,
          lastName: data.last_name,
          phone: data.phone,
          dob: data.date_of_birth,
        } : null);
        
        setIsComplete(complete);

        if (!complete && redirectToProfile) {
          // The path travels in the query string rather than sessionStorage so
          // the profile page can send them back without a second source of
          // truth. It only ever accepts a same-site path.
          const returnTo =
            typeof window !== "undefined" ? window.location.pathname : "/";
          router.push(
            `/profile?required=phone&returnUrl=${encodeURIComponent(returnTo)}`
          );
        }

      } catch (err) {
        console.error("Error:", err);
        setIsComplete(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkProfile();
  }, [user, userLoading, redirectToProfile, router]);

  return { isComplete, isLoading, profile };
}