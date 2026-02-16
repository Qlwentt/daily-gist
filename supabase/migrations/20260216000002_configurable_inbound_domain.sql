-- Migration: Make inbound email domain configurable via app_config table
-- On dev, update the row: UPDATE app_config SET value = 'dev-inbound.dailygist.fyi' WHERE key = 'inbound_email_domain';

-- Config table for environment-specific settings
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

-- Seed with production default
insert into public.app_config (key, value)
values ('inbound_email_domain', 'inbound.dailygist.fyi')
on conflict (key) do nothing;

-- Update trigger to read domain from app_config
create or replace function public.handle_new_user()
returns trigger as $$
declare
  email_prefix text;
  random_suffix text;
  forwarding text;
  inbound_domain text;
begin
  -- Extract the part before @ from email, lowercase, remove special chars
  email_prefix := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));

  -- Truncate if too long
  if length(email_prefix) > 20 then
    email_prefix := substring(email_prefix, 1, 20);
  end if;

  -- Generate 8 character random suffix using built-in functions
  random_suffix := substr(md5(random()::text), 1, 8);

  -- Read domain from config table, fallback to production default
  select value into inbound_domain
  from public.app_config
  where key = 'inbound_email_domain';

  inbound_domain := coalesce(inbound_domain, 'inbound.dailygist.fyi');

  -- Generate forwarding address
  forwarding := email_prefix || '-' || random_suffix || '@' || inbound_domain;

  -- Insert the user record with power tier defaults
  insert into public.users (id, email, forwarding_address, rss_token, tier, newsletter_limit)
  values (
    new.id,
    new.email,
    forwarding,
    gen_random_uuid()::text,
    'power',
    15
  );

  return new;
end;
$$ language plpgsql security definer;
