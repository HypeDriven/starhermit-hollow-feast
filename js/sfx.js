'use strict';

/*
 * Hollow Feast sample SFX engine.
 *
 * Named audio events (void-move, eat, invalid, win, ui-click) map to authored
 * one-shot clips under sfx/<name>.opus. Clips are lazy-fetched, decoded, and
 * cached only after the AudioContext has been unlocked by a user gesture.
 * Each event prefers its mapped sample; the procedural synthesis below runs
 * only while the sample is still loading or after a fetch/decode failure.
 */
(function () {
  const EVENTS = {
    'void-move': ['void-slide-a', 'void-slide-b', 'void-slide-c', 'void-slide-d'],
    'eat': ['gobble-a', 'gobble-b', 'gobble-c', 'gobble-d'],
    'invalid': ['thud-denied-a', 'thud-denied-b'],
    'win': ['feast-complete-a', 'feast-complete-b'],
    'ui-click': ['ui-tap-a', 'ui-tap-b'],
  };

  let ctx = null;
  let effectsBus = null;
  let masterGain = null;
  let unlocked = false;
  let muted = false;
  let volume = 0.8;
  const clips = {}; // name -> { state: 'idle'|'loading'|'ready'|'failed', buffer }
  const cursor = {}; // event name -> round-robin index

  function applyGain() {
    if (masterGain) masterGain.gain.value = muted ? 0 : volume;
  }

  function ensureContext() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    effectsBus = ctx.createGain();
    effectsBus.connect(masterGain);
    applyGain();
    return true;
  }

  function unlock() {
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    unlocked = true;
  }

  function loadClip(name) {
    let clip = clips[name];
    if (!clip) clip = clips[name] = { state: 'idle', buffer: null };
    if (clip.state !== 'idle') return;
    clip.state = 'loading';
    fetch('sfx/' + name + '.opus')
      .then(function (res) {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.arrayBuffer();
      })
      .then(function (bytes) { return ctx.decodeAudioData(bytes); })
      .then(function (buffer) {
        clip.buffer = buffer;
        clip.state = 'ready';
      })
      .catch(function () { clip.state = 'failed'; });
  }

  function pickSample(eventName) {
    const names = EVENTS[eventName];
    if (!names) return null;
    names.forEach(loadClip); // deduped by clip state
    for (let i = 0; i < names.length; i++) {
      const idx = ((cursor[eventName] || 0) + i) % names.length;
      const clip = clips[names[idx]];
      if (clip && clip.state === 'ready' && clip.buffer) {
        cursor[eventName] = (idx + 1) % names.length;
        return clip.buffer;
      }
    }
    return null;
  }

  function playBuffer(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(effectsBus);
    src.start();
  }

  // --- Procedural fallbacks (used only while loading or on failure) ---

  function tone(freqA, freqB, dur, type, peak, delay) {
    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, t0);
    if (freqB && freqB !== freqA) osc.frequency.exponentialRampToValueAtTime(freqB, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(effectsBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function synth(eventName) {
    switch (eventName) {
      case 'void-move':
        tone(200, 90, 0.16, 'sine', 0.35);
        break;
      case 'eat':
        tone(320, 640, 0.12, 'triangle', 0.4);
        tone(140, 70, 0.1, 'sine', 0.3, 0.03);
        break;
      case 'invalid':
        tone(110, 80, 0.12, 'square', 0.22);
        break;
      case 'win':
        tone(392, 392, 0.14, 'triangle', 0.3);
        tone(494, 494, 0.14, 'triangle', 0.3, 0.12);
        tone(587, 587, 0.22, 'triangle', 0.3, 0.24);
        break;
      case 'ui-click':
        tone(900, 700, 0.05, 'square', 0.18);
        break;
      default:
        break;
    }
  }

  function event(eventName) {
    if (!unlocked || !EVENTS[eventName] || !ensureContext()) return;
    const buffer = pickSample(eventName);
    if (buffer) playBuffer(buffer);
    else synth(eventName);
  }

  function setMuted(value) {
    muted = !!value;
    applyGain();
  }

  function setVolume(value) {
    const v = Number(value);
    if (isFinite(v)) volume = Math.min(1, Math.max(0, v));
    applyGain();
  }

  window.__hf_sfx = {
    unlock: unlock,
    event: event,
    setMuted: setMuted,
    setVolume: setVolume,
  };
})();
