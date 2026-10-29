-- Collections and saved decks (economy step E1b).
-- Applied by the Supabase GitHub integration when pushed. Like the accounts
-- migration, only the game server writes here (service role); browsers can
-- read their own rows only.

-- Every batch of cards added to a collection (an opened pack, a draft, the
-- free starter precon). `ref` makes each grant happen once.
create table if not exists public.card_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('pack_open', 'draft', 'starter_precon', 'admin_adjustment')),
  ref text not null,
  cards jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, ref)
);

-- A player's saved decks. `cards` is a list of {id, finish, count} (Scryfall
-- printing ids the player owns); `basics` is {W, U, B, R, G}, which are free
-- and unlimited.
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  format text not null check (format in ('commander', 'limited', 'constructed')),
  cards jsonb not null,
  basics jsonb not null,
  commander text,
  updated_at timestamptz not null default now()
);
create index if not exists decks_user on public.decks (user_id);

alter table public.card_grants enable row level security;
alter table public.decks enable row level security;
drop policy if exists "own grants" on public.card_grants;
create policy "own grants" on public.card_grants for select using (auth.uid() = user_id);
drop policy if exists "own decks" on public.decks;
create policy "own decks" on public.decks for select using (auth.uid() = user_id);

-- Adds cards to a collection, all at once: p_cards is a list of
-- {id, finish, count}. A repeated (user, kind, ref) changes nothing. With a
-- cost, the shards are paid in the same transaction (kind 'pack_purchase',
-- same ref), so a failed payment adds no cards and vice versa.
create or replace function public.grant_cards(p_user uuid, p_kind text, p_ref text, p_cost integer, p_cards jsonb)
returns table (balance integer, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  select shards into v_balance from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  if exists (select 1 from card_grants where user_id = p_user and kind = p_kind and ref = p_ref) then
    return query select v_balance, false;
    return;
  end if;
  if p_cost > 0 then
    select a.balance into v_balance from public.apply_shards(p_user, -p_cost, 'pack_purchase', p_ref) a;
  end if;
  insert into card_grants (user_id, kind, ref, cards) values (p_user, p_kind, p_ref, p_cards);
  insert into owned_cards (user_id, scryfall_id, finish, count)
    select p_user, c.id, c.finish, sum(c.count)::integer
    from jsonb_to_recordset(p_cards) as c (id text, finish text, count integer)
    group by c.id, c.finish
  on conflict (user_id, scryfall_id, finish) do update set count = owned_cards.count + excluded.count;
  return query select v_balance, true;
end;
$$;

revoke all on function public.grant_cards(uuid, text, text, integer, jsonb) from public, anon, authenticated;
