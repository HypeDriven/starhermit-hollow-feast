'use strict';

const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function initialState(seed, cells, voidPos) {
  const s = {};
  if (seed !== undefined && seed !== null) s.seed = seed;
  s.cells = (cells || []).slice();
  s.voidPos = (voidPos || [0, 0]).slice();
  s.score = 0;
  s.invalidActions = 0;
  s.tick = 0;
  s.won = false;
  return s;
}

function isLegal(state, dir) {
  const [dx, dy] = DIRS[dir];
  const x = state.voidPos[0] + dx;
  const y = state.voidPos[1] + dy;
  if (x < 0 || x > 3 || y < 0 || y > 3) return false;
  const cell = state.cells[y * 4 + x];
  if (!cell.kind) return true;
  return cell.order === eatenCount(state) + 1;
}

function applyAction(prev, dir) {
  if (prev.won || !isLegal(prev, dir)) {
    const s = initialState(null, prev.cells, prev.voidPos);
    s.score = prev.score;
    s.invalidActions = prev.invalidActions + 1;
    s.tick = prev.tick + 1;
    return s;
  }
  const [dx, dy] = DIRS[dir];
  const x = prev.voidPos[0] + dx;
  const y = prev.voidPos[1] + dy;
  const cell = prev.cells[y * 4 + x];
  let cells;
  if (cell.kind) {
    cells = prev.cells.slice();
    cells[y * 4 + x] = { kind: null, order: cell.order };
  } else {
    cells = prev.cells;
  }
  const s = initialState(null, cells, [x, y]);
  if (cell.kind) {
    // combo: number of items consumed so far (including this one)
    s.score = prev.score + 10 + (countConsumed(cells) - 1) * 5;
  } else {
    s.score = prev.score;
  }
  s.invalidActions = prev.invalidActions;
  s.tick = prev.tick + 1;
  if (!cells.some((c) => c.kind)) s.won = true;
  return s;
}

// Total items consumed so far: cells that held an item (order != null)
// whose kind has been cleared.
function countConsumed(cells) {
  return cells.filter((c) => !c.kind && c.order != null).length;
}

function eatenCount(state) { return countConsumed(state.cells); }

const api = { initialState, isLegal, applyAction };
if (typeof window !== 'undefined') window.__hf_rules = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
