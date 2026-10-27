// The banquet table on starhermit:scene, as the browser build's game.js drew
// it with three.js: the slate board (assets/board-slate.webp over the flat
// blue fallback), at Table detail "detailed" the thick slab, the twelve dark
// ceramic plates (lathed dishes) under the courses, the walnut table top
// (a seeded canvas grain) filling the frame and the warm light pooling under
// the next course; the twelve faceted orange morsels (icosahedra, flat
// shaded), the next one lifted, glowing and pulsing; the pale void sphere
// bobbing over its cell; the warm motes drifting up through the light. Lights
// are the cool/warm hemisphere fill, a flat ambient floor and the warm key
// light from the upper left (with shadows by the level), the RoomEnvironment
// reflections; ACES tone mapping at 0.95, and the old post chain (GTAO,
// bloom over the glowing morsel, the colour grade with its vignette,
// FXAA/SMAA/MSAA) as renderer settings.
//
// The browser build drew into a canvas between its header and HUD: here the
// scene fills the window, the camera's view offset puts the board's picture
// in the playfield rectangle the UI leaves (setRect), and the camera is
// fitted as fitCamera() did so the whole playfield stays inside it at any
// aspect.
//
// Gaps from three.js: lights take three.js intensities ÷ π; the key light's
// shadow covers `shadow.distance` along the view instead of a box fitted by
// hand; the normal bias is the engine's (texels) default; the slate texture
// is not downscaled per preset (the walnut grain still is; both take the preset's anisotropy); attenuated
// points are sized by the window's height, so mote sizes are scaled by the
// playfield's share of it.
import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, Color,
  DirectionalLight, DoubleSide, Group, HemisphereLight, IcosahedronGeometry, LatheGeometry, Mesh, MeshLambertMaterial,
  MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Points, PointsMaterial,
  RepeatWrapping, RoomEnvironment, SphereGeometry, SRGBColorSpace, TextureLoader, Vector2, Vector3, renderer, scene,
  type Side, type Texture,
} from "starhermit:scene";
import { OffscreenCanvas } from "starhermit:canvas";
import type { State } from "./classic.ts";
import { MOTE_MAX, type Look } from "./quality.ts";

const L = (i: number): number => i / Math.PI; // three.js light intensity → the engine's

export const camera = new PerspectiveCamera(50, 1, 0.1, 200);
renderer.camera = camera;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
scene.background = new Color(0x141a26);

// Viewing direction (from the board centre towards the camera).
const CAM_DIR = new Vector3(0, 16.5, 15).normalize();

const hemi = new HemisphereLight(0xc6d4f5, 0x3a2a1c, L(1.05));
scene.add(hemi);
scene.add(new AmbientLight(0xffffff, L(0.3)));
const dir = new DirectionalLight(0xfff0dc, L(1.8));
dir.position.set(-4, 10, 8).normalize().multiplyScalar(30);
dir.target.position.set(0, 0, 0);
scene.add(dir);
scene.add(dir.target);
dir.shadow.bias = -0.0004;
dir.shadow.normalBias = 3; // texels; three.js used a 0.03 world-unit normal bias
dir.shadow.radius = 3;
dir.shadow.distance = 70;

// The logical board is 4x4 with grid pitch STEP; the plane is the grid plus a rim.
const STEP = 4.2;
const BOARD = STEP * 4 + 1.6;
const SLAB_H = 0.45;
const VOID_R = 1.7;
const VOID_Y = 1.6;
function worldX(x: number): number { return (x - 1.5) * STEP; }
function worldZ(y: number): number { return (y - 1.5) * STEP; }

// ---- materials ------------------------------------------------------------------------------
type Kind = "lambert" | "standard" | "physical";
type Mat = MeshLambertMaterial | MeshStandardMaterial | MeshPhysicalMaterial;
interface Spec {
  color: number; map?: Texture | null; emissive?: number; emissiveIntensity?: number; flatShading?: boolean; side?: Side;
  roughness?: number; metalness?: number; envMapIntensity?: number; clearcoat?: number; clearcoatRoughness?: number;
}
/** One surface for the budget's shading model, keeping only what that model understands (game.js makeMat). */
function makeMat(kind: Kind, s: Spec): Mat {
  const m = kind === "lambert" ? new MeshLambertMaterial({ color: s.color }) : kind === "standard" ? new MeshStandardMaterial({ color: s.color }) : new MeshPhysicalMaterial({ color: s.color });
  if (s.map) m.map = s.map;
  if (s.emissive != null) m.emissive = new Color(s.emissive);
  if (s.emissiveIntensity != null) m.emissiveIntensity = s.emissiveIntensity;
  if (s.flatShading) m.flatShading = true;
  if (s.side != null) m.side = s.side;
  if (m instanceof MeshStandardMaterial) {
    if (s.roughness != null) m.roughness = s.roughness;
    if (s.metalness != null) m.metalness = s.metalness;
    if (s.envMapIntensity != null) m.envMapIntensity = s.envMapIntensity;
  }
  if (m instanceof MeshPhysicalMaterial) {
    if (s.clearcoat != null) m.clearcoat = s.clearcoat;
    if (s.clearcoatRoughness != null) m.clearcoatRoughness = s.clearcoatRoughness;
  }
  return m;
}
const BOARD_SPEC: Spec = { color: 0x3a5f8a, roughness: 0.88, metalness: 0 };
const SLAB_SPEC: Spec = { color: 0x1d2736, roughness: 0.8 };
const TABLE_SPEC: Spec = { color: 0x2b1d14, roughness: 0.62 };
const PLATE_SPEC: Spec = { color: 0x46526a, roughness: 0.3, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, side: DoubleSide };
const ITEM_SPEC: Spec = { color: 0xff8c3a, flatShading: true, roughness: 0.58, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.2, envMapIntensity: 0.5 };
const VOID_SPEC: Spec = { color: 0xf6e7b2, emissive: 0xcaa64d, emissiveIntensity: 0.8, roughness: 0.38, metalness: 0, clearcoat: 0, clearcoatRoughness: 0.15 };

let matKind: Kind = "standard";
let boardMat = makeMat(matKind, BOARD_SPEC);
let slabMat = makeMat(matKind, SLAB_SPEC);
let tableMat = makeMat(matKind, TABLE_SPEC);
let plateMat = makeMat(matKind, PLATE_SPEC);
let voidMat = makeMat(matKind, VOID_SPEC);

// ---- meshes ---------------------------------------------------------------------------------
const boardMesh = new Mesh(new PlaneGeometry(BOARD, BOARD), boardMat);
boardMesh.rotation.x = -Math.PI / 2;
boardMesh.receiveShadow = true;
scene.add(boardMesh);

// "Detailed" table: slab, plates and the walnut top (all set dressing).
const detailGroup = new Group();
scene.add(detailGroup);
const slab = new Mesh(new BoxGeometry(BOARD, SLAB_H, BOARD), slabMat);
slab.position.y = -SLAB_H / 2 - 0.01;
slab.castShadow = true;
slab.receiveShadow = true;
detailGroup.add(slab);
const table = new Mesh(new PlaneGeometry(90, 90), tableMat);
table.rotation.x = -Math.PI / 2;
table.position.y = -SLAB_H - 0.01;
table.receiveShadow = true;
detailGroup.add(table);
// Shallow dish: a flat well and a raised, rolled rim.
const PLATE_PROFILE = [
  new Vector2(0, 0.02), new Vector2(0.78, 0.02), new Vector2(0.9, 0.05),
  new Vector2(1.18, 0.14), new Vector2(1.26, 0.13), new Vector2(1.24, 0.0),
];
let plateGeo = new LatheGeometry(PLATE_PROFILE, 48);
const plates: Mesh[] = [];
for (let i = 0; i < 16; i++) {
  const p = new Mesh(plateGeo, plateMat);
  p.position.set(worldX(i % 4), 0, worldZ(Math.floor(i / 4)));
  p.receiveShadow = true;
  p.visible = false;
  detailGroup.add(p);
  plates.push(p);
}

const itemGeo = new IcosahedronGeometry(0.95);
const items: Mesh[] = [];
for (let i = 0; i < 12; i++) {
  const m = new Mesh(itemGeo, makeMat(matKind, ITEM_SPEC));
  m.position.y = 1.0;
  m.castShadow = true;
  m.rotation.set(i * 0.7, i * 1.3, 0);
  scene.add(m);
  items.push(m);
}
const itemMat = (i: number): Mat => items[i]!.material as Mat;

let voidSeg = 48;
const voidMesh = new Mesh(new SphereGeometry(VOID_R, voidSeg, voidSeg), voidMat);
voidMesh.position.y = VOID_Y;
voidMesh.castShadow = true;
scene.add(voidMesh);

// Warm light over the next course (detailed tier only).
const nextLight = new PointLight(0xff9a4a, 0, 9, 1.6);
nextLight.visible = false;
scene.add(nextLight);

// ---- textures -------------------------------------------------------------------------------
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
/** Walnut grain at `n` px, the same look at any size (game.js woodTexture). */
function woodTexture(n: number): Texture {
  const c = new OffscreenCanvas(n, n);
  const g = c.getContext("2d");
  g.fillStyle = "#2b1d14";
  g.fillRect(0, 0, n, n);
  const rnd = seeded(56);
  const u = n / 512;
  for (let i = 0; i < 260; i++) {
    const y = rnd() * n;
    g.strokeStyle = "rgba(" + (rnd() < 0.5 ? "12,7,4" : "70,48,32") + "," + (0.12 + rnd() * 0.22) + ")";
    g.lineWidth = Math.max(0.5, (0.6 + rnd() * 2.2) * u);
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= n; x += 32 * u) g.lineTo(x, y + (Math.sin((x / u) * 0.013 + i) * 3 + (rnd() - 0.5) * 1.5) * u);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}
function moteTexture(): Texture {
  const c = new OffscreenCanvas(64, 64);
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
const woodTex = new Map<number, Texture>();
let slateTex: Texture | null = null;
new TextureLoader().loadAsync("assets/board-slate.webp").then((t) => {
  t.colorSpace = SRGBColorSpace;
  slateTex = t;
  applyTextures();
}, () => undefined); // keep the flat-colour board

let envTex: Texture | null = null;
function environment(): Texture | null {
  if (!envTex) {
    try { envTex = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(renderer), 0.04).texture; }
    catch (e) { console.warn(`environment: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return envTex;
}

// ---- motes ----------------------------------------------------------------------------------
const motePos = new Float32Array(MOTE_MAX * 3);
const moteSeed = new Float32Array(MOTE_MAX);
{
  const rnd = seeded(12);
  for (let i = 0; i < MOTE_MAX; i++) {
    motePos[i * 3] = (rnd() - 0.5) * BOARD * 1.15;
    motePos[i * 3 + 1] = 0.3 + rnd() * 6;
    motePos[i * 3 + 2] = (rnd() - 0.5) * BOARD * 1.15;
    moteSeed[i] = rnd() * Math.PI * 2;
  }
}
const moteGeo = new BufferGeometry();
const moteAttr = new BufferAttribute(motePos, 3);
moteGeo.setAttribute("position", moteAttr);
const moteMat = new PointsMaterial({
  color: 0xffc27a, size: 0.24, map: moteTexture(), transparent: true, opacity: 0.75,
  depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true,
});
const motes = new Points(moteGeo, moteMat);
motes.visible = false;
motes.frustumCulled = false;
scene.add(motes);

// ---- look -----------------------------------------------------------------------------------
let look: Look | null = null;
function applyTextures(): void {
  const n = look ? look.budget.texture : 512;
  let wood = woodTex.get(n);
  if (!wood) {
    try { wood = woodTexture(n); woodTex.set(n, wood); } catch (e) { console.warn(`wood: ${String(e)}`); }
  }
  const aniso = look ? look.budget.aniso : 4;
  if (wood) wood.anisotropy = aniso;
  if (slateTex) slateTex.anisotropy = aniso;
  boardMat.map = slateTex;
  boardMat.color.set(slateTex ? 0xffffff : 0x3a5f8a);
  tableMat.map = wood ?? null;
  tableMat.color.set(wood ? 0xffffff : 0x2b1d14);
}
function applyAssets(next: Look): void {
  const kind = next.budget.material;
  if (kind !== matKind) {
    matKind = kind;
    for (const m of [boardMat, slabMat, tableMat, plateMat, voidMat]) m.dispose();
    boardMat = makeMat(kind, BOARD_SPEC);
    slabMat = makeMat(kind, SLAB_SPEC);
    tableMat = makeMat(kind, TABLE_SPEC);
    plateMat = makeMat(kind, PLATE_SPEC);
    voidMat = makeMat(kind, VOID_SPEC);
    boardMesh.material = boardMat;
    slab.material = slabMat;
    table.material = tableMat;
    for (const p of plates) p.material = plateMat;
    voidMesh.material = voidMat;
    for (const m of items) { (m.material as Mat).dispose(); m.material = makeMat(kind, ITEM_SPEC); }
  }
  if (voidSeg !== next.budget.voidSeg) {
    voidSeg = next.budget.voidSeg;
    voidMesh.geometry.dispose();
    voidMesh.geometry = new SphereGeometry(VOID_R, voidSeg, voidSeg);
  }
  if (plateGeo.parameters.segments !== next.budget.plateSeg) {
    plateGeo.dispose();
    plateGeo = new LatheGeometry(PLATE_PROFILE, next.budget.plateSeg);
    for (const p of plates) p.geometry = plateGeo;
  }
  applyTextures();
}

/** Applies a graphics level's look to the live scene. */
export function applyLook(next: Look): void {
  if (look && JSON.stringify(look) === JSON.stringify(next)) return;
  look = next;
  applyAssets(next);
  const shadows = next.shadows > 0;
  renderer.shadowMap.enabled = shadows;
  dir.castShadow = shadows;
  if (shadows) dir.shadow.mapSize = next.shadows;
  renderer.ao = next.ao === "off" ? null : {
    blendIntensity: 0.75, radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.0,
    samples: next.ao === "high" ? 16 : 8, resolution: next.budget.aoRes,
    denoise: { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: next.ao === "high" ? 6 : 4, rings: 2, samples: next.ao === "high" ? 16 : 8 },
  };
  // High threshold: only the glowing morsel, the void's sheen and the motes bloom.
  renderer.bloom = next.bloom ? { strength: 0.42, radius: 0.45, threshold: 0.9, resolution: next.budget.bloomRes } : null;
  // game.js GradeShader: a gentle S-curve (0.22), saturation 1.1, cool shadows / warm highlights
  // over smoothstep(0.15, 0.8), the 0.28 vignette.
  renderer.grade = next.grade ? {
    space: "display", contrast: 0.11, saturation: 1.1,
    shadows: [0.95, 0.98, 1.06], highlights: [1.05, 1.0, 0.94], split: [0.15, 0.8],
    vignette: { amount: 0.28, inner: 0.32, outer: 0.8 },
  } : null;
  renderer.antialias = next.antialias;
  const detailed = next.detailed;
  detailGroup.visible = detailed;
  for (let i = 0; i < items.length; i++) { const m = itemMat(i); if (m instanceof MeshPhysicalMaterial) m.clearcoat = detailed ? 0.8 : 0; }
  if (voidMat instanceof MeshPhysicalMaterial) voidMat.clearcoat = detailed ? 1 : 0;
  voidMat.emissiveIntensity = detailed ? 0.3 : 1.0;
  const env = next.reflections ? environment() : null;
  scene.environment = env;
  scene.environmentIntensity = 0.4;
  hemi.intensity = L(env ? 0.7 : 1.05);
  motes.visible = next.motes > 0;
  moteGeo.setDrawRange(0, next.motes);
  highlightNext();
}

// ---- the board ------------------------------------------------------------------------------
let state: State | null = null;
const NEXT_EMISSIVE = 0xff8c3a;
let nextIndex = -1;
function nextGlow(): number { return look && look.bloom ? 1.35 : 0.85; }
function highlightNext(): void {
  if (!state) return;
  const s = state;
  const next = s.cells.filter((c) => !c.kind && c.order != null).length + 1;
  nextIndex = -1;
  for (let i = 0; i < items.length; i++) {
    const isNext = !s.won && i + 1 === next;
    if (isNext) nextIndex = i;
    const m = itemMat(i);
    m.emissive.setHex(isNext ? NEXT_EMISSIVE : 0x000000);
    m.emissiveIntensity = isNext ? nextGlow() : 0;
    items[i]!.scale.setScalar(isNext ? 1.18 : 1);
  }
  if (nextIndex >= 0) nextLight.position.set(items[nextIndex]!.position.x, 2.3, items[nextIndex]!.position.z);
  nextLight.visible = nextIndex >= 0 && !!look && look.detailed;
}
/** Places the meshes from a rules state: mesh i shows the morsel numbered i+1. Moves are snaps. */
export function sync(s: State): void {
  state = s;
  for (let j = 0; j < s.cells.length; j++) {
    const cell = s.cells[j]!;
    if (!cell.order) continue;
    const mesh = items[cell.order - 1]!;
    mesh.position.x = worldX(j % 4);
    mesh.position.z = worldZ(Math.floor(j / 4));
    mesh.visible = !!cell.kind;
    plates[j]!.visible = true;
  }
  voidMesh.position.x = worldX(s.voidPos[0]);
  voidMesh.position.z = worldZ(s.voidPos[1]);
  highlightNext();
}

// ---- camera fit -----------------------------------------------------------------------------
// Everything that must stay on screen: the board's corners and the void's box over every cell.
const FIT_POINTS: Vector3[] = [];
{
  const half = BOARD / 2;
  for (const [cx, cz] of [[-half, -half], [half, -half], [-half, half], [half, half]] as const) {
    FIT_POINTS.push(new Vector3(cx, 0, cz), new Vector3(cx, -SLAB_H, cz));
  }
  for (let cy = 0; cy < 4; cy++) for (let cx = 0; cx < 4; cx++) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      FIT_POINTS.push(new Vector3(worldX(cx) + sx * VOID_R, VOID_Y + VOID_R, worldZ(cy) + sz * VOID_R));
      FIT_POINTS.push(new Vector3(worldX(cx) + sx * VOID_R, VOID_Y - VOID_R, worldZ(cy) + sz * VOID_R));
    }
  }
}
const FIT_FILL = 0.92;
const fitTarget = new Vector3();
const tmp = new Vector3();
const right = new Vector3();
const up = new Vector3();
const fwd = new Vector3();
/** NDC bounds of FIT_POINTS through a camera at `pos` looking at `target` (projected by hand:
 * with a view offset the engine's project() would use the window's aspect). */
function bounds(pos: Vector3, aspect: number): { minX: number; maxX: number; minY: number; maxY: number } {
  const t = Math.tan(((camera.fov / 2) * Math.PI) / 180);
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  for (const p of FIT_POINTS) {
    tmp.copy(p).sub(pos);
    const z = tmp.dot(fwd);
    const x = tmp.dot(right) / (z * t * aspect);
    const y = tmp.dot(up) / (z * t);
    b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y); b.maxY = Math.max(b.maxY, y);
  }
  return b;
}
function basis(): void {
  // Looking along -CAM_DIR with world up: the camera's axes.
  fwd.copy(CAM_DIR).multiplyScalar(-1);
  right.crossVectors(fwd, new Vector3(0, 1, 0)).normalize();
  up.crossVectors(right, fwd).normalize();
}
/** Solves the camera distance and target so the playfield is centred and fills FIT_FILL (game.js fitCamera). */
function fitCamera(aspect: number): void {
  basis();
  fitTarget.set(0, 0, 0);
  let dist = 40;
  const pos = new Vector3();
  for (let iter = 0; iter < 12; iter++) {
    pos.copy(CAM_DIR).multiplyScalar(dist).add(fitTarget);
    const b = bounds(pos, aspect);
    const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
    const scale = Math.max((b.maxX - b.minX) / 2, (b.maxY - b.minY) / 2) / FIT_FILL;
    const halfH = Math.tan(((camera.fov / 2) * Math.PI) / 180) * dist;
    fitTarget.addScaledVector(right, cx * halfH * aspect).addScaledVector(up, cy * halfH);
    dist *= scale;
    if (Math.abs(scale - 1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
  }
  camera.position.copy(CAM_DIR).multiplyScalar(dist).add(fitTarget);
  camera.lookAt(fitTarget);
  dir.shadow.distance = dist + BOARD;
}

/** The playfield's window rectangle (window px) in a W × H window. */
export const view = { x: 0, y: 0, w: 0, h: 0, W: 0, H: 0 };
export function setRect(x: number, y: number, w: number, h: number, W: number, H: number): void {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  x = Math.round(x); y = Math.round(y);
  if (view.x === x && view.y === y && view.w === w && view.h === h && view.W === W && view.H === H) return;
  Object.assign(view, { x, y, w, h, W, H });
  fitCamera(w / h);
  camera.setViewOffset(w, h, -x, -y, W, H);
  camera.updateProjectionMatrix();
  // three.js sized attenuated points by half the canvas height; the engine by the window's.
  moteMat.size = 0.24 * (H > 0 ? h / H : 1);
}

// ---- the frame ------------------------------------------------------------------------------
let clock = 0;
/** Gentle ambient motion (off with reduced motion): the void bobs, the next course turns and
 * pulses, its light shimmers, the motes drift. Grid positions never animate. */
export function update(dtIn: number, reduced: boolean): void {
  const dt = Math.min(0.25, Math.max(0, dtIn));
  const moving = !reduced;
  if (moving) clock += dt;
  const t = clock;
  voidMesh.position.y = VOID_Y + (moving ? Math.sin(t * 1.7) * 0.09 : 0);
  if (nextIndex >= 0) {
    const m = items[nextIndex]!;
    if (moving) m.rotation.y += dt * 0.7;
    const pulse = moving ? 0.5 + 0.5 * Math.sin(t * 3.1) : 0.5;
    itemMat(nextIndex).emissiveIntensity = nextGlow() * (0.85 + 0.3 * pulse);
    nextLight.intensity = L(9 * (0.9 + 0.2 * pulse));
  }
  if (motes.visible && moving && look) {
    const n = look.motes;
    const lim = BOARD * 0.575;
    const ms = dt * 1000;
    for (let i = 0; i < n; i++) {
      const k = i * 3;
      motePos[k + 1] = motePos[k + 1]! + ms * 0.00035 * (0.6 + 0.4 * Math.sin(moteSeed[i]!));
      motePos[k] = motePos[k]! + Math.sin(t * 0.6 + moteSeed[i]!) * ms * 0.00018;
      if (motePos[k + 1]! > 6.3) motePos[k + 1] = 0.3;
      if (motePos[k]! > lim) motePos[k] = -lim; else if (motePos[k]! < -lim) motePos[k] = lim;
    }
    moteAttr.needsUpdate = true;
    moteMat.opacity = 0.6 + 0.15 * Math.sin(t * 0.9);
  }
}
