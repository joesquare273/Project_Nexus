-- Dismantling and crafting (docs/economy.md, "Crafting"): four fragment
-- currencies, one per rarity, that never convert. Only the game server
-- changes them, through dismantle_card and craft_card below, each one
-- database transaction that is applied once per request id (a retry returns
-- the first result and changes nothing).

create table if not exists public.fragment_balances (
  user_id uuid not null references public.profiles (id) on delete cascade,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'mythic')),
  amount integer not null default 0 check (amount >= 0),
  primary key (user_id, rarity)
);

-- Every fragment change: what was dismantled or crafted, and the amount.
create table if not exists public.fragment_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('dismantle', 'craft', 'admin_adjustment')),
  ref text not null,
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'mythic')),
  amount integer not null,
  scryfall_id text,
  finish text,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists fragment_ledger_user on public.fragment_ledger (user_id);

alter table public.fragment_balances enable row level security;
alter table public.fragment_ledger enable row level security;
drop policy if exists "own fragments" on public.fragment_balances;
create policy "own fragments" on public.fragment_balances for select using (auth.uid() = user_id);
drop policy if exists "own fragment ledger" on public.fragment_ledger;
create policy "own fragment ledger" on public.fragment_ledger for select using (auth.uid() = user_id);

-- The player's balances as {"common": n, ...}.
create or replace function public.fragment_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(rarity, amount), '{}'::jsonb) from fragment_balances where user_id = p_user;
$$;

-- Dismantles one copy of a printing in a finish for p_amount fragments of
-- p_rarity (the server works both out from the card data and the economy
-- settings). p_named: every printing id of that card, for the last-copy rule
-- when p_protect_last is true. Errors: 'not_owned', 'last_copy'.
create or replace function public.dismantle_card(
  p_user uuid, p_ref text, p_card text, p_finish text, p_rarity text, p_amount integer, p_named text[], p_protect_last boolean
)
returns table (fragments jsonb, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have integer;
  v_total integer;
begin
  -- One change at a time per player (the same lock as purchases).
  perform 1 from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  if exists (select 1 from fragment_ledger where user_id = p_user and kind = 'dismantle' and ref = p_ref) then
    return query select fragment_json(p_user), false;
    return;
  end if;
  if p_amount <= 0 then
    raise exception 'bad amount';
  end if;
  select count into v_have from owned_cards where user_id = p_user and scryfall_id = p_card and finish = p_finish;
  if coalesce(v_have, 0) < 1 then
    raise exception 'not_owned';
  end if;
  if p_protect_last then
    select coalesce(sum(count), 0) into v_total from owned_cards where user_id = p_user and scryfall_id = any (p_named);
    if v_total <= 1 then
      raise exception 'last_copy';
    end if;
  end if;
  if v_have = 1 then
    delete from owned_cards where user_id = p_user and scryfall_id = p_card and finish = p_finish;
  else
    update owned_cards set count = count - 1 where user_id = p_user and scryfall_id = p_card and finish = p_finish;
  end if;
  insert into fragment_balances (user_id, rarity, amount) values (p_user, p_rarity, p_amount)
  on conflict (user_id, rarity) do update set amount = fragment_balances.amount + excluded.amount;
  insert into fragment_ledger (user_id, kind, ref, rarity, amount, scryfall_id, finish)
    values (p_user, 'dismantle', p_ref, p_rarity, p_amount, p_card, p_finish);
  return query select fragment_json(p_user), true;
end;
$$;

-- Crafts one non-foil copy of a printing for p_cost fragments of p_rarity.
-- Error: 'not_enough' (nothing changes).
create or replace function public.craft_card(p_user uuid, p_ref text, p_card text, p_rarity text, p_cost integer)
returns table (fragments jsonb, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_have integer;
begin
  perform 1 from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  if exists (select 1 from fragment_ledger where user_id = p_user and kind = 'craft' and ref = p_ref) then
    return query select fragment_json(p_user), false;
    return;
  end if;
  if p_cost <= 0 then
    raise exception 'bad amount';
  end if;
  select amount into v_have from fragment_balances where user_id = p_user and rarity = p_rarity;
  if coalesce(v_have, 0) < p_cost then
    raise exception 'not_enough';
  end if;
  update fragment_balances set amount = amount - p_cost where user_id = p_user and rarity = p_rarity;
  insert into owned_cards (user_id, scryfall_id, finish, count) values (p_user, p_card, 'nonfoil', 1)
  on conflict (user_id, scryfall_id, finish) do update set count = owned_cards.count + 1;
  insert into fragment_ledger (user_id, kind, ref, rarity, amount, scryfall_id, finish)
    values (p_user, 'craft', p_ref, p_rarity, -p_cost, p_card, 'nonfoil');
  return query select fragment_json(p_user), true;
end;
$$;

revoke all on function public.fragment_json(uuid) from public, anon, authenticated;
revoke all on function public.dismantle_card(uuid, text, text, text, text, integer, text[], boolean) from public, anon, authenticated;
revoke all on function public.craft_card(uuid, text, text, text, integer) from public, anon, authenticated;
