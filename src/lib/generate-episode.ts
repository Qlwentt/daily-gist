import { createAdminClient } from "@/lib/supabase/admin";

type RawEmailRow = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
};

type PodcastServiceResponse = {
  audio_base64: string;
  transcript: string;
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function formatEmailsForPodcast(emails: RawEmailRow[]): string {
  return emails
    .map((email) => {
      const senderName = email.from_name || email.from_email;
      const subject = email.subject || "(no subject)";
      const body =
        email.text_body ||
        (email.html_body ? stripHtml(email.html_body) : "(no content)");

      return `--- Newsletter: ${senderName} ---\nSubject: ${subject}\n\n${body}`;
    })
    .join("\n\n");
}

async function callPodcastService(
  userId: string,
  newsletterText: string
): Promise<{ audioBuffer: Buffer; transcript: string }> {
  const serviceUrl = process.env.PODCAST_GENERATOR_URL;
  const apiKey = process.env.GENERATOR_API_KEY;

  if (!serviceUrl) {
    throw new Error("PODCAST_GENERATOR_URL environment variable is required");
  }
  if (!apiKey) {
    throw new Error("GENERATOR_API_KEY environment variable is required");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000);

  try {
    const response = await fetch(`${serviceUrl}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        user_id: userId,
        newsletter_text: newsletterText,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        `Podcast service returned ${response.status}: ${text}`
      );
    }

    const data = (await response.json()) as PodcastServiceResponse;
    const audioBuffer = Buffer.from(data.audio_base64, "base64");

    return { audioBuffer, transcript: data.transcript };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateEpisodeForUser(userId: string): Promise<void> {
  const supabase = createAdminClient();

  // Fetch unprocessed emails
  const { data: emails, error: fetchError } = await supabase
    .from("raw_emails")
    .select("id, from_name, from_email, subject, text_body, html_body")
    .eq("user_id", userId)
    .is("processed_at", null)
    .order("received_at", { ascending: true })
    .returns<RawEmailRow[]>();

  if (fetchError) {
    throw new Error(`Failed to fetch emails: ${fetchError.message}`);
  }

  if (!emails || emails.length === 0) {
    return; // Nothing to process
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
    throw new Error(
      `Failed to create episode: ${insertError?.message || "Unknown error"}`
    );
  }

  try {
    const content = formatEmailsForPodcast(emails);
    const { audioBuffer, transcript } = await callPodcastService(
      userId,
      content
    );

    // Upload MP3 to Supabase Storage
    const storagePath = `${userId}/${today}.mp3`;

    const { error: uploadError } = await supabase.storage
      .from("podcasts")
      .upload(storagePath, audioBuffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Failed to upload audio: ${uploadError.message}`);
    }

    // Get public URL for the uploaded file
    const {
      data: { publicUrl },
    } = supabase.storage.from("podcasts").getPublicUrl(storagePath);

    // Update episode with results
    await supabase
      .from("episodes")
      .update({
        transcript: transcript || null,
        audio_url: publicUrl,
        status: "ready",
      })
      .eq("id", episode.id);

    // Create a single episode segment with all source emails
    const emailIds = emails.map((e) => e.id);
    await supabase.from("episode_segments").insert({
      episode_id: episode.id,
      segment_type: "deep_dive",
      title: "Newsletter Digest",
      summary: `Digest of ${emails.length} newsletter(s)`,
      source_email_ids: emailIds,
      sort_order: 0,
    });

    // Mark emails as processed
    await supabase
      .from("raw_emails")
      .update({ processed_at: new Date().toISOString() })
      .in("id", emailIds);
  } catch (err) {
    // Mark episode as failed
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error occurred";
    await supabase
      .from("episodes")
      .update({
        status: "failed",
        error_message: errorMessage,
      })
      .eq("id", episode.id);

    throw err;
  }
}
