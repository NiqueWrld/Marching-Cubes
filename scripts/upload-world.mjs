// Zips public/world/ and uploads the single world.zip to a Cloudflare R2 bucket.
//   pnpm upload:world
// Requires:
//   - `npx wrangler login` once
//   - env var WORLD_R2_BUCKET (defaults to "zulu-wars-world")
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const BUCKET = process.env.WORLD_R2_BUCKET || 'zulu-wars-world';
const HERE   = dirname(fileURLToPath(import.meta.url));
const ZIP    = resolve(HERE, '..', 'public', 'world', 'world.zip');

// Build the archive first.
const zipRes = spawnSync(`node "${join(HERE, 'zip-world.mjs')}"`, { stdio: 'inherit', shell: true });
if (zipRes.status !== 0) process.exit(zipRes.status ?? 1);

// Short TTL + revalidation: browsers cache the zip but pick up re-bakes via ETag.
const cmd = `npx wrangler r2 object put "${BUCKET}/world.zip" --file "${ZIP}" --content-type "application/zip" --cache-control "public, max-age=0, must-revalidate" --remote`;
console.log(`Uploading world.zip to r2://${BUCKET}/ ...`);
const res = spawnSync(cmd, { stdio: 'inherit', shell: true });
process.exit(res.status ?? 1);
