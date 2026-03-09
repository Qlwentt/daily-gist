-- Add from_name_pattern column to categorization_rules
ALTER TABLE public.categorization_rules
  ADD COLUMN IF NOT EXISTS from_name_pattern text;
