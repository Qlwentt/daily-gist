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
};

type UserRecord = {
  id: string;
  email: string;
  forwarding_address: string;
  rss_token: string;
  tier: string;
};

type Notification = {
  id: string;
  type: string;
  message: string;
};

type RawEmail = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  received_at: string;
  processed_at: string | null;
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
    .select("id, email, forwarding_address, rss_token, tier")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Setting up your account...</p>
      </div>
    );
  }

  // Fetch all data in parallel
  const [
    { data: notifications },
    { data: episodes },
    { data: recentEmails },
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
      .select("id, title, date, status, transcript, error_message")
      .eq("user_id", user.id)
      .order("date", { ascending: false })
      .limit(20)
      .returns<Episode[]>(),
    supabase
      .from("raw_emails")
      .select("id, from_name, from_email, subject, received_at, processed_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(10)
      .returns<RawEmail[]>(),
  ]);

  const feedUrl = `https://dailygist.fyi/api/feed/${userRecord.rss_token}`;

  return (
    <div className="space-y-8">
      {/* Notifications */}
      {notifications && notifications.length > 0 && (
        <NotificationBanners notifications={notifications} />
      )}

      <div>
        <h1 className="text-2xl font-bold mb-2">Welcome to Daily Gist</h1>
        <p className="text-gray-600">Signed in as: {user.email}</p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Your Setup</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Forwarding Address</p>
            <code className="bg-gray-100 px-3 py-1.5 rounded text-sm block">
              {userRecord.forwarding_address}
            </code>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">RSS Feed URL</p>
            <code className="bg-gray-100 px-3 py-1.5 rounded text-sm block break-all">
              {feedUrl}
            </code>
          </div>
          <Link
            href="/dashboard/onboarding"
            className="inline-block text-blue-600 hover:text-blue-700 text-sm"
          >
            View setup instructions
          </Link>
        </div>
      </div>

      {/* Episodes */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Your Episodes</h2>
        {!episodes || episodes.length === 0 ? (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600 mb-2">No episodes yet.</p>
            <p className="text-gray-500 text-sm">
              Forward your first newsletter to{" "}
              <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">
                {userRecord.forwarding_address}
              </code>{" "}
              to get started!
            </p>
          </div>
        ) : (
          <EpisodeList episodes={episodes} />
        )}
      </div>

      {/* Recent Emails */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Recent Emails</h2>
        {!recentEmails || recentEmails.length === 0 ? (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
            <p className="text-gray-600">No emails received yet.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {recentEmails.map((email) => (
              <div
                key={email.id}
                className="p-4 flex items-center justify-between"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {email.from_name || email.from_email}
                  </p>
                  <p className="text-sm text-gray-600 truncate">
                    {email.subject || "(no subject)"}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(email.received_at).toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span
                  className={`ml-4 flex-shrink-0 px-2 py-1 rounded text-xs font-medium ${
                    email.processed_at
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {email.processed_at ? "Processed" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
