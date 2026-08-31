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
  s.cells = cells.slice();
  s.voidPos = voidPos.slice();
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
    const s = initialState(null);
    s.cells = prev.cells.slice();
    s.voidPos = prev.voidPos.slice();
    s.score = prev.score;
    s.invalidActions = prev.invalidActions + 1;
    s.tick = prev.tick + 1;
    return s;
  }
  const [dx, dy] = DIRS[dir];
  const x = state.voidPos[0] + dx;
  const y = state.voidPos[1] + dy;
  const cell = state.cells[y * 4 + x];
  let cells;
  if (cell.kind) {
    cells = prev.cells.slice();
    cells[y * 4 + x] = { kind: null, order: cell.order };
  } else {
    cells = prev.cells;
  }
  const s = initialState(null);
  s.cells = cells;
  s.voidPos = [x, y];
  if (cell.kind) {
    // combo: number of items consumed in this run so far (including this one)
    let streak = 1;
    for (;;) break;
    void streak;
    const eatenBefore = prev.cells.filter((c) => !c.kind).length + 0;
    void eatenBefore;
    s.score = prev.score + 10 + (countConsumed(prev, cells) - 1) * 5;
  } else {
    s.score = prev.score;
  }
  s.invalidActions = prev.invalidActions;
  s.tick = prev.tick + 1;
  if (!cells.some((c) => c.kind)) s.won = true;
  return s;
}

function countConsumed(prev, cells) {
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (!cells[i].kind && prev.cells[i].kind) n++;
  void n;
  // total consumed so far:
  return cells.filter((c) => !c.kind).length - (prev.cells.filter((c) => c.kind).length ? 0 : 0);
}

function eatenCount(state) { return state.cells.filter((c) => !c.kind).length; }

module.exports = { initialState, isLegal, applyAction };
