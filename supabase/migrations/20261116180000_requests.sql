-- Player requests ("tickets", docs/economy.md "Administration"): a player
-- sends a subject, the cards involved and a description of the problem; the
-- admin page lists them with the account that sent them, sets their status
-- and deletes them once fixed. Only the game server (the service role) reads
-- or writes them: no policies, so players can't reach the table directly.

create table if not exists public.support_requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null check (char_length(subject) between 1 and 120),
  cards text[] not null default '{}' check (cardinality(cards) <= 30),
  description text not null check (char_length(description) between 1 and 4000),
  status text not null default 'not_started' check (status in ('not_started', 'incomplete', 'complete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_requests_user on public.support_requests (user_id, created_at);
create index if not exists support_requests_created on public.support_requests (created_at);

alter table public.support_requests enable row level security;
