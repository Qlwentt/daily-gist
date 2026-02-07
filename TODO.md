# Daily Gist — TODO

## Done

- [x] Project setup (Next.js 14, Supabase, TypeScript, Tailwind)
- [x] Auth with magic link login
- [x] Onboarding flow (forwarding address generation, Gmail filter instructions, RSS feed URL)
- [x] Database schema + migrations (users, forwarding_addresses, raw_emails, episodes, episode_segments, newsletter_sources, notifications)
- [x] Email ingestion (test endpoint + Postmark webhook with signature verification)
- [x] Newsletter limit enforcement with notifications
- [x] Podcastfy transcript generation + Gemini 2.5 Flash TTS audio generation
- [x] Episode generation pipeline (fetch emails → Podcastfy transcript → Gemini TTS → upload to Supabase Storage)
- [x] RSS feed endpoint
- [x] Dashboard (episodes list with expandable transcripts, recent emails, notifications)
- [x] Cron endpoint with bearer token auth
- [x] Test generate endpoint

## To Do (Soon)

- [x] Fix "Gist" pronunciation (hard G → soft G)
- [ ] Fix transcript generation: remove scratchpad/prompt leaking into transcript, fix repeated opener
- [ ] Remove transcript display from dashboard (users listen via podcast app, not web)
- [x] Pick better default voices (test different Gemini TTS voice combos)
- [ ] Test with more newsletter variety
- [ ] Deploy to Vercel

## Backlog

- [ ] User-configurable voice selection
- [ ] Claude preprocessing step for better topic synthesis across newsletters
- [ ] Stripe integration (Pro $15/mo, Power $25/mo)
- [ ] Landing page
- [ ] Postmark domain setup (dailygist.fyi)
- [ ] Vercel cron job scheduling
- [ ] Rate limit handling / Cloud TTS fallback for overflow
- [ ] Decide what episode info to show on dashboard (date, title, status, duration — but not transcript)
