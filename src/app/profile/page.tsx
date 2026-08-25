// src/app/profile/page.tsx
"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import useUser from "@/hooks/useUser";
import { supabase } from "@/lib/supabaseClient";
import AccountTabs from "@/components/AccountTabs";

type ProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  date_of_birth: string | null;
};

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-screen place-items-center bg-[#0b0b0c] font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40">
          LOADING…
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  );
}

/**
 * Settings, in the BookMyGame Site design.
 *
 * The design's right-hand column is saved cards and an ADD METHOD button, and
 * its left one ends in notification toggles and a delete-account box. None of
 * those exist: payments are taken per booking, nothing here sends a
 * notification anybody can switch off, and there is no account deletion. So
 * the column carries what a customer on this screen actually needs — where
 * their number is used, and how to reach a human — and the account rows carry
 * the fields that genuinely save.
 *
 * The phone number is the one that matters. Wallet, points and passes are all
 * held against it rather than against the login, which is why the ?required=
 * flow drops people here and why the row says so out loud.
 */
function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useUser();

  const isPhoneRequired = searchParams.get("required") === "phone";
  const returnUrl = searchParams.get("returnUrl");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [dob, setDob] = useState(""); // YYYY-MM-DD, as stored
  const [dobDisplay, setDobDisplay] = useState(""); // DD/MM/YYYY, as typed

  const [profileLoading, setProfileLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [bookingStats, setBookingStats] = useState({ total: 0, upcoming: 0 });
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    async function loadProfile() {
      if (!user) return;
      try {
        setProfileLoading(true);
        setSaveError(null);

        const { data, error } = await supabase
          .from("profiles")
          .select("first_name, last_name, phone, date_of_birth")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (error) console.error("Error loading profile:", error);

        if (data) {
          setFirstName(data.first_name ?? "");
          setLastName(data.last_name ?? "");
          setPhone(data.phone ?? "");
          setDob(data.date_of_birth ?? "");

          if (data.date_of_birth) {
            const [year, month, day] = data.date_of_birth.split("-");
            setDobDisplay(`${day}/${month}/${year}`);
          } else {
            setDobDisplay("");
          }
        }

        const todayStr = new Date().toISOString().slice(0, 10);

        const { data: bookings, error: bookingError } = await supabase
          .from("bookings")
          .select("id, booking_date, status")
          .eq("user_id", user.id);

        if (!bookingError && bookings) {
          setBookingStats({
            total: bookings.length,
            upcoming: bookings.filter(
              (b) =>
                (b.booking_date ?? "") >= todayStr &&
                (b.status || "").toLowerCase() !== "cancelled"
            ).length,
          });
        }
      } catch (err) {
        console.error("Unexpected error loading profile:", err);
      } finally {
        setProfileLoading(false);
      }
    }

    if (user) loadProfile();
  }, [user]);

  useEffect(() => {
    if (isPhoneRequired && !profileLoading && !loading) {
      setIsEditing(true);
      setSaveError("Please enter your phone number to continue.");
    }
  }, [isPhoneRequired, profileLoading, loading]);

  const displayName = useMemo(() => {
    if (firstName || lastName) return `${firstName} ${lastName}`.trim();
    return user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Gamer";
  }, [firstName, lastName, user]);

  const initials = useMemo(() => {
    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (firstName) return firstName.slice(0, 2).toUpperCase();
    if (user?.email) return user.email.slice(0, 2).toUpperCase();
    return "GG";
  }, [firstName, lastName, user]);

  const memberSince = useMemo(() => {
    if (!user?.created_at) return null;
    return new Date(user.created_at)
      .toLocaleDateString("en-IN", { month: "short", year: "numeric" })
      .toUpperCase();
  }, [user]);

  function handleDateChange(value: string) {
    const digitsOnly = value.replace(/\D/g, "");

    let formatted = "";
    if (digitsOnly.length > 0) {
      formatted = digitsOnly.substring(0, 2);
      if (digitsOnly.length >= 3) formatted += "/" + digitsOnly.substring(2, 4);
      if (digitsOnly.length >= 5) formatted += "/" + digitsOnly.substring(4, 8);
    }

    setDobDisplay(formatted);

    if (digitsOnly.length === 8) {
      const day = digitsOnly.substring(0, 2);
      const month = digitsOnly.substring(2, 4);
      const year = digitsOnly.substring(4, 8);

      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);

      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        setDob(`${year}-${month}-${day}`);
      } else {
        setDob("");
      }
    } else {
      setDob("");
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);

    const cleanPhone = phone.trim();
    if (isPhoneRequired && !cleanPhone) {
      setSaveError("Phone number is required to continue.");
      setSaving(false);
      return;
    }

    if (cleanPhone && cleanPhone.replace(/\D/g, "").length < 10) {
      setSaveError("Please enter a valid phone number.");
      setSaving(false);
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (!accessToken) {
        setSaveError("Your session expired. Please sign in again.");
        return;
      }

      // Saved through the server rather than straight to Supabase: the cafés'
      // ISP blocks the direct call, and this is where the phone number that
      // loyalty and membership are matched on gets set.
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim(),
          dateOfBirth: dob || "",
        }),
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSaveError(result.error || "Could not save changes. Please try again.");
        return;
      }

      setSaveMessage("Saved.");
      setIsEditing(false);

      if (isPhoneRequired) {
        // Redirect back to where the user came from — only ever to a
        // same-site path, never to an attacker-supplied external URL. Must
        // start with exactly one "/": "//evil.com" and "/\evil.com" both
        // get normalized by browsers into a protocol-relative external URL.
        const decoded = returnUrl ? decodeURIComponent(returnUrl) : "/";
        const nextUrl = /^\/(?!\/|\\)/.test(decoded) ? decoded : "/";
        setTimeout(() => router.replace(nextUrl), 1200);
      }
    } catch (err) {
      console.error("Unexpected error saving profile:", err);
      setSaveError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }

  async function handleLogout() {
    try {
      setLoggingOut(true);
      await supabase.auth.signOut();
      router.push("/");
    } catch (err) {
      console.error("Logout error:", err);
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  }

  if (loading || profileLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#0b0b0c] font-mono text-xs tracking-[0.2em] text-[#f2f0ea]/40">
        LOADING…
      </div>
    );
  }

  const rows = [
    { k: "NAME", v: displayName || "Not set" },
    { k: "EMAIL", v: user?.email || "—" },
    { k: "PHONE", v: phone || "Not set" },
    { k: "DATE OF BIRTH", v: dobDisplay || "Not set" },
  ];

  return (
    <div className="min-h-screen bg-[#0b0b0c] font-display text-[#f2f0ea]">
      <AccountTabs />

      <div className="flex flex-wrap items-center gap-[22px] border-b border-[#f2f0ea]/[0.12] px-5 py-10 sm:px-8 lg:px-12">
        <span className="flex h-[82px] w-[82px] shrink-0 items-center justify-center bg-[#d8ff3c] text-[30px] font-black text-[#0b0b0c]">
          {initials}
        </span>
        <div className="min-w-0">
          <div className="text-[clamp(28px,3.4vw,42px)] font-black leading-none tracking-[-0.03em]">
            {displayName}
          </div>
          <div className="mt-3 font-mono text-xs tracking-[0.16em] text-[#f2f0ea]/45">
            {[
              memberSince ? `MEMBER SINCE ${memberSince}` : null,
              `${bookingStats.total} BOOKING${bookingStats.total === 1 ? "" : "S"}`,
              bookingStats.upcoming > 0 ? `${bookingStats.upcoming} UPCOMING` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <span className="min-w-[12px] flex-1" />
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="whitespace-nowrap border border-[#ff5c2b]/50 px-6 py-[15px] font-mono text-[11px] tracking-[0.18em] text-[#ff5c2b] transition-colors hover:bg-[#ff5c2b] hover:text-[#0b0b0c] disabled:opacity-50"
        >
          {loggingOut ? "SIGNING OUT…" : "SIGN OUT"}
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        <div className="border-[#f2f0ea]/[0.12] lg:border-r">
          {saveError && (
            <div className="mx-5 mt-6 border border-[#ff5c2b]/40 bg-[#ff5c2b]/[0.08] px-6 py-4 text-sm font-semibold text-[#ff5c2b] sm:mx-8 lg:mx-12">
              {saveError}
            </div>
          )}
          {saveMessage && (
            <div className="mx-5 mt-6 border border-[#d8ff3c]/40 bg-[#d8ff3c]/[0.08] px-6 py-4 text-sm font-semibold text-[#d8ff3c] sm:mx-8 lg:mx-12">
              {saveMessage}
            </div>
          )}

          <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-8 sm:px-8 lg:px-12">
            <span className="font-mono text-[11px] tracking-[0.2em] text-[#f2f0ea]/40">ACCOUNT</span>
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="font-mono text-[11px] tracking-[0.16em] text-[#d8ff3c] transition-opacity hover:opacity-80"
              >
                EDIT
              </button>
            )}
          </div>

          {!isEditing ? (
            <>
              {rows.map((row) => (
                <div
                  key={row.k}
                  className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-5 border-t border-[#f2f0ea]/[0.08] px-5 py-[19px] sm:grid-cols-[190px_minmax(0,1fr)] sm:px-8 lg:px-12"
                >
                  <span className="whitespace-nowrap font-mono text-[11px] tracking-[0.16em] text-[#f2f0ea]/[0.38]">
                    {row.k}
                  </span>
                  <span
                    className="truncate text-base font-bold"
                    style={{ color: row.v === "Not set" ? "rgba(242,240,234,.35)" : "#f2f0ea" }}
                  >
                    {row.v}
                  </span>
                </div>
              ))}

              <div className="border-t border-[#f2f0ea]/[0.08] px-5 py-6 sm:px-8 lg:px-12">
                <p className="max-w-[52ch] font-mono text-[11px] leading-[1.9] tracking-[0.1em] text-[#f2f0ea]/[0.38]">
                  YOUR PHONE NUMBER IS WHAT THE CAFÉS MATCH ON. WALLET, POINTS AND PASSES ARE ALL
                  HELD AGAINST IT — NOT AGAINST THIS LOGIN — SO IT HAS TO BE THE NUMBER YOU GIVE
                  AT THE COUNTER.
                </p>
              </div>
            </>
          ) : (
            <form onSubmit={handleSaveProfile}>
              {[
                {
                  label: "FIRST NAME",
                  value: firstName,
                  onChange: setFirstName,
                  placeholder: "Your first name",
                  type: "text",
                },
                {
                  label: "LAST NAME",
                  value: lastName,
                  onChange: setLastName,
                  placeholder: "Your last name",
                  type: "text",
                },
                {
                  label: "PHONE",
                  value: phone,
                  onChange: setPhone,
                  placeholder: "10-digit number",
                  type: "tel",
                },
                {
                  label: "DATE OF BIRTH",
                  value: dobDisplay,
                  onChange: handleDateChange,
                  placeholder: "DD/MM/YYYY",
                  type: "text",
                },
              ].map((field) => (
                <div
                  key={field.label}
                  className="grid grid-cols-1 items-center gap-3 border-t border-[#f2f0ea]/[0.08] px-5 py-4 sm:grid-cols-[190px_minmax(0,1fr)] sm:gap-5 sm:px-8 lg:px-12"
                >
                  <label
                    htmlFor={field.label}
                    className="whitespace-nowrap font-mono text-[11px] tracking-[0.16em] text-[#f2f0ea]/[0.38]"
                  >
                    {field.label}
                  </label>
                  <input
                    id={field.label}
                    type={field.type}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full border border-[#f2f0ea]/[0.16] bg-transparent px-4 py-3 text-base font-bold text-[#f2f0ea] outline-none transition-colors placeholder:font-normal placeholder:text-[#f2f0ea]/25 focus:border-[#d8ff3c]"
                  />
                </div>
              ))}

              <div className="flex flex-wrap gap-3 border-t border-[#f2f0ea]/[0.08] px-5 py-6 sm:px-8 lg:px-12">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#d8ff3c] px-8 py-4 font-display text-[13px] font-black tracking-[0.14em] text-[#0b0b0c] transition-[filter] hover:brightness-110 disabled:opacity-50"
                >
                  {saving ? "SAVING…" : "SAVE CHANGES"}
                </button>
                {!isPhoneRequired && (
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="border border-[#f2f0ea]/20 px-8 py-4 font-mono text-[11px] tracking-[0.18em] text-[#f2f0ea]/60 transition-colors hover:border-[#f2f0ea] hover:text-[#f2f0ea]"
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </form>
          )}

          <div className="h-10" />
        </div>

        <div className="flex flex-col border-t border-[#f2f0ea]/[0.12] lg:border-t-0">
          <div className="border-b border-[#f2f0ea]/[0.12] px-8 py-[26px]">
            <div className="font-mono text-xs tracking-[0.24em] text-[#d8ff3c]">YOUR THINGS</div>
          </div>

          {[
            { href: "/dashboard", label: "Bookings", note: "UPCOMING AND PAST" },
            { href: "/membership", label: "Passes", note: "HOURS LEFT ON EACH" },
            { href: "/wallet", label: "Wallet", note: "BALANCE PER CAFÉ" },
            { href: "/rewards", label: "Points", note: "WHAT THEY CLAIM" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between gap-4 border-b border-[#f2f0ea]/[0.07] px-8 py-[17px] transition-colors hover:bg-[#d8ff3c]/[0.06]"
            >
              <div className="min-w-0">
                <div className="text-[15px] font-bold">{item.label}</div>
                <div className="mt-1 font-mono text-[10px] tracking-[0.14em] text-[#f2f0ea]/35">
                  {item.note}
                </div>
              </div>
              <span className="font-mono text-xs text-[#d8ff3c] opacity-0 transition-opacity group-hover:opacity-100">
                →
              </span>
            </Link>
          ))}

          <div className="mt-auto bg-[#f2f0ea]/[0.03] px-8 py-[26px] font-mono text-[11px] leading-[1.9] tracking-[0.1em] text-[#f2f0ea]/35">
            <div>
              SUPPORT ·{" "}
              <a href="mailto:bookmygame169@gmail.com" className="hover:text-[#d8ff3c]">
                BOOKMYGAME169@GMAIL.COM
              </a>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3">
              <Link href="/privacy" className="hover:text-[#d8ff3c]">
                PRIVACY
              </Link>
              ·
              <Link href="/terms" className="hover:text-[#d8ff3c]">
                TERMS
              </Link>
              ·
              <Link href="/refund" className="hover:text-[#d8ff3c]">
                REFUNDS
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
