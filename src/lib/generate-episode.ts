import { createAdminClient } from "@/lib/supabase/admin";
import { execFile } from "child_process";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

type RawEmailRow = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  text_body: string | null;
  html_body: string | null;
};

type PodcastOutput = {
  audio_path?: string;
  transcript?: string;
  error?: string;
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

async function runPythonScript(
  inputPath: string,
  outputPath: string,
  resultPath: string
): Promise<PodcastOutput> {
  const scriptDir = join(process.cwd(), "scripts");
  const pythonBin = join(scriptDir, ".venv", "bin", "python");
  const scriptPath = join(scriptDir, "generate_podcast.py");

  await new Promise<void>((resolve, reject) => {
    execFile(
      pythonBin,
      [
        scriptPath,
        "--input", inputPath,
        "--output", outputPath,
        "--result-file", resultPath,
      ],
      { timeout: 900_000, maxBuffer: 10 * 1024 * 1024 },
      (error, _stdout, stderr) => {
        if (error) {
          reject(new Error(`Podcast generation failed: ${stderr || error.message}`));
          return;
        }
        resolve();
      }
    );
  });

  const raw = await readFile(resultPath, "utf-8");
  return JSON.parse(raw) as PodcastOutput;
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

  const tmpId = randomUUID();
  const inputPath = join(tmpdir(), `dailygist-input-${tmpId}.txt`);
  const outputPath = join(tmpdir(), `dailygist-output-${tmpId}.mp3`);
  const resultPath = join(tmpdir(), `dailygist-result-${tmpId}.json`);

  try {
    // Write formatted content to temp file
    const content = formatEmailsForPodcast(emails);
    await writeFile(inputPath, content, "utf-8");

    // Generate podcast via Google Cloud Podcast API
    const result = await runPythonScript(inputPath, outputPath, resultPath);

    if (result.error) {
      throw new Error(result.error);
    }

    // Upload MP3 to Supabase Storage
    // TODO: Create 'podcasts' bucket in Supabase dashboard first
    const storagePath = `${userId}/${today}.mp3`;
    const audioBuffer = await readFile(outputPath);

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
        transcript: result.transcript || null,
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
      .in(
        "id",
        emailIds
      );
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
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
    await unlink(resultPath).catch(() => {});
  }
}
