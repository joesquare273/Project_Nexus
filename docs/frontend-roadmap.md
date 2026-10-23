# Project Nexus: frontend and rules review

Date: October 23, 2026. This is an initial source-code and reference review. A live browser layout and interaction review is still required before implementing the frontend stage.

## Agreed direction

An arcane fantasy gaming table: dark carved stone, engraved gold, restrained crystal light, fine rune details, and magical spell feedback. Keep the artwork and interaction language distinct from the reference games. Use readable typography for rules and numbers, with a fantasy display face reserved for headings. The battlefield, cards, and current decision should remain the visual focus.

The user requested a pause after each commit and will say **proceed** after pushing. The current casting-card commit is separate from this future frontend work.

## What is already present

- The stylesheet uses dark green felt colors, gold buttons, system typography, and compact battlefield cards. This is a useful functional base; the theme can gain more fantasy character and stronger visual hierarchy.
- The board already has a phase display, stack, target selection, mana payment state, attack and block selections, card inspection, and graveyard/exile views.
- Phase indicators are rendered as spans. The keyboard handler found in the game component closes the context menu with Escape; broader gameplay shortcuts need an audit and implementation.
- CardFlights already animates zone changes, uses face-down artwork for hidden information, caps large batches at 12 flights, and respects reduced-motion preferences. It currently uses a 520 ms flight with 70 ms staggering. Preserve these safeguards while improving the presentation.
- The code has separate menu, payment, targeting, and combat selections. The redesign should make the current decision obvious and keep these controls in predictable locations.

## Reference findings and design inferences

| Reference | Verified reference material | Proposed application to Nexus |
|---|---|---|
| Hearthstone | Blizzard presents a fantasy card-game world with hero identities and PC/mobile/tablet play. This review has not yet evaluated its live game interface. | A cohesive fantasy setting, tactile card emphasis, and clear player identities. Inspect gameplay footage/screens before making detailed interaction comparisons. |
| MTG Arena | Wizards documents manual and automatic mana payment, full control, tap/drag combat selection, expanded card inspection, and hand expansion/tucking. Its auto-tap discussion emphasizes showing mana choices when they affect outcomes. | A clear priority indicator, optional automation with visible payment review, easy attack/block selection, and reliable card inspection. |
| Dueling Nexus | Its official manual-mode announcement describes compact context menus and visual initiation/resolution of chains. | Compact card action menus and an easily read stack. Nexus menus should expose the MTG engine's legal actions. |

These applications are design proposals, not claims that the games share the same rules or that Nexus already implements them.

Sources: [Hearthstone](https://hearthstone.blizzard.com/en-us), [Arena controls and combat](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-january-2021-01-21), [Arena mana payment review](https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-the-brothers-war), [Dueling Nexus manual-mode announcement](https://duelingnexus.com/blog/game-update-manual-mode-open-beta/).

## Proposed controls

1. A stable action area that clearly names the current decision: pass priority, select targets, pay costs, declare attackers, or assign blockers. Distinguish passing priority from advancing through a turn.
2. A visible priority owner and stack order, with inspectable spell/ability details and response windows. Full control and phase stops must preserve MTG timing.
3. Payment review showing mana colors and amounts, reserved artifacts/creatures, sacrifices, and cards being discarded or exiled. Allow cancellation before committing an action; do not offer a general undo after information is revealed.
4. Clear multiplayer combat links showing which opponent each creature attacks and which creature each blocker blocks. Confirm declarations after selection.
5. A pinnable inspection panel, usable keyboard focus, carefully scoped shortcuts, and touch-friendly card inspection and selection. Shortcuts must respect text entry and pending decisions.
6. Zone drawers with readable names, counts, counters, attachments, and visible selection progress. Use icons and labels as well as color to communicate state.

## Animation direction

- Casting: a short rune pulse and a card flight onto the stack when the corresponding engine event occurs.
- Resolution: move the card only after resolution; give entering permanents a restrained arrival effect.
- Combat: attacker/blocker links, brief movement, and damage/life feedback driven by the recorded combat events.
- Counters, triggers, and commander movement: small, readable indicators that explain the change.
- Keep hidden cards hidden throughout animation, provide reduced motion, avoid obscuring targets, and keep cosmetic effects from adding gameplay decisions or delaying priority unnecessarily.

## Rules audit required before claiming full MTG compliance

The repository's decisions document explicitly records simplifications. The most relevant to the requested controls are:

| Area | Current documented limitation | Rules reference |
|---|---|---|
| First strike/double strike | Both damage passes occur in one step without the intervening priority window. | 510.3–510.4 |
| Cleanup | Fixed 2026-10-23: choose discards down to seven, respect Thought Vessel, and grant priority/repeat cleanup when state-based actions or triggers require it. | 514 |
| Ward | It is implemented as an increased targeting cost rather than a counter-unless-paid trigger. | 702.21 |
| Proliferate | The engine chooses permanents/counters rather than offering the player's full legal selection. | 701, Proliferate |
| Simultaneous triggers | Each controller's ordering choices are simplified. | 603.3b |
| X values | The sampled legal list omits X = 0 and caps choices. | 107.3 and the casting procedure |

These are confirmed backlog items from the repo, not newly fixed features. Recheck current Oracle text and the Comprehensive Rules for each implementation. The UI must not imply complete rules support while these gaps remain.

For the current casting group, improvise is governed by 702.126: artifacts pay generic portions of the determined total cost; improvise is neither an alternative cost nor an additional cost. Casting payment order is covered by 601.2f–601.2i. The new scenarios cover generic-only payment, summoning-sick artifact creatures, Treasure preservation, and preventing the same artifact from paying twice.

Authoritative source: [Wizards' rules page](https://magic.wizards.com/en/rules), linking to the [September 25, 2026 Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.txt).

## Suggested implementation stages

1. Review the live board at desktop and small-window sizes; record layouts and interaction problems. Audit priority, combat damage steps, cleanup, and payment choices against the official rules.
2. Implement the fantasy visual foundation and board hierarchy with readable cards, visible zones, and accessible contrast.
3. Improve contextual controls, payment review, priority/phase controls, and combat selection alongside the engine corrections those controls require.
4. Add event-driven magical effects and validate normal and reduced-motion interaction paths.

Use reviewable commits and stop after each commit for the user's push/proceed checkpoint. Keep the remaining card roadmap visible throughout this frontend work.

## Priority controls checkpoint (October 23, 2026)

The board now has selectable priority stops, a priority-owner indicator, truthful
Pass priority labels, and full control that pauses even without playable cards.
This is client automation and interaction work; the engine-rules backlog above
remains open. After the user pushes this commit and says proceed, resume building
the remaining 34 precon cards in groups. Report usage/credits after each commit.

## 2026-10-23: battlefield scale and visible AI turns

Battlefield cards are larger, while hand sizes remain unchanged. Creature and land rows wrap without overlapping, player zones share vertical space, and crowded zones scroll. Opponent piles use a compact column. AI casts, abilities, combat, and automatic resolutions now pause visibly; Settings offers Normal, Slow, and Fast. Adventure choices name the selected half, and the stack identifies Adventure spells.
