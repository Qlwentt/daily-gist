-- Add user-configurable TTS voice columns
-- Defaults match current hardcoded values (Charon for Host, Sulafat for Guest)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS host_voice text DEFAULT 'Charon',
  ADD COLUMN IF NOT EXISTS guest_voice text DEFAULT 'Sulafat';
