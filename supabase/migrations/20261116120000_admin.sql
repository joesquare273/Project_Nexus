-- Administration (docs/economy.md, "Administration"): an admin flag on
-- profiles, and shard changes made by an admin. Only the game server (the
-- service role) reads the flag or calls admin_adjust_shards; players can't
-- see or change it (profiles has a select-only policy for the owner).
-- Every admin change is an ordinary ledger row ('admin_adjustment', so
-- balances still equal their ledger) plus a row in admin_actions saying who
-- made it and why.

alter table public.profiles add column if not exists is_admin boolean not null default false;

-- The project owner's account ("Solis").
update public.profiles set is_admin = true where id = '89e28585-8623-4e0e-9dba-3347520b62c7';

create table if not exists public.admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid not null references public.profiles (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('set_shards', 'add_shards')),
  -- The change made to the balance, and the balance after it.
  amount integer not null,
  balance_after integer not null,
  note text not null default '' check (char_length(note) <= 200),
  ref text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists admin_actions_user on public.admin_actions (user_id, created_at);

-- No policies: only the service role reads or writes it.
alter table public.admin_actions enable row level security;

-- An admin sets a player's balance to p_amount ('set') or changes it by
-- p_amount ('add', negative to take away), once per p_ref. Fails if the
-- caller isn't an admin or the balance would go below zero.
create or replace function public.admin_adjust_shards(p_admin uuid, p_user uuid, p_mode text, p_amount integer, p_ref text, p_note text)
returns table (balance integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current integer;
  v_delta integer;
  v_result record;
begin
  if not exists (select 1 from profiles where id = p_admin and is_admin) then
    raise exception 'not an admin';
  end if;
  if p_mode not in ('set', 'add') then
    raise exception 'unknown mode %', p_mode;
  end if;
  -- A repeated request changes nothing and returns the balance.
  if exists (select 1 from admin_actions where ref = p_ref) then
    return query select shards, false from profiles where id = p_user;
    return;
  end if;
  select shards into v_current from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  v_delta := case when p_mode = 'set' then p_amount - v_current else p_amount end;
  if v_delta = 0 then
    return query select v_current, false;
    return;
  end if;
  select * into v_result from apply_shards(p_user, v_delta, 'admin_adjustment', 'admin-' || p_ref);
  insert into admin_actions (admin_id, user_id, kind, amount, balance_after, note, ref)
    values (p_admin, p_user, case when p_mode = 'set' then 'set_shards' else 'add_shards' end, v_delta, v_result.balance, coalesce(p_note, ''), p_ref);
  return query select v_result.balance, true;
end;
$$;

revoke all on function public.admin_adjust_shards(uuid, uuid, text, integer, text, text) from public, anon, authenticated;
