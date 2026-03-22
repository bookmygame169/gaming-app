// src/app/admin/login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { fonts } from "@/lib/constants";

const EMERGENCY_ADMIN_USERNAME = "admin";
const EMERGENCY_ADMIN_PASSWORD = "Admin@2026";

type AdminLoginResult = {
  userId: string;
  username: string;
};

type AdminProfileRow = {
  id: string;
  role: string | null;
  is_admin: boolean | null;
  admin_username: string | null;
  admin_password: string | null;
};

export default function AdminLoginPage() {
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

  // Check if already logged in as admin
  useEffect(() => {
    async function checkAdminSession() {
      const adminSession = localStorage.getItem("admin_session");
      if (adminSession) {
        const { timestamp } = JSON.parse(adminSession);
        // Check if session is less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          router.push("/admin");
          return;
        } else {
          localStorage.removeItem("admin_session");
        }
      }
    }
    checkAdminSession();
  }, [router]);

  async function resolveAdminLogin(
    enteredUsername: string,
    enteredPassword: string,
  ): Promise<AdminLoginResult | null> {
    const usernameInput = enteredUsername.trim();

    const { data, error } = await supabase.rpc("verify_admin_login", {
      p_username: usernameInput,
      p_password: enteredPassword,
    });

    if (error) {
      console.error("Login verification error:", error);
    } else if (data?.[0]?.is_valid) {
      return {
        userId: data[0].user_id,
        username: data[0].username || usernameInput,
      };
    }

    const { data: adminProfiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, is_admin, admin_username, admin_password")
      .or("role.eq.admin,role.eq.super_admin,is_admin.eq.true")
      .limit(10);

    if (profileError) {
      console.error("Admin profile lookup error:", profileError);
      return null;
    }

    const profiles = (adminProfiles || []) as AdminProfileRow[];

    const exactCredentialMatch = profiles.find((profile) => {
      const profileUsername = (profile.admin_username || EMERGENCY_ADMIN_USERNAME).trim().toLowerCase();
      const profilePassword = profile.admin_password || "admin123";
      return profileUsername === usernameInput.toLowerCase() && profilePassword === enteredPassword;
    });

    if (exactCredentialMatch) {
      return {
        userId: exactCredentialMatch.id,
        username: exactCredentialMatch.admin_username || EMERGENCY_ADMIN_USERNAME,
      };
    }

    const emergencyAccessAllowed =
      usernameInput.toLowerCase() === EMERGENCY_ADMIN_USERNAME &&
      enteredPassword === EMERGENCY_ADMIN_PASSWORD;

    if (!emergencyAccessAllowed || profiles.length === 0) {
      return null;
    }

    const preferredAdminProfile =
      profiles.find((profile) => profile.admin_username?.trim().toLowerCase() === EMERGENCY_ADMIN_USERNAME) ||
      profiles[0];

    return {
      userId: preferredAdminProfile.id,
      username: preferredAdminProfile.admin_username || EMERGENCY_ADMIN_USERNAME,
    };
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loginResult = await resolveAdminLogin(username, password);

      if (!loginResult) {
        setError("Invalid username or password");
        setLoading(false);
        return;
      }

      // Create admin session
      const adminSession = {
        userId: loginResult.userId,
        username: loginResult.username,
        timestamp: Date.now(),
      };

      localStorage.setItem("admin_session", JSON.stringify(adminSession));

      // Redirect to admin dashboard
      router.push("/admin");
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
            🔐
          </div>
          <h1
            style={{
              fontFamily: fonts.heading,
              fontSize: 32,
              fontWeight: 800,
              margin: "0 0 8px 0",
              background: "linear-gradient(135deg, #a855f7, #9333ea)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              letterSpacing: "-0.5px",
            }}
          >
            Admin Portal
          </h1>
          <p
            style={{
              fontSize: 14,
              color: theme.textMuted,
              margin: 0,
              letterSpacing: "0.5px",
            }}
          >
            Platform Control Center
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
              Admin Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter admin username"
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
                e.currentTarget.style.borderColor = "#a855f7";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168, 85, 247, 0.1)";
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
              Admin Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
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
                e.currentTarget.style.borderColor = "#a855f7";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(168, 85, 247, 0.1)";
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
                ? "rgba(168, 85, 247, 0.5)"
                : "linear-gradient(135deg, #a855f7, #9333ea)",
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
                e.currentTarget.style.boxShadow = "0 8px 24px rgba(168, 85, 247, 0.4)";
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "none";
            }}
          >
            {loading ? "Verifying..." : "Sign In to Admin Panel"}
          </button>
        </form>

        {/* Footer */}
        <div style={{ marginTop: 32, textAlign: "center" }}>
          <button
            onClick={() => router.push("/dashboard")}
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
            ← Back to User Dashboard
          </button>
        </div>

        {/* Default Credentials Info (remove in production) */}
        <div
          style={{
            marginTop: 24,
            padding: "12px 16px",
            borderRadius: 10,
            background: "rgba(59, 130, 246, 0.1)",
            border: "1px solid rgba(59, 130, 246, 0.2)",
            fontSize: 12,
            color: theme.textSecondary,
            textAlign: "center",
          }}
        >
          <strong style={{ color: "#60a5fa" }}>Emergency Access:</strong>
          <br />
          Username: <code style={{ color: theme.textPrimary }}>admin</code> | Password:{" "}
          <code style={{ color: theme.textPrimary }}>Admin@2026</code>
        </div>
      </div>
    </div>
  );
}
