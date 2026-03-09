import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_CATEGORIES = ["tech", "business", "finance", "productivity"];

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const FREE_TIER_USER_ID = process.env.FREE_TIER_USER_ID;
  if (!FREE_TIER_USER_ID) {
    return NextResponse.json({ error: "FREE_TIER_USER_ID not set" }, { status: 500 });
  }

  const admin = createAdminClient();
  const { data: rules, error } = await admin
    .from("categorization_rules")
    .select("id, sender_email, from_name_pattern, subject_pattern, category, priority, created_at")
    .eq("user_id", FREE_TIER_USER_ID)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch rules:", error.message);
    return NextResponse.json({ error: "Failed to fetch rules" }, { status: 500 });
  }

  return NextResponse.json({ rules: rules ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const FREE_TIER_USER_ID = process.env.FREE_TIER_USER_ID;
  if (!FREE_TIER_USER_ID) {
    return NextResponse.json({ error: "FREE_TIER_USER_ID not set" }, { status: 500 });
  }

  const body = await request.json();
  const { sender_email, from_name_pattern, subject_pattern, category } = body;

  if (!sender_email || typeof sender_email !== "string") {
    return NextResponse.json({ error: "sender_email is required" }, { status: 400 });
  }

  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  const hasPattern = from_name_pattern?.trim() || subject_pattern?.trim();

  const admin = createAdminClient();
  const { data: rule, error } = await admin
    .from("categorization_rules")
    .insert({
      user_id: FREE_TIER_USER_ID,
      sender_email: sender_email.trim().toLowerCase(),
      from_name_pattern: from_name_pattern?.trim() || null,
      subject_pattern: subject_pattern?.trim() || null,
      category,
      priority: hasPattern ? 10 : 0,
    })
    .select("id, sender_email, from_name_pattern, subject_pattern, category, priority, created_at")
    .single();

  if (error) {
    console.error("Failed to create rule:", error.message);
    return NextResponse.json({ error: "Failed to create rule" }, { status: 500 });
  }

  return NextResponse.json({ rule });
}
