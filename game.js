'use strict';

(function () {
  const rules = window.__hf_rules;
  if (!rules || typeof rules.initialState !== 'function') throw new Error('missing rules');

  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const eatenEl = document.getElementById('eaten');
  const winEl = document.getElementById('win-banner');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  } catch (err) {
    const msg = document.createElement('p');
    msg.setAttribute('role', 'alert');
    msg.textContent = 'Hollow Feast needs WebGL to render, and it is unavailable in this browser. Try another browser or device.';
    canvas.replaceWith(msg);
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = 'srgb';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a26);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  // Viewing direction (from the board centre towards the camera); the
  // distance and look-at target are solved in fitCamera() so the whole
  // playfield stays inside the canvas at any aspect ratio.
  const CAM_DIR = new THREE.Vector3(0, 16.5, 15).normalize();

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(-4, 10, 8);
  scene.add(dir);

  // The logical board is 4x4 with grid pitch STEP; the plane is sized to
  // that grid plus a rim so every item and the void sit on it.
  const STEP = 4.2;
  const BOARD = STEP * 4 + 1.6;
  const boardGeo = new THREE.PlaneGeometry(BOARD, BOARD);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3a5f8a });
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
  scene.add(boardMesh);

  // Map grid coords to world positions on the plane.
  function worldX(x) { return (x - 1.5) * STEP; }
  function worldZ(y) { return (y - 1.5) * STEP; }

  // Items (12) and void.
  const itemGeo = new THREE.IcosahedronGeometry(0.95);
  const itemMat = new THREE.MeshStandardMaterial({ color: 0xff8c3a, flatShading: true });
  const items = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(itemGeo, itemMat.clone());
    m.position.y = 1.0;
    scene.add(m);
    items.push(m);
  }

  const VOID_R = 1.7;
  const VOID_Y = 1.6;
  const voidGeo = new THREE.SphereGeometry(VOID_R, 32, 32);
  const voidMat = new THREE.MeshStandardMaterial({ color: 0xf6e7b2, emissive: new THREE.Color(0xcaa64d) });
  const voidMesh = new THREE.Mesh(voidGeo, voidMat);
  voidMesh.position.y = VOID_Y;
  scene.add(voidMesh);

  // Everything that must stay on screen: the board's corners and the void's
  // bounding box over every cell it can occupy (items sit inside that box).
  const FIT_POINTS = [];
  const half = BOARD / 2;
  [[-half, -half], [half, -half], [-half, half], [half, half]].forEach(function (c) {
    FIT_POINTS.push(new THREE.Vector3(c[0], 0, c[1]));
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

  // The eat order is fixed but invisible on the meshes, so the next morsel is
  // marked by an emissive lift: it is the only warm-glowing item on the board.
  const NEXT_EMISSIVE = 0xff8c3a;
  function highlightNext() {
    const next = state.cells.filter(function (c) { return !c.kind && c.order != null; }).length + 1;
    for (let i = 0; i < items.length; i++) {
      const isNext = !state.won && (i + 1) === next;
      items[i].material.emissive.setHex(isNext ? NEXT_EMISSIVE : 0x000000);
      items[i].material.emissiveIntensity = isNext ? 0.85 : 0;
      items[i].scale.setScalar(isNext ? 1.18 : 1);
    }
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
    }
    voidMesh.position.x = worldX(state.voidPos[0]);
    voidMesh.position.z = worldZ(state.voidPos[1]);
    highlightNext();
  }

  function updateHUD() {
    scoreEl.textContent = String(state.score);
    const eaten = state.cells.filter(function (c) { return !c.kind && c.order != null; }).length;
    eatenEl.textContent = eaten + ' / 12';
    if (winEl) winEl.hidden = !state.won;
  }

  function renderFrame() {
    renderer.render(scene, camera);
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
    syncScene();
    updateHUD();
  }

  const KEY_DIRS = {
    ArrowLeft: 'left', a: 'left',
    ArrowRight: 'right', d: 'right',
    ArrowUp: 'up', w: 'up',
    ArrowDown: 'down', s: 'down',
  };
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      restart();
      return;
    }
    const dir = KEY_DIRS[e.key];
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
