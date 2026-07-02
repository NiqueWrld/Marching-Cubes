// Uploads public/world/ to a Cloudflare R2 bucket via wrangler.
//   pnpm upload:world
// Requires:
//   - `npx wrangler login` once
//   - env var WORLD_R2_BUCKET (defaults to "zulu-wars-world")
import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUCKET = process.env.WORLD_R2_BUCKET || 'zulu-wars-world';
const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'world');

function walk(dir) {
    const out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const s = statSync(p);
        if (s.isDirectory()) out.push(...walk(p));
        else out.push(p);
    }
    return out;
}

const files = walk(ROOT);
console.log(`Uploading ${files.length} files to r2://${BUCKET}/ ...`);

let ok = 0, fail = 0;
for (const file of files) {
    const key = relative(ROOT, file).replace(/\\/g, '/');
    const ct  = key.endsWith('.json') ? 'application/json'
              : key.endsWith('.obj')  ? 'text/plain'
              : 'application/octet-stream';
    // Tiles are content-addressable enough to cache forever; manifest must
    // refresh quickly so re-bakes propagate.
    const cc  = key === 'manifest.json'
              ? 'public, max-age=300, must-revalidate'
              : 'public, max-age=31536000, immutable';
    const cmd = `npx wrangler r2 object put "${BUCKET}/${key}" --file "${file}" --content-type "${ct}" --cache-control "${cc}" --remote`;
    const res = spawnSync(cmd, { stdio: 'inherit', shell: true });
    if (res.status === 0) ok++; else { fail++; console.error(`FAILED: ${key}`); }
}
console.log(`Done. ok=${ok} fail=${fail}`);
process.exit(fail ? 1 : 0);
