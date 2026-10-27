// The look per graphics level: the browser build's four presets and budgets
// (js/gfx.js TABLE / BUDGETS, each tuned to hold 60 FPS on the weakest GPU
// its Auto gave the preset) keyed by the runtime's quality tier
// (frame().quality), with the motes scaled within the tier by the level
// (frame().levelIndex, at most 2×) as gfx.js scaled them by its hardware
// level. The runtime owns the rest of what the old Graphics panel did: Auto
// and the level choice, render scale and the pixel-ratio cap, adaptive
// resolution, the frame-rate limit and readout, and the shadow-map size and
// MSAA samples it holds to the level. The old panel's per-category overrides
// are not offered (the runtime's Options choose a level).
import type { QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Board, slab, table, plates, morsels and void: Lambert (Low), Standard, or clear-coated Physical (High/Ultra). */
  material: "lambert" | "standard" | "physical";
  voidSeg: number;
  plateSeg: number;
  /** Slate board and walnut table texture size in px. */
  texture: number;
  /** Anisotropic filtering of those textures. */
  aniso: number;
  bloomRes: number;
  aoRes: number;
}
export interface Look {
  preset: QualityTier;
  shadows: 0 | 512 | 1024 | 2048;
  ao: "off" | "on" | "high";
  bloom: boolean;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Table detail: the slab, the plates, the walnut table and the next course's light. */
  detailed: boolean;
  /** Floating motes. */
  motes: number;
  budget: Budget;
}

const TABLE: Record<QualityTier, Omit<Look, "preset" | "budget" | "motes"> & { particles: 0 | 40 | 120 }> = {
  low: { shadows: 0, ao: "off", bloom: false, grade: false, antialias: "msaa", reflections: false, detailed: false, particles: 0 },
  balanced: { shadows: 512, ao: "off", bloom: true, grade: true, antialias: "fxaa", reflections: true, detailed: true, particles: 40 },
  high: { shadows: 1024, ao: "on", bloom: true, grade: true, antialias: "smaa", reflections: true, detailed: true, particles: 120 },
  ultra: { shadows: 2048, ao: "high", bloom: true, grade: true, antialias: "msaa", reflections: true, detailed: true, particles: 120 },
};
const BUDGETS: Record<QualityTier, Budget & { motes: number }> = {
  low: { material: "lambert", voidSeg: 20, plateSeg: 20, texture: 128, aniso: 1, motes: 0.5, bloomRes: 0.5, aoRes: 0.5 },
  balanced: { material: "standard", voidSeg: 32, plateSeg: 32, texture: 256, aniso: 4, motes: 1, bloomRes: 0.5, aoRes: 0.5 },
  high: { material: "physical", voidSeg: 48, plateSeg: 48, texture: 512, aniso: 8, motes: 1, bloomRes: 0.5, aoRes: 0.5 },
  ultra: { material: "physical", voidSeg: 64, plateSeg: 64, texture: 1024, aniso: 16, motes: 1.5, bloomRes: 1, aoRes: 1 },
};
/** gfx.js MOTE_MAX (120 × 1.5 × 2). */
export const MOTE_MAX = 360;
/** The first level index of each tier (quantum, molecular, terrestrial, galactic). */
const TIER_FLOOR: Record<QualityTier, number> = { low: 0, balanced: 2, high: 4, ultra: 7 };

/** The look for a quality tier at a level index (0 quantum … 9 infinite). */
export function lookFor(preset: QualityTier, levelIndex: number): Look {
  const { particles, ...row } = TABLE[preset];
  const { motes: k0, ...budget } = BUDGETS[preset];
  // Levels are about 1.64× apart in GPU throughput; gfx.js let the motes grow up to 2× within a preset.
  const k = Math.min(2, Math.pow(1.64, Math.max(0, levelIndex - TIER_FLOOR[preset])));
  const motes = Math.min(MOTE_MAX, Math.round(particles * k0 * k));
  return { preset, ...row, motes, budget };
}
