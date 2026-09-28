// Graphics quality model (js/gfx.js): detection, resolution, overrides, summary.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const gfx = createRequire(import.meta.url)('../js/gfx.js');

test('detectPreset maps GPU strings to tiers', () => {
  assert.equal(gfx.detectPreset('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'low');
  assert.equal(gfx.detectPreset('llvmpipe (LLVM 15.0.7, 256 bits)'), 'low');
  assert.equal(gfx.detectPreset('ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'high');
  assert.equal(gfx.detectPreset('Apple M2'), 'high');
  assert.equal(gfx.detectPreset('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'balanced');
  assert.equal(gfx.detectPreset('Adreno (TM) 650'), 'balanced');
  assert.equal(gfx.detectPreset(''), 'balanced');
});

test('touch devices cap Auto at balanced', () => {
  assert.equal(gfx.detectPreset('Apple M1', true), 'balanced');
  assert.equal(gfx.detectPreset('SwiftShader', true), 'low');
});

test('resolve: auto uses the detected preset; explicit preset wins', () => {
  const a = gfx.resolve({}, 'high');
  assert.equal(a.preset, 'high');
  assert.equal(a.auto, true);
  assert.equal(a.shadows, 'medium');
  const b = gfx.resolve({ preset: 'low' }, 'high');
  assert.equal(b.preset, 'low');
  assert.equal(b.auto, false);
  assert.equal(b.post, false, 'Low renders without a post chain');
  assert.equal(b.particles, 'off');
  assert.equal(gfx.resolve(null, undefined).preset, 'balanced');
});

test('resolve: overrides apply, invalid values fall back to the preset tier', () => {
  const r = gfx.resolve({ preset: 'high', bloom: 'off', shadows: 'bogus', detail: 'plain' }, 'low');
  assert.equal(r.bloom, 'off');
  assert.equal(r.shadows, gfx.presetTier('high', 'shadows'));
  assert.equal(r.detail, 'plain');
  const lowGrade = gfx.resolve({ preset: 'low', grade: 'on' }, 'low');
  assert.equal(lowGrade.post, true, 'an override that needs post turns the chain on');
});

test('resolve: render scale is clamped to 50–200% and multiplies the preset scale', () => {
  assert.equal(gfx.resolve({ preset: 'high', render_scale: 5 }).scale, 2);
  assert.equal(gfx.resolve({ preset: 'high', render_scale: 0.1 }).scale, 0.5);
  assert.equal(gfx.resolve({ preset: 'ultra', render_scale: 1 }).scale, 1.25);
  assert.equal(gfx.resolve({ preset: 'low' }).dprCap, 1);
});

test('adaptive defaults on, frame rate readout defaults off', () => {
  const r = gfx.resolve({}, 'low');
  assert.equal(r.adaptive, true);
  assert.equal(r.showFps, false);
  const s = gfx.resolve({ adaptive: false, show_fps: true }, 'low');
  assert.equal(s.adaptive, false);
  assert.equal(s.showFps, true);
});

test('choosing a preset clears per-category overrides but keeps scale and toggles', () => {
  const saved = { preset: 'high', bloom: 'off', ao: 'high', render_scale: 1.5, show_fps: true };
  const next = gfx.choosePreset(saved, 'balanced');
  assert.deepEqual(next, { preset: 'balanced', render_scale: 1.5, show_fps: true });
  assert.equal(gfx.resolve(next).bloom, gfx.presetTier('balanced', 'bloom'));
  assert.equal(gfx.choosePreset({}, 'nonsense').preset, 'auto');
});

test('describe summarises cost and resolution', () => {
  const s = gfx.describe(gfx.resolve({ preset: 'high' }), [800, 600]);
  assert.match(s, /1024² shadows/);
  assert.match(s, /bloom/);
  assert.match(s, /SMAA/);
  assert.match(s, /800×600 px$/);
  assert.match(gfx.describe(gfx.resolve({ preset: 'low' })), /no shadows/);
});
