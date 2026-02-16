import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { GmailConfirmation } from "./gmail-confirmation";

type UserRecord = {
  forwarding_address: string;
};

type SourceRow = {
  sender_email: string;
  sender_name: string | null;
};

export default async function ManualSetupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: userRecord } = await supabase
    .from("users")
    .select("forwarding_address")
    .eq("id", user.id)
    .single<UserRecord>();

  if (!userRecord) {
    redirect("/dashboard");
  }

  // Fetch newsletter sources for the filter string
  const admin = createAdminClient();
  const { data: sources } = await admin
    .from("newsletter_sources")
    .select("sender_email, sender_name")
    .eq("user_id", user.id)
    .order("first_seen_at", { ascending: true });

  const senderEmails = (sources || []).map((s: SourceRow) => s.sender_email);
  const filterString =
    senderEmails.length > 0
      ? `from:(${senderEmails.join(" OR ")})`
      : "from:(newsletter1@example.com OR newsletter2@example.com)";

  const stepNumberStyle = {
    background:
      "linear-gradient(135deg, rgba(107, 76, 154, 0.15), rgba(157, 124, 216, 0.2))",
    color: "#6b4c9a",
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <Link
          href="/dashboard/onboarding"
          className="text-sm transition-colors hover:opacity-70"
          style={{ color: "#6b4c9a" }}
        >
          &larr; Back
        </Link>
        <h1
          className="text-2xl mt-2"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Manual Gmail Setup Guide
        </h1>
        <p className="text-sm mt-1" style={{ color: "#5a4d6b" }}>
          Follow these steps to set up automatic forwarding in Gmail.
        </p>
      </div>

      {/* Step 1: Add Forwarding Address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Step 1: Add Your Forwarding Address
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Gmail needs to know about your Daily Gist address before you can use
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
              In Gmail, click the <strong>gear icon</strong> (top right) &rarr;{" "}
              <strong>See all settings</strong>
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
              Go to the <strong>Forwarding and POP/IMAP</strong> tab
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
              Click <strong>&quot;Add a forwarding address&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              4
            </span>
            <div style={{ color: "#1a0e2e" }}>
              <p className="mb-2">Paste your Daily Gist forwarding address:</p>
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: "rgba(45, 27, 78, 0.04)" }}
              >
                <code
                  className="flex-1 text-sm break-all"
                  style={{ color: "#1a0e2e" }}
                >
                  {userRecord.forwarding_address}
                </code>
                <CopyButton text={userRecord.forwarding_address} />
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              5
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>Next &rarr; Proceed &rarr; OK</strong>
            </span>
          </li>
        </ol>
        <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
          You do NOT need to enable &quot;Forward a copy of incoming
          mail&quot; &mdash; just add the address so it appears in filters.
        </p>
      </div>

      {/* Step 2: Confirm Forwarding Address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Step 2: Confirm the Forwarding Address
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Gmail sends a confirmation email to verify the forwarding address. We
          capture it automatically &mdash; click the confirmation link below
          when it appears:
        </p>
        <GmailConfirmation />
        <p className="text-xs mt-4" style={{ color: "#8a7f96" }}>
          After confirming, refresh Gmail so the forwarding address becomes
          available in filters.
        </p>
      </div>

      {/* Step 3: Create Gmail Filter */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Step 3: Create a Gmail Filter
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Create a filter to automatically forward your newsletters:
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
              <strong>
                Settings (gear icon) &rarr; See all settings &rarr; Filters and
                Blocked Addresses
              </strong>
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
              Click <strong>&quot;Create a new filter&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              3
            </span>
            <div style={{ color: "#1a0e2e" }}>
              <p className="mb-2">
                In the <strong>&quot;From&quot;</strong> field, paste this:
              </p>
              <div
                className="flex items-center gap-2 p-3 rounded-xl"
                style={{ background: "rgba(45, 27, 78, 0.04)" }}
              >
                <code
                  className="flex-1 text-sm break-all"
                  style={{ color: "#1a0e2e" }}
                >
                  {filterString}
                </code>
                <CopyButton text={filterString} />
              </div>
              {senderEmails.length === 0 && (
                <p className="text-xs mt-2" style={{ color: "#8a7f96" }}>
                  Replace the example addresses with your actual newsletter
                  sender addresses, separated by OR.
                </p>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              4
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong> (bottom of the
              search dialog)
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
              Daily Gist address ({userRecord.forwarding_address})
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              6
            </span>
            <div style={{ color: "#1a0e2e" }}>
              <p>
                Check <strong>&quot;Skip the Inbox (Archive it)&quot;</strong>
              </p>
              <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                Recommended &mdash; keeps your inbox clean. Newsletters go
                straight to your label and Daily Gist instead of cluttering your
                inbox.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              7
            </span>
            <div style={{ color: "#1a0e2e" }}>
              <p>
                Check <strong>&quot;Apply the label&quot;</strong> and choose or
                create a label (e.g. &quot;Newsletters&quot;)
              </p>
              <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                This keeps all your newsletters organized in one place. You can
                still find them in Gmail under this label anytime.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              8
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong> &mdash; done! You
              can edit this filter anytime to add or remove newsletters.
            </span>
          </li>
        </ol>
      </div>

      {/* Done */}
      <div
        className="rounded-2xl p-6 text-center"
        style={{
          background: "rgba(107, 76, 154, 0.06)",
          border: "1px solid rgba(107, 76, 154, 0.15)",
        }}
      >
        <p className="text-sm" style={{ color: "#5a4d6b" }}>
          Once your filter is set up, new newsletters will be forwarded
          automatically.
        </p>
        <Link
          href="/dashboard/onboarding"
          className="inline-block mt-4 px-5 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "#6b4c9a", color: "#faf7f2" }}
        >
          Done
        </Link>
      </div>
    </div>
  );
}
