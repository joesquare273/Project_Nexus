// The sets a draft can be held with: the host picks one when making the
// event (user decision 2026-11-03; prizes may depend on it). Each opens that
// set's real Play Boosters (draft.ts). Only sets whose cards and images are
// imported are listed. Kept apart from draft.ts so pages can list the sets
// without loading the print sheets.

export const DRAFT_SETS = [{ code: 'fin', name: 'Final Fantasy', booster: 'Final Fantasy Play Booster', icon: 'https://svgs.scryfall.io/sets/fin.svg' }] as const;
export type DraftSetCode = (typeof DRAFT_SETS)[number]['code'];
export const DRAFT_SET_CODES = DRAFT_SETS.map((s) => s.code) as [DraftSetCode, ...DraftSetCode[]];

export function draftSet(code: string): (typeof DRAFT_SETS)[number] | undefined {
  return DRAFT_SETS.find((s) => s.code === code);
}
