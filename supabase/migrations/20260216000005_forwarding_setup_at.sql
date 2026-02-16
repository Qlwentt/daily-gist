-- Add forwarding_setup_at to track whether user completed step 4 (auto-forwarding setup)
ALTER TABLE users ADD COLUMN forwarding_setup_at timestamptz;

-- Backfill: assume existing users who finished onboarding already set up forwarding
UPDATE users SET forwarding_setup_at = onboarding_completed_at
  WHERE onboarding_completed_at IS NOT NULL;
