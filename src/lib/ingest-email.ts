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
  const { data: user } = await supabase
    .from("users")
    .select("id, newsletter_limit")
    .eq("forwarding_address", email.to.toLowerCase())
    .single<UserRow>();

  if (!user) {
    // No matching user — return 200 so Postmark doesn't retry
    return { status: 200, body: { message: "No matching user" } };
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
  await supabase.from("raw_emails").insert({
    user_id: user.id,
    source_id: sourceId || null,
    from_email: email.from.toLowerCase(),
    from_name: email.fromName || null,
    subject: email.subject || null,
    text_body: email.textBody || null,
    html_body: email.htmlBody || null,
    received_at: email.date || new Date().toISOString(),
  });

  return { status: 200, body: { message: "Email stored" } };
}
