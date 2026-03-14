import { createAdminClient } from "@/lib/supabase/admin";
import { generateFeedXml } from "@/lib/rss";

type UserRow = {
  id: string;
  tier: string;
  category: string | null;
};

type EpisodeRow = {
  id: string;
  title: string;
  date: string;
  transcript: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  audio_size_bytes: number | null;
  share_code: string | null;
  created_at: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const url = new URL(request.url);
  const categoryParam = url.searchParams.get("category");
  const collectionParam = url.searchParams.get("collection");

  const supabase = createAdminClient();

  // Look up user by rss_token
  const { data: user } = await supabase
    .from("users")
    .select("id, tier, category")
    .eq("rss_token", token)
    .single<UserRow>();

  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  const FREE_TIER_USER_ID = process.env.FREE_TIER_USER_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi";

  // Determine feed title, cover URL, and query filters
  let feedTitle: string | undefined;
  let coverUrl: string | undefined;
  let episodeQuery = supabase
    .from("episodes")
    .select(
      "id, title, date, transcript, audio_url, audio_duration_seconds, audio_size_bytes, share_code, created_at"
    )
    .eq("status", "ready")
    .order("date", { ascending: false })
    .limit(50);

  if (collectionParam && user.tier !== "free") {
    // Collection feed — paid user's own episodes for this collection slug
    episodeQuery = episodeQuery
      .eq("user_id", user.id)
      .eq("category", collectionParam);

    // Look up collection name for feed title
    const { data: collection } = await supabase
      .from("collections")
      .select("name")
      .eq("user_id", user.id)
      .eq("slug", collectionParam)
      .single();

    feedTitle = collection?.name
      ? `Daily Gist: ${collection.name}`
      : `Daily Gist: ${collectionParam}`;
    coverUrl = `${appUrl}/api/cover?name=${encodeURIComponent(collection?.name || collectionParam)}`;
  } else if (categoryParam) {
    // Category feed — system user's episodes for this category
    const targetUserId = FREE_TIER_USER_ID || user.id;
    episodeQuery = episodeQuery
      .eq("user_id", targetUserId)
      .eq("category", categoryParam);
    const label = categoryParam.charAt(0).toUpperCase() + categoryParam.slice(1);
    feedTitle = `Daily Gist: ${label}`;
  } else if (user.tier === "free" && user.category && FREE_TIER_USER_ID) {
    // Free user default — their chosen category from system user
    episodeQuery = episodeQuery
      .eq("user_id", FREE_TIER_USER_ID)
      .eq("category", user.category);
    const label = user.category.charAt(0).toUpperCase() + user.category.slice(1);
    feedTitle = `Daily Gist: ${label}`;
  } else {
    // Personal feed (catch-all for paid users, or no category)
    episodeQuery = episodeQuery
      .eq("user_id", user.id)
      .is("category", null);
  }

  const { data: episodes } = await episodeQuery.returns<EpisodeRow[]>();

  const items = (episodes || []).map((ep) => ({
    id: ep.id,
    title: ep.title,
    description: ep.transcript
      ? ep.transcript.substring(0, 500)
      : "Daily Gist episode",
    pubDate: ep.created_at,
    audioUrl: ep.audio_url,
    audioSizeBytes: ep.audio_size_bytes,
    durationSeconds: ep.audio_duration_seconds,
    shareUrl: ep.share_code ? `${appUrl}/s/${ep.share_code}` : null,
  }));

  const xml = generateFeedXml(items, feedTitle, coverUrl);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
