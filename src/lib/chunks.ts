import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { CHUNK, RENDER } from './worldConstants.js';
import { buildTrees } from './trees.js';

// Install BVH overrides globally on BufferGeometry / Mesh.
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;

export const worldColliders: THREE.Mesh[] = [];

const WORLD_DIR_URL = '/world/';
const MANIFEST_URL  = WORLD_DIR_URL + 'manifest.json';
const IDB_NAME  = 'world-cache';
const IDB_STORE = 'files';
const CACHE_VERSION = 'v6-sea-edge';

interface CachedTile {
    text: string;
    size: number;
    lastModified: string;
    version: string;
}
interface ManifestTile {
    file: string; tx: number; tz: number; bytes: number; tris: number;
    bbox: [number, number, number, number, number, number];
}
interface Manifest { seed: number; chunk: number; tile: number; tiles: ManifestTile[]; }

function openCache(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 2);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}
async function cacheGet(key: string): Promise<CachedTile | null> {
    try {
        const db = await openCache();
        return await new Promise<CachedTile | null>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
            tx.onsuccess = () => resolve((tx.result as CachedTile | undefined) ?? null);
            tx.onerror   = () => reject(tx.error);
        });
    } catch { return null; }
}
async function cachePut(key: string, entry: CachedTile): Promise<void> {
    try {
        const db = await openCache();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(entry, key);
            tx.onsuccess = () => resolve();
            tx.onerror   = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[World] cache write failed:', err);
    }
}

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

async function fetchTileText(
    url: string,
    expectedBytes: number,
): Promise<string> {
    // Try cache first (validated by byte size from manifest).
    try {
        const cached = await cacheGet(url);
        if (cached && cached.version === CACHE_VERSION && cached.size === expectedBytes) {
            return cached.text;
        }
    } catch { /* fall through */ }

    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    const text = await res.text();
    void cachePut(url, {
        text,
        size: text.length,
        lastModified: res.headers.get('last-modified') || '',
        version: CACHE_VERSION,
    });
    return text;
}

/** Streaming update is a no-op: the whole world is one baked mesh. */
export function updateChunks(_scene: THREE.Scene, _camera: THREE.Camera): void {
    /* baked world — nothing to stream */
}

/**
 * Load tiles in parallel from `/world/`, adding each to the scene as it
 * arrives so the world fills in around the player. `onReady` fires as soon
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
    if (label) label.textContent = 'Loading world…';

    const t0 = performance.now();
    let manifest: Manifest;
    try {
        const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching manifest`);
        manifest = await res.json();
    } catch (err) {
        console.error('[World] Failed to load manifest:', err);
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
    const CONCURRENCY = 6;

    function updateProgress() {
        const pct = (done / total) * 100;
        if (bar)   bar.style.width = `${pct.toFixed(1)}%`;
        if (label) label.textContent = `${done} / ${total} tiles`;
    }
    updateProgress();

    async function loadOne(t: ManifestTile) {
        try {
            const text = await fetchTileText(WORLD_DIR_URL + t.file, t.bytes);
            const obj = loader.parse(text);
            obj.name = t.file;
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

    // Worker-pool style: keep CONCURRENCY downloads in flight at all times.
    let next = 0;
    async function worker() {
        while (next < tiles.length) {
            const idx = next++;
            await loadOne(tiles[idx]);
        }
    }
    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY; i++) workers.push(worker());
    await Promise.all(workers);

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
