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

const WORLD_OBJ_URL = '/world.obj';
const IDB_NAME  = 'world-cache';
const IDB_STORE = 'files';
const IDB_KEY   = WORLD_OBJ_URL;

interface CachedWorld {
    text: string;
    size: number;
    lastModified: string;
}

function openCache(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror   = () => reject(req.error);
    });
}
async function cacheGet(): Promise<CachedWorld | null> {
    try {
        const db = await openCache();
        return await new Promise<CachedWorld | null>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
            tx.onsuccess = () => resolve((tx.result as CachedWorld | undefined) ?? null);
            tx.onerror   = () => reject(tx.error);
        });
    } catch { return null; }
}
async function cachePut(entry: CachedWorld): Promise<void> {
    try {
        const db = await openCache();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(entry, IDB_KEY);
            tx.onsuccess = () => resolve();
            tx.onerror   = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[World] cache write failed:', err);
    }
}

let worldMesh: THREE.Object3D | null = null;
let worldLoad: Promise<THREE.Object3D> | null = null;

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

function postProcess(obj: THREE.Object3D, t0: number): void {
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    let meshCount = 0, triCount = 0;
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
            meshCount++;
            const pos = geo.getAttribute('position');
            if (pos) triCount += pos.count / 3;
        } catch (err) {
            console.error('[World] Failed processing mesh', m.name, err);
        }
    });
    console.log(`[World] Ready in ${dt}s — ${meshCount} mesh(es), ${triCount} tris`);
}

async function fetchAndCache(
    setProgress: (loaded: number, total: number) => void,
    setStatus: (msg: string) => void,
): Promise<string> {
    setStatus('Downloading world…');
    const res = await fetch(WORLD_OBJ_URL);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} fetching world.obj`);
    const total = Number(res.headers.get('content-length')) || 0;
    const lastModified = res.headers.get('last-modified') || '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        setProgress(loaded, total);
    }
    setStatus('Parsing mesh…');
    const blob = new Blob(chunks);
    const text = await blob.text();
    void cachePut({ text, size: text.length, lastModified });
    return text;
}

function loadWorldOnce(): Promise<THREE.Object3D> {
    if (worldLoad) return worldLoad;

    const bar   = document.getElementById('world-progress-bar') as HTMLElement | null;
    const label = document.getElementById('world-progress-label') as HTMLElement | null;
    const wrap  = document.getElementById('world-progress') as HTMLElement | null;
    if (wrap) wrap.style.display = '';

    function setProgress(loaded: number, total: number) {
        const pct = total > 0 ? (loaded / total) * 100 : 0;
        if (bar)   bar.style.width = `${pct.toFixed(1)}%`;
        if (label) label.textContent = total > 0
            ? `${pct.toFixed(0)}%   ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
            : `${(loaded / 1e6).toFixed(1)} MB`;
    }
    function setStatus(msg: string) {
        if (label) label.textContent = msg;
    }

    worldLoad = (async () => {
        const t0 = performance.now();

        // 1. Cache lookup, validated against server HEAD (size + last-modified).
        let text: string | null = null;
        try {
            const cached = await cacheGet();
            if (cached) {
                setStatus('Validating cached world…');
                let valid = true;
                try {
                    const head = await fetch(WORLD_OBJ_URL, { method: 'HEAD' });
                    const size = Number(head.headers.get('content-length')) || 0;
                    const lastModified = head.headers.get('last-modified') || '';
                    if (size && size !== cached.size) valid = false;
                    if (lastModified && lastModified !== cached.lastModified) valid = false;
                } catch {
                    // HEAD failed (offline?) — accept the cached copy.
                }
                if (valid) {
                    console.log(`[World] Using cached OBJ (${(cached.size / 1e6).toFixed(1)} MB)`);
                    setStatus('Parsing cached mesh…');
                    text = cached.text;
                }
            }
        } catch (err) {
            console.warn('[World] Cache check failed:', err);
        }

        // 2. Otherwise download fresh.
        if (text === null) {
            text = await fetchAndCache(setProgress, setStatus);
        }

        // 3. Parse on the main thread (yield first so the UI can repaint).
        await new Promise(r => setTimeout(r, 0));
        const obj = new OBJLoader().parse(text);
        postProcess(obj, t0);
        if (wrap) wrap.style.display = 'none';
        return obj;
    })();

    worldLoad.catch(err => {
        console.error('[World] load failed:', err);
        if (label) label.textContent = 'Failed to load world';
    });
    return worldLoad;
}

/** Streaming update is a no-op: the whole world is one baked mesh. */
export function updateChunks(_scene: THREE.Scene, _camera: THREE.Camera): void {
    /* baked world — nothing to stream */
}

/** Load the baked OBJ, add it to the scene, then place trees over the visible region. */
export async function loadInitialChunks(
    scene: THREE.Scene,
    camera: THREE.Camera,
    onReady: () => void,
): Promise<void> {
    try {
        const obj = await loadWorldOnce();
        if (!worldMesh) {
            worldMesh = obj;
        }
        // Always make sure it's parented to *this* scene (handles HMR/restarts).
        if (worldMesh.parent !== scene) {
            scene.add(worldMesh);
        }
        console.log('[World] scene.children =', scene.children.length,
                    'worldMesh in scene =', worldMesh.parent === scene,
                    'worldMesh visible =', worldMesh.visible);
        worldMesh.traverse(o => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
                console.log('[World] mesh in scene — visible=', m.visible,
                            'matrixWorld pos=', new THREE.Vector3().setFromMatrixPosition(m.matrixWorld).toArray(),
                            'material=', (m.material as THREE.Material).type);
            }
        });
    } catch (err) {
        console.error('[World] Failed to load baked OBJ:', err);
        throw err;
    }
    onReady();

    // Spawn trees over the visible chunk grid around the player
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
