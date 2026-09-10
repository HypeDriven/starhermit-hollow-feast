/**
 * Hollow Feast — rules unit tests (dev only, not shipped).
 *
 * Covers the rules contract in rules.js: legality (bounds and eat order),
 * scoring, the invalid-action counter, tick monotonicity, immutability of the
 * previous state, and the terminal win state.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const rules = createRequire(import.meta.url)('../rules.js');

// Shipped layout: void starts at (3,0); column x=3 is empty.
//   y=0:  3  2  1  .
//   y=1:  4  5  6  .
//   y=2:  9  8  7  .
//   y=3: 10 11 12  .
const ORDER = [3, 2, 1, 0, 4, 5, 6, 0, 9, 8, 7, 0, 10, 11, 12, 0];
const SOLUTION = ['left', 'left', 'left', 'down', 'right', 'right', 'down', 'left', 'left', 'down', 'right', 'right'];

const fresh = () =>
  rules.initialState(1, ORDER.map((o) => (o ? { kind: 'item', order: o } : { kind: null, order: null })), [3, 0]);

test('initial state is a clean 4x4 board with 12 morsels', () => {
  const s = fresh();
  assert.equal(s.cells.length, 16);
  assert.equal(s.cells.filter((c) => c.kind).length, 12);
  assert.deepEqual(s.voidPos, [3, 0]);
  assert.equal(s.score, 0);
  assert.equal(s.invalidActions, 0);
  assert.equal(s.tick, 0);
  assert.equal(s.won, false);
});

test('moves off the board are illegal', () => {
  const s = fresh();
  assert.equal(rules.isLegal(s, 'up'), false);
  assert.equal(rules.isLegal(s, 'right'), false);
  assert.equal(rules.isLegal(s, 'left'), true);
  assert.equal(rules.isLegal(s, 'down'), true);
});

test('a morsel is only edible when it is next in the order', () => {
  const s = fresh();
  // (3,0) -> down reaches the empty cell (3,1); from there left is morsel 6.
  const down = rules.applyAction(s, 'down');
  assert.equal(rules.isLegal(down, 'left'), false, 'morsel 6 is not next while 1 is uneaten');
  assert.equal(rules.isLegal(s, 'left'), true, 'morsel 1 is next');
});

test('an illegal action costs a tick and an invalid count, never a move', () => {
  const s = fresh();
  const after = rules.applyAction(s, 'up');
  assert.deepEqual(after.voidPos, s.voidPos);
  assert.equal(after.invalidActions, 1);
  assert.equal(after.tick, 1);
  assert.equal(after.score, 0);
});

test('the previous state is never mutated', () => {
  const s = fresh();
  const before = JSON.stringify(s);
  rules.applyAction(s, 'left');
  rules.applyAction(s, 'up');
  assert.equal(JSON.stringify(s), before);
});

test('scoring is 10 for the first morsel and +5 per morsel thereafter', () => {
  let s = fresh();
  const expected = (n) => 10 * n + (5 * n * (n - 1)) / 2;
  for (let i = 0; i < SOLUTION.length; i++) {
    s = rules.applyAction(s, SOLUTION[i]);
    assert.equal(s.score, expected(i + 1), `after ${i + 1} morsels`);
    assert.equal(s.tick, i + 1);
  }
  assert.equal(s.score, 450);
});

test('moving onto an already-eaten cell is legal and scores nothing', () => {
  let s = rules.applyAction(fresh(), 'left'); // eats morsel 1 at (2,0)
  const score = s.score;
  s = rules.applyAction(s, 'right'); // back onto the now-empty (3,0)
  assert.equal(s.score, score);
  assert.equal(s.invalidActions, 0);
  assert.deepEqual(s.voidPos, [3, 0]);
});

test('clearing every morsel is terminal and stays terminal', () => {
  let s = fresh();
  for (const d of SOLUTION) s = rules.applyAction(s, d);
  assert.equal(s.won, true);
  assert.equal(s.cells.some((c) => c.kind), false);
  const pos = s.voidPos.slice();
  const after = rules.applyAction(rules.applyAction(s, 'up'), 'left');
  assert.equal(after.won, true);
  assert.deepEqual(after.voidPos, pos);
  assert.equal(after.score, s.score);
  assert.equal(after.invalidActions, s.invalidActions + 2);
});
