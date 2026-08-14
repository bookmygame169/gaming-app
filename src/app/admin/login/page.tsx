"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield, ArrowLeft } from "lucide-react";

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "This Google account is not authorized for admin access.",
  oauth_cancelled: "Sign-in was cancelled.",
  token_exchange_failed: "Google authentication failed. Please try again.",
  no_email: "Could not retrieve email from Google. Please try again.",
  server_error: "Server error during sign-in. Please try again.",
};

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const errorKey = searchParams.get("error");
  const error = errorKey
    ? (ERROR_MESSAGES[errorKey] ?? "Sign-in failed. Please try again.")
    : null;

  useEffect(() => {
    fetch("/api/admin/verify", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d.isAdmin) router.replace("/admin");
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  function handleGoogleSignIn() {
    setLoading(true);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const redirectUri = `${origin}/api/admin/auth/callback`;
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email profile",
      access_type: "offline",
      prompt: "select_account",
    });
    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  if (checking) return null;

  return (
    <div className="min-h-screen bg-[#09090e] flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-10 backdrop-blur-sm text-center">
          <div className="mb-8">
            <div className="w-14 h-14 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
              <Shield size={26} className="text-violet-400" />
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Admin Portal</h1>
            <p className="text-sm text-slate-500 mt-1">Platform Control Center</p>
          </div>

          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full py-3.5 px-5 rounded-xl border border-white/[0.12] bg-white/[0.08] text-[15px] font-semibold text-slate-100 flex items-center justify-center gap-3 transition-colors hover:bg-white/[0.13] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? "Redirecting…" : "Sign in with Google"}
          </button>

          <p className="mt-6 text-xs text-slate-500 leading-relaxed">
            Only authorized Gmail accounts can access the admin panel.
            <br />
            Contact the platform owner to add your email.
          </p>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to User Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
