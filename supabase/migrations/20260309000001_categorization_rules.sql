-- Migration: Categorization rules
-- Rule-based email categorization (replaces source-level category tagging).
-- Rules match on sender_email + optional from_name_pattern/subject_pattern (substring match).

CREATE TABLE public.categorization_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  sender_email text NOT NULL,
  from_name_pattern text,        -- null = don't match on sender name
  subject_pattern text,          -- null = don't match on subject
  category text NOT NULL,
  priority integer NOT NULL DEFAULT 0,  -- higher = checked first
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for rule matching at generation time
CREATE INDEX categorization_rules_user_sender
  ON public.categorization_rules(user_id, sender_email);

-- RLS
ALTER TABLE public.categorization_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rules"
  ON public.categorization_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rules"
  ON public.categorization_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rules"
  ON public.categorization_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own rules"
  ON public.categorization_rules FOR DELETE
  USING (auth.uid() = user_id);
