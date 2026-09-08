/**
 * Hollow Feast — end-to-end playthrough test (dev only, not shipped).
 *
 * Drives the real visible UI in headless Chrome: load → title/HUD visible →
 * an invalid (out-of-bounds) move → full solve of the 4x4 board by clicking
 * the on-screen direction buttons (with keyboard arrows mixed in) until the
 * win state ("Eaten 12 / 12", score 450), verifying the HUD after every move,
 * then restart via the on-screen button and the R key. A Node-level rules
 * prelude checks that the terminal win state survives post-win moves.
 *
 * This game has no menu, pause, or settings screens — play starts immediately
 * on load, so those flows are not applicable here. Everything is local; no
 * StarHermit backend is required.
 *
 * Every move also checks framing: the whole board and the void project inside
 * the canvas, and the canvas, HUD and controls all sit inside the viewport.
 *
 * Runs four passes: desktop 1280x800, mobile 390x844 (touch), landscape phone
 * 844x390 (touch) and a short desktop window 1280x600.
 * Screenshots land in /tmp/hollow-feast-e2e-<stage>-<pass>.png.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { chromium } from 'playwright-core';

// --- Rules unit checks: terminal state must stay terminal ---
{
  const rules = createRequire(import.meta.url)('../rules.js');
  const ORDER = [3, 2, 1, 0, 4, 5, 6, 0, 9, 8, 7, 0, 10, 11, 12, 0];
  const cells = ORDER.map((o) => (o ? { kind: 'item', order: o } : { kind: null, order: null }));
  let s = rules.initialState(1, cells, [3, 0]);
  for (const d of ['left', 'left', 'left', 'down', 'right', 'right', 'down', 'left', 'left', 'down', 'right', 'right']) {
    s = rules.applyAction(s, d);
  }
  if (!s.won || s.score !== 450) throw new Error(`rules: solve should win with score 450, got won=${s.won} score=${s.score}`);
  const pos = s.voidPos.join(',');
  const after = rules.applyAction(rules.applyAction(s, 'up'), 'left');
  if (!after.won) throw new Error('rules: post-win moves must not clear the terminal won flag');
  if (after.voidPos.join(',') !== pos) throw new Error('rules: post-win moves must not move the void');
  if (after.invalidActions !== s.invalidActions + 2) throw new Error('rules: post-win moves should count as invalid actions');
  console.log('ok - [rules] terminal state survives post-win moves');
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.glb': 'model/gltf-binary',
  '.woff2': 'font/woff2', '.ts': 'application/javascript', '.md': 'text/markdown',
  '.txt': 'text/plain',
};

const browserNoise = /GL Driver Message|GPU stall due to ReadPixels|Automatic fallback to software WebGL|EnableWebGLDeveloperExtensions/i;

const server = http.createServer((req, res) => {
  const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const file = path.join(ROOT, decodeURIComponent(p));
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const BASE = `http://127.0.0.1:${server.address().port}`;

// Board layout (void starts at (3,0); items must be eaten in order 1..12):
//   y=0:  3  2  1  .
//   y=1:  4  5  6  .
//   y=2:  9  8  7  .
//   y=3: 10 11 12  .
// Each of these moves eats the next item in order.
const SOLUTION = ['left', 'left', 'left', 'down', 'right', 'right', 'down', 'left', 'left', 'down', 'right', 'right'];
// Score for the nth eaten item is 10 + (n-1)*5.
const expectedScore = (n) => 10 * n + (5 * n * (n - 1)) / 2;

const SHOT = (stage, pass) => `/tmp/hollow-feast-e2e-${stage}-${pass}.png`;

async function runPass(name, viewport, hasTouch, browser) {
  const context = await browser.newContext({ viewport, hasTouch });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !browserNoise.test(m.text())) errors.push(`console: ${m.text()}`);
  });

  const step = async (label, fn) => {
    await fn();
    console.log(`ok - [${name}] ${label}`);
  };
  const hud = async () => ({
    score: await page.textContent('#score'),
    eaten: await page.textContent('#eaten'),
  });
  const expectHUD = async (score, eaten) => {
    const h = await hud();
    if (h.score !== score || h.eaten !== eaten) {
      throw new Error(`HUD mismatch: expected score=${score} eaten=${eaten}, got score=${h.score} eaten=${h.eaten}`);
    }
    await expectNothingCutOff();
  };
  // Nothing may be cut off: every fit point of the playfield (board corners,
  // void at any cell) must project inside the canvas, and the canvas, HUD and
  // controls must lie inside the viewport.
  const expectNothingCutOff = async () => {
    const r = await page.evaluate(() => {
      const d = window.__hf_debug && window.__hf_debug.frameBounds();
      const vw = window.innerWidth, vh = window.innerHeight;
      const off = [];
      for (const sel of ['canvas#game', '#score', '#eaten', 'button[data-dir]', '#restart', 'h1']) {
        document.querySelectorAll(sel).forEach((el) => {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0 || b.left < -0.5 || b.top < -0.5 || b.right > vw + 0.5 || b.bottom > vh + 0.5) {
            off.push(`${sel} ${Math.round(b.left)},${Math.round(b.top)}-${Math.round(b.right)},${Math.round(b.bottom)} vs ${vw}x${vh}`);
          }
        });
      }
      return { d, off, scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, vw, vh };
    });
    if (!r.d) throw new Error('framing hook missing');
    const b = r.d.board;
    const lim = 0.995;
    if (b.minX < -lim || b.maxX > lim || b.minY < -lim || b.maxY > lim) {
      throw new Error(`playfield extends past the canvas: ${JSON.stringify(b)}`);
    }
    if (Math.abs(r.d.voidNdc.x) > lim || Math.abs(r.d.voidNdc.y) > lim) {
      throw new Error(`void is off-canvas: ${JSON.stringify(r.d.voidNdc)}`);
    }
    if (r.off.length) throw new Error(`elements cut off by the viewport:\n${r.off.join('\n')}`);
    if (r.scrollH > r.vh + 0.5 || r.scrollW > r.vw + 0.5) {
      throw new Error(`page overflows viewport: ${r.scrollW}x${r.scrollH} vs ${r.vw}x${r.vh}`);
    }
  };

  try {
    await step('load: title, canvas and HUD visible', async () => {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('h1', { timeout: 10000 });
      if (!(await page.locator('canvas#game').isVisible())) throw new Error('canvas not visible');
      for (const dir of ['left', 'up', 'down', 'right']) {
        if (!(await page.locator(`button[data-dir="${dir}"]`).isVisible())) throw new Error(`${dir} button not visible`);
      }
      await expectHUD('0', '0 / 12');
      await page.screenshot({ path: SHOT('load', name) });
    });

    await step('out-of-bounds move is rejected (HUD unchanged)', async () => {
      // void starts at (3,0); up would leave the board
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(100);
      await expectHUD('0', '0 / 12');
    });

    await step('solve the board via on-screen buttons + keyboard', async () => {
      for (let i = 0; i < SOLUTION.length; i++) {
        const dir = SOLUTION[i];
        if (i % 4 === 3) {
          // exercise the keyboard path a player would also use
          const key = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }[dir];
          await page.keyboard.press(key);
        } else {
          await page.click(`button[data-dir="${dir}"]`);
        }
        await expectHUD(String(expectedScore(i + 1)), `${i + 1} / 12`);
        if (i === 5) await page.screenshot({ path: SHOT('midplay', name) });
      }
      await page.screenshot({ path: SHOT('win', name) });
    });

    await step('post-win moves are inert', async () => {
      await page.click('button[data-dir="right"]');
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(100);
      await expectHUD('450', '12 / 12');
    });

    await step('restart resets the round', async () => {
      await page.click('#restart');
      await expectHUD('0', '0 / 12');
      // play is possible again after restart
      await page.click('button[data-dir="left"]');
      await expectHUD('10', '1 / 12');
      await page.keyboard.press('r');
      await expectHUD('0', '0 / 12');
    });

    await step('canvas is rendering (non-blank pixels)', async () => {
      // WebGL canvas has no preserveDrawingBuffer, so sample inside a rAF
      // callback that runs right after the game's own render for that frame.
      const nonBlank = await page.evaluate(() => new Promise((resolve) => {
        requestAnimationFrame(() => {
          const c = document.getElementById('game');
          const g = document.createElement('canvas');
          g.width = c.width; g.height = c.height;
          g.getContext('2d').drawImage(c, 0, 0);
          const d = g.getContext('2d').getImageData(0, 0, g.width, g.height).data;
          const distinct = new Set();
          for (let i = 0; i < d.length; i += 400) distinct.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
          resolve(distinct.size);
        });
      }));
      if (nonBlank < 2) throw new Error('canvas appears blank');
    });
  } finally {
    await context.close();
  }

  if (errors.length) throw new Error(`[${name}] page errors:\n${errors.join('\n')}`);
}

let browser;
try {
  browser = await chromium.launch({
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  await runPass('desktop', { width: 1280, height: 800 }, false, browser);
  await runPass('mobile', { width: 390, height: 844 }, true, browser);
  await runPass('landscape', { width: 844, height: 390 }, true, browser);
  await runPass('short-desktop', { width: 1280, height: 600 }, false, browser);
  console.log('\nE2E PASS — hollow-feast playable end-to-end on all viewports, nothing cut off, no page errors');
} finally {
  if (browser) await browser.close();
  server.close();
}
