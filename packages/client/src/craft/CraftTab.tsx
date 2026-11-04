// The Craft tab: dismantle cards you own for fragments of their rarity, and
// spend four fragments of a rarity to craft a card of that rarity (the
// numbers come from the server's economy settings). It reads your collection
// and saved decks to show what you own and to warn before a dismantle takes
// a card a deck uses; the server checks and applies every change.

import { useEffect, useMemo, useState } from 'react';
import { finishLook, type BoosterCard } from '@nexus/cards/boosters';
import type { FragmentRarity, Fragments } from '@nexus/cards/crafting';
import { accessToken } from '../account/AccountBar.tsx';
import { CardShine } from '../components/Card.tsx';
import { fetchCollection, fetchDecks, type Collection, type SavedDeck } from '../packs/collection.ts';
import { RARITY_NAMES, ownershipMatches, type Ownership, copiesOfCard, craftCard, craftStatus, deckWarnings, dismantleCard, fetchFragments, rewardFor, type CraftingRules } from './craft.ts';
import '../packs/packs.css';
import './craft.css';

type Crafting = typeof import('@nexus/cards/crafting');
type Mode = 'dismantle' | 'craft';
type Finish = 'nonfoil' | 'foil' | 'surge';

/** What the player is about to confirm, with its request id (kept if they retry). */
type Pending = { kind: 'dismantle'; card: BoosterCard; finish: Finish; rarity: FragmentRarity; requestId: string } | { kind: 'craft'; card: BoosterCard; rarity: FragmentRarity; requestId: string };

const FINISH_NAMES: Record<Finish, string> = { nonfoil: 'Non-foil', foil: 'Foil', surge: 'Surge foil' };

/** One fragment balance as a glowing gem. */
export function FragmentGem({ rarity, size = 20 }: { rarity: FragmentRarity; size?: number }) {
  return <span className={`fragment-gem ${rarity}`} style={{ width: size * 0.7, height: size }} aria-hidden="true" />;
}

function Balances({ fragments }: { fragments: Fragments }) {
  return (
    <div className="fragment-balances" aria-label="Your fragments">
      {(Object.keys(RARITY_NAMES) as FragmentRarity[]).map((r) => (
        <div key={r} className={`fragment-balance ${r}`} title={`${RARITY_NAMES[r]} Fragments`}>
          <FragmentGem rarity={r} size={26} />
          <strong>{fragments[r]}</strong>
          <span>{RARITY_NAMES[r]}</span>
        </div>
      ))}
    </div>
  );
}

export function CraftTab() {
  const [mod, setMod] = useState<Crafting | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [decks, setDecks] = useState<SavedDeck[]>([]);
  const [state, setState] = useState<{ fragments: Fragments; rules: CraftingRules } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('dismantle');
  const [search, setSearch] = useState('');
  const [rarity, setRarity] = useState<FragmentRarity | 'all'>('all');
  /** Craft view: every craftable card, only ones you own, or only ones you don't. */
  const [ownership, setOwnership] = useState<Ownership>('all');
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    import('@nexus/cards/crafting').then(setMod, () => setProblem("The card data couldn't be loaded."));
    accessToken()
      .then(async (token) => {
        if (!token) throw new Error('Sign in first.');
        const [coll, saved, frag] = await Promise.all([fetchCollection(token), fetchDecks(token), fetchFragments(token)]);
        setCollection(coll);
        setDecks(saved);
        setState(frag);
      })
      .catch((e: Error) => setProblem(e.message === 'Failed to fetch' ? 'Could not reach the game server.' : e.message));
  }, []);

  /** Owned copies you could dismantle: one entry per printing and finish. */
  const owned = useMemo(() => {
    if (!mod || !collection) return [];
    const out: { card: BoosterCard; finish: Finish; count: number; rarity: FragmentRarity }[] = [];
    for (const [id, finishes] of Object.entries(collection.cards)) {
      const r = mod.dismantleRarity(id);
      const card = mod.printing(id);
      if (!r || !card) continue;
      for (const [finish, count] of Object.entries(finishes)) if (count) out.push({ card, finish: finish as Finish, count, rarity: r });
    }
    return out.sort((a, b) => a.card.name.localeCompare(b.card.name) || a.finish.localeCompare(b.finish));
  }, [mod, collection]);

  if (!mod || !collection || !state) return <p className="packs-loading">{problem ?? 'Opening the forge…'}</p>;
  const { fragments, rules } = state;
  const matches = (card: BoosterCard, r: FragmentRarity) => (rarity === 'all' || r === rarity) && card.name.toLowerCase().includes(search.trim().toLowerCase());
  const total = (card: BoosterCard) => copiesOfCard(collection, mod.printingsNamed(card.name));

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in first.');
      const answer = pending.kind === 'dismantle' ? await dismantleCard(token, pending.requestId, pending.card.id, pending.finish) : await craftCard(token, pending.requestId, pending.card.id);
      setState({ fragments: answer.fragments, rules });
      // Show the server's collection after the change.
      setCollection(await fetchCollection(token));
      setDone(
        pending.kind === 'dismantle'
          ? `Dismantled ${pending.card.name} for ${rewardFor(rules, pending.rarity, pending.finish)} ${RARITY_NAMES[pending.rarity]} Fragment${rewardFor(rules, pending.rarity, pending.finish) === 1 ? '' : 's'}.`
          : `Crafted ${pending.card.name}. It's in your collection.`,
      );
      setPending(null);
    } catch (e) {
      // The request id is kept: trying again can't pay or craft twice.
      setProblem(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the game server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const cardPic = (card: BoosterCard, finish: Finish = 'nonfoil') => {
    const look = finishLook(card, finish);
    return (
      <div className="binder-card have craft-pic">
        <img src={card.images[0]!.normal} alt={card.name} loading="lazy" />
        {look && <CardShine finish={look} />}
      </div>
    );
  };

  return (
    <div className="craft">
      <Balances fragments={fragments} />
      <p className="fineprint craft-intro">
        Dismantle a card for {rules.dismantle.common} fragment of its rarity ({rules.foilBonus} more for a foil). {rules.craft.common} fragments of a rarity craft any card of that rarity from the FINAL FANTASY set and Commander precons, non-foil.
        {rules.protectLastCopy && ' Your last copy of a card stays.'}
      </p>
      <div className="binder-sets craft-modes" role="tablist" aria-label="Craft">
        {(['dismantle', 'craft'] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'chosen' : ''} onClick={() => { setMode(m); setPending(null); setDone(null); }}>
            {m === 'dismantle' ? 'Dismantle' : 'Craft'}
          </button>
        ))}
      </div>
      <div className="craft-filters">
        <input type="search" placeholder="Search cards" value={search} onChange={(e) => setSearch(e.target.value)} />
        {mode === 'craft' && (
          <select value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)} aria-label="Owned">
            <option value="all">Owned and not owned</option>
            <option value="owned">Owned</option>
            <option value="unowned">Not owned</option>
          </select>
        )}
        <select value={rarity} onChange={(e) => setRarity(e.target.value as FragmentRarity | 'all')} aria-label="Rarity">
          <option value="all">All rarities</option>
          {(Object.keys(RARITY_NAMES) as FragmentRarity[]).map((r) => (
            <option key={r} value={r}>
              {RARITY_NAMES[r]}
            </option>
          ))}
        </select>
      </div>
      {problem && <p className="account-error">{problem}</p>}
      {done && <p className="store-bought">{done}</p>}

      {pending && (
        <div className="craft-confirm" role="dialog" aria-label="Confirm">
          {cardPic(pending.card, pending.kind === 'dismantle' ? pending.finish : 'nonfoil')}
          <div>
            {pending.kind === 'dismantle' ? (
              <>
                <h3>Dismantle {pending.card.name}?</h3>
                <p>
                  One {FINISH_NAMES[pending.finish].toLowerCase()} copy becomes <FragmentGem rarity={pending.rarity} /> {rewardFor(rules, pending.rarity, pending.finish)} {RARITY_NAMES[pending.rarity]} Fragment
                  {rewardFor(rules, pending.rarity, pending.finish) === 1 ? '' : 's'}. This can't be undone.
                </p>
                {total(pending.card) === 2 && <p className="craft-warning">This leaves you one copy of {pending.card.name}.</p>}
                {deckWarnings(decks, collection, pending.card.id, pending.finish).map((name) => (
                  <p key={name} className="craft-warning">
                    Your deck “{name}” uses this copy: it will be missing a card until you change it.
                  </p>
                ))}
              </>
            ) : (
              <>
                <h3>Craft {pending.card.name}?</h3>
                <p>
                  <FragmentGem rarity={pending.rarity} /> {rules.craft[pending.rarity]} {RARITY_NAMES[pending.rarity]} Fragments for one non-foil copy.
                </p>
              </>
            )}
            <div className="craft-confirm-buttons">
              <button className="primary" disabled={busy} onClick={() => void confirm()}>
                {busy ? 'Working…' : pending.kind === 'dismantle' ? 'Dismantle' : 'Craft'}
              </button>
              <button disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismantle lists only cards you own (from your collection); Craft lists every craftable card. */}
      {mode === 'dismantle' ? (
        <div className="craft-grid">
          {owned.filter((o) => matches(o.card, o.rarity)).length === 0 && <p className="fineprint">No cards to dismantle{search || rarity !== 'all' ? ' match' : ' yet'}.</p>}
          {owned
            .filter((o) => matches(o.card, o.rarity))
            .map((o) => {
              const last = rules.protectLastCopy && total(o.card) <= 1;
              const reward = rewardFor(rules, o.rarity, o.finish);
              return (
                <div key={`${o.card.id}|${o.finish}`} className="craft-item">
                  {cardPic(o.card, o.finish)}
                  <div className="craft-name">{o.card.name}</div>
                  <div className="fineprint">
                    {RARITY_NAMES[o.rarity]} · {FINISH_NAMES[o.finish]} · {o.count} owned
                  </div>
                  <button disabled={last || busy} title={last ? 'Your last copy of this card can’t be dismantled.' : undefined} onClick={() => { setDone(null); setPending({ kind: 'dismantle', card: o.card, finish: o.finish, rarity: o.rarity, requestId: crypto.randomUUID() }); }}>
                    {last ? 'Last copy' : <>Dismantle: +{reward} <FragmentGem rarity={o.rarity} size={14} /></>}
                  </button>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="craft-grid">
          {mod.CRAFTABLE.filter((c) => matches(c, c.rarity as FragmentRarity) && ownershipMatches(total(c), ownership)).map((c) => {
            const r = c.rarity as FragmentRarity;
            const status = craftStatus(rules, fragments, r);
            const have = total(c);
            return (
              <div key={c.id} className="craft-item">
                {cardPic(c)}
                <div className="craft-name">{c.name}</div>
                <div className="fineprint">
                  {RARITY_NAMES[r]} · {have ? `${have} owned` : 'Not owned'}
                </div>
                <button className={status.ok ? 'primary' : ''} disabled={!status.ok || busy} title={status.reason} onClick={() => { setDone(null); setPending({ kind: 'craft', card: c, rarity: r, requestId: crypto.randomUUID() }); }}>
                  Craft: {rules.craft[r]} <FragmentGem rarity={r} size={14} />
                </button>
                {!status.ok && <div className="fineprint craft-why">{status.reason}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
