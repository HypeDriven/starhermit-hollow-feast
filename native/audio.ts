// Sound, as the browser build's js/sfx.js: named events (void-move, eat,
// invalid, wrong-order, restart, win, ui-click) map to the authored one-shot
// clips sfx/<name>.opus (grouped by event in sfx/manifest.json), each event a
// SoundBank cycling through its variants in turn. Its master gain (0.8) is
// folded into each sound; the menu tap plays on the runtime's "interface" bus,
// the rest on "effects" (Options › Audio owns the volumes, the mute and the
// voice limit). The oscillator voices the browser build played while a clip
// was still loading are not ported: until its clips are in, an event is
// silent. Every clip loads at once in onStart.
import { files } from "starhermit:engine";
import { loadClip, SoundBank } from "starhermit:audio";

const GAIN = 0.8;

const banks = new Map<string, SoundBank>();
/** Reads the manifest and loads every clip at once (onStart); an event whose clips are still loading is silent. */
export function loadSfx(): void {
  const eventFiles = new Map<string, string[]>();
  try {
    const list = files.readJson("sfx/manifest.json") as unknown as { name?: string; event?: string }[];
    for (const e of Array.isArray(list) ? list : []) {
      if (!e || typeof e.name !== "string" || typeof e.event !== "string") continue;
      const l = eventFiles.get(e.event) ?? [];
      l.push(e.name);
      eventFiles.set(e.event, l);
    }
  } catch (e) { console.warn(`sfx manifest: ${String(e)}`); }
  for (const [event, names] of eventFiles) {
    void Promise.all(names.map((name) => loadClip(`sfx/${name}.opus`).catch((e: unknown) => { console.warn(`sfx ${name}: ${String(e)}`); return null; }))).then((loaded) => {
      const clips = loaded.filter((c) => c !== null);
      if (clips.length) banks.set(event, new SoundBank({ clips, order: "sequence", gain: GAIN, bus: event === "ui-click" ? "interface" : "effects" }));
    });
  }
}

/** Plays an event's next variant; silent while its clips load. */
export function play(event: string): void {
  try { banks.get(event)?.play(); }
  catch { /* the mixer is full this frame: skip it */ }
}
