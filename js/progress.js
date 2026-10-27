'use strict';

/*
 * Hollow Feast save document and round bookkeeping (pure: no engine, no DOM).
 *
 * The save is one JSON document { v: 1, records } — the browser build's
 * js/platform.js shape, so the browser build's cloud save (the JS SDK's
 * save.json in the game:<slug> slot) reads unchanged:
 *   records.best        { score, refusals, ticks, when } — the best finished board
 *                        (score, then fewer refusals, then fewer ticks)
 *   records.wins        finished boards
 *   records.cleanWins   finished boards without a refusal
 *   records.inProgress  the unfinished board ({ tick, score, invalidActions, won,
 *                        cells, voidPos }), resumed at the next start
 * Loaded as a classic script by the engine client (native/classic.ts) and
 * required by the node tests.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HFProgress = factory();
})(globalThis, function () {
  // The shipped board: 12 numbered morsels in a solvable snake, column x=3
  // empty, the void starting at (3,0) next to morsel 1.
  //   y=0:  3  2  1  .
  //   y=1:  4  5  6  .
  //   y=2:  9  8  7  .
  //   y=3: 10 11 12  .
  var ORDER = [3, 2, 1, 0, 4, 5, 6, 0, 9, 8, 7, 0, 10, 11, 12, 0];
  var START = [3, 0];

  function num(v) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : 0; }

  function sanitizeRecords(rec) {
    var r = rec && typeof rec === 'object' ? rec : {};
    var best = r.best && typeof r.best === 'object' && typeof r.best.score === 'number'
      ? { score: num(r.best.score), refusals: num(r.best.refusals), ticks: num(r.best.ticks), when: num(r.best.when) }
      : null;
    var ip = r.inProgress && typeof r.inProgress === 'object' && Array.isArray(r.inProgress.cells) && r.inProgress.cells.length === 16
      ? r.inProgress
      : null;
    return { best: best, wins: num(r.wins), cleanWins: num(r.cleanWins), inProgress: ip };
  }

  function emptyRecords() { return sanitizeRecords(null); }

  /** The better of two best lines by the §4 tie-breaks (score, fewer refusals, fewer ticks). */
  function better(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    if (b.score !== a.score) return b.score > a.score ? b : a;
    if (b.refusals !== a.refusals) return b.refusals < a.refusals ? b : a;
    if (b.ticks !== a.ticks) return b.ticks < a.ticks ? b : a;
    return a;
  }

  /** Two devices' records: the better best line, the larger counters, and the
   * local unfinished board (else the remote one). */
  function mergeRecords(remote, local) {
    var a = sanitizeRecords(remote), b = sanitizeRecords(local);
    return {
      best: better(a.best, b.best),
      wins: Math.max(a.wins, b.wins),
      cleanWins: Math.max(a.cleanWins, b.cleanWins),
      inProgress: b.inProgress || a.inProgress,
    };
  }

  /** A save's data as the document, or null when it is not one. */
  function docFromSave(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { v: 1, records: sanitizeRecords(data.records) };
  }

  /** The browser build's cloud save text (its save.json), or null. */
  function fromBrowserSave(text) {
    var raw = null;
    try { raw = typeof text === 'string' ? JSON.parse(text) : null; } catch (e) { raw = null; }
    return docFromSave(raw);
  }

  function mergeDocs(a, b) {
    var da = docFromSave(a), db = docFromSave(b);
    return { v: 1, records: mergeRecords(db ? db.records : null, da ? da.records : null) };
  }

  function sameRecords(a, b) { return JSON.stringify(sanitizeRecords(a)) === JSON.stringify(sanitizeRecords(b)); }

  // -- rounds ------------------------------------------------------------------------------
  function freshState(rules) {
    var cells = [];
    for (var i = 0; i < 16; i++) cells.push(ORDER[i] ? { kind: 'item', order: ORDER[i] } : { kind: null, order: null });
    return rules.initialState(null, cells, START);
  }

  /** The unfinished board kept in the save. */
  function progressSummary(s) {
    return { tick: s.tick, score: s.score, invalidActions: s.invalidActions, won: !!s.won, cells: s.cells, voidPos: s.voidPos };
  }

  /** A saved unfinished board as a rules state, or null (finished, empty or malformed). */
  function reviveState(rules, summary) {
    try {
      if (!summary || summary.won) return null;
      if (!Array.isArray(summary.cells) || summary.cells.length !== 16) return null;
      var cells = summary.cells.map(function (c) {
        if (!c || typeof c !== 'object') throw new Error('bad cell');
        return { kind: c.kind === 'item' ? 'item' : null, order: typeof c.order === 'number' ? c.order : null };
      });
      if (!cells.some(function (c) { return c.kind; })) return null;
      var vp = Array.isArray(summary.voidPos) && summary.voidPos.length === 2 ? summary.voidPos : START;
      var s = rules.initialState(null, cells, vp);
      s.score = typeof summary.score === 'number' ? summary.score : 0;
      s.invalidActions = typeof summary.invalidActions === 'number' ? summary.invalidActions : 0;
      s.tick = typeof summary.tick === 'number' ? summary.tick : 0;
      return s;
    } catch (e) { return null; }
  }

  /** Records a finished board (wins, clean wins, the best line); clears the unfinished board. */
  function recordWin(records, finalState, now) {
    records.wins = (records.wins || 0) + 1;
    if (finalState.invalidActions === 0) records.cleanWins = (records.cleanWins || 0) + 1;
    var candidate = { score: finalState.score, refusals: finalState.invalidActions, ticks: finalState.tick, when: num(now) };
    var best = records.best;
    if (!best
      || candidate.score > best.score
      || (candidate.score === best.score && candidate.refusals < best.refusals)
      || (candidate.score === best.score && candidate.refusals === best.refusals && candidate.ticks < best.ticks)) {
      records.best = candidate;
    }
    records.inProgress = null;
    return records;
  }

  /** The HUD's Best cell: "score · refusals R · ticks T", or an em dash. */
  function bestLine(best) { return best ? best.score + ' · ' + best.refusals + 'R · ' + best.ticks + 'T' : '—'; }

  /** Morsels eaten so far. */
  function eaten(s) { return s.cells.filter(function (c) { return !c.kind && c.order != null; }).length; }

  /** Which refusal an illegal move was: leaving the board ('invalid') or the wrong morsel ('wrong-order'). */
  function refusalKind(prev, dir) {
    var d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    if (!d) return 'invalid';
    var x = prev.voidPos[0] + d[0], y = prev.voidPos[1] + d[1];
    return x < 0 || x > 3 || y < 0 || y > 3 ? 'invalid' : 'wrong-order';
  }

  return {
    ORDER: ORDER, START: START,
    sanitizeRecords: sanitizeRecords, emptyRecords: emptyRecords, mergeRecords: mergeRecords, mergeDocs: mergeDocs,
    docFromSave: docFromSave, fromBrowserSave: fromBrowserSave, sameRecords: sameRecords,
    freshState: freshState, progressSummary: progressSummary, reviveState: reviveState, recordWin: recordWin,
    bestLine: bestLine, eaten: eaten, refusalKind: refusalKind,
  };
});
