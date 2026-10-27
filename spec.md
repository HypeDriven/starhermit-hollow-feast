# Hollow Feast — Game Design Document (running spec)

A hungry pale void hovers over a slate banquet table and must swallow twelve glowing morsels
**in numbered order**. This document describes the game as it ships today: a StarHermit engine script
game (engine 1.17.1, host API 1.19), played natively by the StarHermit client and in browsers by the
engine's web runtime.

---

## 1. Overview

| Field | Value |
|---|---|
| Pitch | A polite little void eats a twelve-course dinner, one course at a time, in the right order. |
| Genre | Single-screen ordered-collection puzzle / light action |
| Players | 1, local, offline after first load |
| Session length | 20–60 s per solve; a full board is twelve moves |
| Platforms | StarHermit client (native) and browsers (the engine's web runtime), desktop and phones, portrait and landscape |
| Rendering | `starhermit:scene` (three.js-like 3D) for the table; `starhermit:ui` for the header, HUD, controls and Settings; `starhermit:draw` for the page backdrop |
| Game index | 56 |

### File map

| Path | Responsibility |
|---|---|
| `starhermit.txt` | Manifest: name, owner, `server=score-script.js`, cover, `launch=index.html`, `engine.api=1`, `engine.entry=native/main.ts`, `engine.version=1.17.1`, `engine.minor=19`, capabilities `platform,storage,clipboard`, the five actions with keys and pad defaults. |
| `native/main.ts` | Entry module: board state, moves and restarts (keys, pads, buttons), sounds per outcome, records, the solve timer and leaderboard posting, and the page as `starhermit:ui` (header, playfield rectangle, HUD, control bar, win banner, Settings dialog, toast). |
| `native/render.ts` | The table on `starhermit:scene`: meshes, lights, materials per budget, textures, motes, the post effects, the camera fit and view offset into the playfield, ambient motion. |
| `native/quality.ts` | The browser build's four presets and budgets keyed by the runtime's quality tier and level. |
| `native/platform.ts` | Save (`starhermit:storage` saves, conflict merge, foreign-save migration), legacy settings removal, player name/avatar, invite link, the sync cell's state, fastest-clear posting through `score-script.js`. |
| `native/audio.ts` | Clip events from `sfx/manifest.json` on the runtime's buses. |
| `native/i18n.ts` | Locale from the runtime's interface language; `tr()`. |
| `native/style.ts` | Theme and the converted style sheet (`assets/ui-style.json`). |
| `native/classic.ts` | Loads `rules.js`, `js/progress.js`, `js/strings.js` as classic scripts; their TypeScript shapes. |
| `rules.js` | Pure rules engine (`initialState`, `isLegal`, `applyAction`), CommonJS for node and `globalThis.HFRules` for the engine. |
| `js/progress.js` | Pure save document and round bookkeeping: sanitize, merge, the browser build's save, the fresh board, the unfinished board, wins and the best line. |
| `js/strings.js` | The nine locales' string tables and `t()`. |
| `assets/board-slate.webp`, `assets/backdrop.webp` | Board texture; page backdrop. |
| `assets/ui-style.json` | `starhermit css` output of `tools/ui-style.css`. |
| `sfx/*.opus`, `sfx/manifest.*` | 18 one-shot clips; `manifest.txt` canonical, `manifest.json` read by the game, `manifest.md` mirror. |
| `score-script.js` | StarHermit platform script (`server=`): range-checks a solve time and posts it to the `fastest-clear` board (unchanged). |
| `index.html`, `starhermit-files.json` | The web loader and file index written by `npm run package` (`starhermit package --web .`); never edited by hand. |
| `server.js` | Static dev host (left out of the package). |
| `tests/` | Unit tests, `native.mjs` (engine checks and play scripts), `native/*.play`. |
| `tools/` | `package-web.mjs`, `css.mjs` + `ui-style.css`, `browser-play.mjs`. |
| `coverart.png`, `cover.jpg`, `icon.png`, `favicon.*`, `LICENSE.md` | Artwork and licence. |

---

## 2. Design pillars

1. **The order is the puzzle, not the dexterity.** There is no timer, no failure state and no enemy;
   the only pressure is *which morsel is next*. This rules in a fixed, legible eat order and a visible
   "next" marker; it rules out reflex windows, moving hazards and score decay over time.
2. **A refusal is information, not punishment.** An illegal move costs nothing but a tick and a counter.
   The board never resets on a mistake, and the two refusal kinds — off the edge, and out of order — sound
   different so the player learns the rule by ear. This rules out life counters and instant-loss states.
3. **The board is the hero.** The camera solves its own distance and target every time the layout changes
   so the whole slab and every cell the void can occupy stay inside the playfield at any aspect ratio.
   This rules in a fixed diorama camera; it rules out player-controlled orbit, zoom and any framing where
   the far row can be cut off.
4. **Everything readable with the effects off.** Position, ownership, the next target and the score are all
   carried by geometry, scale and HUD text — the emissive glow, the win-banner pop and the backdrop haze are
   all additive. Reduced-motion and a failed texture load both leave a fully playable board.
5. **One board, twelve moves, no ceremony.** The game starts in the played state: no menu, no mode select,
   no splash. A returning player is playing in zero deliberate actions.

---

## 3. Player experience

**Target player.** Someone with one spare minute who wants a small, complete, satisfying thing. No prior
genre knowledge is assumed.

**First 60 seconds.** The game starts directly on a played board. The header carries a permanent one-line
rule: *"Eat the glowing morsels in numbered order. Arrow keys, WASD, or the buttons below. R restarts."*
The only glowing, oversized morsel on the board is morsel 1, sitting immediately left of the void, so the
first useful action is visible before the sentence is finished. Pressing left eats it: gulp, score 10,
`Eaten 1 / 12`, and the glow jumps to morsel 2. Pushing up against the edge gives a soft thud and nothing
moves. Reaching for a morsel out of turn gives a different, softer refusal. Those three outcomes teach the
whole rule set within about fifteen seconds, without a tutorial mode.

**Session shape.** Solve (twelve moves) → *Feast complete!* banner and a chime → restart → solve again,
faster and with fewer refusals. The replay motive is a clean run: 450 points with zero invalid actions.

**Emotional beat.** Greed made obedient. The void is enormous next to its food and could clearly swallow the
whole table, and the pleasure is in making it wait its turn.

---

## 4. Core loop and rules contract

All rules live in `rules.js`; the client (`native/main.ts`) never decides legality or score.

### Board and entities

- A 4×4 grid, indexed `cells[y * 4 + x]`, `x` and `y` in `0..3`.
- Each cell is `{ kind, order }`. `kind: 'item'` is an uneaten morsel; `kind: null` with a non-null `order`
  is a cell whose morsel has been eaten; `kind: null, order: null` is a cell that never held one.
- Twelve morsels occupy columns `x = 0..2` in a snake, laid out by `ORDER` in `js/progress.js` (`freshState`):

  | | x=0 | x=1 | x=2 | x=3 |
  |---|---|---|---|---|
  | **y=0** | 3 | 2 | 1 | · |
  | **y=1** | 4 | 5 | 6 | · |
  | **y=2** | 9 | 8 | 7 | · |
  | **y=3** | 10 | 11 | 12 | · |

- The void starts at `(3, 0)`: on the empty corridor column, adjacent to morsel 1.
- State: `{ cells, voidPos, score, invalidActions, tick, won }` (`rules.js::initialState`). Score, tick and
  counters are integers; formatting happens only in the HUD (`native/main.ts`).

### Legal actions

One action exists: step the void one cell in `left | right | up | down` (`rules.js::isLegal`).
A step is legal when the target cell is on the board **and** either holds no morsel, or holds the morsel
whose `order` equals `eatenCount(state) + 1`.

### Resolution order (`rules.js::applyAction`)

1. If the state is terminal (`won`) or the step is illegal → return a copy with `invalidActions + 1`,
   `tick + 1`, unchanged `voidPos`, `score` and `cells`. The input state is never mutated.
2. Otherwise move the void to the target cell.
3. If the target held a morsel, clear its `kind` (keeping `order` as the eaten record) and add
   `10 + (consumed − 1) × 5`, where `consumed` counts the cells eaten *including* this one.
4. Increment `tick`. If no cell still has `kind`, set `won = true`.

### Scoring, worked

Morsel *n* is worth `10 + (n − 1) × 5`: 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65.
A complete twelve-morsel board is **450**. There is no time bonus and no penalty subtraction; invalid
actions are counted separately as the cleanliness metric of a run.

### Terminal state and tie-breaks

`won` is sticky: after the twelfth morsel every further input is refused and only increments `tick` and
`invalidActions` (asserted by `tests/rules.test.mjs`).
Two runs are compared by, in order: completion (`won`), then fewer `invalidActions`, then lower `tick`.
Since every board is the same board, that ordering is fully determined by the input log. `js/progress.js::recordWin`
applies exactly this ordering when replacing the persisted best line (score, then refusals, then ticks).

### RNG, undo, hints

The shipped layout is a fixed authored constant, so `initialState` accepts a `seed` and stores it but no
code path randomises anything today; identical input sequences always produce identical states.
There is no undo and no hint button — the "next" glow *is* the hint, always on.

---

## 5. Modes and progression

The game ships **one mode**: a single fixed board, played immediately, restartable. There is no mode select,
no difficulty setting, no daily seed and no unlock track. Mid-round progress and personal records do persist
between loads via the game's save (§12), but the mode question is deliberate at the current scope:
the board is a twelve-move exercise whose whole content is its order, and a mode picker would cost more of
the player's first ten seconds than it returns. See "Design intent not yet implemented" for the
seeded-layout hook that already exists in the rules.

---

## 6. Controls and interaction

| Input | Action | Feedback |
|---|---|---|
| `←` `→` `↑` `↓`, `A` `D` `W` `S` | Step the void (actions `left` `right` `up` `down`) | Void moves; movement whoosh, or a refusal cue |
| `R` | Restart the round (action `restart`) | Fresh board, reset HUD, restart sweep |
| Gamepad D-pad or left stick | Step the void | As the keys |
| Gamepad North (Y) | Restart | As `R` |
| Control bar `←` `↑` `↓` `→` (click, tap, Tab + Enter, pad South) | Step the void | UI tap layered under the move/refusal cue |
| Control bar `↻` | Restart | Restart sweep |
| Control bar `⚙` | Open Settings | UI tap; focus moves into the dialog |
| `Esc` / Back / `✕` (Settings open) | Close Settings | Focus returns to `⚙` |

- Players rebind keys and pad buttons in the runtime's Options; when any key differs from the defaults,
  the how-to line appends the effective keys (`(← A/… · → … · ↻ R)`).
- The game's arrow handling clears UI focus, so the arrows always step the void (they never wander between
  the control buttons). While Settings is open, game actions are ignored.
- The board itself is not an input surface: every action is a discrete key, pad button or button.
- No input lock: resolution is synchronous; a double-tap is two steps.
- Buttons are 56×44 logical px (50×36 when the window is at most 520 logical px tall), 5 px apart, with a
  2 px `#6ea3ff` focus ring.

---

## 7. Screens and UI flow

One screen plus a Settings dialog. The state machine is `playing ⇄ won`, with `won → playing` on restart;
Settings opens over either state and pauses nothing (there is no clock on screen).

- **playing** — the page: header (title "Hollow Feast", subtitle, how-to line), the playfield (the 3D
  table), the HUD row (Score, Eaten `n / 12`, Player, Best `score · refusals R · ticks T`, Sync) and the
  control bar (← ↑ ↓ → ↻ ⚙). An unfinished board from the save resumes at start.
- **won** — "Feast complete!" on a gold-edged plate over the playfield's centre (announced assertively);
  signed in, a line under it shows the solve time and the leaderboard status. Further steps are refused.
- **Settings** — a modal dialog: the title and ✕; **Account** (signed out: *Sign in with StarHermit*;
  signed in: *Invite a friend*, copying the invite link with a toast); **More options** with a note that
  sound, graphics, language and key bindings are in the StarHermit options, and a button opening the
  runtime's Options menu.
- **Toast** — bottom centre for 3.5 s (invite copied / copy failed / signed out).

Layout is one full-window column: header → playfield → HUD → controls. The playfield takes the room the
others leave (8 px below the header, 16 px side margins, at most 1200 px wide), its aspect held between 1.0
and 1.6 and centred, as the browser build's `#game-wrap`; the camera is refitted to it. HUD cells wrap into
rows when the window is narrow. When the window is at most 520 logical px tall the subtitle is dropped and
the title, how-to line, HUD and buttons step down a size. The player's interface size, text size and high
contrast (runtime Options) scale everything; there is no separate large-screen zoom.

---

## 8. Art direction

**Palette:**

| Role | Hex |
|---|---|
| Page ground | `#0b0d12` under `assets/backdrop.webp` (cover-fit, painted around the playfield) |
| Scene clear | `#141a26` |
| Board slate tint | `#3a5f8a` (replaced by `assets/board-slate.webp` when it loads) |
| Morsel | `#ff8c3a`, flat-shaded, emissive `#ff8c3a` at 0.85 when next (1.35, pulsing, with bloom on) |
| The void | `#f6e7b2` with `#caa64d` emissive |
| Text | `#e8ecf4`; HUD values `#ffffff`; secondary `#9aa7bd`; how-to `#b9c6dc`; banner `#f6e7b2` |
| Controls | `#233047`; focus ring `#6ea3ff`; Settings panel `#121826` edged `#2c3a55` |

**Shape language.** A smooth sphere for the void (20–64 segments by budget), flat-shaded icosahedra for
the morsels.

**Composition.** Fixed three-quarter diorama camera along `(0, 16.5, 15)`, fov 50, solved by
`render.ts::fitCamera` (projecting the fit points by hand) to fill 92 % of the playfield's tighter axis;
the camera's view offset places that picture in the playfield rectangle of the window.

**Lighting.** ACES filmic tone mapping at exposure 0.95. A cool-sky / warm-table hemisphere fill, a low
flat ambient and one warm directional key from `(-4, 10, 8)`, at the browser build's three.js intensities
÷ π. The key's shadows cover the camera distance plus the board along the view.

**Graphics levels.** The runtime's Options choose the graphics level (Auto by default); the game maps the
level's quality tier to the browser build's presets, each tuned to hold 60 FPS on the weakest GPU its Auto
gave the preset:

| | Low | Balanced | High | Ultra |
|---|---|---|---|---|
| Shading | Lambert | Standard | Physical (clear-coated plates, morsels, void) | Physical |
| Shadows (requested map; the level caps it) | off | 512 | 1024 | 2048 |
| Ambient occlusion | off | off | on (8 samples) | high (16) |
| Bloom (strength 0.42, radius 0.45, threshold 0.9) | off | on | on | on |
| Colour grade + vignette | off | on | on | on |
| Anti-aliasing | MSAA | FXAA | SMAA | MSAA |
| Reflections (RoomEnvironment, intensity 0.4) | off | on | on | on |
| Table detail (slab, walnut top, plates, next-course light) | plain | detailed | detailed | detailed |
| Motes (× level within the tier, ≤ 2×) | 0 | 40 | 120 | 180 |
| Void / plate segments | 20 | 32 | 48 | 64 |
| Walnut texture / anisotropy | 128 px / 1× | 256 / 4× | 512 / 8× | 1024 / 16× |
| Bloom / AO resolution | ½ | ½ | ½ | full |

Render scale, pixel-ratio cap, adaptive resolution, the frame-rate limit and readout are the runtime's.
The grade is the browser build's shader as renderer settings: display-space S-curve (contrast 0.11),
saturation 1.1, cool shadows / warm highlights over 0.15–0.8, vignette 0.28 (0.32–0.8).

**Typography.** System UI faces. 28 px bold title, 13 px subtitle and how-to line, 15 px HUD labels over
20 px semibold values.

**Motion.** State changes are instantaneous snaps. Ambient motion is decorative only: the void bobs ±0.09,
the next morsel turns and its glow and light pulse, the motes drift. All of it stops with the runtime's
reduced-motion setting.

---

## 9. Audio direction

**Mix philosophy.** Small, dry, close-mic'd sounds. Movement is the quietest layer, eating the loudest,
refusals soft and brief. There is no music and no ambience.

**Buses.** `native/audio.ts` plays each clip at gain 0.8 (the browser build's master level) on the
runtime's `effects` bus, the UI tap on `interface`. Volumes, mute and the voice limit are the runtime's
Options › Audio. Clips load once the mixer runs (in browsers after the first press), one at a time, the
most frequent events first; an event whose clips are not loaded yet is silent (the browser build's
procedural fallback voices are not ported).

**Playback.** Each event round-robins its variants so consecutive identical actions never repeat a sample.

### SFX event table

| Event id | Files | Sound | Fires when |
|---|---|---|---|
| `void-move` | `void-slide-a..d.opus` | Soft one-tile slide | The void steps onto an empty or already-eaten cell |
| `eat` | `gobble-a..d.opus` | Wet hollow gulp, munch, chomp, plop | The next morsel is consumed |
| `invalid` | `thud-denied-a..b.opus` | Dull wooden thud; soft bonk | A step would leave the board |
| `wrong-order` | `wrong-order-a..b.opus` | Two muted wood clicks; muffled bell tap | The target holds a morsel that is not next |
| `win` | `feast-complete-a..b.opus` | Rising bell arpeggio; glockenspiel | The twelfth morsel is eaten |
| `restart` | `restart-sweep-a..b.opus` | Reverse airy sweep; rising whoosh | `↻`, `R` or pad North lays out a fresh board |
| `ui-click` | `ui-tap-a..b.opus` | Crisp tap; soft click | A control-bar direction button or ⚙, under the resulting cue |

---

## 10. Localization

Nine locales ship: **en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT**, in `js/strings.js`.
The locale follows the runtime's interface language (`preferences().language`: the player's Options ›
Language, else the account's preferred language or the device's), mapped to the nearest shipped locale
(`es-MX → es-419`, `en-AU → en-GB`, `fr → fr-FR`, `pt-PT → pt-BR`); a change applies on the next frame. The
runtime's Options replace the browser build's own Language setting. "Hollow Feast" is never translated;
numbers are locale-independent. Long strings (the how-to line, the Settings note, toasts) wrap with
measured widths; HUD cells wrap into rows. `tests/i18n.test.mjs` checks every key in every locale and every
key the client uses.

---

## 11. Accessibility

- Keyboard-only and gamepad-only play are complete; Tab / D-pad navigation reaches all six buttons and the
  Settings controls with a visible focus ring. Settings is modal; Escape or Back closes it and focus returns
  to `⚙`.
- Screen readers: the control buttons are named by their translated labels ("Move left", "Restart round",
  "Settings", "Close settings"); the arrow glyphs are presentation. The win banner and toasts are announced.
- The runtime's interface size, text size, high contrast and reduced motion apply to everything.
- No colour-only information: the next morsel is also 18 % larger, and the two refusals differ in timbre.

---

## 12. StarHermit integration

- **Save.** One document `{ v: 1, records }` (best line, wins, clean wins, the unfinished board) is the
  game's save (`starhermit:storage` saves, schema 1): on the device at once and, signed in, synced to the
  account. A conflict merges both devices' records (better best by score, refusals, ticks; larger
  counters; the local unfinished board). Another device's save arriving is merged in, and an untouched
  board takes its unfinished board.
- **The browser build's cloud save** (the JS SDK's zipped `save.json`, slot `game:<slug>`) shows as
  foreign: it is read (`saves.foreign().text`), merged into this device's records and saved over with
  `replaceForeign` once. Guests' old browser `localStorage` progress (`hf.save.v1`) cannot migrate.
- **Old settings.** The browser build's per-player settings (`gfx`, `audio.options`, `ui.language`,
  `graphics.gpu.*`) are now the runtime's Options and are removed from the account.
- **HUD.** The Player cell shows the account's display name and avatar (signed out: "Local player"); the
  Sync cell shows Local / Loading / Saving / Synced / Offline / Error from the save's state.
- **Leaderboard.** Signed in, every solve of a fresh board posts its time (ms from the first input to the
  twelfth morsel, `frame().time`) to the `fastest-clear` board through `score-script.js` (a practice
  session whose socket carries `{ type: 'result', scores }`; the script range-checks 300 ms–1 h and writes
  the board). The line under the banner shows "N s · Leaderboard rank: #R" (or posted / not posted). A
  board resumed from the save is never posted. Solo times are client-measured and range-checked (the
  current policy for solo boards); results come only from the server script.
- **Account.** Settings offers sign-in (`requestSignIn`) and the invite link (`inviteLink`, copied with
  `clipboard`); signing out mid-run shows a toast and play continues on the device.
- Not used: rooms, matchmaking, chat, replays, platform achievements. Report-a-problem and crash reports
  are the runtime's.

---

## 13. Technical architecture

- **Layering.** `rules.js` and `js/progress.js` (pure, shared with the node tests) ← `native/main.ts`
  (state, input, page) → `native/render.ts` (scene), `native/platform.ts`, `native/audio.ts`.
- **Determinism.** `applyAction` is a pure function of `(state, dir)` and never mutates its input, so an
  input log replays to an identical state; play scripts drive the real UI to fixed results.
- **Frame.** `onUpdate` applies the graphics level's look when it changes and pumps clip loads;
  `onRender` builds the page, hands the playfield rectangle to the renderer (refitting the camera only when
  it changes), paints the backdrop around it and steps the ambient motion.
- **Rendering budget.** Low: ~14 meshes, 3 lights, no post effects or shadows. Higher levels add the
  detail meshes, one point light, up to 360 points, a shadow map and the post effects.

---

## 14. Testing and acceptance criteria

- `npm test` = `npm run test:unit` + `npm run test:native`.
- `test:unit` (`node --test tests/*.test.mjs`): `rules.test.mjs` (the rules contract, unchanged),
  `progress.test.mjs` (the browser build's cloud save read, sanitizing, merge, wins and tie-breaks, the
  unfinished board's round trip, refusal kinds), `i18n.test.mjs` (nine locales, same keys, translated,
  placeholders, every used key present).
- `test:native` (`tests/native.mjs`): the web index matches the files, `tsc` (strict, the engine's
  `.starhermit/starhermit.d.ts`), `starhermit check .` with zero warnings, and each `tests/native/*.play`
  as a signed-out `--render-check`: `feast.play` (a refusal, the twelve courses by keys, the banner,
  `450 · 1R · 13T`, `R` restarts) and `settings.play` (Settings by its button, the account and options
  sections, ✕ closes, Move left and Restart round by their buttons).
- `npm run test:browser` (`tools/browser-play.mjs`): the packaged loader in Chrome on the GPU at desktop
  1366×768, phone 390×844 @ DPR 3 and landscape 844×390 @ DPR 3: a whole board by keys, restart, the
  phones' control bar tapped, Settings opened and closed, no console errors or warnings, screenshots.
- `npm run package` regenerates `index.html` + `starhermit-files.json` after every change.

---

## 15. Asset inventory

| Path | Purpose |
|---|---|
| `assets/board-slate.webp` | 512×512 slate texture on the board; flat `#3a5f8a` fallback |
| `assets/backdrop.webp` | 1280×720 cool/warm haze behind the page |
| `assets/ui-style.json` | Converted UI styles |
| `cover.jpg`, `coverart.png`, `icon.png`, `favicon.*` | Platform artwork |
| `sfx/*.opus` | The 18 clips of §9 |

The walnut grain, the mote sprite and the plate profile are generated in code.

---

## 16. Known limitations

- **One board, forever.** The layout is a constant.
- **The current run's refusals are not shown** (only the best line's).
- **The board is not clickable**; input goes through keys, pads and the control bar.
- **`seed` is stored but unused.**
- **Port differences.** The old Graphics panel's per-effect overrides are gone (the runtime's Options
  choose a level); the slate texture is not downscaled per preset; the playfield's corners are square (the
  browser build rounded them 8 px); sounds are silent until their clips load (no synthesized fallback);
  guests' browser-only progress does not carry over; signed-in paths (cloud save migration, posting) are
  covered by unit tests, not live-tested.

## Design intent not yet implemented

- Seeded, generated layouts (`initialState` already stores a `seed`).
- An in-play refusal counter and an end-of-round breakdown.
- Server-validated solve times from the deterministic input log; a separate board for clean solves.
