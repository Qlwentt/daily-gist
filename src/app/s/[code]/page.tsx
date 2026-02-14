import { notFound } from "next/navigation";
import Link from "next/link";
import { Instrument_Serif, DM_Sans } from "next/font/google";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Metadata } from "next";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-instrument-serif",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});

type EpisodeRow = {
  id: string;
  title: string;
  date: string;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  source_newsletters: string[] | null;
  status: string;
  user_id: string;
};

type UserRow = {
  email: string;
};

async function getEpisode(
  code: string
): Promise<{ episode: EpisodeRow; ownerName: string } | null> {
  const supabase = createAdminClient();
  const { data: episode } = await supabase
    .from("episodes")
    .select(
      "id, title, date, audio_url, audio_duration_seconds, source_newsletters, status, user_id"
    )
    .eq("share_code", code)
    .single<EpisodeRow>();
  if (!episode) return null;

  let ownerName = "";
  const { data: user } = await supabase
    .from("users")
    .select("email")
    .eq("id", episode.user_id)
    .single<UserRow>();
  if (user?.email) {
    // "quai.wentt@gmail.com" → "Quai"
    const local = user.email.split("@")[0];
    const first = local.split(/[.\-_]/)[0];
    ownerName = first.charAt(0).toUpperCase() + first.slice(1);
  }

  return { episode, ownerName };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const result = await getEpisode(code);

  if (!result || result.episode.status !== "ready") {
    return { title: "Episode not found — Daily Gist" };
  }

  const { episode, ownerName } = result;

  const date = new Date(episode.date).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const titlePrefix = ownerName ? `${ownerName}'s Daily Gist` : "Daily Gist";
  const description = episode.source_newsletters?.length
    ? `Brought to you by ${episode.source_newsletters.join(", ")}`
    : "Your newsletters, as a daily podcast";

  return {
    title: `${episode.title} — ${titlePrefix}`,
    description,
    openGraph: {
      title: episode.title,
      description: `${titlePrefix} for ${date}. ${description}`,
      siteName: "Daily Gist",
      type: "music.song",
      ...(episode.audio_url ? { audio: episode.audio_url } : {}),
    },
    twitter: {
      card: "summary",
      title: episode.title,
      description,
    },
  };
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m} min`;
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const result = await getEpisode(code);

  if (!result || result.episode.status !== "ready") {
    notFound();
  }

  const { episode, ownerName } = result;

  const date = new Date(episode.date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const sources = episode.source_newsletters?.length
    ? episode.source_newsletters
    : null;

  return (
    <div
      className={`${instrumentSerif.variable} ${dmSans.variable} min-h-screen`}
      style={{
        fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif",
        background: "#faf7f2",
        color: "#1a0e2e",
      }}
    >
      {/* Nav */}
      <nav className="flex justify-between items-center px-8 py-5">
        <Link
          href="/"
          className="text-2xl no-underline"
          style={{
            fontFamily:
              "var(--font-instrument-serif), 'Instrument Serif', serif",
            color: "#1a0e2e",
            letterSpacing: "-0.02em",
          }}
        >
          Daily Gist
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium no-underline px-5 py-2.5 rounded-lg transition-all hover:-translate-y-px"
          style={{ background: "#1a0e2e", color: "#faf7f2" }}
        >
          Start listening
        </Link>
      </nav>

      {/* Content */}
      <main className="max-w-xl mx-auto px-6 py-12">
        {/* Player card */}
        <div
          className="rounded-2xl p-8 relative overflow-hidden"
          style={{
            background: "#1a0e2e",
            color: "#faf7f2",
            boxShadow: "0 24px 60px rgba(26, 14, 46, 0.25)",
          }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(circle at 20% 20%, rgba(157, 124, 216, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(232, 164, 74, 0.1) 0%, transparent 50%)",
            }}
          />

          <div className="flex items-center gap-4 mb-6 relative">
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-bold flex-shrink-0"
              style={{
                fontFamily:
                  "var(--font-instrument-serif), 'Instrument Serif', serif",
                background: "linear-gradient(135deg, #6b4c9a, #e8a44a)",
              }}
            >
              DG
            </div>
            <div>
              <h1 className="text-base font-semibold mb-0.5">
                {ownerName
                  ? `${ownerName}\u2019s Daily Gist`
                  : episode.title}
              </h1>
              <p
                className="text-xs"
                style={{ color: "rgba(250, 247, 242, 0.6)" }}
              >
                {date}
                {episode.audio_duration_seconds
                  ? ` \u00B7 ${formatDuration(episode.audio_duration_seconds)}`
                  : ""}
              </p>
            </div>
          </div>

          {/* Native audio player */}
          {episode.audio_url && (
            <div className="relative mb-4">
              <audio
                controls
                preload="metadata"
                src={episode.audio_url}
                className="w-full"
                style={{
                  borderRadius: "8px",
                  height: "44px",
                }}
              />
            </div>
          )}

          {/* Source newsletters */}
          {sources && (
            <div
              className="mt-4 pt-4 relative"
              style={{
                borderTop: "1px solid rgba(250, 247, 242, 0.08)",
              }}
            >
              <div
                className="text-[0.7rem] uppercase tracking-widest mb-3"
                style={{ color: "rgba(250, 247, 242, 0.4)" }}
              >
                Brought to you by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((source) => (
                  <span
                    key={source}
                    className="px-2.5 py-1 rounded-md text-xs"
                    style={{
                      background: "rgba(250, 247, 242, 0.08)",
                      color: "rgba(250, 247, 242, 0.7)",
                      border: "1px solid rgba(250, 247, 242, 0.06)",
                    }}
                  >
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CTA card */}
        <div
          className="mt-8 rounded-2xl p-8 text-center"
          style={{
            background: "white",
            border: "1px solid rgba(45, 27, 78, 0.08)",
          }}
        >
          {ownerName && (
            <p
              className="text-sm font-medium mb-4"
              style={{ color: "#6b4c9a" }}
            >
              {ownerName} sent this to you
            </p>
          )}
          <h2
            className="text-xl mb-2"
            style={{
              fontFamily:
                "var(--font-instrument-serif), 'Instrument Serif', serif",
              color: "#1a0e2e",
              letterSpacing: "-0.02em",
            }}
          >
            Get your own daily podcast
          </h2>
          <p
            className="text-sm mb-6"
            style={{ color: "#5a4d6b", lineHeight: 1.6 }}
          >
            Daily Gist turns your email newsletters into a conversational
            podcast you can enjoy on your morning commute.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl font-semibold no-underline transition-all hover:-translate-y-0.5"
            style={{ background: "#1a0e2e", color: "#faf7f2" }}
          >
            Start listening free
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8h10m0 0L9 4m4 4L9 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer
        className="py-12 px-8 text-center text-sm"
        style={{ color: "#8a7f96" }}
      >
        <p>&copy; 2026 Daily Gist</p>
      </footer>
    </div>
  );
}
