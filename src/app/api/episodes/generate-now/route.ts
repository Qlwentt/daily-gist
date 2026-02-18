import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatEmailsForPodcast,
  type RawEmailRow,
} from "@/lib/generate-episode";
import { getTodayInTimezone, getFormattedDateInTimezone } from "@/lib/date-utils";

export async function POST() {
  // Authenticate via session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceUrl = process.env.PODCAST_GENERATOR_URL;
  const apiKey = process.env.GENERATOR_API_KEY;

  if (!serviceUrl || !apiKey) {
    console.error("PODCAST_GENERATOR_URL or GENERATOR_API_KEY not configured");
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  // Fetch user record for timezone
  const { data: userRecord, error: userError } = await admin
    .from("users")
    .select("id, email, timezone")
    .eq("id", user.id)
    .single<{ id: string; email: string; timezone: string }>();

  if (userError || !userRecord) {
    console.error("Failed to fetch user record:", userError?.message);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }

  const today = getTodayInTimezone(userRecord.timezone);

  // Fetch unprocessed emails
  const { data: emails, error: emailError } = await admin
    .from("raw_emails")
    .select("id, from_name, from_email, subject, text_body, html_body")
    .eq("user_id", user.id)
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .returns<RawEmailRow[]>();

  if (emailError) {
    console.error("Failed to fetch emails:", emailError.message);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json(
      { error: "No emails to process" },
      { status: 400 }
    );
  }

  const title = `Your Daily Gist — ${getFormattedDateInTimezone(userRecord.timezone)}`;

  // Upsert episode in 'processing' state
  const { data: episode, error: insertError } = await admin
    .from("episodes")
    .upsert(
      {
        user_id: user.id,
        date: today,
        title,
        status: "processing",
      },
      { onConflict: "user_id,date" }
    )
    .select("id")
    .single<{ id: string }>();

  if (insertError || !episode) {
    console.error("Failed to create episode:", insertError?.message);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }

  const newsletterText = formatEmailsForPodcast(emails);
  const emailIds = emails.map((e) => e.id);
  const storagePath = `${user.id}/${today}.mp3`;

  // Fire-and-forget to podcast generator service
  try {
    await fetch(`${serviceUrl}/generate-and-store`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        user_id: user.id,
        newsletter_text: newsletterText,
        episode_id: episode.id,
        email_ids: emailIds,
        storage_path: storagePath,
        date: today,
        user_email: userRecord.email,
        target_length_minutes: 10, // TODO: derive from user tier/preference
      }),
    });
  } catch (err) {
    console.error("Failed to call podcast generator:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }

  return NextResponse.json({ episode_id: episode.id });
}
