import { useState } from 'react';
import type { CardDefinition } from '@nexus/engine';
import { costSymbols, defOf, frameClass, isCreature, rulesText, scryfallOf, symbolUrl, typeLine } from '../game/cards.ts';

export function ManaCost({ cost, size = 14 }: { cost: string | undefined; size?: number }) {
  return (
    <span className="mana-cost">
      {costSymbols(cost).map((sym, i) => (
        <img key={i} src={symbolUrl(sym)} alt={`{${sym}}`} width={size} height={size} />
      ))}
    </span>
  );
}

/** A drawn card frame, for when Scryfall's image can't load (offline, or a card not fetched yet). */
function DrawnCard({ def }: { def: CardDefinition }) {
  const text = rulesText(def);
  return (
    <div className={`drawn ${frameClass(def)}`}>
      <div className="drawn-title">
        <span className="drawn-name">{def.name}</span>
        <ManaCost cost={def.manaCost} size={11} />
      </div>
      <div className="drawn-art">
        <span>{def.types.includes('land') ? '⛰' : isCreature(def) ? '⚔' : '✦'}</span>
      </div>
      <div className="drawn-type">{typeLine(def)}</div>
      <div className="drawn-text">{text}</div>
      {isCreature(def) && (
        <div className="drawn-pt">
          {def.power}/{def.toughness}
        </div>
      )}
    </div>
  );
}

export type CardSize = 'small' | 'normal' | 'large';

/** A card face: the real Scryfall image when there is one, otherwise a drawn frame. */
export function CardFace({ defId, size = 'normal' }: { defId: string; size?: CardSize }) {
  const def = defOf(defId);
  const info = scryfallOf(defId);
  const [failed, setFailed] = useState(false);
  if (!info || failed) return <DrawnCard def={def} />;
  return (
    <img
      className="card-img"
      src={info.image[size]}
      alt={def.name}
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** The back of a card, for hidden cards and library piles. */
export function CardBack() {
  return <div className="card-back" />;
}
