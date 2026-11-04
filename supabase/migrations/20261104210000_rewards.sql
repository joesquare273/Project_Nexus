-- Match rewards, quests and one-time rewards (docs/economy.md, E2-E3).
-- The game server records each finished game it ran, once per player
-- (match_results, keyed by the game's own id), and pays from the shard
-- ledger: match rewards ('match_reward', ref 'match-<game>' and
-- 'match-<game>-win'), quests ('quest_reward', ref 'quest-<id>-<period>')
-- and one-time rewards ('milestone_reward', ref 'tutorial' or 'first-win').
-- Every payment is apply_shards, so each ref pays once.

alter table public.shard_ledger drop constraint if exists shard_ledger_kind_check;
alter table public.shard_ledger add constraint shard_ledger_kind_check
  check (kind in (
    'welcome_grant', 'login_reward', 'match_reward', 'quest_reward', 'milestone_reward', 'pack_purchase', 'store_purchase',
    'event_entry', 'event_prize', 'admin_adjustment'
  ));

create table if not exists public.match_results (
  user_id uuid not null references public.profiles (id) on delete cascade,
  ref text not null,
  kind text not null check (kind in ('bot', 'friend', 'draft')),
  won boolean not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ref)
);
create index if not exists match_results_user_time on public.match_results (user_id, created_at);

alter table public.match_results enable row level security;
drop policy if exists "own matches" on public.match_results;
create policy "own matches" on public.match_results for select using (auth.uid() = user_id);
