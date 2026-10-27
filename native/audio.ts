// Sound, as the browser build's js/sfx.js: named events (void-move, eat,
// invalid, wrong-order, restart, win, ui-click) map to the authored one-shot
// clips sfx/<name>.opus (grouped by event in sfx/manifest.json), each event
// cycling round-robin through its variants. Its master gain (0.8) is folded
// into each sound; the menu tap plays on the runtime's "interface" bus, the
// rest on "effects" (Options › Audio owns the volumes, the mute and the voice
// limit). The oscillator voices the browser build played while a clip was
// still loading are not ported (the web runtime drops clip loads while a
// synthesis graph runs): until its clip is in, an event is silent. Clips
// load once the mixer runs (natively at once, in a browser after the first
// press), one at a time, the most frequent events first.
import { files } from "starhermit:engine";
import { context, loadClip, play as playClip, type AudioClip, type Bus } from "starhermit:audio";

const GAIN = 0.8;
const FIRST = ["void-move", "eat", "ui-click", "invalid", "wrong-order", "restart", "win"];

const eventFiles = new Map<string, string[]>();
const cursor = new Map<string, number>();
const clips = new Map<string, AudioClip>();
const queue: string[] = [];
let loading = false;
let wantClips = false;
function load(name: string): void { if (!queue.includes(name) && !clips.has(name)) queue.push(name); }
function pump(): void {
  if (loading || !queue.length) return;
  const name = queue.shift()!;
  loading = true;
  loadClip(`sfx/${name}.opus`).then((c) => { clips.set(name, c); loading = false; }, (e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); loading = false; });
}
/** Reads the manifest; the clips load once the mixer runs (see update). */
export function loadSfx(): void {
  try {
    const list = files.readJson("sfx/manifest.json") as unknown as { name?: string; event?: string }[];
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || typeof e.name !== "string" || typeof e.event !== "string") continue;
      const l = eventFiles.get(e.event) ?? [];
      l.push(e.name);
      eventFiles.set(e.event, l);
    }
  } catch (e) { console.warn(`sfx manifest: ${String(e)}`); }
  wantClips = true;
}

/** Plays an event's next ready variant; silent while its clips load. */
export function play(event: string): void {
  const names = eventFiles.get(event);
  if (!names) return;
  const start = cursor.get(event) ?? 0;
  for (let i = 0; i < names.length; i++) {
    const idx = (start + i) % names.length;
    const clip = clips.get(names[idx]!);
    if (!clip) continue;
    cursor.set(event, (idx + 1) % names.length);
    const bus: Bus = event === "ui-click" ? "interface" : "effects";
    try { playClip(clip, { bus, gain: GAIN }); }
    catch { clips.delete(names[idx]!); load(names[idx]!); } // a clip the mixer lost: load it again
    return;
  }
}

/** Each frame: the clips, once the mixer runs. */
export function update(): void {
  if (context.state !== "running") return;
  if (wantClips) {
    wantClips = false;
    for (const e of FIRST) for (const n of eventFiles.get(e) ?? []) load(n);
    for (const l of eventFiles.values()) for (const n of l) load(n);
  }
  pump();
}
