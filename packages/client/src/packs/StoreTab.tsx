// The Store tab (economy step E4): exclusive printings, divided by set (Final
// Fantasy: each Chocobo Track foil on its own, and the five Chocobo Track
// basic lands as a bundle).
// The game server holds the catalog and prices; an item without a price yet
// says "Price coming soon". Buying asks first, then the server charges the
// shards and adds the card to the collection together.

import { useEffect, useMemo, useState } from 'react';
import { finishLook, type BoosterCard, type Finish } from '@nexus/cards/boosters';
import { accessToken, showShards, ShardIcon } from '../account/AccountBar.tsx';
import { CardShine } from '../components/Card.tsx';
import { fetchCollection, owned, type Collection } from './collection.ts';
import './packs.css';

type Boosters = typeof import('@nexus/cards/boosters');

interface StoreItem {
  key: string;
  name: string;
  line: string;
  price: number | null;
  cards: { id: string; finish: Finish }[];
}
interface StoreSet {
  name: string;
  ready: boolean;
  items: StoreItem[];
}

export function StoreTab() {
  const [mod, setMod] = useState<Boosters | null>(null);
  const [sets, setSets] = useState<StoreSet[] | null>(null);
  const [collection, setCollection] = useState<Collection | null>(null);
  const [set, setSet] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [bought, setBought] = useState<string | null>(null);

  useEffect(() => {
    import('@nexus/cards/boosters').then(setMod, () => setProblem("The card data couldn't be loaded."));
    accessToken()
      .then(async (token) => {
        if (!token) throw new Error('Sign in first.');
        const [res, coll] = await Promise.all([fetch('/api/store', { headers: { Authorization: `Bearer ${token}` } }), fetchCollection(token)]);
        if (!res.ok) throw new Error('The Store could not be loaded.');
        setSets(((await res.json()) as { sets: StoreSet[] }).sets);
        setCollection(coll);
      })
      .catch((e: Error) => setProblem(e.message === 'Failed to fetch' ? 'Could not reach the game server.' : e.message));
  }, []);

  const byId = useMemo(() => new Map((mod?.BOOSTER_CARDS ?? []).map((c) => [c.id, c])), [mod]);

  const buy = async (item: StoreItem) => {
    if (item.price === null || busy || !collection) return;
    if (!window.confirm(`Buy ${item.name} (${item.line}) for ${item.price.toLocaleString()} Aether Shards?`)) return;
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      const res = await fetch('/api/store/buy', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: item.key }),
      });
      const body = (await res.json().catch(() => ({}))) as { balance?: number; error?: string };
      if (!res.ok || body.balance === undefined) throw new Error(body.error ?? 'That could not be bought. Try again.');
      showShards(body.balance);
      const cards = { ...collection.cards };
      for (const c of item.cards) cards[c.id] = { ...cards[c.id], [c.finish]: (cards[c.id]?.[c.finish] ?? 0) + 1 };
      setCollection({ cards });
      setBought(item.name);
    } catch (e) {
      setProblem(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the game server.');
    } finally {
      setBusy(false);
    }
  };

  if (!sets || !mod || !collection) return <p className="packs-loading">{problem ?? 'Opening the Store…'}</p>;
  const shown = sets[set]!;

  return (
    <div className="store">
      <div className="binder-sets" role="tablist" aria-label="Sets">
        {sets.map((s, i) => (
          <button key={s.name} role="tab" aria-selected={i === set} className={s.ready ? (i === set ? 'chosen' : '') : 'soon'} disabled={!s.ready} title={s.ready ? undefined : 'Coming soon'} onClick={() => setSet(i)}>
            {s.name}
            {!s.ready && <span className="tag">Coming soon</span>}
          </button>
        ))}
      </div>
      <p className="fineprint store-intro">Exclusive printings you can buy one at a time. They go straight into your collection.</p>
      {problem && <p className="account-error">{problem}</p>}
      {bought && <p className="store-bought">{bought} is in your collection.</p>}
      <div className="store-grid">
        {shown.items.map((item) => {
          const cards = item.cards.map((c) => ({ ...c, card: byId.get(c.id) as BoosterCard | undefined }));
          const have = Math.min(...item.cards.map((c) => owned(collection, c.id)));
          return (
            <div key={item.key} className="store-item">
              <div className={`store-cards ${cards.length > 1 ? 'bundle' : ''}`}>
                {cards.map(({ id, finish, card }) => {
                  const look = card ? finishLook(card, finish) : undefined;
                  return (
                    <div key={id} className="binder-card have store-card">
                      {card && <img src={card.images[0]![cards.length > 1 ? 'small' : 'normal']} alt={card.name} loading="lazy" />}
                      {look && <CardShine finish={look} />}
                    </div>
                  );
                })}
                {have > 0 && <span className="finish-chip store-owned">Owned{cards.length > 1 ? '' : `: ${have}`}</span>}
              </div>
              <div className="store-name">{item.name}</div>
              <div className="fineprint">{item.line}</div>
              {item.price === null ? (
                <button disabled className="store-buy">
                  Price coming soon
                </button>
              ) : (
                <button className="primary store-buy" disabled={busy} onClick={() => void buy(item)}>
                  Buy <ShardIcon size={16} /> {item.price.toLocaleString()}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
