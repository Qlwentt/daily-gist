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
  getDayOfWeekInTimezone,
} from "@/lib/date-utils";
import {
  groupEmailsByCategory,
  type CategorizationRule,
} from "@/lib/categorize-emails";

type UserIdRow = {
  user_id: string;
};

type UserRow = {
  id: string;
  email: string;
  timezone: string;
  generation_hour: number;
  intro_music: string | null;
  host_voice: string;
  guest_voice: string;
};

type FailedEpisodeRow = {
  id: string;
  user_id: string;
  date: string;
  retry_attempts: number;
};

type CollectionRow = {
  slug: string;
  host_voice: string | null;
  guest_voice: string | null;
  intro_music: string | null;
  name: string;
  schedule_days: number[];
};

const MAX_RETRY_ATTEMPTS = 3;

// Voice constants for free edition (random selection per category episode)
const MALE_VOICES = [
  "Achird", "Algenib", "Algieba", "Charon", "Enceladus", "Fenrir",
  "Iapetus", "Orus", "Puck", "Rasalgethi", "Sadachbia", "Sadaltager",
  "Schedar", "Umbriel", "Zubenelgenubi",
];
const FEMALE_VOICES = [
  "Achernar", "Aoede", "Autonoe", "Callirrhoe", "Despina", "Erinome",
  "Gacrux", "Kore", "Laomedeia", "Leda", "Pulcherrima", "Sulafat",
  "Vindemiatrix", "Zephyr",
];

const FREE_CTA_TEXT =
  "If you want a personalized podcast built from your own newsletters, upgrade at dailygist.fyi";

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  let triggered = 0;
  let freeTriggered = 0;
  let retried = 0;
  const errors: { userId: string; error: string }[] = [];

  const FREE_TIER_USER_ID = process.env.FREE_TIER_USER_ID;

  // -----------------------------------------------------------------------
  // Phase 0: Free Edition — category episodes for the system user
  // -----------------------------------------------------------------------

  if (FREE_TIER_USER_ID) {
    try {
      // Fetch system user's timezone and generation hour
      const { data: systemUser } = await supabase
        .from("users")
        .select("id, email, timezone, generation_hour")
        .eq("id", FREE_TIER_USER_ID)
        .single<{ id: string; email: string; timezone: string; generation_hour: number }>();

      if (systemUser) {
        const currentHour = getCurrentHourInTimezone(systemUser.timezone);

        if (currentHour === systemUser.generation_hour) {
          // Fetch categorization rules for the system user
          const { data: ruleRows } = await supabase
            .from("categorization_rules")
            .select("sender_email, from_name_pattern, subject_pattern, category, priority")
            .eq("user_id", FREE_TIER_USER_ID)
            .order("priority", { ascending: false })
            .returns<CategorizationRule[]>();

          const rules = ruleRows ?? [];

          if (rules.length > 0) {
            // Fetch unprocessed emails for the system user
            const { data: freeEmails } = await supabase
              .from("raw_emails")
              .select("id, from_name, from_email, subject, text_body, html_body")
              .eq("user_id", FREE_TIER_USER_ID)
              .is("processed_at", null)
              .order("received_at", { ascending: true })
              .returns<RawEmailRow[]>();

            // Group emails by matched category (skip unmatched for free tier)
            const allGrouped = groupEmailsByCategory(freeEmails ?? [], rules);
            const emailsByCategory = new Map<string, RawEmailRow[]>();
            for (const [cat, emails] of allGrouped) {
              if (cat) emailsByCategory.set(cat, emails);
            }

            const today = getTodayInTimezone(systemUser.timezone);
            const formattedDate = getFormattedDateInTimezone(systemUser.timezone);

            for (const [category, emails] of emailsByCategory) {
              try {
                // Check if episode already exists for this category today
                const { data: existingEp } = await supabase
                  .from("episodes")
                  .select("id, status")
                  .eq("user_id", FREE_TIER_USER_ID)
                  .eq("date", today)
                  .eq("category", category)
                  .maybeSingle();

                if (existingEp) {
                  // Skip if already queued/processing/ready
                  if (["queued", "processing", "ready"].includes(existingEp.status)) {
                    continue;
                  }
                }

                const hostVoice = pickRandom(MALE_VOICES);
                const guestVoice = pickRandom(FEMALE_VOICES);
                const title = `Daily Gist: ${capitalize(category)} — ${formattedDate}`;
                const newsletterText = formatEmailsForPodcast(emails);
                const emailIds = emails.map((e) => e.id);
                const storagePath = `${FREE_TIER_USER_ID}/${today}-${category}.mp3`;

                const episodeData = {
                  user_id: FREE_TIER_USER_ID,
                  date: today,
                  category,
                  title,
                  status: "queued" as const,
                  job_input: {
                    newsletter_text: newsletterText,
                    email_ids: emailIds,
                    storage_path: storagePath,
                    date: today,
                    target_length_minutes: 10,
                    intro_music: "random",
                    host_voice: hostVoice,
                    guest_voice: guestVoice,
                    cta_text: FREE_CTA_TEXT,
                  },
                };

                if (existingEp) {
                  const { error: updateError } = await supabase
                    .from("episodes")
                    .update(episodeData)
                    .eq("id", existingEp.id);

                  if (updateError) {
                    errors.push({
                      userId: FREE_TIER_USER_ID,
                      error: `Failed to re-queue free ${category} episode: ${updateError.message}`,
                    });
                    continue;
                  }
                } else {
                  const { error: insertError } = await supabase
                    .from("episodes")
                    .insert(episodeData);

                  if (insertError) {
                    errors.push({
                      userId: FREE_TIER_USER_ID,
                      error: `Failed to queue free ${category} episode: ${insertError.message}`,
                    });
                    continue;
                  }
                }

                freeTriggered++;
              } catch (err) {
                const message = err instanceof Error ? err.message : "Unknown error";
                errors.push({
                  userId: FREE_TIER_USER_ID,
                  error: `Free ${category} episode failed: ${message}`,
                });
              }
            }
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ userId: FREE_TIER_USER_ID, error: `Free phase error: ${message}` });
    }
  }

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

  // Deduplicate user IDs, exclude system user (handled in Phase 0)
  const candidateUserIds = [
    ...new Set((usersWithEmails || []).map((r) => r.user_id)),
  ].filter((id) => id !== FREE_TIER_USER_ID);

  if (candidateUserIds.length > 0) {
    // Fetch timezone and generation_hour for candidate users
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, email, timezone, generation_hour, intro_music, host_voice, guest_voice")
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

    // Batch-fetch collections and rules for all eligible users
    const { data: allCollections } = await supabase
      .from("collections")
      .select("user_id, slug, name, host_voice, guest_voice, intro_music, schedule_days")
      .in("user_id", userIds)
      .returns<(CollectionRow & { user_id: string })[]>();

    const collectionsMap = new Map<string, CollectionRow[]>();
    for (const c of allCollections ?? []) {
      if (!collectionsMap.has(c.user_id)) collectionsMap.set(c.user_id, []);
      collectionsMap.get(c.user_id)!.push(c);
    }

    // Only fetch rules for users that have collections
    const usersWithCollections = userIds.filter((id) => collectionsMap.has(id));
    let rulesMap = new Map<string, CategorizationRule[]>();
    if (usersWithCollections.length > 0) {
      const { data: allRules } = await supabase
        .from("categorization_rules")
        .select("user_id, sender_email, from_name_pattern, subject_pattern, category, priority")
        .in("user_id", usersWithCollections)
        .order("priority", { ascending: false })
        .returns<(CategorizationRule & { user_id: string })[]>();

      for (const r of allRules ?? []) {
        if (!rulesMap.has(r.user_id)) rulesMap.set(r.user_id, []);
        rulesMap.get(r.user_id)!.push(r);
      }
    }

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

        const user = userMap.get(userId)!;
        const userTimezone = user.timezone;
        const today = getTodayInTimezone(userTimezone);
        const formattedDate = getFormattedDateInTimezone(userTimezone);
        const userCollections = collectionsMap.get(userId);
        const userRules = rulesMap.get(userId) ?? [];

        if (userCollections && userCollections.length > 0 && userRules.length > 0) {
          // --- Collection-aware generation (rotating weekly schedule) ---
          // Only ONE episode per day: the collection scheduled for today,
          // or catch-all (unmatched emails) if no collection is scheduled.
          const dayOfWeek = getDayOfWeekInTimezone(userTimezone);
          const grouped = groupEmailsByCategory(emails, userRules);

          const scheduledCollection = userCollections.find(
            (c) => c.schedule_days.includes(dayOfWeek)
          );

          // Pick exactly one bucket to generate from
          let category: string | null;
          let collection: CollectionRow | null;
          let bucketEmails: RawEmailRow[];

          if (scheduledCollection) {
            category = scheduledCollection.slug;
            collection = scheduledCollection;
            bucketEmails = grouped.get(category) ?? [];
          } else {
            // No collection scheduled → catch-all from unmatched emails
            category = null;
            collection = null;
            bucketEmails = grouped.get(null) ?? [];
          }

          if (bucketEmails.length > 0) {
            try {
              const suffix = category ? `-${category}` : "";
              const title = collection
                ? `Daily Gist: ${collection.name} — ${formattedDate}`
                : `Your Daily Gist — ${formattedDate}`;
              const storagePath = `${userId}/${today}${suffix}.mp3`;

              const hostVoice = collection?.host_voice ?? user.host_voice;
              const guestVoice = collection?.guest_voice ?? user.guest_voice;
              const introMusic = collection?.intro_music ?? user.intro_music;

              const newsletterText = formatEmailsForPodcast(bucketEmails);
              const emailIds = bucketEmails.map((e) => e.id);

              let existingQuery = supabase
                .from("episodes")
                .select("id, status")
                .eq("user_id", userId)
                .eq("date", today);

              if (category) {
                existingQuery = existingQuery.eq("category", category);
              } else {
                existingQuery = existingQuery.is("category", null);
              }

              const { data: existingEp } = await existingQuery.maybeSingle();

              const episodeData = {
                user_id: userId,
                date: today,
                category: category ?? undefined,
                title,
                status: "queued" as const,
                job_input: {
                  newsletter_text: newsletterText,
                  email_ids: emailIds,
                  storage_path: storagePath,
                  date: today,
                  user_email: user.email,
                  target_length_minutes: 10,
                  intro_music: introMusic,
                  host_voice: hostVoice,
                  guest_voice: guestVoice,
                  ...(collection ? { collection_name: collection.name } : {}),
                },
              };

              if (existingEp) {
                if (["queued", "processing", "ready"].includes(existingEp.status)) {
                  // already in progress — skip
                } else {
                  const { error: updateError } = await supabase
                    .from("episodes")
                    .update(episodeData)
                    .eq("id", existingEp.id);

                  if (updateError) {
                    errors.push({ userId, error: `Failed to re-queue ${category ?? "personal"} episode: ${updateError.message}` });
                  } else {
                    triggered++;
                  }
                }
              } else {
                const { error: insertError } = await supabase
                  .from("episodes")
                  .insert(episodeData);

                if (insertError) {
                  errors.push({ userId, error: `Failed to queue ${category ?? "personal"} episode: ${insertError.message}` });
                } else {
                  triggered++;
                }
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : "Unknown error";
              errors.push({ userId, error: `Collection ${category ?? "personal"} failed: ${message}` });
            }
          }
        } else {
          // --- Standard single-episode generation (no collections) ---
          const title = `Your Daily Gist — ${formattedDate}`;
          const newsletterText = formatEmailsForPodcast(emails);
          const emailIds = emails.map((e) => e.id);
          const storagePath = `${userId}/${today}.mp3`;

          const { data: existingEp } = await supabase
            .from("episodes")
            .select("id, status")
            .eq("user_id", userId)
            .eq("date", today)
            .is("category", null)
            .maybeSingle();

          if (existingEp) {
            if (["queued", "processing", "ready"].includes(existingEp.status)) {
              continue;
            }
            const { error: updateError } = await supabase
              .from("episodes")
              .update({
                title,
                status: "queued",
                job_input: {
                  newsletter_text: newsletterText,
                  email_ids: emailIds,
                  storage_path: storagePath,
                  date: today,
                  user_email: user.email,
                  target_length_minutes: 10,
                  intro_music: user.intro_music,
                  host_voice: user.host_voice,
                  guest_voice: user.guest_voice,
                },
              })
              .eq("id", existingEp.id);

            if (updateError) {
              errors.push({ userId, error: `Failed to re-queue episode: ${updateError.message}` });
              continue;
            }
          } else {
            const { error: insertError } = await supabase
              .from("episodes")
              .insert({
                user_id: userId,
                date: today,
                title,
                status: "queued",
                job_input: {
                  newsletter_text: newsletterText,
                  email_ids: emailIds,
                  storage_path: storagePath,
                  date: today,
                  user_email: user.email,
                  target_length_minutes: 10,
                  intro_music: user.intro_music,
                  host_voice: user.host_voice,
                  guest_voice: user.guest_voice,
                },
              });

            if (insertError) {
              errors.push({ userId, error: `Failed to queue episode: ${insertError.message}` });
              continue;
            }
          }

          triggered++;
        }
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
      .select("id, email, timezone, generation_hour, intro_music, host_voice, guest_voice")
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
          const newsletterText = formatEmailsForPodcast(emails);
          const emailIds = emails.map((e) => e.id);
          const storagePath = `${ep.user_id}/${today}.mp3`;

          // Reset episode to queued with job_input, increment retry_attempts
          const { error: updateError } = await supabase
            .from("episodes")
            .update({
              status: "queued",
              title,
              error_message: null,
              retry_attempts: ep.retry_attempts + 1,
              job_input: {
                newsletter_text: newsletterText,
                email_ids: emailIds,
                storage_path: storagePath,
                date: today,
                user_email: user.email,
                target_length_minutes: 10,
                intro_music: user.intro_music,
                host_voice: user.host_voice,
                guest_voice: user.guest_voice,
              },
            })
            .eq("id", ep.id);

          if (updateError) {
            errors.push({
              userId: ep.user_id,
              error: `Failed to reset episode for retry: ${updateError.message}`,
            });
            continue;
          }

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
    freeTriggered,
    retried,
    ...(errors.length > 0 ? { errors } : {}),
  });
}
