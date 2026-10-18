// Graphics benchmark hook for tools/gfx-bench.mjs (dev-only): picks a preset through the real
// Settings panel (⚙ → Quality → ✕) and plays moves with the on-screen buttons so particles and animation
// run. The move cycle (→ refused at the edge, ↓, ← refused as out of order, ↑) never eats, so all twelve
// morsels and their plates, the void, the next-morsel light and the motes stay on screen: the board's
// busiest frame.
export const presets = ['low', 'balanced', 'high', 'ultra'];
export const levels = { low: 0, balanced: 4, high: 10, ultra: 17 };

export async function setPreset(page, preset) {
  await page.waitForSelector('canvas#game');
  await page.click('#settings-btn');
  await page.selectOption('#gfx-preset', preset);
  await page.waitForFunction((p) => document.body.getAttribute('data-gfx-preset') === p, preset);
  await page.click('#settings-close');
}

export async function start(page) {
  // Keep the board busy: a move every 400 ms through the visible direction buttons.
  const dirs = ['right', 'down', 'left', 'up'];
  let i = 0;
  const timer = setInterval(() => { page.click(`button[data-dir="${dirs[i++ % 4]}"]`).catch(() => {}); }, 400);
  page.once('close', () => clearInterval(timer));
  await page.waitForTimeout(500);
}
