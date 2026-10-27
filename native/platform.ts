// The game's data and the StarHermit platform, on the runtime's modules:
// - the records (best board, wins, clean wins, the unfinished board) are the
//   game's save (starhermit:storage `saves`, schema 1): the browser build's
//   { v: 1, records } document on the device and in the player's cloud slot,
//   two devices' copies merged on a conflict (js/progress.js mergeDocs). The
//   slot the browser build wrote (the JS SDK's zipped save.json, key
//   game:<slug>) shows as foreign and is merged in and replaced once;
// - the browser build's per-player settings (gfx, audio.options, ui.language,
//   graphics.gpu.*) are now the runtime's Options and are removed;
// - the player's name and avatar, the invite link, and posting a fresh
//   board's solve time to the fastest-clear board through score-script.js (a
//   practice session whose socket carries { type: 'result', scores }, as the
//   JS SDK's submitScores did; score-script.js range-checks it and writes
//   the board) with the player's rank read back.
import type { JsonValue } from "starhermit:engine";
import type { ImageBitmap } from "starhermit:canvas";
import {
  avatar as fetchAvatar, connectGame, inviteLink as fetchInviteLink, leaderboards, onPlayerChange, player, sessions,
} from "starhermit:platform";
import { saves, settings as store, storage } from "starhermit:storage";
import { Progress as P, type Doc, type Records } from "./classic.ts";

// --- the save ------------------------------------------------------------------------------
let doc: Doc = { v: 1, records: P.emptyRecords() };
let lastSavedAt = 0;
const docListeners = new Set<() => void>();
/** fn() after records from the account (another device, the browser build) were merged in. */
export function onRecordsMerged(fn: () => void): void { docListeners.add(fn); }
function merged(): void { for (const fn of docListeners) fn(); }

export function records(): Records { return doc.records; }
/** Writes the save (device at once, the account debounced by the runtime). */
export function persist(): void {
  try { saves.save(doc as unknown as JsonValue, { schema: 1 }); }
  catch (e) { console.warn(`save: ${String(e)}`); }
}

/** Takes another document's records in (merged with this device's); whether they changed. */
function adopt(other: Doc | null): boolean {
  if (!other) return false;
  const next = P.mergeDocs(doc, other);
  if (P.sameRecords(next.records, doc.records)) return false;
  doc = next;
  return true;
}

saves.onConflict((local, remote) => ({ merged: P.mergeDocs(local?.data, remote.data) as unknown as JsonValue }));
saves.onStatus((_status, state) => {
  if (state === "foreign") { migrateForeign(); return; }
  // The account's save replaced the device's (another device saved last): merge it in.
  const cur = saves.load();
  if (cur && cur.savedAt !== lastSavedAt) {
    lastSavedAt = cur.savedAt;
    if (adopt(P.docFromSave(cur.data))) { persist(); merged(); }
  }
});

/** The browser build's cloud save: merged with this device's records, saved over it once. */
function migrateForeign(): void {
  const old = saves.foreign();
  if (!old) return;
  const changed = adopt(P.fromBrowserSave(old.text));
  try { saves.save(doc as unknown as JsonValue, { schema: 1, replaceForeign: true }); }
  catch (e) { console.warn(`save migration: ${String(e)}`); }
  if (changed) merged();
}
export function flush(): void { void saves.flush().catch(() => undefined); }

/** The HUD's Sync cell, as the browser build named its states. */
export type SyncKey = "syncLocal" | "syncLoading" | "syncSaving" | "syncSynced" | "syncOffline" | "syncError";
export function syncState(): SyncKey {
  if (!player()) return "syncLocal";
  try {
    const st = saves.state();
    if (st === "error") return "syncError";
    if (st === "read-blocked") return "syncOffline";
    if (st === "loading") return "syncLoading";
    if (st === "uploading" || st === "foreign" || saves.status() === "pending") return "syncSaving";
    return "syncSynced";
  } catch { return "syncError"; }
}

// --- the browser build's settings ----------------------------------------------------------
const LEGACY = new Set(["gfx", "audio.options", "ui.language"]);
export function isBrowserSettingKey(key: string): boolean {
  return LEGACY.has(key) || key.startsWith("graphics.gpu.") || /^[a-z-]+\.graphics\.gpu\./.test(key);
}
function dropLegacy(): void {
  const keys = store.legacyKeys();
  if (!keys) return;
  for (const key of keys) if (isBrowserSettingKey(key)) { try { store.removeLegacy(key); } catch { /* next start */ } }
}

/** Reads the device's save (from onStart). */
export function initPlatform(): void {
  const cur = saves.load();
  lastSavedAt = cur?.savedAt ?? 0;
  const d = P.docFromSave(cur?.data);
  if (d) doc = d;
  store.onLegacy(dropLegacy);
  dropLegacy();
  if (saves.state() === "foreign") migrateForeign();
  wasSignedIn = !!player();
  refreshPlayer();
}

// --- the player ----------------------------------------------------------------------------
export function signedIn(): boolean { return !!player(); }
/** The HUD's player name: the account's display name, else "Player" and the id's start. */
export function displayName(): string {
  const p = player();
  if (!p) return "";
  return p.displayName || `Player ${String(p.userId).slice(0, 6)}`;
}
let invite: string | null = null;
let face: ImageBitmap | null = null;
/** The invite link, fetched ahead so a button press can copy it at once. */
export function inviteLink(): string | null { return player() ? invite : null; }
/** The player's avatar once fetched (drawn beside the name), else null. */
export function avatarImage(): ImageBitmap | null { return player() ? face : null; }
function refreshPlayer(): void {
  invite = null;
  face = null;
  const p = player();
  if (!p) return;
  fetchInviteLink().then((u) => { invite = u; }, () => { invite = null; });
  fetchAvatar(p.userId).then((b) => { face = b; }, () => { face = null; });
  void fastestBoard().catch(() => null);
}
let wasSignedIn = false;
let signedOutCb: (() => void) | null = null;
/** fn() when the player signs out during the run (the "signed out" toast). */
export function onSignedOut(fn: () => void): void { signedOutCb = fn; }
onPlayerChange(() => {
  const now = !!player();
  if (wasSignedIn && !now && signedOutCb) signedOutCb();
  wasSignedIn = now;
  refreshPlayer();
});

// --- the StarHermit fastest-clear board -------------------------------------------------------
const BOARD_KEY = "hollowfeast.board-id";
const SCORE_KEY = "fastest-clear";
let boardId: string | null = null;
/** The board's id: listed signed in, then kept on the device. */
async function fastestBoard(): Promise<string | null> {
  if (boardId) return boardId;
  if (player()) {
    try {
      const list = await leaderboards.list();
      const b = list.find((x) => x.key === SCORE_KEY) ?? list[0];
      if (b) { boardId = b.id; try { storage.set(BOARD_KEY, b.id); } catch { /* full */ } }
    } catch { /* offline */ }
  }
  if (!boardId) { try { boardId = storage.getText(BOARD_KEY); } catch { boardId = null; } }
  return boardId;
}

/** Signed in only: post a fresh board's solve time (ms) through score-script.js; { posted, rank }. Never rejects. */
export async function postSolveTime(ms: number): Promise<{ posted: boolean; rank: number | null }> {
  const me = player();
  if (!me) return { posted: false, rank: null };
  const score = Math.max(1, Math.round(ms));
  let accepted: string[] = [];
  try {
    const sessionId = await sessions.practice();
    accepted = await new Promise<string[]>((resolve) => {
      const socket = connectGame(sessionId);
      let done = false;
      const finish = (list: string[]): void => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        socket.close();
        resolve(list);
      };
      const timer = setTimeout(() => finish([]), 15000);
      socket.on("open", () => { socket.sendCommand({ type: "result", scores: { [SCORE_KEY]: score } }); });
      socket.on("game", (data) => {
        const d = data as { type?: string; accepted?: string[] } | null;
        if (d && d.type === "result-ack") finish(Array.isArray(d.accepted) ? d.accepted : []);
      });
      socket.on("error", () => finish([]));
      socket.on("stopped", () => finish([]));
      socket.on("abandoned", () => finish([]));
    });
  } catch { return { posted: false, rank: null }; }
  if (!accepted.includes(SCORE_KEY)) return { posted: false, rank: null };
  try {
    const id = await fastestBoard();
    if (!id) return { posted: true, rank: null };
    const r = await leaderboards.entries(id, { pageSize: 100 });
    const mine = r.items.find((e) => e.userId === me.userId);
    return { posted: true, rank: mine ? mine.rank : null };
  } catch { return { posted: true, rank: null }; }
}
