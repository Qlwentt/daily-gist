import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotificationBanners } from "@/components/notification-banner";
import { EpisodeList } from "@/components/episode-list";
import { CopyButton } from "@/components/copy-button";

type Episode = {
  id: string;
  title: string;
  date: string;
  status: string;
  transcript: string | null;
  error_message: string | null;
  share_code: string | null;
  audio_url: string | null;
  source_newsletters: string[] | null;
};

type UserRecord = {
  id: string;
  email: string;
  forwarding_address: string;
  rss_token: string;
  tier: string;
  onboarding_completed_at: string | null;
  forwarding_setup_at: string | null;
};

type Notification = {
  id: string;
  type: string;
  message: string;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user record
  const { data: userRecord } = await supabase
    .from("users")
    .select("id, email, forwarding_address, rss_token, tier, onboarding_completed_at, forwarding_setup_at")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "#5a4d6b" }}>Setting up your account...</p>
      </div>
    );
  }

  // Fetch notifications and episodes in parallel
  const [
    { data: notifications },
    { data: episodes },
  ] = await Promise.all([
    supabase
      .from("notifications")
      .select("id, type, message")
      .eq("user_id", user.id)
      .eq("read", false)
      .neq("type", "gmail_forwarding_confirmation")
      .order("created_at", { ascending: false })
      .limit(10)
      .returns<Notification[]>(),
    supabase
      .from("episodes")
      .select("id, title, date, status, transcript, error_message, share_code, audio_url, source_newsletters")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(20)
      .returns<Episode[]>(),
  ]);

  const hasEpisodes = episodes && episodes.length > 0;
  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;

  // Redirect to onboarding if not completed and no episodes
  if (!hasEpisodes && !userRecord.onboarding_completed_at) {
    redirect("/dashboard/onboarding");
  }

  return (
    <div className="space-y-8">
      {/* Notifications */}
      {notifications && notifications.length > 0 && (
        <NotificationBanners notifications={notifications} />
      )}

      {/* Forwarding setup alert */}
      {userRecord.onboarding_completed_at && !userRecord.forwarding_setup_at && (
        <div
          className="rounded-2xl p-5 flex items-start gap-4"
          style={{
            background: "rgba(232, 164, 74, 0.08)",
            border: "1px solid rgba(232, 164, 74, 0.25)",
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: "rgba(232, 164, 74, 0.15)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1.5L1 14h14L8 1.5z" stroke="#c4842e" strokeWidth="1.5" strokeLinejoin="round" />
              <line x1="8" y1="6" x2="8" y2="10" stroke="#c4842e" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="12" r="0.75" fill="#c4842e" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: "#1a0e2e" }}>
              Your newsletters aren&apos;t being forwarded automatically yet.
            </p>
            <p className="text-xs mt-1" style={{ color: "#5a4d6b" }}>
              Set up a Gmail filter so new issues are forwarded to Daily Gist automatically.
            </p>
            <Link
              href="/dashboard/onboarding/manual-setup"
              className="inline-block mt-3 px-4 py-2 rounded-xl text-xs font-medium transition-colors"
              style={{ background: "#e8a44a", color: "#1a0e2e" }}
            >
              Set up auto-forwarding
            </Link>
          </div>
        </div>
      )}

      {/* RSS feed URL */}
      <div
        className="bg-white rounded-2xl p-5"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-sm font-semibold mb-1" style={{ color: "#1a0e2e" }}>
          Your Podcast Feed
        </h2>
        <p className="text-xs mb-3" style={{ color: "#5a4d6b" }}>
          Add this URL to your podcast app to get episodes automatically.
        </p>
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-4"
          style={{ background: "rgba(45, 27, 78, 0.04)" }}
        >
          <code className="flex-1 text-sm break-all" style={{ color: "#1a0e2e" }}>
            {feedUrl}
          </code>
          <CopyButton text={feedUrl} />
        </div>

        <div className="space-y-3 text-sm">
          <details className="group">
            <summary
              className="cursor-pointer font-medium list-none flex items-center gap-2"
              style={{ color: "#1a0e2e" }}
            >
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6,4 10,8 6,12" />
              </svg>
              Apple Podcasts
            </summary>
            <div className="mt-2 pl-6 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Apple Podcasts on your Mac</p>
              <p>2. Go to File &rarr; Add a Show by URL (or Cmd+Shift+U)</p>
              <p>3. Paste your RSS feed URL and click Follow</p>
              <p>4. The podcast will sync to your iPhone automatically</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium list-none flex items-center gap-2"
              style={{ color: "#1a0e2e" }}
            >
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6,4 10,8 6,12" />
              </svg>
              Overcast
            </summary>
            <div className="mt-2 pl-6 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Overcast and tap the + button</p>
              <p>2. Tap &quot;Add URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium list-none flex items-center gap-2"
              style={{ color: "#1a0e2e" }}
            >
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6,4 10,8 6,12" />
              </svg>
              Pocket Casts
            </summary>
            <div className="mt-2 pl-6 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Pocket Casts and tap Search</p>
              <p>2. Scroll down and tap &quot;Submit RSS&quot;</p>
              <p>3. Paste your RSS feed URL and tap Find</p>
              <p>4. Tap Subscribe</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium list-none flex items-center gap-2"
              style={{ color: "#1a0e2e" }}
            >
              <svg className="w-4 h-4 transition-transform group-open:rotate-90" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6,4 10,8 6,12" />
              </svg>
              Castro
            </summary>
            <div className="mt-2 pl-6 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Castro and go to Library</p>
              <p>2. Tap the + button, then &quot;Add by URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>
        </div>
      </div>

      <div>
        <h1
          className="text-2xl mb-1"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Your Episodes
        </h1>
        <p className="text-sm" style={{ color: "#8a7f96" }}>
          Signed in as {user.email}
        </p>
      </div>

      {/* Onboarding banner — only when no episodes */}
      {!hasEpisodes && (
        <div
          className="rounded-2xl p-5 bg-white"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <p className="text-sm mb-3" style={{ color: "#5a4d6b" }}>
            New here? Set up your newsletter forwarding to start getting episodes.
          </p>
          <Link
            href="/dashboard/onboarding"
            className="inline-block px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "#6b4c9a", color: "#faf7f2" }}
          >
            Get started
          </Link>
        </div>
      )}

      {/* Episodes */}
      {!hasEpisodes ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <p className="mb-2" style={{ color: "#5a4d6b" }}>
            No episodes yet.
          </p>
          <p className="text-sm" style={{ color: "#8a7f96" }}>
            Forward your first newsletter to{" "}
            <code
              className="px-1.5 py-0.5 rounded text-xs"
              style={{ background: "rgba(45, 27, 78, 0.06)" }}
            >
              {userRecord.forwarding_address}
            </code>{" "}
            to get started!
          </p>
        </div>
      ) : (
        <EpisodeList episodes={episodes} />
      )}
    </div>
  );
}
