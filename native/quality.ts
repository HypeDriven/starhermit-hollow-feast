// The look per graphics level. The engine-owned effects (shadows and their
// map size, ambient occlusion, bloom, the grade, anti-aliasing, texture
// anisotropy and the largest texture) are the level's own (levelSettings():
// the same table every StarHermit game reads). The game's art (materials,
// void and plate segments, the board and table textures, reflections, table
// detail, the motes) is the browser build's four presets and budgets
// (js/gfx.js TABLE / BUDGETS) keyed by the level's quality tier, with the
// motes scaled within the tier by the level's particle budget against the
// tier's anchor level (quantum, molecular, terrestrial, galactic), at most
// 2×. The runtime owns the rest of what the old Graphics panel did: Auto and
// the level choice, render scale and the pixel-ratio cap, adaptive
// resolution, the frame-rate limit and readout. The old panel's per-category
// overrides are not offered (the runtime's Options choose a level).
import { levelSettings, type GraphicsLevel, type LevelSettings, type QualityTier } from "starhermit:engine";
import type { AntialiasMode } from "starhermit:scene";

export interface Budget {
  /** Board, slab, table, plates, morsels and void: Lambert (Low), Standard, or clear-coated Physical (High/Ultra). */
  material: "lambert" | "standard" | "physical";
  voidSeg: number;
  plateSeg: number;
  /** Slate board and walnut table texture size in px. */
  texture: number;
  /** Anisotropic filtering of those textures (the level's). */
  aniso: number;
}
export interface Look {
  preset: QualityTier;
  /** The level's key-light shadow map size, 0 when the level draws no shadows. */
  shadows: number;
  /** The level's ambient occlusion (null: off). */
  ao: { resolution: number; samples: number; denoiseSamples: number } | null;
  /** The level's bloom resolution (null: off). */
  bloom: number | null;
  grade: boolean;
  antialias: AntialiasMode;
  reflections: boolean;
  /** Table detail: the slab, the plates, the walnut table and the next course's light. */
  detailed: boolean;
  /** Floating motes. */
  motes: number;
  budget: Budget;
}

const ART: Record<QualityTier, Pick<Look, "reflections" | "detailed"> & { particles: 0 | 40 | 120 }> = {
  low: { reflections: false, detailed: false, particles: 0 },
  balanced: { reflections: true, detailed: true, particles: 40 },
  high: { reflections: true, detailed: true, particles: 120 },
  ultra: { reflections: true, detailed: true, particles: 120 },
};
const BUDGETS: Record<QualityTier, Omit<Budget, "aniso"> & { motes: number }> = {
  low: { material: "lambert", voidSeg: 20, plateSeg: 20, texture: 128, motes: 0.5 },
  balanced: { material: "standard", voidSeg: 32, plateSeg: 32, texture: 256, motes: 1 },
  high: { material: "physical", voidSeg: 48, plateSeg: 48, texture: 512, motes: 1 },
  ultra: { material: "physical", voidSeg: 64, plateSeg: 64, texture: 1024, motes: 1.5 },
};
/** gfx.js MOTE_MAX (120 × 1.5 × 2). */
export const MOTE_MAX = 360;
/** The level whose settings are each tier's preset. */
const ANCHOR: Record<QualityTier, GraphicsLevel> = { low: "quantum", balanced: "molecular", high: "terrestrial", ultra: "galactic" };

/** The look for a graphics level (the frame's by default). */
export function lookFor(s: LevelSettings = levelSettings()): Look {
  const preset = s.quality;
  const { particles, ...art } = ART[preset];
  const { motes: k0, ...b } = BUDGETS[preset];
  // gfx.js let the motes grow up to 2× within a preset: by the level's particle budget over the anchor's.
  const k = Math.min(2, s.particles / levelSettings(ANCHOR[preset]).particles);
  const motes = Math.min(MOTE_MAX, Math.round(particles * k0 * k));
  return {
    preset, ...art, motes,
    shadows: s.shadows ? s.shadowMapSize : 0,
    ao: s.ao && { resolution: s.ao.resolution, samples: s.ao.samples, denoiseSamples: s.ao.denoiseSamples },
    bloom: s.bloom ? s.bloom.resolution : null,
    grade: s.grade,
    // Engine 1.36.1 bug: antialias "off" recolours fog, haze and translucent overlays; the old Low's MSAA
    // stays until engine 1.36.2 (drop this clamp when pinning 1.36.2+).
    antialias: s.antialias === "off" ? "msaa" : s.antialias,
    budget: { ...b, texture: Math.min(b.texture, s.maxTextureSize), aniso: s.anisotropy },
  };
}
