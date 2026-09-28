'use strict';

/*
 * Hollow Feast graphics quality model: presets, per-category overrides, GPU
 * detection and a cost summary. Pure (no DOM, no three.js), so the Graphics
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

  /** Best preset for this GPU, from the unmasked renderer string when exposed. */
  function detectPreset(gpu, mobile) {
    const g = String(gpu || '').toLowerCase();
    let p = 'balanced';
    if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) p = 'low';
    else if (/nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|amd radeon(?! graphics)|apple m\d/.test(g)) p = 'high';
    if (mobile && p === 'high') p = 'balanced';
    return p;
  }

  /**
   * Resolve saved settings into concrete tiers.
   * saved: { preset: 'auto'|preset, render_scale, adaptive, show_fps, <category>: 'preset'|tier }.
   */
  function resolve(saved, detected) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const auto = PRESETS.indexOf(s.preset) < 0;
    const preset = auto ? (PRESETS.indexOf(detected) >= 0 ? detected : 'balanced') : s.preset;
    const row = TABLE[preset];
    const userScale = clamp(Number(s.render_scale) || 1, 0.5, 2);
    const out = { preset: preset, auto: auto, userScale: userScale, scale: row.scale * userScale, dprCap: row.dprCap };
    Object.keys(CATEGORIES).forEach(function (cat) {
      out[cat] = CATEGORIES[cat].indexOf(s[cat]) >= 0 ? s[cat] : row[cat];
    });
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
      PARTICLES[r.particles] ? PARTICLES[r.particles] + ' ' + L('particles') : null,
      r.antialias === 'off' ? L('noAA') : r.antialias.toUpperCase(),
      pixels ? pixels[0] + '×' + pixels[1] + ' px' : null,
    ];
    return parts.filter(Boolean).join(' · ');
  }

  const api = {
    PRESETS: PRESETS, CATEGORIES: CATEGORIES, SHADOW_MAP: SHADOW_MAP, PARTICLES: PARTICLES,
    detectPreset: detectPreset, resolve: resolve, presetTier: presetTier, choosePreset: choosePreset, describe: describe,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.__hf_gfx = api;
})(typeof window !== 'undefined' ? window : null);
