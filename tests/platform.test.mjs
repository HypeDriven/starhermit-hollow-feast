/**
 * Hollow Feast — platform adapter unit tests (dev only, not shipped).
 *
 * Loads js/platform.js in a vm sandbox with a stub window/document and covers:
 * the stored-zip helper (round-trip + strict layout), launch-token reading
 * (fragment strip, hosted-host query refusal, dev query fallback), offline
 * inertness (zero fetches), and the hosted path (Bearer on every call,
 * nickname resolution with fallback, cloud save PUT after saveDoc).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SRC = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../js/platform.js'), 'utf8');

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
}

function makeToken(claims) {
  return b64url({ alg: 'none' }) + '.' + b64url(claims) + '.sig';
}

function makeStub(opts) {
  opts = opts || {};
  const storage = opts.storage || {};
  const calls = [];
  const els = {
    player: { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
    sync: { textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } },
  };
  const stub = {
    replaced: null,
    calls: calls,
    els: els,
    storage: storage,
    window: {
      location: {
        hash: opts.hash || '',
        search: opts.search || '',
        pathname: '/',
        hostname: opts.hostname || 'localhost',
      },
      history: {
        replaceState(_a, _b, url) { stub.replaced = url; },
      },
      localStorage: {
        getItem(k) { return Object.prototype.hasOwnProperty.call(storage, k) ? storage[k] : null; },
        setItem(k, v) { storage[k] = String(v); },
      },
      addEventListener() {},
      setTimeout() { return 0; },
      clearTimeout() {},
      atob: atob,
      btoa: btoa,
    },
    document: {
      getElementById(id) { return els[id] || null; },
      addEventListener() {},
      visibilityState: 'visible',
    },
    navigator: { onLine: true },
    fetchCalls: calls,
  };
  stub.window.fetch = opts.fetch || function () {
    return Promise.reject(new Error('fetch must not be called in this test'));
  };
  return stub;
}

function loadPlatform(stub) {
  const ctx = vm.createContext({
    window: stub.window,
    document: stub.document,
    navigator: stub.navigator,
    console: console,
    URLSearchParams: URLSearchParams,
    TextEncoder: TextEncoder,
    TextDecoder: TextDecoder,
    DataView: DataView,
    Uint8Array: Uint8Array,
    atob: atob,
    btoa: btoa,
  });
  vm.runInContext(SRC, ctx);
  return stub.window.__hf_platform;
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('zipStore writes a strict-readable stored zip and unzipFirstEntry reads it back', () => {
  const stub = makeStub({});
  const platform = loadPlatform(stub);
  const zip = platform.__zip;
  const payload = new TextEncoder().encode('{"v":1,"records":{"wins":3}}');
  const bytes = zip.zipStore('hollow-feast.json', payload);
  // Magic + version + method(stored) + correct sizes in both headers.
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b); assert.equal(bytes[2], 3); assert.equal(bytes[3], 4);
  const dv = new DataView(bytes.buffer);
  assert.equal(dv.getUint16(8, true), 0, 'local entry must be stored (no compression)');
  assert.equal(dv.getUint32(18, true), payload.length);
  const roundTrip = zip.unzipFirstEntry(bytes);
  assert.deepEqual(Buffer.from(roundTrip).toString('utf8'), '{"v":1,"records":{"wins":3}}');
});

test('base64 helpers round-trip arbitrary bytes', () => {
  const stub = makeStub({});
  const zip = loadPlatform(stub).__zip;
  const bytes = new Uint8Array(70000).map((_, i) => (i * 31) & 0xff);
  assert.deepEqual(Array.from(zip.base64ToBytes(zip.bytesToBase64(bytes))), Array.from(bytes));
});

test('fragment #game_token is read once, decoded and stripped', async () => {
  const token = makeToken({ sub: 'user-abcdef123456', game_scope: 'hollow-feast', exp: 9999999999 });
  const stub = makeStub({
    hash: '#game_token=' + token + '&session_id=abc-123',
    hostname: 'hollow-feast.starhermit.com',
    fetch: () => Promise.reject(new Error('no calls expected')),
  });
  const platform = loadPlatform(stub);
  const launch = platform.launch();
  assert.ok(launch, 'hosted launch must be detected');
  assert.equal(launch.sub, 'user-abcdef123456');
  assert.equal(launch.slug, 'hollow-feast');
  assert.ok(stub.replaced !== null, 'fragment must be stripped');
  assert.ok(!/#game_token|session_id/.test(stub.replaced), 'token and session must be gone from the URL');
});

test('query-param tokens are refused on *.starhermit.com but work for local dev', () => {
  const token = makeToken({ sub: 'user-abcdef123456', game_scope: 'hollow-feast' });
  const hosted = makeStub({ search: '?token=' + token, hostname: 'hollow-feast.starhermit.com' });
  assert.equal(loadPlatform(hosted).launch(), null, 'query token must not authenticate on-platform');
  const dev = makeStub({ search: '?token=' + token, hostname: 'localhost' });
  const launch = loadPlatform(dev).launch();
  assert.ok(launch, 'query token is the local-dev fallback');
  assert.equal(launch.slug, 'hollow-feast');
});

test('offline mode is fully inert: no fetch, localStorage holds the doc', async () => {
  const stub = makeStub({});
  const platform = loadPlatform(stub);
  assert.equal(platform.launch(), null);
  assert.equal(platform.records().best, null);
  platform.saveDoc({ records: { wins: 2, best: { score: 450, refusals: 0, ticks: 12, when: 1 } } });
  await tick();
  assert.equal(stub.calls.length, 0, 'zero network calls offline');
  assert.ok(stub.storage['hf.save.v1'], 'offline cache written');
  const doc = JSON.parse(stub.storage['hf.save.v1']);
  assert.equal(doc.records.wins, 2);
  assert.equal(doc.records.best.score, 450);
  assert.equal(stub.els.sync.attrs['data-state'], 'local');
  assert.equal(stub.els.player.textContent, 'localPlayer', 'untranslated key falls back to itself without i18n');
});

test('hosted mode: Bearer on every call, nickname from profile, cloud save PUT', async () => {
  const token = makeToken({ sub: 'user-abcdef123456', game_scope: 'hollow-feast' });
  const bodies = [];
  const stub = makeStub({
    hash: '#game_token=' + token,
    hostname: 'hollow-feast.starhermit.com',
    fetch(url, options) {
      stub.calls.push({ url, options });
      if (url === '/api/v1/users/user-abcdef123456/profile') {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ id: 'user-abcdef123456', username: 'do-not-show', nickname: 'Feaster' }) });
      }
      if (url === '/api/v1/me/cloud-saves/hollow-feast' && (!options || options.method !== 'PUT')) {
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
      }
      if (url === '/api/v1/me/cloud-saves/hollow-feast' && options && options.method === 'PUT') {
        bodies.push(JSON.parse(options.body));
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) });
      }
      return Promise.reject(new Error('unexpected url ' + url));
    },
  });
  const platform = loadPlatform(stub);
  assert.ok(platform.launch());
  platform.saveDoc({ records: { wins: 1, best: { score: 200, refusals: 1, ticks: 30, when: 5 } } });
  await platform.flush();
  await tick(); await tick();

  assert.equal(stub.els.player.textContent, 'Feaster', 'nickname displayed, never the username');
  for (const call of stub.calls) {
    assert.equal(call.options.headers['Authorization'], 'Bearer ' + token, 'Bearer on ' + call.url);
  }
  const urls = stub.calls.map((c) => c.url);
  assert.ok(urls.includes('/api/v1/users/user-abcdef123456/profile'));
  assert.ok(urls.includes('/api/v1/me/cloud-saves/hollow-feast'));
  assert.equal(bodies.length, 1, 'exactly one cloud PUT');
  const zipBytes = Buffer.from(bodies[0].dataBase64, 'base64');
  const doc = JSON.parse(new TextDecoder().decode(platform.__zip.unzipFirstEntry(new Uint8Array(zipBytes))));
  assert.equal(doc.records.best.score, 200, 'cloud payload decodes back to the save doc');
  assert.equal(stub.els.sync.attrs['data-state'], 'synced');
});

test('hosted mode: profile failure falls back to "Player " + id8', async () => {
  const token = makeToken({ sub: 'user-abcdef123456', game_scope: 'hollow-feast' });
  const stub = makeStub({
    hash: '#game_token=' + token,
    hostname: 'hollow-feast.starhermit.com',
    fetch(url) {
      stub.calls.push({ url });
      if (url === '/api/v1/users/user-abcdef123456/profile') {
        return Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    },
  });
  loadPlatform(stub);
  await tick(); await tick();
  assert.equal(stub.els.player.textContent, 'Player user-abc');
});
