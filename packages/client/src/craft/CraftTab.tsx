// The Craft tab: dismantle cards you own for fragments of their rarity, and
// spend four fragments of a rarity to craft a card of that rarity (the
// numbers come from the server's economy settings). Dismantling goes through
// a list on the right: add cards and copies, then dismantle them all at once. It reads your collection
// and saved decks to show what you own and to warn before a dismantle takes
// a card a deck uses; the server checks and applies every change.

import { useEffect, useMemo, useState } from 'react';
import { finishLook, type BoosterCard } from '@nexus/cards/boosters';
import type { FragmentRarity, Fragments } from '@nexus/cards/crafting';
import { accessToken, useSession } from '../account/AccountBar.tsx';
import { CardShine } from '../components/Card.tsx';
import { fetchCollection, fetchDecks, type Collection, type SavedDeck } from '../packs/collection.ts';
import { RARITY_NAMES, ownershipMatches, type Ownership, copiesOfCard, craftCard, craftStatus, deckWarnings, dismantleList, fetchFragments, listReward, listRoom, rewardFor, type CraftingRules, type ListEntry } from './craft.ts';
import '../packs/packs.css';
import './craft.css';

type Crafting = typeof import('@nexus/cards/crafting');
type Mode = 'dismantle' | 'craft';
type Finish = 'nonfoil' | 'foil' | 'surge';

/** The craft the player is about to confirm, with its request id (kept if they retry). */
type Pending = { kind: 'craft'; card: BoosterCard; rarity: FragmentRarity; requestId: string };

/** A card in the dismantle list, with its printing for the picture. */
type Queued = ListEntry & { printing: BoosterCard };

const FINISH_NAMES: Record<Finish, string> = { nonfoil: 'Non-foil', foil: 'Foil', surge: 'Surge foil' };

/** A rarity's fragment gem (the user's art, public/gems: common triangle, uncommon diamond, rare pentagon, mythic hexagon). */
export function FragmentGem({ rarity, size = 20 }: { rarity: FragmentRarity; size?: number }) {
  return <img className={`fragment-gem ${rarity}`} src={`/gems/${rarity}.png`} width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

function Balances({ fragments }: { fragments: Fragments }) {
  return (
    <div className="fragment-balances" aria-label="Your fragments">
      {(Object.keys(RARITY_NAMES) as FragmentRarity[]).map((r) => (
        <div key={r} className={`fragment-balance ${r}`} title={`${RARITY_NAMES[r]} Fragments`}>
          <FragmentGem rarity={r} size={36} />
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
  /** The dismantle list, and its request id once confirmed (kept for retries until the list changes). */
  const [list, setList] = useState<Queued[]>([]);
  const [listRequest, setListRequest] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /** Narrow screens: whether the list drawer is open. */
  const [listOpen, setListOpen] = useState(false);

  // Fragments, cards and decks belong to the signed-in account: load them again if it changes.
  const userId = useSession().session?.user.id;
  useEffect(() => {
    import('@nexus/cards/crafting').then(setMod, () => setProblem("The card data couldn't be loaded."));
    setState(null);
    setCollection(null);
    setList([]);
    setListRequest(null);
    if (!userId) return;
    accessToken()
      .then(async (token) => {
        if (!token) throw new Error('Sign in first.');
        const [coll, saved, frag] = await Promise.all([fetchCollection(token), fetchDecks(token), fetchFragments(token)]);
        setCollection(coll);
        setDecks(saved);
        setState(frag);
      })
      .catch((e: Error) => setProblem(e.message === 'Failed to fetch' ? 'Could not reach the game server.' : e.message));
  }, [userId]);

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

  const room = (card: BoosterCard, finish: Finish, current: readonly ListEntry[] = list) => listRoom(collection, mod.printingsNamed(card.name), current, card.id, finish, rules.protectLastCopy);
  const inList = (card: BoosterCard, finish: Finish) => list.find((e) => e.card === card.id && e.finish === finish)?.count ?? 0;
  /** Changes the list (a new list needs a new request id). */
  const changeList = (next: Queued[]) => {
    setList(next.filter((e) => e.count > 0));
    setListRequest(null);
    setConfirming(false);
    setDone(null);
  };
  const setCount = (card: BoosterCard, finish: Finish, rarity: FragmentRarity, count: number) => {
    const at = list.findIndex((e) => e.card === card.id && e.finish === finish);
    const n = Math.max(0, Math.min(count, room(card, finish)));
    if (at < 0) changeList([...list, { card: card.id, finish, rarity, count: n, printing: card }]);
    else changeList(list.map((e, i) => (i === at ? { ...e, count: n } : e)));
  };
  const listCopies = list.reduce((n, e) => n + e.count, 0);
  const listGain = listReward(rules, list);
  const listDecks = [...new Set(list.flatMap((e) => deckWarnings(decks, collection, e.card, e.finish, e.count)))];

  const dismantleAll = async () => {
    if (list.length === 0 || busy) return;
    const requestId = listRequest ?? crypto.randomUUID();
    setListRequest(requestId);
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in first.');
      const answer = await dismantleList(token, requestId, list);
      setState({ fragments: answer.fragments, rules });
      setCollection(await fetchCollection(token));
      const gained = (Object.keys(RARITY_NAMES) as FragmentRarity[]).filter((r) => listGain[r] > 0).map((r) => `+${listGain[r]} ${RARITY_NAMES[r]}`);
      setDone(`Dismantled ${listCopies} card${listCopies === 1 ? '' : 's'}: ${gained.join(', ')} Fragments.`);
      setList([]);
      setListRequest(null);
      setConfirming(false);
    } catch (e) {
      // The request id is kept: trying again can't pay twice.
      setProblem(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the game server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!pending || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      if (!token) throw new Error('Sign in first.');
      const answer = await craftCard(token, pending.requestId, pending.card.id);
      setState({ fragments: answer.fragments, rules });
      // Show the server's collection after the change.
      setCollection(await fetchCollection(token));
      setDone(`Crafted ${pending.card.name}. It's in your collection.`);
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
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'chosen' : ''} onClick={() => { setMode(m); setPending(null); setConfirming(false); setDone(null); }}>
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
          {cardPic(pending.card)}
          <div>
            <h3>Craft {pending.card.name}?</h3>
            <p>
              <FragmentGem rarity={pending.rarity} /> {rules.craft[pending.rarity]} {RARITY_NAMES[pending.rarity]} Fragments for one non-foil copy.
            </p>
            <div className="craft-confirm-buttons">
              <button className="primary" disabled={busy} onClick={() => void confirm()}>
                {busy ? 'Working…' : 'Craft'}
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
        <div className={`craft-body${listOpen ? ' list-open' : ''}`}>
          <div className="craft-grid">
            {owned.filter((o) => matches(o.card, o.rarity)).length === 0 && <p className="fineprint">No cards to dismantle{search || rarity !== 'all' ? ' match' : ' yet'}.</p>}
            {owned
              .filter((o) => matches(o.card, o.rarity))
              .map((o) => {
                const last = rules.protectLastCopy && total(o.card) <= 1;
                const queued = inList(o.card, o.finish);
                const full = !last && queued >= room(o.card, o.finish);
                const reward = rewardFor(rules, o.rarity, o.finish);
                return (
                  <div key={`${o.card.id}|${o.finish}`} className={`craft-item${queued ? ' queued' : ''}`}>
                    <div className="craft-pic-wrap">
                      {cardPic(o.card, o.finish)}
                      {queued > 0 && <span className="craft-queued" title="In the dismantle list">{queued}</span>}
                    </div>
                    <div className="craft-name">{o.card.name}</div>
                    <div className="fineprint">
                      {RARITY_NAMES[o.rarity]} · {FINISH_NAMES[o.finish]} · {o.count} owned
                    </div>
                    <button
                      disabled={last || full || busy}
                      title={last ? 'Your last copy of this card can’t be dismantled.' : full ? (rules.protectLastCopy && queued < o.count ? 'One copy of this card stays in your collection.' : 'Every copy is in the list.') : undefined}
                      onClick={() => setCount(o.card, o.finish, o.rarity, queued + 1)}
                    >
                      {last ? 'Last copy' : full ? 'All in list' : <>Add: +{reward} <FragmentGem rarity={o.rarity} size={18} /></>}
                    </button>
                  </div>
                );
              })}
          </div>

          <aside className="craft-list" aria-label="Dismantle list">
            <button className="craft-list-toggle" onClick={() => setListOpen(!listOpen)} aria-expanded={listOpen}>
              Dismantle list{listCopies ? ` (${listCopies})` : ''} <span aria-hidden="true">{listOpen ? '▾' : '▴'}</span>
            </button>
            <h3>Dismantle list</h3>
            {list.length === 0 ? (
              <p className="fineprint">Add cards from your collection, then dismantle them all at once.</p>
            ) : (
              <ul className="craft-list-rows">
                {list.map((e) => {
                  const finish = e.finish as Finish;
                  const max = room(e.printing, finish);
                  return (
                    <li key={`${e.card}|${e.finish}`} className="craft-list-row">
                      <img src={e.printing.images[0]!.small} alt="" loading="lazy" />
                      <div className="craft-list-text">
                        <div className="craft-name" title={e.printing.name}>{e.printing.name}</div>
                        <div className="fineprint">
                          {FINISH_NAMES[finish]} · +{rewardFor(rules, e.rarity, e.finish) * e.count}&nbsp;<FragmentGem rarity={e.rarity} size={14} />
                        </div>
                      </div>
                      <div className="craft-qty">
                        <button aria-label={`One less ${e.printing.name}`} disabled={busy} onClick={() => setCount(e.printing, finish, e.rarity, e.count - 1)}>−</button>
                        <span aria-label="Copies">{e.count}</span>
                        <button aria-label={`One more ${e.printing.name}`} disabled={busy || e.count >= max} onClick={() => setCount(e.printing, finish, e.rarity, e.count + 1)}>+</button>
                      </div>
                      <button className="craft-remove" aria-label={`Remove ${e.printing.name}`} disabled={busy} onClick={() => setCount(e.printing, finish, e.rarity, 0)}>×</button>
                    </li>
                  );
                })}
              </ul>
            )}
            {list.length > 0 && (
              <>
                <div className="craft-list-total">
                  <span>
                    {listCopies} card{listCopies === 1 ? '' : 's'}
                  </span>
                  <span className="craft-list-gain">
                    {(Object.keys(RARITY_NAMES) as FragmentRarity[])
                      .filter((r) => listGain[r] > 0)
                      .map((r) => (
                        <span key={r} title={`${RARITY_NAMES[r]} Fragments`}>
                          +{listGain[r]} <FragmentGem rarity={r} size={18} />
                        </span>
                      ))}
                  </span>
                </div>
                {listDecks.map((name) => (
                  <p key={name} className="craft-warning">
                    Your deck “{name}” uses some of these copies: it will be missing cards until you change it.
                  </p>
                ))}
                {confirming ? (
                  <div className="craft-list-confirm" role="dialog" aria-label="Confirm">
                    <p>Dismantle {listCopies} card{listCopies === 1 ? '' : 's'}? This can't be undone.</p>
                    <div className="craft-confirm-buttons">
                      <button className="primary" disabled={busy} onClick={() => void dismantleAll()}>
                        {busy ? 'Working…' : 'Dismantle'}
                      </button>
                      <button disabled={busy} onClick={() => setConfirming(false)}>
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="craft-confirm-buttons">
                    <button className="primary" disabled={busy} onClick={() => { setDone(null); setConfirming(true); }}>
                      Dismantle all
                    </button>
                    <button disabled={busy} onClick={() => changeList([])}>
                      Clear
                    </button>
                  </div>
                )}
              </>
            )}
          </aside>
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
                  Craft: {rules.craft[r]} <FragmentGem rarity={r} size={18} />
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
