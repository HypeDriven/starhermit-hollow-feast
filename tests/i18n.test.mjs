/**
 * Hollow Feast — string tables (assets/strings.json): every key in every one of
 * the nine locales, and every key the engine client asks for (tr("…") in
 * native/*.ts) present.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = { STRINGS: JSON.parse(readFileSync(join(root, 'assets/strings.json'), 'utf8')) };
const LOCALES = ['en-US', 'en-GB', 'es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT', 'fr-BE', 'de-BE', 'en-SG', 'en-HK', 'en-BQ', 'es-CO', 'de-IT', 'fr-IT', 'es-CL', 'es-AR', 'es-EC', 'ja-JP', 'nl-BE', 'zh-SG', 'ms-SG', 'ta-SG', 'zh-HK', 'yue-HK', 'nl-NL', 'fi-FI', 'sv-FI', 'et-EE', 'id-ID', 'vi-VN', 'de-BR', 'da-DE', 'lb-BE', 'co-FR', 'eu-FR', 'ca-FR', 'oc-FR', 'sl-IT', 'fur-IT', 'ca-IT', 'oc-IT', 'ca-ES', 'eu-ES', 'gl-ES', 'su-ID', 'bew-ID', 'km-VN', 'ru-FI', 'ru-EE'];

test('nine locales with the same keys, none empty', () => {
  assert.deepEqual(Object.keys(S.STRINGS).sort(), [...LOCALES].sort());
  const keys = Object.keys(S.STRINGS['en-US']).sort();
  for (const l of LOCALES) {
    assert.deepEqual(Object.keys(S.STRINGS[l]).sort(), keys, l);
    for (const k of keys) assert.ok(String(S.STRINGS[l][k]).trim(), `${l} ${k}`);
  }
});

test('non-English locales are translated', () => {
  for (const l of ['es-419', 'es-ES', 'de-DE', 'fr-FR', 'fr-CA', 'pt-BR', 'it-IT']) {
    for (const k of ['howto', 'win', 'restart', 'moreOptions', 'optionsNote']) {
      assert.notEqual(S.STRINGS[l][k], S.STRINGS['en-US'][k], `${l} ${k}`);
    }
  }
});

test('every key the client uses exists', () => {
  const used = new Set();
  for (const f of readdirSync(join(root, 'native')).filter((n) => n.endsWith('.ts'))) {
    const src = readFileSync(join(root, 'native', f), 'utf8');
    for (const m of src.matchAll(/\btr\("([^"]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/"(sync[A-Z][a-z]+)"/g)) used.add(m[1]);
  }
  assert.ok(used.size > 15);
  for (const k of used) if (!k.startsWith('starhermit.')) assert.ok(k in S.STRINGS['en-US'], k);
});
