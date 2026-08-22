import type { SupabaseClient } from "@supabase/supabase-js";

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

async function findAuthUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    console.error("Could not list auth users:", error.message);
    return null;
  }

  const match = data?.users?.find((user) => user.email?.toLowerCase() === email);
  return match?.id ?? null;
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
