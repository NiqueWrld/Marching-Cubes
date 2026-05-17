import * as THREE from 'three';
import { CHUNK } from './worldConstants.js';
import { densityAt, seededRand, findSurfaceInChunk } from './terrain.js';
import type { TreeColliderSet } from '../types/Tree.js';

const trunkMat    = new THREE.MeshLambertMaterial({ color: 0x6B3A2A });
const foliageMat  = new THREE.MeshLambertMaterial({ color: 0x2D6A1F });
const foliageMat2 = new THREE.MeshLambertMaterial({ color: 0x3A8A2A });

export const treeMeshes    = new Map<string, THREE.Mesh[]>();
export const treeColliders = new Map<string, TreeColliderSet>();

export function buildTrees(scene: THREE.Scene, key: string, cx: number, cy: number, cz: number): void {
    if (treeMeshes.has(key)) return;
    const meshList: THREE.Mesh[] = [];
    const trunks:  TreeColliderSet['trunks']  = [];
    const foliage: TreeColliderSet['foliage'] = [];
    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;

    for (let i = 0; i < 5; i++) {
        const seed = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(i, 1234567);
        const wx = ox + seededRand(seed)     * CHUNK;
        const wz = oz + seededRand(seed + 1) * CHUNK;
        const sy = findSurfaceInChunk(wx, oy, wz);
        if (sy === null) continue;

        const e = 0.5;
        const gx = densityAt(wx + e, sy, wz) - densityAt(wx - e, sy, wz);
        const gy = densityAt(wx, sy + e, wz) - densityAt(wx, sy - e, wz);
        const gz = densityAt(wx, sy, wz + e) - densityAt(wx, sy, wz - e);
        const len = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
        if (-gy / len < 0.72) continue;

        const trunkH   = 3.5 + seededRand(seed + 2) * 2.5;
        const foliageR = 2.2 + seededRand(seed + 3) * 1.8;
        const fMat     = seededRand(seed + 4) > 0.5 ? foliageMat : foliageMat2;

        trunks.push({ x: wx, z: wz, r: 0.45, yBot: sy, yTop: sy + trunkH });

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, trunkH, 7), trunkMat);
        trunk.position.set(wx, sy + trunkH * 0.5, wz);
        trunk.castShadow = trunk.receiveShadow = true;
        scene.add(trunk); meshList.push(trunk);

        const f1 = new THREE.Mesh(new THREE.SphereGeometry(foliageR, 7, 6), fMat);
        f1.position.set(wx, sy + trunkH + foliageR * 0.55, wz);
        f1.castShadow = true;
        scene.add(f1); meshList.push(f1);
        foliage.push({ x: wx, y: sy + trunkH + foliageR * 0.55, z: wz, r: foliageR });

        const f2x = wx + (seededRand(seed + 5) - 0.5) * foliageR;
        const f2y = sy + trunkH + foliageR * 1.1;
        const f2z = wz + (seededRand(seed + 6) - 0.5) * foliageR;
        const f2 = new THREE.Mesh(new THREE.SphereGeometry(foliageR * 0.7, 6, 5), fMat);
        f2.position.set(f2x, f2y, f2z);
        f2.castShadow = true;
        scene.add(f2); meshList.push(f2);
        foliage.push({ x: f2x, y: f2y, z: f2z, r: foliageR * 0.7 });
    }
    treeMeshes.set(key, meshList);
    treeColliders.set(key, { trunks, foliage });
}

export function removeTrees(scene: THREE.Scene, key: string): void {
    const list = treeMeshes.get(key);
    if (list) {
        for (const m of list) { scene.remove(m); m.geometry.dispose(); }
        treeMeshes.delete(key);
    }
    treeColliders.delete(key);
}
