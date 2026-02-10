import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatEmailsForPodcast,
  type RawEmailRow,
} from "@/lib/generate-episode";

type UserIdRow = {
  user_id: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceUrl = process.env.PODCAST_GENERATOR_URL;
  const apiKey = process.env.GENERATOR_API_KEY;

  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { error: "PODCAST_GENERATOR_URL or GENERATOR_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  // Find all users with unprocessed emails
  const { data: usersWithEmails, error } = await supabase
    .from("raw_emails")
    .select("user_id")
    .is("processed_at", null)
    .returns<UserIdRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Failed to query emails" },
      { status: 500 }
    );
  }

  // Deduplicate user IDs
  const userIds = [...new Set((usersWithEmails || []).map((r) => r.user_id))];

  if (userIds.length === 0) {
    return NextResponse.json({ message: "No users with pending emails" });
  }

  let triggered = 0;
  const errors: { userId: string; error: string }[] = [];

  for (const userId of userIds) {
    try {
      // Fetch unprocessed emails for this user
      const { data: emails, error: fetchError } = await supabase
        .from("raw_emails")
        .select("id, from_name, from_email, subject, text_body, html_body")
        .eq("user_id", userId)
        .is("processed_at", null)
        .order("received_at", { ascending: true })
        .returns<RawEmailRow[]>();

      if (fetchError) {
        errors.push({ userId, error: `Failed to fetch emails: ${fetchError.message}` });
        continue;
      }

      if (!emails || emails.length === 0) {
        continue;
      }

      const today = new Date().toISOString().split("T")[0];
      const title = `Your Daily Gist — ${new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })}`;

      // Create episode record in 'processing' state
      const { data: episode, error: insertError } = await supabase
        .from("episodes")
        .upsert(
          {
            user_id: userId,
            date: today,
            title,
            status: "processing",
          },
          { onConflict: "user_id,date" }
        )
        .select("id")
        .single<{ id: string }>();

      if (insertError || !episode) {
        errors.push({
          userId,
          error: `Failed to create episode: ${insertError?.message || "Unknown"}`,
        });
        continue;
      }

      const newsletterText = formatEmailsForPodcast(emails);
      const emailIds = emails.map((e) => e.id);
      const storagePath = `${userId}/${today}.mp3`;

      // Await the 202 from Railway — it responds immediately before doing work
      await fetch(`${serviceUrl}/generate-and-store`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          user_id: userId,
          newsletter_text: newsletterText,
          episode_id: episode.id,
          email_ids: emailIds,
          storage_path: storagePath,
          date: today,
        }),
      });

      triggered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ userId, error: message });
    }
  }

  return NextResponse.json({
    triggered,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
