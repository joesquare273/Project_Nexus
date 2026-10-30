-- The Store tab (economy step E4): buying single exclusive printings.
-- A store purchase is its own kind, in both the card grants and the shard
-- ledger, so purchases stay apart from packs in the records.

alter table public.card_grants drop constraint if exists card_grants_kind_check;
alter table public.card_grants add constraint card_grants_kind_check
  check (kind in ('pack_open', 'draft', 'starter_precon', 'store_purchase', 'admin_adjustment'));

alter table public.shard_ledger drop constraint if exists shard_ledger_kind_check;
alter table public.shard_ledger add constraint shard_ledger_kind_check
  check (kind in (
    'welcome_grant', 'match_reward', 'quest_reward', 'pack_purchase', 'store_purchase',
    'event_entry', 'event_prize', 'admin_adjustment'
  ));

-- Same as before, except a store purchase is paid as 'store_purchase'.
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
    select a.balance into v_balance
    from public.apply_shards(p_user, -p_cost, case when p_kind = 'store_purchase' then 'store_purchase' else 'pack_purchase' end, p_ref) a;
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
