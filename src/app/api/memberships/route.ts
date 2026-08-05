// src/app/api/memberships/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import { requireUser } from "@/lib/userAuth";

export const dynamic = 'force-dynamic';

// GET /api/memberships - Get all membership tiers
export async function GET() {
  try {
    const { data: tiers, error } = await supabase
      .from("membership_tiers")
      .select("*")
      .order("monthly_price", { ascending: true });

    if (error) {
      console.error("Error fetching membership tiers:", error);
      return NextResponse.json(
        { error: "Failed to fetch membership tiers" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tiers }, { status: 200 });
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/memberships - Create a new membership subscription
export async function POST(request: NextRequest) {
  try {
    const { userId: user_id, response: authResponse } = await requireUser(request);
    if (authResponse) return authResponse;

    const body = await request.json();
    const { tier_id, billing_cycle, payment_method } = body;

    if (!tier_id || !billing_cycle) {
      return NextResponse.json(
        { error: "Missing required fields: tier_id, billing_cycle" },
        { status: 400 }
      );
    }

    // Get tier details
    const { data: tier, error: tierError } = await supabase
      .from("membership_tiers")
      .select("*")
      .eq("id", tier_id)
      .single();

    if (tierError || !tier) {
      return NextResponse.json(
        { error: "Invalid tier_id" },
        { status: 400 }
      );
    }

    // Calculate amount and dates
    const amount_paid =
      billing_cycle === "yearly" ? tier.yearly_price : tier.monthly_price;
    const start_date = new Date();
    const end_date = new Date(start_date);
    const next_billing_date = new Date(start_date);

    if (billing_cycle === "yearly") {
      end_date.setFullYear(end_date.getFullYear() + 1);
      next_billing_date.setFullYear(next_billing_date.getFullYear() + 1);
    } else {
      end_date.setMonth(end_date.getMonth() + 1);
      next_billing_date.setMonth(next_billing_date.getMonth() + 1);
    }

    // Check if user already has an active membership
    const { data: existing, error: existingError } = await supabase
      .from("user_memberships")
      .select("*")
      .eq("user_id", user_id)
      .eq("status", "active")
      .single();

    if (existing) {
      return NextResponse.json(
        { error: "User already has an active membership" },
        { status: 400 }
      );
    }

    // Create membership
    const { data: membership, error: createError } = await supabase
      .from("user_memberships")
      .insert([
        {
          user_id,
          tier_id,
          billing_cycle,
          status: "active",
          start_date: start_date.toISOString(),
          end_date: end_date.toISOString(),
          next_billing_date: next_billing_date.toISOString(),
          amount_paid,
          payment_method: payment_method || "pending",
          auto_renew: true,
        },
      ])
      .select()
      .single();

    if (createError) {
      console.error("Error creating membership:", createError);
      return NextResponse.json(
        { error: "Failed to create membership" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { membership, message: "Membership created successfully" },
      { status: 201 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
