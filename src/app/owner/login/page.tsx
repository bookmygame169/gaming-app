"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fonts } from "@/lib/constants";
import { Suspense } from "react";

const ERROR_MESSAGES: Record<string, string> = {
  not_authorized: "This Google account is not authorized. Contact your admin.",
  oauth_cancelled: "Sign-in was cancelled.",
  token_exchange_failed: "Google authentication failed. Please try again.",
  no_email: "Could not retrieve email from Google. Please try again.",
  cafe_not_found: "No café is linked to this account. Contact your admin.",
  server_error: "Server error during sign-in. Please try again.",
};

const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!;
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  const errorKey = searchParams.get("error");
  const error = errorKey ? ERROR_MESSAGES[errorKey] ?? "Sign-in failed. Please try again." : null;

  useEffect(() => {
    fetch("/api/owner/verify", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((d) => { if (d.isOwner) router.replace("/owner"); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [router]);

  function handleGoogleSignIn() {
    setLoading(true);
    const redirectUri = `${window.location.origin}/api/owner/auth/callback`;
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
    <div style={{
      minHeight: "100vh",
      background: "#020617",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: fonts.body,
      padding: "20px",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        padding: "48px 40px",
        borderRadius: 20,
        background: "rgba(15,23,42,0.6)",
        border: "1px solid rgba(51,65,85,0.5)",
        backdropFilter: "blur(10px)",
        textAlign: "center",
      }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
          <h1 style={{
            fontFamily: fonts.heading,
            fontSize: 30,
            fontWeight: 800,
            margin: "0 0 8px 0",
            background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.5px",
          }}>
            Owner Portal
          </h1>
          <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
            Café Management Dashboard
          </p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 24,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(248,113,113,0.1)",
            border: "1px solid rgba(248,113,113,0.3)",
            color: "#fca5a5",
            fontSize: 14,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Google Sign-In */}
        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px 20px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
            color: "#f8fafc",
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            transition: "all 0.2s",
            fontFamily: fonts.body,
          }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = loading ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)"; }}
        >
          {/* Google logo */}
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? "Redirecting…" : "Sign in with Google"}
        </button>

        <p style={{ marginTop: 24, fontSize: 12, color: "#475569" }}>
          Only authorized Google accounts can access this portal.
          <br />Contact your admin to get access.
        </p>

        <button
          onClick={() => router.push("/")}
          style={{
            marginTop: 16,
            background: "none",
            border: "none",
            color: "#475569",
            fontSize: 13,
            cursor: "pointer",
            textDecoration: "underline",
            fontFamily: fonts.body,
          }}
        >
          ← Back to Home
        </button>
      </div>
    </div>
  );
}

export default function OwnerLoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
