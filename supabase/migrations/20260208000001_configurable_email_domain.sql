-- Migration: Update forwarding address domain to inbound.dailygist.fyi

create or replace function public.handle_new_user()
returns trigger as $$
declare
  email_prefix text;
  random_suffix text;
  forwarding text;
begin
  -- Extract the part before @ from email, lowercase, remove special chars
  email_prefix := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '', 'g'));

  -- Truncate if too long
  if length(email_prefix) > 20 then
    email_prefix := substring(email_prefix, 1, 20);
  end if;

  -- Generate 8 character random suffix using built-in functions
  random_suffix := substr(md5(random()::text), 1, 8);

  -- Generate forwarding address
  forwarding := email_prefix || '-' || random_suffix || '@inbound.dailygist.fyi';

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
