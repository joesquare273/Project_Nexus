-- Project Nexus accounts and Aether Shards (economy step E1).
-- Applied by the Supabase GitHub integration when pushed (supabase/migrations),
-- or by hand: Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to run again: everything is "if not exists" / "or replace".
--
-- Players sign in with Discord (Supabase Auth). Only the game server writes
-- here, with the service role key; browsers can read their own rows only.

-- One row per player.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  shards integer not null default 0 check (shards >= 0),
  created_at timestamptz not null default now()
);

-- Every change to a balance, for auditing. `ref` makes each grant happen
-- once: the welcome grant, a match reward for one match, one purchase.
create table if not exists public.shard_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null check (amount <> 0),
  kind text not null check (kind in (
    'welcome_grant', 'match_reward', 'quest_reward', 'pack_purchase',
    'event_entry', 'event_prize', 'admin_adjustment'
  )),
  ref text not null,
  balance_after integer not null check (balance_after >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

-- Cards a player owns (one row per printing and finish), for packs and drafts later.
create table if not exists public.owned_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  scryfall_id text not null,
  finish text not null check (finish in ('nonfoil', 'foil', 'surge')),
  count integer not null check (count > 0),
  primary key (user_id, scryfall_id, finish)
);

-- Unopened boosters a player owns.
create table if not exists public.owned_packs (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('play', 'collector')),
  count integer not null check (count >= 0),
  primary key (user_id, kind)
);

alter table public.profiles enable row level security;
alter table public.shard_ledger enable row level security;
alter table public.owned_cards enable row level security;
alter table public.owned_packs enable row level security;

-- Players may read their own rows. There are no insert/update/delete policies:
-- only the server (service role, which bypasses these rules) changes anything.
drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
drop policy if exists "own ledger" on public.shard_ledger;
create policy "own ledger" on public.shard_ledger for select using (auth.uid() = user_id);
drop policy if exists "own cards" on public.owned_cards;
create policy "own cards" on public.owned_cards for select using (auth.uid() = user_id);
drop policy if exists "own packs" on public.owned_packs;
create policy "own packs" on public.owned_packs for select using (auth.uid() = user_id);

-- Changes a balance and records it, all at once. A repeated (user, kind, ref)
-- changes nothing and returns the balance from the first time. A change that
-- would make the balance negative fails and changes nothing.
create or replace function public.apply_shards(p_user uuid, p_amount integer, p_kind text, p_ref text)
returns table (balance integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  -- Lock the player's row, so two changes can't interleave.
  select shards into v_balance from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  if exists (select 1 from shard_ledger where user_id = p_user and kind = p_kind and ref = p_ref) then
    return query select v_balance, false;
    return;
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'insufficient shards: % needed, % available', -p_amount, v_balance;
  end if;
  update profiles set shards = shards + p_amount where id = p_user returning shards into v_balance;
  insert into shard_ledger (user_id, amount, kind, ref, balance_after) values (p_user, p_amount, p_kind, p_ref, v_balance);
  return query select v_balance, true;
end;
$$;

-- Creates the player's profile the first time they sign in, then pays the
-- welcome grant (once: its ref is always 'welcome').
create or replace function public.ensure_profile(p_user uuid, p_name text, p_welcome integer)
returns table (display_name text, shards integer)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name) values (p_user, p_name) on conflict (id) do nothing;
  perform public.apply_shards(p_user, p_welcome, 'welcome_grant', 'welcome');
  return query select p.display_name, p.shards from profiles p where p.id = p_user;
end;
$$;

-- Only the server may call these.
revoke all on function public.apply_shards(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.ensure_profile(uuid, text, integer) from public, anon, authenticated;
