// Every Final Fantasy Starter Kit card built in K2-K6, played through the
// engine with its real card data. Each test checks what the card's Oracle
// text says it does.

import { describe, expect, it } from 'vitest';
import {
  abilityOptions,
  activatedAbilities,
  characteristics,
  formatManaCost,
  getLegalActions,
  hasKeyword,
  powerOf,
  spellOptions,
  toughnessOf,
  type GameState,
} from '@nexus/engine';
import { basicAi } from '../src/index.ts';
import { act, actWithEvents, card, cast, fight, goTo, mana, newGame, player, put, rejected, settle } from './kit-helpers.ts';

const stats = (s: GameState, id: string) => [powerOf(s, id ? s.cards[id]! : s.cards[id]!), toughnessOf(s, s.cards[id]!)];
const zone = (s: GameState, id: string) => s.cards[id]!.zone;
const tokensOf = (s: GameState, who: string, defId: string) =>
  s.players[who]!.battlefield.filter((id) => s.cards[id]!.defId === defId && s.cards[id]!.isToken);
const equipIndex = (s: GameState, id: string) => activatedAbilities(s.cardDefs[s.cards[id]!.defId]!).findIndex((a) => a.equip);

describe('K2: tokens and counters', () => {
  it('Dwarven Castle Guard leaves a 1/1 Hero token when it dies', () => {
    let s = newGame();
    const guard = put(s, 'P1', 'dwarven-castle-guard');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(guard)] }).state;
    const heroes = tokensOf(s, 'P1', 'hero-token');
    expect(heroes).toHaveLength(1);
    expect(stats(s, heroes[0]!)).toEqual([1, 1]);
  });

  it('Undercity Dire Rat leaves a Treasure, which sacrifices itself for one mana of any color and ceases to exist', () => {
    let s = newGame();
    const rat = put(s, 'P1', 'undercity-dire-rat');
    const salvagers = put(s, 'P1', 'al-bhed-salvagers');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    mana(s, 'P1', { B: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(rat)] }).state;
    const [treasure] = tokensOf(s, 'P1', 'treasure-token');
    expect(treasure).toBeDefined();
    const lifeBefore = s.players.P2!.life;
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: treasure!, mana: 'G' });
    expect(s.players.P1!.manaPool.G).toBe(1);
    expect(zone(s, treasure!)).toBe('void');
    // Sacrificing it means an artifact you control died: Al Bhed Salvagers drains.
    s = settle(s).state;
    expect(s.players.P2!.life).toBe(lifeBefore - 1);
    expect(salvagers).toBeDefined();
  });

  it("The Crystal's Chosen makes four Heroes, then counters on each creature you control", () => {
    let s = newGame();
    const bear = put(s, 'P1', 'coeurl');
    const sorcery = put(s, 'P1', 'the-crystals-chosen', 'hand');
    mana(s, 'P1', { W: 7 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sorcery }).state;
    const heroes = tokensOf(s, 'P1', 'hero-token');
    expect(heroes).toHaveLength(4);
    for (const h of heroes) expect(stats(s, h)).toEqual([2, 2]);
    expect(stats(s, bear)).toEqual([3, 3]);
  });

  it('Seymour Flux: pay 1 life in your upkeep to draw and grow', () => {
    let s = newGame();
    const seymour = put(s, 'P1', 'seymour-flux');
    s.step = 'end';
    s.activePlayer = 'P2';
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    const hand = s.players.P1!.hand.length;
    s = goTo(s, 'draw', { accept: true });
    expect(s.players.P1!.life).toBe(19);
    expect(s.players.P1!.hand.length).toBe(hand + 2); // the Seymour draw and the normal draw
    expect(stats(s, seymour)).toEqual([6, 6]);
  });
});

describe('K3: continuous effects', () => {
  it('Rosa puts a counter on your creature at the beginning of combat; it gains lifelink this turn', () => {
    let s = newGame();
    put(s, 'P1', 'rosa-resolute-white-mage');
    const coeurl = put(s, 'P1', 'coeurl');
    s = goTo(s, 'beginCombat', { targets: (opts) => opts.find((t) => t[0]!.kind === 'card' && t[0]!.card === coeurl)! });
    expect(stats(s, coeurl)).toEqual([3, 3]);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Lifelink')).toBe(true);
    s = goTo(s, 'upkeep');
    expect(hasKeyword(s, s.cards[coeurl]!, 'Lifelink')).toBe(false);
    expect(stats(s, coeurl)).toEqual([3, 3]);
  });

  it('Sephiroth shrinks opposing creatures this turn and grows when they die', () => {
    let s = newGame(3);
    const sephiroth = put(s, 'P1', 'sephiroth-planets-heir', 'hand');
    const small = put(s, 'P2', 'coeurl');
    const big = put(s, 'P3', 'seymour-flux');
    const mine = put(s, 'P1', 'coeurl');
    mana(s, 'P1', { U: 3, B: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sephiroth }).state;
    expect(zone(s, small)).toBe('graveyard');
    expect(stats(s, big)).toEqual([3, 3]);
    expect(stats(s, mine)).toEqual([2, 2]);
    expect(stats(s, sephiroth)).toEqual([5, 5]);
  });

  it('Overkill: -0/-9999 kills even indestructible creatures', () => {
    let s = newGame();
    const cloud = put(s, 'P2', 'cloud-planets-champion');
    const kill = put(s, 'P1', 'overkill', 'hand');
    mana(s, 'P1', { B: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(cloud)] }).state;
    expect(zone(s, cloud)).toBe('graveyard');
  });

  it('Xande gets +1/+1 for each noncreature, nonland card in your graveyard', () => {
    const s = newGame();
    const xande = put(s, 'P1', 'xande-dark-mage');
    put(s, 'P1', 'overkill', 'graveyard');
    put(s, 'P1', 'dreams-of-laguna', 'graveyard');
    put(s, 'P1', 'coeurl', 'graveyard');
    put(s, 'P1', 'island', 'graveyard');
    put(s, 'P2', 'suplex', 'graveyard');
    expect(stats(s, xande)).toEqual([5, 5]);
  });

  it('Adelbert Steiner gets +1/+1 for each Equipment you control', () => {
    const s = newGame();
    const steiner = put(s, 'P1', 'adelbert-steiner');
    put(s, 'P1', 'samurais-katana');
    put(s, 'P1', 'warriors-sword');
    put(s, 'P2', 'magitek-scythe');
    expect(stats(s, steiner)).toEqual([4, 3]);
  });

  it('Slash of Light deals damage equal to your creatures plus your Equipment', () => {
    let s = newGame();
    put(s, 'P1', 'coeurl');
    put(s, 'P1', 'coeurl');
    put(s, 'P1', 'samurais-katana');
    const target = put(s, 'P2', 'seymour-flux');
    const slash = put(s, 'P1', 'slash-of-light', 'hand');
    mana(s, 'P1', { W: 2 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: slash, targets: [card(target)] }).state;
    expect(s.cards[target]!.damage).toBe(3);
  });

  it("Judgment Bolt deals 5 to a creature and X to its controller", () => {
    let s = newGame(3);
    put(s, 'P1', 'samurais-katana');
    put(s, 'P1', 'warriors-sword');
    const target = put(s, 'P3', 'seymour-flux');
    const bolt = put(s, 'P1', 'judgment-bolt', 'hand');
    mana(s, 'P1', { R: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: bolt, targets: [card(target)] }).state;
    expect(zone(s, target)).toBe('graveyard');
    expect(s.players.P3!.life).toBe(18);
    expect(s.players.P2!.life).toBe(20);
  });

  it('Deadly Embrace destroys a creature, then draws for each creature that died this turn', () => {
    let s = newGame();
    const first = put(s, 'P2', 'coeurl');
    const second = put(s, 'P2', 'coeurl');
    const kill = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const embrace = put(s, 'P1', 'deadly-embrace', 'hand');
    mana(s, 'P1', { B: 9 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: kill, targets: [card(first)] }).state;
    const hand = s.players.P1!.hand.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: embrace, targets: [card(second)] }).state;
    expect(s.players.P1!.hand.length).toBe(hand - 1 + 2);
  });

  it('Sahagin grows and is unblockable when you cast a noncreature spell with 4+ mana', () => {
    let s = newGame();
    const sahagin = put(s, 'P1', 'sahagin');
    const cheap = put(s, 'P1', 'overkill', 'hand');
    const pricey = put(s, 'P1', 'sephiroths-intervention', 'hand');
    const victim = put(s, 'P2', 'coeurl');
    const other = put(s, 'P2', 'coeurl');
    mana(s, 'P1', { B: 7 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: cheap, targets: [card(victim)] }).state;
    expect(stats(s, sahagin)).toEqual([1, 3]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: pricey, targets: [card(other)] }).state;
    expect(stats(s, sahagin)).toEqual([2, 4]);
    expect(characteristics(s, s.cards[sahagin]!).power).toBe(2);
    const blocker = put(s, 'P2', 'seymour-flux');
    const r = fight(s, [{ attacker: sahagin, defender: 'P2' }]);
    expect(r.state.players.P2!.life).toBe(18);
    expect(blocker).toBeDefined();
  });

  it('Shinra Reinforcements mills three and gains 3 life', () => {
    let s = newGame();
    const shinra = put(s, 'P1', 'shinra-reinforcements', 'hand');
    mana(s, 'P1', { B: 3 });
    const library = s.players.P1!.library.length;
    s = cast(s, { type: 'CastSpell', player: 'P1', card: shinra }).state;
    expect(s.players.P1!.library.length).toBe(library - 3);
    expect(s.players.P1!.graveyard).toHaveLength(3);
    expect(s.players.P1!.life).toBe(23);
  });
});

describe('K4: Equipment and Job select', () => {
  it("Job select: Samurai's Katana makes a Hero and equips it: +2/+2, trample, haste, Samurai", () => {
    let s = newGame();
    const katana = put(s, 'P1', 'samurais-katana', 'hand');
    mana(s, 'P1', { R: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: katana }).state;
    const [hero] = tokensOf(s, 'P1', 'hero-token');
    expect(s.cards[katana]!.attachedTo).toBe(hero);
    const ch = characteristics(s, s.cards[hero!]!);
    expect([ch.power, ch.toughness]).toEqual([3, 3]);
    expect([...ch.keywords].sort()).toEqual(['Haste', 'Trample']);
    expect(ch.subtypes).toEqual(['Hero', 'Samurai']);
  });

  it("Equip moves gear at sorcery speed; Warrior's Sword gives +3/+2 and makes it a Warrior", () => {
    let s = newGame();
    const sword = put(s, 'P1', 'warriors-sword');
    const coeurl = put(s, 'P1', 'coeurl');
    const ability = equipIndex(s, sword);
    mana(s, 'P1', { R: 5 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: sword, ability, targets: [card(coeurl)] }).state;
    expect(stats(s, coeurl)).toEqual([5, 4]);
    expect(characteristics(s, s.cards[coeurl]!).subtypes).toContain('Warrior');
    // Not at instant speed.
    s = goTo(s, 'beginCombat');
    mana(s, 'P1', { R: 5 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: sword, ability, targets: [card(coeurl)] })).toMatch(
      /main phase/,
    );
  });

  it("Dragoon's Lance: +1/+0, Knight, and flying during your turn only", () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'dragoons-lance', 'battlefield', { attachedTo: coeurl });
    expect(stats(s, coeurl)).toEqual([3, 2]);
    expect(hasKeyword(s, s.cards[coeurl]!, 'Flying')).toBe(true);
    s = goTo(s, 'upkeep');
    expect(s.activePlayer).toBe('P2');
    expect(hasKeyword(s, s.cards[coeurl]!, 'Flying')).toBe(false);
  });

  it("White Mage's Staff: +1/+1, Cleric, and you gain 1 life whenever the creature attacks", () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'white-mages-staff', 'battlefield', { attachedTo: coeurl });
    expect(stats(s, coeurl)).toEqual([3, 3]);
    s = fight(s, [{ attacker: coeurl, defender: 'P2' }]).state;
    expect(s.players.P1!.life).toBe(21);
    expect(s.players.P2!.life).toBe(17);
  });

  it('Ultima Weapon: +7/+7, and destroys an opposing creature whenever the creature attacks', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'ultima-weapon', 'battlefield', { attachedTo: coeurl });
    const victim = put(s, 'P2', 'seymour-flux');
    expect(stats(s, coeurl)).toEqual([9, 9]);
    s = fight(s, [{ attacker: coeurl, defender: 'P2' }]).state;
    expect(zone(s, victim)).toBe('graveyard');
    expect(s.players.P2!.life).toBe(11);
  });

  it('Magitek Scythe can attach on entering: first strike, and the creature must be blocked if able', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const scythe = put(s, 'P1', 'magitek-scythe', 'hand');
    const blocker = put(s, 'P2', 'seymour-flux');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: scythe }, { accept: true }).state;
    expect(s.cards[scythe]!.attachedTo).toBe(coeurl);
    expect(stats(s, coeurl)).toEqual([4, 3]);
    expect(hasKeyword(s, s.cards[coeurl]!, 'FirstStrike')).toBe(true);
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: coeurl, defender: 'P2' }] });
    s = settle(s).state;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toEqual({ kind: 'declareBlockers', player: 'P2' });
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: [] })).toMatch(/must be blocked/);
    s = act(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker: coeurl }] });
  });

  it('"Must be blocked" on a menace attacker needs two free blockers to apply', () => {
    let s = newGame();
    const lightning = put(s, 'P1', 'lightning-security-sergeant'); // menace
    const scythe = put(s, 'P1', 'magitek-scythe', 'hand');
    const first = put(s, 'P2', 'seymour-flux');
    mana(s, 'P1', { C: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: scythe }, { accept: true }).state;
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: lightning, defender: 'P2' }] });
    s = settle(s).state;
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    // One creature can't block a menace attacker, so not blocking is fine.
    expect(getLegalActions(s)).toContainEqual({ type: 'DeclareBlockers', player: 'P2', blocks: [] });
    const withTwo = structuredClone(s);
    const second = put(withTwo, 'P2', 'coeurl');
    expect(rejected(withTwo, { type: 'DeclareBlockers', player: 'P2', blocks: [] })).toMatch(/must be blocked/);
    act(withTwo, {
      type: 'DeclareBlockers',
      player: 'P2',
      blocks: [
        { blocker: first, attacker: lightning },
        { blocker: second, attacker: lightning },
      ],
    });
  });

  it('Beatrix may attach all your Equipment to a creature at the beginning of combat', () => {
    let s = newGame();
    put(s, 'P1', 'beatrix-loyal-general');
    const coeurl = put(s, 'P1', 'coeurl');
    const katana = put(s, 'P1', 'samurais-katana');
    const sword = put(s, 'P1', 'warriors-sword');
    s = goTo(s, 'beginCombat', {
      accept: true,
      targets: (opts) => opts.find((t) => t[0]!.kind === 'card' && t[0]!.card === coeurl)!,
    });
    expect(s.cards[katana]!.attachedTo).toBe(coeurl);
    expect(s.cards[sword]!.attachedTo).toBe(coeurl);
  });

  it('Cloud has double strike and indestructible on your turn while equipped, and equip costs {2} less on him', () => {
    let s = newGame();
    const cloud = put(s, 'P1', 'cloud-planets-champion');
    const sword = put(s, 'P1', 'warriors-sword');
    expect(hasKeyword(s, s.cards[cloud]!, 'DoubleStrike')).toBe(false);
    const options = abilityOptions(s, 'P1').filter((o) => o.action.card === sword);
    const onCloud = options.find((o) => o.action.targets?.[0]?.kind === 'card' && o.action.targets[0].card === cloud)!;
    expect(formatManaCost(onCloud.cost)).toBe('{3}');
    mana(s, 'P1', { R: 3 });
    s = cast(s, onCloud.action).state;
    expect(hasKeyword(s, s.cards[cloud]!, 'DoubleStrike')).toBe(true);
    expect(hasKeyword(s, s.cards[cloud]!, 'Indestructible')).toBe(true);
    s = goTo(s, 'upkeep');
    expect(hasKeyword(s, s.cards[cloud]!, 'DoubleStrike')).toBe(false);
  });

  it('Barret Wallace deals damage equal to your equipped creatures to the defending player when he attacks', () => {
    let s = newGame(3);
    const barret = put(s, 'P1', 'barret-wallace');
    const a = put(s, 'P1', 'coeurl');
    const b = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'warriors-sword', 'battlefield', { attachedTo: a });
    put(s, 'P1', 'samurais-katana', 'battlefield', { attachedTo: b });
    s = fight(s, [{ attacker: barret, defender: 'P3' }]).state;
    expect(s.players.P3!.life).toBe(20 - 2 - 4);
    expect(s.players.P2!.life).toBe(20);
  });

  it('Item Shopkeep gives an attacking equipped creature menace', () => {
    let s = newGame();
    put(s, 'P1', 'item-shopkeep');
    const coeurl = put(s, 'P1', 'coeurl');
    put(s, 'P1', 'warriors-sword', 'battlefield', { attachedTo: coeurl });
    const blocker = put(s, 'P2', 'seymour-flux');
    s = goTo(s, 'declareAttackers');
    s = act(s, { type: 'DeclareAttackers', player: 'P1', attacks: [{ attacker: coeurl, defender: 'P2' }] });
    s = settle(s).state;
    expect(hasKeyword(s, s.cards[coeurl]!, 'Menace')).toBe(true);
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(rejected(s, { type: 'DeclareBlockers', player: 'P2', blocks: [{ blocker, attacker: coeurl }] })).toMatch(/menace/);
  });

  it("Freya Crescent flies on your turn, and her mana only pays for Equipment and equip", () => {
    let s = newGame();
    const freya = put(s, 'P1', 'freya-crescent');
    expect(hasKeyword(s, s.cards[freya]!, 'Flying')).toBe(true);
    const katana = put(s, 'P1', 'samurais-katana', 'hand');
    const coeurl = put(s, 'P1', 'coeurl', 'hand');
    mana(s, 'P1', { W: 1 });
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: freya, mana: 'R' });
    expect(s.players.P1!.equipmentMana.R).toBe(1);
    expect(s.players.P1!.manaPool.R).toBe(0);
    // Coeurl ({1}{W}) is not an Equipment, so her {R} can't help pay for it.
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: coeurl })).toMatch(/Not enough mana/);
    // Samurai's Katana ({2}{R}) is: her {R} pays the {R}.
    mana(s, 'P1', { C: 1 });
    s = act(s, { type: 'CastSpell', player: 'P1', card: katana });
    expect(s.players.P1!.equipmentMana.R).toBe(0);
  });

  it('Equipment falls off when the creature leaves, and stays on the battlefield', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const sword = put(s, 'P1', 'warriors-sword', 'battlefield', { attachedTo: coeurl });
    const kill = put(s, 'P2', 'overkill', 'hand');
    mana(s, 'P2', { B: 3 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = cast(s, { type: 'CastSpell', player: 'P2', card: kill, targets: [card(coeurl)] }).state;
    expect(zone(s, sword)).toBe('battlefield');
    expect(s.cards[sword]!.attachedTo).toBeUndefined();
  });
});

describe('K5: graveyard and library', () => {
  it('Dreams of Laguna: surveil 1 then draw; flashback from the graveyard, then it is exiled', () => {
    let s = newGame();
    const dreams = put(s, 'P1', 'dreams-of-laguna', 'hand');
    mana(s, 'P1', { U: 2 });
    const top = s.players.P1!.library[0]!;
    const hand = s.players.P1!.hand.length;
    const first = actWithEvents(s, { type: 'CastSpell', player: 'P1', card: dreams });
    s = act(first.state, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toEqual({ kind: 'surveil', player: 'P1', card: top });
    s = act(s, { type: 'Surveil', player: 'P1', toGraveyard: true });
    expect(zone(s, top)).toBe('graveyard');
    expect(s.players.P1!.hand.length).toBe(hand); // cast one, drew one
    expect(zone(s, dreams)).toBe('graveyard');
    // Flashback {3}{U}.
    mana(s, 'P1', { U: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: dreams }).state;
    expect(zone(s, dreams)).toBe('exile');
  });

  it('Il Mheg Pixie surveils when it attacks', () => {
    let s = newGame();
    const pixie = put(s, 'P1', 'il-mheg-pixie');
    const top = s.players.P1!.library[0]!;
    s = fight(s, [{ attacker: pixie, defender: 'P2' }], {}, { surveilToGraveyard: true }).state;
    expect(zone(s, top)).toBe('graveyard');
    expect(s.players.P2!.life).toBe(18);
  });

  it('Evil Reawakened returns a creature card from your graveyard with two more counters', () => {
    let s = newGame();
    const dead = put(s, 'P1', 'seymour-flux', 'graveyard');
    put(s, 'P2', 'coeurl', 'graveyard');
    const spell = put(s, 'P1', 'evil-reawakened', 'hand');
    mana(s, 'P1', { B: 5 });
    const targets = spellOptions(s, 'P1').filter((o) => o.action.card === spell).map((o) => o.action.targets);
    expect(targets).toEqual([[card(dead)]]);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: spell, targets: [card(dead)] }).state;
    expect(zone(s, dead)).toBe('battlefield');
    expect(stats(s, dead)).toEqual([7, 7]);
  });

  it('Retrieve the Esper makes a 3/3 Robot, or a 5/5 when cast with flashback', () => {
    let s = newGame();
    const esper = put(s, 'P1', 'retrieve-the-esper', 'hand');
    mana(s, 'P1', { U: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: esper }).state;
    let robots = tokensOf(s, 'P1', 'robot-warrior-token');
    expect(robots.map((id) => stats(s, id))).toEqual([[3, 3]]);
    mana(s, 'P1', { U: 6 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: esper }).state;
    robots = tokensOf(s, 'P1', 'robot-warrior-token');
    expect(robots.map((id) => stats(s, id))).toEqual([
      [3, 3],
      [5, 5],
    ]);
    expect(zone(s, esper)).toBe('exile');
  });

  it('Cloudbound Moogle: a counter when it enters, and Plainscycling {2} from hand', () => {
    let s = newGame();
    put(s, 'P1', 'plains', 'library');
    const inHand = put(s, 'P1', 'cloudbound-moogle', 'hand');
    const target = put(s, 'P1', 'coeurl');
    mana(s, 'P1', { C: 2 });
    const cycle = abilityOptions(s, 'P1').find((o) => o.action.card === inHand)!;
    s = cast(s, cycle.action).state;
    expect(zone(s, inHand)).toBe('graveyard');
    expect(s.players.P1!.hand.map((id) => s.cards[id]!.defId)).toContain('plains');

    const moogle = put(s, 'P1', 'cloudbound-moogle', 'hand');
    mana(s, 'P1', { W: 5 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: moogle }, {
      targets: (opts) => opts.find((t) => t[0]!.kind === 'card' && t[0]!.card === target)!,
    }).state;
    expect(stats(s, target)).toEqual([3, 3]);
  });
});

describe('K6: the rest', () => {
  it('Coeurl taps a target nonenchantment creature for {1}{W}', () => {
    let s = newGame();
    const coeurl = put(s, 'P1', 'coeurl');
    const victim = put(s, 'P2', 'seymour-flux');
    mana(s, 'P1', { W: 2 });
    s = cast(s, { type: 'ActivateAbility', player: 'P1', card: coeurl, ability: 0, targets: [card(victim)] }).state;
    expect(s.cards[victim]!.tapped).toBe(true);
    expect(s.cards[coeurl]!.tapped).toBe(true);
    const fresh = put(s, 'P1', 'coeurl', 'battlefield', { summoningSick: true });
    mana(s, 'P1', { W: 2 });
    expect(rejected(s, { type: 'ActivateAbility', player: 'P1', card: fresh, ability: 0, targets: [card(victim)] })).toMatch(
      /summoning sickness/,
    );
  });

  it('Fate of the Sun-Cryst destroys a nonland permanent and costs {2} less aimed at a tapped creature', () => {
    let s = newGame();
    const tapped = put(s, 'P2', 'seymour-flux', 'battlefield', { tapped: true });
    const artifact = put(s, 'P2', 'magitek-scythe');
    put(s, 'P2', 'island');
    const fate = put(s, 'P1', 'fate-of-the-sun-cryst', 'hand');
    const costs = new Map(
      spellOptions(s, 'P1')
        .filter((o) => o.action.card === fate)
        .map((o) => [o.action.targets![0]!.kind === 'card' ? o.action.targets![0]!.card : '', formatManaCost(o.cost)]),
    );
    expect(costs.get(tapped)).toBe('{2}{W}');
    expect(costs.get(artifact)).toBe('{4}{W}');
    expect(costs.size).toBe(2); // the land isn't a legal target
    mana(s, 'P1', { W: 3 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: fate, targets: [card(tapped)] }).state;
    expect(zone(s, tapped)).toBe('graveyard');
  });

  it('Suplex: 3 damage, exiling the creature if it would die; or exile target artifact', () => {
    let s = newGame();
    const victim = put(s, 'P2', 'coeurl');
    const scythe = put(s, 'P2', 'magitek-scythe');
    const first = put(s, 'P1', 'suplex', 'hand');
    const second = put(s, 'P1', 'suplex', 'hand');
    mana(s, 'P1', { R: 4 });
    expect(rejected(s, { type: 'CastSpell', player: 'P1', card: first, targets: [card(victim)] })).toMatch(/Choose a mode/);
    s = cast(s, { type: 'CastSpell', player: 'P1', card: first, targets: [card(victim)], mode: 0 }).state;
    expect(zone(s, victim)).toBe('exile');
    s = cast(s, { type: 'CastSpell', player: 'P1', card: second, targets: [card(scythe)], mode: 1 }).state;
    expect(zone(s, scythe)).toBe('exile');
  });

  it('White Auracite exiles an opposing nonland permanent until it leaves, and taps for {W}', () => {
    let s = newGame();
    const auracite = put(s, 'P1', 'white-auracite', 'hand');
    const victim = put(s, 'P2', 'seymour-flux');
    mana(s, 'P1', { W: 4 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: auracite }).state;
    expect(zone(s, victim)).toBe('exile');
    s = act(s, { type: 'ActivateManaAbility', player: 'P1', card: auracite, mana: 'W' });
    expect(s.players.P1!.manaPool.W).toBe(1);
    const fate = put(s, 'P2', 'fate-of-the-sun-cryst', 'hand');
    mana(s, 'P2', { W: 5 });
    s.pending = { kind: 'priority', player: 'P2', passes: 0 };
    s = cast(s, { type: 'CastSpell', player: 'P2', card: fate, targets: [card(auracite)] }).state;
    expect(zone(s, victim)).toBe('battlefield');
    expect(s.cards[victim]!.controller).toBe('P2');
  });

  it('Lightning exiles your top card on combat damage, playable while you control Lightning', () => {
    let s = newGame();
    const lightning = put(s, 'P1', 'lightning-security-sergeant');
    const top = put(s, 'P1', 'coeurl', 'library');
    s = fight(s, [{ attacker: lightning, defender: 'P2' }]).state;
    expect(zone(s, top)).toBe('exile');
    s = goTo(s, 'main2');
    mana(s, 'P1', { W: 2 });
    expect(getLegalActions(s)).toContainEqual({ type: 'CastSpell', player: 'P1', card: top, targets: [] });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: top, targets: [] }).state;
    expect(zone(s, top)).toBe('battlefield');
  });

  it("Relm's Sketching copies a permanent; with two of a legend you choose which to keep", () => {
    let s = newGame();
    const theirs = put(s, 'P2', 'seymour-flux');
    const mine = put(s, 'P1', 'xande-dark-mage');
    const sketch = put(s, 'P1', 'relms-sketching', 'hand');
    const sketch2 = put(s, 'P1', 'relms-sketching', 'hand');
    mana(s, 'P1', { U: 8 });
    s = cast(s, { type: 'CastSpell', player: 'P1', card: sketch, targets: [card(theirs)] }).state;
    const copies = s.players.P1!.battlefield.filter((id) => s.cards[id]!.defId === 'seymour-flux');
    expect(copies).toHaveLength(1);
    expect(s.cards[copies[0]!]!.isToken).toBe(true);
    // Copying your own legend: you choose which one to keep.
    s.cards[mine]!.counters = 2;
    s = act(s, { type: 'CastSpell', player: 'P1', card: sketch2, targets: [card(mine)] });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    s = act(s, { type: 'PassPriority', player: 'P2' });
    expect(s.pending).toMatchObject({ kind: 'chooseLegend', player: 'P1', name: 'Xande, Dark Mage' });
    const pending = s.pending as Extract<GameState['pending'], { kind: 'chooseLegend' }>;
    const copy = pending.cards.find((id) => id !== mine)!;
    expect(pending.cards).toHaveLength(2);
    expect(getLegalActions(s)).toHaveLength(2);
    expect(rejected(s, { type: 'ChooseLegend', player: 'P1', keep: theirs })).toMatch(/Choose one/);
    // Keep the original, with its counters; the copy goes to the graveyard and ceases to exist.
    s = act(s, { type: 'ChooseLegend', player: 'P1', keep: mine });
    expect(zone(s, mine)).toBe('battlefield');
    expect(s.cards[mine]!.counters).toBe(2);
    expect(zone(s, copy)).toBe('void');
    expect(s.pending).toMatchObject({ kind: 'priority', player: 'P1' });
  });

  it('the AI keeps the legend with counters and Equipment', () => {
    let s = newGame();
    const plain = put(s, 'P2', 'xande-dark-mage');
    const strong = put(s, 'P2', 'xande-dark-mage', 'battlefield', { counters: 1 });
    put(s, 'P2', 'warriors-sword', 'battlefield', { attachedTo: strong });
    s = act(s, { type: 'PassPriority', player: 'P1' });
    expect(s.pending).toMatchObject({ kind: 'chooseLegend', player: 'P2' });
    const choice = basicAi()(s, getLegalActions(s));
    expect(choice).toEqual({ type: 'ChooseLegend', player: 'P2', keep: strong });
    s = act(s, choice);
    expect(zone(s, plain)).toBe('graveyard');
  });
});

describe('every kit card', () => {
  it('is fully built', () => {
    const s = newGame();
    const unbuilt = Object.values(s.cardDefs).filter((d) => d.notBuilt);
    expect(unbuilt.map((d) => d.name)).toEqual([]);
  });
});

void player;
