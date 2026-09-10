# Hollow Feast — Game Design Document (running spec)

A hungry pale void hovers over a slate banquet table and must swallow twelve glowing morsels
**in numbered order**. This document describes the game as it ships today.

---

## 1. Overview

| Field | Value |
|---|---|
| Pitch | A polite little void eats a twelve-course dinner, one course at a time, in the right order. |
| Genre | Single-screen ordered-collection puzzle / light action |
| Players | 1, local, offline after first load |
| Session length | 20–60 s per solve; a full board is twelve moves |
| Platforms | Desktop and mobile browsers, portrait and landscape |
| Rendering | three.js `WebGLRenderer` over a 3D scene; all text, HUD and controls are semantic HTML around the canvas |
| Game index | 56 |

### File map

| Path | Responsibility |
|---|---|
| `index.html` | Entry point: layout, palette, header, canvas box, HUD, control bar, win banner. Loads scripts in order i18n → rules → sfx → three.js → game. |
| `rules.js` | Pure rules engine. `initialState`, `isLegal`, `applyAction`. No DOM, no three.js. Exported to `window.__hf_rules` and to CommonJS for tests. |
| `game.js` | Presentation and input: scene, camera fit, mesh sync, HUD, keyboard/pointer handling, audio event dispatch, `window.__hf_debug` framing hook. |
| `js/i18n.js` | Nine-locale string table, locale selection, `data-i18n` / `data-i18n-aria` application. |
| `js/sfx.js` | Web Audio engine: event → clip round-robin with a procedural synth fallback. |
| `js/three.module.min.js`, `js/three.core.min.js` | Vendored three.js r178. |
| `assets/board-slate.webp` | Board surface texture. |
| `assets/backdrop.webp` | Page background haze. |
| `sfx/*.opus`, `sfx/manifest.txt` | 18 one-shot clips; `manifest.txt` is canonical, `manifest.json` drives regeneration, `manifest.md` is the readable mirror. |
| `server.js` | Static dev host. Serves the game root, refuses `tests/`, `tools/`, `node_modules/` and dotfiles. |
| `tests/rules.test.mjs` | `npm test` — rules contract unit tests. |
| `tests/e2e.mjs` | `npm run test:e2e` — Playwright playthrough of the real UI at four viewports. |
| `coverart.png`, `icon.png`, `favicon.svg`, `starhermit.txt`, `LICENSE.md` | Platform manifest and artwork. |

---

## 2. Design pillars

1. **The order is the puzzle, not the dexterity.** There is no timer, no failure state and no enemy;
   the only pressure is *which morsel is next*. This rules in a fixed, legible eat order and a visible
   "next" marker; it rules out reflex windows, moving hazards and score decay over time.
2. **A refusal is information, not punishment.** An illegal move costs nothing but a tick and a counter.
   The board never resets on a mistake, and the two refusal kinds — off the edge, and out of order — sound
   different so the player learns the rule by ear. This rules out life counters and instant-loss states.
3. **The board is the hero.** The camera solves its own distance and target every frame the layout changes
   so the whole slab and every cell the void can occupy stay inside the canvas at any aspect ratio.
   This rules in a fixed diorama camera; it rules out player-controlled orbit, zoom and any framing where
   the far row can be cut off.
4. **Everything readable with the effects off.** Position, ownership, the next target and the score are all
   carried by geometry, scale and HTML text — the emissive glow, the win-banner pop and the backdrop haze are
   all additive. Reduced-motion and a failed texture load both leave a fully playable board.
5. **One board, twelve moves, no ceremony.** The game starts in the played state: no menu, no mode select,
   no splash. A returning player is playing in zero deliberate actions.

---

## 3. Player experience

**Target player.** Someone with one spare minute who wants a small, complete, satisfying thing. No prior
genre knowledge is assumed.

**First 60 seconds.** The page loads directly into a played board. The header carries a permanent one-line
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

All rules live in `rules.js`; `game.js` never decides legality or score.

### Board and entities

- A 4×4 grid, indexed `cells[y * 4 + x]`, `x` and `y` in `0..3`.
- Each cell is `{ kind, order }`. `kind: 'item'` is an uneaten morsel; `kind: null` with a non-null `order`
  is a cell whose morsel has been eaten; `kind: null, order: null` is a cell that never held one.
- Twelve morsels occupy columns `x = 0..2` in a snake, laid out by `ORDER` in `game.js::freshState`:

  | | x=0 | x=1 | x=2 | x=3 |
  |---|---|---|---|---|
  | **y=0** | 3 | 2 | 1 | · |
  | **y=1** | 4 | 5 | 6 | · |
  | **y=2** | 9 | 8 | 7 | · |
  | **y=3** | 10 | 11 | 12 | · |

- The void starts at `(3, 0)`: on the empty corridor column, adjacent to morsel 1.
- State: `{ cells, voidPos, score, invalidActions, tick, won }` (`rules.js::initialState`). Score, tick and
  counters are integers; formatting happens only in `game.js::updateHUD`.

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
`invalidActions` (asserted by `tests/rules.test.mjs` and by the rules prelude of `tests/e2e.mjs`).
Two runs are compared by, in order: completion (`won`), then fewer `invalidActions`, then lower `tick`.
Since every board is the same board, that ordering is fully determined by the input log.

### RNG, undo, hints

The shipped layout is a fixed authored constant, so `initialState` accepts a `seed` and stores it but no
code path randomises anything today; identical input sequences always produce identical states.
There is no undo and no hint button — the "next" glow *is* the hint, always on.

---

## 5. Modes and progression

The game ships **one mode**: a single fixed board, played immediately, restartable. There is no mode select,
no difficulty setting, no daily seed, no unlock track and no persistence between page loads. This is
deliberate at the current scope: the board is a twelve-move exercise whose whole content is its order, and a
mode picker would cost more of the player's first ten seconds than it returns. See
"Design intent not yet implemented" for the seeded-layout hook that already exists in the rules.

---

## 6. Controls and interaction

| Input | Action | Feedback |
|---|---|---|
| `←` `→` `↑` `↓` | Step the void | Void mesh moves; movement whoosh, or a refusal cue |
| `A` `D` `W` `S` | Step the void | Identical to the arrows |
| `R` | Restart the round | Fresh board, reset HUD, restart sweep |
| On-screen `←` `↑` `↓` `→` buttons (tap or click) | Step the void | UI tap layered under the move/refusal cue |
| On-screen `↻` button | Restart the round | Restart sweep |

- Modifier chords are ignored: `game.js` returns early when `ctrlKey`, `metaKey` or `altKey` is held, so
  browser shortcuts still work.
- Handled keys call `preventDefault`, so arrow keys never scroll the page.
- The canvas sets `touch-action: none`, so a tap or drag on the board never pans or zooms the page. The
  canvas itself is not an input surface: there is no raycast picking and no drag gesture — every action is
  a discrete button or key, which keeps the touch and keyboard paths identical.
- There is no input lock. Resolution is synchronous and instantaneous, so inputs can never be dropped and
  no debounce is needed; a double-tap is simply two steps, the second of which is usually refused.
- Every input produces a sound *and* a visible change (a move, or a HUD/board state that provably did not
  change plus a distinct refusal cue).
- Buttons are 56×44 CSS px (50×36 under 520 px of height), with a visible `:focus-visible` outline in
  `#6ea3ff` and a hover brightness lift.

---

## 7. Screens and UI flow

There is one screen. The state machine is `loading → playing ⇄ won`, with `won → playing` on restart:

- **loading** — HTML paints immediately with the header, HUD at `0` / `0 / 12`, and controls; the canvas
  fills in once the module graph resolves. If WebGL is unavailable, `game.js` replaces the canvas with a
  `role="alert"` paragraph explaining that the browser cannot render the board, and the page stays intact.
- **playing** — HUD live, board interactive.
- **won** — `#win-banner` ("Feast complete!") appears centred over the board with `role="status"`, all
  further steps are refused, and restart is the only meaningful action. The banner is `pointer-events: none`
  so it can never swallow a click.

Layout is a single vertical flex column: header (title, subtitle, rule line) → `#game-wrap` → HUD row →
control bar. `#game-wrap` is the only flexible row (`flex: 1 1 auto`, `min-height: 140px`), so the HUD and
the controls can never be pushed below the fold; the canvas takes what is left, clamped to an aspect ratio
between 1.0 and 1.6, and the camera refits. Under 520 px of viewport height the subtitle is dropped and the
title, rule line, HUD and buttons all step down a size. Nothing on this page may ever be cut off: the
title, the rule line, both HUD cells, all five buttons, the whole slab and the void at any cell must sit
inside the viewport, and the document must not scroll in either axis — `tests/e2e.mjs` asserts exactly this
after every single move at four viewports.

---

## 8. Art direction

**Palette** (as authored in `index.html` and `game.js`):

| Role | Hex |
|---|---|
| Page ground | `#0b0d12` |
| Canvas/scene clear | `#141a26` |
| Board slate tint | `#3a5f8a` (replaced by `assets/board-slate.webp` when it loads) |
| Morsel | `#ff8c3a`, flat-shaded, emissive `#ff8c3a` at 0.85 when next |
| The void | `#f6e7b2` with `#caa64d` emissive |
| Body text | `#e8ecf4`; secondary `#9aa7bd`; rule line `#b9c6dc` |
| Controls | `#233047`; focus ring `#6ea3ff` |

**Shape language.** Two shapes only, and they read as predator and prey: a smooth 32×32 sphere for the void,
flat-shaded icosahedra for the morsels. Flat shading gives the food facets that catch the directional light,
so twelve identical objects still read individually against the slab.

**Composition.** Fixed three-quarter diorama camera along `(0, 16.5, 15)`, solved by `game.js::fitCamera` to
fill 92 % of the tighter viewport axis. The hero of the screen is the slab; the void is the only bright
object on it, and the single glowing morsel is the only competing highlight.

**Lighting.** Ambient white at 0.7 plus one directional key at 1.6 from `(-4, 10, 8)` — enough contrast for
facets, never enough to blow out the pale void.

**Typography.** System UI stack throughout. 28 px semibold title, 13 px subtitle and rule line, 15 px HUD
labels over 20 px semibold values, so the numbers win the HUD at a glance.

**Motion.** Deliberately near-static: state changes are instantaneous snaps, not tweens, so the board never
lies about where the void is. The only animation is the 220 ms win-banner pop, and it is wrapped in
`@media (prefers-reduced-motion: no-preference)`; with reduced motion the banner simply appears.

**Visual assets the design calls for:** a slate board surface, a dark atmospheric page backdrop, and cover
art showing the void over a laid table. All three ship (§15).

---

## 9. Audio direction

**Mix philosophy.** Small, dry, close-mic'd sounds — this is a tabletop diorama, not a cathedral. Movement
is the quietest layer, eating is the loudest, refusals are soft and brief so a clumsy player is never nagged.
There is no music and no ambience: silence between moves is what makes the gulp land.

**Buses.** `js/sfx.js` builds `source → effectsBus → masterGain → destination`. `setMuted` and `setVolume`
(default 0.8) act on the master gain. The `AudioContext` is created and resumed only on a user gesture
(`unlock()` from every button and key path), so no browser autoplay warning is ever logged.

**Playback.** Each event owns a list of variants, round-robined via a per-event cursor so consecutive
identical actions never repeat a sample. Clips are lazily fetched and decoded on first use; until a clip is
ready — or if it fails to load — the matching procedural synth voice in `js/sfx.js::synth` plays instead, so
every event always makes a sound.

### SFX event table

| Event id | Files | Sound | Fires when |
|---|---|---|---|
| `void-move` | `void-slide-a..d.opus` | Soft one-tile slide over stone, wood, slate, carpet | The void steps onto an empty or already-eaten cell |
| `eat` | `gobble-a..d.opus` | Wet hollow gulp, cartoon munch, comic chomp, deep plop | The next morsel in the order is consumed |
| `invalid` | `thud-denied-a..b.opus` | Dull wooden thud; soft rubbery bonk | A step would leave the 4×4 board |
| `wrong-order` | `wrong-order-a..b.opus` | Two muted wood clicks dropping in pitch; muffled bell tap | The target holds a morsel that is not next — softer than the edge thud, so the two refusals are told apart by ear |
| `win` | `feast-complete-a..b.opus` | Rising brass-bell arpeggio; glockenspiel cascade | The twelfth morsel is eaten |
| `restart` | `restart-sweep-a..b.opus` | Reverse airy sweep to a breathy pop; rising granular whoosh | `↻` or `R` lays out a fresh board |
| `ui-click` | `ui-tap-a..b.opus` | Crisp wooden tap; soft plastic click | Any on-screen direction button, layered under the resulting cue |

`sfx/manifest.txt` is the canonical form of this table (`file | event id | description | usage context`);
`sfx/manifest.json` carries the generator prompts and durations, `sfx/manifest.md` is the readable mirror.

---

## 10. Localization

Nine locales ship: **en-US, en-GB, es-419, es-ES, de-DE, fr-FR, fr-CA, pt-BR, it-IT**.

- Strings live in one table in `js/i18n.js`. Markup carries `data-i18n` (text content) and
  `data-i18n-aria` (`aria-label`); `apply()` fills both at `DOMContentLoaded`, and `document.documentElement.lang`
  is set to the resolved tag.
- Selection order: `?lang=` query parameter → `localStorage['hf.lang']` → `navigator.languages` in order,
  matching the exact tag first, then the base language via a fallback map (`es → es-419`, `fr → fr-FR`,
  `pt → pt-BR`, `en → en-US`, `de → de-DE`, `it → it-IT`) → `en-US`. Storage access is wrapped in try/catch
  for private-mode and opaque-origin contexts.
- The game name "Hollow Feast" is a proper noun and is never translated. Score and progress are digits and
  the `n / 12` separator, so no locale changes what the HUD or the automated playthrough reads.
- Expansion: the rule line is capped at 62 characters wide and wraps freely; HUD labels sit in a flex row
  with independent cells; button labels are arrow glyphs with translated `aria-label`s, so a 30 % longer
  German or French string changes no layout. The longest shipped string (de-DE `howto`) already runs ~45 %
  longer than en-US and fits at 390 px wide.

---

## 11. Accessibility

- **Keyboard-only path is complete**: arrows/WASD play, `R` restarts, Tab reaches all five buttons in DOM
  order with a 2 px `#6ea3ff` focus ring at 1 px offset. There are no modals, so there is no focus trap and
  no focus restoration problem.
- **Announcements**: the HUD row is `aria-live="polite"`, so score and progress are read after each move;
  the win banner is `role="status"`. The WebGL-unavailable message is `role="alert"`.
- **Labels**: the canvas, each direction button, the restart button and the control bar all carry
  translated `aria-label`s; the arrow glyphs are decorative, so no assistive technology depends on them.
- **Contrast**: body text `#e8ecf4` and HUD values `#ffffff` on `#0b0d12` far exceed 7:1; the `#b9c6dc` rule
  line and `#9aa7bd` subtitle exceed 7:1 and 4.5:1 respectively; the `#f6e7b2` banner text sits on an 82 %
  opaque `#0b0d12` plate rather than on the scene.
- **Reduced motion**: the only animation on the page is guarded by `prefers-reduced-motion`. Game state
  itself never animates, so nothing is lost.
- **Target sizes**: 56×44 CSS px, dropping to 50×36 only below 520 px of viewport height, laid out in one
  row with no overlap.
- **No colour-only information**: the next morsel is marked by an 18 % scale increase as well as by glow,
  and the two refusal kinds differ in timbre, not only in pitch.

---

## 12. StarHermit integration

`starhermit.txt` declares `name=Hollow Feast`, `launch=index.html`, an `owner` id, and `cover=coverart.png`,
which is what the platform needs to list and launch the game (https://wiki.starhermit.com/).

The game uses **no** further platform features today, and this is a scope decision, not an oversight:
there is no identity lookup, no presence, no leaderboard submission, no achievement delivery, no cloud save
and no hosted session. Every result is local and non-authoritative, so a global board would be unverifiable
without a replay validator. `starhermit.txt` deliberately declares no `server=` key: `server.js` is a static
development file host, not a game script, and it is never uploaded as authoritative logic.

The rules engine is already shaped for the platform features it does not yet use: pure functions, a
serialisable state, a monotonic `tick`, an explicit terminal flag, and a fully deterministic replay from an
input log — the pieces a validated leaderboard submission would need.

---

## 13. Technical architecture

- **Layering.** `rules.js` (pure, no globals beyond its export) ← `game.js` (all DOM and three.js) ←
  `index.html` (structure and palette). `js/sfx.js` and `js/i18n.js` are independent leaves that expose
  `window.__hf_sfx` / `window.__hf_i18n` and degrade to no-ops if absent — `game.js` null-checks the audio
  module on every call.
- **Determinism.** `applyAction` is a pure function of `(state, dir)` and never mutates its input
  (asserted in `tests/rules.test.mjs`), so an input log replays to an identical state. `game.js` may adopt a
  pre-seeded `window.__hf_state` on boot and falls back to the authored layout if it is malformed.
- **Persistence.** None by design, except the optional `hf.lang` locale preference read from
  `localStorage`. A reload is a fresh board.
- **Rendering budget.** One `requestAnimationFrame` render loop; ~14 meshes, 2 lights, no post-processing,
  no shadow maps; device pixel ratio capped at 2. Camera refitting runs only on resize, driven by a
  `ResizeObserver` on `#game-wrap` plus the `resize` event, and converges in at most 12 iterations.
  Textures load asynchronously and only swap the board material in on success.
- **Serving.** `server.js` resolves paths under the game root, rejects traversal and dotfiles, and returns
  403 for `tests/`, `tools/` and `node_modules/`. `.webp` and `.opus` carry correct MIME types so the
  backdrop, board texture and clips load without sniffing.
- **Test hook.** `window.__hf_debug.frameBounds()` returns the NDC bounding box of the playfield fit points,
  the void's NDC position and the canvas size. This is the only non-player surface `game.js` exposes, and
  the e2e suite uses it to prove framing rather than to drive play.

---

## 14. Testing and acceptance criteria

**`npm test`** (`node --test tests/*.test.mjs`, zero dependencies) — 8 tests over `rules.js`: initial board
shape, off-board illegality, order-gated edibility, the cost of an illegal action, non-mutation of the input
state, the full 12-morsel scoring ladder to 450, scoring nothing for re-entering an eaten cell, and the
sticky terminal state.

**`npm run test:e2e`** (`tests/e2e.mjs`, playwright-core + headless Chrome) — a rules prelude, then four
passes over the real UI: desktop 1280×800, mobile 390×844 (touch), landscape phone 844×390 (touch) and a
short desktop 1280×600. Each pass loads the page, asserts the title, canvas and all five buttons are
visible, rejects an out-of-bounds move, solves the board by **clicking the on-screen buttons** with keyboard
arrows mixed in every fourth move, verifies the HUD after every move against the scoring formula, asserts the
win banner appears, checks post-win inertness, restarts by button and by `R` (asserting the banner clears),
and samples the canvas for non-blank pixels. Any `pageerror` or `console.error` (other than known GL driver
noise) fails the pass.

Acceptance bar, as checkable statements — all currently true:

- Every implemented feature is reachable in a browser with a mouse, a finger, or a keyboard alone.
- No console errors or warnings at any of the four viewports.
- After every move at every viewport, the whole slab and the void project inside the canvas, and the title,
  rule line, HUD and all five buttons lie inside the viewport with no page scroll in either axis.
- A first-time player is told the rule before their first input, and the next legal target is always marked
  on the board.
- Every input is acknowledged visually and audibly, including refused ones.
- The game is fully playable end-to-end by automation through the visible UI, with no internal shortcuts.

---

## 15. Asset inventory

| Path | Purpose | Source | Status |
|---|---|---|---|
| `assets/board-slate.webp` | 512×512 slate texture mapped onto the board plane; flat `#3a5f8a` remains the fallback | FLUX.2 klein, seed 5602, cropped + WebP q88 | Generated this pass, wired in `game.js` |
| `assets/backdrop.webp` | 1280×720 cool/warm haze behind the whole page (`body` background) | FLUX.2 klein, seed 5603, WebP q80 | Generated this pass, wired in `index.html` |
| `coverart.png` | 1200×675 platform cover: the void over the laid table | FLUX.2 klein, seed 5601, palette-reduced PNG (169 KB) | Regenerated this pass, replaces a generic placeholder; declared in `starhermit.txt` |
| `icon.png`, `favicon.svg` | Platform icon and tab favicon | Authored earlier | Shipped |
| `sfx/void-slide-a..d.opus` | `void-move` variants | MOSS-SFX | Shipped |
| `sfx/gobble-a..d.opus` | `eat` variants | MOSS-SFX | Shipped |
| `sfx/thud-denied-a..b.opus` | `invalid` variants | MOSS-SFX | Shipped |
| `sfx/wrong-order-a..b.opus` | `wrong-order` variants | MOSS-SFX, 100 steps | Generated this pass, wired in `js/sfx.js` |
| `sfx/restart-sweep-a..b.opus` | `restart` variants | MOSS-SFX, 100 steps | Generated this pass, wired in `js/sfx.js` |
| `sfx/feast-complete-a..b.opus` | `win` variants | MOSS-SFX | Shipped |
| `sfx/ui-tap-a..b.opus` | `ui-click` variants | MOSS-SFX | Shipped |
| `js/three.module.min.js`, `js/three.core.min.js` | three.js r178 runtime | Vendored upstream | Shipped |

No 3D model assets and no character animations: the two shapes in the scene are procedural primitives, and
there is no humanoid to animate.

---

## 16. Known limitations

- **One board, forever.** The layout is a constant. Once the order is memorised, a solve is muscle memory;
  there is nothing further to master.
- **No persistence.** Best score, clean-run count and the locale choice (beyond a manually written
  `hf.lang`) do not survive a reload.
- **Refusals are counted but never shown.** `invalidActions` exists in state and is used for tie-breaking in
  this document, but no HUD cell displays it, so the "clean run" goal is currently only in the player's head.
- **No gamepad support.** Keyboard, pointer and touch only.
- **No audio settings in the UI.** `setMuted` / `setVolume` exist on `window.__hf_sfx` but nothing on screen
  calls them; the player's only recourse is the browser tab mute.
- **The canvas is not clickable.** Tapping a morsel does nothing; all input goes through the buttons and keys.
- **`seed` is stored but unused.** Every board is the authored one.

## Design intent not yet implemented

- Seeded, generated layouts: `rules.js::initialState` already accepts and stores a `seed`, and nothing in
  the engine depends on the authored order, but no generator or solvability validator ships.
- An `invalidActions` HUD cell and an end-of-round breakdown (morsels, combo total, refusals) rather than a
  single score number.
- A StarHermit leaderboard for fastest clean solve, validated from the deterministic input log.
- In-UI audio and locale controls bound to the existing `__hf_sfx` and `__hf_i18n` APIs.
