import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { triggerSpec, type Action, type GameView, type InstanceId, type PlayerId, type Target } from '@nexus/engine';
import { planTaps, tapActions } from '@nexus/bots';
import { cardName, stepName, triggerText } from '@nexus/bots/narrate';
import { defOf } from '../game/cards.ts';
import { YOU, type CastAction, type GameSession, type Play } from '../game/session.ts';
import { CardFace } from './Card.tsx';
import { GameLog, Inspector } from './Sidebar.tsx';
import { Hand, OpponentZone, PlayerHeader, YourZone, type Mark, type ZoneHandlers } from './Zones.tsx';

/** Pause after each meaningful bot action so you can follow along. */
const BOT_DELAY_MS = 550;

const sameTarget = (a: Target, b: Target) =>
  a.kind === b.kind && (a.kind === 'player' ? a.player === (b as typeof a).player : a.card === (b as typeof a).card);

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
  choices: Action[][];
  /** The targets of each choice, parallel to `choices`. */
  targets: Target[][];
  chosen: Target[];
}

export function Game({ session, onQuit }: { session: GameSession; onQuit: () => void }) {
  const [, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const [hovered, setHovered] = useState<InstanceId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targeting, setTargeting] = useState<Targeting | null>(null);
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

  // Any change of decision clears half-made selections.
  const decisionKey = `${s.turnNumber}|${s.step}|${pending.kind}|${s.stack.length}|${s.triggerQueue.length}`;
  useEffect(() => {
    setTargeting(null);
    setAttackers(new Map());
    setBlocks(new Map());
    setPickedAttacker(null);
  }, [decisionKey]);

  const submit = (actions: Action[]) => {
    const err = session.submit(actions);
    if (err) {
      setError(err);
      window.setTimeout(() => setError(null), 3500);
      refresh();
      return;
    }
    setError(null);
    run();
  };

  const plays = useMemo(() => (yourMove && pending.kind === 'priority' ? session.plays() : new Map<InstanceId, Play>()), [
    session,
    yourMove,
    pending.kind,
    decisionKey,
    s,
  ]);
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
    ? activeTargeting.targets
        .map((ts, i) => ({ ts, i }))
        .filter(({ ts }) => chosen.every((c, j) => sameTarget(c, ts[j]!)))
    : [];
  const nextOptions: Target[] = [];
  for (const { ts } of remaining) {
    const t = ts[chosen.length];
    if (t && !nextOptions.some((o) => sameTarget(o, t))) nextOptions.push(t);
  }

  const pickTarget = (t: Target) => {
    if (!activeTargeting) return;
    const next = [...chosen, t];
    const done = remaining.find(({ ts }) => ts.length === next.length && ts.every((x, j) => sameTarget(x, next[j]!)));
    if (done) {
      submit(activeTargeting.choices[done.i]!);
      setTargeting(null);
      return;
    }
    if (targeting) setTargeting({ ...targeting, chosen: next });
    else setTriggerChosen(next);
  };

  const startCast = (play: Extract<Play, { kind: 'spell' }>) => {
    const only = play.casts.length === 1 ? play.casts[0]! : null;
    if (only && (only.targets?.length ?? 0) === 0) {
      submit([...play.taps, only]);
      return;
    }
    const def = defOf(s.cards[play.card]!.defId);
    setTargeting({
      title: `Choose a target for ${def.name}`,
      choices: play.casts.map((c: CastAction) => [...play.taps, c]),
      targets: play.casts.map((c) => c.targets ?? []),
      chosen: [],
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

  const h: ZoneHandlers = {
    markCard: (id) => {
      const marks: Mark[] = [];
      if (plays.has(id) && !activeTargeting) marks.push('playable');
      if (nextOptions.some((t) => t.kind === 'card' && t.card === id)) marks.push('target');
      if (canAttackIds.has(id)) marks.push(attackers.has(id) ? 'attacking' : 'can-attack');
      if (view.combat?.attacks.some((a) => a.attacker === id)) marks.push('attacking');
      if (canBlockIds.has(id)) marks.push(blocks.has(id) ? 'blocking' : 'can-block');
      if (view.combat?.blocks.some((b) => b.blocker === id)) marks.push('blocking');
      if (pickedAttacker === id) marks.push('selected');
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
      const planned = attackers.get(id);
      if (planned) return livingOpponents.length > 1 ? `→ ${planned}` : 'Attacking';
      const attack = view.combat?.attacks.find((a) => a.attacker === id);
      if (attack) return `→ ${attack.defender === YOU ? 'You' : attack.defender}`;
      const blocking = blocks.get(id) ?? view.combat?.blocks.find((b) => b.blocker === id)?.attacker;
      if (blocking) return `Blocks ${cardName(s, blocking)}`;
      return null;
    },
    onCard: (id) => {
      if (!yourMove) return;
      const option = nextOptions.find((t) => t.kind === 'card' && t.card === id);
      if (option) return pickTarget(option);
      if (activeTargeting) return;
      const play = plays.get(id);
      if (play) return play.kind === 'land' ? submit([play.action]) : startCast(play);
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
          else {
            setError('Click an attacking creature first, then the creature that blocks it.');
            window.setTimeout(() => setError(null), 3000);
            return;
          }
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
  };

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
          chosen={chosen}
          onCancelTargeting={() => {
            setTargeting(null);
            setTriggerChosen([]);
          }}
          attackers={attackers}
          canAttackIds={canAttackIds}
          currentDefender={currentDefender}
          blocks={blocks}
          submit={submit}
          setAttackers={setAttackers}
        />
        <div className="you-bar">
          <PlayerHeader view={view} pid={YOU} h={h} />
          <Hand view={view} h={h} />
        </div>
        {error && <div className="toast">{error}</div>}
      </main>
      <aside className="sidebar">
        <Inspector view={view} id={hovered} />
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
          <span className="seed">Seed {session.options.seed}</span>
          <button className="ghost" onClick={onQuit}>
            Menu
          </button>
        </div>
        <GameLog entries={session.log} />
      </aside>
      {pending.kind === 'gameOver' && (
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
  if (view.stack.length === 0) return null;
  return (
    <div className="stack">
      <div className="stack-title">Stack</div>
      {[...view.stack].reverse().map((item, i) => {
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
  chosen: Target[];
  onCancelTargeting: () => void;
  attackers: Map<InstanceId, PlayerId>;
  canAttackIds: Set<InstanceId>;
  currentDefender: PlayerId;
  blocks: Map<InstanceId, InstanceId>;
  submit: (actions: Action[]) => void;
  setAttackers: (m: Map<InstanceId, PlayerId>) => void;
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
  } else if (p.targeting) {
    text = `${p.targeting.title}${p.chosen.length > 0 ? ` (target ${p.chosen.length + 1})` : ''}. Click a highlighted card or player.`;
    if (pending.kind === 'priority') buttons = [{ label: 'Cancel', onClick: p.onCancelTargeting }];
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
    const spec = item.kind === 'ability' ? triggerSpec(s, item) : null;
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
        ? `${stepName(s.step)}: play a land or cast a spell. Glowing cards in your hand are playable.`
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
