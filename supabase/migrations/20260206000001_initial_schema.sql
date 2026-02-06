-- Migration: Initial schema for Daily Gist
-- Creates users, newsletter_sources, raw_emails, episodes, and episode_segments tables

-- =============================================================================
-- USERS TABLE
-- =============================================================================
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  forwarding_address text unique not null,
  rss_token text unique not null,
  timezone text default 'America/New_York',
  tier text default 'free' check (tier in ('free', 'pro', 'power')),
  newsletter_limit integer default 0,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for looking up users by forwarding address (used in webhook)
create index idx_users_forwarding_address on public.users(forwarding_address);

-- Index for looking up users by rss_token (used in feed endpoint)
create index idx_users_rss_token on public.users(rss_token);

-- =============================================================================
-- NEWSLETTER SOURCES TABLE
-- =============================================================================
create table public.newsletter_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sender_email text not null,
  sender_name text,
  first_seen_at timestamptz default now(),
  unique(user_id, sender_email)
);

-- Index for looking up sources by user
create index idx_newsletter_sources_user_id on public.newsletter_sources(user_id);

-- =============================================================================
-- RAW EMAILS TABLE
-- =============================================================================
create table public.raw_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  source_id uuid references public.newsletter_sources(id) on delete set null,
  from_email text not null,
  from_name text,
  subject text,
  text_body text,
  html_body text,
  received_at timestamptz default now(),
  processed_at timestamptz
);

-- Index for finding unprocessed emails
create index idx_raw_emails_unprocessed on public.raw_emails(user_id, received_at)
  where processed_at is null;

-- Index for looking up emails by user
create index idx_raw_emails_user_id on public.raw_emails(user_id);

-- =============================================================================
-- EPISODES TABLE
-- =============================================================================
create table public.episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  date date not null,
  transcript text,
  audio_url text,
  audio_duration_seconds integer,
  status text default 'pending' check (status in ('pending', 'processing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Index for looking up episodes by user, ordered by date
create index idx_episodes_user_date on public.episodes(user_id, date desc);

-- =============================================================================
-- EPISODE SEGMENTS TABLE
-- =============================================================================
create table public.episode_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  segment_type text not null check (segment_type in ('deep_dive', 'quick_hits', 'intro', 'outro')),
  title text,
  summary text,
  source_email_ids uuid[],
  sort_order integer not null
);

-- Index for looking up segments by episode
create index idx_episode_segments_episode_id on public.episode_segments(episode_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.newsletter_sources enable row level security;
alter table public.raw_emails enable row level security;
alter table public.episodes enable row level security;
alter table public.episode_segments enable row level security;

-- Users table policies
create policy "Users can view own record"
  on public.users for select
  using (auth.uid() = id);

create policy "Users can update own record"
  on public.users for update
  using (auth.uid() = id);

-- Newsletter sources policies
create policy "Users can view own sources"
  on public.newsletter_sources for select
  using (auth.uid() = user_id);

create policy "Users can insert own sources"
  on public.newsletter_sources for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own sources"
  on public.newsletter_sources for delete
  using (auth.uid() = user_id);

-- Raw emails policies
create policy "Users can view own emails"
  on public.raw_emails for select
  using (auth.uid() = user_id);

-- Episodes policies
create policy "Users can view own episodes"
  on public.episodes for select
  using (auth.uid() = user_id);

-- Episode segments policies (join through episodes)
create policy "Users can view own segments"
  on public.episode_segments for select
  using (
    exists (
      select 1 from public.episodes
      where episodes.id = episode_segments.episode_id
      and episodes.user_id = auth.uid()
    )
  );

-- =============================================================================
-- AUTO USER CREATION TRIGGER
-- =============================================================================

-- Function to generate a random alphanumeric string
create or replace function generate_random_string(length integer)
returns text as $$
declare
  chars text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result text := '';
  i integer;
begin
  for i in 1..length loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Function to create user record on auth signup
create or replace function public.handle_new_user()
returns trigger as $$
declare
  email_prefix text;
  forwarding text;
begin
  -- Extract the part before @ from email, lowercase, remove special chars
  email_prefix := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));

  -- Truncate if too long
  if length(email_prefix) > 20 then
    email_prefix := substring(email_prefix, 1, 20);
  end if;

  -- Generate forwarding address
  forwarding := email_prefix || '-' || generate_random_string(8) || '@dailygist.fyi';

  -- Insert the user record
  insert into public.users (id, email, forwarding_address, rss_token)
  values (
    new.id,
    new.email,
    forwarding,
    gen_random_uuid()::text
  );

  return new;
end;
$$ language plpgsql security definer;

-- Trigger to call the function on new auth user
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- UPDATED_AT TRIGGER
-- =============================================================================

-- Function to update updated_at timestamp
create or replace function public.update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for users table
create trigger users_updated_at
  before update on public.users
  for each row execute function public.update_updated_at();
