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

  const admin = createAdminClient();

  // Fetch user record for timezone
  const { data: userRecord, error: userError } = await admin
    .from("users")
    .select("id, email, timezone, intro_music, host_voice, guest_voice")
    .eq("id", user.id)
    .single<{ id: string; email: string; timezone: string; intro_music: string | null; host_voice: string; guest_voice: string }>();

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

  const newsletterText = formatEmailsForPodcast(emails);
  const emailIds = emails.map((e) => e.id);
  const storagePath = `${user.id}/${today}.mp3`;

  // Check for existing personal episode today (re-queue if terminal, return if in-flight)
  const { data: existing } = await admin
    .from("episodes")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("date", today)
    .is("category", null)
    .single<{ id: string; status: string }>();

  let episode: { id: string };

  if (existing && (existing.status === "queued" || existing.status === "processing")) {
    // Already in-flight — return existing
    episode = existing;
  } else {
    if (existing) {
      // Terminal state (ready/error) — delete and re-create
      await admin.from("episodes").delete().eq("id", existing.id);
    }

    const { data: newEpisode, error: insertError } = await admin
      .from("episodes")
      .insert({
        user_id: user.id,
        date: today,
        title,
        status: "queued",
        job_input: {
          newsletter_text: newsletterText,
          email_ids: emailIds,
          storage_path: storagePath,
          date: today,
          user_email: userRecord.email,
          target_length_minutes: 10, // TODO: derive from user tier/preference
          intro_music: userRecord.intro_music,
          host_voice: userRecord.host_voice,
          guest_voice: userRecord.guest_voice,
        },
      })
      .select("id")
      .single<{ id: string }>();

    if (insertError || !newEpisode) {
      console.error("Failed to queue episode:", insertError?.message);
      return NextResponse.json(
        { error: "Server error" },
        { status: 500 }
      );
    }
    episode = newEpisode;
  }

  return NextResponse.json({ episode_id: episode.id });
}
