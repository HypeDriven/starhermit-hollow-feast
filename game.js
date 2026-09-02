'use strict';

(function () {
  const rules = window.__hf_rules;
  if (!rules || typeof rules.initialState !== 'function') throw new Error('missing rules');

  const canvas = document.getElementById('game');
  const scoreEl = document.getElementById('score');
  const eatenEl = document.getElementById('eaten');

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = 'srgb';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x141a26);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 13, 12);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(-4, 10, 8);
  scene.add(dir);

  // Board: 10x10 segments; cell size 2.4; origin at center of board.
  const CELL = 2.4;
  const boardGeo = new THREE.PlaneGeometry(CELL * 10, CELL * 10);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3a5f8a });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.rotation.x = -Math.PI / 2;
  scene.add(boardMesh);

  // The logical board is 4x4. Map grid coords to world positions on the plane.
  const STEP = 5;
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

  const voidGeo = new THREE.SphereGeometry(1.7, 32, 32);
  const voidMat = new THREE.MeshStandardMaterial({ color: 0xf6e7b2, emissive: new THREE.Color(0xcaa64d) });
  const voidMesh = new THREE.Mesh(voidGeo, voidMat);
  voidMesh.position.y = 1.6;
  scene.add(voidMesh);

  // Game state: 4x4 grid, 12 numbered items in a solvable snake order,
  // column x=3 left empty, void starts at (3,0) next to item 1.
  //   y=0:  3  2  1  .
  //   y=1:  4  5  6  .
  //   y=2:  9  8  7  .
  //   y=3: 10 11 12  .
  const ORDER = [3, 2, 1, 0, 4, 5, 6, 0, 9, 8, 7, 0, 10, 11, 12, 0];
  let state;
  try {
    state = window.__hf_state || null;
    if (!state || !Array.isArray(state.cells) || state.cells.length !== 16) throw new Error('bad state');
    if (typeof rules.applyAction !== 'function') throw new Error('no rules');
  } catch (_) {
    const cells = [];
    for (let i = 0; i < 16; i++) {
      const order = ORDER[i];
      cells.push(order ? { kind: 'item', order: order } : { kind: null, order: null });
    }
    state = rules.initialState(null, cells, [3, 0]);
    if (!state || !Array.isArray(state.cells)) throw new Error('bad initial');
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
  }

  function updateHUD() {
    scoreEl.textContent = String(state.score);
    const eaten = state.cells.filter(function (c) { return !c.kind && c.order != null; }).length;
    eatenEl.textContent = eaten + ' / 12';
  }

  function renderFrame() {
    renderer.render(scene, camera);
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
      else if (next.invalidActions > prev.invalidActions) sfx.event('invalid');
      else sfx.event('void-move');
    }
  }

  window.addEventListener('keydown', function (e) {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a') act('left');
    else if (k === 'ArrowRight' || k === 'd') act('right');
    else if (k === 'ArrowUp' || k === 'w') act('up');
    else if (k === 'ArrowDown' || k === 's') act('down');
  });

  document.querySelectorAll('button[data-dir]').forEach(function (btn) {
    btn.addEventListener('click', function () {
        const sfx = window.__hf_sfx;
        if (sfx) { sfx.unlock(); sfx.event('ui-click'); }
        act(btn.getAttribute('data-dir'));
    });
  });

  function resize() {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  syncScene();
  updateHUD();
  resize();

  function loop() {
    renderFrame();
    requestAnimationFrame(loop);
  }
  loop();
})();
