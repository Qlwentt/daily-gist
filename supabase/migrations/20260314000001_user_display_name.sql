-- Add display name fields for personalized podcast greeting
ALTER TABLE users ADD COLUMN display_name text;
ALTER TABLE users ADD COLUMN display_name_phonetic text;
