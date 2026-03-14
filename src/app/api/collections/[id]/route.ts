import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
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
  const admin = createAdminClient();

  // Verify ownership
  const { data: collection } = await admin
    .from("collections")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = (body.name || "").trim();
    if (!name || name.length > 50) {
      return NextResponse.json(
        { error: "Name is required (max 50 characters)" },
        { status: 400 }
      );
    }
    updates.name = name;
  }

  if (body.host_voice !== undefined) updates.host_voice = body.host_voice || null;
  if (body.guest_voice !== undefined) updates.guest_voice = body.guest_voice || null;
  if (body.intro_music !== undefined) updates.intro_music = body.intro_music || null;

  if (body.schedule_days !== undefined) {
    const days = body.schedule_days;
    if (
      !Array.isArray(days) ||
      days.some((d: unknown) => typeof d !== "number" || d < 0 || d > 6 || !Number.isInteger(d))
    ) {
      return NextResponse.json(
        { error: "schedule_days must be an array of integers 0-6" },
        { status: 400 }
      );
    }

    // Clear these days from sibling collections to prevent conflicts
    if (days.length > 0) {
      const { data: siblings } = await admin
        .from("collections")
        .select("id, schedule_days")
        .eq("user_id", user.id)
        .neq("id", id);

      for (const sib of siblings ?? []) {
        const filtered = (sib.schedule_days as number[]).filter(
          (d: number) => !days.includes(d)
        );
        if (filtered.length !== (sib.schedule_days as number[]).length) {
          await admin
            .from("collections")
            .update({ schedule_days: filtered })
            .eq("id", sib.id);
        }
      }
    }

    updates.schedule_days = days;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from("collections")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, slug, host_voice, guest_voice, intro_music, schedule_days, created_at")
    .single();

  if (error) {
    console.error("Failed to update collection:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ collection: updated });
}

export async function DELETE(
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

  // Verify ownership and get slug for rule cleanup
  const { data: collection } = await admin
    .from("collections")
    .select("id, slug")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!collection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Delete categorization rules for this collection
  await admin
    .from("categorization_rules")
    .delete()
    .eq("user_id", user.id)
    .eq("category", collection.slug);

  // Delete the collection
  const { error } = await admin
    .from("collections")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to delete collection:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
