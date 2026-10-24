# Card types and the rules they bring

Every card is sorted by its card type: land, creature, artifact,
enchantment, instant, sorcery (and later planeswalker and battle). The type
decides which rules apply to it. On top of the types sit broader categories
that rules and card text use: **permanent**, **nonpermanent** and **spell**.

Card data only says what a card is (`types`, plus `supertypes` and
`subtypes`). The engine attaches the rules for each type and category in one
place, `packages/engine/src/typerules.ts`, so a new card follows them just by
having the right type.

Status: **Built**, a roadmap step (K2–K6, see [starter-kits.md](starter-kits.md)),
or **Later** (not needed by the Starter Kits).

## Categories

| Category | Which types | Rules it brings | Status |
|---|---|---|---|
| **Permanent** | Land, creature, artifact, enchantment (planeswalker, battle later) | Resolves onto the battlefield and stays there (110.4). Can be tapped and untapped; untaps in its controller's untap step. Leaves only when destroyed, sacrificed, exiled, bounced, and so on. When its owner leaves a multiplayer game, it leaves too (800.4a). | Built |
| **Nonpermanent** | Instant, sorcery | Never on the battlefield. On resolution it does what it says, then goes to its owner's graveyard (608.2n). If all its targets are gone, it does nothing (608.2b). | Built |
| **Spell** | Every type except land | Cast from hand: goes on the stack, costs its mana cost, and resolves when everyone passes (601). Timing depends on its type (below). | Built |
| **Land** (not a spell) | Land | Played, not cast: doesn't use the stack, can't be responded to (305.1). One per turn, in your main phase with an empty stack (305.2). | Built |

Card abilities name these groupings directly. In a trigger's `what` filter,
`categories` picks permanents, nonpermanents or spells, and `types` /
`nonTypes` pick card types. For example, "nonland permanent" is
`categories: ["permanent"], nonTypes: ["land"]`, and "noncreature spell"
(Shambling Cie'th) is `nonTypes: ["creature"]` on a SpellCast trigger.

## Card types

| Type | Category | Rules it brings | Status |
|---|---|---|---|
| **Land** | Permanent, not a spell | Played once per turn (305.2). Mana abilities don't use the stack (605). Basic land types (Plains, Island, Swamp, Mountain, Forest) give "{T}: Add [mana]" on their own (305.6). | Built |
| **Creature** | Permanent spell | Can attack and block. Summoning sickness: can't attack or use {T} abilities until you've controlled it since your most recent turn began (302.6). Dies from lethal damage, deathtouch damage or 0 toughness (704.5f–h). Damage wears off in the cleanup step. | Built |
| **Artifact** | Permanent spell | A permanent with no extra rules of its own; cast at sorcery speed. Artifact creatures are both. Equipment (an artifact subtype) has its own rules, see below. | Built |
| **Enchantment** | Permanent spell | A permanent with no extra rules of its own; cast at sorcery speed. Aura spells target a legal enchanted object and enter attached; illegal targets prevent entry. | Built |
| **Instant** | Nonpermanent spell | Cast any time you have priority, even on other players' turns and in response to other spells (304). | Built |
| **Sorcery** | Nonpermanent spell | Cast only in your own main phase with an empty stack (307.1). | Built |
| **Planeswalker** | Permanent spell | Loyalty abilities; damage removes loyalty (306). | Later |
| **Battle** | Permanent spell | Protectors and defense counters (310). | Later |
| **Kindred** | With another type | Has creature types without being a creature (308). | Later |

**Timing:** permanent spells and sorceries are cast only in your main phase
with an empty stack. Instants, and anything with Flash, can be cast any time
you have priority.

## Supertypes

| Supertype | Rules it brings | Status |
|---|---|---|
| Basic | Any number of copies in a deck (100.2a). | Built |
| Legendary | Legend rule: control two or more with the same name and you choose one to keep; the rest go to the graveyard (704.5j). The AI keeps the one with the most counters, Equipment and buffs. | Built |
| Token | Not a card; ceases to exist outside the battlefield (111.7–8). Token art comes from each card's own Scryfall token. | Built |

## Subtypes

Most subtypes (creature types like Human or Moogle, land types like Town)
carry no rules themselves; card text refers to them. A few do: Equipment
(equip, "equipped creature", falls off when the creature leaves; built),
Treasure ("{T}, Sacrifice: add one mana of any color"; built) and Aura (targeted casting and legal attachment built). Subtypes in card data are checked
against Scryfall's official lists (`packages/cards/data/types.json`) to
catch typos.

## Adding a card

1. Copy its types from the card's type line. The categories follow from them.
2. Don't restate what a type or category already gives. A basic Swamp needs
   no `produces`; a Town does, because its mana ability is printed on it.
3. If the card relies on a rule that isn't built yet, mark it
   `notBuilt: true` until that step lands.
