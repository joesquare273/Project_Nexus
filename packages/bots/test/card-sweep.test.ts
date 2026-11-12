// A sweep over every built card (about 20 seconds): cast it (and use each activated ability, from the zone it works in) in a crowded
// game, answer every choice, and fail on stalls, engine errors, rejected legal actions, choices that
// can't be answered and broken invariants (players must see the cards they choose among). The full
// list, including situational notes, is written to SWEEP_OUT (default: card-sweep.json in the OS temp folder).
import { expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { writeFileSync } from 'node:fs';
import { activatedAbilities, applyAction, currentDefinition, getLegalActions, type Action, type GameState } from '@nexus/engine';
import { CARD_DEFS } from '@nexus/cards';
import { mana, newGame, put } from './kit-helpers.ts';
import { checkInvariants } from '../src/invariants.ts';

const OUT = process.env.SWEEP_OUT ?? `${tmpdir()}/card-sweep.json`;
const ALL = { W: 12, U: 12, B: 12, R: 12, G: 12, C: 20 };

function board(): GameState {
  const s = newGame();
  for (const pid of ['P1', 'P2']) {
    for (const id of s.players[pid]!.library) delete s.cards[id];
    s.players[pid]!.library = [];
    for (const id of ['meltstrider-eulogist', 'sol-ring', 'roving-actuator', 'hylderblade', 'forest', 'island', 'plains', 'icecave-crasher', 'quantum-riddler', 'seam-rip']) put(s, pid, id);
    put(s, pid, 'lumen-class-frigate', 'battlefield', { namedCounters: { charge: 3 } } as never);
    put(s, pid, 'starport-security', 'battlefield', { tapped: true, counters: 1 });
    for (const id of ['plains', 'island', 'swamp', 'mountain', 'forest', 'starport-security', 'sol-ring', 'hylderblade', 'lumen-class-frigate', 'quantum-riddler', 'plasma-bolt', 'honor', 'seam-rip', 'meltstrider-eulogist', 'the-endstone', 'icecave-crasher', 'nutrient-block', 'shadow-mysterious-assassin', 'thawbringer', 'divert-disaster', 'forest', 'island', 'plains', 'mountain', 'swamp'].reverse()) {
      if (CARD_DEFS[id]) put(s, pid, id, 'library');
    }
    for (const id of ['meltstrider-eulogist', 'forest', 'sol-ring', 'plasma-bolt', 'seam-rip', 'quantum-riddler', 'honor', 'hylderblade']) put(s, pid, id, 'graveyard');
    for (const id of ['forest', 'thawbringer', 'plasma-bolt', 'sol-ring']) put(s, pid, id, 'hand');
  }
  mana(s, 'P1', ALL);
  return s;
}

type Problem = { card: string; where: string; problem: string };

/** Plays on until the stack is empty and nobody is choosing, answering every decision. */
function drive(s: GameState, card: string, where: string, out: Problem[]): GameState {
  for (let guard = 0; guard < 300; guard++) {
    const p = s.pending;
    if (p.kind === 'gameOver') return s;
    for (const bad of checkInvariants(s)) out.push({ card, where, problem: `invariant: ${bad}` });
    if (p.kind === 'chooseCards' && p.cards.length === 0 && p.min === 0) out.push({ card, where, problem: `asks to choose from no cards (${p.purpose})` });
    if (p.kind === 'chooseCards' && p.cards.length < p.min) { out.push({ card, where, problem: `must choose ${p.min} but only ${p.cards.length} offered (${p.purpose})` }); return s; }
    if (p.kind === 'chooseTargets') {
      const legal = getLegalActions(s).filter((a) => a.type === 'ChooseTargets');
      if (legal.length === 0) { out.push({ card, where, problem: 'asks for targets but none are legal' }); return s; }
    }
    if (p.kind === 'priority' && s.stack.length === 0 && !s.resolving && !s.triggerQueue.length) return s;
    const legal = getLegalActions(s);
    if (legal.length === 0) { out.push({ card, where, problem: `stuck: no legal action (${p.kind}${p.kind === 'chooseCards' ? ' ' + p.purpose : ''})` }); return s; }
    // Prefer real choices over passing or skipping, so effects run.
    const pick =
      p.kind === 'chooseCards' ? legal.filter((a) => a.type === 'ChooseCards').sort((a, b) => ((b as { cards: string[] }).cards.length - (a as { cards: string[] }).cards.length))[0]
      : p.kind === 'chooseTargets' ? legal.find((a) => a.type === 'ChooseTargets' && a.targets.every((t) => t.kind !== 'none')) ?? legal[0]
      : p.kind === 'decide' ? legal.find((a) => a.type === 'Decide' && a.accept) ?? legal[0]
      : p.kind === 'priority' ? legal.find((a) => a.type === 'PassPriority') ?? legal[0]
      : p.kind === 'declareAttackers' ? legal.find((a) => a.type === 'DeclareAttackers' && a.attacks.length === 0) ?? legal[0]
      : p.kind === 'declareBlockers' ? legal.find((a) => a.type === 'DeclareBlockers' && a.blocks.length === 0) ?? legal[0]
      : legal[0];
    let r;
    try {
      r = applyAction(s, pick as Action);
    } catch (e) {
      out.push({ card, where, problem: `engine error: ${(e as Error).message.slice(0, 160)}` });
      return s;
    }
    if (!r.ok) { out.push({ card, where, problem: `legal action rejected: ${r.error}` }); return s; }
    s = r.state;
  }
  out.push({ card, where, problem: 'did not finish in 300 steps' });
  return s;
}

it('every built card can be cast or activated and resolves', { timeout: 3_600_000 }, () => {
  const problems: Problem[] = [];
  const noCast: string[] = [];
  const cards = Object.values(CARD_DEFS).filter((d) => !d.token && !d.notBuilt);
  for (const def of cards) {
    // Cast it from hand (lands: play it).
    try {
      const s = board();
      const id = put(s, 'P1', def.id, 'hand');
      const plays = getLegalActions(s).filter((a) => (a.type === 'CastSpell' || a.type === 'PlayLand') && a.card === id);
      const targeted = plays.find((a) => a.type !== 'CastSpell' || !a.targets?.some((t) => t.kind === 'none')) ?? plays[0];
      if (plays.length && plays.every((a) => a.type === 'CastSpell' && a.targets?.some((t) => t.kind === 'none'))) problems.push({ card: def.id, where: 'cast', problem: 'every way to cast it leaves a target empty' });
      if (!targeted) noCast.push(def.id);
      else {
        const r = applyAction(s, targeted);
        if (!r.ok) problems.push({ card: def.id, where: 'cast', problem: `cast rejected: ${r.error}` });
        else drive(r.state, def.id, 'cast', problems);
      }
    } catch (e) {
      problems.push({ card: def.id, where: 'cast', problem: `error: ${(e as Error).message.slice(0, 160)}` });
    }
    // Each activated ability, with the card on the battlefield.
    const abilities = activatedAbilities(def).length;
    for (let i = 0; i < abilities; i++) {
      try {
        const s = board();
        const zone = activatedAbilities(def)[i]!.zone ?? 'battlefield';
        const id = put(s, 'P1', def.id, zone, zone === 'battlefield' ? ({ namedCounters: { charge: 20, loyalty: 10, page: 3, story: 3 }, counters: 6 } as never) : {});
        // Costs this board can pay: Treasures, Frogs, Wizards to tap, a nonbasic land, a legendary hit.
        for (const extra of ['treasure-token', 'frog-token', 'clue-token']) if (CARD_DEFS[extra]) put(s, 'P1', extra);
        for (const id2 of Object.values(CARD_DEFS).filter((d) => !d.token && !d.notBuilt && d.subtypes?.includes('Wizard') && d.types.includes('creature')).slice(0, 5)) put(s, 'P1', id2.id);
        put(s, 'P2', 'ash-barrens');
        const eq = s.players.P1!.battlefield.find((x) => s.cards[x]!.defId === 'meltstrider-eulogist');
        if (currentDefinition(s, s.cards[id]!).subtypes?.includes('Equipment') && eq) s.cards[id]!.attachedTo = eq;
        const uses = getLegalActions(s).filter((a) => a.type === 'ActivateAbility' && a.card === id && a.ability === i);
        if (!uses.length) { problems.push({ card: def.id, where: `ability ${i}`, problem: 'not activatable on this board' }); continue; }
        if (uses.every((a) => (a as { targets?: { kind: string }[] }).targets?.some((t) => t.kind === 'none'))) problems.push({ card: def.id, where: `ability ${i}`, problem: 'every way to activate it leaves a target empty' });
        const use = uses.find((a) => !(a as { targets?: { kind: string }[] }).targets?.some((t) => t.kind === 'none')) ?? uses[0]!;
        const r = applyAction(s, use);
        if (!r.ok) problems.push({ card: def.id, where: `ability ${i}`, problem: `activation rejected: ${r.error}` });
        else drive(r.state, def.id, `ability ${i}`, problems);
      } catch (e) {
        problems.push({ card: def.id, where: `ability ${i}`, problem: `error: ${(e as Error).message.slice(0, 160)}` });
      }
    }
  }
  writeFileSync(OUT, JSON.stringify({ checked: cards.length, noCast, problems }, null, 1));
  // Situational, not failures: an ability this board can't use (ninjutsu, combat, a counter or card it needs),
  // "up to" targets left empty, and looking at cards none of which match.
  const situational = /not activatable on this board|leaves a target empty|asks to choose from no cards/;
  expect(problems.filter((p) => !situational.test(p.problem))).toEqual([]);
});
