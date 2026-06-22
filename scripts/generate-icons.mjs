import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const svg = path.join(root, 'icons', 'icon.svg');
const outDir = path.join(root, 'icons');

await mkdir(outDir, { recursive: true });

for (const size of [192, 512]) {
  const out = path.join(outDir, `icon-${size}.png`);
  await sharp(svg).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}
