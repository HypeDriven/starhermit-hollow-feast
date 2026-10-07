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
| `index.html` | Entry point: layout, palette, header, canvas box, HUD, control bar, win banner, Settings dialog (Graphics + Account), StarHermit toast, import map. Loads `ui-scale.js` and `browser-guard.js` in `<head>`, then scripts in order i18n → rules → sfx → starhermit-sdk → platform → gfx → three.js → post add-ons (optional) → game. |
| `rules.js` | Pure rules engine. `initialState`, `isLegal`, `applyAction`. No DOM, no three.js. Exported to `window.__hf_rules` and to CommonJS for tests. |
| `game.js` | Presentation and input: scene, camera fit, mesh sync, HUD, keyboard/pointer handling, audio event dispatch, `window.__hf_debug` framing hook. |
| `js/starhermit-sdk.js` | Shared StarHermit client (`window.StarHermit`), an unmodified copy of `tools/starhermit-sdk.js`. |
| `js/platform.js` | `window.__hf_platform`: StarHermit adapter over the SDK — save document (localStorage + cloud slot), HUD player/sync cells, settings KV, key bindings, invite link, sign-in. |
| `js/i18n.js` | Nine-locale string table, locale selection, `data-i18n` / `data-i18n-aria` application. |
| `js/sfx.js` | Web Audio engine: event → clip round-robin with a procedural synth fallback. |
| `js/three.module.min.js`, `js/three.core.min.js` | Vendored three.js r178 (import-mapped as `three`). |
| `js/gfx.js` | Pure graphics quality model: presets, per-effect tiers, GPU detection, `resolve`, `presetTier`, `choosePreset`, `describe`. Exported to `window.__hf_gfx` and CommonJS. |
| `js/post.js`, `js/addons/**` | Optional render add-ons: EffectComposer passes (Render, GTAO, UnrealBloom, Shader, Output, SMAA), FXAA shader and RoomEnvironment, vendored from three.js r178 `examples/jsm` (import-mapped as `three/addons/`). Loaded dynamically; a failure only disables post-processing and reflections. |
| `assets/board-slate.webp` | Board surface texture. |
| `assets/backdrop.webp` | Page background haze. |
| `sfx/*.opus`, `sfx/manifest.txt` | 18 one-shot clips; `manifest.txt` is canonical, `manifest.json` drives regeneration, `manifest.md` is the readable mirror. |
| `server.js` | Static dev host. Serves the game root, refuses `tests/`, `tools/`, `node_modules/` and dotfiles. |
| `tests/rules.test.mjs` | `npm test` — rules contract unit tests. |
| `tests/gfx.test.mjs` | `npm test` — graphics quality model unit tests. |
| `tests/platform.test.mjs` | `npm test` — `js/platform.js` over the SDK with a stubbed fetch and launch fragment. |
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
Since every board is the same board, that ordering is fully determined by the input log. `game.js::onWon`
applies exactly this ordering when replacing the persisted best line (score, then refusals, then ticks).

### RNG, undo, hints

The shipped layout is a fixed authored constant, so `initialState` accepts a `seed` and stores it but no
code path randomises anything today; identical input sequences always produce identical states.
There is no undo and no hint button — the "next" glow *is* the hint, always on.

---

## 5. Modes and progression

The game ships **one mode**: a single fixed board, played immediately, restartable. There is no mode select,
no difficulty setting, no daily seed and no unlock track. Mid-round progress and personal records do persist
between loads via the platform save document (§12), but the mode question is deliberate at the current scope:
the board is a twelve-move exercise whose whole content is its order, and a mode picker would cost more of
the player's first ten seconds than it returns. See "Design intent not yet implemented" for the
seeded-layout hook that already exists in the rules.

---

## 6. Controls and interaction

| Input | Action | Feedback |
|---|---|---|
| `←` `→` `↑` `↓` | Step the void | Void mesh moves; movement whoosh, or a refusal cue |
| `A` `D` `W` `S` | Step the void | Identical to the arrows |
| `R` | Restart the round | Fresh board, reset HUD, restart sweep |
| On-screen `←` `↑` `↓` `→` buttons (tap or click) | Step the void | UI tap layered under the move/refusal cue |
| On-screen `↻` button | Restart the round | Restart sweep |
| On-screen `⚙` button | Open the Settings dialog | UI tap; focus moves into the dialog |
| `Esc` (dialog open) | Close the Settings dialog | Focus returns to `⚙` |

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
- While the Settings dialog is open it owns the keyboard: arrows and WASD drive its controls, never the
  void, `Tab` cycles inside it and `Esc` closes it; a click on the dimmed backdrop also closes it.
- Buttons are 56×44 CSS px (50×36 under 520 px of height), with a visible `:focus-visible` outline in
  `#6ea3ff` and a hover brightness lift.

---

## 7. Screens and UI flow

There is one screen plus a Settings dialog. The state machine is `loading → playing ⇄ won`, with
`won → playing` on restart; the dialog can open over either state and pauses nothing (there is no timer):

- **loading** — HTML paints immediately with the header, HUD at `0` / `0 / 12`, and controls; the canvas
  fills in once the module graph resolves. If WebGL is unavailable, `game.js` replaces the canvas with a
  `role="alert"` paragraph explaining that the browser cannot render the board, and the page stays intact.
- **playing** — HUD live, board interactive.
- **won** — `#win-banner` ("Feast complete!") appears centred over the board with `role="status"`, all
  further steps are refused, and restart is the only meaningful action. The banner is `pointer-events: none`
  so it can never swallow a click.
- **settings** — `#settings-panel` (`role="dialog"`, `aria-modal`), opened by the `⚙` button at the end of the
  control bar. It holds the **Graphics** section (§8). The card scrolls inside itself, so it fits portrait and
  landscape phones without cutting anything off.

Layout is a single vertical flex column: header (title, subtitle, rule line) → `#game-wrap` → HUD row →
control bar (four arrows, restart, settings). `#game-wrap` is the only flexible row (`flex: 1 1 auto`, `min-height: 140px`), so the HUD and
the controls can never be pushed below the fold; the canvas takes what is left, clamped to an aspect ratio
between 1.0 and 1.6, and the camera refits. Under 520 px of viewport height the subtitle is dropped and the
title, rule line, HUD and buttons all step down a size. Nothing on this page may ever be cut off: the
title, the rule line, both HUD cells, all six buttons, the whole slab and the void at any cell must sit
inside the viewport, and the document must not scroll in either axis — `tests/e2e.mjs` asserts exactly this
after every single move at four viewports.
Above a 1600×1000 viewport `ui-scale.js` sets `--ui-scale` (`min(w/1600, h/1000)`, capped at 2.5) and `body` is
CSS-`zoom`ed by it (its `100dvh` height and the toast's `100vw` cap are divided by it), so the page at 3840×2160
is the ~1778×1000 layout magnified; the canvas multiplies its pixel ratio by `UIScale.value` to stay sharp.

---

## 8. Art direction

**Palette** (as authored in `index.html` and `game.js`):

| Role | Hex |
|---|---|
| Page ground | `#0b0d12` |
| Canvas/scene clear | `#141a26` |
| Board slate tint | `#3a5f8a` (replaced by `assets/board-slate.webp` when it loads) |
| Morsel | `#ff8c3a`, flat-shaded, emissive `#ff8c3a` at 0.85 when next (1.35, pulsing, with bloom on) |
| The void | `#f6e7b2` with `#caa64d` emissive |
| Body text | `#e8ecf4`; secondary `#9aa7bd`; rule line `#b9c6dc` |
| Controls | `#233047`; focus ring `#6ea3ff` |

**Shape language.** Two shapes only, and they read as predator and prey: a smooth 32×32 sphere for the void,
flat-shaded icosahedra for the morsels. Flat shading gives the food facets that catch the directional light,
so twelve identical objects still read individually against the slab.

**Composition.** Fixed three-quarter diorama camera along `(0, 16.5, 15)`, solved by `game.js::fitCamera` to
fill 92 % of the tighter viewport axis. The hero of the screen is the slab; the void is the only bright
object on it, and the single glowing morsel is the only competing highlight.

**Lighting.** ACES filmic tone mapping into sRGB output. A cool-sky / warm-table hemisphere fill, a low flat
ambient and one warm directional key from `(-4, 10, 8)` — enough contrast for facets, never enough to blow out
the pale void. The key's orthographic shadow box is fitted in light space to every playfield fit point (slab
and the void at any cell), so the whole shadow map lands on the board.

**Graphics.** Every effect is additive over the original look; the Low preset renders the original flat slab
with no post chain at 1× pixel ratio. Optional effects: PCF soft shadows from the key (512²–2048²);
image-based reflections from a PMREM-filtered `RoomEnvironment` on physical materials (clearcoated morsels,
plates and void); a "detailed" table (a thick slate slab, a walnut table top with procedural grain, and
lathed ceramic plates under the twelve courses that stay behind as the eaten record); a warm point light
that pools under the next morsel; drifting warm motes (40 or 120 additive points); GTAO contact darkening;
UnrealBloom at threshold 0.9 so only the next morsel's glow and the void's sheen halo (the next-morsel
emissive rises to 1.35 when bloom is on); a colour grade (S-curve, +10 % saturation, cool shadows / warm
highlights) with vignette; and FXAA/SMAA/MSAA anti-aliasing. The post chain is RenderPass → GTAO → bloom →
OutputPass → grade → SMAA/FXAA on a half-float target (4× multisampled for MSAA) and runs only when an effect
needs it. Settings live in the Settings dialog's **Graphics** section: Quality (Auto — chosen from the
WebGL renderer string, software renderers get Low, discrete GPUs and Apple M get High, others Balanced,
touch devices capped at Balanced — then Low, Balanced, High, Ultra); a render scale slider (50–200 % of the
preset's; the device pixel ratio is capped at 1 / 1.5 / 2 / 2 per preset); one select per effect — Shadows,
Ambient occlusion, Bloom, Colour grade, Anti-aliasing, Reflections, Table detail, Floating motes — defaulting
to "From preset (…)"; Adaptive resolution (on by default: over ~90-frame windows the scale steps down 0.1 to
a 0.6 floor above 26 ms and back up 0.05 below 14 ms); Show frame rate (off by default; a top-left readout
that never takes pointer events); and a summary line "GPU · cost summary · W×H px". Choosing a preset clears
the per-effect overrides. Changes apply live and persist in `localStorage['hf.gfx.v1']`. The canvas carries
`data-gfx-preset`, `data-gfx-post` and one `data-gfx-<effect>` attribute per effect. Canvas MSAA is fixed when
the context is created, so a boot with a non-MSAA choice renders a live switch to MSAA through the
multisampled post target, and a live switch to "Off" from a MSAA boot keeps the canvas's own smoothing until
the next load. If the add-ons fail to load or the chain throws, the board renders directly and the panel says
post-processing is unavailable.

**Typography.** System UI stack throughout. 28 px semibold title, 13 px subtitle and rule line, 15 px HUD
labels over 20 px semibold values, so the numbers win the HUD at a glance.

**Motion.** State changes are instantaneous snaps, not tweens, so the board never lies about where the void
is. Ambient motion is decorative only: the void idles with a slow ±0.09 bob, the next morsel turns and its
glow and light pulse, and the motes drift. All of it stops under `prefers-reduced-motion: reduce` (checked
live). The 220 ms win-banner pop is wrapped in `@media (prefers-reduced-motion: no-preference)`; with reduced
motion the banner simply appears.

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
  is set to the resolved tag. The Settings dialog's strings (Graphics labels, tier names, "Auto (detected: …)",
  "From preset (…)", the post-processing note and the cost-summary words) are in all nine locales; `game.js`
  reads them through `__hf_i18n.t` when it builds the Graphics controls. GPU names and AA acronyms stay as-is.
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

- **Keyboard-only path is complete**: arrows/WASD play, `R` restarts, Tab reaches all six buttons in DOM
  order with a 2 px `#6ea3ff` focus ring at 1 px offset. The Settings dialog is the only modal: opening it
  focuses the Quality select, Tab is trapped inside it, `Esc` closes it and focus returns to the opener.
- **Announcements**: the HUD row is `aria-live="polite"`, so score and progress are read after each move;
  the win banner is `role="status"`. The WebGL-unavailable message is `role="alert"`.
- **Labels**: the canvas, each direction button, the restart button and the control bar all carry
  translated `aria-label`s; the arrow glyphs are decorative, so no assistive technology depends on them.
- **Contrast**: body text `#e8ecf4` and HUD values `#ffffff` on `#0b0d12` far exceed 7:1; the `#b9c6dc` rule
  line and `#9aa7bd` subtitle exceed 7:1 and 4.5:1 respectively; the `#f6e7b2` banner text sits on an 82 %
  opaque `#0b0d12` plate rather than on the scene.
- **Reduced motion**: the banner pop and all ambient scene motion (void bob, next-morsel spin/pulse, motes)
  are guarded by `prefers-reduced-motion`. Game state itself never animates, so nothing is lost.
- **Target sizes**: 56×44 CSS px, dropping to 50×36 only below 520 px of viewport height, laid out in one
  row with no overlap.
- **No colour-only information**: the next morsel is marked by an 18 % scale increase as well as by glow,
  and the two refusal kinds differ in timbre, not only in pitch.

---

## 12. StarHermit integration

`starhermit.txt` declares `name=Hollow Feast`, `launch=index.html`, an `owner` id, `cover=coverart.png`
(https://wiki.starhermit.com/), and the keyboard actions `control.left=ArrowLeft+KeyA`,
`control.right=ArrowRight+KeyD`, `control.up=ArrowUp+KeyW`, `control.down=ArrowDown+KeyS`,
`control.restart=KeyR`.

`js/starhermit-sdk.js` (the shared client, unmodified) loads before `js/platform.js`, which calls
`StarHermit.init()` as it boots (before `game.js`). The SDK reads the launch token from `#game_token=` (or
the `#access_token=` sign-in return), strips it from the URL, takes the slug from `game_scope` and renews the
token before expiry. Signed in, the game:

- shows the profile nickname (never `/api/v1/me`, never usernames; `"Player " + id` fallback) and avatar
  in the HUD player cell next to the sync chip;
- keeps progress and personal records — the best line (score, refusals, ticks), win/clean-win counts and
  the mid-round board — in one JSON save document: `localStorage['hf.save.v1']` is the offline cache, the
  cloud-save slot `game:<slug>` is loaded remote-preferred at boot (nothing is written until that load
  settles; a save made meanwhile is dropped if a remote doc was adopted) and written with a 2 s debounce and a
  keepalive flush on `pagehide`/hidden; the sync cell shows local/loading/saving/synced/offline/error;
- mirrors the Graphics settings (`hf.gfx.v1`) to the per-player settings KV on every change and applies the
  platform value over the local one at boot;
- routes `keydown` by `event.code` through `StarHermit.loadBindings`; when the player has rebound keys, the
  how-to line appends the effective keys;
- offers **Invite a friend** in Settings → Account, copying `StarHermit.inviteLink()` with a toast.

Served from `<id>.starhermit.com` without a token, Settings → Account offers **Sign in with StarHermit**.
If renewal is refused, a toast says the player is signed out and play continues locally. Account strings are
localized in all nine locales (`sh.*` keys in `js/i18n.js`). With no token (local dev, or a player who
refuses auth) the adapter is fully inert — zero network calls — and play is identical to a local session.

Not used: there is no `server=` key and no platform script (`server.js` is a static development file host),
so sessions, matchmaking, session invites, chat, replays, platform achievements and leaderboards have nothing
to drive them; every result is local and non-authoritative. Realtime rooms and voice are out of scope.

The rules engine is already shaped for a future validated leaderboard: pure functions, a serialisable state,
a monotonic `tick`, an explicit terminal flag, and a fully deterministic replay from an input log.

---

## 13. Technical architecture

- **Layering.** `rules.js` (pure, no globals beyond its export) ← `game.js` (all DOM and three.js) ←
  `index.html` (structure and palette). `js/sfx.js`, `js/i18n.js` and `js/platform.js` are independent
  leaves that expose `window.__hf_sfx` / `window.__hf_i18n` / `window.__hf_platform` and degrade to no-ops
  if absent — `game.js` null-checks the audio module on every call and treats the platform adapter as
  optional (no token → local-only records, zero network calls).
- **Determinism.** `applyAction` is a pure function of `(state, dir)` and never mutates its input
  (asserted in `tests/rules.test.mjs`), so an input log replays to an identical state. `game.js` may adopt a
  pre-seeded `window.__hf_state` on boot and falls back to the authored layout if it is malformed.
- **Persistence.** The platform save document (`localStorage['hf.save.v1']`, cloud-mirrored when a launch
  token is present; see §12) holds the best line, win/clean-win counts and the mid-round board, so a reload
  resumes an unfinished round. The `hf.lang` locale preference stays an independent localStorage read.
- **Rendering budget.** One `requestAnimationFrame` render loop. At Low: ~14 meshes, 3 lights, no
  post-processing, no shadow maps, pixel ratio capped at 1. Higher presets add ~20 detail meshes, one point
  light, up to 120 points, a shadow map and the post chain (§8); the pixel ratio is
  `min(dpr, preset cap) × preset scale × render scale × adaptive scale`, and the chain is rebuilt only when
  its key (effects, size, ratio) changes. Camera refitting runs only on resize, driven by a
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

**`npm test`** (`node --test tests/*.test.mjs`, zero dependencies) — 8 tests over `js/gfx.js` (GPU-string
detection, the touch cap, auto vs explicit presets, overrides and invalid values, render-scale clamping,
adaptive/fps defaults, preset choice clearing overrides, and the cost summary), 8 tests over `rules.js` (initial board
shape, off-board illegality, order-gated edibility, the cost of an illegal action, non-mutation of the input
state, the full 12-morsel scoring ladder to 450, scoring nothing for re-entering an eaten cell, and the
sticky terminal state) plus 4 over `js/starhermit-sdk.js` + `js/platform.js` in a vm sandbox with a stubbed fetch: offline
inertness (zero fetches, localStorage cache, `local` sync state), the hosted path (token read and stripped,
nickname in the HUD cell, cloud save through `game:<slug>` with Bearer on every call, remote-preferred load on
the next launch), the settings KV PATCH, bindings and invite link, and sign-in offered on the hosted domain.

**`npm run test:e2e`** (`tests/e2e.mjs`, playwright-core + headless Chrome) — a rules prelude, then four
passes over the real UI: desktop 1280×800, mobile 390×844 (touch), landscape phone 844×390 (touch) and a
short desktop 1280×600. Each pass loads the page, asserts the title, canvas and all five buttons are
visible, rejects an out-of-bounds move, solves the board by **clicking the on-screen buttons** with keyboard
arrows mixed in every fourth move, verifies the HUD after every move against the scoring formula, asserts the
win banner appears, checks post-win inertness, restarts by button and by `R` (asserting the banner clears),
then opens Settings through the `⚙` button and drives the Graphics section — Auto is Low on the software GPU,
arrow keys go to the dialog not the void, Ultra, Low and High apply (`data-gfx-preset` / `data-gfx-post`), a
Bloom override to Off applies and shows in the summary, the dialog fits the viewport, `Esc` closes it, the
choices survive a reload, and choosing a preset clears the override — and samples the canvas for non-blank
pixels; then it checks StarHermit: standalone makes no `/api/v1` request and Settings shows no Account
section; a `#game_token=` launch against a stubbed API shows the nickname in the HUD, strips the token, loads
`game:<slug>`, and Settings → Invite a friend shows an on-screen toast. Any `pageerror`, `console.error` or `console.warn` (other than known GL driver noise) fails the pass.

Acceptance bar, as checkable statements — all currently true:

- Every implemented feature is reachable in a browser with a mouse, a finger, or a keyboard alone.
- No console errors or warnings at any of the four viewports, in any graphics preset.
- After every move at every viewport, the whole slab and the void project inside the canvas, and the title,
  rule line, HUD and all six buttons lie inside the viewport with no page scroll in either axis.
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
| `js/addons/**` | three.js r178 post-processing passes, shaders, `SimplexNoise`, `RoomEnvironment` | Vendored upstream `examples/jsm` (MIT, `js/addons/LICENSE`) | Shipped |

The walnut table grain, the mote sprite and the plate profile are generated in code, not shipped as files.

No 3D model assets and no character animations: the two shapes in the scene are procedural primitives, and
there is no humanoid to animate.

---

## 16. Known limitations

- **One board, forever.** The layout is a constant. Once the order is memorised, a solve is muscle memory;
  there is nothing further to master.
- **Records are minimal.** Only the best line, win/clean-win counts and the mid-round board persist
  (§12) — there are still no unlocks, seeded layouts, run history or any way to compare against other
  players.
- **Refusals are only visible in the best line.** `invalidActions` drives tie-breaking, and the HUD best
  cell shows the refusal count of the recorded best run (`450 · 0R · 12T`), but the current run's own
  refusal count is not displayed, so the "clean run" goal during play is only in the player's head.
- **No gamepad support.** Keyboard, pointer and touch only.
- **No audio settings in the UI.** The Settings dialog has only a Graphics section; `setMuted` / `setVolume`
  exist on `window.__hf_sfx` but nothing on screen calls them; the player's only recourse is the browser tab mute.
- **The canvas is not clickable.** Tapping a morsel does nothing; all input goes through the buttons and keys.
- **`seed` is stored but unused.** Every board is the authored one.

## Design intent not yet implemented

- Seeded, generated layouts: `rules.js::initialState` already accepts and stores a `seed`, and nothing in
  the engine depends on the authored order, but no generator or solvability validator ships.
- An `invalidActions` HUD cell and an end-of-round breakdown (morsels, combo total, refusals) rather than a
  single score number.
- A StarHermit leaderboard for fastest clean solve, validated from the deterministic input log.
- In-UI audio and locale controls bound to the existing `__hf_sfx` and `__hf_i18n` APIs.

## Browser interference

`browser-guard.js` (loaded from `index.html`) suppresses browser UI that gets in the way of play: the right-click context menu, the iOS long-press callout, copy / cut / paste, and page text selection. Text fields (inputs, textareas, selects, contenteditable) keep normal selection, context menu and clipboard behaviour.
