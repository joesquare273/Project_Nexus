-- Bulk dismantling (docs/economy.md, "Crafting"): the Craft tab's dismantle
-- list goes through as one transaction. Every card is checked before
-- anything changes; if one can't be dismantled, nothing is. Applied once per
-- request id: each card gets its own ledger row with ref '<request id>#<n>',
-- and a repeat (row '#1' already there) returns the balances unchanged.
--
-- p_items: [{ "card", "finish", "rarity", "amount" (fragments per copy),
-- "count", "named" (every printing id of that card) }], worked out by the
-- game server from the card data and the economy settings.
-- Errors: 'not_owned:<card>', 'last_copy:<card>'.

create or replace function public.dismantle_cards(p_user uuid, p_ref text, p_items jsonb, p_protect_last boolean)
returns table (fragments jsonb, applied boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_n integer;
  v_card text;
  v_finish text;
  v_count integer;
  v_amount integer;
  v_have integer;
  v_named text[];
  v_total integer;
  v_going integer;
begin
  -- One change at a time per player (the same lock as purchases).
  perform 1 from profiles where id = p_user for update;
  if not found then
    raise exception 'no profile for %', p_user;
  end if;
  if exists (select 1 from fragment_ledger where user_id = p_user and kind = 'dismantle' and ref = p_ref || '#1') then
    return query select fragment_json(p_user), false;
    return;
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'bad amount';
  end if;

  -- Check every card first.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_card := v_item ->> 'card';
    v_finish := v_item ->> 'finish';
    v_count := (v_item ->> 'count')::integer;
    v_amount := (v_item ->> 'amount')::integer;
    if coalesce(v_count, 0) <= 0 or coalesce(v_amount, 0) <= 0 then
      raise exception 'bad amount';
    end if;
    select count into v_have from owned_cards where user_id = p_user and scryfall_id = v_card and finish = v_finish;
    if coalesce(v_have, 0) < v_count then
      raise exception 'not_owned:%', v_card;
    end if;
    if p_protect_last then
      v_named := array(select jsonb_array_elements_text(v_item -> 'named'));
      select coalesce(sum(count), 0) into v_total from owned_cards where user_id = p_user and scryfall_id = any (v_named);
      select coalesce(sum((e ->> 'count')::integer), 0) into v_going from jsonb_array_elements(p_items) e where (e ->> 'card') = any (v_named);
      if v_total - v_going < 1 then
        raise exception 'last_copy:%', v_card;
      end if;
    end if;
  end loop;

  -- Then change the cards, the balances and the ledger together.
  for v_item, v_n in select value, ordinality from jsonb_array_elements(p_items) with ordinality loop
    v_card := v_item ->> 'card';
    v_finish := v_item ->> 'finish';
    v_count := (v_item ->> 'count')::integer;
    v_amount := (v_item ->> 'amount')::integer * v_count;
    -- owned_cards.count stays above 0: the row goes when its last copy does.
    delete from owned_cards where user_id = p_user and scryfall_id = v_card and finish = v_finish and count = v_count;
    if not found then
      update owned_cards set count = count - v_count where user_id = p_user and scryfall_id = v_card and finish = v_finish;
    end if;
    insert into fragment_balances (user_id, rarity, amount) values (p_user, v_item ->> 'rarity', v_amount)
    on conflict (user_id, rarity) do update set amount = fragment_balances.amount + excluded.amount;
    insert into fragment_ledger (user_id, kind, ref, rarity, amount, scryfall_id, finish)
      values (p_user, 'dismantle', p_ref || '#' || v_n, v_item ->> 'rarity', v_amount, v_card, v_finish);
  end loop;
  return query select fragment_json(p_user), true;
end;
$$;

revoke all on function public.dismantle_cards(uuid, text, jsonb, boolean) from public, anon, authenticated;
