import { createAdminClient } from "@/lib/supabase/admin";
import { ExplorePageClient } from "@/components/explore-page-client";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Explore — Daily Gist",
  description:
    "Browse and listen to sample podcast episodes across tech, finance, health, and more. Hear what Daily Gist sounds like before you sign up.",
  openGraph: {
    title: "Explore Daily Gist",
    description:
      "Browse and listen to sample podcast episodes. Hear what Daily Gist sounds like before you sign up.",
    siteName: "Daily Gist",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Daily Gist",
    description:
      "Browse and listen to sample podcast episodes. Hear what Daily Gist sounds like before you sign up.",
  },
};

export type ExploreEpisode = {
  id: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  audio_url: string;
  cover_image_url: string | null;
  duration_seconds: number | null;
  source_newsletters: string[] | null;
  is_featured: boolean;
  sort_order: number;
  host_voice: string | null;
  guest_voice: string | null;
  intro_music: string | null;
};

export default async function ExplorePage() {
  const supabase = createAdminClient();
  const { data: episodes } = await supabase
    .from("explore_episodes")
    .select(
      "id, title, slug, description, category, audio_url, cover_image_url, duration_seconds, source_newsletters, is_featured, sort_order, host_voice, guest_voice, intro_music"
    )
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  const allEpisodes: ExploreEpisode[] = episodes ?? [];
  const categories = Array.from(
    new Set(allEpisodes.map((e) => e.category))
  ).sort();

  return <ExplorePageClient episodes={allEpisodes} categories={categories} />;
}
