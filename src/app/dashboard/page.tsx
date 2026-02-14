import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NotificationBanners } from "@/components/notification-banner";
import { EpisodeList } from "@/components/episode-list";

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
    .select("id, email, forwarding_address, rss_token, tier, onboarding_completed_at")
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
