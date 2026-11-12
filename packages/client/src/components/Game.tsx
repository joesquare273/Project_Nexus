import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  COLORS,
  abilityOptions,
  activatedAbilities,
  attackTax,
  attackTaxFor,
  canAttack,
  canAttackPlayer,
  playableZone,
  choiceProblem,
  cardsToBottom,
  formatManaCost,
  getLegalActions,
  manaAbilityActions,
  manaChoices,
  manaAbilityAmount,
  spellOptions,
  spellDefinition,
  triggerSpec,
  queuedTriggerSpec,
  targetSlotEffects,
  type Action,
  type EffectSpec,
  type GameState,
  type GameView,
  type InstanceId,
  abilitySpec,
  type ManaType,
  type PlayerId,
  type Step,
  type Target,
} from '@nexus/engine';
import { planTaps, tapActions } from '@nexus/bots';
import { activatedText, cardName, modeText, stepName, targetDescription, triggerText } from '@nexus/bots/narrate';
import { defOf, scryfallOf } from '../game/cards.ts';
import { YOU, applyAll, type CardPlay, type GameSession, type PlayChoice } from '../game/session.ts';
import { tokenStackKey } from '../game/tokenStacks.ts';
import { CenterHub } from './LifeTotals.tsx';
import { CardFace, ManaText } from './Card.tsx';
import { Coach } from './Coach.tsx';
import { CardFlights } from './Flights.tsx';
import type { Lesson } from '../tutorial/lesson.ts';
import { currentTip } from '../tutorial/tips.ts';
import { GameLog, Inspector } from './Sidebar.tsx';
import { CardList, ExileList, Hand, OpponentZone, PlayerHeader, YourZone, type Mark, type ZoneHandlers } from './Zones.tsx';

/** How long a triggering card stays in the middle of the table. */
const SPOTLIGHT_MS = 2000;
/** How long a cast spell stays on screen before it has faded (user, 2026-11-10). */
const CAST_SHOW_MS = 4000;

const sameTarget = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

const STEP_SHORT: [Step, string][] = [
  ['upkeep', 'Upkeep'],
  ['draw', 'Draw'],
  ['main1', 'Main 1'],
  ['beginCombat', 'Combat'],
  ['declareAttackers', 'Attack'],
  ['declareBlockers', 'Block'],
  ['combatDamage', 'Damage'],
  ['endCombat', 'End combat'],
  ['main2', 'Main 2'],
  ['end', 'End'],
];

/** Choosing targets one at a time from a list of complete target lists. */
interface Targeting {
  title: string;
  /** The actions to take for each complete choice. */
  choices: Action[][];
  /** The targets of each choice, parallel to `choices`. */
  targets: Target[][];
  chosen: Target[];
  /** What each target slot asks for, in order ("target Equipment you control"). */
  slots?: string[];
}

/** A small menu in the prompt bar: which ability, or which mode. */
interface Menu {
  modes?: { labels: string[]; keys: string[]; choose: (key: string) => void };
  title: string;
  options: { label: string; pick: () => void }[];
}

type ManaTap = Extract<Action, { type: 'ActivateManaAbility' }>;

/**
 * Something you've chosen that costs mana, waiting while you pick the mana
 * to pay with: the sources you click are only marked (`taps`, in order) and
 * can be unmarked; nothing is tapped until you confirm, then the taps and
 * the action go together (user, 2026-11-10: no automatic payment).
 */
interface Paying {
  title: string;
  action: Action;
  /** The cost as shown ("{2}{R}"). */
  cost: string;
  taps: ManaTap[];
}

/** What an action costs right now, e.g. "{3}{R}" (commander tax and discounts included), as the engine lists it. */
function costText(s: GameState, action: Extract<Action, { type: 'CastSpell' | 'ActivateAbility' }>): string {
  const key = JSON.stringify(action);
  const options = action.type === 'CastSpell' ? spellOptions(s, YOU) : abilityOptions(s, YOU);
  const option = options.find((o) => JSON.stringify(o.action) === key);
  return option ? formatManaCost(option.cost) : (defOf(s.cards[action.card]!.defId).manaCost ?? '');
}

/**
 * The texts of a modal spell's or ability's modes: its Oracle text bullets
 * when it has them, otherwise what each mode does, from its effects
 * (Inspirit: "put your choice of a +1/+1 counter or two charge counters").
 */
function modeLabels(defId: string, modes: readonly (readonly EffectSpec[])[] | undefined): string[] {
  const bullets = (scryfallOf(defId)?.oracleText ?? '').split('\n').filter((l) => l.startsWith('•'));
  return (modes ?? []).map((m, i) => bullets[i]?.replace(/^•\s*/, '') ?? (modeText(m) || `Mode ${i + 1}`));
}

export function Game({
  session,
  onQuit,
  lesson,
  onLessonDone,
}: {
  session: GameSession;
  onQuit: () => void;
  /** Play this guided lesson on the board. */
  lesson?: Lesson;
  /** After the lesson: start the practice game. */
  onLessonDone?: () => void;
}) {
  const [lessonStep, setLessonStep] = useState(0);
  const [dismissedTips, setDismissedTips] = useState<Set<string>>(new Set());
  const [tipsOn, setTipsOn] = useState(true);
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [hovered, setHovered] = useState<InstanceId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [paying, setPaying] = useState<Paying | null>(null);
  /** A card whose ability just triggered, shown large in the middle of the table for a moment. */
  const [spotlight, setSpotlight] = useState<{ key: number; card: InstanceId } | null>(null);
  /** The spell just cast, shown for 4 seconds, then it fades (a newer cast replaces it). */
  const [castShown, setCastShown] = useState<GameSession['casts'][number] | null>(null);
  const castsSeen = useRef(session.casts.length);
  const spotlighted = useRef(0);
  const [zoneView, setZoneView] = useState<{ player: PlayerId; zone: 'graveyard' | 'exile' } | null>(null);
  const [attackers, setAttackers] = useState<Map<InstanceId, PlayerId>>(new Map());
  // Attacking a planeswalker: the one chosen as the target for the next attackers, and which attackers go for which.
  const [targetPw, setTargetPw] = useState<InstanceId | null>(null);
  const [attackPw, setAttackPw] = useState<Map<InstanceId, InstanceId>>(new Map());
  const [defender, setDefender] = useState<PlayerId>(session.opponents[0]!);
  const [blocks, setBlocks] = useState<Map<InstanceId, InstanceId>>(new Map());
  const [pickedAttacker, setPickedAttacker] = useState<InstanceId | null>(null);
  const [busy, setBusy] = useState(false);
  const fourPlayers = session.opponents.length === 3;
  const [logOpen, setLogOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const notice = session.targetHistory[0];
  const timer = useRef<number | undefined>(undefined);

  const s = session.state;
  const view: GameView = session.view();
  const pending = s.pending;
  const yourMove = pending.kind !== 'gameOver' && pending.player === YOU && !busy;

  const showError = (message: string) => {
    setError(message);
    window.setTimeout(() => setError(null), 3500);
  };

  /** Runs bots and automatic passes until the game needs you (or the game ends). */
  const run = useCallback(() => {
    window.clearTimeout(timer.current);
    if (pausedRef.current) { setBusy(false); refresh(); return; }
    for (let i = 0; i < 400; i++) {
      const step = session.advance();
      if (step === 'you' || step === 'over') {
        setBusy(false);
        refresh();
        return;
      }
      if (step === 'bot') {
        setBusy(true);
        refresh();
        timer.current = window.setTimeout(run, session.presentationDelayMs);
        return;
      }
    }
    // Many quiet steps in a row: let the screen update, then carry on.
    refresh();
    timer.current = window.setTimeout(run, 0);
  }, [session, refresh]);

  useEffect(() => {
    run();
    return () => window.clearTimeout(timer.current);
  }, [run]);

  // Online: the other player moved, or the server answered.
  useEffect(
    () =>
      session.subscribe((err) => {
        if (err) showError(err);
        run();
      }),
    [session, run],
  );

  // Show each triggering card for 2 seconds, one after another. If many trigger at once, only
  // the last few are shown so the spotlight doesn't fall far behind the game.
  useEffect(() => {
    if (spotlight) return;
    const queue = session.triggered;
    if (spotlighted.current < queue.length - 3) spotlighted.current = queue.length - 3;
    const next = queue[spotlighted.current];
    if (!next) return;
    spotlighted.current += 1;
    setSpotlight(next);
  });
  useEffect(() => {
    if (!spotlight) return;
    const t = window.setTimeout(() => setSpotlight(null), SPOTLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [spotlight]);
  useEffect(() => {
    if (session.casts.length === castsSeen.current) return;
    castsSeen.current = session.casts.length;
    setCastShown(session.casts.at(-1) ?? null);
  });
  useEffect(() => {
    if (!castShown) return;
    const t = window.setTimeout(() => setCastShown(null), CAST_SHOW_MS);
    return () => window.clearTimeout(t);
  }, [castShown]);

  // Any change of decision clears half-made selections.
  const decisionKey = `${s.turnNumber}|${s.step}|${pending.kind}|${s.stack.length}|${s.triggerQueue.length}|${s.nextId}|${s.combat?.damageStep ?? ''}`;
  const [bottomPicks, setBottomPicks] = useState<InstanceId[]>([]);
  useEffect(() => {
    setBottomPicks([]);
    setTargeting(null);
    setMenu(null);
    setPaying(null);
    session.holdPriority = false;
    setAttackers(new Map());
    setTargetPw(null);
    setAttackPw(new Map());
    setBlocks(new Map());
    setPickedAttacker(null);
  }, [decisionKey]);

  const step = lesson?.steps[lessonStep];
  const submit = (actions: Action[]) => {
    if (step) {
      // Only the move this step teaches (mana taps are always fine).
      const main = actions.filter((a) => a.type !== 'ActivateManaAbility').at(-1);
      if (main && !step.allows?.(main, s)) {
        showError(step.hint ?? 'Read the coach panel, then press Next.');
        return;
      }
    }
    const err = session.submit(actions);
    if (err) {
      showError(err);
      refresh();
      return;
    }
    setError(null);
    if (session.presentationDelayMs && !pausedRef.current) {
      setBusy(true); refresh(); window.clearTimeout(timer.current);
      timer.current = window.setTimeout(run, session.presentationDelayMs);
    } else run();
  };

  useEffect(() => {
    if (step?.done?.(s)) setLessonStep((i) => i + 1);
  });

  const plays = useMemo(
    () => (yourMove && pending.kind === 'priority' ? session.plays() : []),
    // `s` changes with every action, which is when the plays change.
    [session, yourMove, pending.kind, s],
  );
  const playsFor = (id: InstanceId) => plays.filter((p) => p.card === id);
  const legal = useMemo(() => (yourMove ? session.legal() : []), [session, yourMove, s]);

  // Trigger targets are chosen the same way as spell targets.
  const triggerTargeting: Targeting | null = useMemo(() => {
    if (!yourMove || (pending.kind !== 'chooseTargets' && pending.kind !== 'chooseCopyTargets')) return null;
    const choices = legal.filter((a): a is Extract<Action, { type: 'ChooseTargets' }> => a.type === 'ChooseTargets');
    if (pending.kind === 'chooseCopyTargets') {
      return {
        title: `${cardName(s, pending.source)}: choose targets for the copy (pick the same ones to keep them)`,
        choices: choices.map((a) => [a]),
        targets: choices.map((a) => a.targets),
        chosen: [],
        ...(choices[0] ? { slots: targetSlotEffects(s, choices[0]).map(targetDescription) } : {}),
      };
    }
    const t = s.triggerQueue[0]!;
    return {
      title: `${cardName(s, t.source)}: ${triggerText(queuedTriggerSpec(s, t))}`,
      choices: choices.map((a) => [a]),
      targets: choices.map((a) => a.targets),
      chosen: [],
      ...(choices[0] ? { slots: targetSlotEffects(s, choices[0]).map(targetDescription) } : {}),
    };
  }, [yourMove, pending, legal, s]);
  const activeTargeting = targeting ?? triggerTargeting;
  const [triggerChosen, setTriggerChosen] = useState<Target[]>([]);
  // Targets are picked, then confirmed: a misclick doesn't go through (which of `choices` the picks make up).
  const [confirmingTargets, setConfirmingTargets] = useState<number | null>(null);
  useEffect(() => {
    setTriggerChosen([]);
    setConfirmingTargets(null);
  }, [decisionKey]);
  useEffect(() => {
    if (!targeting) setConfirmingTargets(null);
  }, [targeting]);
  const chosen = targeting ? targeting.chosen : triggerChosen;

  const remaining = activeTargeting
    ? activeTargeting.targets.map((ts, i) => ({ ts, i })).filter(({ ts }) => chosen.every((c, j) => sameTarget(c, ts[j]!)))
    : [];
  const nextOptions: Target[] = [];
  for (const { ts } of remaining) {
    const t = ts[chosen.length];
    if (t && !nextOptions.some((o) => sameTarget(o, t))) nextOptions.push(t);
  }
  // Targets that aren't on the battlefield (cards in graveyards) are picked from a list.
  const offBoardOptions = nextOptions
    .filter((t): t is Extract<Target, { kind: 'card' }> => t.kind === 'card' && s.cards[t.card]?.zone !== 'battlefield')
    .map((t) => t.card);

  const pickTarget = (t: Target) => {
    if (!activeTargeting || confirmingTargets !== null) return;
    const next = [...chosen, t];
    const done = remaining.find(({ ts }) => ts.length === next.length && ts.every((x, j) => sameTarget(x, next[j]!)));
    if (targeting) setTargeting({ ...targeting, chosen: next });
    else setTriggerChosen(next);
    // Every target is picked: show them and wait for Confirm.
    if (done) setConfirmingTargets(done.i);
  };
  const confirmTargets = () => {
    if (!activeTargeting || confirmingTargets === null) return;
    const actions = activeTargeting.choices[confirmingTargets]!;
    const action = actions.at(-1)!;
    const picked = chosen;
    setConfirmingTargets(null);
    setTargeting(null);
    // A spell or ability you're playing still needs paying for; a trigger's targets are just submitted.
    if (targeting && 'card' in action) pay({ taps: actions.slice(0, -1), action, targets: picked }, `${cardName(s, action.card)}${picked.some((x) => x.kind !== 'none') ? ` → ${picked.filter((x) => x.kind !== 'none').map((x) => targetLabel(view, x)).join(', ')}` : ''}`);
    else submit(actions);
  };
  const changeTargets = () => {
    setConfirmingTargets(null);
    if (targeting) setTargeting({ ...targeting, chosen: [] });
    else setTriggerChosen([]);
  };

  /**
   * Pays for a chosen play: a spell or ability with a mana cost waits while
   * you pick the mana to pay with and confirm it (always, even when floating
   * mana covers it). Free ones go at once.
   */
  const pay = (choice: PlayChoice, title: string) => {
    const { action } = choice;
    if (action.type !== 'CastSpell' && action.type !== 'ActivateAbility') {
      submit([action]);
      return;
    }
    const cost = costText(s, action);
    if (!/[1-9WUBRGCSX]/.test(cost.replace(/\{0\}/g, ''))) {
      submit([action]);
      return;
    }
    startPaying({ title, action, cost, taps: [] });
  };

  const startPaying = (p: Paying) => {
    session.holdPriority = true;
    setPaying(p);
  };

  const stopPaying = () => {
    setPaying(null);
    session.holdPriority = false;
  };

  /** The game as it would be after the marked taps (they aren't made until you confirm). */
  const planned = paying ? applyAll(s, paying.taps) : null;
  const planState = planned && !('error' in planned) ? planned.state : s;
  const canConfirm = !!paying && session.canSubmit([...paying.taps, paying.action]);

  /** Marks a mana ability to use for the payment. */
  const markTap = (tap: ManaTap) => {
    if (!paying) return;
    setPaying({ ...paying, taps: [...paying.taps, tap] });
  };

  /** Unmarks a source's taps (and any later ones that only worked because of them). */
  const unmarkSource = (id: InstanceId) => {
    if (!paying) return;
    const kept: ManaTap[] = [];
    for (const t of paying.taps) {
      if (t.card === id || t.tapCreature === id || t.sacrifice === id) continue;
      if (!('error' in applyAll(s, [...kept, t]))) kept.push(t);
    }
    setPaying({ ...paying, taps: kept });
  };

  /** Tapping a source for mana outside a payment: it floats until the step ends. */
  const tapForMana = (tap: ManaTap) => {
    const err = session.submit([tap]);
    if (err) {
      showError(err);
      refresh();
      return;
    }
    run();
  };

  /** Offer each legal mana ability, including a Relic's choice of creature to tap. While paying, choosing one marks it. */
  const useManaSource = (id: InstanceId) => {
    const actions = (paying ? manaAbilityActions(planState, YOU) : getLegalActions(s)).filter((a): a is ManaTap => a.type === 'ActivateManaAbility' && a.card === id);
    if (actions.length === 0) return showError(paying ? 'That source has no mana left to give for this.' : 'That source can’t make mana right now.');
    const choose = (a: ManaTap) => {
      setMenu(null);
      if (paying) markTap(a);
      else tapForMana(a);
    };
    if (actions.length === 1) return choose(actions[0]!);
    const def = defOf(s.cards[id]!.defId);
    setMenu({
      title: `${cardName(s, id)}: add which mana?`,
      options: [
        ...actions.filter((a) => !a.tapCreature).map((a) => ({
          label: a.output !== undefined ? `Pay ${def.manaAbility!.paid!.costs[a.payWith ?? 0]}: add ${def.manaAbility!.paid!.outputs[a.output]}`
            : a.sacrifice ? `Sacrifice ${cardName(s, a.sacrifice)}: add ${`{${a.mana}}`.repeat(manaAbilityAmount(s.cards[id]!, def))}`
            : `Add ${`{${a.mana}}`.repeat(a.grantedBy ? 1 : manaAbilityAmount(s.cards[id]!, def))}${a.grantedBy ? ` via ${cardName(s, a.grantedBy)}` : ''}`,
          pick: () => choose(a),
        })),
        ...[...new Set(actions.flatMap((a) => a.tapCreature ? [a.tapCreature] : []))].map((creature) => ({
          label: `Tap ${cardName(s, creature)} for mana`,
          pick: () => setMenu({
            title: `Tap ${cardName(s, creature)}: choose a color`,
            options: actions.filter((a) => a.tapCreature === creature).map((a) => ({
              label: `Add {${a.mana}}`, pick: () => choose(a),
            })),
          }),
        })),
      ],
    });
  };

  /** Taps the marked sources and makes the play, all at once. */
  const confirmPayment = () => {
    if (!paying) return;
    const actions = [...paying.taps, paying.action];
    stopPaying();
    submit(actions);
  };

  /**
   * Starts doing one play: choose its mode or modes if there's a choice, then
   * targets if needed. `modeKey` is the chosen modes joined with "+".
   */
  const startPlay = (play: CardPlay, modeKey?: string, costKey?: string) => {
    const first = play.choices[0]?.action;
    const def = spellDefinition(defOf(s.cards[play.card]!.defId), first?.type === 'CastSpell' && first.adventure);
    const keyOf = (c: PlayChoice) => c.modes?.join('+');
    const keys = [...new Set(play.choices.map(keyOf).filter((k): k is string => k !== undefined))];
    if (modeKey === undefined && keys.length > 1) {
      const labels = modeLabels(def.id, def.modes);
      const how = def.chooseModes
        ? def.chooseModes.maxWithCommander !== undefined && keys.some((k) => k.includes('+'))
          ? 'choose one, or both (you control a commander)'
          : def.chooseModes.min === def.chooseModes.max
          ? `choose ${def.chooseModes.min}`
          : `choose ${def.chooseModes.min} or more`
        : 'choose one';
      setMenu({
        title: `${def.name}: ${how}`,
        ...(def.chooseModes ? { modes: { labels, keys, choose: (key: string) => startPlay(play, key) } } : {}),
        options: def.chooseModes ? [] : keys.map((k) => ({
          label: k
            .split('+')
            .map((m) => labels[Number(m)] ?? `Mode ${Number(m) + 1}`)
            .join(' + '),
          pick: () => startPlay(play, k),
        })),
      });
      return;
    }
    // A discard or sacrifice cost: choose which card pays it.
    const costOf = (c: PlayChoice) => JSON.stringify('costCards' in c.action ? (c.action.costCards ?? []) : []);
    const forMode = play.choices.filter((c) => modeKey === undefined || keyOf(c) === modeKey);
    const costKeys = [...new Set(forMode.map(costOf))];
    if (costKey === undefined && costKeys.length > 1) {
      const ability = play.kind === 'ability' ? activatedAbilities(def)[play.ability ?? -1] : undefined;
      const spellSacrifice = play.kind !== 'ability' && (!!def.additionalCost?.sacrifice || !!def.kickerSacrifice);
      const cost = ability?.cost;
      const verb = cost?.crew !== undefined ? 'tap to crew with'
        : cost?.station ? 'tap to station with'
        : cost?.tapUntapped ? 'tap'
        : cost?.exileGraveyard ? 'exile from your graveyard'
        : cost?.returnToHand || cost?.returnUnblockedAttacker || (def.kickerReturnsToHand && spellSacrifice) ? 'return to your hand'
        : cost?.removeCounter?.from ? 'remove counters from'
        : cost?.sacrifice || spellSacrifice ? 'sacrifice'
        : 'discard';
      // No sacrifice: paying the mana instead ("or pay {2}"), or not kicking.
      const none = def.additionalCost?.orMana ? `Pay ${def.additionalCost.orMana} instead` : def.kickerSacrifice ? 'Don’t kick it' : 'None';
      setMenu({
        title: `${def.name}: ${verb} which card?`,
        options: costKeys.map((k) => ({
          label: (JSON.parse(k) as InstanceId[]).map((id) => cardName(s, id)).join(', ') || none,
          pick: () => startPlay(play, modeKey, k),
        })),
      });
      return;
    }
    setMenu(null);
    const choices = forMode.filter((c) => costKey === undefined || costOf(c) === costKey);
    const only = choices.length === 1 ? choices[0]! : null;
    if (only && only.targets.length === 0) {
      pay(only, play.kind === 'ability' ? `${def.name}: ${play.label}` : def.name);
      return;
    }
    setTargeting({
      title: `${play.kind === 'ability' ? play.label : def.name}: choose a target`,
      choices: choices.map((c) => [...c.taps, c.action]),
      targets: choices.map((c) => c.targets),
      chosen: [],
      ...(choices[0] ? { slots: targetSlotEffects(s, choices[0].action).map(targetDescription) } : {}),
    });
  };

  /** Clicking a card you can do something with. */
  const usePlays = (id: InstanceId, cardPlays: CardPlay[]) => {
    if (cardPlays.length === 1) return startPlay(cardPlays[0]!);
    const def = defOf(s.cards[id]!.defId);
    setMenu({
      title: def.name,
      options: cardPlays.map((p) => ({
        label: p.kind === 'spell' ? (p.choices[0]?.action.type === 'CastSpell' && p.choices[0].action.adventure ? `${p.label}${p.detail ?? ''}` : `${p.label} ${def.name.split(' // ')[0]}${p.detail ?? ''}`) : p.kind === 'land' && p.label === 'Play' ? `Play ${def.name}` : p.label,
        pick: () => startPlay(p),
      })),
    });
  };

  // Combat helpers.
  // From the engine's rules rather than the legal list, which leaves out attacks you haven't added the mana for yet (Propaganda).
  const canAttackIds = new Set(
    pending.kind === 'declareAttackers' && yourMove
      ? s.players[YOU]!.battlefield.filter((id) => canAttack(s, s.cards[id]!, YOU))
      : [],
  );
  const canBlockIds = new Set(
    pending.kind === 'declareBlockers' && yourMove
      ? legal.flatMap((a) => (a.type === 'DeclareBlockers' ? a.blocks.map((x) => x.blocker) : []))
      : [],
  );
  const attacksOnYou = (view.combat?.attacks ?? []).filter((a) => a.defender === YOU).map((a) => a.attacker);
  const livingOpponents = session.opponents.filter((p) => !view.players[p]!.eliminated);
  const currentDefender = livingOpponents.includes(defender) ? defender : livingOpponents[0]!;
  const playable = new Set(plays.map((p) => p.card));
  // Your untapped mana sources, while you could tap them.
  // While paying: the sources that could still be marked, and the ones already marked (to unmark).
  const markedIds = new Set(paying ? paying.taps.map((t) => t.card) : []);
  const manaIds = new Set(
    paying
      ? manaAbilityActions(planState, YOU).map((a) => (a as ManaTap).card)
      : yourMove && pending.kind === 'priority'
        ? getLegalActions(s).filter((a) => a.type === 'ActivateManaAbility').map((a) => a.card)
        : [],
  );
  // Cards castable from outside your hand appear next to it; commanders stay in the command zone by your name.
  const libraryTop = view.players[YOU]!.libraryTop;
  const elsewhere = [...new Set([...playable, ...(libraryTop ? [libraryTop] : [])])].filter((id) => {
    const z = s.cards[id]!.zone;
    return z !== 'hand' && z !== 'battlefield' && z !== 'command';
  });

  const bottoming = yourMove && pending.kind === 'bottomCards' ? pending.count : 0;
  // Choosing cards to discard, sacrifice or keep: the cards on offer glow and toggle when clicked.
  const choosing = yourMove && pending.kind === 'chooseCards' ? pending : null;
  // Each stack item's number (1 resolves first), so the card an ability comes from can show it.
  const stackItems = [...(view.resolving ? [view.resolving] : []), ...[...view.stack].reverse()];
  const stackNumbers = new Map<InstanceId, { n: number[]; trigger: boolean }>();
  stackItems.forEach((item, i) => {
    if (item.kind !== 'ability' || item.rule) return;
    const e = stackNumbers.get(item.source) ?? { n: [], trigger: false };
    e.n.push(i + 1);
    if (item.from === 'trigger') e.trigger = true;
    stackNumbers.set(item.source, e);
  });
  const h: ZoneHandlers = {
    tokenStackKey: (id) => notice?.sourceCard === id || notice?.targets.some(t => t.kind === 'card' && t.card === id) ? id : tokenStackKey(s, id),
    markCard: (id) => {
      const marks: Mark[] = [];
      if (bottoming && s.cards[id]?.zone === 'hand') marks.push(bottomPicks.includes(id) ? 'selected' : 'target');
      if (choosing?.cards.includes(id)) {
        // In a list (library, graveyard, exile) only the picked cards get a border; on the board and in hand the offered cards glow.
        const inList = !['hand', 'battlefield', 'command'].includes(s.cards[id]?.zone ?? '');
        marks.push(bottomPicks.includes(id) ? 'selected' : inList ? 'choice' : 'target');
      }
      if (playable.has(id) && !activeTargeting && !menu && !paying) marks.push('playable');
      if (paying && markedIds.has(id)) marks.push('selected');
      else if (paying && !menu && manaIds.has(id)) marks.push('mana');
      if (nextOptions.some((t) => t.kind === 'card' && t.card === id) || legendChoices.includes(id)) marks.push('target');
      if (activeTargeting && chosen.some((t) => t.kind === 'card' && t.card === id)) marks.push('selected');
      if (canAttackIds.has(id)) marks.push(attackers.has(id) ? 'attacking' : 'can-attack');
      if (pending.kind === 'declareAttackers' && yourMove && id === targetPw) marks.push('defender');
      if (view.combat?.attacks.some((a) => a.attacker === id)) marks.push('attacking');
      if (canBlockIds.has(id)) marks.push(blocks.has(id) ? 'blocking' : 'can-block');
      if (view.combat?.blocks.some((b) => b.blocker === id)) marks.push('blocking');
      if (pickedAttacker === id) marks.push('selected');
      if (step?.focus(s).includes(id)) marks.push('focus');
      const onStack = stackNumbers.get(id);
      if (onStack) marks.push(onStack.trigger ? 'stack-trigger' : 'stack-ability');
      else if (notice?.sourceCard === id) marks.push(notice.trigger ? 'effect-trigger' : 'effect-source');
      if (notice?.targets.some(t => t.kind === 'card' && t.card === id)) marks.push('effect-target');
      if (session.recent.has(id)) marks.push('recent');
      return marks;
    },
    markPlayer: (pid) => {
      const marks: Mark[] = [];
      if (notice?.targets.some(t => t.kind === 'player' && t.player === pid)) marks.push('effect-target');
      if (nextOptions.some((t) => t.kind === 'player' && t.player === pid)) marks.push('target');
      if (activeTargeting && chosen.some((t) => t.kind === 'player' && t.player === pid)) marks.push('effect-target');
      if (pending.kind === 'declareAttackers' && yourMove && pid === currentDefender && livingOpponents.length > 1) {
        marks.push('defender');
      }
      return marks;
    },
    manaNote: (pid) => {
      const choosing = pid === YOU && paying ? paying.taps.map((t) => `{${t.mana}}`.repeat(t.output === undefined && !t.grantedBy ? manaAbilityAmount(s.cards[t.card]!, defOf(s.cards[t.card]!.defId)) : 1)).join('') : '';
      const tapped = session.manaTapped[pid];
      return { ...(choosing ? { choosing } : {}), ...(tapped ? { tapped } : {}) };
    },
    cardNote: (id) => {
      // Paying: the mana a chosen source will make ("+{R}").
      if (paying && markedIds.has(id)) {
        const mine = paying.taps.filter((t) => t.card === id);
        return `+${mine.map((t) => `{${t.mana}}`.repeat(t.output === undefined && !t.grantedBy ? manaAbilityAmount(s.cards[id]!, defOf(s.cards[id]!.defId)) : 1)).join('')}`;
      }
      if (bottomPicks.includes(id)) return choosing ? 'Chosen' : `Bottom ${bottomPicks.indexOf(id) + 1}`;
      const planned = attackers.get(id);
      if (planned && attackPw.has(id)) return `→ ${cardName(s, attackPw.get(id)!)}`;
      if (planned) return livingOpponents.length > 1 ? `→ ${planned}` : 'Attacking';
      const attack = view.combat?.attacks.find((a) => a.attacker === id);
      if (attack?.planeswalker && s.cards[attack.planeswalker]) return `→ ${cardName(s, attack.planeswalker)}`;
      if (attack) return `→ ${attack.defender === YOU ? 'You' : attack.defender}`;
      const blocking = blocks.get(id) ?? view.combat?.blocks.find((b) => b.blocker === id)?.attacker;
      if (blocking) return `Blocks ${cardName(s, blocking)}`;
      if (notice?.targets.some(t => t.kind === 'card' && t.card === id)) return 'TARGET';
      const onStack = stackNumbers.get(id);
      if (onStack) return onStack.n.join(' · ');
      const attachedTo = view.cards[id]?.attachedTo;
      if (attachedTo) return `⚔ ${cardName(s, attachedTo)}`;
      if (defOf(view.cards[id]!.defId).crew !== undefined) return view.cards[id]!.crewed ? 'Crewed until end of turn' : `Crew ${defOf(view.cards[id]!.defId).crew}`;
      const st = view.stats[id];
      if (st?.types && !st.types.includes('creature') && defOf(view.cards[id]!.defId).types.includes('creature')) return 'Not a creature';
      if (st?.cantBeBlocked) return "Can't be blocked";
      if (st?.goadedBy?.length) return 'Goaded by ' + st.goadedBy.join(', ');
      if (st?.mustBeBlocked) return 'Must be blocked';
      return null;
    },
    onCard: (id) => {
      if (!yourMove) return;
      // Paying: clicks choose and unchoose mana sources, nothing else.
      if (paying) {
        if (menu) return;
        // A marked source: click again to unmark it (Pentad Prism-like sources that can give more ask first).
        if (markedIds.has(id) && !manaIds.has(id)) return unmarkSource(id);
        if (markedIds.has(id)) {
          return setMenu({ title: `${cardName(s, id)}`, options: [
            { label: 'Use it again', pick: () => { setMenu(null); useManaSource(id); } },
            { label: 'Unmark it', pick: () => { setMenu(null); unmarkSource(id); } },
          ] });
        }
        return manaIds.has(id) ? useManaSource(id) : undefined;
      }
      if (legendChoices.includes(id)) return submit([{ type: 'ChooseLegend', player: YOU, keep: id }]);
      if (choosing?.cards.includes(id)) {
        setBottomPicks(bottomPicks.includes(id) ? bottomPicks.filter((x) => x !== id) : [...bottomPicks, id]);
        return;
      }
      if (bottoming && s.cards[id]?.zone === 'hand') {
        if (bottomPicks.includes(id)) setBottomPicks(bottomPicks.filter((x) => x !== id));
        else if (bottomPicks.length < bottoming) setBottomPicks([...bottomPicks, id]);
        return;
      }
      const option = nextOptions.find((t) => t.kind === 'card' && t.card === id);
      if (option) return pickTarget(option);
      if (activeTargeting || menu) return;
      const cardPlays = playsFor(id);
      if (cardPlays.length > 0) return usePlays(id, cardPlays);
      // Tapping a land (or other mana source) on its own floats the mana until the step ends.
      if (manaIds.has(id)) return useManaSource(id);
      // Declaring attackers: click an opponent's planeswalker to send the next attackers at it (again to go back to the player).
      if (pending.kind === 'declareAttackers' && yourMove && s.cards[id] && livingOpponents.includes(s.cards[id]!.controller) && s.cards[id]!.zone === 'battlefield' && defOf(s.cards[id]!.defId).types.includes('planeswalker')) {
        if (targetPw === id) setTargetPw(null);
        else {
          setTargetPw(id);
          setDefender(s.cards[id]!.controller);
        }
        return;
      }
      if (pending.kind === 'declareAttackers' && canAttackIds.has(id)) {
        const next = new Map(attackers);
        const nextPw = new Map(attackPw);
        const pw = targetPw && s.cards[targetPw]?.zone === 'battlefield' && s.cards[targetPw]!.controller === currentDefender ? targetPw : null;
        if (next.has(id)) {
          next.delete(id);
          nextPw.delete(id);
        } else if (canAttackPlayer(s, s.cards[id]!, currentDefender)) {
          next.set(id, currentDefender);
          if (pw) nextPw.set(id, pw);
        } else return showError('A vow prevents this creature from attacking that opponent.');
        setAttackers(next);
        setAttackPw(nextPw);
        return;
      }
      if (pending.kind === 'declareBlockers') {
        if (attacksOnYou.includes(id)) return setPickedAttacker(pickedAttacker === id ? null : id);
        if (canBlockIds.has(id)) {
          const next = new Map(blocks);
          if (next.has(id)) next.delete(id);
          else if (pickedAttacker) next.set(id, pickedAttacker);
          else if (attacksOnYou.length === 1) next.set(id, attacksOnYou[0]!);
          else return showError('Click an attacking creature first, then the creature that blocks it.');
          setBlocks(next);
        }
      }
    },
    onPlayer: (pid) => {
      if (!yourMove) return;
      const option = nextOptions.find((t) => t.kind === 'player' && t.player === pid);
      if (option) return pickTarget(option);
      if (pending.kind === 'declareAttackers' && pid !== YOU && livingOpponents.includes(pid)) {
        setDefender(pid);
        setTargetPw(null);
      }
    },
    onHover: setHovered,
    onZone: (player, zone) => setZoneView({ player, zone }),
  };

  const surveilCard = (pending.kind === 'surveil' || pending.kind === 'exileTop') && pending.player === YOU ? pending.card : null;

  // The coach panel: the lesson step, the end of the lesson, or a practice-game tip.
  let coach: ReactNode = null;
  if (lesson) {
    if (step) {
      coach = (
        <Coach
          title={step.title}
          text={step.text}
          progress={`Step ${lessonStep + 1} of ${lesson.steps.length}`}
          actions={step.done ? [] : [{ label: 'Next', onClick: () => setLessonStep((i) => i + 1), primary: true }]}
        />
      );
    } else {
      coach = (
        <Coach
          title={s.winner === YOU ? 'You won!' : 'Lesson complete'}
          text={
            "That's the core of the game: play a land each turn, cast spells with its mana, and attack. " +
            'Next, play a real game from the very start, with a random hand against the AI. Tips will pop up as new situations come up.'
          }
          actions={[
            { label: 'Back to menu', onClick: onQuit },
            ...(onLessonDone ? [{ label: 'Play a practice game', onClick: onLessonDone, primary: true }] : []),
          ]}
        />
      );
    }
  } else if (session.options.coaching && tipsOn) {
    const canPlayLand = plays.some((p) => p.kind === 'land');
    const tip = currentTip(s, dismissedTips, canPlayLand, plays.some((p) => p.kind !== 'land'));
    if (tip) {
      coach = (
        <Coach
          title={tip.title}
          text={tip.text}
          actions={[
            { label: 'Hide tips', onClick: () => setTipsOn(false) },
            { label: 'Got it', onClick: () => setDismissedTips(new Set([...dismissedTips, tip.id])), primary: true },
          ]}
        />
      );
    }
  }
  const legendChoices = yourMove && pending.kind === 'chooseLegend' ? pending.cards : [];
  const hub = (
    <CenterHub
      view={view}
      top={session.opponents.slice(0, 2)}
      bottom={[YOU, ...session.opponents.slice(2)]}
      stack={<StackView view={view} onHover={setHovered} h={h} describe={(item) => { try { const spec = abilitySpec(s, item as never); return 'when' in spec ? triggerText(spec) : activatedText(spec); } catch { return ''; } }} abilityTargets={nextOptions.flatMap(t => t.kind === 'ability' ? [t.ability] : [])} onAbility={ability => { const t = nextOptions.find(t => t.kind === 'ability' && t.ability === ability); if (t) pickTarget(t); }} />}
    />
  );

  return (
    <div className={`game ${fourPlayers ? 'four-players' : ''} ${logOpen ? 'log-open' : ''}`}>
      <main className="table">
        <div className={`opponents n${session.opponents.length}`}>
          {session.opponents.map((pid, i) => (
            <OpponentZone
              key={pid}
              view={view}
              pid={pid}
              h={h}
              fit={fourPlayers}
              // 3 and 4 players: top left and top right seats keep their commander in their bottom corner, the bottom right seat in its top right corner (yours stays top left).
              commandCorner={session.opponents.length >= 2 ? (['bottom-left', 'bottom-right', 'top-right'] as const)[i] ?? 'top-left' : 'top-left'}
            />
          ))}
        </div>
        <div className="midline">
          <PhaseTrack view={view} session={session} onChange={refresh} />
          <button
            className="pause-button ghost"
            aria-pressed={paused}
            title={paused ? 'Resume the computer players' : 'Pause the computer players'}
            onClick={() => {
              pausedRef.current = !pausedRef.current;
              setPaused(pausedRef.current);
              window.clearTimeout(timer.current);
              setBusy(false);
              if (!pausedRef.current) run();
            }}
          >
            {paused ? '▶ Resume' : '❚❚ Pause'}
          </button>
          <button className="log-toggle" aria-expanded={logOpen} onClick={() => setLogOpen(!logOpen)}>{logOpen ? 'Hide log' : 'Game log'}</button>
          <Settings session={session} onChange={refresh} onQuit={onQuit} />
          {!fourPlayers && hub}
        </div>
        {fourPlayers && hub}
        {notice && (
          <section className="target-notice" aria-label="Targeting activity">
            <details>
              <summary><span className={notice.trigger ? 'source-label trigger' : 'source-label'}>{notice.controller} · {notice.source}</span>{notice.labels.length > 0 && <> → <strong>{notice.labels.join(' + ')}</strong></>}</summary>
              <small>Most recent action · blue = source · red = trigger · orange = target</small>
              {session.targetHistory.slice(1).map((n, i) => <div key={i}>{n.controller} · {n.source}{n.labels.length ? ` → ${n.labels.join(' + ')}` : ''}</div>)}
            </details>
          </section>
        )}
        <YourZone fit={fourPlayers} view={view} h={h} placement={session.placement} onPlaced={refresh} />
        <PromptBar
          session={session}
          view={view}
          yourMove={yourMove}
          busy={busy}
          targeting={activeTargeting}
          menu={menu}
          chosen={chosen}
          paying={paying}
          planState={planState}
          canConfirm={canConfirm}
          onConfirmPayment={confirmPayment}
          onClearPayment={() => paying && setPaying({ ...paying, taps: [] })}
          onPay={(title, action, cost) => startPaying({ title, action, cost, taps: [] })}
          confirmingTargets={confirmingTargets !== null}
          onConfirmTargets={confirmTargets}
          onChangeTargets={changeTargets}
          canSkipTarget={nextOptions.some((t) => t.kind === 'none')}
          onSkipTarget={() => pickTarget({ kind: 'none' })}
          onCancel={() => {
            stopPaying();
            setTargeting(null);
            setMenu(null);
            setTriggerChosen([]);
          }}
          attackers={attackers}
          attackPw={attackPw}
          targetPw={targetPw}
          canAttackIds={canAttackIds}
          currentDefender={currentDefender}
          blocks={blocks}
          submit={submit}
          setAttackers={setAttackers}
          bottomPicks={bottomPicks}
          setBottomPicks={setBottomPicks}
        />
        <div className={`you-bar ${view.players[YOU]!.eliminated ? 'eliminated' : ''}`}>
          <Hand view={view} h={h} elsewhere={elsewhere} />
        </div>
        {error && <div className="toast"><ManaText text={error} size={15} /></div>}
        {castShown && (
          <div key={castShown.key} className="cast-show" aria-live="polite">
            <div className="cast-show-label">{castShown.player === YOU ? 'You cast' : `${castShown.player} casts`}</div>
            <div className="cast-show-card">
              <CardFace printing={castShown.printing} defId={castShown.defId} size="large" />
            </div>
          </div>
        )}
        {spotlight && view.cards[spotlight.card] && (
          <div key={spotlight.key} className="spotlight" aria-live="polite">
            <div className="spotlight-label">{cardName(s, spotlight.card)} triggers</div>
            <div className="spotlight-card">
              <CardFace printing={view.cards[spotlight.card]!.printing} defId={view.cards[spotlight.card]!.defId} size="large" />
            </div>
          </div>
        )}
        {coach}
      </main>
      <CardFlights moves={session.moves} />
      <Inspector view={view} hovering={!!hovered} id={hovered ?? (spotlight && view.cards[spotlight.card] ? spotlight.card : null) ?? surveilCard} />
      {logOpen && (
        <aside className="sidebar" aria-label="Game log">
          <div className="sidebar-head">
            <strong>Game log</strong>
            <button onClick={() => setLogOpen(false)} aria-label="Close the game log">✕</button>
          </div>
          <GameLog entries={session.log} />
        </aside>
      )}
      {/* "Look at the top seven cards of your library": the cards on offer. */}
      {choosing?.purpose === 'fateBottom' && (
        <CardList view={view} title="Coin of Fate: choose the card for the bottom of its owner's library" ids={choosing.cards} h={h}
          actions={<button className="primary" disabled={!!choiceProblem(s, choosing, bottomPicks)} onClick={() => submit([{ type: 'ChooseCards', player: YOU, cards: bottomPicks }])}>Put on bottom</button>}
        />
      )}
      {(choosing?.purpose === 'search' || choosing?.purpose === 'digLands') && (
        <CardList
          view={view}
          title={
            choosing.purpose === 'search'
              ? choosing.searchTo === 'exileFaceDown'
                ? `Search their library: choose a card to exile face down; you may play it while it stays exiled (${bottomPicks.length} chosen)`
                : `Search your library: choose up to ${choosing.max} (${bottomPicks.length} chosen)`
              : `Choose any lands to put onto the battlefield tapped (${bottomPicks.length} chosen)`
          }
          ids={choosing.cards}
          h={h}
          actions={
            <button className="primary" disabled={!!choiceProblem(s, choosing, bottomPicks)} onClick={() => submit([{ type: 'ChooseCards', player: YOU, cards: bottomPicks }])}>
              {choosing.purpose === 'search' ? (bottomPicks.length ? 'Take these' : 'Find nothing') : 'Done'}
            </button>
          }
        />
      )}
      {/* Grief: the opponent's revealed hand, to choose the card they discard. */}
      {choosing?.purpose === 'discard' && choosing.cards.some((id) => view.cards[id]?.owner !== YOU) && (
        <CardList
          view={view}
          title={`Their revealed hand: choose ${choosing.min} for them to discard (${bottomPicks.length} chosen)`}
          ids={choosing.cards}
          h={h}
          actions={
            <button className="primary" disabled={!!choiceProblem(s, choosing, bottomPicks)} onClick={() => submit([{ type: 'ChooseCards', player: YOU, cards: bottomPicks }])}>
              Discard
            </button>
          }
        />
      )}
      {choosing?.purpose === 'hand' && (
        <CardList
          view={view}
          title={`${choosing.cards.every((id) => s.cards[id]?.zone === 'graveyard') ? 'Your graveyard' : 'Top of your library'}: choose ${choosing.min} for your hand (${bottomPicks.length} chosen)`}
          ids={choosing.cards}
          h={h}
          actions={
            <button
              className="primary"
              disabled={!!choiceProblem(s, choosing, bottomPicks)}
              onClick={() => submit([{ type: 'ChooseCards', player: YOU, cards: bottomPicks }])}
            >
              Put into your hand
            </button>
          }
        />
      )}
      {choosing?.purpose === 'lookTop' && (
        <CardList
          view={view}
          title={`Top of your library: you may choose ${choosing.max > 1 ? 'any of' : 'one of'} ${choosing.cards.length} matching card${choosing.cards.length === 1 ? '' : 's'} to put ${choosing.lookTo === 'battlefield' ? 'onto the battlefield' : 'into your hand'} (${bottomPicks.length} chosen)`}
          ids={choosing.looked ?? choosing.cards}
          h={h}
          actions={
            <button
              className="primary"
              disabled={!!choiceProblem(s, choosing, bottomPicks)}
              onClick={() => submit([{ type: 'ChooseCards', player: YOU, cards: bottomPicks }])}
            >
              {bottomPicks.length ? (choosing.lookTo === 'battlefield' ? 'Put onto the battlefield' : 'Put into your hand') : 'Take nothing'}
            </button>
          }
        />
      )}
      {offBoardOptions.length > 0 && (
        <CardList view={view} title={activeTargeting?.title ?? 'Choose a target'} ids={offBoardOptions} h={h} />
      )}
      {surveilCard && view.cards[surveilCard] && (
        <div className="surveil-card">
          <div className="surveil-label">Top of your library</div>
          <CardFace printing={view.cards[surveilCard]!.printing} defId={view.cards[surveilCard]!.defId} size="normal" />
        </div>
      )}
      {zoneView?.zone === 'exile' && (
        <ExileList
          view={view}
          pid={zoneView.player}
          h={h}
          castable={new Set(view.players[zoneView.player]!.exile.filter((id) => s.cards[id] && playableZone(s, YOU, s.cards[id]!) === 'exile'))}
          onClose={() => setZoneView(null)}
        />
      )}
      {zoneView?.zone === 'graveyard' && (
        <CardList
          view={view}
          title={`${zoneView.player === YOU ? 'Your' : `${zoneView.player}'s`} ${zoneView.zone}`}
          ids={[...view.players[zoneView.player]![zoneView.zone]].reverse()}
          h={h}
          onClose={() => setZoneView(null)}
        />
      )}
      {pending.kind === 'gameOver' && !lesson && (
        <div className="overlay">
          <div className="overlay-box">
            <h2>{s.winner === YOU ? 'You win!' : s.winner ? `${s.winner} wins` : 'Draw'}</h2>
            <p>
              Turn {s.turnNumber} · seed {session.options.seed}
            </p>
            {session.rewards && session.rewards.lines.length > 0 && (
              <div className="game-rewards">
                <h3>You earned</h3>
                <ul>
                  {session.rewards.lines.map((l) => (
                    <li key={l.label}>
                      <span>{l.label}</span> <strong>+{l.amount.toLocaleString()}</strong>
                    </li>
                  ))}
                </ul>
                <p className="fineprint">
                  {session.rewards.lines.reduce((n, l) => n + l.amount, 0).toLocaleString()} Aether Shards
                  {session.rewards.balance !== null ? ` · balance ${session.rewards.balance.toLocaleString()}` : ''}
                </p>
              </div>
            )}
            <button onClick={onQuit}>Back to menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The gear button on the board and its panel: game options, the seed, and the way back to the menu. */
function Settings({ session, onChange, onQuit }: { session: GameSession; onChange: () => void; onQuit: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Close on a click anywhere else, or Escape.
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="game-settings" ref={box}>
      <button className={`settings-button ${open ? 'open' : ''}`} onClick={() => setOpen(!open)} title="Settings" aria-expanded={open}>
        ⚙
      </button>
      {open && (
        <div className="settings-panel" role="dialog" aria-label="Settings">
          <div className="settings-title">Settings</div>
          <p className="settings-help">Select a step on the turn track to pause for priority there on any player's turn. ◆ marks a selected stop.</p>
          <label title="Pause whenever you receive priority, even when you have no playable cards">
            <input
              type="checkbox"
              checked={session.stopEverywhere}
              onChange={(e) => {
                session.stopEverywhere = e.target.checked;
                onChange();
              }}
            />{' '}
            Full control: pause for priority
          </label>
          <label title="After you cast a spell or activate an ability, keep priority so you can add more before anyone responds, when you have an instant, flash spell or ability you can pay for (otherwise it passes for you)">
            <input
              type="checkbox"
              checked={session.keepPriority}
              onChange={(e) => {
                session.keepPriority = e.target.checked;
                onChange();
              }}
            />{' '}
            Hold priority after casting
          </label>
          <label>
            AI action speed
            <select aria-label="AI action speed" value={session.aiPace} onChange={(e) => { session.aiPace = e.target.value as typeof session.aiPace; onChange(); }}>
              <option value="normal">Normal — watch each action</option>
              <option value="slow">Slow — extra reading time</option>
              <option value="fast">Fast</option>
            </select>
          </label>
          <div className="settings-foot">
            <span className="seed">Seed {session.options.seed}</span>
            <button className="ghost" onClick={onQuit}>
              Back to menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseTrack({ view, session, onChange }: { view: GameView; session: GameSession; onChange: () => void }) {
  return (
    <div className="phases" role="group" aria-label="Turn steps and priority stops">
      <span className="phase-owner">{view.activePlayer === YOU ? 'Your turn' : `${view.activePlayer}'s turn`}</span>
      {STEP_SHORT.map(([step, label]) => (
        <button
          key={step}
          className={`phase ${view.step === step ? 'current' : ''} ${session.phaseStops.has(step) ? 'stop' : ''}`}
          aria-pressed={session.phaseStops.has(step)}
          aria-current={view.step === step ? 'step' : undefined}
          aria-label={`${label}: ${session.phaseStops.has(step) ? 'remove' : 'add'} priority stop`}
          title={`Pause when you receive priority in ${label}, on any player's turn. Click to ${session.phaseStops.has(step) ? 'remove' : 'add'} this stop.`}
          onClick={() => {
            if (session.phaseStops.has(step)) session.phaseStops.delete(step);
            else session.phaseStops.add(step);
            onChange();
          }}
        >
          {step === 'combatDamage' && view.step === step && view.combat?.damageStep === 'first' ? 'First-strike damage' : label}
          {session.phaseStops.has(step) && <span aria-hidden="true"> ◆</span>}
        </button>
      ))}
      <span className="turn-no">Turn {view.turnNumber}</span>
      <span className={`priority-owner ${view.pending.kind !== 'gameOver' && view.pending.player === YOU ? 'yours' : ''}`}>
        {view.pending.kind === 'priority'
          ? `${view.pending.player === YOU ? 'You have' : `${view.pending.player} has`} priority`
          : view.pending.kind === 'gameOver' ? 'Game over' : `${view.pending.player === YOU ? 'Your' : `${view.pending.player}'s`} decision`}
      </span>
    </div>
  );
}

function StackView({ view, onHover, h, abilityTargets, onAbility, describe }: { view: GameView; onHover: (id: InstanceId | null) => void; h: ZoneHandlers; abilityTargets: string[]; onAbility: (id: string) => void; describe: (item: GameView['stack'][number]) => string }) {
  const items = [...(view.resolving ? [view.resolving] : []), ...[...view.stack].reverse()];
  if (items.length === 0) return null;
  return (
    <div className="stack">
      <div className="stack-title">Stack <span className="stack-count">{items.length}</span><small>1 resolves first</small></div>
      {items.map((item, i) => {
        const cardId = item.kind === 'spell' ? item.card : item.source;
        const c = view.cards[cardId];
        return (
          <div
            key={item.id}
            {...(item.kind === 'spell' ? { 'data-card': cardId } : {})}
            className={`stack-item ${i === 0 ? 'top' : ''} ${item.kind === 'spell' ? h.markCard(cardId).join(' ') : abilityTargets.includes(item.id) ? 'target' : ''}`}
            onMouseEnter={() => onHover(cardId)}
            onMouseLeave={() => onHover(null)}
            // Abilities are targeted by stack-item identity, independently of their source.
            onClick={() => item.kind === 'spell' ? h.onCard(cardId) : onAbility(item.id)}
            role={item.kind === 'ability' && abilityTargets.includes(item.id) ? 'button' : undefined}
            tabIndex={item.kind === 'ability' && abilityTargets.includes(item.id) ? 0 : undefined}
            onKeyDown={e => { if (item.kind === 'ability' && abilityTargets.includes(item.id) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onAbility(item.id); } }}
          >
            <div className={`stack-order ${item.kind === 'spell' ? 'spell' : item.from === 'trigger' ? 'trigger' : 'ability'}`} title={i === 0 ? (item === view.resolving ? 'Resolving now' : 'Resolves next') : undefined}>{i + 1}</div>
            {c && (
              <div className="stack-thumb">
                <CardFace printing={c.printing} defId={c.defId} size="small" />
              </div>
            )}
            <div>
              <div className="stack-name">
                {c ? (item.kind === 'spell' && item.adventure ? `${defOf(c.defId).adventure!.name} — Adventure` : defOf(c.defId).name.split(' // ')[0]) : (item.kind === 'ability' && item.rule === 'monarch' ? 'The monarch' : 'A card')}
                {item.kind === 'ability' && <em> — ability</em>}
                {item.kind === 'ability' && item.modes && <em> (mode{item.modes.length > 1 ? 's' : ''} {item.modes.map((i) => i + 1).join(' + ')})</em>}
                {item === view.resolving && <em> (resolving)</em>}
              </div>
              <div className="stack-meta">
                <span className={item.controller === YOU ? 'stack-who yours' : 'stack-who'}>{item.controller === YOU ? 'Yours' : item.controller}</span>
                {item.targets.some((t) => t.kind !== 'none') && <span className="stack-targets"> → {item.targets.filter((t) => t.kind !== 'none').map((t) => targetLabel(view, t)).join(', ')}</span>}
              </div>
              {item.kind === 'ability' && describe(item) && <div className="stack-text"><ManaText text={describe(item)} size={13} /></div>}
              {item.kind === 'spell' && c && (item.modes || item.mode !== undefined) && <div className="stack-modes">
                {(item.modes ?? [item.mode!]).map(mode => <div key={mode}>• <ManaText text={modeLabels(c.defId, defOf(c.defId).modes)[mode] ?? ''} size={12} /></div>)}
              </div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function targetLabel(view: GameView, t: Target): string {
  if (t.kind === 'none') return 'no target';
  if (t.kind === 'player') return t.player === YOU ? 'you' : t.player;
  if (t.kind === 'ability') {
    const item = view.stack.find(item => item.id === t.ability);
    return item?.kind === 'ability' && item.rule === 'monarch' ? 'The monarch ability' : item?.kind === 'ability' ? (view.cards[item.source] ? defOf(view.cards[item.source]!.defId).name : 'A card') + ' ability' : 'an ability';
  }
  const c = view.cards[t.card];
  return c ? defOf(c.defId).name : 'a card';
}

interface PromptProps {
  session: GameSession;
  view: GameView;
  yourMove: boolean;
  busy: boolean;
  targeting: Targeting | null;
  menu: Menu | null;
  paying: Paying | null;
  /** The game as it would be after the marked taps. */
  planState: GameState;
  canConfirm: boolean;
  onConfirmPayment: () => void;
  onClearPayment: () => void;
  /** Start paying for something that costs mana outside casting (a "pay {1}" choice, an attack tax). */
  onPay: (title: string, action: Action, cost: string) => void;
  canSkipTarget: boolean;
  confirmingTargets: boolean;
  onConfirmTargets: () => void;
  onChangeTargets: () => void;
  onSkipTarget: () => void;
  chosen: Target[];
  onCancel: () => void;
  attackers: Map<InstanceId, PlayerId>;
  attackPw: Map<InstanceId, InstanceId>;
  targetPw: InstanceId | null;
  canAttackIds: Set<InstanceId>;
  currentDefender: PlayerId;
  blocks: Map<InstanceId, InstanceId>;
  submit: (actions: Action[]) => void;
  setAttackers: (m: Map<InstanceId, PlayerId>) => void;
  bottomPicks: InstanceId[];
  setBottomPicks: (ids: InstanceId[]) => void;
}

function PromptBar(p: PromptProps) {
  const [modePicks, setModePicks] = useState<number[]>([]);
  useEffect(() => setModePicks([]), [p.menu]);
  const s = p.session.state;
  const pending = s.pending;
  /** Ordering your simultaneous triggers: the ones clicked so far, in resolve order. */
  const [orderPicks, setOrderPicks] = useState<number[]>([]);
  const orderKey = pending.kind === 'orderTriggers' ? `${s.turnNumber}:${s.triggerQueue.map((t) => t.source).join()}` : '';
  useEffect(() => setOrderPicks([]), [orderKey]);
  let text: string;
  let buttons: { label: string; onClick: () => void; primary?: boolean; disabled?: boolean; title?: string }[] = [];

  if (pending.kind === 'gameOver') {
    text = 'Game over.';
  } else if (!p.yourMove) {
    text = pending.player === YOU ? 'Preparing your next decision…' : `${pending.player} is thinking…`;
  } else if (p.menu) {
    text = `${p.menu.title}:`;
    const modeMenu = p.menu.modes;
    if (modeMenu) {
      const key = [...modePicks].sort((a,b) => a-b).join('+');
      text += ` ${modePicks.length} selected.`;
      buttons = [
        ...(modeMenu.keys.includes(key) ? [{ label: 'Confirm modes', onClick: () => modeMenu.choose(key), primary: true }] : []),
        { label: 'Cancel', onClick: p.onCancel },
      ];
    } else buttons = [...p.menu.options.map((o) => ({ label: o.label, onClick: o.pick })), { label: 'Cancel', onClick: p.onCancel }];
  } else if (p.paying) {
    // The mana you'd have once the marked sources are tapped (floating mana included).
    const pl = p.planState.players[YOU]!;
    const ready = [pl.manaPool, pl.equipmentMana, pl.artifactMana ?? {}, pl.noncreatureSpellMana, ...Object.values(pl.restrictedMana ?? {})]
      .flatMap((pool) => Object.entries(pool).flatMap(([m, n]) => Array.from({ length: n as number }, () => `{${m}}`)))
      .join('');
    text =
      `${p.paying.title}: pay ${p.paying.cost}. Click your lands and other mana sources to choose them (click again to unchoose). ` +
      (ready ? `Chosen: ${ready}. ` : '') +
      (p.canConfirm ? 'Press Confirm to tap them and go ahead.' : 'Choose enough mana, then Confirm.');
    buttons = [
      { label: 'Cancel', onClick: p.onCancel },
      ...(p.paying.taps.length ? [{ label: 'Clear', onClick: p.onClearPayment }] : []),
      { label: 'Confirm', onClick: p.onConfirmPayment, primary: true, disabled: !p.canConfirm },
    ];
  } else if (p.targeting && p.confirmingTargets) {
    const names = p.chosen.map((t) => targetLabel(p.view, t));
    text = `${p.targeting.title.replace(/: choose a target$/, '').replace(/\.$/, '')} → ${names.join(', ')}. Confirm, or change your target${names.length > 1 ? 's' : ''}.`;
    buttons = [
      ...(pending.kind === 'priority' ? [{ label: 'Cancel', onClick: p.onCancel }] : []),
      { label: names.length > 1 ? 'Change targets' : 'Change target', onClick: p.onChangeTargets },
      { label: 'Confirm', onClick: p.onConfirmTargets, primary: true },
    ];
  } else if (p.targeting) {
    const slots = p.targeting.slots ?? [];
    const slot = slots[p.chosen.length];
    // Say which target this is ("choose target Equipment you control, 1 of 2"), so clicks go to the right slot.
    text = slot
      ? `${p.targeting.title.replace(/: choose a target$/, '').replace(/\.$/, '')}: choose ${slot}${slots.length > 1 ? ` (${p.chosen.length + 1} of ${slots.length})` : ''}. Click a highlighted card, player, or stack ability.`
      : `${p.targeting.title.replace(/\.$/, '')}${p.chosen.length > 0 ? ` (target ${p.chosen.length + 1})` : ''}. Click a highlighted card, player, or stack ability.`;
    if (pending.kind === 'priority') buttons = [{ label: 'Cancel', onClick: p.onCancel }];
    // An "up to one" target can be left out.
    if (p.canSkipTarget) buttons = [...buttons, { label: 'No target', onClick: p.onSkipTarget }];
  } else if (pending.kind === 'mulligan') {
    const hand = s.players[YOU]!.hand;
    const lands = hand.filter((id) => defOf(s.cards[id]!.defId).types.includes('land')).length;
    const bottom = cardsToBottom(s, pending.taken + 1);
    const canMulligan = bottom <= s.format.startingHandSize;
    const after = pending.taken > 0 ? ` after ${pending.taken} mulligan${pending.taken === 1 ? '' : 's'}` : '';
    text = `Your opening hand${after}: ${lands} land${lands === 1 ? '' : 's'}. Keep it, or mulligan for a new seven${
      canMulligan ? (bottom === 0 ? ' (your first mulligan is free)' : ` (then put ${bottom} on the bottom)`) : ''
    }?`;
    buttons = [
      ...(canMulligan ? [{ label: 'Mulligan', onClick: () => p.submit([{ type: 'Mulligan', player: YOU, keep: false }]) }] : []),
      { label: 'Keep', onClick: () => p.submit([{ type: 'Mulligan', player: YOU, keep: true }]), primary: true },
    ];
  } else if (pending.kind === 'chooseCards') {
    const c = pending;
    const picks = p.bottomPicks;
    if (c.purpose === 'payToAvoidCounter') {
      const x = c.payGeneric ?? 0;
      const can = !!planTaps(s, YOU, { generic: x });
      text = c.drawFor
        ? `Its controller draws a card from ${cardName(s, c.cards[0]!)} unless you pay {${x}}.`
        : `${cardName(s, c.cards[0]!)} will be countered unless you pay {${x}}.`;
      const payIt: Action = { type: 'ChooseCards', player: YOU, cards: [...c.cards] };
      buttons = [
        ...(can ? [{ label: `Pay {${x}}`, onClick: () => (x > 0 ? p.onPay(`Pay {${x}}`, payIt, `{${x}}`) : p.submit([payIt])), primary: true }] : []),
        { label: can ? 'Don’t pay' : `Can’t pay {${x}}`, onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [] }]) },
      ];
    } else if (c.purpose === 'payHalfLife') {
      const half = Math.ceil((s.players[YOU]?.life ?? 0) / 2);
      text = `Pay half your life (${half}) to counter ${cardName(s, c.cards[0]!)}?`;
      buttons = [
        { label: `Pay ${half} life`, onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [...c.cards] }]) },
        { label: 'Don’t pay', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [] }]), primary: true },
      ];
    } else if (c.purpose === 'offerDraw' || c.purpose === 'library') {
      text = c.purpose === 'offerDraw' ? 'Let your opponent draw three cards, or have them mill three and deal their total mana value in damage to you?'
        : 'Put the targeted card on the top or bottom of your library?';
      buttons = [
        { label: c.purpose === 'offerDraw' ? 'Draw three' : 'Bottom', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [...c.cards] }]) },
        { label: c.purpose === 'offerDraw' ? 'Mill and take damage' : 'Top', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [] }]) },
      ];
    } else if (c.allOrNothing) {
      text = `Discard your whole hand (${c.cards.length} card${c.cards.length === 1 ? '' : 's'})?`;
      buttons = [
        { label: 'Keep my hand', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [] }]) },
        { label: 'Discard my hand', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [...c.cards] }]), primary: true },
      ];
    } else {
      const how = c.orOneMatching ? `${c.max} cards, or one ${(c.orOneMatching.types ?? []).join(' or ')} card instead,` : c.min === c.max ? `${c.min}` : c.min === 0 ? `up to ${c.max}` : `${c.min} to ${c.max}`;
      const verb =
        c.purpose === 'discard' || c.purpose === 'handSize'
          ? (c.purpose === 'handSize' ? 'to discard down to your maximum hand size' : 'to discard (in your hand)')
          : c.purpose === 'handToTop'
            ? 'from your hand to put on top of your library (the first one you click goes on top)'
          : c.purpose === 'sacrifice'
            ? 'to sacrifice'
            : c.purpose === 'mayDraw'
              ? 'to draw a card from (or none)'
            : c.purpose === 'mark'
              ? 'for the ability (any number, or none)'
            : c.purpose === 'dredge'
              ? `to dredge instead of drawing (mill ${c.cards[0] ? (s.cardDefs[s.cards[c.cards[0]]!.defId]?.dredge ?? '') : ''} and return it to your hand), or none to draw`
            : c.purpose === 'discardOrSacrifice'
              ? 'to discard (in your hand) or sacrifice (on the battlefield)'
            : c.purpose === 'bounce'
              ? `to return to its owner’s hand${c.min === 0 ? ' (or none)' : ''}`
            : c.purpose === 'counter'
              ? 'creature to get a +1/+1 counter'
            : c.purpose === 'attachSource'
              ? 'creature to attach it to'
            : c.purpose === 'link'
              ? 'creature to choose'
            : c.purpose === 'attachToTarget'
              ? `Equipment to attach to ${c.attachHost ? cardName(s, c.attachHost) : 'that creature'}${c.unattachAtEndStep ? ' (it comes off at the next end step)' : ''}; choose none to skip`
            : c.purpose === 'counterUpTo'
              ? `to put a ${c.counter ?? '+1/+1'} counter on (${c.counterCount} left); choose none to stop`
            : c.purpose === 'castOrTreasure'
              ? 'to cast this turn (paying its costs), or none for a Treasure'
            : c.purpose === 'memories'
              ? (s.resolving?.item.controller === YOU ? 'to put into your hand' : 'to put on the bottom of the caster’s library')
            : c.purpose === 'castFree'
              ? 'from your hand to cast this turn without paying its mana cost (or none)'
            : c.purpose === 'removeLore'
              ? 'Sagas to remove a lore counter from (this gets a +1/+1 counter for each)'
            : c.purpose === 'exileFromGraveyard'
              ? 'from your graveyard to exile (a cost)'
            : c.purpose === 'battlefield'
              ? (c.cards.every((id) => s.cards[id]?.zone === 'graveyard') ? `from your graveyard to put onto the battlefield${c.maxTotalManaValue !== undefined ? ` (total mana value ${c.maxTotalManaValue} or less)` : ''}` : 'to put onto the battlefield (in your hand)')
              : c.purpose === 'search'
                ? `to find in your library (${c.searchTo === 'hand' ? 'into your hand' : c.searchTo === 'top' ? 'on top after the shuffle' : 'onto the battlefield'}); then it's shuffled`
              : c.purpose === 'digLands'
                ? 'land cards to put onto the battlefield tapped; the rest go to your graveyard'
              : c.purpose === 'lookTop'
                ? `from the top of your library to put ${c.lookTo === 'battlefield' ? 'onto the battlefield' : 'into your hand'} (or none); the rest go on the bottom in a random order`
              : c.purpose === 'hand'
                ? (c.cards.every((id) => s.cards[id]?.zone === 'graveyard') ? 'from your graveyard to put into your hand' : c.restToGraveyard ? 'to put into your hand; the rest go into your graveyard' : 'to put into your hand; the rest go on the bottom of your library')
                : c.purpose === 'fateBottom' ? 'to put on the bottom of the caster’s library; the other returns to the battlefield tapped'
                  : c.purpose === 'reanimate' ? 'from the caster’s graveyard to return to the battlefield'
                  : c.purpose === 'addCounters' ? `to receive a ${c.counter ?? '+1/+1'} counter each`
                  : c.purpose === 'distributeCounter' ? `to receive one +1/+1 counter (${c.counterCount} remain to assign); choose none to finish`
                  : c.purpose === 'divideDamage' ? `to be dealt 1 damage (${c.counterCount} left to divide)${c.min === 0 ? '; choose none to deal no damage' : ''}`
                  : c.purpose === 'copyOnEntry' ? 'for your entering creature to copy; choose none to have it enter as itself'
                  : c.purpose === 'attachToSource' ? 'to attach to the creature (an Equipment you control); choose none to skip'
                  : c.purpose === 'devourOnEntry' ? 'to sacrifice (devour); the entering creature gets three +1/+1 counters for each'
                  : c.purpose === 'removeCountersOnEntry' ? 'to remove all counters from; the entering creature gets twice that many +1/+1 counters'
                  : c.purpose === 'artifactCopy' ? 'to create an artifact token copy of; choose none for no token'
                  : c.purpose === 'hideaway' ? 'to exile face down (hideaway); the rest go on the bottom of your library in a random order'
                  : c.purpose === 'keepVow' ? 'to keep with a vow counter; the others are sacrificed'
                    : 'to keep; the others are sacrificed';
      const problem = choiceProblem(s, c, picks);
      text = `${c.purpose === 'handSize' ? 'Cleanup: ' : ''}Choose ${how} card${c.max === 1 ? '' : 's'} ${verb}. ${c.cards.every((id) => ['hand', 'battlefield', 'command'].includes(s.cards[id]?.zone ?? '')) ? 'Click the glowing cards' : 'Click a card to choose it, again to unchoose it'} (${picks.length} chosen)${problem && picks.length ? `: ${problem}` : '.'}`;
      buttons = [
        ...(picks.length > 0 ? [{ label: 'Clear', onClick: () => p.setBottomPicks([]) }] : []),
        ...(!problem
          ? [{ label: c.purpose === 'distributeCounter' ? (picks.length ? 'Assign counter' : 'Finish distributing') : c.purpose === 'divideDamage' ? (picks.length ? 'Assign 1 damage' : 'Deal no damage') : (picks.length ? 'Confirm' : 'Choose none'), onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: picks }]), primary: true }]
          : []),
      ];
    }
  } else if (pending.kind === 'copyCreature') {
    text = cardName(s,pending.source) + ': become a copy of ' + cardName(s,pending.target) + (pending.effect.copyUntilEndOfTurn ? ' until end of turn?' : '?');
    buttons = getLegalActions(s).flatMap(action=>action.type==='CopyCreature' ? [{label:action.accept?'Become a copy':'Keep current form',onClick:()=>p.submit([action]),primary:action.accept}] : []);
  } else if (pending.kind === 'chooseOpponent') {
    text = pending.purpose === 'memories' ? 'Memories Returning: choose the opponent who takes turns choosing with you.'
      : pending.purpose === 'rival' ? 'Shinryu: choose an opponent. When they lose the game, you win.'
      : 'Choose the opponent who will decide which exiled card goes on the bottom of your library.';
    buttons = pending.opponents.filter(id => !s.players[id]!.eliminated).map(opponent => ({
      label: opponent, onClick: () => p.submit([{ type: 'ChooseOpponent', player: YOU, opponent }]),
    }));
  } else if (pending.kind === 'chooseDefender') {
    text = cardName(s, pending.card) + ': choose which opponent it enters attacking.';
    buttons = pending.defenders.filter((id) => !s.players[id]!.eliminated).map((defender) => ({
      label: 'Attack ' + defender,
      onClick: () => p.submit([{ type: 'ChooseDefender', player: YOU, defender }]),
      primary: true,
    }));
  } else if (pending.kind === 'chooseColor') {
    text = `${cardName(s, pending.card)}: choose a color as it enters. It adds one mana of that color.`;
    const names = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' } as const;
    buttons = (['W', 'U', 'B', 'R', 'G'] as const).map((color) => ({ label: names[color], onClick: () => p.submit([{ type: 'ChooseColor', player: YOU, color }]) }));
  } else if (pending.kind === 'chooseCardType') {
    text = `${cardName(s, pending.card)}: choose a card type as it enters.`;
    buttons = pending.options.map((cardType) => ({ label: cardType[0]!.toUpperCase() + cardType.slice(1), onClick: () => p.submit([{ type: 'ChooseCardType', player: YOU, cardType }]) }));
  } else if (pending.kind === 'orderTriggers') {
    // Rule 603.3b: click your triggers in the order they should resolve.
    const n = pending.count;
    const label = (i: number) => {
      const t = s.triggerQueue[i]!;
      return `${cardName(s, t.source)}: ${triggerText(queuedTriggerSpec(s, t))}`;
    };
    text = orderPicks.length
      ? `Resolve order so far: ${orderPicks.map((i, k) => `${k + 1}. ${cardName(s, s.triggerQueue[i]!.source)}`).join(' · ')}. Click the next one.`
      : `${n} of your abilities trigger at once. Click them in the order they should resolve, first to last (the last one goes on the stack first).`;
    const remaining = Array.from({ length: n }, (_, i) => i).filter((i) => !orderPicks.includes(i));
    const finish = (picks: number[]) => p.submit([{ type: 'OrderTriggers', player: YOU, order: picks }]);
    buttons = [
      ...remaining.map((i) => ({
        label: `${orderPicks.length + 1}. ${label(i).slice(0, 90)}`,
        onClick: () => {
          const next = [...orderPicks, i];
          // The last one is decided by the others.
          if (next.length >= n - 1) finish([...next, ...remaining.filter((r) => r !== i)]);
          else setOrderPicks(next);
        },
      })),
      ...(orderPicks.length ? [{ label: 'Start over', onClick: () => setOrderPicks([]) }] : []),
      {
        label: 'Keep this order',
        onClick: () => {
          const first = getLegalActions(s).find((a) => a.type === 'OrderTriggers');
          if (first) p.submit([first]);
        },
        primary: true,
      },
    ];
  } else if (pending.kind === 'chooseModes') {
    const t = s.triggerQueue[0]!;
    const spec = queuedTriggerSpec(s, t);
    const labels = modeLabels(s.cards[t.source]!.defId, spec.modes);
    text = `${cardName(s, t.source)}: choose its modes before it goes on the stack.`;
    buttons = getLegalActions(s).flatMap((action) => action.type === 'ChooseModes'
      ? [{ label: action.modes.length > 1 ? 'Both modes' : labels[action.modes[0]!] ?? `Mode ${action.modes[0]! + 1}`, onClick: () => p.submit([action]), primary: action.modes.length > 1 }]
      : []);
  } else if (pending.kind === 'bottomCards') {
    const n = pending.count;
    text = `You kept. Click ${n} card${n === 1 ? '' : 's'} in your hand to put on the bottom of your library (${p.bottomPicks.length}/${n} chosen).`;
    buttons = [
      ...(p.bottomPicks.length > 0 ? [{ label: 'Clear', onClick: () => p.setBottomPicks([]) }] : []),
      ...(p.bottomPicks.length === n
        ? [{ label: 'Put on bottom', onClick: () => p.submit([{ type: 'BottomCards', player: YOU, cards: p.bottomPicks }]), primary: true }]
        : []),
    ];
  } else if (pending.kind === 'chooseLegend') {
    text = `Legend rule: you control more than one ${pending.name}. Click the one to keep; the others go to your graveyard.`;
  } else if (pending.kind === 'commanderZone') {
    text = `Your commander ${cardName(s, pending.card)} went to your ${pending.zone}. Move it to the command zone?`;
    buttons = [
      { label: `Leave it in your ${pending.zone}`, onClick: () => p.submit([{ type: 'CommanderZone', player: YOU, toCommand: false }]) },
      { label: 'Command zone', onClick: () => p.submit([{ type: 'CommanderZone', player: YOU, toCommand: true }]), primary: true },
    ];
  } else if (pending.kind === 'chooseMana') {
    text = 'Choose a color of mana to add.';
    buttons = (pending.options ?? COLORS).map(mana=>({label:'Add {' + mana + '}',onClick:()=>p.submit([{type:'ChooseMana',player:YOU,mana}])}));
  } else if (pending.kind === 'exileTop') {
    text = 'Draw Arcanum: exile ' + cardName(s, pending.card) + ' face down, or leave it on top?';
    buttons = [
      { label: 'Exile face down', onClick: () => p.submit([{ type: 'ExileTop', player: YOU, exile: true }]), primary: true },
      { label: 'Keep on top', onClick: () => p.submit([{ type: 'ExileTop', player: YOU, exile: false }]) },
    ];
  } else if (pending.kind === 'surveil') {
    const scrying = !!pending.scry;
    text = `${scrying ? 'Scry' : 'Surveil'}: keep ${cardName(s, pending.card)} on top of your library, or put it ${scrying ? 'on the bottom of your library' : 'into your graveyard'}?`;
    buttons = [
      { label: scrying ? 'Bottom of library' : 'Graveyard', onClick: () => p.submit([{ type: 'Surveil', player: YOU, toGraveyard: true }]) },
      { label: 'Keep on top', onClick: () => p.submit([{ type: 'Surveil', player: YOU, toGraveyard: false }]), primary: true },
    ];
  } else if (pending.kind === 'declareAttackers') {
    const goaded = Object.values(p.view.stats).some(st=>st.goadedBy?.length);
    const many = p.session.opponents.filter((o) => !p.view.players[o]!.eliminated).length > 1;
    text = `Declare attackers: click your creatures to attack${many ? ` ${p.currentDefender} (click an opponent to switch)` : ''}.`;
    if (p.targetPw && s.cards[p.targetPw]) text += ` The next attackers you choose go for ${cardName(s, p.targetPw)} (click it again to attack the player).`;
    else if (Object.values(s.cards).some((c) => c.zone === 'battlefield' && c.controller !== YOU && defOf(c.defId).types.includes('planeswalker'))) text += ' Click an opponent’s planeswalker to attack it instead of the player.';
    if (goaded) text += ' Goaded creatures must attack and avoid their goader when able.';
    const all = new Map([...p.canAttackIds].filter((id) => canAttackPlayer(s, s.cards[id]!, p.attackers.get(id) ?? p.currentDefender)).map((id) => [id, p.attackers.get(id) ?? p.currentDefender]));
    const declare = (m: Map<InstanceId, PlayerId>) => {
      const attacks = [...m].map(([attacker, defender]) => ({ attacker, defender, ...(p.attackPw.has(attacker) ? { planeswalker: p.attackPw.get(attacker)! } : {}) }));
      // Propaganda and friends: choose the mana for the tax, then the declaration goes with the taps.
      const tax = attackTax(s, attacks);
      const declaration: Action = { type: 'DeclareAttackers', player: YOU, attacks };
      if (tax > 0) p.onPay('Attack', declaration, `{${tax}}`);
      else p.submit([declaration]);
    };
    const taxed = p.session.opponents.filter((o) => !p.view.players[o]!.eliminated && attackTaxFor(s, o) > 0);
    if (taxed.length > 0) text += ` Attacking ${taxed.map((o) => `${o} costs {${attackTaxFor(s, o)}}`).join(', ')} for each creature.`;
    buttons = [
      { label: 'Select all', onClick: () => p.setAttackers(all) },
      { label: 'No attack', onClick: () => declare(new Map()) },
      {
        label: p.attackers.size > 0 ? `Attack with ${p.attackers.size}` : 'Attack',
        onClick: () => declare(p.attackers),
        primary: true,
      },
    ];
  } else if (pending.kind === 'declareBlockers') {
    text = 'Declare blockers: click an attacker, then the creature that blocks it. Click a blocker again to undo.';
    const declare = (m: Map<InstanceId, InstanceId>) =>
      p.submit([{ type: 'DeclareBlockers', player: YOU, blocks: [...m].map(([blocker, attacker]) => ({ blocker, attacker })) }]);
    buttons = [
      { label: 'No blocks', onClick: () => declare(new Map()) },
      { label: p.blocks.size > 0 ? `Block with ${p.blocks.size}` : 'Confirm blocks', onClick: () => declare(p.blocks), primary: true },
    ];
  } else if (pending.kind === 'decide') {
    const item = s.stack.at(-1)!;
    const spec = item.kind === 'ability' ? triggerSpec(s, item) : undefined;
    const source = item.kind === 'ability' ? item.source : item.card;
    text = `${cardName(s, source)}: ${spec ? triggerText(spec) : ''}`;
    const yes: Action = { type: 'Decide', player: YOU, accept: true };
    const mana = spec?.cost?.mana;
    buttons = [
      { label: 'No', onClick: () => p.submit([{ type: 'Decide', player: YOU, accept: false }]) },
      {
        label: spec?.cost ? 'Yes, pay' : 'Yes',
        // A mana cost: choose the mana to pay it with, then confirm.
        onClick: () => (mana && /[1-9WUBRGC]/.test(mana) ? p.onPay(`${cardName(s, source)}: pay`, yes, mana) : p.submit([yes])),
        primary: true,
      },
    ];
  } else {
    // Hold priority: keep it after casting, to add more before anyone responds (rule 117.3c).
    // Only offered when you could do something at instant speed and pay for it (rules 117.1a, 117.3c).
    const canHold = p.session.canHoldPriority();
    const holdButton = {
      label: p.session.keepPriority && canHold ? 'Holding priority ✓' : 'Hold priority',
      disabled: !canHold,
      title: canHold
        ? 'Keep priority after you cast or activate, to add more before anyone responds'
        : 'You have no instant, flash spell or ability you could use and pay for right now',
      onClick: () => {
        p.session.keepPriority = !p.session.keepPriority;
        setOrderPicks((x) => [...x]);
      },
    };
    const top = s.stack.at(-1);
    if (top) {
      const src = top.kind === 'spell' ? top.card : top.source;
      const whose = top.controller === YOU ? 'Your' : `${top.controller}'s`;
      text = `${whose} ${cardName(s, src)}${top.kind === 'ability' ? ' ability' : ''} is on the stack. Respond with a legal spell or ability. It resolves after everyone passes in succession.`;
      buttons = [holdButton, { label: 'Pass priority', onClick: () => p.submit([{ type: 'PassPriority', player: YOU }]), primary: true }];
    } else {
      const yours = s.activePlayer === YOU;
      const main = s.step === 'main1' || s.step === 'main2';
      text = yours && main
        ? `${stepName(s.step)}: play a land, cast a spell, or use an ability. Glowing cards are playable.`
        : `${yours ? 'Your' : `${s.activePlayer}'s`} ${stepName(s.step).toLowerCase()}: cast a legal instant or use an ability.`;
      text += ' Everyone must pass in succession to advance.';
      buttons = [holdButton, { label: 'Pass priority', onClick: () => p.submit([{ type: 'PassPriority', player: YOU }]), primary: true }];
    }
  }

  return (
    <div className={`prompt ${p.yourMove ? 'yours' : ''} ${p.busy ? 'busy' : ''} ${p.menu ? 'modal-choice ability-menu' : pending.kind === 'chooseModes' ? 'modal-choice' : ''}`}>
      <div className="prompt-text"><ManaText text={text} size={17} /></div>
      {p.yourMove && p.menu?.modes && <fieldset className="mode-options">
        <legend>Choose modes</legend>
        {p.menu.modes.labels.map((label, index) => <label key={index}>
          <input type="checkbox" checked={modePicks.includes(index)} disabled={!p.menu!.modes!.keys.some(key => key.split('+').includes(String(index)))} onChange={e => setModePicks(picks => e.target.checked ? [...picks, index] : picks.filter(i => i !== index))} />
          <span>{label}</span>
        </label>)}
      </fieldset>}
      <div className="prompt-buttons">
        {buttons.map((b) => (
          <button key={b.label} className={b.primary ? 'primary' : ''} onClick={b.onClick} disabled={b.disabled} title={b.title}>
            <ManaText text={b.label} />
          </button>
        ))}
      </div>
    </div>
  );
}
