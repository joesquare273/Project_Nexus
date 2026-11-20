# Secrets of Strixhaven (SOS)

Secrets of Strixhaven (released 2026-04-24; user's next set, 2026-11-20) is a
main set of 281 cards (SOS 1-281 with its basic lands; 282-368 are borderless
and other variants), imported with
`node packages/cards/scripts/import-sets.ts sos` into
`packages/cards/data/sos-set.json` (264 new definitions: the rest, mostly
basics, were defined already). `npm run scryfall` caches its card data and
images. Cards not built yet are `notBuilt`: they show everywhere with their
real images but can't be played.

The wider release, still to import: the Commander decks (SOC, 426 printings),
the Mystical Archive (SOA, 195), tokens (TSOS, TSOC), promos (PSOS) and the
Art Series (ASOS).

## Mechanics

- **Prepared** (74 cards): the same mechanic as Reality Fracture's, already in
  the engine (`becomePrepared`, `entersPrepared`, `prepare` on a card).
- **Repartee** (12): "whenever you cast an instant or sorcery spell that targets
  a creature, ..." (Graduation Day).
- **Infusion** (12): "if you gained life this turn, ..." (Foolish Fate).
- **Opus** (10): "whenever you cast an instant or sorcery spell, ..., and more
  if five or more mana was spent to cast it" (Deluge Virtuoso).
- **Increment** (9): "whenever you cast a spell, if the amount of mana you
  spent is greater than this creature's power or toughness, put a +1/+1
  counter on it" (Pensive Professor).
- **Paradigm** (5, Lessons): "then exile this spell; after you first resolve
  a spell with this name, you may cast a copy of it from exile without paying
  its mana cost at the beginning of each of your first main phases"
  (Restoration Seminar).
- **Converge** (9): counts the colors of mana spent to cast it.
- Also flashback, ward (some with non-mana costs), surveil, mill, and the
  Fractal, Pest, Inkling, Spirit, Elemental and Treasure tokens.

## Steps

| Step | What | Status |
|---|---|---|
| Import | Main set cards and images (SOS 1-281) | Done (2026-11-20) |
| Packs | Play and Collector Boosters, Packs tab, Collection binder | |
| Commander | The Commander decks (SOC) | |
| SOS1 | Lands (13) | |
| SOS2 | Prepared (74, in color batches) | |
| SOS3 | Increment and Opus | |
| SOS4 | Repartee and Infusion | |
| SOS5 | Paradigm and Converge | |
| SOS6+ | The rest, by color, then multicolor, artifacts and legends | |
