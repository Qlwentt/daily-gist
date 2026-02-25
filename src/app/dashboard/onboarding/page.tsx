import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";

type UserRecord = {
  forwarding_address: string;
  rss_token: string;
  onboarding_completed_at: string | null;
  tier: string;
  intro_music: string | null;
};

export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("forwarding_address, rss_token, onboarding_completed_at, tier, intro_music")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    redirect("/dashboard");
  }

  if (userRecord.onboarding_completed_at) {
    redirect("/dashboard");
  }

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;

  // Determine initial step based on user's progress
  const admin = createAdminClient();
  const { data: latestEpisode } = await admin
    .from("episodes")
    .select("id, status, audio_url, title, error_message, progress_stage")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let initialStep: 1 | 2 | 3 | 4 = 1;
  if (latestEpisode?.status === "queued" || latestEpisode?.status === "processing") {
    initialStep = 2;
  } else if (latestEpisode?.status === "ready" && latestEpisode.audio_url) {
    initialStep = 3;
  }

  return (
    <OnboardingFlow
      forwardingAddress={userRecord.forwarding_address}
      feedUrl={feedUrl}
      initialStep={initialStep}
      initialEpisode={latestEpisode}
      tier={userRecord.tier}
      currentIntroMusic={userRecord.intro_music}
    />
  );
}
