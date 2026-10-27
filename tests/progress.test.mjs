/**
 * Hollow Feast — save document and round bookkeeping tests (js/progress.js):
 * the browser build's cloud save (its save.json) read as the engine save,
 * sanitizing, two devices' merge, wins and the best line's tie-breaks, and
 * the unfinished board's round trip.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const R = require('../rules.js');
const P = require('../js/progress.js');
const SOLUTION = ['left', 'left', 'left', 'down', 'right', 'right', 'down', 'left', 'left', 'down', 'right', 'right'];
const plain = (v) => JSON.parse(JSON.stringify(v));

test('the browser build\'s cloud save text reads as the save document', () => {
  // As js/platform.js saved it through the JS SDK's saveJSON (save.json in the zip slot).
  const text = JSON.stringify({ v: 1, records: { best: { score: 450, refusals: 0, ticks: 12, when: 1760000000000 }, wins: 3, cleanWins: 2, inProgress: null } });
  const doc = P.fromBrowserSave(text);
  assert.deepEqual(plain(doc), { v: 1, records: { best: { score: 450, refusals: 0, ticks: 12, when: 1760000000000 }, wins: 3, cleanWins: 2, inProgress: null } });
  assert.equal(P.fromBrowserSave('not json'), null);
  assert.equal(P.fromBrowserSave(null), null);
  assert.equal(P.docFromSave([1, 2]), null);
});

test('sanitizing drops malformed fields', () => {
  const r = P.sanitizeRecords({ best: { score: 'x' }, wins: -4, cleanWins: 2.7, inProgress: { cells: [1, 2] } });
  assert.deepEqual(plain(r), { best: null, wins: 0, cleanWins: 2, inProgress: null });
});

test('two devices merge: better best by score, refusals, ticks; larger counters; local board', () => {
  const remote = { v: 1, records: { best: { score: 450, refusals: 1, ticks: 13, when: 1 }, wins: 5, cleanWins: 1, inProgress: null } };
  const local = { v: 1, records: { best: { score: 450, refusals: 0, ticks: 12, when: 2 }, wins: 2, cleanWins: 2, inProgress: P.progressSummary(P.freshState(R)) } };
  const m = P.mergeDocs(local, remote);
  assert.equal(m.records.best.refusals, 0);
  assert.equal(m.records.wins, 5);
  assert.equal(m.records.cleanWins, 2);
  assert.ok(m.records.inProgress);
});

test('a finished board records a win, the best line and clears the unfinished board', () => {
  let s = R.applyAction(P.freshState(R), 'up'); // one refusal
  for (const d of SOLUTION) s = R.applyAction(s, d);
  assert.equal(s.won, true);
  const rec = P.emptyRecords();
  rec.inProgress = { cells: [] };
  P.recordWin(rec, s, 5);
  assert.deepEqual(plain(rec.best), { score: 450, refusals: 1, ticks: 13, when: 5 });
  assert.equal(rec.wins, 1);
  assert.equal(rec.cleanWins, 0);
  assert.equal(rec.inProgress, null);
  assert.equal(P.bestLine(rec.best), '450 · 1R · 13T');
  let clean = P.freshState(R);
  for (const d of SOLUTION) clean = R.applyAction(clean, d);
  P.recordWin(rec, clean, 6);
  assert.equal(rec.best.refusals, 0, 'fewer refusals win the tie');
  assert.equal(rec.cleanWins, 1);
  assert.equal(P.bestLine(null), '—');
});

test('the unfinished board survives the save round trip', () => {
  let s = P.freshState(R);
  for (const d of SOLUTION.slice(0, 5)) s = R.applyAction(s, d);
  const back = P.reviveState(R, plain(P.progressSummary(s)));
  assert.deepEqual(plain(back), plain(s));
  assert.equal(P.eaten(back), 5);
  assert.equal(P.reviveState(R, { won: true, cells: s.cells }), null);
  assert.equal(P.reviveState(R, { cells: [] }), null);
});

test('refusal kinds: off the board vs. the wrong morsel', () => {
  const s = P.freshState(R);
  assert.equal(P.refusalKind(s, 'up'), 'invalid');
  const d = R.applyAction(s, 'down');
  assert.equal(P.refusalKind(d, 'left'), 'wrong-order');
});
