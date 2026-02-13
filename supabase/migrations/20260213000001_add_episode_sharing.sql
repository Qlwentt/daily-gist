-- share_code: 8-char random string for /s/{code} URLs
ALTER TABLE public.episodes ADD COLUMN share_code text;

-- source_newsletters: newsletter names that contributed to this episode
ALTER TABLE public.episodes ADD COLUMN source_newsletters text[];

-- Backfill share_code for existing episodes
UPDATE public.episodes SET share_code = substr(md5(random()::text), 1, 8) WHERE share_code IS NULL;

-- Now make it NOT NULL + UNIQUE
ALTER TABLE public.episodes ALTER COLUMN share_code SET NOT NULL;
ALTER TABLE public.episodes ALTER COLUMN share_code SET DEFAULT substr(md5(random()::text), 1, 8);
ALTER TABLE public.episodes ADD CONSTRAINT episodes_share_code_unique UNIQUE (share_code);
