import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const VALID_STYLES = ["easy_listening", "intellectual"];

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { discussion_style } = body;

  if (!VALID_STYLES.includes(discussion_style)) {
    return NextResponse.json({ error: "Invalid discussion style" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("users")
    .update({ discussion_style })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update discussion style:", error.message);
    return NextResponse.json(
      { error: "Failed to save preference" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
