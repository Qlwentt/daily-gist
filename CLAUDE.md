# CLAUDE.md - Daily Gist

## Workflow Rules

- **Always discuss the approach for solving a problem/bug before writing code.** Do not make code changes without explicit user approval. Use plan mode for non-trivial problem resolution. When the user describes a problem, talk through the solution first — only start editing files after the user says to go ahead.

## Project Overview

Daily Gist is a newsletter-to-podcast SaaS. Users forward their newsletters to a unique email address, and we generate a daily AI podcast that synthesizes the content. The podcast is delivered via private RSS feed to their preferred podcast app.

**Tagline:** "Your newsletters, as a daily podcast"

**Core value:** Passive consumption. Users listen while commuting/exercising instead of reading another thing.

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (Postgres)
- **Auth:** Supabase Auth (magic link, no passwords)
- **Storage:** Supabase Storage (MP3 files)
- **Email Inbound:** Postmark (webhook on email receipt)
- **AI - Synthesis:** Claude API (Sonnet) - categorization, smart grouping, synthesis
- **AI - Podcast:** Podcastfy (open source) - converts text to conversational dialogue
- **TTS:** OpenAI TTS - voice generation
- **Payments:** Stripe (subscriptions)
- **Hosting:** Vercel

## Security Requirements (ALWAYS FOLLOW)

1. **Webhook Verification**
   - ALWAYS verify Postmark webhook signatures before processing
   - ALWAYS verify Stripe webhook signatures before processing
   - Reject unverified webhooks with 401, don't process them

2. **Token Generation**
   - Use `crypto.randomUUID()` or `crypto.randomBytes()` for all tokens
   - NEVER use `Math.random()` for security-sensitive values
   - RSS tokens should be at least 32 characters

3. **Database Security**
   - All queries use Supabase client (parameterized by default)
   - NEVER construct raw SQL with string concatenation
   - ALWAYS filter by user_id - users can only access their own data
   - Enable Row Level Security (RLS) on all tables

4. **Secrets Management**
   - ALL API keys and secrets in environment variables
   - NEVER hardcode secrets, even for testing
   - NEVER log secrets, API keys, or email content
   - Use `.env.local` for local dev (already in .gitignore)

5. **Error Handling**
   - Log errors server-side for debugging
   - NEVER expose internal errors to client
   - Return generic error messages to users

## Database Schema

```sql
-- Users table
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  forwarding_address text unique not null,
  rss_token text unique not null,
  stripe_customer_id text,
  subscription_tier text default 'free', -- 'free', 'pro', 'power'
  created_at timestamptz default now()
);

-- Newsletter sources (auto-detected from incoming emails)
create table newsletter_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  sender_email text not null,
  display_name text,
  created_at timestamptz default now(),
  unique(user_id, sender_email)
);

-- Generated podcast episodes
create table episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  date date not null,
  audio_url text not null,
  duration_seconds integer,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Raw incoming emails (for processing and backfill)
create table raw_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  sender_email text not null,
  subject text,
  body text not null,
  received_at timestamptz default now(),
  processed_at timestamptz -- null = not yet processed
);

-- Enable RLS on all tables
alter table users enable row level security;
alter table newsletter_sources enable row level security;
alter table episodes enable row level security;
alter table raw_emails enable row level security;

-- RLS policies (users can only access their own data)
create policy "Users can view own data" on users for select using (auth.uid() = id);
create policy "Users can view own sources" on newsletter_sources for select using (auth.uid() = user_id);
create policy "Users can view own episodes" on episodes for select using (auth.uid() = user_id);
create policy "Users can view own emails" on raw_emails for select using (auth.uid() = user_id);
```

## Environment Variables Required

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Postmark
POSTMARK_SERVER_TOKEN=
POSTMARK_WEBHOOK_SECRET=

# Claude API
ANTHROPIC_API_KEY=

# OpenAI (for TTS)
OPENAI_API_KEY=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# App
NEXT_PUBLIC_APP_URL=https://dailygist.fyi
```

## Key User Flows

### 1. Sign Up & Onboarding

1. User enters email
2. Magic link sent via Supabase Auth
3. User clicks link, authenticated
4. Generate unique forwarding address (e.g., `quai-a8f3k2x9@dailygist.fyi`)
5. Generate RSS token
6. Show onboarding:
   - Gmail filter instructions (forward + auto-archive)
   - RSS feed URL to copy into podcast app
7. Done - user waits for first podcast

### 2. Email Ingestion (Webhook)

1. Postmark receives email at `*@dailygist.fyi`
2. Postmark calls our webhook with email data
3. Verify webhook signature
4. Parse forwarding address to find user
5. Store in `raw_emails` table (processed_at = null)
6. Auto-detect/create newsletter source

### 3. Daily Podcast Generation (Cron Job)

1. Run daily at configured time (e.g., 5 AM user's timezone)
2. For each user with unprocessed emails:
   - Fetch all raw_emails where processed_at IS NULL
   - Send to Claude for smart grouping + synthesis
   - Send synthesis to Podcastfy for dialogue generation
   - Send dialogue to OpenAI TTS for audio
   - Upload MP3 to Supabase Storage
   - Create episode record
   - Mark raw_emails as processed (set processed_at)

### 4. RSS Feed

1. User's podcast app requests `GET /feed/[rss_token]`
2. Look up user by rss_token
3. Fetch their episodes
4. Return valid RSS XML with enclosure tags pointing to MP3s

## Smart Grouping Logic

Claude should categorize and group newsletters:

**Input:** Raw newsletter contents
**Output:** Structured synthesis with:

- **Deep dives:** Related topics grouped together (e.g., 3 AI newsletters discussing agents)
- **Quick hits:** Unrelated standalone items (e.g., stock tip, life hack)

Prompt should instruct:

- Group by topic similarity, not by source
- Identify the "meta signal" (what does it mean that multiple sources are talking about X?)
- Keep quick hits brief
- Prioritize what's interesting/actionable

## Podcast Structure

```
[Intro]
"Good morning! Here's your Daily Gist for February 5th..."

[Deep Dive 1 - if applicable]
"Three of your newsletters were talking about AI agents this week..."
[2-5 minute discussion]

[Deep Dive 2 - if applicable]
[2-5 minute discussion]

[Quick Hits]
"A few quick things: The S&P is up 2%... And here's a life hack about meal prepping..."
[1-2 minutes]

[Outro]
"That's your Daily Gist. Have a great day!"
```

## Pricing Tiers

| Tier  | Price  | Newsletters          | History   |
| ----- | ------ | -------------------- | --------- |
| DIY   | Free   | Unlimited (own APIs) | N/A       |
| Pro   | $15/mo | 5                    | 90 days   |
| Power | $25/mo | 15                   | Unlimited |

Newsletter limits enforced at ingestion time - reject emails over limit with friendly bounce message.

## Failure Recovery

If podcast generation fails:

1. Raw emails are still stored (always save first)
2. `processed_at` stays null
3. Fix the bug
4. Run backfill: find emails where `processed_at IS NULL`, group by date, generate missed episodes
5. User sees multiple episodes in feed - they can listen or skip

## File Structure

```
daily-gist/
├── app/
│   ├── page.tsx                 # Landing page
│   ├── login/page.tsx           # Magic link login
│   ├── onboarding/page.tsx      # Setup flow
│   ├── settings/page.tsx        # Manage account
│   ├── feed/[token]/route.ts    # RSS feed endpoint
│   └── api/
│       ├── webhooks/
│       │   ├── postmark/route.ts    # Email ingestion
│       │   └── stripe/route.ts      # Payment events
│       └── cron/
│           └── generate/route.ts    # Daily podcast generation
├── lib/
│   ├── supabase.ts              # Supabase client
│   ├── claude.ts                # Claude API wrapper
│   ├── podcastfy.ts             # Podcast generation
│   ├── tts.ts                   # OpenAI TTS wrapper
│   └── rss.ts                   # RSS feed generation
├── CLAUDE.md                    # This file
└── .env.local                   # Secrets (not committed)
```

## Commands

```bash
# Development
npm run dev

# Build
npm run build

# Run cron job manually (for testing)
# NOTE: Production domain requires www. prefix
curl -H "Authorization: Bearer $CRON_SECRET" https://www.dailygist.fyi/api/cron/generate

# Test webhook locally (use Postmark's test mode)
```

## What NOT to Build (MVP)

- ❌ Web dashboard / archive UI
- ❌ Full-text search
- ❌ Transcript display
- ❌ Audio player on website
- ❌ Mobile app / PWA
- ❌ Custom voice selection
- ❌ Bookmarking segments

Users reference old newsletters in Gmail (they're auto-archived there). We don't rebuild that.

## Testing Checklist

Before shipping:

- [ ] Postmark webhook rejects invalid signatures
- [ ] Stripe webhook rejects invalid signatures
- [ ] RSS feed returns 404 for invalid tokens
- [ ] Users can only see their own data (test RLS)
- [ ] Magic links expire and are single-use
- [ ] No secrets in logs
- [ ] No secrets in client-side code
- [ ] Newsletter limit enforced for Pro tier
- [ ] Backfill job works for missed days
