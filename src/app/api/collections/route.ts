import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_COLLECTIONS = 7;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: collections, error } = await admin
    .from("collections")
    .select("id, name, slug, host_voice, guest_voice, intro_music, schedule_days, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch collections:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Count assigned sources per collection
  const { data: rules } = await admin
    .from("categorization_rules")
    .select("category")
    .eq("user_id", user.id);

  const sourceCounts: Record<string, number> = {};
  for (const rule of rules ?? []) {
    sourceCounts[rule.category] = (sourceCounts[rule.category] || 0) + 1;
  }

  const result = (collections ?? []).map((c) => ({
    ...c,
    source_count: sourceCounts[c.slug] || 0,
  }));

  return NextResponse.json({ collections: result });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const name = (body.name || "").trim();

  if (!name || name.length > 50) {
    return NextResponse.json(
      { error: "Name is required (max 50 characters)" },
      { status: 400 }
    );
  }

  // Validate schedule_days if provided
  const scheduleDays: number[] = body.schedule_days ?? [];
  if (
    !Array.isArray(scheduleDays) ||
    scheduleDays.some((d: unknown) => typeof d !== "number" || d < 0 || d > 6 || !Number.isInteger(d))
  ) {
    return NextResponse.json(
      { error: "schedule_days must be an array of integers 0-6" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check collection count
  const { count } = await admin
    .from("collections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= MAX_COLLECTIONS) {
    return NextResponse.json(
      { error: `Maximum ${MAX_COLLECTIONS} collections allowed` },
      { status: 400 }
    );
  }

  // If schedule_days provided, clear those days from other collections
  if (scheduleDays.length > 0) {
    const { data: siblings } = await admin
      .from("collections")
      .select("id, schedule_days")
      .eq("user_id", user.id);

    for (const sib of siblings ?? []) {
      const updated = (sib.schedule_days as number[]).filter(
        (d: number) => !scheduleDays.includes(d)
      );
      if (updated.length !== (sib.schedule_days as number[]).length) {
        await admin
          .from("collections")
          .update({ schedule_days: updated })
          .eq("id", sib.id);
      }
    }
  }

  // Generate unique slug
  let slug = slugify(name);
  if (!slug) slug = "collection";

  const { data: existing } = await admin
    .from("collections")
    .select("slug")
    .eq("user_id", user.id)
    .like("slug", `${slug}%`);

  if (existing && existing.some((c) => c.slug === slug)) {
    let i = 2;
    while (existing.some((c) => c.slug === `${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  const { data: collection, error } = await admin
    .from("collections")
    .insert({ user_id: user.id, name, slug, schedule_days: scheduleDays })
    .select("id, name, slug, host_voice, guest_voice, intro_music, schedule_days, created_at")
    .single();

  if (error) {
    console.error("Failed to create collection:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ collection: { ...collection, source_count: 0 } }, { status: 201 });
}
