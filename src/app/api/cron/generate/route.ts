import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateEpisodeForUser } from "@/lib/generate-episode";

type UserIdRow = {
  user_id: string;
};

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Find all users with unprocessed emails
  const { data: usersWithEmails, error } = await supabase
    .from("raw_emails")
    .select("user_id")
    .is("processed_at", null)
    .returns<UserIdRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Failed to query emails" },
      { status: 500 }
    );
  }

  // Deduplicate user IDs
  const userIds = [...new Set((usersWithEmails || []).map((r) => r.user_id))];

  if (userIds.length === 0) {
    return NextResponse.json({ message: "No users with pending emails" });
  }

  const results: { userId: string; status: string; error?: string }[] = [];

  for (const userId of userIds) {
    try {
      await generateEpisodeForUser(userId);
      results.push({ userId, status: "success" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      results.push({ userId, status: "failed", error: message });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
