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

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link
          href="/dashboard"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold mt-2">Set Up Your Daily Gist</h1>
        <p className="text-gray-600 mt-1">
          Follow these steps to start receiving your newsletters as a daily
          podcast.
        </p>
      </div>

      {/* Step 1: Forwarding Address */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">
          Step 1: Your Forwarding Address
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Forward your newsletters to this unique email address:
        </p>
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg">
          <code className="flex-1 text-sm break-all">
            {userRecord.forwarding_address}
          </code>
          <CopyButton text={userRecord.forwarding_address} />
        </div>
      </div>

      {/* Step 2: Verify Forwarding Address */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">
          Step 2: Verify Forwarding Address in Gmail
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Gmail requires you to verify a forwarding address before you can use
          it in filters:
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              1
            </span>
            <span>
              In Gmail, go to{" "}
              <strong>Settings &rarr; Forwarding and POP/IMAP</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              2
            </span>
            <span>
              Click <strong>&quot;Add a forwarding address&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              3
            </span>
            <span>
              Paste your Daily Gist forwarding address from Step 1
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              4
            </span>
            <span>
              Click <strong>Next &rarr; Proceed &rarr; OK</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              5
            </span>
            <span>
              Gmail sends a confirmation email &mdash; go to your{" "}
              <Link href="/dashboard" className="text-blue-600 hover:underline">
                Daily Gist dashboard
              </Link>{" "}
              and click the confirmation link in the notification
            </span>
          </li>
        </ol>
        <p className="text-gray-500 text-xs mt-4">
          You do NOT need to enable &quot;Forward a copy of incoming
          mail&quot; &mdash; just verify the address so it appears in filters.
        </p>
      </div>

      {/* Step 3: Gmail Filter Setup */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">
          Step 3: Set Up Gmail Filters
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Create a filter for each newsletter you want to include in your daily
          podcast:
        </p>
        <ol className="space-y-4 text-sm">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              1
            </span>
            <span>
              In Gmail, go to{" "}
              <strong>Settings &rarr; Filters and Blocked Addresses</strong>{" "}
              &rarr; Create a new filter
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              2
            </span>
            <span>
              In the <strong>&quot;From&quot;</strong> field, enter the email
              address of the newsletter you want to forward
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              3
            </span>
            <span>
              Click <strong>&quot;Create filter&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              4
            </span>
            <span>
              Check <strong>&quot;Forward it to&quot;</strong> and select your
              Daily Gist forwarding address
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              5
            </span>
            <span>
              Optionally check <strong>&quot;Apply the label&quot;</strong> and
              choose or create a label (e.g. &quot;Newsletters&quot;) to keep
              them organized in one place
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              6
            </span>
            <span>
              Optionally check <strong>&quot;Skip the Inbox&quot;</strong> to
              keep your inbox clean (recommended)
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              7
            </span>
            <span>
              Click <strong>&quot;Create filter&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-xs font-medium">
              8
            </span>
            <span>Repeat for each newsletter you want to include</span>
          </li>
        </ol>
      </div>

      {/* Step 4: RSS Feed */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">
          Step 4: Add Your RSS Feed
        </h2>
        <p className="text-gray-600 text-sm mb-4">
          Add this private RSS feed URL to your favorite podcast app:
        </p>
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg mb-6">
          <code className="flex-1 text-sm break-all">{feedUrl}</code>
          <CopyButton text={feedUrl} />
        </div>

        <h3 className="font-medium mb-3">Instructions by App</h3>
        <div className="space-y-4 text-sm">
          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              Apple Podcasts
            </summary>
            <div className="mt-2 pl-4 text-gray-600 space-y-1">
              <p>1. Open Apple Podcasts on your Mac</p>
              <p>
                2. Go to File &rarr; Add a Show by URL (or press Cmd+Shift+U)
              </p>
              <p>3. Paste your RSS feed URL and click Follow</p>
              <p>4. The podcast will sync to your iPhone automatically</p>
            </div>
          </details>

          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              Overcast
            </summary>
            <div className="mt-2 pl-4 text-gray-600 space-y-1">
              <p>1. Open Overcast and tap the + button</p>
              <p>2. Tap &quot;Add URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>

          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              Pocket Casts
            </summary>
            <div className="mt-2 pl-4 text-gray-600 space-y-1">
              <p>1. Open Pocket Casts and tap Search</p>
              <p>2. Scroll down and tap &quot;Submit RSS&quot;</p>
              <p>3. Paste your RSS feed URL and tap Find</p>
              <p>4. Tap Subscribe</p>
            </div>
          </details>

          <details className="group">
            <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900">
              Castro
            </summary>
            <div className="mt-2 pl-4 text-gray-600 space-y-1">
              <p>1. Open Castro and go to Library</p>
              <p>2. Tap the + button, then &quot;Add by URL&quot;</p>
              <p>3. Paste your RSS feed URL and tap Add</p>
            </div>
          </details>
        </div>
      </div>

      {/* All Done */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <h2 className="text-lg font-semibold text-green-800 mb-2">
          You&apos;re All Set!
        </h2>
        <p className="text-green-700 text-sm">
          Once newsletters start arriving, we&apos;ll generate your first
          podcast episode. Check back tomorrow morning!
        </p>
        <Link
          href="/dashboard"
          className="inline-block mt-4 px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
