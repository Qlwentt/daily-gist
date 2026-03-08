/**
 * Seed script for explore episodes.
 *
 * Reads episode definitions from explore-episodes.json, generates podcasts
 * via the Python service, generates cover art via DALL-E 3, uploads both
 * to Supabase Storage, and inserts rows into explore_episodes.
 *
 * Usage:
 *   npx tsx scripts/seed-explore-episodes.ts
 *
 * Prerequisites:
 *   - Python service running (e.g. on localhost:8000)
 *   - .env.local sourced (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, GENERATOR_API_KEY)
 *
 * Safe to re-run: skips episodes that already exist by slug.
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GENERATOR_API_KEY = process.env.GENERATOR_API_KEY;
const GENERATOR_URL = process.env.GENERATOR_URL || "http://localhost:8000";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}
if (!GENERATOR_API_KEY) {
  console.error("Missing GENERATOR_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type EpisodeConfig = {
  title: string;
  slug: string;
  description: string;
  category: string;
  content_file: string;
  target_length_minutes: number;
  host_voice: string;
  guest_voice: string;
  intro_music: string;
  is_featured: boolean;
  sort_order: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function generateCoverArt(
  title: string,
  description: string,
  category: string,
  slug: string
): Promise<string> {
  console.log(`  Generating cover art for "${title}"...`);

  const topicScenes: Record<string, string> = {
    "ai-agents-revolution": "silhouetted figure at a desk with a glowing robot assistant hovering beside them, floating code symbols in the air",
    "market-rally-2026": "silhouetted bull standing on a glowing upward chart line, city skyline in the background",
    "sleep-science": "silhouetted person sleeping peacefully, a glowing moon and floating brain waves above them",
    "startup-funding-weird": "silhouetted figure looking up at a massive glowing dollar sign splitting into two paths",
    "productivity-trap": "silhouetted person on a treadmill surrounded by floating clocks and to-do lists fading away",
    "climate-tech-billions": "silhouetted wind turbines and solar panels on a hill with a glowing battery in the foreground",
    "longevity-playbook": "silhouetted runner on a long road, a glowing DNA helix stretching into the horizon",
    "nuclear-energy-comeback": "silhouetted cooling tower glowing with clean blue energy, server racks in the foreground",
    "housing-market-2026": "silhouetted small house perched on top of a towering stack of glowing coins",
    "remote-work-split": "split scene with a silhouetted person at a home desk on one side and an office tower on the other, connected by a glowing line",
    "ultra-processed-food-brain": "silhouetted head in profile with a glowing brain, fresh food on one side and packaged food on the other",
    "robotics-iphone-moment": "silhouetted humanoid robot standing in a factory doorway, backlit with warm industrial light",
    "psychology-money-mistakes": "silhouetted person looking at a glowing wallet with money floating away like butterflies",
    "how-to-read-more": "silhouetted person reading in an armchair, surrounded by towering stacks of glowing books",
    "space-tech-booming": "silhouetted rocket launching into a star-filled sky with satellites orbiting a glowing Earth",
    "parenting-advice": "silhouetted parent and child walking hand in hand on a path, kite flying in a glowing sky",
    "gut-mood-connection": "silhouetted human torso with a glowing connection between stomach and brain, soft particles floating",
    "creator-economy-grew-up": "silhouetted person at a desk with a glowing microphone, camera, and rising chart on screen",
  };

  const scene = topicScenes[slug] || `silhouetted scene representing ${description}`;

  const prompt = `Digital illustration, stylized book cover art style, dark moody background with rich color gradients, ${scene}, atmospheric lighting, lo-fi aesthetic, minimal detail, painterly textures, square format, no text, no words, no letters, no typography, no writing of any kind.`;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });

  const b64 = response.data[0].b64_json!;
  const buffer = Buffer.from(b64, "base64");

  // Upload to Supabase Storage
  const storagePath = `explore/covers/${slug}.png`;
  const { error } = await supabase.storage
    .from("podcasts")
    .upload(storagePath, buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) throw new Error(`Cover upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage
    .from("podcasts")
    .getPublicUrl(storagePath);

  console.log(`  Cover uploaded: ${storagePath}`);
  return urlData.publicUrl;
}

async function generatePodcast(
  newsletterText: string,
  config: EpisodeConfig
): Promise<{
  audioBase64: string;
  transcript: string;
  sourceNewsletters: string[];
}> {
  console.log(`  Generating podcast audio (~${config.target_length_minutes} min)...`);

  const response = await fetch(`${GENERATOR_URL}/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GENERATOR_API_KEY}`,
    },
    body: JSON.stringify({
      user_id: "explore-seed",
      newsletter_text: newsletterText,
      target_length_minutes: config.target_length_minutes,
      host_voice: config.host_voice,
      guest_voice: config.guest_voice,
      intro_music: config.intro_music,
    }),
    signal: AbortSignal.timeout(10 * 60 * 1000), // 10 min timeout
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Generate failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return {
    audioBase64: data.audio_base64,
    transcript: data.transcript,
    sourceNewsletters: data.source_newsletters,
  };
}

function estimateDuration(audioBase64: string): number {
  // MP3 at ~128kbps: bytes / (128000/8) = seconds
  const bytes = Buffer.from(audioBase64, "base64").length;
  return Math.round(bytes / 16000);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const configPath = path.join(__dirname, "explore-episodes.json");
  const episodes: EpisodeConfig[] = JSON.parse(
    fs.readFileSync(configPath, "utf-8")
  );

  console.log(`Found ${episodes.length} episodes to seed.\n`);

  for (const config of episodes) {
    console.log(`\n--- ${config.title} (${config.slug}) ---`);

    // Check if already exists
    const { data: existing } = await supabase
      .from("explore_episodes")
      .select("id")
      .eq("slug", config.slug)
      .single();

    if (existing) {
      console.log("  Already exists, skipping.");
      continue;
    }

    // Read content file
    const contentPath = path.join(
      __dirname,
      "..",
      config.content_file
    );
    if (!fs.existsSync(contentPath)) {
      console.error(`  Content file not found: ${contentPath}`);
      continue;
    }
    const newsletterText = fs.readFileSync(contentPath, "utf-8");
    console.log(`  Content: ${newsletterText.length} chars`);

    // Generate podcast
    const { audioBase64, transcript, sourceNewsletters } =
      await generatePodcast(newsletterText, config);

    const mp3Buffer = Buffer.from(audioBase64, "base64");
    const durationSeconds = estimateDuration(audioBase64);
    console.log(
      `  Audio: ${(mp3Buffer.length / 1024 / 1024).toFixed(1)} MB, ~${Math.round(durationSeconds / 60)} min`
    );

    // Upload MP3
    const audioPath = `explore/${config.slug}.mp3`;
    const { error: audioError } = await supabase.storage
      .from("podcasts")
      .upload(audioPath, mp3Buffer, {
        contentType: "audio/mpeg",
        upsert: true,
      });
    if (audioError)
      throw new Error(`Audio upload failed: ${audioError.message}`);

    const { data: audioUrlData } = supabase.storage
      .from("podcasts")
      .getPublicUrl(audioPath);
    console.log(`  Audio uploaded: ${audioPath}`);

    // Generate cover art
    const coverImageUrl = await generateCoverArt(
      config.title,
      config.description,
      config.category,
      config.slug
    );

    // Insert row
    const { error: insertError } = await supabase
      .from("explore_episodes")
      .insert({
        title: config.title,
        slug: config.slug,
        description: config.description,
        category: config.category,
        audio_url: audioUrlData.publicUrl,
        cover_image_url: coverImageUrl,
        duration_seconds: durationSeconds,
        source_newsletters: sourceNewsletters,
        transcript,
        is_featured: config.is_featured,
        sort_order: config.sort_order,
        host_voice: config.host_voice,
        guest_voice: config.guest_voice,
        intro_music: config.intro_music,
      });

    if (insertError)
      throw new Error(`Insert failed: ${insertError.message}`);

    console.log("  Inserted into explore_episodes.");
  }

  console.log("\nDone!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
