/**
 * Hollow Feast — platform adapter unit tests (dev only, not shipped).
 *
 * Loads js/starhermit-sdk.js + js/platform.js in a vm sandbox with a stubbed
 * fetch and launch fragment and covers: offline inertness (zero fetches,
 * localStorage holds the doc), the hosted path (token read + stripped,
 * nickname in the HUD cell, cloud save round-trip through game:<slug>,
 * Bearer on every call, remote-preferred load), the settings KV, key
 * bindings, the invite link and sign-in availability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScripts, makeBackend, makeToken, plain, settle } from './starhermit-harness.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FILES = [path.join(ROOT, 'js/starhermit-sdk.js'), path.join(ROOT, 'js/platform.js')];

function hudDocument() {
  const mk = () => ({ textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, insertBefore() {}, firstChild: null });
  const els = { player: mk(), sync: mk() };
  return {
    els,
    document: {
      getElementById: (id) => els[id] || null,
      addEventListener() {},
      createElement: () => ({}),
      visibilityState: 'visible',
    },
  };
}

test('offline mode is fully inert: no fetch, localStorage holds the doc', async () => {
  let fetched = 0;
  const hud = hudDocument();
  const w = loadScripts(FILES, { fetch: async () => { fetched++; throw new Error('no network'); }, extra: { document: hud.document } });
  const platform = w.__hf_platform;
  assert.equal(platform.launch(), null);
  assert.equal(platform.records().best, null);
  platform.saveDoc({ records: { wins: 2, best: { score: 450, refusals: 0, ticks: 12, when: 1 } } });
  await platform.flush();
  platform.patchSettings({ gfx: { preset: 'low' } });
  assert.deepEqual(plain(await platform.getSettings()), {});
  assert.deepEqual(plain(await platform.loadBindings({ restart: ['KeyR'] })), { restart: ['KeyR'] });
  assert.equal(platform.inviteLink(), null);
  assert.equal(platform.canSignIn(), false);
  await settle();
  assert.equal(fetched, 0, 'zero network calls offline');
  const doc = JSON.parse(w.localStorage.getItem('hf.save.v1'));
  assert.equal(doc.records.wins, 2);
  assert.equal(hud.els.sync.attrs['data-state'], 'local');
});

test('hosted mode: token stripped, nickname, cloud save game:<slug>, Bearer on every call', async () => {
  const be = makeBackend();
  const hud = hudDocument();
  const w = loadScripts(FILES, { hash: '#game_token=' + makeToken() + '&session_id=abc', fetch: be.fetch, extra: { document: hud.document } });
  const platform = w.__hf_platform;
  const launch = platform.launch();
  assert.ok(launch, 'hosted launch must be detected');
  assert.equal(launch.slug, 'gid-1');
  assert.equal(launch.sub, 'user-123456789');
  assert.equal(w.__replaced, '/');
  await settle();
  assert.equal(hud.els.player.textContent, 'Al', 'nickname displayed, never the username');

  platform.saveDoc({ records: { wins: 1, best: { score: 200, refusals: 1, ticks: 30, when: 5 } } });
  assert.equal(hud.els.sync.attrs['data-state'], 'saving');
  await platform.flush();
  const put = be.calls.find((c) => c.method === 'PUT');
  assert.equal(put.url, '/api/v1/me/cloud-saves/' + encodeURIComponent('game:gid-1'));
  assert.equal(hud.els.sync.attrs['data-state'], 'synced');
  assert.ok(be.calls.every((c) => c.auth === 'Bearer ' + launch.token));

  // A fresh launch prefers the remote document.
  const w2 = loadScripts(FILES, { hash: '#game_token=' + makeToken(), fetch: be.fetch, extra: { document: hudDocument().document } });
  await settle();
  assert.equal(w2.__hf_platform.records().best.score, 200);
  assert.equal(w2.__hf_platform.records().wins, 1);
});

test('hosted mode: settings KV patch, bindings, invite link', async () => {
  const be = makeBackend();
  const w = loadScripts(FILES, { hash: '#game_token=' + makeToken(), fetch: be.fetch, extra: { document: hudDocument().document } });
  const platform = w.__hf_platform;
  platform.patchSettings({ gfx: { preset: 'high' } });
  await settle();
  const patch = be.calls.find((c) => c.method === 'PATCH');
  assert.equal(patch.url, '/api/v1/games/gid-1/settings');
  assert.deepEqual(patch.body, { settings: { gfx: { preset: 'high' } } });
  assert.deepEqual(plain(await platform.getSettings()), { gfx: { preset: 'high' } });
  assert.deepEqual(plain(await platform.loadBindings({ restart: ['KeyR'] })), { restart: ['KeyR'] });
  assert.ok(platform.inviteLink().endsWith('/game-invite/user-123456789/gid-1'));
});

test('hosted domain without a token offers sign-in', () => {
  const w = loadScripts(FILES, { hostname: 'gid-1.starhermit.com', extra: { document: hudDocument().document } });
  assert.equal(w.__hf_platform.launch(), null);
  assert.equal(w.__hf_platform.canSignIn(), true);
});
