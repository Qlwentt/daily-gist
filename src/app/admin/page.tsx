export const dynamic = "force-dynamic";

import { createAdminClient } from "@/lib/supabase/admin";
import { AdminRulesTable } from "@/components/admin-rules-table";
import { AdminEmailsTable } from "@/components/admin-emails-table";

type SystemUser = {
  id: string;
  email: string;
  forwarding_address: string;
  rss_token: string;
};

type RuleRow = {
  id: string;
  sender_email: string;
  from_name_pattern: string | null;
  subject_pattern: string | null;
  category: string;
  priority: number;
  created_at: string;
};

type RawEmailRow = {
  from_name: string | null;
  from_email: string;
  subject: string | null;
};

export default async function AdminPage() {
  const FREE_TIER_USER_ID = process.env.FREE_TIER_USER_ID;

  if (!FREE_TIER_USER_ID) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "#5a4d6b" }}>
          FREE_TIER_USER_ID environment variable not set.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();

  const [{ data: systemUser }, { data: rules }, { data: rawEmails }] =
    await Promise.all([
      admin
        .from("users")
        .select("id, email, forwarding_address, rss_token")
        .eq("id", FREE_TIER_USER_ID)
        .single<SystemUser>(),
      admin
        .from("categorization_rules")
        .select(
          "id, sender_email, from_name_pattern, subject_pattern, category, priority, created_at"
        )
        .eq("user_id", FREE_TIER_USER_ID)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .returns<RuleRow[]>(),
      admin
        .from("raw_emails")
        .select("from_name, from_email, subject")
        .eq("user_id", FREE_TIER_USER_ID)
        .order("received_at", { ascending: false })
        .returns<RawEmailRow[]>(),
    ]);

  if (!systemUser) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "#5a4d6b" }}>System user not found.</p>
      </div>
    );
  }

  // Build distinct sender+subject pairs with counts
  const pairCounts = new Map<string, { from_name: string | null; from_email: string; subject: string; count: number }>();
  for (const email of rawEmails ?? []) {
    const subject = email.subject || "(no subject)";
    const key = `${email.from_email}|||${subject}`;
    const existing = pairCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      pairCounts.set(key, { from_name: email.from_name, from_email: email.from_email, subject, count: 1 });
    }
  }
  const emailPairs = [...pairCounts.values()].sort((a, b) =>
    a.from_email.localeCompare(b.from_email) || a.subject.localeCompare(b.subject)
  );

  // Deduplicated sender emails for the rule form's datalist
  const senderEmails = [
    ...new Set(emailPairs.map((p) => p.from_email)),
  ].sort();

  const rulesList = rules ?? [];
  const categoryCounts: Record<string, number> = {};
  for (const r of rulesList) {
    categoryCounts[r.category] = (categoryCounts[r.category] || 0) + 1;
  }

  // Unique categories for feed URLs
  const categories = [...new Set(rulesList.map((r) => r.category))].sort();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dailygist.fyi";
  const feedBaseUrl = `${appUrl}/api/feed/${systemUser.rss_token}`;

  return (
    <div className="space-y-8">
      <div>
        <h1
          className="text-2xl mb-1"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Admin
        </h1>
        <p className="text-sm" style={{ color: "#8a7f96" }}>
          System user: {systemUser.email} ({systemUser.forwarding_address})
        </p>
      </div>

      <AdminRulesTable
        initialRules={rulesList}
        senderEmails={senderEmails}
        feedBaseUrl={feedBaseUrl}
      />

      <div>
        <h2
          className="text-lg mb-4"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            letterSpacing: "-0.02em",
          }}
        >
          Received Emails
        </h2>
        <AdminEmailsTable emails={emailPairs} />
      </div>
    </div>
  );
}
