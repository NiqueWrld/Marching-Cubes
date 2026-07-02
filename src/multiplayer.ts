import * as THREE from 'three';
import { ref, onValue, onDisconnect, update, remove } from 'firebase/database';
import type { Unsubscribe } from 'firebase/database';
import { database } from './lib/firebase.js';
import { Auth, auth, onAuthStateChanged } from './auth.js';

interface RemotePlayer {
    mesh:      THREE.Group;
    name:      string;
    targetX?:  number;
    targetY?:  number;
    targetZ?:  number;
    targetYaw?: number;
}

let _scene: THREE.Scene | null = null;

const remotePlayers = new Map<string, RemotePlayer>();

// ── Player mesh ───────────────────────────────────────────────────────────────
const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe07b39 });
const headMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
const eyeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });

function makePlayerMesh(name: string): THREE.Group {
    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.4), bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMat);
    head.position.y = 1.5;
    head.castShadow = true;
    group.add(head);

    [-0.13, 0.13].forEach(ex => {
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
        eye.position.set(ex, 1.53, 0.28);
        group.add(eye);
    });

    const canvas  = document.createElement('canvas');
    canvas.width  = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.roundRect(4, 4, 248, 56, 10);
    ctx.fill();
    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.slice(0, 18), 128, 32);

    const tex    = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sprite.position.y = 2.3;
    sprite.scale.set(2.2, 0.55, 1);
    group.add(sprite);

    return group;
}

// ── Firebase RTDB presence ────────────────────────────────────────────────────
// Each online player writes `presence/{uid}` = { name, x, y, z, yaw, pitch }
// (removed automatically on disconnect). Everyone subscribes to `presence`.
interface PresenceEntry {
    name?: string;
    x?: number; y?: number; z?: number;
    yaw?: number; pitch?: number;
}

let _uid: string | null = null;
let _presenceUnsub: Unsubscribe | null = null;
let _publishing = false;

let _resolveConnected: () => void;
export const whenConnected: Promise<void> = new Promise(res => { _resolveConnected = res; });

/** Spectator camera target — mirrors the primary device's presence entry */
export const spectatorTarget = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, ready: false };

function removeRemote(uid: string): void {
    const entry = remotePlayers.get(uid);
    if (entry && _scene) {
        _scene.remove(entry.mesh);
        entry.mesh.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    }
    remotePlayers.delete(uid);
}

function connect(uid: string | null): void {
    // Reset any previous session (auth change / game restart).
    _presenceUnsub?.();
    _presenceUnsub = null;
    for (const id of [...remotePlayers.keys()]) removeRemote(id);
    _publishing = false;
    _uid = uid;
    (window as unknown as Record<string, unknown>).__playerCount__ = null;

    if (!uid) {
        console.info('[Multiplayer] Not signed in — running offline.');
        return;
    }

    const myRef = ref(database, `presence/${uid}`);
    const name  = Auth.getUser()?.displayName ?? Auth.getUser()?.email ?? 'Player';

    // Publish own presence unless this device is a spectator duplicate.
    const isSpec = (window as unknown as Record<string, unknown>).__spectator__ === true;
    if (!isSpec) {
        onDisconnect(myRef).remove().catch(() => {/* ignore */});
        update(myRef, { name }).then(() => {
            _publishing = true;
            console.log('[Multiplayer] Connected as', name);
            _resolveConnected();
        }).catch(err => {
            console.warn('[Multiplayer] Presence write failed:', err);
        });
        window.addEventListener('beforeunload', () => { remove(myRef).catch(() => {}); });
    }

    // Subscribe to everyone's presence.
    _presenceUnsub = onValue(ref(database, 'presence'), (snap) => {
        const seen = new Set<string>();
        snap.forEach((child) => {
            const id = child.key;
            if (!id) return;
            const p = child.val() as PresenceEntry;

            if (id === uid) {
                // Spectator mirrors the primary device's camera.
                if ((window as unknown as Record<string, unknown>).__spectator__ === true && typeof p.x === 'number') {
                    spectatorTarget.x = p.x; spectatorTarget.y = p.y ?? 0; spectatorTarget.z = p.z ?? 0;
                    spectatorTarget.yaw = p.yaw ?? 0; spectatorTarget.pitch = p.pitch ?? 0;
                    spectatorTarget.ready = true;
                }
                return;
            }
            seen.add(id);

            let entry = remotePlayers.get(id);
            if (!entry && _scene) {
                const mesh = makePlayerMesh(p.name ?? 'Player');
                _scene.add(mesh);
                entry = { mesh, name: p.name ?? 'Player' };
                remotePlayers.set(id, entry);
            }
            if (entry && typeof p.x === 'number') {
                entry.targetX   = p.x;
                entry.targetY   = (p.y ?? 0) - 1.8;
                entry.targetZ   = p.z;
                entry.targetYaw = p.yaw;
            }
        });
        for (const id of [...remotePlayers.keys()]) {
            if (!seen.has(id)) removeRemote(id);
        }
        (window as unknown as Record<string, unknown>).__playerCount__ = remotePlayers.size + 1;
    }, (err) => {
        console.warn('[Multiplayer] Presence subscription error:', err);
    });
}

// ── Tick ──────────────────────────────────────────────────────────────────────
let _sendTimer = 0;

function tick(dt: number, camera: THREE.Camera, yaw: number, pitch: number): void {
    _sendTimer += dt;
    if (_sendTimer >= 0.15 && _publishing && _uid) {
        _sendTimer = 0;
        update(ref(database, `presence/${_uid}`), {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw,
            pitch,
        }).catch(() => {/* transient write failure — next tick retries */});
    }

    for (const entry of remotePlayers.values()) {
        if (entry.targetX === undefined) continue;
        const { mesh } = entry;
        mesh.position.x += (entry.targetX - mesh.position.x) * Math.min(dt * 12, 1);
        mesh.position.y += ((entry.targetY ?? mesh.position.y) - mesh.position.y) * Math.min(dt * 12, 1);
        mesh.position.z += ((entry.targetZ ?? mesh.position.z) - mesh.position.z) * Math.min(dt * 12, 1);
        mesh.rotation.y  = entry.targetYaw ?? mesh.rotation.y;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
export function initMultiplayer(scene: THREE.Scene): void {
    _scene = scene;
    Auth.ready.then(() => {
        connect(Auth.getUser()?.uid ?? null);
        onAuthStateChanged(auth, (user) => {
            if ((user?.uid ?? null) !== _uid) connect(user?.uid ?? null);
        });
    }).catch(err => {
        console.error('[Multiplayer] Init error:', err);
    });
}

export const Multiplayer = { tick };
