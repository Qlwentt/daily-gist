import { createAdminClient } from "@/lib/supabase/admin";

export type InboundEmail = {
  to: string;
  from: string;
  fromName: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  date?: string;
};

/**
 * Extract the original sender from a Gmail-forwarded email body.
 * Gmail inserts a block like:
 *   ---------- Forwarded message ---------
 *   From: Display Name <email@example.com>
 */
function parseForwardedSender(
  textBody: string
): { name: string; email: string } | null {
  const fwdIdx = textBody.lastIndexOf("---------- Forwarded message");
  if (fwdIdx === -1) return null;

  const after = textBody.slice(fwdIdx);
  // Match "From: Name <email>" or "From: email@domain"
  const match = after.match(
    /^From:\s*(.+?)\s*<([^>]+)>/m
  );
  if (match) {
    return { name: match[1].trim(), email: match[2].trim().toLowerCase() };
  }

  // Fallback: "From: email@domain" with no angle brackets
  const emailOnly = after.match(
    /^From:\s*([^\s@]+@[^\s]+)/m
  );
  if (emailOnly) {
    return { name: "", email: emailOnly[1].trim().toLowerCase() };
  }

  return null;
}

type UserRow = {
  id: string;
  newsletter_limit: number;
};

type SourceRow = {
  id: string;
};

export async function ingestEmail(
  email: InboundEmail
): Promise<{ status: number; body: Record<string, string> }> {
  const supabase = createAdminClient();

  // Look up user by forwarding address
  console.log("[ingest] Looking up user for forwarding_address:", email.to.toLowerCase());

  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, newsletter_limit")
    .eq("forwarding_address", email.to.toLowerCase())
    .single<UserRow>();

  if (!user) {
    console.log("[ingest] No matching user found. Error:", userError?.message);
    // No matching user — return 200 so Postmark doesn't retry
    return { status: 200, body: { message: "No matching user" } };
  }

  console.log("[ingest] Matched user:", user.id);

  // Gmail forwarding confirmation — show full email body so user can find the code
  if (email.from.toLowerCase() === "forwarding-noreply@google.com") {
    const body = email.textBody || email.htmlBody || "";

    await supabase.from("notifications").insert({
      user_id: user.id,
      type: "gmail_forwarding_confirmation",
      message: body
        ? `Gmail forwarding confirmation:\n\n${body}`
        : "We received a Gmail forwarding confirmation email but it was empty. Check your Gmail inbox for the confirmation.",
    });

    return { status: 200, body: { message: "Gmail confirmation handled" } };
  }

  // If this is a forwarded email, extract the original sender
  const isForwarded =
    email.subject.match(/^Fwd?:\s*/i) ||
    email.textBody.includes("---------- Forwarded message");

  if (isForwarded) {
    const original = parseForwardedSender(email.textBody);
    if (original) {
      email.from = original.email;
      email.fromName = original.name;
      console.log("[ingest] Extracted original sender:", original.name, original.email);
    }
    email.subject = email.subject.replace(/^Fwd?:\s*/i, "");
  }

  // Check if this sender already exists as a source
  const { data: existingSource } = await supabase
    .from("newsletter_sources")
    .select("id")
    .eq("user_id", user.id)
    .eq("sender_email", email.from.toLowerCase())
    .single<SourceRow>();

  // If sender is new, check the newsletter limit
  if (!existingSource && user.newsletter_limit > 0) {
    const { count } = await supabase
      .from("newsletter_sources")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (count !== null && count >= user.newsletter_limit) {
      // At limit — store notification and skip
      await supabase.from("notifications").insert({
        user_id: user.id,
        type: "newsletter_limit_reached",
        message: `We received a newsletter from ${email.fromName || email.from} but couldn't process it — you've hit your ${user.newsletter_limit} newsletter limit. Upgrade your plan for more newsletters.`,
      });

      return { status: 200, body: { message: "Newsletter limit reached" } };
    }
  }

  // Upsert newsletter source
  let sourceId = existingSource?.id;

  if (!sourceId) {
    const { data: newSource } = await supabase
      .from("newsletter_sources")
      .insert({
        user_id: user.id,
        sender_email: email.from.toLowerCase(),
        sender_name: email.fromName || null,
      })
      .select("id")
      .single<SourceRow>();

    sourceId = newSource?.id;
  }

  // Store the raw email
  const { error: insertError } = await supabase.from("raw_emails").insert({
    user_id: user.id,
    source_id: sourceId || null,
    from_email: email.from.toLowerCase(),
    from_name: email.fromName || null,
    subject: email.subject || null,
    text_body: email.textBody || null,
    html_body: email.htmlBody || null,
    received_at: email.date || new Date().toISOString(),
  });

  if (insertError) {
    console.error("[ingest] Failed to insert raw_email:", insertError.message);
    return { status: 200, body: { message: "Insert failed" } };
  }

  console.log("[ingest] Email stored for user:", user.id, "subject:", email.subject);
  return { status: 200, body: { message: "Email stored" } };
}
