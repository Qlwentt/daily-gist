import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { display_name, display_name_phonetic } = body;

  // Allow clearing (null/empty) or setting (string up to 50 chars)
  const name = typeof display_name === "string" ? display_name.trim().slice(0, 50) || null : null;
  const phonetic = typeof display_name_phonetic === "string" ? display_name_phonetic.trim().slice(0, 50) || null : null;

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ display_name: name, display_name_phonetic: phonetic })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update display name:", error.message);
    return NextResponse.json(
      { error: "Failed to save preference" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
