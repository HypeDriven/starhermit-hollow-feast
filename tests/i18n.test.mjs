/**
 * Hollow Feast — string tables (js/strings.js): every key in every one of
 * the nine locales, and every key the engine client asks for (tr("…") in
 * native/*.ts) present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = createRequire(import.meta.url)('../js/strings.js');
const LOCALES = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT'];

test('nine locales with the same keys, none empty', () => {
  assert.deepEqual(S.LOCALES, LOCALES);
  const keys = Object.keys(S.STRINGS['en-US']).sort();
  for (const l of LOCALES) {
    assert.deepEqual(Object.keys(S.STRINGS[l]).sort(), keys, l);
    for (const k of keys) assert.ok(String(S.STRINGS[l][k]).trim(), `${l} ${k}`);
  }
});

test('non-English locales are translated', () => {
  for (const l of ['es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT']) {
    for (const k of ['howto', 'win', 'restart', 'moreOptions', 'optionsNote', 'sh.signIn']) {
      assert.notEqual(S.STRINGS[l][k], S.STRINGS['en-US'][k], `${l} ${k}`);
    }
  }
});

test('placeholders survive translation', () => {
  for (const l of LOCALES) {
    assert.match(S.STRINGS[l]['sh.lbRank'], /\{rank\}/);
    assert.match(S.STRINGS[l]['sh.copyFailed'], /\{link\}/);
  }
  assert.equal(S.t('it-IT', 'sh.lbRank', { rank: 4 }), 'Posizione in classifica: #4');
});

test('every key the client uses exists', () => {
  const used = new Set();
  for (const f of readdirSync(join(root, 'native')).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(join(root, 'native', f), 'utf8');
    for (const m of src.matchAll(/\btr\("([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/"(sync[A-Z][a-z]+|sh\.lb[A-Za-z]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size > 15);
  for (const k of used) assert.ok(k in S.STRINGS['en-US'], k);
});
