import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { noStoreFetch } from "@/lib/supabaseFetch";

function adminLoginEmail(): string {
  return (process.env.ADMIN_LOGIN_EMAIL || "").trim().toLowerCase();
}

function adminLoginPassword(): string {
  return process.env.ADMIN_LOGIN_PASSWORD || "";
}

export function isConfiguredAdminLogin(email: string, password: string): boolean {
  const expectedEmail = adminLoginEmail();
  const expectedPassword = adminLoginPassword();

  if (!expectedEmail || !expectedPassword) {
    return false;
  }

  return email.trim().toLowerCase() === expectedEmail && password === expectedPassword;
}

export function configuredAdminEmail(): string | null {
  const email = adminLoginEmail();
  return email || null;
}

type AdminLoginRow = {
  user_id: string;
  username: string;
  is_valid: boolean;
};

export type AdminLoginSuccess = {
  userId: string;
  username: string;
};

async function verifyAdminLoginRpc(
  supabase: SupabaseClient,
  username: string,
  password: string
): Promise<AdminLoginSuccess | null> {
  const { data, error } = await supabase.rpc("verify_admin_login", {
    p_username: username,
    p_password: password,
  });

  if (error) {
    console.error("verify_admin_login failed:", error.message);
    return null;
  }

  const row = (data as AdminLoginRow[] | null)?.[0];
  if (!row?.is_valid || !row.user_id) {
    return null;
  }

  return { userId: row.user_id, username: row.username || username };
}

function isAdminProfile(profile: { role?: string | null; is_admin?: boolean | null } | null): boolean {
  const role = profile?.role?.toLowerCase();
  return role === "admin" || role === "super_admin" || profile?.is_admin === true;
}

async function tryAuthEmailPassword(
  adminClient: SupabaseClient,
  email: string,
  password: string
): Promise<AdminLoginSuccess | null> {
  if (!email.includes("@")) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const authClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: noStoreFetch },
  });

  const { data, error } = await authClient.auth.signInWithPassword({ email, password });
  if (error || !data.user?.id) return null;

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, is_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!isAdminProfile(profile)) return null;

  return { userId: data.user.id, username: email };
}

/**
 * Env bootstrap (optional) or hashed admin_username / admin_password on profiles.
 * Matches owner login: credentials live in the database, not only in env.
 */
export async function authenticateAdminLogin(
  supabase: SupabaseClient,
  identifier: string,
  password: string
): Promise<AdminLoginSuccess | null> {
  const trimmed = identifier.trim();
  const normalized = trimmed.toLowerCase();

  if (isConfiguredAdminLogin(trimmed, password) || isConfiguredAdminLogin(normalized, password)) {
    const email = configuredAdminEmail()!;
    const userId = await ensureAdminProfileForEmail(supabase, email);
    if (!userId) {
      throw new Error("Could not set up admin session");
    }
    return { userId, username: email };
  }

  const viaAuth = await tryAuthEmailPassword(supabase, normalized, password);
  if (viaAuth) return viaAuth;

  const tried = new Set<string>();
  const tryUsername = async (username: string) => {
    if (!username || tried.has(username)) return null;
    tried.add(username);
    return verifyAdminLoginRpc(supabase, username, password);
  };

  const direct =
    (await tryUsername(trimmed)) ||
    (normalized !== trimmed ? await tryUsername(normalized) : null);
  if (direct) return direct;

  const { data: byUsername } = await supabase
    .from("profiles")
    .select("admin_username")
    .ilike("admin_username", trimmed.replace(/[%_]/g, "\\$&"))
    .maybeSingle();

  const viaStoredName = await tryUsername(byUsername?.admin_username || "");
  if (viaStoredName) return viaStoredName;

  const authUserId = await findAuthUserIdByEmail(supabase, normalized);
  if (authUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("admin_username")
      .eq("id", authUserId)
      .maybeSingle();

    const viaEmail = await tryUsername(profile?.admin_username || "");
    if (viaEmail) return viaEmail;
  }

  return null;
}

async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error("Could not list auth users:", error.message);
      return null;
    }

    const match = data?.users?.find((user) => user.email?.toLowerCase() === email);
    if (match?.id) return match.id;

    if (!data?.users?.length || data.users.length < 1000) {
      return null;
    }
  }

  return null;
}

export async function ensureAdminProfileForEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  let userId = await findAuthUserIdByEmail(supabase, email);

  if (!userId) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });

    if (createErr || !created?.user) {
      console.error("Failed to create admin auth user:", createErr?.message);
      return null;
    }

    userId = created.user.id;
  }

  const localPart = email.split("@")[0] || "Admin";

  const { error: profileErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      first_name: localPart,
      role: "admin",
      is_admin: true,
      admin_username: email,
    },
    { onConflict: "id" }
  );

  if (profileErr) {
    console.error("Failed to upsert admin profile:", profileErr.message);
    return null;
  }

  return userId;
}
