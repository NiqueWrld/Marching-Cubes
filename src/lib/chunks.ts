import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { unzipSync, strFromU8 } from 'fflate';
import { CHUNK, RENDER } from './worldConstants.js';
import { buildTrees } from './trees.js';

// Install BVH overrides globally on BufferGeometry / Mesh.
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

export const worldColliders: THREE.Mesh[] = [];

// World tiles are hosted on Cloudflare R2 in production. Override at build/dev
// time with `VITE_WORLD_BASE_URL` (must end with `/`). Falls back to the local
// `/world/` directory for offline development.
// The whole world (manifest + tiles) ships as a single `world.zip` archive.
const RAW_WORLD_BASE = (import.meta.env.VITE_WORLD_BASE_URL as string | undefined) ?? '/world/';
const WORLD_DIR_URL  = RAW_WORLD_BASE.endsWith('/') ? RAW_WORLD_BASE : RAW_WORLD_BASE + '/';
const WORLD_ZIP_URL  = WORLD_DIR_URL + 'world.zip';

interface ManifestTile {
    file: string; tx: number; tz: number; bytes: number; tris: number;
    bbox: [number, number, number, number, number, number];
}
interface Manifest { seed: number; chunk: number; tile: number; tiles: ManifestTile[]; }

// Reveal shader — terrain fragments outside `uRadius` (xz distance from
// `uOrigin`) are discarded, so the world appears to flow outward from the
// player's spawn. Driven by `tickReveal()` each frame.
const revealUniforms = {
    uOrigin: { value: new THREE.Vector3(0, 0, 0) },
    uRadius: { value: 0 },
};
let revealTargetRadius = 0;
const REVEAL_SPEED = 80; // world units per second

export function startReveal(origin: THREE.Vector3, targetRadius = 600): void {
    revealUniforms.uOrigin.value.copy(origin);
    revealUniforms.uRadius.value = 0;
    revealTargetRadius = targetRadius;
}
export function tickReveal(dt: number): void {
    if (revealUniforms.uRadius.value < revealTargetRadius) {
        revealUniforms.uRadius.value = Math.min(
            revealTargetRadius,
            revealUniforms.uRadius.value + REVEAL_SPEED * dt,
        );
    }
}

const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
terrainMat.onBeforeCompile = (shader) => {
    shader.uniforms.uOrigin = revealUniforms.uOrigin;
    shader.uniforms.uRadius = revealUniforms.uRadius;
    shader.vertexShader = 'varying vec3 vRevealWorldPos;\n' + shader.vertexShader.replace(
        '#include <project_vertex>',
        '#include <project_vertex>\n  vRevealWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    );
    shader.fragmentShader =
        'uniform vec3 uOrigin;\nuniform float uRadius;\nvarying vec3 vRevealWorldPos;\n' +
        shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            'if (distance(vRevealWorldPos.xz, uOrigin.xz) > uRadius) discard;\n  #include <opaque_fragment>',
        );
};

function processTileObj(obj: THREE.Object3D, scene: THREE.Scene): void {
    obj.traverse((child) => {
        const m = child as THREE.Mesh;
        if (!m.isMesh) return;
        try {
            const geo = m.geometry as THREE.BufferGeometry;
            const hasColor = !!geo.getAttribute('color');
            m.material = hasColor
                ? terrainMat
                : new THREE.MeshLambertMaterial({ color: 0x6b8e3f, side: THREE.DoubleSide });
            if (!geo.getAttribute('normal')) geo.computeVertexNormals();
            geo.computeBoundingBox();
            geo.computeBoundingSphere();
            (geo as any).computeBoundsTree();
            worldColliders.push(m);
            m.frustumCulled = true;
            m.castShadow = true;
            m.receiveShadow = true;
        } catch (err) {
            console.error('[World] Failed processing tile mesh', err);
        }
    });
    scene.add(obj);
}

/** Download world.zip with byte-level progress. Browser HTTP cache +
 *  ETag revalidation avoids re-downloading an unchanged world. */
async function fetchWorldZip(
    onProgress: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
    const res = await fetch(WORLD_ZIP_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${WORLD_ZIP_URL}`);
    const total = Number(res.headers.get('content-length') ?? 0);
    if (!res.body) {
        const buf = new Uint8Array(await res.arrayBuffer());
        onProgress(buf.length, buf.length);
        return buf;
    }
    const reader = res.body.getReader();
    const parts: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        loaded += value.length;
        onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const p of parts) { out.set(p, off); off += p.length; }
    return out;
}

/** Streaming update is a no-op: the whole world is one baked mesh. */
export function updateChunks(_scene: THREE.Scene, _camera: THREE.Camera): void {
    /* baked world — nothing to stream */
}

/**
 * Download `world.zip` (manifest + all tiles in one archive), unzip it in
 * memory, then add tiles to the scene nearest-first. `onReady` fires as soon
 * as the nearest tile is in the scene so physics can start.
 */
export async function loadInitialChunks(
    scene: THREE.Scene,
    camera: THREE.Camera,
    onReady: () => void,
): Promise<void> {
    const bar   = document.getElementById('world-progress-bar') as HTMLElement | null;
    const label = document.getElementById('world-progress-label') as HTMLElement | null;
    const wrap  = document.getElementById('world-progress') as HTMLElement | null;
    if (wrap) wrap.style.display = '';
    if (label) label.textContent = 'Downloading world…';

    const t0 = performance.now();
    let entries: Record<string, Uint8Array>;
    let manifest: Manifest;
    try {
        const zipBytes = await fetchWorldZip((loaded, total) => {
            if (total > 0) {
                const pct = (loaded / total) * 100;
                if (bar)   bar.style.width = `${pct.toFixed(1)}%`;
                if (label) label.textContent = `Downloading world… ${(loaded / 1048576).toFixed(1)} / ${(total / 1048576).toFixed(1)} MB`;
            } else if (label) {
                label.textContent = `Downloading world… ${(loaded / 1048576).toFixed(1)} MB`;
            }
        });
        if (label) label.textContent = 'Unpacking world…';
        entries = unzipSync(zipBytes);
        const manifestBytes = entries['manifest.json'];
        if (!manifestBytes) throw new Error('world.zip is missing manifest.json');
        manifest = JSON.parse(strFromU8(manifestBytes)) as Manifest;
    } catch (err) {
        console.error('[World] Failed to load world.zip:', err);
        if (label) label.textContent = 'Failed to load world';
        throw err;
    }

    // Sort tiles nearest-first from spawn (camera.position.xz).
    const px = camera.position.x, pz = camera.position.z;
    const tiles = manifest.tiles.slice().sort((a, b) => {
        const acx = (a.bbox[0] + a.bbox[3]) * 0.5, acz = (a.bbox[2] + a.bbox[5]) * 0.5;
        const bcx = (b.bbox[0] + b.bbox[3]) * 0.5, bcz = (b.bbox[2] + b.bbox[5]) * 0.5;
        const da = (acx - px) ** 2 + (acz - pz) ** 2;
        const db = (bcx - px) ** 2 + (bcz - pz) ** 2;
        return da - db;
    });

    const total = tiles.length;
    let done = 0;
    let readyFired = false;
    const loader = new OBJLoader();

    function updateProgress() {
        const pct = (done / total) * 100;
        if (bar)   bar.style.width = `${pct.toFixed(1)}%`;
        if (label) label.textContent = `${done} / ${total} tiles`;
    }
    updateProgress();

    const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

    // Parsing an OBJ and building its BVH are expensive main-thread jobs
    // (tens–hundreds of ms per tile). Process one tile per frame-yield so the
    // render loop stays responsive while the world fills in.
    for (const t of tiles) {
        try {
            const bytes = entries[t.file];
            if (!bytes) throw new Error(`${t.file} missing from world.zip`);
            await nextFrame();
            const obj = loader.parse(strFromU8(bytes));
            obj.name = t.file;
            await nextFrame();
            processTileObj(obj, scene);
        } catch (err) {
            console.error(`[World] tile ${t.file} failed:`, err);
        } finally {
            done++;
            updateProgress();
            if (!readyFired && done >= 1) {
                readyFired = true;
                onReady();
            }
        }
    }

    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`[World] All ${total} tiles loaded in ${dt}s — ${worldColliders.length} meshes`);
    if (wrap) wrap.style.display = 'none';

    // Spawn trees over the visible chunk grid around the player.
    const cx = Math.floor(camera.position.x / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);
    const R2 = RENDER * RENDER;
    const coords: [number, number, number][] = [];
    for (let dx = -RENDER; dx <= RENDER; dx++)
    for (let dz = -RENDER; dz <= RENDER; dz++) {
        if (dx * dx + dz * dz > R2) continue;
        coords.push([cx + dx, 0, cz + dz]);
    }
    for (let i = 0; i < coords.length; i++) {
        const [qx, qy, qz] = coords[i];
        try {
            buildTrees(scene, `${qx},${qy},${qz}`, qx, qy, qz);
        } catch (err) {
            console.error(`[World] buildTrees failed at ${qx},${qy},${qz}:`, err);
        }
        if ((i & 15) === 0) await new Promise(r => setTimeout(r, 0));
    }
}
