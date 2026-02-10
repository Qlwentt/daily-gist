-- Add generation_hour column to users table
-- Stores the hour (0-23) at which the user's daily podcast should be generated
alter table users
  add column generation_hour integer default 5
  check (generation_hour >= 0 and generation_hour <= 23);

-- Backfill existing users
update users set generation_hour = 5 where generation_hour is null;

-- Make it not null after backfill
alter table users alter column generation_hour set not null;
