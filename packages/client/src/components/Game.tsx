import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  abilityOptions,
  activatedAbilities,
  choiceProblem,
  cardsToBottom,
  formatManaCost,
  manaChoices,
  spellOptions,
  triggerSpec,
  type Action,
  type GameState,
  type GameView,
  type InstanceId,
  type ManaType,
  type PlayerId,
  type Target,
} from '@nexus/engine';
import { manaSources, planTaps, tapActions } from '@nexus/bots';
import { cardName, stepName, triggerText } from '@nexus/bots/narrate';
import { defOf, scryfallOf } from '../game/cards.ts';
import { YOU, type CardPlay, type GameSession, type PlayChoice } from '../game/session.ts';
import { CardFace } from './Card.tsx';
import { Coach } from './Coach.tsx';
import type { Lesson } from '../tutorial/lesson.ts';
import { currentTip } from '../tutorial/tips.ts';
import { GameLog, Inspector } from './Sidebar.tsx';
import { CardList, Hand, OpponentZone, PlayerHeader, YourZone, type Mark, type ZoneHandlers } from './Zones.tsx';

/** How long a triggering card stays in the middle of the table. */
const SPOTLIGHT_MS = 2000;

/** Pause after each meaningful bot action so you can follow along. */
const BOT_DELAY_MS = 550;

const sameTarget = (a: Target, b: Target) => JSON.stringify(a) === JSON.stringify(b);

const STEP_SHORT: [string, string][] = [
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
}

/** A small menu in the prompt bar: which ability, or which mode. */
interface Menu {
  title: string;
  options: { label: string; pick: () => void }[];
}

/** A spell or ability you've chosen, waiting for you to tap mana for it. */
interface Paying {
  title: string;
  action: Extract<Action, { type: 'CastSpell' | 'ActivateAbility' }>;
}

/** What an action costs right now, e.g. "{3}{R}" (commander tax and discounts included), as the engine lists it. */
function costText(s: GameState, action: Paying['action']): string {
  const key = JSON.stringify(action);
  const options = action.type === 'CastSpell' ? spellOptions(s, YOU) : abilityOptions(s, YOU);
  const option = options.find((o) => JSON.stringify(o.action) === key);
  return option ? formatManaCost(option.cost) : (defOf(s.cards[action.card]!.defId).manaCost ?? '');
}

/** The texts of a modal spell's modes, from its Oracle text bullets when they match. */
function modeLabels(defId: string, count: number): string[] {
  const bullets = (scryfallOf(defId)?.oracleText ?? '').split('\n').filter((l) => l.startsWith('•'));
  return Array.from({ length: count }, (_, i) => bullets[i]?.replace(/^•\s*/, '') ?? `Mode ${i + 1}`);
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
  const spotlighted = useRef(0);
  const [zoneView, setZoneView] = useState<{ player: PlayerId; zone: 'graveyard' | 'exile' } | null>(null);
  const [attackers, setAttackers] = useState<Map<InstanceId, PlayerId>>(new Map());
  const [defender, setDefender] = useState<PlayerId>(session.opponents[0]!);
  const [blocks, setBlocks] = useState<Map<InstanceId, InstanceId>>(new Map());
  const [pickedAttacker, setPickedAttacker] = useState<InstanceId | null>(null);
  const [busy, setBusy] = useState(false);
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
        timer.current = window.setTimeout(run, BOT_DELAY_MS);
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

  // Any change of decision clears half-made selections.
  const decisionKey = `${s.turnNumber}|${s.step}|${pending.kind}|${s.stack.length}|${s.triggerQueue.length}|${s.nextId}`;
  const [bottomPicks, setBottomPicks] = useState<InstanceId[]>([]);
  useEffect(() => {
    setBottomPicks([]);
    setTargeting(null);
    setMenu(null);
    setPaying(null);
    session.holdPriority = false;
    setAttackers(new Map());
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
    run();
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
    if (!yourMove || pending.kind !== 'chooseTargets') return null;
    const choices = legal.filter((a): a is Extract<Action, { type: 'ChooseTargets' }> => a.type === 'ChooseTargets');
    const t = s.triggerQueue[0]!;
    return {
      title: `${cardName(s, t.source)}: ${triggerText(defOf(s.cards[t.source]!.defId).triggers![t.ability]!)}`,
      choices: choices.map((a) => [a]),
      targets: choices.map((a) => a.targets),
      chosen: [],
    };
  }, [yourMove, pending.kind, legal, s]);
  const activeTargeting = targeting ?? triggerTargeting;
  const [triggerChosen, setTriggerChosen] = useState<Target[]>([]);
  useEffect(() => {
    setTriggerChosen([]);
  }, [decisionKey]);
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
    if (!activeTargeting) return;
    const next = [...chosen, t];
    const done = remaining.find(({ ts }) => ts.length === next.length && ts.every((x, j) => sameTarget(x, next[j]!)));
    if (done) {
      setTargeting(null);
      const actions = activeTargeting.choices[done.i]!;
      const action = actions.at(-1)!;
      // A spell or ability you're playing still needs paying for; a trigger's targets are just submitted.
      if (targeting && 'card' in action) pay({ taps: actions.slice(0, -1), action, targets: next }, cardName(s, action.card));
      else submit(actions);
      return;
    }
    if (targeting) setTargeting({ ...targeting, chosen: next });
    else setTriggerChosen(next);
  };

  /**
   * Pays for a chosen play. With "Tap mana automatically" on, the suggested
   * taps go with it. Otherwise it's done at once if your mana pool already
   * covers it, or the board waits while you tap mana sources yourself.
   */
  const pay = (choice: PlayChoice, title: string) => {
    const { action } = choice;
    if (session.autoTap || (action.type !== 'CastSpell' && action.type !== 'ActivateAbility')) {
      submit([...choice.taps, action]);
      return;
    }
    if (session.canSubmit([action])) {
      submit([action]);
      return;
    }
    session.holdPriority = true;
    setPaying({ title, action });
  };

  const stopPaying = () => {
    setPaying(null);
    session.holdPriority = false;
  };

  /** Taps a mana source for one mana type; finishes paying once the pool covers the cost. */
  const tapForMana = (id: InstanceId, mana: ManaType) => {
    const err = session.submit([{ type: 'ActivateManaAbility', player: YOU, card: id, mana }]);
    if (err) {
      showError(err);
      refresh();
      return;
    }
    if (paying && session.canSubmit([paying.action])) {
      stopPaying();
      submit([paying.action]);
      return;
    }
    run();
  };

  /** Clicking a mana source: tap it, asking which mana if it can make more than one kind. */
  const useManaSource = (id: InstanceId) => {
    const kinds = manaChoices(s, s.cards[id]!);
    if (kinds.length === 1) return tapForMana(id, kinds[0]!);
    setMenu({
      title: `${cardName(s, id)}: add which mana?`,
      options: kinds.map((m) => ({
        label: `Add {${m}}`,
        pick: () => {
          setMenu(null);
          tapForMana(id, m);
        },
      })),
    });
  };

  /** Taps whatever the planner suggests for the rest of the cost. */
  const autoPay = () => {
    if (!paying) return;
    const key = JSON.stringify(paying.action);
    const choice = session.plays().flatMap((p) => p.choices).find((c) => JSON.stringify(c.action) === key);
    if (!choice) return showError("You don't have enough untapped mana sources to pay for that.");
    stopPaying();
    submit([...choice.taps, paying.action]);
  };

  /**
   * Starts doing one play: choose its mode or modes if there's a choice, then
   * targets if needed. `modeKey` is the chosen modes joined with "+".
   */
  const startPlay = (play: CardPlay, modeKey?: string, costKey?: string) => {
    const def = defOf(s.cards[play.card]!.defId);
    const keyOf = (c: PlayChoice) => c.modes?.join('+');
    const keys = [...new Set(play.choices.map(keyOf).filter((k): k is string => k !== undefined))];
    if (modeKey === undefined && keys.length > 1) {
      const labels = modeLabels(def.id, def.modes?.length ?? 0);
      const how = def.chooseModes
        ? def.chooseModes.min === def.chooseModes.max
          ? `choose ${def.chooseModes.min}`
          : `choose ${def.chooseModes.min} or more`
        : 'choose one';
      setMenu({
        title: `${def.name}: ${how}`,
        options: keys.map((k) => ({
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
      const verb = ability?.cost.sacrifice ? 'sacrifice' : 'discard';
      setMenu({
        title: `${def.name}: ${verb} which card?`,
        options: costKeys.map((k) => ({
          label: (JSON.parse(k) as InstanceId[]).map((id) => cardName(s, id)).join(', '),
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
    });
  };

  /** Clicking a card you can do something with. */
  const usePlays = (id: InstanceId, cardPlays: CardPlay[]) => {
    if (cardPlays.length === 1) return startPlay(cardPlays[0]!);
    const def = defOf(s.cards[id]!.defId);
    setMenu({
      title: def.name,
      options: cardPlays.map((p) => ({
        label: p.kind === 'spell' ? `${p.label} ${def.name}` : p.kind === 'land' && p.label === 'Play' ? `Play ${def.name}` : p.label,
        pick: () => startPlay(p),
      })),
    });
  };

  // Combat helpers.
  const canAttackIds = new Set(
    pending.kind === 'declareAttackers' && yourMove
      ? legal.flatMap((a) => (a.type === 'DeclareAttackers' ? a.attacks.map((x) => x.attacker) : []))
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
  const manaIds = new Set(yourMove && pending.kind === 'priority' ? manaSources(s, YOU).map((c) => c.id) : []);
  // Cards castable from outside your hand appear next to it; commanders stay in the command zone by your name.
  const elsewhere = [...playable].filter((id) => {
    const z = s.cards[id]!.zone;
    return z !== 'hand' && z !== 'battlefield' && z !== 'command';
  });

  const bottoming = yourMove && pending.kind === 'bottomCards' ? pending.count : 0;
  // Choosing cards to discard, sacrifice or keep: the cards on offer glow and toggle when clicked.
  const choosing = yourMove && pending.kind === 'chooseCards' ? pending : null;
  const h: ZoneHandlers = {
    markCard: (id) => {
      const marks: Mark[] = [];
      if (bottoming && s.cards[id]?.zone === 'hand') marks.push(bottomPicks.includes(id) ? 'selected' : 'target');
      if (choosing?.cards.includes(id)) marks.push(bottomPicks.includes(id) ? 'selected' : 'target');
      if (playable.has(id) && !activeTargeting && !menu && !paying) marks.push('playable');
      if (paying && !menu && manaIds.has(id)) marks.push('mana');
      if (nextOptions.some((t) => t.kind === 'card' && t.card === id) || legendChoices.includes(id)) marks.push('target');
      if (canAttackIds.has(id)) marks.push(attackers.has(id) ? 'attacking' : 'can-attack');
      if (view.combat?.attacks.some((a) => a.attacker === id)) marks.push('attacking');
      if (canBlockIds.has(id)) marks.push(blocks.has(id) ? 'blocking' : 'can-block');
      if (view.combat?.blocks.some((b) => b.blocker === id)) marks.push('blocking');
      if (pickedAttacker === id) marks.push('selected');
      if (step?.focus(s).includes(id)) marks.push('focus');
      if (session.recent.has(id)) marks.push('recent');
      return marks;
    },
    markPlayer: (pid) => {
      const marks: Mark[] = [];
      if (nextOptions.some((t) => t.kind === 'player' && t.player === pid)) marks.push('target');
      if (pending.kind === 'declareAttackers' && yourMove && pid === currentDefender && livingOpponents.length > 1) {
        marks.push('defender');
      }
      return marks;
    },
    cardNote: (id) => {
      if (bottomPicks.includes(id)) return `Bottom ${bottomPicks.indexOf(id) + 1}`;
      const planned = attackers.get(id);
      if (planned) return livingOpponents.length > 1 ? `→ ${planned}` : 'Attacking';
      const attack = view.combat?.attacks.find((a) => a.attacker === id);
      if (attack) return `→ ${attack.defender === YOU ? 'You' : attack.defender}`;
      const blocking = blocks.get(id) ?? view.combat?.blocks.find((b) => b.blocker === id)?.attacker;
      if (blocking) return `Blocks ${cardName(s, blocking)}`;
      const attachedTo = view.cards[id]?.attachedTo;
      if (attachedTo) return `⚔ ${cardName(s, attachedTo)}`;
      const st = view.stats[id];
      if (st?.cantBeBlocked) return "Can't be blocked";
      if (st?.mustBeBlocked) return 'Must be blocked';
      return null;
    },
    onCard: (id) => {
      if (!yourMove) return;
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
      if (paying) return manaIds.has(id) ? useManaSource(id) : undefined;
      const cardPlays = playsFor(id);
      if (cardPlays.length > 0) return usePlays(id, cardPlays);
      // Tapping a land (or other mana source) on its own floats the mana until the step ends.
      if (manaIds.has(id)) return useManaSource(id);
      if (pending.kind === 'declareAttackers' && canAttackIds.has(id)) {
        const next = new Map(attackers);
        if (next.has(id)) next.delete(id);
        else next.set(id, currentDefender);
        setAttackers(next);
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
      if (pending.kind === 'declareAttackers' && pid !== YOU && livingOpponents.includes(pid)) setDefender(pid);
    },
    onHover: setHovered,
    onZone: (player, zone) => setZoneView({ player, zone }),
  };

  const surveilCard = pending.kind === 'surveil' && pending.player === YOU ? pending.card : null;

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

  return (
    <div className="game">
      <main className="table">
        <div className={`opponents n${session.opponents.length}`}>
          {session.opponents.map((pid) => (
            <OpponentZone key={pid} view={view} pid={pid} h={h} />
          ))}
        </div>
        <div className="midline">
          <PhaseTrack view={view} />
          <StackView view={view} onHover={setHovered} />
        </div>
        <YourZone view={view} h={h} />
        <PromptBar
          session={session}
          view={view}
          yourMove={yourMove}
          busy={busy}
          targeting={activeTargeting}
          menu={menu}
          chosen={chosen}
          paying={paying}
          onAutoPay={autoPay}
          canSkipTarget={nextOptions.some((t) => t.kind === 'none')}
          onSkipTarget={() => pickTarget({ kind: 'none' })}
          onCancel={() => {
            stopPaying();
            setTargeting(null);
            setMenu(null);
            setTriggerChosen([]);
          }}
          attackers={attackers}
          canAttackIds={canAttackIds}
          currentDefender={currentDefender}
          blocks={blocks}
          submit={submit}
          setAttackers={setAttackers}
          bottomPicks={bottomPicks}
          setBottomPicks={setBottomPicks}
        />
        <div className="you-bar">
          <PlayerHeader view={view} pid={YOU} h={h} />
          <Hand view={view} h={h} elsewhere={elsewhere} />
        </div>
        {error && <div className="toast">{error}</div>}
        {spotlight && view.cards[spotlight.card] && (
          <div key={spotlight.key} className="spotlight" aria-live="polite">
            <div className="spotlight-label">{cardName(s, spotlight.card)} triggers</div>
            <div className="spotlight-card">
              <CardFace defId={view.cards[spotlight.card]!.defId} size="large" />
            </div>
          </div>
        )}
        {coach}
      </main>
      <aside className="sidebar">
        <Inspector view={view} id={hovered ?? (spotlight && view.cards[spotlight.card] ? spotlight.card : null) ?? surveilCard} />
        <div className="sidebar-controls">
          <label title="Stop at every step instead of passing automatically">
            <input
              type="checkbox"
              checked={session.stopEverywhere}
              onChange={(e) => {
                session.stopEverywhere = e.target.checked;
                refresh();
              }}
            />{' '}
            Stop at every step
          </label>
          <label title="Tap your lands for you when you cast a spell, instead of choosing which to tap">
            <input
              type="checkbox"
              checked={session.autoTap}
              onChange={(e) => {
                session.autoTap = e.target.checked;
                refresh();
              }}
            />{' '}
            Tap mana automatically
          </label>
          <span className="seed">Seed {session.options.seed}</span>
          <button className="ghost" onClick={onQuit}>
            Menu
          </button>
        </div>
        <GameLog entries={session.log} />
      </aside>
      {offBoardOptions.length > 0 && (
        <CardList view={view} title={activeTargeting?.title ?? 'Choose a target'} ids={offBoardOptions} h={h} />
      )}
      {surveilCard && view.cards[surveilCard] && (
        <div className="surveil-card">
          <div className="surveil-label">Top of your library</div>
          <CardFace defId={view.cards[surveilCard]!.defId} size="normal" />
        </div>
      )}
      {zoneView && (
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
            <button onClick={onQuit}>Back to menu</button>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseTrack({ view }: { view: GameView }) {
  return (
    <div className="phases">
      <span className="phase-owner">{view.activePlayer === YOU ? 'Your turn' : `${view.activePlayer}'s turn`}</span>
      {STEP_SHORT.map(([step, label]) => (
        <span key={step} className={`phase ${view.step === step ? 'current' : ''}`}>
          {label}
        </span>
      ))}
      <span className="turn-no">Turn {view.turnNumber}</span>
    </div>
  );
}

function StackView({ view, onHover }: { view: GameView; onHover: (id: InstanceId | null) => void }) {
  const items = [...(view.resolving ? [view.resolving] : []), ...[...view.stack].reverse()];
  if (items.length === 0) return null;
  return (
    <div className="stack">
      <div className="stack-title">Stack</div>
      {items.map((item, i) => {
        const cardId = item.kind === 'spell' ? item.card : item.source;
        const c = view.cards[cardId];
        return (
          <div
            key={item.id}
            className={`stack-item ${i === 0 ? 'top' : ''}`}
            onMouseEnter={() => onHover(cardId)}
            onMouseLeave={() => onHover(null)}
          >
            {c && (
              <div className="stack-thumb">
                <CardFace defId={c.defId} size="small" />
              </div>
            )}
            <div>
              <div className="stack-name">
                {c ? defOf(c.defId).name : 'A card'}
                {item.kind === 'ability' && <em> — ability</em>}
                {item === view.resolving && <em> (resolving)</em>}
              </div>
              <div className="stack-meta">
                {item.controller === YOU ? 'Yours' : item.controller}
                {item.targets.length > 0 && ` → ${item.targets.map((t) => targetLabel(view, t)).join(', ')}`}
              </div>
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
  onAutoPay: () => void;
  canSkipTarget: boolean;
  onSkipTarget: () => void;
  chosen: Target[];
  onCancel: () => void;
  attackers: Map<InstanceId, PlayerId>;
  canAttackIds: Set<InstanceId>;
  currentDefender: PlayerId;
  blocks: Map<InstanceId, InstanceId>;
  submit: (actions: Action[]) => void;
  setAttackers: (m: Map<InstanceId, PlayerId>) => void;
  bottomPicks: InstanceId[];
  setBottomPicks: (ids: InstanceId[]) => void;
}

function PromptBar(p: PromptProps) {
  const s = p.session.state;
  const pending = s.pending;
  let text: string;
  let buttons: { label: string; onClick: () => void; primary?: boolean }[] = [];

  if (pending.kind === 'gameOver') {
    text = 'Game over.';
  } else if (!p.yourMove) {
    text = `${pending.player} is thinking…`;
  } else if (p.menu) {
    text = `${p.menu.title}:`;
    buttons = [...p.menu.options.map((o) => ({ label: o.label, onClick: o.pick })), { label: 'Cancel', onClick: p.onCancel }];
  } else if (p.paying) {
    const pool = p.view.players[YOU]!.manaPool;
    const floating = Object.entries(pool).flatMap(([m, n]) => Array.from({ length: n }, () => `{${m}}`)).join('');
    text =
      `${p.paying.title}: pay ${costText(s, p.paying.action)}. Click your glowing lands and other mana sources to tap them` +
      (floating ? ` (in your mana pool: ${floating}).` : '.');
    buttons = [
      { label: 'Cancel', onClick: p.onCancel },
      { label: 'Auto-pay', onClick: p.onAutoPay, primary: true },
    ];
  } else if (p.targeting) {
    text = `${p.targeting.title}${p.chosen.length > 0 ? ` (target ${p.chosen.length + 1})` : ''}. Click a highlighted card or player.`;
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
    if (c.allOrNothing) {
      text = `Discard your whole hand (${c.cards.length} card${c.cards.length === 1 ? '' : 's'})?`;
      buttons = [
        { label: 'Keep my hand', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [] }]) },
        { label: 'Discard my hand', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: [...c.cards] }]), primary: true },
      ];
    } else {
      const how = c.min === c.max ? `${c.min}` : c.min === 0 ? `up to ${c.max}` : `${c.min} to ${c.max}`;
      const verb =
        c.purpose === 'discard'
          ? 'to discard (in your hand)'
          : c.purpose === 'sacrifice'
            ? 'to sacrifice'
            : c.purpose === 'battlefield'
              ? 'to put onto the battlefield (in your hand)'
              : 'to keep; the others are sacrificed';
      const problem = choiceProblem(s, c, picks);
      text = `Choose ${how} card${c.max === 1 ? '' : 's'} ${verb}. Click the glowing cards (${picks.length} chosen)${problem && picks.length ? `: ${problem}` : '.'}`;
      buttons = [
        ...(picks.length > 0 ? [{ label: 'Clear', onClick: () => p.setBottomPicks([]) }] : []),
        ...(!problem
          ? [{ label: picks.length ? 'Confirm' : 'Choose none', onClick: () => p.submit([{ type: 'ChooseCards', player: YOU, cards: picks }]), primary: true }]
          : []),
      ];
    }
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
  } else if (pending.kind === 'surveil') {
    text = `Surveil: keep ${cardName(s, pending.card)} on top of your library, or put it into your graveyard?`;
    buttons = [
      { label: 'Graveyard', onClick: () => p.submit([{ type: 'Surveil', player: YOU, toGraveyard: true }]) },
      { label: 'Keep on top', onClick: () => p.submit([{ type: 'Surveil', player: YOU, toGraveyard: false }]), primary: true },
    ];
  } else if (pending.kind === 'declareAttackers') {
    const many = p.session.opponents.filter((o) => !p.view.players[o]!.eliminated).length > 1;
    text = `Declare attackers: click your creatures to attack${many ? ` ${p.currentDefender} (click an opponent to switch)` : ''}.`;
    const all = new Map([...p.canAttackIds].map((id) => [id, p.attackers.get(id) ?? p.currentDefender]));
    const declare = (m: Map<InstanceId, PlayerId>) =>
      p.submit([{ type: 'DeclareAttackers', player: YOU, attacks: [...m].map(([attacker, defender]) => ({ attacker, defender })) }]);
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
    const taps = planTaps(s, YOU, spec?.cost?.mana) ?? [];
    buttons = [
      { label: 'No', onClick: () => p.submit([{ type: 'Decide', player: YOU, accept: false }]) },
      {
        label: spec?.cost ? 'Yes, pay' : 'Yes',
        onClick: () => p.submit([...tapActions(YOU, taps), { type: 'Decide', player: YOU, accept: true }]),
        primary: true,
      },
    ];
  } else {
    const top = s.stack.at(-1);
    if (top) {
      const src = top.kind === 'spell' ? top.card : top.source;
      const whose = top.controller === YOU ? 'Your' : `${top.controller}'s`;
      text = `${whose} ${cardName(s, src)}${top.kind === 'ability' ? ' ability' : ''} is on the stack. Respond with an instant, or let it resolve.`;
      buttons = [{ label: 'Let it resolve', onClick: () => p.submit([{ type: 'PassPriority', player: YOU }]), primary: true }];
    } else {
      const yours = s.activePlayer === YOU;
      text = yours
        ? `${stepName(s.step)}: play a land, cast a spell, or use an ability. Glowing cards are playable.`
        : `${s.activePlayer}'s ${stepName(s.step).toLowerCase()}. You can cast instants.`;
      const label = yours && s.step === 'main1' ? 'Go to combat' : yours && s.step === 'main2' ? 'End turn' : 'Pass';
      buttons = [{ label, onClick: () => p.submit([{ type: 'PassPriority', player: YOU }]), primary: true }];
    }
  }

  return (
    <div className={`prompt ${p.yourMove ? 'yours' : ''} ${p.busy ? 'busy' : ''}`}>
      <div className="prompt-text">{text}</div>
      <div className="prompt-buttons">
        {buttons.map((b) => (
          <button key={b.label} className={b.primary ? 'primary' : ''} onClick={b.onClick}>
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
