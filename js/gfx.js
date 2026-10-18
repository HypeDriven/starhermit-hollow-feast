'use strict';

/*
 * Hollow Feast graphics quality model: presets, per-category overrides,
 * hardware-level detection, per-preset budgets and a cost summary. Pure (no DOM, no three.js), so the Graphics
 * panel, the renderer and the unit tests agree on what a setting means.
 * Exported to window.__hf_gfx and to CommonJS for tests.
 */
(function (root) {
  const PRESETS = ['low', 'balanced', 'high', 'ultra'];

  // Category -> allowed tiers, cheapest first.
  const CATEGORIES = {
    shadows: ['off', 'low', 'medium', 'high'],
    ao: ['off', 'on', 'high'],
    bloom: ['off', 'on'],
    grade: ['off', 'on'],
    antialias: ['off', 'fxaa', 'smaa', 'msaa'],
    reflections: ['off', 'on'],
    detail: ['plain', 'detailed'],
    particles: ['off', 'low', 'high'],
  };

  // Each preset is a row of tiers, a render scale (multiplies the device pixel
  // ratio) and a device-pixel-ratio cap, so Low never renders above 1x.
  const TABLE = {
    low: { scale: 1, dprCap: 1, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', particles: 'off' },
    balanced: { scale: 1, dprCap: 1.5, shadows: 'low', ao: 'off', bloom: 'on', grade: 'on', antialias: 'fxaa', reflections: 'on', detail: 'detailed', particles: 'low' },
    high: { scale: 1, dprCap: 2, shadows: 'medium', ao: 'on', bloom: 'on', grade: 'on', antialias: 'smaa', reflections: 'on', detail: 'detailed', particles: 'high' },
    ultra: { scale: 1.25, dprCap: 2, shadows: 'high', ao: 'high', bloom: 'on', grade: 'on', antialias: 'msaa', reflections: 'on', detail: 'detailed', particles: 'high' },
  };

  const SHADOW_MAP = { off: 0, low: 512, medium: 1024, high: 2048 };
  const PARTICLES = { off: 0, low: 40, high: 120 };

  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // StarHermit hardware level (0–20, js/gpu-level.js → window.StarHermitGpu) at which Auto starts
  // choosing each preset. 0 = Galaxy S20 / Intel UHD or weaker (every software renderer), 20 = RTX 5090;
  // phones, tablets and ≤ 4 GB machines are capped at level 9 (Balanced).
  const LEVELS = { low: 0, balanced: 4, high: 10, ultra: 17 };

  /*
   * Per-preset asset and effect budgets, each tuned to hold 60 FPS on the weakest GPU Auto gives the
   * preset (Low: level 0 phones / Intel UHD; Balanced: level 4 Iris Xe / Adreno 735; High: level 10
   * GTX 1070 / RTX 3050; Ultra: level 17 RTX 4080), measured with tests/gfx-bench.mjs. Gameplay is
   * identical on every preset; only visuals change.
   *   material   board, slab, table, plates, morsels and void: 'lambert' (Low) | 'standard' (Balanced) |
   *              'physical' (clear-coated plates, morsels and void; High/Ultra)
   *   voidSeg    void sphere width/height segments
   *   plateSeg   radial segments of the lathed plates (Table detail on)
   *   texture    slate board and walnut table texture size in px (slate downscaled from its 512 px file,
   *              walnut grain generated at this size)
   *   aniso      texture anisotropic filtering (capped by the GPU)
   *   motes      multiplies the floating motes of the Particles tier (40 low / 120 high), then scaled by
   *              the hardware level within the preset (≤ 2×)
   *   bloomRes / aoRes  bloom and GTAO resolution as a fraction of the frame
   */
  const BUDGETS = {
    low: { material: 'lambert', voidSeg: 20, plateSeg: 20, texture: 128, aniso: 1, motes: 0.5, bloomRes: 0.5, aoRes: 0.5 },
    balanced: { material: 'standard', voidSeg: 32, plateSeg: 32, texture: 256, aniso: 4, motes: 1, bloomRes: 0.5, aoRes: 0.5 },
    high: { material: 'physical', voidSeg: 48, plateSeg: 48, texture: 512, aniso: 8, motes: 1, bloomRes: 0.5, aoRes: 0.5 },
    ultra: { material: 'physical', voidSeg: 64, plateSeg: 64, texture: 1024, aniso: 16, motes: 1.5, bloomRes: 1, aoRes: 1 },
  };
  /** Largest mote count any preset/level can ask for (120 × 1.5 × 2). */
  const MOTE_MAX = 360;

  function gpuApi() {
    if (root && root.StarHermitGpu) return root.StarHermitGpu;
    try { return typeof require === 'function' ? require('./gpu-level.js') : null; } catch (_) { return null; }
  }

  /** Hardware level 0–20 for an unmasked renderer string plus StarHermitGpu.detectSystem() facts. */
  function detectLevel(gpu, system) {
    const G = gpuApi();
    if (!G) return LEVELS.balanced;
    return G.detectLevel(Object.assign({ webgl: true, webgl2: true }, system || {}, { gpu: String(gpu || '') }));
  }

  /** Auto preset for a hardware level: Low 0, Balanced 4, High 10, Ultra 17. */
  function presetForLevel(level) {
    const G = gpuApi();
    if (G) return G.presetForLevel(level, LEVELS);
    return PRESETS.filter(function (p) { return LEVELS[p] <= level; }).pop() || 'low';
  }

  /** Best preset for this GPU; phones and tablets are capped at Balanced by the hardware level. */
  function detectPreset(gpu, system) {
    return presetForLevel(detectLevel(gpu, system));
  }

  /** A preset's concrete budget for a hardware level (motes scale within the preset, ≤ 2×). */
  function budget(preset, level) {
    const b = Object.assign({}, BUDGETS[preset] || BUDGETS.balanced);
    const floor = LEVELS[preset] || 0;
    const G = gpuApi();
    const k = G ? Math.min(2, G.scaleBudget(1, isFinite(level) ? level : floor, floor)) : 1;
    b.motes = Math.round(b.motes * k * 100) / 100;
    return b;
  }

  /**
   * Resolve saved settings into concrete tiers.
   * saved: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier };
   * level: the hardware level (a chosen preset without one uses its floor level).
   */
  function resolve(saved, detected, level) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const auto = PRESETS.indexOf(s.preset) < 0;
    const preset = auto ? (PRESETS.indexOf(detected) >= 0 ? detected : 'balanced') : s.preset;
    const row = TABLE[preset];
    const userScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
    const out = { preset: preset, auto: auto, userScale: userScale, scale: row.scale * userScale, dprCap: row.dprCap };
    Object.keys(CATEGORIES).forEach(function (cat) {
      out[cat] = CATEGORIES[cat].indexOf(s[cat]) >= 0 ? s[cat] : row[cat];
    });
    out.level = isFinite(level) && level !== null ? Number(level) : LEVELS[preset];
    out.budget = budget(preset, out.level);
    out.motes = Math.min(MOTE_MAX, Math.round(PARTICLES[out.particles] * out.budget.motes));
    out.adaptive = s.adaptive !== false;
    out.showFps = !!s.show_fps;
    // The post chain runs only when an effect needs it; otherwise the canvas's own MSAA is used.
    out.post = out.ao !== 'off' || out.bloom === 'on' || out.grade === 'on'
      || out.antialias === 'fxaa' || out.antialias === 'smaa';
    return out;
  }

  /** The preset's own tier for a category (for "From preset (...)" labels). */
  function presetTier(preset, cat) {
    const row = TABLE[preset];
    return row ? row[cat] : undefined;
  }

  /** Choosing a preset clears every per-category override. */
  function choosePreset(saved, preset) {
    const out = {};
    const s = saved || {};
    ['render_scale', 'adaptive', 'show_fps'].forEach(function (k) { if (k in s) out[k] = s[k]; });
    out.preset = PRESETS.indexOf(preset) >= 0 ? preset : 'auto';
    return out;
  }

  const EN = {
    noShadows: 'no shadows', shadows: 'shadows', ao: 'ambient occlusion', aoHigh: 'full ambient occlusion',
    bloom: 'bloom', reflections: 'reflections', noAA: 'no anti-aliasing', particles: 'motes',
  };

  /** One-line cost summary; `label` lets the panel localise the words. */
  function describe(r, pixels, label) {
    const L = function (k) { return (label && label(k)) || EN[k]; };
    const parts = [
      r.shadows === 'off' ? L('noShadows') : SHADOW_MAP[r.shadows] + '² ' + L('shadows'),
      r.ao === 'off' ? null : r.ao === 'high' ? L('aoHigh') : L('ao'),
      r.bloom === 'on' ? L('bloom') : null,
      r.reflections === 'on' ? L('reflections') : null,
      r.motes ? r.motes + ' ' + L('particles') : null,
      r.antialias === 'off' ? L('noAA') : r.antialias.toUpperCase(),
      pixels ? pixels[0] + '×' + pixels[1] + ' px' : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }

  const api = {
    PRESETS: PRESETS, CATEGORIES: CATEGORIES, SHADOW_MAP: SHADOW_MAP, PARTICLES: PARTICLES,
    LEVELS: LEVELS, BUDGETS: BUDGETS, MOTE_MAX: MOTE_MAX,
    detectLevel: detectLevel, presetForLevel: presetForLevel, budget: budget, detectPreset: detectPreset, resolve: resolve, presetTier: presetTier, choosePreset: choosePreset, describe: describe,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__hf_gfx = api;
})(typeof window !== 'undefined' ? window : null);
