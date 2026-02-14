import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatEmailsForPodcast,
  type RawEmailRow,
} from "@/lib/generate-episode";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const serviceUrl = process.env.PODCAST_GENERATOR_URL;
  const apiKey = process.env.GENERATOR_API_KEY;

  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { error: "PODCAST_GENERATOR_URL or GENERATOR_API_KEY not configured" },
      { status: 500 }
    );
  }

  const admin = createAdminClient();

  // Fetch unprocessed emails
  const { data: emails, error: fetchError } = await admin
    .from("raw_emails")
    .select("id, from_name, from_email, subject, text_body, html_body")
    .eq("user_id", user.id)
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .returns<RawEmailRow[]>();

  if (fetchError) {
    return NextResponse.json(
      { error: `Failed to fetch emails: ${fetchError.message}` },
      { status: 500 }
    );
  }

  if (!emails || emails.length === 0) {
    return NextResponse.json({ message: "No unprocessed emails" });
  }

  const today = new Date().toISOString().split("T")[0];
  const title = `Your Daily Gist — ${new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;

  const { data: episode, error: insertError } = await admin
    .from("episodes")
    .upsert(
      { user_id: user.id, date: today, title, status: "processing" },
      { onConflict: "user_id,date" }
    )
    .select("id")
    .single<{ id: string }>();

  if (insertError || !episode) {
    return NextResponse.json(
      { error: `Failed to create episode: ${insertError?.message || "Unknown"}` },
      { status: 500 }
    );
  }

  const newsletterText = formatEmailsForPodcast(emails);
  const emailIds = emails.map((e) => e.id);
  const storagePath = `${user.id}/${today}.mp3`;

  // Await the 202 from Railway — it responds immediately before doing work
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
      user_email: user.email,
    }),
  });

  return NextResponse.json({
    message: "Episode generation triggered",
    episode_id: episode.id,
  });
}
