import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Rasterize the existing vector brand mark with Next.js's image dependency.
const webRequire = createRequire(new URL('../apps/web/package.json', import.meta.url));
const nextRequire = createRequire(webRequire.resolve('next/package.json'));
const sharp = nextRequire('sharp');
const directory = new URL('../apps/web/app/', import.meta.url);
const source = await readFile(new URL('icon.svg', directory));
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(source).resize(size, size).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((image, index) => {
  const position = 6 + index * 16;
  header[position] = sizes[index];
  header[position + 1] = sizes[index];
  header.writeUInt16LE(1, position + 4);
  header.writeUInt16LE(32, position + 6);
  header.writeUInt32LE(image.length, position + 8);
  header.writeUInt32LE(offset, position + 12);
  offset += image.length;
});
await writeFile(new URL('favicon.ico', directory), Buffer.concat([header, ...images]));
await sharp(source).resize(180, 180).flatten({ background: '#203d36' }).png().toFile(fileURLToPath(new URL('apple-icon.png', directory)));
console.log('Generated 16/32/48px favicon.ico and 180px Apple touch icon from icon.svg.');
