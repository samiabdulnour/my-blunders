/**
 * Sync the native app icon from resources/icon.png (the canonical artwork).
 *
 * Apple requires an opaque 1024×1024 PNG with no alpha channel, so we resize
 * to 1024 and flatten away any transparency before encoding. The iOS asset
 * catalog uses a single-size AppIcon (Xcode derives the smaller sizes at
 * build), so one 1024 PNG is all it needs.
 *
 * Edit/replace resources/icon.png, then run: node scripts/gen-app-icon.mjs
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'resources/icon.png');
const dest = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';

await sharp(source)
  .resize(1024, 1024)
  .flatten({ background: '#8CC79E' }) // strip alpha — App Store rejects transparency
  .png()
  .toFile(join(root, dest));

console.log(`wrote ${dest} (1024x1024, opaque)`);
