import { useEffect, useRef } from 'react';
import type { GameView, InstanceId } from '@nexus/engine';
import { defOf, isCreature, rulesText, scryfallOf, typeLine } from '../game/cards.ts';
import type { LogEntry } from '../game/session.ts';
import { CardFace, ManaCost } from './Card.tsx';

/** A large view of the hovered card, with its rules text. */
export function Inspector({ view, id }: { view: GameView; id: InstanceId | null }) {
  const c = id ? view.cards[id] : undefined;
  // A pop-out on the right edge, only while a card is hovered (or triggering).
  if (!c) return null;
  const def = defOf(c.defId);
  const info = scryfallOf(c.defId,c.printing);
  const stats = c.zone === 'battlefield' ? view.stats[c.id] : undefined;
  const creature = stats?.types ? stats.types.includes('creature') : isCreature(def) || !!c.crewed;
  const indestructible = stats?.keywords.includes('Indestructible');
  const status = [
    c.zone === 'battlefield' && c.tapped && 'Tapped',
    c.zone === 'battlefield' && c.damage > 0 && `${c.damage} damage`,
    c.zone === 'battlefield' && c.summoningSick && creature && 'Summoning sick',
    stats?.goadedBy?.length && 'Goaded by ' + stats.goadedBy.join(', '),
  ].filter(Boolean);
  return (
    <div key={id} className="inspector" aria-live="polite">
      <div className="inspector-card">
        <CardFace printing={c.printing} defId={c.defId} size="large" />
      </div>
      <div className="inspector-text">
        <div className="inspector-title">
          <strong>{def.name}</strong> <ManaCost cost={def.manaCost} />
        </div>
        <div className="inspector-type">{stats?.types ? typeLine({ ...def, types: stats.types, subtypes: stats.subtypes }) : info?.typeLine ?? typeLine(def)}</div>
        <p className="inspector-rules">{rulesText(def)}</p>
        {def.notBuilt && (
          <p className="inspector-not-built">
            {isCreature(def)
              ? 'Not built yet: this creature plays with its power, toughness and keywords, but its other abilities do nothing yet.'
              : "Not built yet: this card can't be cast until its abilities are built."}
          </p>
        )}
        {creature && (
          <div className="inspector-pt">
            {stats?.power ?? def.power}/{stats?.toughness ?? def.toughness}
          </div>
        )}
        {status.length > 0 && <div className="inspector-status">{status.join(' · ')}</div>}
        {stats && c.damage > 0 && <p className="inspector-damage">
          Actual toughness: {stats.toughness}. {c.damage} damage marked until cleanup.
          {' '}{indestructible ? 'Indestructible prevents destruction from damage.' : `${Math.max(0, stats.toughness - c.damage)} more damage would be lethal.`}
        </p>}
        {info?.artist && <div className="inspector-credit">Illustrated by {info.artist}</div>}
      </div>
    </div>
  );
}

export function GameLog({ entries }: { entries: readonly LogEntry[] }) {
  const end = useRef<HTMLDivElement>(null);
  const last = entries.at(-1)?.id;
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [last]);
  return (
    <div className="log">
      {entries.slice(-150).map((e) => (
        <div key={e.id} className={e.heading ? 'log-heading' : 'log-line'}>
          {e.text}
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}
