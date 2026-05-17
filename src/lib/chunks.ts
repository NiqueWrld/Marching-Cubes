import * as THREE from 'three';
import { ChunkDB } from './chunkDB.js';
import { CHUNK, ISO, RENDER } from './worldConstants.js';
import { densityAt } from './terrain.js';
import { buildTrees, removeTrees } from './trees.js';
import { marchChunk } from '../marching-cubes.js';

export const chunks = new Map<string, THREE.Mesh | null | undefined>();
const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

function spawnMesh(scene: THREE.Scene, key: string, verts: number[], norms: number[], cols: number[]): void {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(cols,  3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    chunks.set(key, mesh);
}

export async function buildChunk(scene: THREE.Scene, cx: number, cy: number, cz: number): Promise<void> {
    const key = `${cx},${cy},${cz}`;
    if (chunks.has(key)) return;
    chunks.set(key, undefined); // mark in-progress

    const cached = await ChunkDB.get(key);
    if (cached) {
        if (cached.empty) { chunks.set(key, null); return; }
        spawnMesh(scene, key, cached.verts!, cached.norms!, cached.cols!);
        buildTrees(scene, key, cx, cy, cz);
        return;
    }

    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
    const { verts, norms, cols } = marchChunk(densityAt, ox, oy, oz, CHUNK, ISO);
    if (verts.length === 0) {
        chunks.set(key, null);
        return;
    }
    spawnMesh(scene, key, verts, norms, cols);
    buildTrees(scene, key, cx, cy, cz);
}

export function removeChunk(scene: THREE.Scene, key: string): void {
    const mesh = chunks.get(key);
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    chunks.delete(key);
    removeTrees(scene, key);
}

let lastCX: number | null = null, lastCY: number | null = null, lastCZ: number | null = null;

export function updateChunks(scene: THREE.Scene, camera: THREE.Camera): void {
    const cx = Math.floor(camera.position.x / CHUNK);
    const cy = Math.floor(camera.position.y / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);
    if (cx === lastCX && cy === lastCY && cz === lastCZ) return;
    lastCX = cx; lastCY = cy; lastCZ = cz;

    const R2 = RENDER * RENDER;
    for (const key of chunks.keys()) {
        const [kx, ky, kz] = key.split(',').map(Number);
        const dx = kx - cx, dz = kz - cz;
        if (dx * dx + dz * dz > (RENDER + 1) * (RENDER + 1) || Math.abs(ky - cy) > 2)
            removeChunk(scene, key);
    }

    // Camera forward (horizontal) for direction-biased priority
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() > 0) fwd.normalize();

    const queue: [number, number, number, number][] = [];
    for (let dx = -RENDER; dx <= RENDER; dx++)
    for (let dy = -1; dy <= 1; dy++)
    for (let dz = -RENDER; dz <= RENDER; dz++) {
        if (dx * dx + dz * dz > R2) continue;
        const key = `${cx + dx},${cy + dy},${cz + dz}`;
        if (chunks.has(key)) continue;
        const dist2 = dx * dx + dy * dy + dz * dz;
        const dot   = dx * fwd.x + dz * fwd.z;
        const priority = dist2 - dot * 4;
        queue.push([cx + dx, cy + dy, cz + dz, priority]);
    }
    queue.sort((a, b) => a[3] - b[3]);

    // Time-budgeted build: at most ~4 ms per frame, capped at 8 chunks
    const start = performance.now();
    let built = 0;
    for (const [qx, qy, qz] of queue) {
        buildChunk(scene, qx, qy, qz);
        built++;
        if (built >= 8 || performance.now() - start > 4) break;
    }
}

/**
 * Initial spawn-time chunk load. Builds the closest chunks synchronously,
 * hides the loading overlay, then continues filling the rest in the background
 * while yielding to the main thread.
 */
export async function loadInitialChunks(
    scene: THREE.Scene,
    camera: THREE.Camera,
    onReady: () => void,
): Promise<void> {
    const cx = Math.floor(camera.position.x / CHUNK);
    const cy = Math.floor(camera.position.y / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);
    const queue: [number, number, number, number][] = [];
    const R2 = RENDER * RENDER;
    for (let dx = -RENDER; dx <= RENDER; dx++)
    for (let dy = -1; dy <= 1; dy++)
    for (let dz = -RENDER; dz <= RENDER; dz++) {
        if (dx * dx + dz * dz > R2) continue;
        queue.push([cx + dx, cy + dy, cz + dz, dx * dx + dy * dy + dz * dz]);
    }
    queue.sort((a, b) => a[3] - b[3]);

    const IMMEDIATE = Math.min(8, queue.length);
    for (let i = 0; i < IMMEDIATE; i++) {
        const [qx, qy, qz] = queue[i];
        await buildChunk(scene, qx, qy, qz);
    }
    onReady();
    for (let i = IMMEDIATE; i < queue.length; i++) {
        const [qx, qy, qz] = queue[i];
        await buildChunk(scene, qx, qy, qz);
        if ((i & 7) === 0) await new Promise(r => setTimeout(r, 0));
    }
}
