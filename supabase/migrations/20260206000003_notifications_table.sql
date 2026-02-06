-- Migration: Add notifications table for user alerts

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  message text not null,
  read boolean default false,
  created_at timestamptz default now()
);

create index idx_notifications_user_unread on public.notifications(user_id, created_at desc)
  where read = false;

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

create policy "Users can update own notifications"
  on public.notifications for update
  using (auth.uid() = user_id);
