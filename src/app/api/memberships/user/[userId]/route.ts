// src/app/api/memberships/user/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export const dynamic = 'force-dynamic';

type MembershipRouteContext = {
  params: Promise<{ userId: string }>;
};

// GET /api/memberships/user/[userId] - Get user's membership
export async function GET(
  request: NextRequest,
  { params }: MembershipRouteContext
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const { data: membership, error } = await supabase
      .from("user_memberships")
      .select(`
        *,
        tier:membership_tiers(*)
      `)
      .eq("user_id", userId)
      .eq("status", "active")
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 = no rows returned
      console.error("Error fetching user membership:", error);
      return NextResponse.json(
        { error: "Failed to fetch membership" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { membership: membership || null },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/memberships/user/[userId] - Update user's membership
export async function PATCH(
  request: NextRequest,
  { params }: MembershipRouteContext
) {
  try {
    const { userId } = await params;
    const body = await request.json();
    const { status, auto_renew } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const updateData: { auto_renew?: boolean; status?: string } = {};
    if (status) updateData.status = status;
    if (typeof auto_renew === "boolean") updateData.auto_renew = auto_renew;

    const { data: membership, error } = await supabase
      .from("user_memberships")
      .update(updateData)
      .eq("user_id", userId)
      .eq("status", "active")
      .select()
      .single();

    if (error) {
      console.error("Error updating membership:", error);
      return NextResponse.json(
        { error: "Failed to update membership" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { membership, message: "Membership updated successfully" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/memberships/user/[userId] - Cancel user's membership
export async function DELETE(
  request: NextRequest,
  { params }: MembershipRouteContext
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 }
      );
    }

    const { data: membership, error } = await supabase
      .from("user_memberships")
      .update({ status: "cancelled", auto_renew: false })
      .eq("user_id", userId)
      .eq("status", "active")
      .select()
      .single();

    if (error) {
      console.error("Error cancelling membership:", error);
      return NextResponse.json(
        { error: "Failed to cancel membership" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { membership, message: "Membership cancelled successfully" },
      { status: 200 }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
