-- Migration: Add audio_size_bytes to episodes for RSS enclosure length
alter table public.episodes add column audio_size_bytes bigint;
