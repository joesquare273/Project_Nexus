# Final Fantasy precon printing audit — October 23, 2026

Verified all four 100-card precons against the current MTGJSON deck downloads,
then fetched all 339 requested set/collector-number pairs from Scryfall.

| Check | Result |
|---|---:|
| Physical cards across four decks | 400 |
| Distinct card names | 320 |
| Distinct physical printings | 339 |
| Decklist differences from source | 0 |
| Incorrect artwork assignments before fix | 33 |
| Alternate printing records added | 19 |

The affected names were Arcane Signet, Sol Ring, Command Tower, Plains, Island,
Swamp, Mountain and Forest. Artwork previously used a single image per rules
ID. The decklists already specified the correct printings, but that information
was lost when card instances were created. Each physical card now retains its
printing, including mixed basic-land artwork within the same deck.

| Card | Verified requested printings |
|---|---|
| Arcane Signet | FIC 332, 333, 334, 335 |
| Sol Ring | FIC 356, 357, 358, 359 |
| Command Tower | FIC 382, 484, 485, 486 |
| Plains | FIN 294, 295, 296 |
| Island | FIN 297, 298, 299 |
| Swamp | FIN 300, 301, 302 |
| Mountain | FIN 303, 304, 305 |
| Forest | FIN 306, 307, 308 |

All other requested printings matched their cached artwork. Existing canonical
metadata was refreshed from the exact Scryfall records; alternative printings
are cached in packages/cards/data/precon-printings.json. Tests cover all 400
cards after shuffle/draw, every permitted commander swap, different shared-card
images, missing-print fallbacks, and printing-preserving flight events.

Run the read-only audit (add the flag to also recheck live source decklists):

~~~powershell
node packages/cards/scripts/audit-precon-printings.ts --verify-source
~~~

Sources:

- [Limit Break source](https://mtgjson.com/api/v5/decks/LimitBreakFinalFantasyVii_FIC.json)
- [Revival Trance source](https://mtgjson.com/api/v5/decks/RevivalTranceFinalFantasyVi_FIC.json)
- [Counter Blitz source](https://mtgjson.com/api/v5/decks/CounterBlitzFinalFantasyX_FIC.json)
- [Scions & Spellcraft source](https://mtgjson.com/api/v5/decks/ScionsSpellcraftFinalFantasyXiv_FIC.json)
- [Scryfall collection API](https://scryfall.com/docs/api/cards/collection)

The exact-print audit passed. Visual browser verification of the table changes
was blocked by local-preview connection timeouts; no screenshot verification is
claimed.
