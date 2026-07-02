// Bundles public/world/ (manifest + tiles) into public/world/world.zip.
//   pnpm zip:world
// The game downloads this single archive instead of individual tiles.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'world');
const OUT  = join(ROOT, 'world.zip');

const files = {};
for (const name of readdirSync(ROOT)) {
    if (name === 'world.zip') continue;               // don't zip ourselves
    const p = join(ROOT, name);
    if (statSync(p).isDirectory()) continue;          // skip preview/ etc.
    files[name] = readFileSync(p);
}

if (!files['manifest.json']) {
    console.error('public/world/manifest.json not found — bake the world first.');
    process.exit(1);
}

console.log(`Zipping ${Object.keys(files).length} files…`);
const zipped = zipSync(files, { level: 6 });
writeFileSync(OUT, zipped);
console.log(`Wrote ${OUT} (${(zipped.length / 1048576).toFixed(1)} MB)`);
