import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { GmailConfirmation } from "./gmail-confirmation";
import { ForwardingDoneButton } from "./forwarding-done-button";

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
      ? senderEmails.join(" OR ")
      : "newsletter1@example.com OR newsletter2@example.com";

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
          Follow these steps to set up automatic forwarding in Gmail. Takes
          about 5 minutes.
        </p>
      </div>

      {/* Step 1: Add forwarding address */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Step 1: Add Forwarding Address
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          First, register your Daily Gist address with Gmail so it can forward
          emails there.
        </p>

        <div className="space-y-2 text-sm">
          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              I don&apos;t have any forwarding addresses in Gmail yet
            </summary>
            <div className="mt-3 pl-4 space-y-4" style={{ color: "#5a4d6b" }}>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                    style={stepNumberStyle}
                  >
                    1
                  </span>
                  <span style={{ color: "#1a0e2e" }}>
                    In Gmail, click the <strong>gear icon</strong> &rarr;{" "}
                    <strong>&quot;See all settings&quot;</strong> &rarr;{" "}
                    <strong>&quot;Forwarding and POP/IMAP&quot;</strong> tab
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
                  <div style={{ color: "#1a0e2e" }}>
                    <p className="mb-2">Paste your Daily Gist address:</p>
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
                    4
                  </span>
                  <span style={{ color: "#1a0e2e" }}>
                    Click <strong>Next &rarr; Proceed &rarr; OK</strong>
                  </span>
                </li>
              </ol>
            </div>
          </details>

          <details className="group">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "#1a0e2e" }}
            >
              I already have a forwarding address in Gmail
            </summary>
            <div className="mt-3 pl-4 space-y-4" style={{ color: "#5a4d6b" }}>
              <p>
                Gmail hides the &quot;Add a forwarding address&quot; button
                once you have one. You&apos;ll add it during filter creation
                instead:
              </p>
              <ol className="space-y-4">
                <li className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                    style={stepNumberStyle}
                  >
                    1
                  </span>
                  <span style={{ color: "#1a0e2e" }}>
                    Open{" "}
                    <a
                      href="https://mail.google.com/mail/u/0/#settings/filters"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline font-medium"
                      style={{ color: "#6b4c9a" }}
                    >
                      Gmail Filters Settings
                    </a>
                    {" "}&rarr; <strong>&quot;Create a new filter&quot;</strong>
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
                    Type anything in the <strong>From</strong> field and click{" "}
                    <strong>&quot;Create filter&quot;</strong>
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
                    Click <strong>&quot;Add forwarding address&quot;</strong>{" "}
                    next to &quot;Forward it to&quot;
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
                    Gmail takes you to the Forwarding settings page. Click{" "}
                    <strong>&quot;Add a forwarding address&quot;</strong> again
                  </span>
                </li>
                <li className="flex gap-3">
                  <span
                    className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
                    style={stepNumberStyle}
                  >
                    5
                  </span>
                  <div style={{ color: "#1a0e2e" }}>
                    <p className="mb-2">Paste your Daily Gist address:</p>
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
                    6
                  </span>
                  <span style={{ color: "#1a0e2e" }}>
                    Click <strong>Next &rarr; Proceed &rarr; OK</strong>
                  </span>
                </li>
              </ol>
              <p className="text-xs" style={{ color: "#8a7f96" }}>
                Note: The filter you started is gone &mdash; that&apos;s OK.
                You&apos;ll create it in Step 3 below.
              </p>
            </div>
          </details>
        </div>
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
          Step 2: Confirm Forwarding
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Gmail sends a confirmation email to verify the forwarding address. We
          capture it automatically &mdash; click the confirmation link below
          when it appears:
        </p>
        <GmailConfirmation />
      </div>

      {/* Step 3: Create the filter */}
      <div
        className="bg-white rounded-2xl p-6"
        style={{ border: "1px solid rgba(45, 27, 78, 0.08)" }}
      >
        <h2
          className="text-lg font-semibold mb-2"
          style={{ color: "#1a0e2e" }}
        >
          Step 3: Create Filter
        </h2>
        <p className="text-sm mb-4" style={{ color: "#5a4d6b" }}>
          Now create a filter that forwards your newsletters to Daily Gist:
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
              Open{" "}
              <a
                href="https://mail.google.com/mail/u/0/#settings/filters"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium"
                style={{ color: "#6b4c9a" }}
              >
                Gmail Filters Settings
              </a>
              {" "}&rarr; <strong>&quot;Create a new filter&quot;</strong>
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              2
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
              {senderEmails.length === 0 ? (
                <p className="text-xs mt-2" style={{ color: "#8a7f96" }}>
                  Replace the example addresses with your actual newsletter
                  sender addresses, separated by OR.
                </p>
              ) : (
                <p className="text-xs mt-2" style={{ color: "#8a7f96" }}>
                  This list is built from newsletters you&apos;ve forwarded.
                  Want to add more? Forward one issue from each new newsletter
                  to your Daily Gist address, then refresh this page.
                </p>
              )}
            </div>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              3
            </span>
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong> (bottom right of
              the search box)
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
              Check <strong>&quot;Forward it to&quot;</strong> and select your
              Daily Gist address from the dropdown
            </span>
          </li>
          <li className="flex gap-3">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium"
              style={stepNumberStyle}
            >
              5
            </span>
            <div style={{ color: "#1a0e2e" }}>
              <p>
                Check{" "}
                <strong>&quot;Skip the Inbox (Archive it)&quot;</strong>
              </p>
              <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                Recommended &mdash; newsletters go straight to Daily Gist
                instead of cluttering your inbox. You can still find them
                under your label.
              </p>
            </div>
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
                Check{" "}
                <strong>&quot;Apply the label&quot;</strong> &rarr;{" "}
                <strong>&quot;New label...&quot;</strong> &rarr; name it{" "}
                <strong>&quot;Daily Gist&quot;</strong>
              </p>
              <p className="text-xs mt-1" style={{ color: "#8a7f96" }}>
                This labels the emails so you can still browse them in Gmail
                anytime &mdash; look for the &quot;Daily Gist&quot; label in
                your sidebar.
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
            <span style={{ color: "#1a0e2e" }}>
              Click <strong>&quot;Create filter&quot;</strong> &mdash; done!
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
        <ForwardingDoneButton />
      </div>
    </div>
  );
}
