// The free starter (economy step E1c): until a player has picked one, a
// window offers the four Final Fantasy Commander precons. The server grants
// the chosen one once (cards and a saved Commander deck); this only asks.

import { useEffect, useState } from 'react';
import { CARD_IDS_BY_NAME, SCRYFALL } from '@nexus/cards';
import { accessToken } from './AccountBar.tsx';

interface Choice {
  name: string;
  commander: string;
  colorIdentity: string[];
}

export function StarterPick() {
  const [choices, setChoices] = useState<Choice[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    accessToken()
      .then((token) => (token ? fetch('/api/starter', { headers: { Authorization: `Bearer ${token}` } }) : null))
      .then(async (res) => {
        if (!res?.ok) return;
        const body = (await res.json()) as { claimed: boolean; choices: Choice[] };
        if (!body.claimed) setChoices(body.choices);
      })
      .catch(() => undefined);
  }, []);

  if (done) {
    return (
      <div className="starter-pick" role="dialog" aria-label="Your free precon">
        <div className="starter-box">
          <h2>{done} is yours!</h2>
          <p>Its 100 cards are in your collection, and it's saved as a Commander deck (Packs → Decks).</p>
          <button className="primary" onClick={() => setDone(null)}>
            Let's play
          </button>
        </div>
      </div>
    );
  }
  if (!choices) return null;

  const claim = async () => {
    if (!picked) return;
    setBusy(true);
    setProblem(null);
    try {
      const token = await accessToken();
      const res = await fetch('/api/starter', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ precon: picked }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok && res.status !== 409) throw new Error(body.error ?? 'The precon could not be granted. Try again.');
      setChoices(null);
      if (res.ok) setDone(picked.replace(/\s*\(.*\)$/, ''));
    } catch (e) {
      setProblem(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : 'Could not reach the game server.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="starter-pick" role="dialog" aria-label="Choose your free precon">
      <div className="starter-box">
        <h2>Welcome! Choose your free Commander deck</h2>
        <p>Pick one of the four Final Fantasy precons. It's yours to keep: all 100 cards go into your collection. You can only choose once.</p>
        <div className="starter-choices">
          {choices.map((c) => {
            const art = SCRYFALL[CARD_IDS_BY_NAME[c.commander] ?? '']?.image.artCrop;
            return (
              <button key={c.name} className={`starter-choice ${picked === c.name ? 'chosen' : ''}`} aria-pressed={picked === c.name} onClick={() => setPicked(c.name)}>
                {art && <img src={art} alt="" />}
                <strong>{c.name}</strong>
                <span className="fineprint">
                  {c.commander} · {c.colorIdentity.join('')}
                </span>
              </button>
            );
          })}
        </div>
        {problem && <p className="account-error">{problem}</p>}
        <button className="primary" disabled={!picked || busy} onClick={() => void claim()}>
          {picked ? `Take ${picked.replace(/\s*\(.*\)$/, '')}` : 'Choose a deck'}
        </button>
      </div>
    </div>
  );
}
