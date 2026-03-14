// src/app/owner/login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fonts } from "@/lib/constants";

export default function OwnerLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const theme = {
    background: "#020617",
    cardBackground: "rgba(15,23,42,0.6)",
    border: "rgba(51,65,85,0.5)",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    textMuted: "#64748b",
  };

  // Check if already logged in as owner
  useEffect(() => {
    let cancelled = false;

    async function checkOwnerSession() {
      try {
        const res = await fetch('/api/owner/verify', {
          method: 'GET',
          cache: 'no-store',
        });
        const data = await res.json().catch(() => ({}));

        if (!cancelled && res.ok && data.isOwner) {
          router.replace("/owner");
        }
      } catch (err) {
        console.error("Owner session check failed:", err);
      }
    }

    checkOwnerSession();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch('/api/owner/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const result = await res.json();

      if (!res.ok) {
        setError(result.error || 'Login failed');
        setLoading(false);
        return;
      }

      router.push("/owner");
    } catch (err) {
      console.error("Login error:", err);
      setError("An error occurred during login");
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: theme.background,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: fonts.body,
        padding: "20px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          padding: "48px 40px",
          borderRadius: 20,
          background: theme.cardBackground,
          border: `1px solid ${theme.border}`,
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Logo/Header */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div
            style={{
              fontSize: 48,
              marginBottom: 16,
            }}
          >
            🏪
          </div>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: 32,
              fontWeight: 800,
              margin: "0 0 8px 0",
              background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.5px",
            }}
          >
            Owner Portal
          </h1>
          <p
            style={{
              fontSize: 14,
              color: theme.textMuted,
              margin: 0,
              letterSpacing: "0.5px",
            }}
          >
            Café Management Dashboard
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="username"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                color: theme.textSecondary,
                marginBottom: 8,
              }}
            >
              Owner Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter owner username"
              required
              autoComplete="username"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: "rgba(15, 23, 42, 0.8)",
                color: theme.textPrimary,
                fontSize: 15,
                fontFamily: fonts.body,
                outline: "none",
                transition: "all 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#8b5cf6";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139, 92, 246, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                fontSize: 14,
                fontWeight: 500,
                color: theme.textSecondary,
                marginBottom: 8,
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              style={{
                width: "100%",
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: "rgba(15, 23, 42, 0.8)",
                color: theme.textPrimary,
                fontSize: 15,
                fontFamily: fonts.body,
                outline: "none",
                transition: "all 0.2s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#8b5cf6";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(139, 92, 246, 0.1)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = theme.border;
                e.currentTarget.style.boxShadow = "none";
              }}
            />
          </div>

          {/* Error Message */}
          {error && (
            <div
              style={{
                marginBottom: 24,
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(248, 113, 113, 0.1)",
                border: "1px solid rgba(248, 113, 113, 0.3)",
                color: "#fca5a5",
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>⚠️</span>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: 12,
              border: "none",
              background: loading
                ? "rgba(139, 92, 246, 0.5)"
                : "linear-gradient(135deg, #8b5cf6, #6366f1)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
              fontFamily: fonts.body,
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(139, 92, 246, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {loading ? "Signing in..." : "Sign In to Owner Portal"}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <button
            onClick={() => router.push("/")}
            style={{
              background: "none",
              border: "none",
              color: theme.textMuted,
              fontSize: 14,
              cursor: "pointer",
              textDecoration: "underline",
              fontFamily: fonts.body,
            }}
          >
            ← Back to Home
          </button>
        </div>
      </div>
    </div>
  );
}
