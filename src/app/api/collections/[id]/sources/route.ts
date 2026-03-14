import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type RuleRow = {
  id: string;
  sender_email: string;
  from_name_pattern: string | null;
  subject_pattern: string | null;
  priority: number;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Verify collection ownership
  const { data: collection } = await admin
    .from("collections")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: rules, error } = await admin
    .from("categorization_rules")
    .select("id, sender_email, from_name_pattern, subject_pattern, priority")
    .eq("user_id", user.id)
    .eq("category", collection.slug)
    .order("priority", { ascending: false })
    .returns<RuleRow[]>();

  if (error) {
    console.error("Failed to fetch collection sources:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ sources: rules ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const senderEmail = (body.sender_email || "").trim().toLowerCase();
  const fromNamePattern = body.from_name_pattern?.trim() || null;

  if (!senderEmail) {
    return NextResponse.json(
      { error: "sender_email is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verify collection ownership
  const { data: collection } = await admin
    .from("collections")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check for duplicate rule (same sender + pattern in same collection)
  const { data: existing } = await admin
    .from("categorization_rules")
    .select("id")
    .eq("user_id", user.id)
    .eq("sender_email", senderEmail)
    .eq("category", collection.slug);

  const duplicate = (existing ?? []).find(() => {
    // For simplicity, one rule per sender per collection
    return true;
  });

  if (duplicate && !fromNamePattern) {
    return NextResponse.json(
      { error: "This source is already assigned to this collection" },
      { status: 409 }
    );
  }

  // If this sender is assigned to another collection, remove that rule first
  // (a sender can only belong to one collection at a time, unless using patterns)
  if (!fromNamePattern) {
    await admin
      .from("categorization_rules")
      .delete()
      .eq("user_id", user.id)
      .eq("sender_email", senderEmail)
      .is("from_name_pattern", null);
  }

  const priority = fromNamePattern ? 10 : 0; // pattern rules get higher priority

  const { data: rule, error } = await admin
    .from("categorization_rules")
    .insert({
      user_id: user.id,
      sender_email: senderEmail,
      from_name_pattern: fromNamePattern,
      category: collection.slug,
      priority,
    })
    .select("id, sender_email, from_name_pattern, subject_pattern, priority")
    .single();

  if (error) {
    console.error("Failed to assign source:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ source: rule }, { status: 201 });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const ruleId = url.searchParams.get("rule_id");

  if (!ruleId) {
    return NextResponse.json({ error: "rule_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify collection ownership
  const { data: collection } = await admin
    .from("collections")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { error } = await admin
    .from("categorization_rules")
    .delete()
    .eq("id", ruleId)
    .eq("user_id", user.id)
    .eq("category", collection.slug);

  if (error) {
    console.error("Failed to remove source:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
