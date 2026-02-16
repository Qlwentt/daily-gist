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

  // Try newsletter_sources first
  const { data: sources } = await admin
    .from("newsletter_sources")
    .select("id, sender_email, sender_name")
    .eq("user_id", user.id)
    .order("first_seen_at", { ascending: true });

  if (sources && sources.length > 0) {
    return NextResponse.json({ sources });
  }

  // Fall back to distinct senders from raw_emails
  const { data: emails, error } = await admin
    .from("raw_emails")
    .select("from_email, from_name")
    .eq("user_id", user.id)
    .order("received_at", { ascending: true });

  if (error) {
    console.error("Failed to fetch email senders:", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }

  // Deduplicate by sender email
  const seen = new Set<string>();
  const fallbackSources = (emails || [])
    .filter((e) => {
      if (seen.has(e.from_email)) return false;
      seen.add(e.from_email);
      return true;
    })
    .map((e) => ({
      id: e.from_email,
      sender_email: e.from_email,
      sender_name: e.from_name,
    }));

  return NextResponse.json({ sources: fallbackSources });
}
