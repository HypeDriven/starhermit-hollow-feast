'use strict';

/*
 * Hollow Feast — StarHermit platform adapter (window.__hf_platform).
 *
 * Loaded as a classic script after starhermit-sdk.js and before game.js; it
 * is null-checked everywhere it is used. The SDK (window.StarHermit) reads
 * the launch token (#game_token= or the #access_token= sign-in return),
 * strips it from the URL, renews it, and makes every platform call here:
 * profile nickname/avatar, the cloud-save slot game:<slug> (remote preferred
 * on load, 2 s debounce + keepalive flush on pagehide), the per-player
 * settings KV, key bindings and the invite link. With no token the adapter
 * is fully inert: zero network calls, and the save document lives only in
 * localStorage.
 */
(function () {
  const SH = window.StarHermit || null;
  const LS_KEY = 'hf.save.v1';         // offline cache of the save document

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

  function signedIn() { return !!(SH && SH.signedIn); }

  let loadedDoc = null;   // the save document currently in force
  let cloudLoaded = false;
  let pushHeld = false;
  let cloudError = false;
  let saving = false;

  // --- HUD: player name + sync status -------------------------------------

  let playerEl = null;
  let syncEl = null;

  function t(key) {
    const i18n = window.__hf_i18n;
    return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
  }

  function setPlayer(name, avatar) {
    if (!playerEl) return;
    playerEl.textContent = name;
    if (avatar && typeof document.createElement === 'function') {
      const img = document.createElement('img');
      img.className = 'hf-avatar';
      img.src = avatar;
      img.alt = '';
      playerEl.insertBefore(img, playerEl.firstChild);
    }
  }

  function setStatus(state, text) {
    if (!syncEl) return;
    syncEl.textContent = text;
    syncEl.setAttribute('data-state', state);
  }

  function refreshStatus() {
    if (!syncEl) return;
    if (!signedIn()) return setStatus('local', t('syncLocal'));
    if (saving) return setStatus('saving', t('syncSaving'));
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setStatus('offline', t('syncOffline'));
    if (cloudError) return setStatus('error', t('syncError'));
    if (!cloudLoaded) return setStatus('loading', t('syncLoading'));
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
    // Held until the start-up load settles: a doc queued before then would
    // still be PUT after the remote one is adopted, over the newer cloud save.
    if (signedIn()) {
      if (!cloudLoaded) pushHeld = true;
      else { saving = true; SH.saveJSON(loadedDoc); }
    }
    refreshStatus();
  }

  function flush(keepalive) {
    if (!signedIn()) return Promise.resolve(false);
    return SH.flushSave(keepalive === true);
  }

  function loadProfile() {
    setPlayer('Player ' + String(SH.userId).slice(0, 6));
    Promise.all([SH.profile(), SH.avatarUrl()]).then(function (r) {
      setPlayer(r[0] ? r[0].displayName : 'Player ' + String(SH.userId).slice(0, 6), r[1]);
    });
  }

  const authListeners = [];

  function boot() {
    playerEl = document.getElementById('player');
    syncEl = document.getElementById('sync');

    if (SH) {
      SH.init();
      SH.on('saved', function (ok) { saving = false; cloudError = !ok; refreshStatus(); });
      SH.on('auth', function (a) {
        if (!a.signedIn) setPlayer(t('localPlayer'));
        refreshStatus();
        for (let i = 0; i < authListeners.length; i++) {
          try { authListeners[i](a.signedIn); } catch (_) { /* ignore */ }
        }
      });
    }

    loadedDoc = readLocalDoc();
    emitDoc();

    if (signedIn()) {
      loadProfile();
      SH.loadJSON().then(function (doc) {
        if (doc) {
          // Remote wins on conflict; mirror it into the offline cache.
          loadedDoc = { v: 1, records: sanitizeRecords(doc.records) };
          writeLocalDoc(loadedDoc);
          emitDoc();
        }
        cloudLoaded = true;
        // A held save is stale once the remote doc is adopted; else push it.
        if (pushHeld && !doc) { saving = true; SH.saveJSON(loadedDoc); }
        pushHeld = false;
        refreshStatus();
      });
    } else {
      setPlayer(t('localPlayer'));
    }
    refreshStatus();

    window.addEventListener('pagehide', function () { flush(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush(true);
    });
    window.addEventListener('offline', refreshStatus);
    window.addEventListener('online', refreshStatus);
  }

  window.__hf_platform = {
    records: function () { return loadedDoc ? loadedDoc.records : sanitizeRecords(null); },
    saveDoc: saveDoc,
    onDoc: function (fn) { if (typeof fn === 'function') docListeners.push(fn); },
    onAuth: function (fn) { if (typeof fn === 'function') authListeners.push(fn); },
    launch: function () { return signedIn() ? { token: SH.token, sub: String(SH.userId), slug: SH.slug } : null; },
    flush: flush,
    canSignIn: function () { return !!(SH && SH.canSignIn()); },
    signIn: function () { return !!(SH && SH.signIn()); },
    getSettings: function () { return signedIn() ? SH.getSettings() : Promise.resolve({}); },
    patchSettings: function (obj) { if (signedIn()) SH.patchSettings(obj); },
    loadBindings: function (defaults) {
      return signedIn() ? SH.loadBindings(defaults) : Promise.resolve(JSON.parse(JSON.stringify(defaults)));
    },
    inviteLink: function () { return signedIn() ? SH.inviteLink() : null; },
  };

  // The script tag sits after the HUD markup, so the elements exist already;
  // boot synchronously — deferred module scripts (game.js) run before
  // DOMContentLoaded and read records() at once.
  boot();
})();
