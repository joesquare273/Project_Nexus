import { useLayoutEffect, useRef, useState } from 'react';
import type { CardDefinition, CardFinish } from '@nexus/engine';
import { costSymbols, defOf, frameClass, isCreature, meldedPrinting, rulesText, scryfallOf, symbolUrl, typeLine } from '../game/cards.ts';

/** One mana symbol: a gray circle with the number (or X) for generic mana, Scryfall's symbol for the rest (a colored letter if it can't load). */
function ManaSymbol({ sym, size }: { sym: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const circle = { width: size, height: size, fontSize: Math.round(size * (sym.length > 1 ? 0.56 : 0.72)) };
  if (/^(\d+|X|Y|Z)$/.test(sym)) return <span className="mana-sym generic" style={circle} role="img" aria-label={`{${sym}}`}>{sym}</span>;
  if (failed) return <span className={`mana-sym letter m-${sym.replace(/[^A-Z]/g, '')}`} style={circle} role="img" aria-label={`{${sym}}`}>{sym.replace('/', '')}</span>;
  return <img src={symbolUrl(sym)} alt={`{${sym}}`} width={size} height={size} onError={() => setFailed(true)} />;
}

export function ManaCost({ cost, size = 14 }: { cost: string | undefined; size?: number }) {
  return (
    <span className="mana-cost">
      {costSymbols(cost).map((sym, i) => (
        <ManaSymbol key={i} sym={sym} size={size} />
      ))}
    </span>
  );
}

/** Text with mana symbols: every "{W}", "{2}" or "{R}{G}" in it is drawn as its symbol ("Add {G}", "Pay {1}: add {R}{G}"). */
export function ManaText({ text, size = 15 }: { text: string; size?: number }) {
  const parts = text.split(/((?:{[^}]+})+)/);
  return (
    <span className="mana-text">
      {parts.map((part, i) => (/^{/.test(part) ? <ManaCost key={i} cost={part} size={size} /> : part))}
    </span>
  );
}

/** Smallest share of the title size a long name may shrink to, to stay readable. */
const MIN_NAME_SCALE = 0.62;

/**
 * A card name that shrinks just enough to fit its bar (long names on small
 * cards), refitting when the card changes size; below the minimum it's cut
 * off with an ellipsis as before.
 */
function FittedName({ name }: { name: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const room = el.clientWidth, need = el.scrollWidth;
      const next = need > room + 1 && room > 0 ? Math.max(MIN_NAME_SCALE, Math.floor((room / need) * 100) / 100) : 1;
      el.style.fontSize = next < 1 ? `${next}em` : '';
      setScale(next);
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(el.parentElement ?? el);
    return () => observer?.disconnect();
  }, [name]);
  return (
    <span ref={ref} className="drawn-name" style={scale < 1 ? { fontSize: `${scale}em` } : undefined}>
      {name}
    </span>
  );
}

/** A drawn card frame, for when Scryfall's image can't load (offline, or a card not fetched yet). */
function DrawnCard({ def }: { def: CardDefinition }) {
  const text = rulesText(def);
  return (
    <div className={`drawn ${frameClass(def)}`}>
      <div className="drawn-title">
        <FittedName name={def.name} />
        <ManaCost cost={def.manaCost} size={11} />
      </div>
      <div className="drawn-art">
        <span>{def.types.includes('land') ? '⛰' : isCreature(def) ? '⚔' : '✦'}</span>
      </div>
      <div className="drawn-type">{typeLine(def)}</div>
      <div className="drawn-text"><ManaText text={text} size={11} /></div>
      {isCreature(def) && (
        <div className="drawn-pt">
          {def.power}/{def.toughness}
        </div>
      )}
    </div>
  );
}

export type CardSize = 'small' | 'normal' | 'large';

/**
 * A card face: the real Scryfall image when there is one, otherwise a drawn
 * frame. `backFace`: a transformed double-faced permanent, whose back image
 * Scryfall serves at the same path under /back/, or a melded permanent.
 */
export function CardFace({
  defId,
  printing,
  size = 'normal',
  backFace = false,
  finish,
}: {
  defId: string;
  printing?: CardDefinition['printing'];
  size?: CardSize;
  backFace?: boolean;
  /** A foil card's shine (only finishes the player owns reach the board). */
  finish?: CardFinish;
}) {
  const def = defOf(defId);
  // A melded permanent shows the melded card, which Scryfall lists as its own printing.
  const melded = backFace && def.backFace && def.meld ? scryfallOf(defId, meldedPrinting(def, printing)) : undefined;
  const info = melded ?? scryfallOf(defId,printing);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = info && (backFace && !melded ? info.image[size].replace('/front/', '/back/') : info.image[size]);
  const shine = finish && <CardShine finish={finish} />;
  if (!info || !src || failedSrc === src)
    return (
      <>
        <DrawnCard def={backFace && def.backFace ? { ...def, ...def.backFace } : def} />
        {shine}
      </>
    );
  return (
    <>
    <img
      className="card-img"
      src={src}
      alt={def.name}
      draggable={false}
      loading="lazy"
      onError={() => setFailedSrc(src)}
    />
    {shine}
    </>
  );
}

/** The foil shine over a card image (its container must be positioned). */
export function CardShine({ finish }: { finish: CardFinish }) {
  return <div className={`card-shine look-${finish}`} aria-hidden="true" />;
}

/** The back of a card, for hidden cards and library piles. */
export function CardBack() {
  return <div className="card-back" />;
}
