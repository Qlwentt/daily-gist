import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";

type UserRecord = {
  forwarding_address: string;
  rss_token: string;
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
    .select("forwarding_address, rss_token")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    redirect("/dashboard");
  }

  const feedUrl = `${process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi"}/api/feed/${userRecord.rss_token}`;

  const stepNumberStyle = {
    background:
      "linear-gradient(135deg, rgba(107, 76, 154, 0.15), rgba(157, 124, 216, 0.2))",
    color: "#6b4c9a",
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm transition-colors hover:opacity-70"
          style={{ color: "#6b4c9a" }}
        >
          &larr; Back to Dashboard
        </Link>
        <h1
          className="text-2xl mt-2"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Set Up Your Daily Gist
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
          Follow these steps to start receiving your newsletters as a daily
          podcast. Currently we only support Gmail.
        </p>
      </div>

      {/* Step 1: Forwarding Address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          Step 1: Your Forwarding Address
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Forward your newsletters to this unique email address:
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

      {/* Step 2: Verify Forwarding Address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          Step 2: Verify Forwarding Address in Gmail
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Gmail requires you to verify a forwarding address before you can use
          it in filters:
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              1
            </span>
            <span style={{ color: "#1a0e2e" }}>
              In Gmail, go to{" "}
              <strong>Settings &rarr; Forwarding and POP/IMAP</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              2
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Add a forwarding address&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              3
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Paste your Daily Gist forwarding address from Step 1
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              4
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>Next &rarr; Proceed &rarr; OK</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              5
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Gmail sends a confirmation email &mdash; go to your{" "}
              <Link
                href="/dashboard"
                className="hover:underline"
                style={{ color: "#6b4c9a" }}
              >
                Daily Gist dashboard
              </Link>{" "}
              and click the confirmation link in the notification
            </span>
          </li>
        </ol>
        <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
          You do NOT need to enable &quot;Forward a copy of incoming
          mail&quot; &mdash; just verify the address so it appears in filters.
        </p>
      </div>

      {/* Step 3: Gmail Filter Setup */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          Step 3: Set Up Gmail Filters
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Create a single filter to forward all your newsletters:
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              1
            </span>
            <span style={{ color: "#1a0e2e" }}>
              <strong>Refresh Gmail</strong> so the verified forwarding address
              is available
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              2
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Go to{" "}
              <strong>Settings (Gear icon) &rarr; See all settings &rarr; Filters and Blocked Addresses</strong>{" "}
              &rarr; Create a new filter
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              3
            </span>
            <span style={{ color: "#1a0e2e" }}>
              In the <strong>&quot;From&quot;</strong> field, enter all your
              newsletter addresses separated by{" "}
              <strong>OR</strong>, e.g.:<br />
              <code
                className="text-xs px-1.5 py-0.5 rounded mt-1 inline-block"
                style={{ background: "rgba(45, 27, 78, 0.06)" }}
              >
                news@example.com OR digest@other.com OR weekly@another.com
              </code>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              4
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              5
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Check <strong>&quot;Forward it to&quot;</strong> and select your
              Daily Gist forwarding address
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              6
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Optionally check <strong>&quot;Apply the label&quot;</strong> and
              choose or create a label (e.g. &quot;Newsletters&quot;) to keep
              them organized in one place
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              7
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Optionally check <strong>&quot;Skip the Inbox&quot;</strong> to
              keep your inbox clean (recommended)
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              8
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong> &mdash; you can
              edit this filter later to add more newsletters
            </span>
          </li>
        </ol>
        <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
          Want your first podcast today? Search Gmail for today&apos;s
          newsletters and forward them to your Daily Gist address above.
          The filter only applies to future emails.
        </p>
      </div>

      {/* Step 4: Timezone */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          Step 4: Set Your Timezone
        </h2>
        <p className="text-sm" style={{ color: "#5a4d6b" }}>
          Your daily podcast is generated based on your timezone. Head to{" "}
          <Link
            href="/dashboard/settings"
            className="hover:underline"
            style={{ color: "#6b4c9a" }}
          >
            Settings
          </Link>{" "}
          to make sure it&apos;s correct.
        </p>
      </div>

      {/* Step 5: RSS Feed */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          Step 5: Add Your RSS Feed
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Add this private RSS feed URL to your favorite podcast app:
        </p>
        <div
          className="flex items-center gap-2 p-3 rounded-xl mb-6"
          style={{ background: "rgba(45, 27, 78, 0.04)" }}
        >
          <code className="flex-1 text-sm break-all" style={{ color: "#1a0e2e" }}>
            {feedUrl}
          </code>
          <CopyButton text={feedUrl} />
        </div>

        <h3 className="font-medium mb-3" style={{ color: "#1a0e2e" }}>
          Instructions by App
        </h3>
        <div className="space-y-4 text-sm">
          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Apple Podcasts
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Apple Podcasts on your Mac</p>
              <p>
                2. Go to File &rarr; Add a Show by URL (or press Cmd+Shift+U)
              </p>
              <p>3. Paste your RSS feed URL and click Follow</p>
              <p>4. The podcast will sync to your iPhone automatically</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Overcast
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Overcast and tap the + button</p>
              <p>2. Tap &quot;Add URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Pocket Casts
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Pocket Casts and tap Search</p>
              <p>2. Scroll down and tap &quot;Submit RSS&quot;</p>
              <p>3. Paste your RSS feed URL and tap Find</p>
              <p>4. Tap Subscribe</p>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              Castro
            </summary>
            <div className="mt-2 pl-4 space-y-1" style={{ color: "#5a4d6b" }}>
              <p>1. Open Castro and go to Library</p>
              <p>2. Tap the + button, then &quot;Add by URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>
        </div>
      </div>

      {/* All Done */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: "rgba(107, 76, 154, 0.06)",
          border: "1px solid rgba(107, 76, 154, 0.15)",
        }}
      >
        <h2 className="text-lg font-semibold mb-2" style={{ color: "#1a0e2e" }}>
          You&apos;re All Set!
        </h2>
        <p className="text-sm" style={{ color: "#5a4d6b" }}>
          Once newsletters start arriving, we&apos;ll generate your first
          podcast episode. Check back tomorrow morning!
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "#1a0e2e", color: "#faf7f2" }}
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
