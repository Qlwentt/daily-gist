import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { OnboardingFlow } from "@/components/onboarding-flow";

type UserRecord = {
  forwarding_address: string;
  rss_token: string;
  onboarding_completed_at: string | null;
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
    .select("forwarding_address, rss_token, onboarding_completed_at")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    redirect("/dashboard");
  }

  if (userRecord.onboarding_completed_at) {
    redirect("/dashboard");
  }

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;

  return (
    <OnboardingFlow
      forwardingAddress={userRecord.forwarding_address}
      feedUrl={feedUrl}
    />
  );
}
