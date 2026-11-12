import { localizedStyle as __l10nStyle } from "./l10n/font.ts";
import { withLanguageRender as __l10nRender } from "./l10n/menu.ts";
// localization-runtime:attached
import { openLocalizedOptions as __l10nOptions } from "./l10n/menu.ts";
// Hollow Feast on the StarHermit engine: the entry module (starhermit.txt
// engine.entry), played natively by the StarHermit client and in browsers by
// the engine's web runtime. The rules are the browser build's rules.js,
// unchanged; this module is what its game.js did around them — the board
// state, moves and restarts by keys, pads and the control buttons, the
// sounds of each outcome, the records (best line, wins, the unfinished board
// resumed at the next start), the solve timer and the fastest-clear posting
// — and the page around the board as starhermit:ui: the header (title,
// subtitle, how-to line with rebound keys appended), the playfield, the
// HUD (Score, Eaten, Player, Best, Sync), the control bar (← ↑ ↓ → ↻ ⚙), the
// win banner with its leaderboard line, the Settings dialog (account and the
// runtime's Options) and the toast. The board is drawn by render.ts.
import "./classic.ts";
import { clipboard, frame, levelSettings, onPreferencesChange, onRender, onStart, onSuspend, onUpdate, preferences } from "starhermit:engine";
import { bindings, onAction, onBindingsChange } from "starhermit:input";
import * as draw from "starhermit:draw";
import * as ui from "starhermit:ui";
import { requestSignIn } from "starhermit:platform";
import { TextureLoader, type Texture } from "starhermit:scene";
import { Progress as P, Rules as R, type Dir, type State } from "./classic.ts";
import * as audio from "./audio.ts";
import { tr } from "./i18n.ts";
import * as platform from "./platform.ts";
import { lookFor } from "./quality.ts";
import * as render from "./render.ts";
import { COLORS, initStyles } from "./style.ts";

// ------------------------------------------------------------------ state
let state: State = P.freshState(R);
/** Solve timer for the fastest-clear board: starts on the first input of a fresh board;
 * a board resumed from a save is never posted. Seconds of frame().time. */
let runStart: number | null = null;
let runFresh = true;
let lb: { secs: string; key: "starhermit.leaderboardPosting" | "starhermit.leaderboardRank" | "starhermit.leaderboardPosted" | "starhermit.leaderboardNotPosted"; rank?: number | null } | null = null;
let settingsOpen = false;
let settingsOpenedFrame = -1;
let reduced = false;

function now(): number { return frame().time; }
function showToast(text: string): void {
  ui.toast!(text, { duration: 3.5, style: ["toast", "toast-text"], dismissible: false });
}

/** The unfinished board in the save (the browser build's saveProgress). */
function saveProgress(s: State): void {
  platform.records().inProgress = P.progressSummary(s);
  platform.persist();
}

function act(dir: Dir): void {
  const prev = state;
  if (runFresh && runStart === null && !prev.won) runStart = now();
  const next = R.applyAction(state, dir);
  if (!next) return;
  state = next;
  render.sync(state);
  if (next.won && !prev.won) {
    P.recordWin(platform.records(), next, Date.now());
    platform.persist();
    if (runFresh && runStart !== null) postRun(Math.max(1, Math.round((now() - runStart) * 1000)));
    runFresh = false;
    ui.announce(tr("win"), { politeness: "assertive" });
  } else if (!next.won) saveProgress(next);
  if (next.won && !prev.won) audio.play("win");
  else if (next.score > prev.score) audio.play("eat");
  else if (next.invalidActions > prev.invalidActions) audio.play(P.refusalKind(prev, dir));
  else audio.play("void-move");
}

function restart(): void {
  audio.play("restart");
  state = P.freshState(R);
  runFresh = true;
  runStart = null;
  lb = null;
  platform.records().inProgress = null;
  platform.persist();
  render.sync(state);
}

/** Signed in, a fresh board's solve time goes to the fastest-clear board; the line shows the rank. */
function postRun(ms: number): void {
  if (!platform.signedIn()) { lb = null; return; }
  const line: NonNullable<typeof lb> = { secs: (ms / 1000).toFixed(1) + " s · ", key: "starhermit.leaderboardPosting" };
  lb = line;
  void platform.postSolveTime(ms).then((r) => {
    if (lb !== line) return;
    line.key = !r.posted ? "starhermit.leaderboardNotPosted" : r.rank ? "starhermit.leaderboardRank" : "starhermit.leaderboardPosted";
    line.rank = r.rank;
  });
}

/** Records from the account arrived: an untouched board takes their unfinished one. */
function onMerged(): void {
  if (state.won || state.tick !== 0) return;
  const r = P.reviveState(R, platform.records().inProgress);
  if (r) { state = r; runFresh = state.tick === 0; render.sync(state); }
}

// ------------------------------------------------------------------ input
onAction((e) => {
  if (!e.pressed || settingsOpen) return;
  const a = e.action;
  if (a === "restart") { restart(); return; }
  if (a === "left" || a === "right" || a === "up" || a === "down") {
    // Arrows would also move the UI's focus between the control buttons.
    ui.setFocus(null);
    act(a);
  }
});

// ------------------------------------------------------------------ the how-to line
const DEFAULT_KEYS: Record<string, string[]> = {
  left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], restart: ["KeyR"],
};
const GLYPH: Record<string, string> = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
let keySuffix = "";
/** The how-to line names the default keys in prose; when the player rebound any, the effective keys follow it. */
function readBindings(): void {
  const keys = (a: string): string[] => bindings(a).filter((b) => b.device === "keyboard").map((b) => b.code);
  const changed = Object.keys(DEFAULT_KEYS).some((a) => keys(a).join() !== DEFAULT_KEYS[a]!.join());
  const name = (c: string): string => GLYPH[c] ?? c.replace(/^Key/, "").replace(/^Digit/, "");
  const list = (a: string): string => keys(a).map(name).join("/");
  keySuffix = changed ? ` (← ${list("left")} · → ${list("right")} · ↑ ${list("up")} · ↓ ${list("down")} · ↻ ${list("restart")})` : "";
}
onBindingsChange(readBindings);

// ------------------------------------------------------------------ the page
let backdrop: Texture | null = null;
new TextureLoader().loadAsync("assets/backdrop.webp").then((t) => { backdrop = t; }, () => undefined);

interface Lay { lw: number; lh: number; sc: number; short: boolean }
function layout(): Lay {
  const v = ui.viewport!();
  const lw = Math.max(1, v.width), lh = Math.max(1, v.height);
  return { lw, lh, sc: v.scale, short: lh <= 520 };
}

/** The page's backdrop (cover-fit), painted around the playfield so the board shows through. */
function paintBackdrop(r: { x: number; y: number; w: number; h: number }): void {
  const f = frame();
  const W = f.width, H = f.height;
  const strips = [
    { x: 0, y: 0, width: W, height: r.y },
    { x: 0, y: r.y + r.h, width: W, height: H - r.y - r.h },
    { x: 0, y: r.y, width: r.x, height: r.h },
    { x: r.x + r.w, y: r.y, width: W - r.x - r.w, height: r.h },
  ].filter((s) => s.width > 0 && s.height > 0);
  for (const clip of strips) {
    draw.rect(clip.x, clip.y, clip.width, clip.height, COLORS.bg, { clip });
    if (backdrop && backdrop.width > 0) {
      const iw = backdrop.width, ih = backdrop.height;
      const k = Math.max(W / iw, H / ih);
      draw.image(backdrop, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k, { clip });
    }
  }
}

/** Text no wider than `width` (logical): a label when it fits, else a centred paragraph. */
function text(id: string, s: string, cls: string, width: number): void {
  const st = [cls];
  if (ui.measureText(s, { style: st }).width / ui.preferences().scale <= width) ui.id(id).style(__l10nStyle(cls)).label(s);
  else ui.id(id).style(__l10nStyle(cls), __l10nStyle({ text: { align: "center" } })).paragraph(s, width);
}

function header(L: Lay): void {
  ui.column("header", () => {
    ui.id("title").style(__l10nStyle(L.short ? "title-short" : "title")).label("Hollow Feast");
    if (!L.short) text("subtitle", tr("subtitle"), "subtitle", L.lw - 32);
    text("howto", tr("howto") + keySuffix, L.short ? "howto-short" : "howto", Math.min(L.lw - 32, 440));
  }, { align: "center", spacing: L.short ? 2 : 4, padding: { top: L.short ? 6 : 12, start: 16, end: 16 } });
}

const SYNC_CLASS: Record<platform.SyncKey, string> = {
  syncLocal: "sync-local", syncLoading: "sync-local", syncSaving: "sync-saving", syncSynced: "sync-synced", syncOffline: "sync-bad", syncError: "sync-bad",
};
interface Cell { id: string; label: string; value: string; cls: string; avatar?: boolean }
function hud(L: Lay): void {
  const recs = platform.records();
  const sync = platform.syncState();
  const name = platform.signedIn() ? platform.displayName() : tr("localPlayer");
  const cells: Cell[] = [
    { id: "score", label: tr("score"), value: String(state.score), cls: "hud-value" },
    { id: "eaten", label: tr("eaten"), value: `${P.eaten(state)} / 12`, cls: "hud-value" },
    { id: "player", label: tr("player"), value: name, cls: "hud-value", avatar: true },
    { id: "best", label: tr("best"), value: P.bestLine(recs.best), cls: "hud-value" },
    { id: "sync", label: tr("sync"), value: tr(sync), cls: SYNC_CLASS[sync] },
  ];
  const sc = ui.preferences().scale;
  const valueSize = L.short ? 16 : 20;
  const labelCls = L.short ? "hud-label-short" : "hud-label";
  const face = platform.avatarImage();
  // The player's name is cut at 170 px, as the browser build's ellipsis did.
  const long = (c: Cell): boolean => c.id === "player" && ui.measureText(c.value, { style: [c.cls], size: valueSize }).width / sc > 170;
  // flex-wrap: cells 16 px apart, lines 4 px apart, wrapping at the page width
  ui.column("hud", () => {
    ui.row("hud-cells", () => {
      for (const c of cells) {
        ui.column(`cell-${c.id}`, () => {
          ui.id(`${c.id}-label`).style(__l10nStyle(labelCls)).label(c.label);
          ui.row(`${c.id}-vrow`, () => {
            if (c.avatar && face) {
              ui.widget("avatar", {
                role: "image", size: { width: 16, height: 16 },
                draw: (r) => draw.image(face, r.x, r.y, r.width, r.height),
              });
            }
            ui.id(`${c.id}-value`).style(__l10nStyle(c.cls), __l10nStyle(long(c) && { width: 170, text: { overflow: "ellipsis" } })).label(c.value, { size: valueSize });
          }, { spacing: 4, align: "center" });
        }, { align: "center", spacing: 0 });
      }
    }, { wrap: true, width: L.lw - 24, gap: { column: 16, row: 4 }, justify: "center", align: "start" });
  }, { align: "center", spacing: 4, padding: { top: L.short ? 4 : 8 } });
}

function controls(L: Lay): void {
  const cls = L.short ? "ctl-short" : "ctl";
  const btn = (id: string, name: string, glyph: string, fn: () => void): void => {
    if (ui.id(id).style(__l10nStyle(cls)).button(name, { content: () => { ui.label(glyph, { size: 18 }); } })) fn();
  };
  const move = (d: Dir): () => void => () => { audio.play("ui-click"); act(d); };
  ui.row("controls", () => {
    btn("btn-left", tr("moveLeft"), "←", move("left"));
    btn("btn-up", tr("moveUp"), "↑", move("up"));
    btn("btn-down", tr("moveDown"), "↓", move("down"));
    btn("btn-right", tr("moveRight"), "→", move("right"));
    btn("btn-restart", tr("restart"), "↻", restart);
    btn("btn-settings", tr("settings"), "⚙︎", () => { audio.play("ui-click"); settingsOpen = true; settingsOpenedFrame = frame().frame; });
  }, { spacing: 5, padding: { top: L.short ? 4 : 8, bottom: L.short ? 6 : 12 } });
}

/** The win banner and its leaderboard line over the playfield's centre. */
function banner(rect: ui.Rect, L: Lay): void {
  if (!state.won) return;
  ui.area(rect, () => {
    ui.column("win", () => {
      ui.column("win-box", () => {
        ui.id("win-text").style(__l10nStyle(L.short ? "win-text-short" : "win-text")).label(tr("win"));
      }, { style: "win-banner" });
      if (lb) {
        const line = lb.secs + tr(lb.key, { rank: lb.rank ?? "" });
        ui.column("win-lb", () => { ui.id("win-lb-text").style(__l10nStyle("win-lb-text")).label(line); }, { style: "win-lb" });
      }
    }, { align: "center", justify: "center", spacing: 8, width: rect.width / L.sc, height: rect.height / L.sc });
  });
}

function settingsDialog(L: Lay): void {
  if (!settingsOpen) return;
  const w = Math.min(420, L.lw - 56);
  const open = ui.dialog("settings-dialog", "", true, () => {
    ui.column("settings-col", () => {
      ui.row("settings-head", () => {
        ui.id("settings-title").style(__l10nStyle("panel-title")).label(tr("settings"));
        ui.spacer();
        if (ui.id("settings-close").style(__l10nStyle("ctl")).button(tr("close"), { content: () => { ui.label("✕", { size: 18 }); } })) closeSettings();
      }, { width: w, align: "center" });
      ui.id("account-head").style(__l10nStyle("panel-head")).label(tr("sh.account").toUpperCase());
      if (!platform.signedIn()) {
        if (ui.id("signin").style(__l10nStyle("acct-btn"), __l10nStyle({ width: w })).button(tr("starhermit.signIn"))) void requestSignIn().catch(() => undefined);
      } else if (ui.id("invite").style(__l10nStyle("acct-btn"), __l10nStyle({ width: w })).button(tr("starhermit.invite"))) copyInvite();
      ui.id("options-head").style(__l10nStyle("panel-head")).label(tr("moreOptions").toUpperCase());
      ui.id("options-note").style(__l10nStyle("panel-note")).paragraph(tr("optionsNote"), w);
      if (ui.id("options").style(__l10nStyle("acct-btn"), __l10nStyle({ width: w })).button(tr("moreOptions"))) __l10nOptions();
    }, { spacing: 4, width: w });
  });
  // Escape or Back closes it (not on the frame the press that opened it arrived).
  if (!open && frame().frame !== settingsOpenedFrame) closeSettings();
}
function closeSettings(): void {
  settingsOpen = false;
  ui.setFocus("btn-settings");
}
function copyInvite(): void {
  const link = platform.inviteLink();
  let ok = false;
  if (link) { try { clipboard.writeText(link); ok = true; } catch { ok = false; } }
  showToast(ok ? tr("starhermit.inviteCopied") : tr("starhermit.inviteLink", { link: link ?? "" }));
}

let rootH = 0;
function drawPage(): void {
  const L = layout();
  const f = frame();
  rootH = L.lh;
  let field: ui.Rect | null = null;
  ui.column("page", () => {
    header(L);
    field = ui.spacer();
    hud(L);
    controls(L);
  }, { width: L.lw, height: rootH, align: "center", spacing: 0 });
  // The playfield: the room the page leaves (8 px under the header, 16 px side margins, at most
  // 1200 wide, at least 140 tall), its aspect held between 1.0 and 1.6 and centred, as #game-wrap.
  const r = field as ui.Rect | null;
  if (r) {
    const sc = L.sc;
    const top = r.y + 8 * sc;
    const availW = Math.max(1, Math.min(f.width - 32 * sc, 1200 * sc));
    const availH = Math.max(1, r.height - 8 * sc);
    let w = availW, h = availH;
    if (w / h > 1.6) w = h * 1.6;
    if (w / h < 1.0) h = w;
    const x = (f.width - w) / 2, y = top + (availH - h) / 2;
    render.setRect(x, y, w, h, f.width, f.height);
    banner({ x, y, width: w, height: h }, L);
  }
  settingsDialog(L);
}

// ------------------------------------------------------------------ boot and lifecycle
let lookKey = "";
function applyLook(): void {
  const f = frame();
  const k = f.level;
  if (k === lookKey) return;
  lookKey = k;
  render.applyLook(lookFor(levelSettings(f.level)));
}
onStart(() => {
  initStyles();
  platform.initPlatform();
  platform.onRecordsMerged(onMerged);
  platform.onSignedOut(() => showToast(tr("starhermit.signedOut")));
  audio.loadSfx();
  reduced = preferences().reducedMotion;
  // An unfinished board from the save resumes where it left off (never posted).
  const revived = P.reviveState(R, platform.records().inProgress);
  if (revived) { state = revived; runFresh = state.tick === 0; }
  render.sync(state);
  applyLook();
});
onPreferencesChange((p) => { reduced = p.reducedMotion; });
onSuspend(() => platform.flush());

let frameDt = 0;
let boundRead = false;
onUpdate((dt) => {
  frameDt = dt;
  if (!boundRead) { boundRead = true; readBindings(); }
  applyLook();
});
onRender(__l10nRender(() => {
  drawPage();
  paintBackdrop(render.view);
  render.update(frameDt, reduced);
}));

// localization-runtime:menu
import { installLanguageMenu as __installLanguageMenu } from "./l10n/menu.ts";
__installLanguageMenu(false);
