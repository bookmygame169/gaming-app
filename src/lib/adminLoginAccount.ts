import type { SupabaseClient } from "@supabase/supabase-js";

/** Platform admin sign-in (email + password). Compared case-insensitively for email. */
export const HARDCODED_ADMIN_EMAIL = "mshakya169@gmail.com";
export const HARDCODED_ADMIN_PASSWORD = "Mls1215225";

export function isHardcodedAdminLogin(email: string, password: string): boolean {
  return (
    email.trim().toLowerCase() === HARDCODED_ADMIN_EMAIL &&
    password === HARDCODED_ADMIN_PASSWORD
  );
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

/**
 * Ensures a profiles row exists for the hardcoded admin email so session
 * checks (role / is_admin) succeed after password login.
 */
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
