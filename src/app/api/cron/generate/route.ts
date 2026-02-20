import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  formatEmailsForPodcast,
  type RawEmailRow,
} from "@/lib/generate-episode";
import {
  getCurrentHourInTimezone,
  getTodayInTimezone,
  getFormattedDateInTimezone,
} from "@/lib/date-utils";

type UserIdRow = {
  user_id: string;
};

type UserRow = {
  id: string;
  email: string;
  timezone: string;
  generation_hour: number;
};

type FailedEpisodeRow = {
  id: string;
  user_id: string;
  date: string;
  retry_attempts: number;
};

const MAX_RETRY_ATTEMPTS = 3;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceUrl = process.env.PODCAST_GENERATOR_URL;
  const apiKey = process.env.GENERATOR_API_KEY;

  if (!serviceUrl || !apiKey) {
    return NextResponse.json(
      { error: "PODCAST_GENERATOR_URL or GENERATOR_API_KEY not configured" },
      { status: 500 }
    );
  }

  const supabase = createAdminClient();

  let triggered = 0;
  let retried = 0;
  const errors: { userId: string; error: string }[] = [];

  // -----------------------------------------------------------------------
  // Phase 1: Trigger new episodes for users at their generation hour
  // -----------------------------------------------------------------------

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
  const candidateUserIds = [
    ...new Set((usersWithEmails || []).map((r) => r.user_id)),
  ];

  if (candidateUserIds.length > 0) {
    // Fetch timezone and generation_hour for candidate users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, timezone, generation_hour")
      .in("id", candidateUserIds)
      .returns<UserRow[]>();

    if (usersError || !users) {
      return NextResponse.json(
        { error: "Failed to query users" },
        { status: 500 }
      );
    }

    // Filter to users whose current hour matches their generation_hour
    const eligibleUsers = users.filter((u) => {
      const currentHour = getCurrentHourInTimezone(u.timezone);
      return currentHour === u.generation_hour;
    });

    const userIds = eligibleUsers.map((u) => u.id);
    const userMap = new Map(eligibleUsers.map((u) => [u.id, u]));

    for (const userId of userIds) {
      try {
        // Fetch unprocessed emails for this user
        const { data: emails, error: fetchError } = await supabase
          .from("raw_emails")
          .select("id, from_name, from_email, subject, text_body, html_body")
          .eq("user_id", userId)
          .is("processed_at", null)
          .order("received_at", { ascending: true })
          .returns<RawEmailRow[]>();

        if (fetchError) {
          errors.push({ userId, error: `Failed to fetch emails: ${fetchError.message}` });
          continue;
        }

        if (!emails || emails.length === 0) {
          continue;
        }

        const userTimezone = userMap.get(userId)!.timezone;
        const today = getTodayInTimezone(userTimezone);
        const title = `Your Daily Gist — ${getFormattedDateInTimezone(userTimezone)}`;

        // Create episode record in 'processing' state
        const { data: episode, error: insertError } = await supabase
          .from("episodes")
          .upsert(
            {
              user_id: userId,
              date: today,
              title,
              status: "processing",
            },
            { onConflict: "user_id,date" }
          )
          .select("id")
          .single<{ id: string }>();

        if (insertError || !episode) {
          errors.push({
            userId,
            error: `Failed to create episode: ${insertError?.message || "Unknown"}`,
          });
          continue;
        }

        const newsletterText = formatEmailsForPodcast(emails);
        const emailIds = emails.map((e) => e.id);
        const storagePath = `${userId}/${today}.mp3`;
        const userEmail = userMap.get(userId)!.email;

        // Await the 202 from Railway — it responds immediately before doing work
        await fetch(`${serviceUrl}/generate-and-store`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            user_id: userId,
            newsletter_text: newsletterText,
            episode_id: episode.id,
            email_ids: emailIds,
            storage_path: storagePath,
            date: today,
            user_email: userEmail,
            target_length_minutes: 10, // TODO: derive from user tier/preference
          }),
        });

        triggered++;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        errors.push({ userId, error: message });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Phase 2: Retry failed episodes (any hour — retries aren't time-gated)
  // -----------------------------------------------------------------------

  const { data: failedEpisodes, error: failedError } = await supabase
    .from("episodes")
    .select("id, user_id, date, retry_attempts")
    .eq("status", "failed")
    .lt("retry_attempts", MAX_RETRY_ATTEMPTS)
    .returns<FailedEpisodeRow[]>();

  if (failedError) {
    errors.push({ userId: "n/a", error: `Failed to query failed episodes: ${failedError.message}` });
  }

  if (failedEpisodes && failedEpisodes.length > 0) {
    // Fetch user info for all users with failed episodes
    const failedUserIds = [...new Set(failedEpisodes.map((e) => e.user_id))];
    const { data: failedUsers, error: failedUsersError } = await supabase
      .from("users")
      .select("id, email, timezone, generation_hour")
      .in("id", failedUserIds)
      .returns<UserRow[]>();

    if (failedUsersError || !failedUsers) {
      errors.push({ userId: "n/a", error: "Failed to query users for retry" });
    } else {
      const failedUserMap = new Map(failedUsers.map((u) => [u.id, u]));

      for (const ep of failedEpisodes) {
        const user = failedUserMap.get(ep.user_id);
        if (!user) continue;

        // Only retry if the episode date is today in the user's timezone
        const today = getTodayInTimezone(user.timezone);
        if (ep.date !== today) continue;

        try {
          // Fetch unprocessed emails for this user
          const { data: emails, error: fetchError } = await supabase
            .from("raw_emails")
            .select("id, from_name, from_email, subject, text_body, html_body")
            .eq("user_id", ep.user_id)
            .is("processed_at", null)
            .order("received_at", { ascending: true })
            .returns<RawEmailRow[]>();

          if (fetchError || !emails || emails.length === 0) {
            continue;
          }

          const title = `Your Daily Gist — ${getFormattedDateInTimezone(user.timezone)}`;

          // Reset episode to processing and increment retry_attempts
          const { error: updateError } = await supabase
            .from("episodes")
            .update({
              status: "processing",
              title,
              error_message: null,
              retry_attempts: ep.retry_attempts + 1,
            })
            .eq("id", ep.id);

          if (updateError) {
            errors.push({
              userId: ep.user_id,
              error: `Failed to reset episode for retry: ${updateError.message}`,
            });
            continue;
          }

          const newsletterText = formatEmailsForPodcast(emails);
          const emailIds = emails.map((e) => e.id);
          const storagePath = `${ep.user_id}/${today}.mp3`;

          await fetch(`${serviceUrl}/generate-and-store`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              user_id: ep.user_id,
              newsletter_text: newsletterText,
              episode_id: ep.id,
              email_ids: emailIds,
              storage_path: storagePath,
              date: today,
              user_email: user.email,
              target_length_minutes: 10,
            }),
          });

          retried++;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          errors.push({ userId: ep.user_id, error: `Retry failed: ${message}` });
        }
      }
    }
  }

  return NextResponse.json({
    triggered,
    retried,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
