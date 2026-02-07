import { createAdminClient } from "@/lib/supabase/admin";
import { generateFeedXml } from "@/lib/rss";

type UserRow = {
  id: string;
};

type EpisodeRow = {
  id: string;
  title: string;
  date: string;
  transcript: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const supabase = createAdminClient();

  // Look up user by rss_token
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("rss_token", token)
    .single<UserRow>();

  if (!user) {
    return new Response("Not found", { status: 404 });
  }

  // Fetch ready episodes
  const { data: episodes } = await supabase
    .from("episodes")
    .select(
      "id, title, date, transcript, audio_url, audio_duration_seconds, created_at"
    )
    .eq("user_id", user.id)
    .eq("status", "ready")
    .order("date", { ascending: false })
    .limit(50)
    .returns<EpisodeRow[]>();

  const items = (episodes || []).map((ep) => ({
    id: ep.id,
    title: ep.title,
    description: ep.transcript
      ? ep.transcript.substring(0, 500)
      : "Daily Gist episode",
    pubDate: ep.created_at,
    audioUrl: ep.audio_url,
    durationSeconds: ep.audio_duration_seconds,
  }));

  const xml = generateFeedXml(items);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=900",
    },
  });
}
