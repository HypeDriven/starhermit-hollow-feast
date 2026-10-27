// The game's pure scripts, shared with the node tests: the rules (rules.js,
// unchanged from the browser build), the save document and round bookkeeping
// (js/progress.js) and the string tables (js/strings.js), evaluated as
// classic scripts that leave their API on globalThis.
import { loadClassic } from "starhermit:script";

for (const f of ["rules.js", "js/progress.js", "js/strings.js"]) loadClassic(f);

export type Dir = "left" | "right" | "up" | "down";
export interface Cell { kind: "item" | null; order: number | null }
export interface State {
  seed?: number; cells: Cell[]; voidPos: [number, number]; score: number; invalidActions: number; tick: number; won: boolean;
}
export interface Best { score: number; refusals: number; ticks: number; when: number }
export interface Records { best: Best | null; wins: number; cleanWins: number; inProgress: unknown }
export interface Doc { v: 1; records: Records }

interface RulesApi {
  initialState(seed: number | null, cells: Cell[], voidPos: [number, number]): State;
  isLegal(s: State, dir: Dir): boolean;
  applyAction(s: State, dir: Dir): State;
}
interface ProgressApi {
  ORDER: number[];
  emptyRecords(): Records;
  sanitizeRecords(r: unknown): Records;
  mergeDocs(a: unknown, b: unknown): Doc;
  docFromSave(data: unknown): Doc | null;
  fromBrowserSave(text: string | null): Doc | null;
  sameRecords(a: unknown, b: unknown): boolean;
  freshState(rules: RulesApi): State;
  progressSummary(s: State): unknown;
  reviveState(rules: RulesApi, summary: unknown): State | null;
  recordWin(records: Records, s: State, now: number): Records;
  bestLine(best: Best | null): string;
  eaten(s: State): number;
  refusalKind(prev: State, dir: Dir): "invalid" | "wrong-order";
}
interface StringsApi {
  LOCALES: string[];
  STRINGS: Record<string, Record<string, string>>;
  t(locale: string, key: string, vars?: Record<string, string | number> | null): string;
}
const g = globalThis as unknown as { HFRules: RulesApi; HFProgress: ProgressApi; HFStrings: StringsApi };
export const Rules = g.HFRules;
export const Progress = g.HFProgress;
export const Strings = g.HFStrings;
