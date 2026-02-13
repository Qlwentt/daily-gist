import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CopyButton } from "@/components/copy-button";
import { SaveButton } from "@/components/save-button";

type UserRecord = {
  email: string;
  forwarding_address: string;
  rss_token: string;
  timezone: string;
  tier: string;
  generation_hour: number;
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
  free: "Free (DIY)",
  pro: "Pro",
  power: "Power",
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

  const { data: userRecord } = await supabase
    .from("users")
    .select("email, forwarding_address, rss_token, timezone, tier, generation_hour")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    redirect("/dashboard");
  }

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-gray-600 mt-1">
          Manage your Daily Gist account settings
        </p>
      </div>

      {/* Account Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Account</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Email</p>
            <p className="text-gray-900">{userRecord.email}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Plan</p>
            <p className="text-gray-900">
              {TIER_LABELS[userRecord.tier] || userRecord.tier}
            </p>
          </div>
        </div>
      </div>

      {/* Timezone */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Timezone</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your daily podcast will be generated based on this timezone.
        </p>
        <form action={updateTimezone}>
          <div className="flex gap-3">
            <select
              key={userRecord.timezone}
              name="timezone"
              defaultValue={userRecord.timezone}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Generation Time */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Podcast Generation Time</h2>
        <p className="text-sm text-gray-600 mb-4">
          Your podcast will be generated at this time each day.
        </p>
        <form action={updateGenerationHour}>
          <div className="flex gap-3">
            <select
              key={userRecord.generation_hour}
              name="generation_hour"
              defaultValue={userRecord.generation_hour}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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

      {/* Forwarding Address */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Forwarding Address</h2>
        <p className="text-sm text-gray-600 mb-4">
          Forward your newsletters to this email address.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
          <code className="flex-1 text-sm break-all">
            {userRecord.forwarding_address}
          </code>
          <CopyButton text={userRecord.forwarding_address} />
        </div>
      </div>

      {/* RSS Feed */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">RSS Feed</h2>
        <p className="text-sm text-gray-600 mb-4">
          Add this URL to your podcast app to listen to your daily episodes.
        </p>
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
          <code className="flex-1 text-sm break-all">{feedUrl}</code>
          <CopyButton text={feedUrl} />
        </div>
      </div>

      {/* Sign Out */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Sign Out</h2>
        <p className="text-sm text-gray-600 mb-4">
          Sign out of your Daily Gist account.
        </p>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
