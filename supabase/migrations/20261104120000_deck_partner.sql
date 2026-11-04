-- Commander decks with two Partner commanders (rule 702.124): the second
-- commander's printing id, which must also be one of the deck's cards (the
-- server checks this, as it does for `commander`).
alter table public.decks add column if not exists partner text;
