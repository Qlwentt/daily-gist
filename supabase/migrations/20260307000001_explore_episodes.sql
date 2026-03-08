-- Explore episodes: public showcase episodes for the /explore page
create table explore_episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  description text not null,
  category text not null,
  audio_url text not null,
  cover_image_url text,
  duration_seconds integer,
  source_newsletters text[],
  transcript text,
  is_featured boolean default false,
  sort_order integer default 0,
  host_voice text,
  guest_voice text,
  intro_music text,
  rss_feed_url text,
  created_at timestamptz default now()
);

-- Indexes
create index idx_explore_episodes_category_sort on explore_episodes (category, sort_order);
create index idx_explore_episodes_slug on explore_episodes (slug);

-- RLS: public read, admin-only writes
alter table explore_episodes enable row level security;

create policy "Public can read explore episodes"
  on explore_episodes for select
  using (true);

-- No insert/update/delete policies — only service role (admin) can write
