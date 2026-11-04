// Card audit: every built card's targets and choices compared with its Oracle
// text, and every card grouped by the engine features it uses. Writes
// docs/card-audit-generated.md. Run: node packages/cards/scripts/card-audit.ts
// The flags are heuristics (counts of "target" and "you may"); docs/card-audit.md
// records which ones are real and which are false positives.
import fs from 'fs';
const { CARD_DEFS } = await import('../src/index.ts');
const CHOSEN = ['AnyTarget','OpponentCreature','TargetCreature','TargetOpponent','TargetPlayer','TargetPermanent','TargetCardInGraveyard','TargetAbility','TargetSpellOrAbility','TargetSpell','TargetSpellPermanentOrGraveyardCard','TargetCardExiledWithSource'];
const sf = JSON.parse(fs.readFileSync(new URL('../data/scryfall.json', import.meta.url), 'utf8'));
const byId: Record<string, any> = sf.cards ?? sf;
const byName = new Map<string, any>(); for (const x of Object.values(byId) as any[]) byName.set(x.name, x);
const flags: { tooManyTargets: string[]; missingTargets: string[]; optionalFirst: string[]; youMayNotOptional: string[] } = { tooManyTargets: [], missingTargets: [], optionalFirst: [], youMayNotOptional: [] };
const effectGroups: Record<string, Set<string>> = {};
let total = 0;
for (const c of Object.values(CARD_DEFS) as any[]) {
  if (c.notBuilt || c.token || c.uncastable) continue;
  const sc = byId[c.id] ?? byName.get(c.name);
  if (!sc) continue;
  total++;
  // Oracle without reminder text.
  const oracle: string = (sc.oracleText ?? '').replace(/\([^)]*\)/g, '');
  const set = c.printing?.set ?? '?';
  const label = `${c.name} (${set})`;
  const abilities: [string, any[], any][] = [];
  const add = (d: any, p: string) => {
    (d.triggers ?? []).forEach((t: any, i: number) => abilities.push([`${p}trigger ${t.when}`, t.effects ?? [], t]));
    (d.activated ?? []).forEach((a: any, i: number) => abilities.push([`${p}activated ${i}`, a.effects ?? [], a]));
    if (d.effects) abilities.push([`${p}spell`, d.effects, d]);
    if (d.adventure) abilities.push([`${p}adventure`, d.adventure.effects, d.adventure]);
    if (d.alternativeCost?.effects) abilities.push([`${p}alt cost`, d.alternativeCost.effects, d.alternativeCost]);
    if (Array.isArray(d.modes)) d.modes.forEach((m: any, i: number) => abilities.push([`${p}mode ${i}`, Array.isArray(m) ? m : m.effects ?? [], m]));
    if (d.statics) for (const st of d.statics) for (const k of Object.keys(st)) if (k !== 'affects' && k !== 'filter') (effectGroups[`static:${k}`] ??= new Set()).add(label);
  };
  add(c, ''); if (c.backFace) add(c.backFace, 'back ');
  let chosenTotal = 0, optionalAny = false;
  for (const [where, effects, holder] of abilities) {
    for (const e of effects) (effectGroups[e.effect] ??= new Set()).add(label);
    if (holder.when) (effectGroups[`trigger:${holder.when}`] ??= new Set()).add(label);
    const chosen = effects.map((e: any, i: number) => ({ e, i })).filter(({ e }: any) => CHOSEN.includes(e.target));
    const groups = new Set(chosen.map(({ e, i }: any) => e.group ?? `#${i}`));
    chosenTotal += groups.size;
    if (holder.optional || effects.some((e: any) => e.optional || e.upTo || e.anyNumber || e.upToChoice) || holder.cost) optionalAny = true;
    const first = chosen.findIndex(({ e }: any) => !e.upTo);
    if (first > 0) flags.optionalFirst.push(`${label} — ${where}`);
  }
  if (c.chooseModes || c.modes) optionalAny = true;
  const words = (oracle.match(/\btargets?\b/gi) ?? []).length;
  const modal = !!(c.modes || c.chooseModes);
  if (!modal && chosenTotal > words && !/for each opponent/i.test(oracle)) flags.tooManyTargets.push(`${label} — asks ${chosenTotal}, text says "target" ${words}x`);
  if (!modal && words > chosenTotal && !/\bwould target\b|\bbecomes the target\b|\btargets? (you|it|this)\b|\bthat targets\b|can't be the target/i.test(oracle)) flags.missingTargets.push(`${label} — text says "target" ${words}x, asks ${chosenTotal}`);
  if (/\byou may\b/i.test(oracle) && !optionalAny && !/you may (play|cast|look|spend|have)|you may activate|you may choose new targets/i.test(oracle)) flags.youMayNotOptional.push(label);
}
const lines: string[] = [`# Card audit: ${total} built cards\n`];
for (const [k, v] of Object.entries(flags)) lines.push(`## ${k} (${v.length})\n${v.map((x) => `- ${x}`).join('\n')}\n`);
lines.push('## Cards grouped by engine feature\n');
for (const [k, v] of Object.entries(effectGroups).sort((a, b) => b[1].size - a[1].size)) lines.push(`- **${k}** (${v.size}): ${[...v].sort().join(', ')}`);
fs.writeFileSync(new URL('../../../docs/card-audit-generated.md', import.meta.url), lines.join('\n') + '\n');
for (const [k, v] of Object.entries(flags)) console.log(k, v.length);
console.log('total', total, 'feature groups', Object.keys(effectGroups).length);
