/**
 * Regenerate the PWA / home-screen PNG icons from the SVG brand mark.
 *
 * Source of truth is `public/favicon.svg` (the 4x4 mint checker + coral accent
 * on a warm-black tile). We rasterize it at each target size with sharp so the
 * favicon, Android/PWA icons, and the Apple touch icon all stay in sync — edit
 * the SVG, then run `node scripts/gen-icons.mjs`.
 *
 * The mark sits well inside the tile (~19% margin), so the same artwork doubles
 * as the maskable icon without extra padding.
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'public/favicon.svg'), 'utf8');

// Strip any intrinsic width/height so we can render crisply at each target size.
const base = svg.replace(/\s(?:width|height)="[^"]*"/g, '');

const targets = [
  ['public/icons/icon-192.png', 192],
  ['public/icons/icon-512.png', 512],
  ['public/icons/icon-512-maskable.png', 512],
  ['public/icons/apple-touch-icon.png', 180],
];

for (const [rel, size] of targets) {
  const sized = base.replace('<svg', `<svg width="${size}" height="${size}"`);
  await sharp(Buffer.from(sized)).png().toFile(join(root, rel));
  console.log(`wrote ${rel} (${size}x${size})`);
}
