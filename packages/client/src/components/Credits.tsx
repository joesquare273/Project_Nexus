// Credits and the legal notice: whose work Project Nexus uses, and that it's
// an unofficial, free fan project. The short notice sits at the foot of every
// page; the full credits are on their own page (#/credits).

import { useState } from 'react';
import { UI_ART } from '@nexus/cards';

/** The notice Wizards of the Coast's Fan Content Policy suggests for fan content, with this project's name. */
export const FAN_CONTENT_NOTICE =
  'Project Nexus is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.';

/** The foot of every page: the notice, and the way to the full credits. */
export function LegalFooter({ onCredits }: { onCredits: () => void }) {
  return (
    <footer className="legal-footer">
      <p>{FAN_CONTENT_NOTICE}</p>
      <p>
        Free and non-commercial: nothing here is sold for real money.{' '}
        <button className="link" onClick={onCredits}>
          Credits and legal
        </button>
      </p>
    </footer>
  );
}

/** The signed-out landing page's foot: the notice, with the full credits opening below it. */
export function LandingLegal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LegalFooter onCredits={() => setOpen(!open)} />
      {open && <CreditsBody />}
    </>
  );
}

export function CreditsPage() {
  return (
    <div className="credits-page">
      <CreditsBody />
    </div>
  );
}

function CreditsBody() {
  return (
    <section className="credits" aria-label="Credits and legal">
      <h2>Credits and legal</h2>

      <h3>An unofficial fan project</h3>
      <p>{FAN_CONTENT_NOTICE}</p>
      <p>
        Project Nexus is a free, personal, non-commercial fan project played among friends. It is not affiliated with, sponsored by or endorsed by Wizards of the Coast, Hasbro,
        Square Enix or Scryfall. There are no ads, no subscriptions and no purchases with real money: Aether Shards are earned by playing, can't be bought, and have no cash value.
      </p>

      <h3>Magic: The Gathering</h3>
      <p>
        Magic: The Gathering, its card names, rules text, mana symbols, set symbols and card images are property of Wizards of the Coast LLC, a subsidiary of Hasbro, Inc. Magic:
        The Gathering is a trademark of Wizards of the Coast LLC. The game's rules are implemented here from the public Comprehensive Rules, so that friends can play.
      </p>

      <h3>FINAL FANTASY</h3>
      <p>
        FINAL FANTASY and its characters, names and imagery are property of Square Enix Holdings Co., Ltd. FINAL FANTASY is a registered trademark of Square Enix Holdings Co., Ltd.
        The Magic: The Gathering FINAL FANTASY cards are a collaboration between Wizards of the Coast and Square Enix.
      </p>

      <h3>Card art</h3>
      <p>
        Every card image is the work of its artist, credited on the card itself. Where only a card's art is shown (deck covers, menu banners), it is cropped from that card. All
        rights to the art remain with the artists and the rights holders.
      </p>
      <h3>Menu and page art</h3>
      <p>The art on the menus and page banners is cropped from these cards:</p>
      <ul className="credits-art">
        {Object.values(UI_ART).filter((a) => typeof a === 'object' && !!a?.artist).map((a) => (
          <li key={a.name + a.set}>
            {a.name} ({a.set.toUpperCase()}), art by {a.artist}
          </li>
        ))}
      </ul>

      <h3>Card data and images</h3>
      <p>
        Card data and images are provided by{' '}
        <a href="https://scryfall.com" target="_blank" rel="noreferrer">
          Scryfall
        </a>
        . Project Nexus is not produced by or endorsed by Scryfall.
      </p>

      <h3>Fonts</h3>
      <p>Cinzel, Grenze, Lora and Oswald, used under the SIL Open Font License.</p>

      <h3>Victory and Defeat art</h3>
      <p>Provided by the project's owner.</p>

      <h3>Rights holders</h3>
      <p>If you hold rights to anything shown here and want it changed or removed, please contact the project's owner; it will be taken down promptly.</p>
    </section>
  );
}
