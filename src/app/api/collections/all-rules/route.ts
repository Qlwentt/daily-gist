import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: rules, error } = await admin
    .from("categorization_rules")
    .select("id, sender_email, from_name_pattern")
    .eq("user_id", user.id);

  if (error) {
    console.error("Failed to fetch all rules:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  return NextResponse.json({ rules: rules ?? [] });
}
