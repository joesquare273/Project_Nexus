-- First-time help a player has finished (2026-11-03): the menu tour and the
-- "Learn to play" lesson, kept on the account so they don't show again on
-- another browser or in a private window. Only the game server writes it.
-- Safe to run again.

alter table public.profiles
  add column if not exists onboarding jsonb not null default '{}'::jsonb;
