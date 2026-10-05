'use strict';

(function () {
  const rules = window.__hf_rules;
  if (!rules || typeof rules.initialState !== 'function') throw new Error('missing rules');

  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const eatenEl = document.getElementById('eaten');
  const bestEl = document.getElementById('best');
  const winEl = document.getElementById('win-banner');

  // Graphics settings (js/gfx.js model). Saved under a namespaced key; `{}`
  // means Auto. Read before the renderer exists because canvas MSAA is fixed
  // at context creation.
  const gfxApi = window.__hf_gfx || null;
  const post = window.__hf_post || null;
  const GFX_KEY = 'hf.gfx.v1';
  function loadGfx() {
    try {
      const raw = window.localStorage && window.localStorage.getItem(GFX_KEY);
      const v = raw ? JSON.parse(raw) : {};
      return v && typeof v === 'object' ? v : {};
    } catch (_) { return {}; }
  }
  function storeGfx(v, fromPlatform) {
    try { if (window.localStorage) window.localStorage.setItem(GFX_KEY, JSON.stringify(v)); } catch (_) { /* private mode */ }
    // Mirror the preference to the StarHermit per-player settings KV (no-op without a token).
    const p = window.__hf_platform;
    if (p && !fromPlatform) p.patchSettings({ gfx: v });
  }
  let gfxSaved = loadGfx();
  const bootGfx = gfxApi ? gfxApi.resolve(gfxSaved, 'low') : null;
  const canvasMsaa = !bootGfx || bootGfx.auto || bootGfx.antialias === 'msaa';
  let q = null; // resolved settings, set by applyGraphics()

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: canvasMsaa });
  } catch (err) {
    const msg = document.createElement('p');
    msg.setAttribute('role', 'alert');
    msg.textContent = 'Hollow Feast needs WebGL to render, and it is unavailable in this browser. Try another browser or device.';
    canvas.replaceWith(msg);
    return;
  }
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // GPU name: the plain RENDERER string where the browser exposes a real one
  // (Firefox), otherwise the unmasked debug string (Chromium).
  const gpu = (function () {
    try {
      const gl = renderer.getContext();
      let name = gl.getParameter(gl.RENDERER);
      if (!name || /^webkit webgl$/i.test(String(name))) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        if (ext) name = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      }
      return String(name || '');
    } catch (_) { return ''; }
  })();
  const isMobile = (function () {
    try { return window.matchMedia('(pointer: coarse)').matches; } catch (_) { return false; }
  })();
  const detectedPreset = gfxApi ? gfxApi.detectPreset(gpu, isMobile) : 'low';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a26);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  // Viewing direction (from the board centre towards the camera); the
  // distance and look-at target are solved in fitCamera() so the whole
  // playfield stays inside the canvas at any aspect ratio.
  const CAM_DIR = new THREE.Vector3(0, 16.5, 15).normalize();

  // Cool sky / warm table hemisphere fill, a flat ambient floor and a warm key
  // light from the upper left. The key casts PCF shadows when enabled; its
  // shadow box is fitted to the playfield below.
  const hemi = new THREE.HemisphereLight(0xc6d4f5, 0x3a2a1c, 1.05);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);
  const dir = new THREE.DirectionalLight(0xfff0dc, 1.8);
  dir.position.set(-4, 10, 8).normalize().multiplyScalar(30);
  dir.target.position.set(0, 0, 0);
  scene.add(dir);
  scene.add(dir.target);
  dir.shadow.bias = -0.0004;
  dir.shadow.normalBias = 0.03;
  dir.shadow.radius = 3;

  // The logical board is 4x4 with grid pitch STEP; the plane is sized to
  // that grid plus a rim so every item and the void sit on it.
  const STEP = 4.2;
  const BOARD = STEP * 4 + 1.6;
  const SLAB_H = 0.45;
  const boardGeo = new THREE.PlaneGeometry(BOARD, BOARD);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3a5f8a, roughness: 0.88, metalness: 0.0 });
  // Slate surface texture. The flat colour above stays as the fallback, so a
  // missing or failed texture load leaves the board fully readable.
  try {
    new THREE.TextureLoader().load(
      'assets/board-slate.webp',
      function (tex) {
        tex.colorSpace = THREE.SRGBColorSpace || tex.colorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1;
        boardMat.map = tex;
        boardMat.color.set(0xffffff);
        boardMat.needsUpdate = true;
      },
      undefined,
      function () { /* keep the flat-colour board */ }
    );
  } catch (_) { /* keep the flat-colour board */ }
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.rotation.x = -Math.PI / 2;
  boardMesh.receiveShadow = true;
  scene.add(boardMesh);

  // Map grid coords to world positions on the plane.
  function worldX(x) { return (x - 1.5) * STEP; }
  function worldZ(y) { return (y - 1.5) * STEP; }

  // Procedural canvas texture (subtle noise/grain for otherwise flat surfaces).
  function noiseTexture(size, base, draw) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = base;
    g.fillRect(0, 0, size, size);
    draw(g, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }
  function seeded(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  // "Detailed" table: a thick slate slab, dark ceramic plates under the twelve
  // courses and a walnut table top that fills the frame. All of it is additive
  // set dressing; the plain tier is the original flat slab.
  const detailGroup = new THREE.Group();
  scene.add(detailGroup);
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x1d2736, roughness: 0.8 });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD, SLAB_H, BOARD), slabMat);
  slab.position.y = -SLAB_H / 2 - 0.01;
  slab.castShadow = true;
  slab.receiveShadow = true;
  detailGroup.add(slab);
  let tableMat = null;
  try {
    const rnd = seeded(56);
    const wood = noiseTexture(512, '#2b1d14', function (g, n) {
      for (let i = 0; i < 260; i++) {
        const y = rnd() * n;
        g.strokeStyle = 'rgba(' + (rnd() < 0.5 ? '12,7,4' : '70,48,32') + ',' + (0.12 + rnd() * 0.22) + ')';
        g.lineWidth = 0.6 + rnd() * 2.2;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= n; x += 32) g.lineTo(x, y + Math.sin(x * 0.013 + i) * 3 + (rnd() - 0.5) * 1.5);
        g.stroke();
      }
    });
    wood.repeat.set(3, 3);
    wood.anisotropy = 4;
    tableMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.62, metalness: 0.0 });
  } catch (_) {
    tableMat = new THREE.MeshStandardMaterial({ color: 0x2b1d14, roughness: 0.62 });
  }
  const table = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), tableMat);
  table.rotation.x = -Math.PI / 2;
  table.position.y = -SLAB_H - 0.01;
  table.receiveShadow = true;
  detailGroup.add(table);
  // Shallow dish: a lathe profile with a flat well and a raised, rolled rim.
  const plateGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.02), new THREE.Vector2(0.78, 0.02), new THREE.Vector2(0.9, 0.05),
    new THREE.Vector2(1.18, 0.14), new THREE.Vector2(1.26, 0.13), new THREE.Vector2(1.24, 0.0),
  ], 48);
  const plateMat = new THREE.MeshPhysicalMaterial({ color: 0x46526a, roughness: 0.3, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2, side: THREE.DoubleSide });
  const plates = [];
  for (let i = 0; i < 16; i++) {
    const p = new THREE.Mesh(plateGeo, plateMat);
    p.position.set(worldX(i % 4), 0.0, worldZ(Math.floor(i / 4)));
    p.receiveShadow = true;
    p.visible = false;
    detailGroup.add(p);
    plates.push(p);
  }

  // Items (12) and void.
  const itemGeo = new THREE.IcosahedronGeometry(0.95);
  const itemMat = new THREE.MeshPhysicalMaterial({
    color: 0xff8c3a, flatShading: true, roughness: 0.58, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.2,
    envMapIntensity: 0.5,
  });
  const items = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(itemGeo, itemMat.clone());
    m.position.y = 1.0;
    m.castShadow = true;
    m.rotation.set(i * 0.7, i * 1.3, 0);
    scene.add(m);
    items.push(m);
  }

  const VOID_R = 1.7;
  const VOID_Y = 1.6;
  const voidGeo = new THREE.SphereGeometry(VOID_R, 48, 48);
  const voidMat = new THREE.MeshPhysicalMaterial({
    color: 0xf6e7b2, emissive: new THREE.Color(0xcaa64d), emissiveIntensity: 0.8,
    roughness: 0.38, metalness: 0.0, clearcoat: 0.0, clearcoatRoughness: 0.15,
  });
  const voidMesh = new THREE.Mesh(voidGeo, voidMat);
  voidMesh.position.y = VOID_Y;
  voidMesh.castShadow = true;
  scene.add(voidMesh);

  // Warm light hovering over the next course: it pools on the slab under the
  // one glowing morsel (detailed tier only).
  const nextLight = new THREE.PointLight(0xff9a4a, 0, 9, 1.6);
  nextLight.visible = false;
  scene.add(nextLight);

  // Floating motes: warm dust drifting up through the light above the table.
  const MOTE_MAX = 120;
  const motePos = new Float32Array(MOTE_MAX * 3);
  const moteSeed = new Float32Array(MOTE_MAX);
  (function () {
    const rnd = seeded(12);
    for (let i = 0; i < MOTE_MAX; i++) {
      motePos[i * 3] = (rnd() - 0.5) * BOARD * 1.15;
      motePos[i * 3 + 1] = 0.3 + rnd() * 6;
      motePos[i * 3 + 2] = (rnd() - 0.5) * BOARD * 1.15;
      moteSeed[i] = rnd() * Math.PI * 2;
    }
  })();
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteSprite = noiseTexture(64, 'rgba(0,0,0,0)', function (g, n) {
    const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, n, n);
    g.fillStyle = grad;
    g.fillRect(0, 0, n, n);
  });
  const moteMat = new THREE.PointsMaterial({
    color: 0xffc27a, size: 0.24, map: moteSprite, transparent: true, opacity: 0.75,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.visible = false;
  motes.frustumCulled = false;
  scene.add(motes);

  // Image-based lighting from the same-revision RoomEnvironment, built lazily.
  let envTex = null;
  function environment() {
    if (envTex || !post || !post.RoomEnvironment) return envTex;
    try {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envTex = pmrem.fromScene(new post.RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    } catch (_) { envTex = null; }
    return envTex;
  }

  // Everything that must stay on screen: the board's corners and the void's
  // bounding box over every cell it can occupy (items sit inside that box).
  const FIT_POINTS = [];
  const half = BOARD / 2;
  [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(function (c) {
    FIT_POINTS.push(new THREE.Vector3(c[0], 0, c[1]));
    FIT_POINTS.push(new THREE.Vector3(c[0], -SLAB_H, c[1]));
  });
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const x = worldX(cx);
      const z = worldZ(cy);
      [-1, 1].forEach(function (sx) {
        [-1, 1].forEach(function (sz) {
          FIT_POINTS.push(new THREE.Vector3(x + sx * VOID_R, VOID_Y + VOID_R, z + sz * VOID_R));
          FIT_POINTS.push(new THREE.Vector3(x + sx * VOID_R, VOID_Y - VOID_R, z + sz * VOID_R));
        });
      });
    }
  }

  // Fit the key light's orthographic shadow box tightly around the playfield
  // (every fit point, i.e. the slab and the void at any cell), in light space.
  (function fitShadow() {
    const cam = dir.shadow.camera;
    cam.position.copy(dir.position);
    cam.lookAt(dir.target.position);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
    const v = new THREE.Vector3();
    FIT_POINTS.forEach(function (p) {
      v.copy(p).applyMatrix4(inv);
      b.minX = Math.min(b.minX, v.x); b.maxX = Math.max(b.maxX, v.x);
      b.minY = Math.min(b.minY, v.y); b.maxY = Math.max(b.maxY, v.y);
      b.minZ = Math.min(b.minZ, v.z); b.maxZ = Math.max(b.maxZ, v.z);
    });
    const pad = 0.6;
    cam.left = b.minX - pad; cam.right = b.maxX + pad;
    cam.bottom = b.minY - pad; cam.top = b.maxY + pad;
    cam.near = Math.max(0.1, -b.maxZ - 2); cam.far = -b.minZ + 2;
    cam.updateProjectionMatrix();
  })();

  // Fraction of the frustum the playfield may fill; the rest is breathing room.
  const FIT_FILL = 0.92;
  const fitTarget = new THREE.Vector3(0, 0, 0);
  const tmpV = new THREE.Vector3();
  const tmpRight = new THREE.Vector3();
  const tmpUp = new THREE.Vector3();

  // Returns the NDC bounding box of FIT_POINTS for the current camera.
  function projectedBounds() {
    const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (let i = 0; i < FIT_POINTS.length; i++) {
      tmpV.copy(FIT_POINTS[i]).project(camera);
      if (tmpV.x < b.minX) b.minX = tmpV.x;
      if (tmpV.x > b.maxX) b.maxX = tmpV.x;
      if (tmpV.y < b.minY) b.minY = tmpV.y;
      if (tmpV.y > b.maxY) b.maxY = tmpV.y;
    }
    return b;
  }

  // Solve camera distance and look-at target so the projected playfield is
  // centred and fills FIT_FILL of the viewport in its tighter axis.
  function fitCamera() {
    let dist = 40;
    for (let iter = 0; iter < 12; iter++) {
      camera.position.copy(CAM_DIR).multiplyScalar(dist).add(fitTarget);
      camera.lookAt(fitTarget);
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const b = projectedBounds();
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const sx = (b.maxX - b.minX) / 2;
      const sy = (b.maxY - b.minY) / 2;
      const scale = Math.max(sx, sy) / FIT_FILL;
      // Shift the target so the box is centred (world units at target depth).
      const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * dist;
      const halfW = halfH * camera.aspect;
      tmpRight.setFromMatrixColumn(camera.matrixWorld, 0);
      tmpUp.setFromMatrixColumn(camera.matrixWorld, 1);
      fitTarget.addScaledVector(tmpRight, cx * halfW).addScaledVector(tmpUp, cy * halfH);
      dist *= scale;
      if (Math.abs(scale - 1) < 0.002 && Math.abs(cx) < 0.002 && Math.abs(cy) < 0.002) break;
    }
    camera.position.copy(CAM_DIR).multiplyScalar(dist).add(fitTarget);
    camera.lookAt(fitTarget);
    camera.updateMatrixWorld(true);
    camera.updateProjectionMatrix();
  }

  // Game state: 4x4 grid, 12 numbered items in a solvable snake order,
  // column x=3 left empty, void starts at (3,0) next to item 1.
  //   y=0:  3  2  1  .
  //   y=1:  4  5  6  .
  //   y=2:  9  8  7  .
  //   y=3: 10 11 12  .
  const ORDER = [3, 2, 1, 0, 4, 5, 6, 0, 9, 8, 7, 0, 10, 11, 12, 0];
  function freshState() {
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const order = ORDER[i];
      cells.push(order ? { kind: 'item', order: order } : { kind: null, order: null });
    }
    const s = rules.initialState(null, cells, [3, 0]);
    if (!s || !Array.isArray(s.cells)) throw new Error('bad initial');
    return s;
  }
  let state;
  try {
    state = window.__hf_state || null;
    if (!state || !Array.isArray(state.cells) || state.cells.length !== 16) throw new Error('bad state');
    if (typeof rules.applyAction !== 'function') throw new Error('no rules');
  } catch (_) {
    state = freshState();
  }

  // Platform bridge: records (best line, win counts, mid-round board) live in
  // the platform save document — localStorage offline cache, cloud mirror when
  // launched with a token. An unfinished round resumes where it left off; a
  // remote document arriving later only replaces a board nobody has touched.
  const platform = window.__hf_platform || null;
  let records = platform ? platform.records() : { best: null, wins: 0, cleanWins: 0, inProgress: null };

  function reviveState(summary) {
    try {
      if (!summary || summary.won) return null;
      if (!Array.isArray(summary.cells) || summary.cells.length !== 16) return null;
      const cells = summary.cells.map(function (c) {
        if (!c || typeof c !== 'object') throw new Error('bad cell');
        return { kind: c.kind === 'item' ? 'item' : null, order: typeof c.order === 'number' ? c.order : null };
      });
      if (!cells.some(function (c) { return c.kind; })) return null;
      const s = rules.initialState(null, cells, summary.voidPos);
      s.score = typeof summary.score === 'number' ? summary.score : 0;
      s.invalidActions = typeof summary.invalidActions === 'number' ? summary.invalidActions : 0;
      s.tick = typeof summary.tick === 'number' ? summary.tick : 0;
      return s;
    } catch (_) { return null; }
  }

  if (!window.__hf_state) {
    const revived = reviveState(records.inProgress);
    if (revived) state = revived;
  }

  if (platform) {
    platform.onDoc(function (doc) {
      if (!doc || !doc.records) return;
      records = doc.records;
      displayBest();
      if (!window.__hf_state && state && !state.won && state.tick === 0 && records.inProgress && !records.inProgress.won) {
        const r = reviveState(records.inProgress);
        if (r) { state = r; syncScene(); updateHUD(); }
      }
    });
  }

  function progressSummary(s) {
    return {
      tick: s.tick, score: s.score, invalidActions: s.invalidActions, won: !!s.won,
      cells: s.cells, voidPos: s.voidPos,
    };
  }

  function persistRecords() {
    if (platform) platform.saveDoc({ records: records });
  }

  function saveProgress(s) {
    records.inProgress = progressSummary(s);
    persistRecords();
  }

  // Best-line ordering matches the §4 tie-breaks: score, then fewer refusals,
  // then fewer ticks.
  function onWon(finalState) {
    records.wins = (records.wins || 0) + 1;
    if (finalState.invalidActions === 0) records.cleanWins = (records.cleanWins || 0) + 1;
    const candidate = {
      score: finalState.score,
      refusals: finalState.invalidActions,
      ticks: finalState.tick,
      when: Date.now(),
    };
    const best = records.best;
    if (!best
      || candidate.score > best.score
      || (candidate.score === best.score && candidate.refusals < best.refusals)
      || (candidate.score === best.score && candidate.refusals === best.refusals && candidate.ticks < best.ticks)) {
      records.best = candidate;
    }
    records.inProgress = null;
    persistRecords();
  }

  function displayBest() {
    if (!bestEl) return;
    const best = records.best;
    bestEl.textContent = best ? best.score + ' · ' + best.refusals + 'R · ' + best.ticks + 'T' : '—';
  }

  // The eat order is fixed but invisible on the meshes, so the next morsel is
  // marked by an emissive lift: it is the only warm-glowing item on the board.
  // With bloom on, the glow is pushed past the bloom threshold so it haloes.
  const NEXT_EMISSIVE = 0xff8c3a;
  let nextIndex = -1;
  function nextGlow() { return q && q.bloom === 'on' ? 1.35 : 0.85; }
  function highlightNext() {
    const next = state.cells.filter(function (c) { return !c.kind && c.order != null; }).length + 1;
    nextIndex = -1;
    for (let i = 0; i < items.length; i++) {
      const isNext = !state.won && (i + 1) === next;
      if (isNext) nextIndex = i;
      items[i].material.emissive.setHex(isNext ? NEXT_EMISSIVE : 0x000000);
      items[i].material.emissiveIntensity = isNext ? nextGlow() : 0;
      items[i].scale.setScalar(isNext ? 1.18 : 1);
    }
    if (nextIndex >= 0) nextLight.position.set(items[nextIndex].position.x, 2.3, items[nextIndex].position.z);
    nextLight.visible = nextIndex >= 0 && !!q && q.detail === 'detailed';
  }

  function syncScene() {
    // Position item meshes from state: mesh i shows the item with order i+1.
    for (let j = 0; j < state.cells.length; j++) {
      const cell = state.cells[j];
      if (!cell.order) continue;
      const mesh = items[cell.order - 1];
      const x = j % 4;
      const y = Math.floor(j / 4);
      mesh.position.x = worldX(x);
      mesh.position.z = worldZ(y);
      mesh.visible = !!cell.kind;
      plates[j].visible = true;
    }
    voidMesh.position.x = worldX(state.voidPos[0]);
    voidMesh.position.z = worldZ(state.voidPos[1]);
    highlightNext();
  }

  function updateHUD() {
    scoreEl.textContent = String(state.score);
    const eaten = state.cells.filter(function (c) { return !c.kind && c.order != null; }).length;
    eatenEl.textContent = eaten + ' / 12';
    displayBest();
    if (winEl) winEl.hidden = !state.won;
  }

  // ---------------------------------------------------------------- graphics

  // Colour grade + vignette, applied in display space after OutputPass:
  // gentle S-curve, a touch more saturation, cool shadows / warm highlights.
  const GradeShader = {
    uniforms: { tDiffuse: { value: null }, uAmount: { value: 1.0 }, uVignette: { value: 0.28 } },
    vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uAmount; uniform float uVignette; varying vec2 vUv;',
      'void main() {',
      '  vec4 src = texture2D(tDiffuse, vUv);',
      '  vec3 c = clamp(src.rgb, 0.0, 1.0);',
      '  vec3 s = mix(c, c * c * (3.0 - 2.0 * c), 0.22);',
      '  float l = dot(s, vec3(0.299, 0.587, 0.114));',
      '  s = mix(vec3(l), s, 1.1);',
      '  s *= mix(vec3(0.95, 0.98, 1.06), vec3(1.05, 1.0, 0.94), smoothstep(0.15, 0.8, l));',
      '  c = mix(c, s, uAmount);',
      '  float d = length((vUv - 0.5) * vec2(1.0, 0.9));',
      '  c *= 1.0 - uVignette * smoothstep(0.32, 0.8, d);',
      '  gl_FragColor = vec4(c, src.a);',
      '}',
    ].join('\n'),
  };

  const reducedMotionMq = (function () {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)'); } catch (_) { return null; }
  })();
  function motionAllowed() { return !(reducedMotionMq && reducedMotionMq.matches); }

  let composer = null;
  let postKey = null;
  let postFailed = !post;
  let pixelRatio = 0;
  let size = [0, 0];
  let adaptiveScale = 1;
  let frames = [];
  let fps = 0;
  let lastNow = 0;
  let clock = 0;

  function allMaterials() {
    const out = [];
    scene.traverse(function (o) { if (o.material && out.indexOf(o.material) < 0) out.push(o.material); });
    return out;
  }

  /** Apply the resolved settings to the live scene; no reload needed. */
  function applyGraphics() {
    q = gfxApi ? gfxApi.resolve(gfxSaved, detectedPreset)
      : { preset: 'low', auto: true, scale: 1, dprCap: 2, shadows: 'off', ao: 'off', bloom: 'off', grade: 'off', antialias: 'msaa', reflections: 'off', detail: 'plain', particles: 'off', adaptive: true, showFps: false, post: false };
    // MSAA without canvas MSAA (a non-MSAA boot) goes through a multisampled post target.
    q.post = !postFailed && (q.post || (q.antialias === 'msaa' && !canvasMsaa));
    const shadowSize = gfxApi ? gfxApi.SHADOW_MAP[q.shadows] : 0;
    renderer.shadowMap.enabled = shadowSize > 0;
    dir.castShadow = shadowSize > 0;
    if (shadowSize > 0 && dir.shadow.mapSize.x !== shadowSize) {
      dir.shadow.mapSize.set(shadowSize, shadowSize);
      if (dir.shadow.map) { dir.shadow.map.dispose(); dir.shadow.map = null; }
    }
    const detailed = q.detail === 'detailed';
    detailGroup.visible = detailed;
    itemMat.clearcoat = detailed ? 0.8 : 0;
    items.forEach(function (m) { m.material.clearcoat = detailed ? 0.8 : 0; });
    voidMat.clearcoat = detailed ? 1 : 0;
    voidMat.emissiveIntensity = detailed ? 0.3 : 1.0;
    const env = q.reflections === 'on' ? environment() : null;
    scene.environment = env;
    scene.environmentIntensity = 0.4;
    hemi.intensity = env ? 0.7 : 1.05;
    const count = gfxApi ? gfxApi.PARTICLES[q.particles] : 0;
    motes.visible = count > 0;
    moteGeo.setDrawRange(0, count);
    adaptiveScale = 1;
    frames = [];
    postKey = null; // rebuild the post chain on the next frame
    // Materials pick up shadow-map / clearcoat / environment changes on recompile.
    allMaterials().forEach(function (m) { m.needsUpdate = true; });
    highlightNext();
    fpsVisible(q.showFps);
    canvas.setAttribute('data-gfx-preset', q.preset);
    document.body.setAttribute('data-gfx-preset', q.preset);
    Object.keys(gfxApi ? gfxApi.CATEGORIES : {}).forEach(function (cat) { canvas.setAttribute('data-gfx-' + cat, q[cat]); });
    canvas.setAttribute('data-gfx-post', q.post ? 'on' : 'off');
  }

  function fpsVisible(on) {
    let el = document.getElementById('fps-meter');
    if (on && !el) {
      el = document.createElement('div');
      el.id = 'fps-meter';
      el.setAttribute('aria-hidden', 'true');
      document.body.appendChild(el);
    }
    if (el) el.hidden = !on;
  }

  function buildPost(w, h) {
    if (composer) { composer.dispose(); composer = null; }
    if (!q.post || !post) return;
    try {
      const pw = Math.max(1, Math.round(w * pixelRatio));
      const ph = Math.max(1, Math.round(h * pixelRatio));
      const target = new THREE.WebGLRenderTarget(pw, ph, {
        type: THREE.HalfFloatType, samples: q.antialias === 'msaa' ? 4 : 0,
      });
      const c = new post.EffectComposer(renderer, target);
      c.setPixelRatio(pixelRatio);
      c.setSize(w, h);
      c.addPass(new post.RenderPass(scene, camera));
      if (q.ao !== 'off') {
        const ao = new post.GTAOPass(scene, camera, pw, ph);
        ao.output = post.GTAOPass.OUTPUT.Default;
        ao.blendIntensity = 0.75;
        ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 1.5, scale: 1.0, samples: q.ao === 'high' ? 16 : 8 });
        ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: q.ao === 'high' ? 6 : 4, rings: 2, samples: q.ao === 'high' ? 16 : 8 });
        c.addPass(ao);
      }
      if (q.bloom === 'on') {
        // High threshold: only the glowing morsel, the void's sheen and motes bloom.
        c.addPass(new post.UnrealBloomPass(new THREE.Vector2(w, h), 0.42, 0.45, 0.9));
      }
      c.addPass(new post.OutputPass());
      if (q.grade === 'on') c.addPass(new post.ShaderPass(GradeShader));
      if (q.antialias === 'smaa') c.addPass(new post.SMAAPass(pw, ph));
      if (q.antialias === 'fxaa') {
        const fxaa = new post.ShaderPass(post.FXAAShader);
        fxaa.material.uniforms.resolution.value.set(1 / pw, 1 / ph);
        c.addPass(fxaa);
      }
      composer = c;
    } catch (_) {
      // Post-processing is an enhancement: render directly and say so in the panel.
      postFailed = true;
      composer = null;
      q.post = false;
      canvas.setAttribute('data-gfx-post', 'off');
      refreshPanel();
    }
  }

  // Adaptive resolution: average ~90 frames; step down when slow, back up when fast.
  function adapt(dt) {
    frames.push(dt);
    if (frames.length < 90) return false;
    const avg = frames.reduce(function (a, b) { return a + b; }, 0) / frames.length;
    frames = [];
    fps = 1000 / avg;
    const el = document.getElementById('fps-meter');
    if (el && !el.hidden) el.textContent = Math.round(fps) + ' fps · ' + (Math.round(pixelRatio * 100) / 100) + '×';
    if (!q.adaptive) return false;
    const before = adaptiveScale;
    if (avg > 26) adaptiveScale = Math.max(0.6, adaptiveScale - 0.1);
    else if (avg < 14 && adaptiveScale < 1) adaptiveScale = Math.min(1, adaptiveScale + 0.05);
    return before !== adaptiveScale;
  }

  // Gentle ambient motion (off under prefers-reduced-motion): the void idles
  // with a slow bob, the next course turns and pulses, its light shimmers and
  // the motes drift. Positions on the grid never animate — moves stay snaps.
  function animate(dt) {
    const moving = motionAllowed();
    if (moving) clock += dt / 1000;
    const t = clock;
    voidMesh.position.y = VOID_Y + (moving ? Math.sin(t * 1.7) * 0.09 : 0);
    if (nextIndex >= 0) {
      const m = items[nextIndex];
      if (moving) m.rotation.y += dt * 0.0007;
      const pulse = moving ? 0.5 + 0.5 * Math.sin(t * 3.1) : 0.5;
      m.material.emissiveIntensity = nextGlow() * (0.85 + 0.3 * pulse);
      nextLight.intensity = 9 * (0.9 + 0.2 * pulse);
    }
    if (motes.visible && moving) {
      const n = moteGeo.drawRange.count;
      const lim = BOARD * 0.575;
      for (let i = 0; i < n; i++) {
        const k = i * 3;
        motePos[k + 1] += dt * 0.00035 * (0.6 + 0.4 * Math.sin(moteSeed[i]));
        motePos[k] += Math.sin(t * 0.6 + moteSeed[i]) * dt * 0.00018;
        if (motePos[k + 1] > 6.3) { motePos[k + 1] = 0.3; }
        if (motePos[k] > lim) motePos[k] = -lim; else if (motePos[k] < -lim) motePos[k] = lim;
      }
      moteGeo.attributes.position.needsUpdate = true;
      moteMat.opacity = 0.6 + 0.15 * Math.sin(t * 0.9);
    }
  }

  function renderFrame() {
    const now = performance.now();
    const dt = lastNow ? Math.min(250, now - lastNow) : 16;
    lastNow = now;
    const rescale = adapt(dt);
    animate(dt);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    // The canvas sits inside the zoomed page (ui-scale.js), so its backing store
    // also scales by UIScale.value to stay sharp on large screens.
    const dpr = Math.min(window.devicePixelRatio || 1, q.dprCap) * ((window.UIScale && window.UIScale.value) || 1);
    const ratio = Math.min(3, Math.max(0.5, dpr * q.scale * adaptiveScale));
    if (w !== size[0] || h !== size[1] || ratio !== pixelRatio || rescale) {
      size = [w, h];
      pixelRatio = ratio;
      renderer.setPixelRatio(ratio);
      renderer.setSize(w, h, false);
      if (panelOpen()) refreshPanel();
    }
    const key = q.post ? [q.ao, q.bloom, q.grade, q.antialias, w, h, pixelRatio].join('|') : 'none';
    if (key !== postKey) {
      postKey = key;
      buildPost(w, h);
    }
    if (composer) composer.render(dt / 1000);
    else renderer.render(scene, camera);
  }

  // ---------------------------------------------------------------- settings panel

  const i18n = window.__hf_i18n || null;
  function tr(key, vars) {
    let s = i18n ? i18n.t(key) : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace('{' + k + '}', vars[k]); });
    return s;
  }
  function presetLabel(p) { return tr('tier' + p.charAt(0).toUpperCase() + p.slice(1)); }
  const panel = document.getElementById('settings-panel');
  const settingsBtn = document.getElementById('settings-btn');
  const controlsBox = document.getElementById('gfx-controls');
  const summaryEl = document.getElementById('gfx-summary');
  const postNoteEl = document.getElementById('gfx-post-note');
  const gfxInputs = {};

  function row(labelKey, id, control) {
    const r = document.createElement('div');
    r.className = 'gfx-row';
    const l = document.createElement('label');
    l.htmlFor = id;
    l.textContent = tr(labelKey);
    r.appendChild(l);
    r.appendChild(control);
    controlsBox.appendChild(r);
  }
  function select(id, key, values) {
    const s = document.createElement('select');
    s.id = id;
    s.setAttribute('data-gfx', key);
    values.forEach(function (v) {
      const o = document.createElement('option');
      o.value = v;
      s.appendChild(o);
    });
    gfxInputs[key] = s;
    return s;
  }
  function checkbox(id, key) {
    const c = document.createElement('input');
    c.type = 'checkbox';
    c.id = id;
    c.setAttribute('data-gfx', key);
    gfxInputs[key] = c;
    return c;
  }

  function buildPanel() {
    if (!controlsBox || !gfxApi) return;
    row('gfxQuality', 'gfx-preset', select('gfx-preset', 'preset', ['auto'].concat(gfxApi.PRESETS)));
    const wrapScale = document.createElement('div');
    wrapScale.className = 'gfx-scale';
    const range = document.createElement('input');
    range.type = 'range';
    range.id = 'gfx-scale';
    range.min = '50'; range.max = '200'; range.step = '5';
    range.setAttribute('data-gfx', 'render_scale');
    const out = document.createElement('output');
    out.id = 'gfx-scale-value';
    out.htmlFor = 'gfx-scale';
    wrapScale.appendChild(range);
    wrapScale.appendChild(out);
    gfxInputs.render_scale = range;
    row('gfxScale', 'gfx-scale', wrapScale);
    Object.keys(gfxApi.CATEGORIES).forEach(function (cat) {
      row('cat_' + cat, 'gfx-' + cat, select('gfx-' + cat, cat, ['preset'].concat(gfxApi.CATEGORIES[cat])));
    });
    row('gfxAdaptive', 'gfx-adaptive', checkbox('gfx-adaptive', 'adaptive'));
    row('gfxFps', 'gfx-fps', checkbox('gfx-fps', 'show_fps'));

    controlsBox.addEventListener('change', onGfxInput);
    range.addEventListener('input', function () { out.textContent = range.value + '%'; });
  }

  function onGfxInput(e) {
    const el = e.target;
    const key = el && el.getAttribute('data-gfx');
    if (!key) return;
    if (key === 'preset') gfxSaved = gfxApi.choosePreset(gfxSaved, el.value);
    else if (key === 'render_scale') gfxSaved.render_scale = Math.round(Number(el.value)) / 100;
    else if (key === 'adaptive' || key === 'show_fps') gfxSaved[key] = !!el.checked;
    else if (el.value === 'preset') delete gfxSaved[key];
    else gfxSaved[key] = el.value;
    storeGfx(gfxSaved);
    applyGraphics();
    refreshPanel();
  }

  function refreshPanel() {
    if (!gfxApi || !gfxInputs.preset) return;
    const presetSel = gfxInputs.preset;
    Array.prototype.forEach.call(presetSel.options, function (o) {
      o.textContent = o.value === 'auto' ? tr('gfxAuto', { tier: presetLabel(detectedPreset) }) : presetLabel(o.value);
    });
    presetSel.value = q.auto ? 'auto' : q.preset;
    Object.keys(gfxApi.CATEGORIES).forEach(function (cat) {
      const s = gfxInputs[cat];
      Array.prototype.forEach.call(s.options, function (o) {
        o.textContent = o.value === 'preset'
          ? tr('gfxFromPreset', { tier: tr('t_' + gfxApi.presetTier(q.preset, cat)) })
          : tr('t_' + o.value);
      });
      s.value = gfxApi.CATEGORIES[cat].indexOf(gfxSaved[cat]) >= 0 ? gfxSaved[cat] : 'preset';
    });
    const pct = Math.round(q.userScale * 100);
    gfxInputs.render_scale.value = String(pct);
    document.getElementById('gfx-scale-value').textContent = pct + '%';
    gfxInputs.adaptive.checked = q.adaptive;
    gfxInputs.show_fps.checked = q.showFps;
    const px = [Math.round(size[0] * pixelRatio) || canvas.width, Math.round(size[1] * pixelRatio) || canvas.height];
    const summary = gfxApi.describe(q, px, function (k) { return tr('sum_' + k); });
    if (summaryEl) summaryEl.textContent = (gpu || tr('gpuUnknown')) + ' · ' + summary;
    if (postNoteEl) postNoteEl.hidden = !postFailed;
  }

  let panelReturnFocus = null;
  function panelOpen() { return !!panel && !panel.hidden; }
  function openPanel() {
    if (!panel) return;
    const sfx = window.__hf_sfx;
    if (sfx) { sfx.unlock(); sfx.event('ui-click'); }
    panelReturnFocus = document.activeElement;
    refreshPanel();
    panel.hidden = false;
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'true');
    const first = gfxInputs.preset || document.getElementById('settings-close');
    if (first) first.focus();
  }
  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (settingsBtn) settingsBtn.setAttribute('aria-expanded', 'false');
    const back = panelReturnFocus && panelReturnFocus.focus ? panelReturnFocus : settingsBtn;
    if (back) back.focus();
  }
  function focusables() {
    return Array.prototype.filter.call(
      panel.querySelectorAll('button, select, input'),
      function (el) { return !el.disabled && el.offsetParent !== null; }
    );
  }
  // While the dialog is open it owns the keyboard: Escape closes it, Tab
  // cycles inside it, and arrow keys drive its controls instead of the void.
  function panelKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    }
  }
  if (settingsBtn) {
    settingsBtn.setAttribute('aria-expanded', 'false');
    settingsBtn.addEventListener('click', openPanel);
  }
  const closeBtn = document.getElementById('settings-close');
  if (closeBtn) closeBtn.addEventListener('click', closePanel);
  if (panel) panel.addEventListener('click', function (e) { if (e.target === panel) closePanel(); });

  // --- StarHermit account: sign-in / invite in the Settings dialog ----------
  const accountSection = document.getElementById('account-section');
  const signInBtn = document.getElementById('signin-btn');
  const inviteBtn = document.getElementById('invite-btn');
  const toastEl = document.getElementById('sh-toast');
  let toastTimer = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.hidden = true; }, 3500);
  }
  function refreshAccount() {
    if (!platform || !accountSection) return;
    const canIn = platform.canSignIn();
    const isIn = !!platform.launch();
    signInBtn.hidden = !canIn;
    inviteBtn.hidden = !isIn;
    accountSection.hidden = !canIn && !isIn;
  }
  if (platform && signInBtn && inviteBtn) {
    signInBtn.addEventListener('click', function () { platform.signIn(); });
    inviteBtn.addEventListener('click', function () {
      const link = platform.inviteLink();
      if (!link) return;
      const done = function (ok) { toast(ok ? tr('sh.copied') : tr('sh.copyFailed').replace('{link}', link)); };
      try { navigator.clipboard.writeText(link).then(function () { done(true); }, function () { done(false); }); } catch (_) { done(false); }
    });
    platform.onAuth(function (isIn) {
      refreshAccount();
      if (!isIn) toast(tr('sh.signedOut'));
    });
    refreshAccount();
    // Settings KV: the platform preference wins over the local one when signed in.
    platform.getSettings().then(function (remote) {
      if (!remote || !remote.gfx || typeof remote.gfx !== 'object') return;
      gfxSaved = remote.gfx;
      storeGfx(gfxSaved, true);
      applyGraphics();
      if (typeof refreshPanel === 'function') refreshPanel();
    });
  }

  buildPanel();
  applyGraphics();
  refreshPanel();
  if (reducedMotionMq && reducedMotionMq.addEventListener) {
    reducedMotionMq.addEventListener('change', function () { highlightNext(); });
  }

  // Two distinct refusals: leaving the board ('invalid') and reaching for a
  // morsel that is not the next one in the order ('wrong-order').
  const STEP_DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  function refusalKind(prev, dir) {
    const d = STEP_DIRS[dir];
    if (!d) return 'invalid';
    const x = prev.voidPos[0] + d[0];
    const y = prev.voidPos[1] + d[1];
    if (x < 0 || x > 3 || y < 0 || y > 3) return 'invalid';
    return 'wrong-order';
  }

  function act(dir) {
    const sfx = window.__hf_sfx;
    if (sfx) sfx.unlock();
    const prev = state;
    const next = rules.applyAction(state, dir);
    if (!next) return;
    state = next;
    syncScene();
    updateHUD();
    if (next.won && !prev.won) onWon(next);
    else if (!next.won) saveProgress(next);
    if (sfx) {
      if (next.won && !prev.won) sfx.event('win');
      else if (next.score > prev.score) sfx.event('eat');
      else if (next.invalidActions > prev.invalidActions) sfx.event(refusalKind(prev, dir));
      else sfx.event('void-move');
    }
  }

  function restart() {
    const sfx = window.__hf_sfx;
    if (sfx) { sfx.unlock(); sfx.event('restart'); }
    state = freshState();
    records.inProgress = null;
    persistRecords();
    syncScene();
    updateHUD();
  }

  // Keyboard bindings by KeyboardEvent.code; defaults mirror the control.*
  // lines in starhermit.txt, and StarHermit.loadBindings applies the player's
  // platform overrides.
  const DEFAULT_BINDINGS = {
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], restart: ['KeyR'],
  };
  let bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
  function actionFor(code) {
    for (const a in bindings) if (bindings[a].indexOf(code) >= 0) return a;
    return null;
  }
  // The how-to line names the default keys in prose; when the player has
  // rebound any, append the effective keys (glyphs, so no locale changes).
  function showBindings() {
    const howto = document.querySelector('.howto');
    if (!howto || JSON.stringify(bindings) === JSON.stringify(DEFAULT_BINDINGS)) return;
    const name = function (c) { return { ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓' }[c] || c.replace(/^Key/, '').replace(/^Digit/, ''); };
    const keys = function (a) { return bindings[a].map(name).join('/'); };
    howto.textContent = tr('howto') + ' (← ' + keys('left') + ' · → ' + keys('right') + ' · ↑ ' + keys('up') +
      ' · ↓ ' + keys('down') + ' · ↻ ' + keys('restart') + ')';
  }
  if (platform) platform.loadBindings(DEFAULT_BINDINGS).then(function (b) { bindings = b; showBindings(); });

  window.addEventListener('keydown', function (e) {
    if (panelOpen()) { panelKey(e); return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const action = actionFor(e.code);
    if (action === 'restart') {
      e.preventDefault();
      restart();
      return;
    }
    const dir = action;
    if (dir) {
      e.preventDefault();
      act(dir);
    }
  });

  document.querySelectorAll('button[data-dir]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        const sfx = window.__hf_sfx;
        if (sfx) { sfx.unlock(); sfx.event('ui-click'); }
        act(btn.getAttribute('data-dir'));
    });
  });

  const restartBtn = document.getElementById('restart');
  if (restartBtn) restartBtn.addEventListener('click', restart);

  // Size the canvas to the space left for it (see #game-wrap in index.html),
  // keeping its aspect near square so the board reads well, then refit the
  // camera so the entire playfield is inside the canvas.
  const wrap = document.getElementById('game-wrap') || canvas.parentElement;
  const MAX_ASPECT = 1.6;   // width / height
  const MIN_ASPECT = 1.0;
  function resize() {
    const availW = Math.max(1, wrap.clientWidth);
    const availH = Math.max(1, wrap.clientHeight);
    let w = availW;
    let h = availH;
    if (w / h > MAX_ASPECT) w = h * MAX_ASPECT;
    if (w / h < MIN_ASPECT) h = w / MIN_ASPECT;
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    fitCamera();
  }
  window.addEventListener('resize', resize);
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(function () { resize(); }).observe(wrap);
  }

  // Test hook: how far the playfield extends in NDC (|x|,|y| <= 1 is on-canvas).
  window.__hf_debug = {
    frameBounds: function () {
      const b = projectedBounds();
      tmpV.copy(voidMesh.position).project(camera);
      return {
        board: b,
        voidNdc: { x: tmpV.x, y: tmpV.y },
        canvas: { w: canvas.clientWidth, h: canvas.clientHeight },
      };
    },
  };

  syncScene();
  updateHUD();
  resize();

  function loop() {
    renderFrame();
    requestAnimationFrame(loop);
  }
  loop();
})();
