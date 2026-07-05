#!/usr/bin/env node
/**
 * Validates every game in lib/famous-games.ts: each space-separated SAN move
 * must be legal from the start position, or the Coordinates "play famous games"
 * replay would break. Run: node scripts/validate-games.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'lib/famous-games.ts'), 'utf8');

// Pull out each { id: '…', … san: '…' } record with a light-touch parse.
const idRe = /id:\s*'([^']+)'/g;
const sanRe = /san:\s*'([^']+)'/g;
const ids = [...src.matchAll(idRe)].map((m) => m[1]);
const sans = [...src.matchAll(sanRe)].map((m) => m[1]);

if (ids.length !== sans.length) {
  console.error(`Mismatch: ${ids.length} ids but ${sans.length} san strings`);
  process.exit(1);
}

let failures = 0;
const seen = new Set();
for (let i = 0; i < ids.length; i++) {
  const id = ids[i];
  if (seen.has(id)) { console.error(`✗ duplicate id: ${id}`); failures++; }
  seen.add(id);
  const moves = sans[i].trim().split(/\s+/);
  const chess = new Chess();
  let ok = true;
  for (let p = 0; p < moves.length; p++) {
    try {
      const mv = chess.move(moves[p]);
      if (!mv) throw new Error('null');
    } catch {
      console.error(`✗ ${id}: illegal move #${p + 1} "${moves[p]}" (after ${p} plies)`);
      failures++;
      ok = false;
      break;
    }
  }
  if (ok) console.log(`✓ ${id.padEnd(28)} ${moves.length} plies`);
}

console.log(`\n${ids.length} games, ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
