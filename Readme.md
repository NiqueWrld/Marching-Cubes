# Zulu Wars

Multiplayer voxel world game (Three.js + React + Express/Socket.io + Firebase).

## World hosting (Cloudflare R2)

The terrain is pre-baked into OBJ tiles and shipped as a **single `world.zip`**
archive (manifest + all tiles, ~23 MB compressed from ~163 MB raw).

- **Production** downloads it from a public Cloudflare R2 bucket
  (`zulu-wars-world`): set `VITE_WORLD_BASE_URL` in the Vercel env, e.g.
  `https://pub-e53d36343159496aa402a1f5b8e37416.r2.dev/` (must end with `/`).
- **Local dev** falls back to `/world/world.zip`, served by Vite from
  `public/world/` (gitignored — bake it yourself, see below).

The client ([src/lib/chunks.ts](src/lib/chunks.ts)) streams the zip with a
progress bar, unzips it in memory (`fflate`), and adds tiles to the scene
nearest-first. Browsers cache the zip via HTTP/ETag; re-bakes are picked up
automatically because the object is uploaded with `must-revalidate`.

### Bake → zip → upload workflow

```bash
# 1. Bake the world into public/world/ (requires .NET 8)
dotnet run --project scripts/BakeWorld -c Release

# 2. Bundle into public/world/world.zip (also done automatically by upload)
pnpm zip:world

# 3. Upload world.zip to R2 (requires `npx wrangler login` once)
pnpm upload:world
```

The R2 bucket has public dev-URL access enabled and CORS allowing `GET`/`HEAD`
from any origin (rules in [scripts/r2-cors.json](scripts/r2-cors.json)).
