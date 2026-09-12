'use strict';

/*
 * Hollow Feast — StarHermit platform adapter.
 *
 * Loaded as a classic script before game.js; exposes window.__hf_platform and
 * is null-checked everywhere it is used. In hosted mode (a launch token was
 * read from the URL) every /api call carries Authorization: Bearer, the
 * account nickname is fetched for the HUD, and the local save document is
 * mirrored to the platform cloud-save slot (zip+base64, one slot, remote
 * preferred on load, 2 s debounce + pagehide flush). With no token — local
 * dev or offline — the adapter is fully inert: zero network calls, and the
 * save document lives only in localStorage, exactly as before.
 *
 * Endpoints used (https://wiki.starhermit.com/): POST /api/v1/games/{slug}/
 * launch-token (refresh), GET /api/v1/users/{sub}/profile (nickname; never
 * /api/v1/me, never usernames), GET/PUT /api/v1/me/cloud-saves/{slug}.
 */
(function () {
  const REFRESH_MS = 45 * 60 * 1000;   // re-mint the 60-minute token early
  const REFRESH_RETRY_MS = 60 * 1000;  // retry a failed refresh after a minute
  const SAVE_DEBOUNCE_MS = 2000;
  const LS_KEY = 'hf.save.v1';         // offline cache of the save document

  // --- Launch token -------------------------------------------------------

  function decodeJwt(token) {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    try {
      let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = window.atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return JSON.parse(new TextDecoder('utf-8').decode(bytes));
    } catch (_) { return null; }
  }

  function isHostedHost(hostname) {
    return /(^|\.)starhermit\.com$/i.test(String(hostname || ''));
  }

  // Fragment first: #game_token=<jwt>(&session_id=<guid>), read once and
  // stripped from the URL. Query-param fallbacks are kept for local dev only
  // and are refused on *.starhermit.com hosts.
  function readLaunchToken() {
    let raw = '';
    let params = null;
    try {
      params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    } catch (_) { params = null; }
    if (params && params.has('game_token')) {
      raw = params.get('game_token') || '';
      params.delete('game_token');
      params.delete('session_id');
      let kept = '';
      try { kept = params.toString(); } catch (_) { kept = ''; }
      const clean = window.location.pathname + window.location.search + (kept ? '#' + kept : '');
      try { window.history.replaceState(null, '', clean); } catch (_) { /* strip is best-effort */ }
    } else if (!isHostedHost(window.location.hostname)) {
      try {
        const q = new URLSearchParams(window.location.search);
        raw = q.get('game_token') || q.get('token') || q.get('launch_token') || '';
      } catch (_) { raw = ''; }
    }
    if (!raw) return null;
    const claims = decodeJwt(raw);
    if (!claims || !claims.sub) return null;
    if (typeof claims.game_scope !== 'string' || !claims.game_scope) return null;
    return { token: raw, sub: String(claims.sub), slug: claims.game_scope };
  }

  // --- Minimal ZIP writer/reader (stored entries only, no compression). ---

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zipStore(name, dataBytes) {
    const enc = new TextEncoder();
    const nameB = enc.encode(name);
    const crc = crc32(dataBytes);
    const out = [];
    const u16 = (v) => out.push(v & 0xff, (v >> 8) & 0xff);
    const u32 = (v) => out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    u32(0x04034b50); u16(20); u16(0); u16(0); u16(0); u16(0);
    u32(crc); u32(dataBytes.length); u32(dataBytes.length);
    u16(nameB.length); u16(0);
    const local = out.length;
    const head = new Uint8Array(out);
    const cd = [];
    const c16 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff);
    const c32 = (v) => cd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    c32(0x02014b50); c16(20); c16(20); c16(0); c16(0); c16(0); c16(0);
    c32(crc); c32(dataBytes.length); c32(dataBytes.length);
    c16(nameB.length); c16(0); c16(0); c16(0); c16(0); c32(0); c32(0); // attrs + local-header offset
    const cdHead = new Uint8Array(cd);
    const cdOff = head.length + nameB.length + dataBytes.length;
    const parts = [head, nameB, dataBytes, cdHead, nameB];
    const eocd = [];
    const e32 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
    const e16 = (v) => eocd.push(v & 0xff, (v >> 8) & 0xff);
    e32(0x06054b50); e16(0); e16(0); e16(1); e16(1);
    e32(cdHead.length + nameB.length); e32(cdOff); e16(0);
    parts.push(new Uint8Array(eocd));
    const total = parts.reduce((n, p) => n + p.length, 0);
    const buf = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { buf.set(p, o); o += p.length; }
    return buf;
  }
  function unzipFirstEntry(zipBytes) {
    // Stored single-entry reader: scan local headers for compression 0.
    const dv = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
    let off = 0;
    while (off + 30 <= zipBytes.length && dv.getUint32(off, true) === 0x04034b50) {
      const method = dv.getUint16(off + 8, true);
      const size = dv.getUint32(off + 18, true);
      const nameLen = dv.getUint16(off + 26, true);
      const extraLen = dv.getUint16(off + 28, true);
      const dataOff = off + 30 + nameLen + extraLen;
      if (method !== 0) throw new Error('unsupported zip entry');
      return zipBytes.slice(dataOff, dataOff + size);
    }
    throw new Error('bad zip');
  }
  function bytesToBase64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000)
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function base64ToBytes(b64) {
    const s = atob(b64);
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  }

  // --- Save document ------------------------------------------------------

  // One JSON document: the whole platform-visible state of the game.
  function sanitizeRecords(rec) {
    const r = rec && typeof rec === 'object' ? rec : {};
    const num = function (v) {
      return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.floor(v)) : 0;
    };
    const best = r.best && typeof r.best === 'object' && typeof r.best.score === 'number'
      ? { score: num(r.best.score), refusals: num(r.best.refusals), ticks: num(r.best.ticks), when: num(r.when) }
      : null;
    const ip = r.inProgress && typeof r.inProgress === 'object' && Array.isArray(r.inProgress.cells) && r.inProgress.cells.length === 16
      ? r.inProgress
      : null;
    return { best: best, wins: num(r.wins), cleanWins: num(r.cleanWins), inProgress: ip };
  }

  function readLocalDoc() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const doc = JSON.parse(raw);
      return { v: 1, records: sanitizeRecords(doc && doc.records) };
    } catch (_) { return null; }
  }

  function writeLocalDoc(doc) {
    try {
      if (window.localStorage) window.localStorage.setItem(LS_KEY, JSON.stringify(doc));
    } catch (_) { /* full or blocked: the cloud mirror still holds the doc */ }
  }

  // --- API helpers --------------------------------------------------------

  let launch = null;      // { token, sub, slug } or null when local-only
  let loadedDoc = null;   // the save document currently in force
  let lastSavedDoc = null;
  let cloudError = false;
  let saveTimer = null;

  function api(path, options) {
    options = options || {};
    const headers = options.headers ? Object.assign({}, options.headers) : {};
    headers['Authorization'] = 'Bearer ' + launch.token;
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    return window.fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body,
      cache: 'no-store',
    }).then(function (resp) {
      if (!resp.ok) {
        const err = new Error('api ' + path + ' -> ' + resp.status);
        err.status = resp.status;
        throw err;
      }
      return resp;
    });
  }

  function refreshToken() {
    if (!launch) return;
    api('/api/v1/games/' + encodeURIComponent(launch.slug) + '/launch-token', { method: 'POST' })
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        if (data && typeof data.token === 'string' && data.token) {
          launch.token = data.token;
          const claims = decodeJwt(data.token);
          if (claims && claims.sub) launch.sub = String(claims.sub);
        }
        window.setTimeout(refreshToken, REFRESH_MS);
      })
      .catch(function () {
        window.setTimeout(refreshToken, REFRESH_RETRY_MS);
      });
  }

  function loadProfile() {
    api('/api/v1/users/' + encodeURIComponent(launch.sub) + '/profile')
      .then(function (resp) { return resp.json(); })
      .then(function (data) {
        const nick = data && typeof data.nickname === 'string' ? data.nickname.trim() : '';
        setPlayer(nick || fallbackName());
      })
      .catch(function () { setPlayer(fallbackName()); });
  }

  function fallbackName() {
    return 'Player ' + String(launch.sub).slice(0, 8);
  }

  function fetchCloudDoc() {
    return api('/api/v1/me/cloud-saves/' + encodeURIComponent(launch.slug))
      .then(function (resp) { return resp.arrayBuffer(); })
      .then(function (buf) {
        const bytes = unzipFirstEntry(new Uint8Array(buf));
        return JSON.parse(new TextDecoder('utf-8').decode(bytes));
      });
  }

  function flushCloudSave() {
    if (!launch) return Promise.resolve();
    if (saveTimer) { window.clearTimeout(saveTimer); saveTimer = null; }
    const doc = loadedDoc;
    if (doc === lastSavedDoc) return Promise.resolve();
    setStatus('saving', t('syncSaving'));
    const payload = JSON.stringify({
      dataBase64: bytesToBase64(zipStore(launch.slug + '.json', new TextEncoder().encode(JSON.stringify(doc)))),
    });
    return api('/api/v1/me/cloud-saves/' + encodeURIComponent(launch.slug), { method: 'PUT', body: payload })
      .then(function () { cloudError = false; lastSavedDoc = doc; })
      .catch(function () { cloudError = true; })
      .then(refreshStatus);
  }

  function scheduleCloudSave() {
    if (!launch) return;
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(function () { flushCloudSave(); }, SAVE_DEBOUNCE_MS);
  }

  // --- HUD: player name + sync status -------------------------------------

  let playerEl = null;
  let syncEl = null;

  function t(key) {
    const i18n = window.__hf_i18n;
    return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
  }

  function setPlayer(name) {
    if (playerEl) playerEl.textContent = name;
  }

  function setStatus(state, text) {
    if (!syncEl) return;
    syncEl.textContent = text;
    syncEl.setAttribute('data-state', state);
  }

  function refreshStatus() {
    if (!syncEl) return;
    if (saveTimer) return setStatus('saving', t('syncSaving'));
    if (!launch) return setStatus('local', t('syncLocal'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setStatus('offline', t('syncOffline'));
    if (cloudError) return setStatus('error', t('syncError'));
    if (loadedDoc === null) return setStatus('loading', t('syncLoading'));
    return setStatus('synced', t('syncSynced'));
  }

  // --- Document lifecycle -------------------------------------------------

  const docListeners = [];
  function emitDoc() {
    for (let i = 0; i < docListeners.length; i++) {
      try { docListeners[i](loadedDoc); } catch (_) { /* a broken listener must not break saving */ }
    }
  }

  // Accepts the save-document shape game.js uses: { records: {...} }.
  function saveDoc(doc) {
    loadedDoc = { v: 1, records: sanitizeRecords(doc && doc.records) };
    writeLocalDoc(loadedDoc);
    emitDoc();
    scheduleCloudSave();
    refreshStatus();
  }

  function boot() {
    playerEl = document.getElementById('player');
    syncEl = document.getElementById('sync');

    launch = readLaunchToken();
    if (launch) {
      window.setTimeout(refreshToken, REFRESH_MS);
      loadProfile();
    } else {
      setPlayer(t('localPlayer'));
    }

    loadedDoc = readLocalDoc();
    emitDoc();
    refreshStatus();

    if (launch) {
      setStatus('loading', t('syncLoading'));
      fetchCloudDoc()
        .catch(function (err) {
          if (err && err.status === 404) return null; // no cloud save yet
          throw err;
        })
        .then(function (doc) {
          if (doc) {
            // Remote wins on conflict; mirror it into the offline cache.
            loadedDoc = { v: 1, records: sanitizeRecords(doc.records) };
            writeLocalDoc(loadedDoc);
            emitDoc();
          }
        })
        .catch(function () { cloudError = true; })
        .then(refreshStatus);
    }

    window.addEventListener('pagehide', function () { flushCloudSave(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flushCloudSave();
    });
    window.addEventListener('offline', refreshStatus);
    window.addEventListener('online', function () {
      if (cloudError || (launch && loadedDoc !== lastSavedDoc)) flushCloudSave();
      refreshStatus();
    });
  }

  window.__hf_platform = {
    records: function () { return loadedDoc ? loadedDoc.records : sanitizeRecords(null); },
    saveDoc: saveDoc,
    onDoc: function (fn) { if (typeof fn === 'function') docListeners.push(fn); },
    launch: function () { return launch; },
    flush: flushCloudSave,
    __zip: { zipStore: zipStore, unzipFirstEntry: unzipFirstEntry, bytesToBase64: bytesToBase64, base64ToBytes: base64ToBytes, decodeJwt: decodeJwt },
  };

  // The script tag sits after the HUD markup, so the elements exist already;
  // boot synchronously — deferred module scripts (game.js) run before
  // DOMContentLoaded and read records() at once.
  boot();
})();
