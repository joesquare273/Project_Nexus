-- The daily login reward (economy, 2026-10-30): a ledger kind of its own, so
-- each day's reward is paid once (ref 'login-YYYY-MM-DD').

alter table public.shard_ledger drop constraint if exists shard_ledger_kind_check;
alter table public.shard_ledger add constraint shard_ledger_kind_check
  check (kind in (
    'welcome_grant', 'login_reward', 'match_reward', 'quest_reward', 'pack_purchase', 'store_purchase',
    'event_entry', 'event_prize', 'admin_adjustment'
  ));
