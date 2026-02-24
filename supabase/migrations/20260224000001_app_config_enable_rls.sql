-- Enable RLS on app_config to prevent anon/authenticated access.
-- The handle_new_user() trigger runs as security definer so it bypasses RLS.
alter table public.app_config enable row level security;
