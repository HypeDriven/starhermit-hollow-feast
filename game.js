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
  camera.position.set(0, -9.5, 13);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const dir = new THREE.DirectionalLight(0xffffff, 1.6);
  dir.position.set(-4, -8, 9);
  scene.add(dir);

  // Board: 10x10 segments; cell size 2.4; origin at center of board.
  const CELL = 2.4;
  const boardGeo = new THREE.PlaneGeometry(CELL * 10, CELL * 10);
  const boardMat = new THREE.MeshStandardMaterial({ color: 0x3a5f8a });
  const boardMesh = new THREE.Mesh(boardGeo, boardMat);
  boardMesh.rotation.x = -Math.PI / 2;
  scene.add(boardMesh);

  // Items (12) and void.
  const itemGeo = new THREE.IcosahedronGeometry(0.95);
  const itemMat = new THREE.MeshStandardMaterial({ color: 0xff8c3a, flatShading: true });
  const items = [];
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(itemGeo, itemMat);
    scene.add(m);
    items.push(m);
  }

  const voidGeo = new THREE.SphereGeometry(1.7, 32, 32);
  const voidMat = new THREE.MeshStandardMaterial({ color: 0xf6e7b2, emissive: new THREE.Color(0xcaa64d) });
  const voidMesh = new THREE.Mesh(voidGeo, voidMat);
  scene.add(voidMesh);

  // Game state.
  let state;
  try {
    state = window.__hf_state || null;
    if (!state || !Array.isArray(state.cells)) throw new Error('bad state');
    if (typeof rules.applyAction !== 'function') throw new Error('no rules');
  } catch (_) {
    const cells = [];
    for (let i = 0; i < 12; i++) cells.push({ kind: true, order: i + 1 });
    state = rules.initialState(null, cells, [4, 5]);
    if (!state || !Array.isArray(state.cells)) throw new Error('bad initial');
  }

  function cellIndex(x, y) { return (y - 2) * 10 + x; }

  function cellXY(j) {
    const y = Math.floor(j / 10);
    let x;
    if (y === 2) x = j % 10; else x = (j % 10) - 4 + 4; // placeholder
    return [x, y];
}

function placeItems() {
    for (let i = 0; i < items.length; i++) {
      const o = i + 1;
      let found = false;
      for (let j = 0; j < state.cells.length; j++) if (state.cells[j].order === o) { /* x,y from cellIndex */ }
    }
}

function updateHUD() {
    scoreEl.textContent = String(state.score);
    eatenEl.textContent = '12 / 12';
}

function renderFrame() {
    renderer.render(scene, camera);
}

function act(dir) {
    const sfx = window.__hf_sfx;
    if (sfx) sfx.unlock();
    const prev = state;
    const next = rules.applyAction(state, dir);
    if (!sfx || !next) return;
    if (next.won && !prev.won) sfx.event('win');
    else if (next.score > prev.score) sfx.event('eat');
    else if (next.invalidActions > prev.invalidActions) sfx.event('invalid');
    else sfx.event('void-move');
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

function loop() {
    renderFrame();
    requestAnimationFrame(loop);
}
loop();
})();
