/**
 * Regenerate cover art for existing explore episodes.
 *
 * Usage:
 *   set -a && source .env.local && set +a && npx tsx scripts/regen-explore-covers.ts
 */

import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY || !OPENAI_API_KEY) {
  console.error("Missing SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or OPENAI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function main() {
  const { data: episodes, error } = await supabase
    .from("explore_episodes")
    .select("id, title, slug, description, category")
    .order("sort_order");

  if (error) {
    console.error("Failed to fetch episodes:", error.message);
    process.exit(1);
  }

  console.log(`Found ${episodes.length} episodes to regenerate covers for.\n`);

  for (const ep of episodes) {
    console.log(`[${ep.slug}] Generating cover art...`);

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

    const scene = topicScenes[ep.slug] || `silhouetted scene representing ${ep.description}`;

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

    const storagePath = `explore/covers/${ep.slug}.png`;
    // Delete existing file first to avoid upsert issues
    await supabase.storage.from("podcasts").remove([storagePath]);
    const { error: uploadError } = await supabase.storage
      .from("podcasts")
      .upload(storagePath, buffer, {
        contentType: "image/png",
      });

    if (uploadError) {
      console.error(`  Upload failed: ${uploadError.message}`);
      continue;
    }

    const { data: urlData } = supabase.storage
      .from("podcasts")
      .getPublicUrl(storagePath);

    const { error: updateError } = await supabase
      .from("explore_episodes")
      .update({ cover_image_url: urlData.publicUrl })
      .eq("id", ep.id);

    if (updateError) {
      console.error(`  DB update failed: ${updateError.message}`);
      continue;
    }

    console.log(`  Done: ${storagePath}\n`);
  }

  console.log("All covers regenerated.");
}

main().catch(console.error);
