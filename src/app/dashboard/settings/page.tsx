import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { SaveButton } from "@/components/save-button";
import { DeleteAccountSection } from "@/components/delete-account-section";
import { IntroMusicPicker } from "@/components/intro-music-picker";
import { DiscussionStylePicker } from "@/components/discussion-style-picker";
import { VoicePicker } from "@/components/voice-picker";
import { NamePronunciation } from "@/components/name-pronunciation";
import { CategoryPicker } from "@/components/category-picker";
import { CollectionsManager } from "@/components/collections-manager";


type UserRecord = {
  email: string;
  forwarding_address: string;
  rss_token: string;
  timezone: string;
  tier: string;
  category: string | null;
  generation_hour: number;
  intro_music: string | null;
  host_voice: string;
  guest_voice: string;
  display_name: string | null;
  display_name_phonetic: string | null;
  discussion_style: string;
};

type RawEmail = {
  id: string;
  from_name: string | null;
  from_email: string;
  subject: string | null;
  received_at: string;
  processed_at: string | null;
};

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern Time (ET)" },
  { value: "America/Chicago", label: "Central Time (CT)" },
  { value: "America/Denver", label: "Mountain Time (MT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PT)" },
  { value: "America/Anchorage", label: "Alaska Time (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HT)" },
  { value: "UTC", label: "UTC" },
];

const GENERATION_HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: new Date(2000, 0, 1, i).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }),
}));

const TIER_LABELS: Record<string, string> = {
  free: "Free Edition",
  pro: "Basic Edition",
  power: "Special Edition",
};

async function updateTimezone(formData: FormData) {
  "use server";

  const timezone = formData.get("timezone") as string;
  if (!timezone) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase.from("users").update({ timezone }).eq("id", user.id);

  revalidatePath("/dashboard/settings");
}

async function updateGenerationHour(formData: FormData) {
  "use server";

  const hour = formData.get("generation_hour");
  if (hour === null) return;

  const generation_hour = parseInt(hour as string, 10);
  if (isNaN(generation_hour) || generation_hour < 0 || generation_hour > 23)
    return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("users")
    .update({ generation_hour })
    .eq("id", user.id);

  revalidatePath("/dashboard/settings");
}


export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: userRecord }, { data: recentEmails }, { data: collections }] = await Promise.all([
    supabase
      .from("users")
      .select("email, forwarding_address, rss_token, timezone, tier, category, generation_hour, intro_music, host_voice, guest_voice, display_name, display_name_phonetic, discussion_style")
      .eq("id", user.id)
      .single<UserRecord>(),
    supabase
      .from("raw_emails")
      .select("id, from_name, from_email, subject, received_at, processed_at")
      .eq("user_id", user.id)
      .order("received_at", { ascending: false })
      .limit(10)
      .returns<RawEmail[]>(),
    supabase
      .from("collections")
      .select("id, name, slug, host_voice, guest_voice, intro_music, schedule_days, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
  ]);

  if (!userRecord) {
    redirect("/dashboard");
  }

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;
  const isFree = userRecord.tier === "free";
  const isPower = userRecord.tier === "power";

  // Compute source counts per collection slug
  let collectionsWithCounts: { id: string; name: string; slug: string; host_voice: string | null; guest_voice: string | null; intro_music: string | null; schedule_days: number[]; source_count: number }[] = [];
  if (isPower && collections && collections.length > 0) {
    const { data: rules } = await supabase
      .from("categorization_rules")
      .select("category")
      .eq("user_id", user.id);

    const sourceCounts: Record<string, number> = {};
    for (const rule of rules ?? []) {
      sourceCounts[rule.category] = (sourceCounts[rule.category] || 0) + 1;
    }

    collectionsWithCounts = collections.map((c: { id: string; name: string; slug: string; host_voice: string | null; guest_voice: string | null; intro_music: string | null; schedule_days: number[] }) => ({
      ...c,
      source_count: sourceCounts[c.slug] || 0,
    }));
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1
          className="text-2xl mb-1"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Settings
        </h1>
        <p className="text-sm" style={{ color: "#8a7f96" }}>
          Manage your Daily Gist account
          {!isFree && (
            <>
              {" \u00b7 "}
              <Link
                href="/dashboard/onboarding/manual-setup"
                className="hover:underline"
                style={{ color: "#6b4c9a" }}
              >
                Setup guide
              </Link>
            </>
          )}
        </p>
      </div>

      {/* Account Info */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
          Account
        </h2>
        <div className="space-y-4">
          <div>
            <p
              className="text-xs font-medium uppercase mb-1"
              style={{ color: "#8a7f96", letterSpacing: "0.05em" }}
            >
              Email
            </p>
            <p style={{ color: "#1a0e2e" }}>{userRecord.email}</p>
          </div>
          <div>
            <p
              className="text-xs font-medium uppercase mb-1"
              style={{ color: "#8a7f96", letterSpacing: "0.05em" }}
            >
              Plan
            </p>
            <div className="flex items-center gap-3">
              <p style={{ color: "#1a0e2e" }}>
                {TIER_LABELS[userRecord.tier] || userRecord.tier}
              </p>
              {isFree && (
                <Link
                  href="/pricing"
                  className="px-3 py-1 rounded-lg text-xs font-medium"
                  style={{ background: "#6b4c9a", color: "#faf7f2" }}
                >
                  Upgrade
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Category selector — free tier only */}
      {isFree && (
        <CategoryPicker currentCategory={userRecord.category} />
      )}

      {/* Discussion Style — paid only */}
      {!isFree && (
        <DiscussionStylePicker
          currentStyle={userRecord.discussion_style}
        />
      )}

      {/* Intro Music — paid only */}
      {!isFree && (
        <IntroMusicPicker
          currentTrack={userRecord.intro_music}
          isPower={userRecord.tier === "power"}
        />
      )}

      {/* Voices — paid only */}
      {!isFree && (
        <VoicePicker
          currentHostVoice={userRecord.host_voice}
          currentGuestVoice={userRecord.guest_voice}
          isPower={userRecord.tier === "power"}
        />
      )}

      {/* Personalized Name — power only */}
      {isPower && (
        <NamePronunciation
          currentDisplayName={userRecord.display_name}
          currentPhonetic={userRecord.display_name_phonetic}
        />
      )}

      {/* Collections — power only */}
      {isPower && (
        <CollectionsManager
          rssToken={userRecord.rss_token}
          initialCollections={collectionsWithCounts}
        />
      )}

      {/* Timezone */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
          Timezone
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Your daily podcast will be generated based on this timezone.
        </p>
        <form action={updateTimezone}>
          <div className="flex gap-3">
            <select
              key={userRecord.timezone}
              name="timezone"
              defaultValue={userRecord.timezone}
              className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              style={{
                background: "#faf7f2",
                border: "1px solid rgba(45, 27, 78, 0.15)",
                color: "#1a0e2e",
              }}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
            </select>
            <SaveButton />
          </div>
        </form>
      </div>

      {/* Generation Time — paid only */}
      {!isFree && (
        <div
          className="bg-white rounded-2xl p-6"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
            Podcast Generation Time
          </h2>
          <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
            Your podcast will be generated at this time each day.
          </p>
          <form action={updateGenerationHour}>
            <div className="flex gap-3">
              <select
                key={userRecord.generation_hour}
                name="generation_hour"
                defaultValue={userRecord.generation_hour}
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
                style={{
                  background: "#faf7f2",
                  border: "1px solid rgba(45, 27, 78, 0.15)",
                  color: "#1a0e2e",
                }}
              >
                {GENERATION_HOURS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>
              <SaveButton />
            </div>
          </form>
        </div>
      )}

      {/* Forwarding Address — paid only */}
      {!isFree && (
        <div
          className="bg-white rounded-2xl p-6"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
            Forwarding Address
          </h2>
          <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
            Forward your newsletters to this email address.
          </p>
          <div
            className="flex items-center gap-2 p-3 rounded-xl"
            style={{ background: "rgba(45, 27, 78, 0.04)" }}
          >
            <code className="flex-1 text-sm break-all" style={{ color: "#1a0e2e" }}>
              {userRecord.forwarding_address}
            </code>
            <CopyButton text={userRecord.forwarding_address} />
          </div>
        </div>
      )}

      {/* RSS Feed */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
          RSS Feed
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Add this URL to your podcast app to listen to your daily episodes.
        </p>
        <div
          className="flex items-center gap-2 p-3 rounded-xl"
          style={{ background: "rgba(45, 27, 78, 0.04)" }}
        >
          <code className="flex-1 text-sm break-all" style={{ color: "#1a0e2e" }}>
            {feedUrl}
          </code>
          <CopyButton text={feedUrl} />
        </div>
      </div>

      {/* Recent Emails — paid only */}
      {!isFree && (
        <div
          className="bg-white rounded-2xl p-6"
          style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
        >
          <h2 className="text-lg font-semibold mb-4" style={{ color: "#1a0e2e" }}>
            Recent Emails
          </h2>
          {!recentEmails || recentEmails.length === 0 ? (
            <p className="text-sm" style={{ color: "#8a7f96" }}>
              No emails received yet.
            </p>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: "1px solid rgba(45, 27, 78, 0.06)" }}
            >
              {recentEmails.map((email, i) => (
                <div
                  key={email.id}
                  className="p-4 flex items-center justify-between"
                  style={
                    i < recentEmails.length - 1
                      ? { borderBottom: "1px solid rgba(45, 27, 78, 0.06)" }
                      : undefined
                  }
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate" style={{ color: "#1a0e2e" }}>
                      {email.from_name || email.from_email}
                    </p>
                    <p className="text-sm truncate" style={{ color: "#5a4d6b" }}>
                      {email.subject || "(no subject)"}
                    </p>
                    <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                      {new Date(email.received_at).toLocaleString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span
                    className="ml-4 flex-shrink-0 px-2 py-1 rounded-lg text-xs font-medium"
                    style={
                      email.processed_at
                        ? {
                            background: "rgba(74, 157, 107, 0.1)",
                            color: "#4a9d6b",
                          }
                        : {
                            background: "rgba(45, 27, 78, 0.06)",
                            color: "#8a7f96",
                          }
                    }
                  >
                    {email.processed_at ? "Processed" : "Pending"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Delete Account */}
      <DeleteAccountSection />
    </div>
  );
}
