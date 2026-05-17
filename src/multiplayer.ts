import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
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

// ── Socket connection ─────────────────────────────────────────────────────────
let socket: Socket | null = null;

function connect(token: string): void {
    if (socket) socket.disconnect();
    socket = io({ auth: { token } });

    socket.on('connect', () => {
        console.log('[Multiplayer] Connected as', Auth.getUser()?.displayName);
    });

    socket.on('connect_error', (err: Error) => {
        console.warn('[Multiplayer] Connection error:', err.message);
    });

    socket.on('player:join', ({ uid, name }: { uid: string; name: string; photoURL: string }) => {
        if (!_scene || remotePlayers.has(uid)) return;
        const mesh = makePlayerMesh(name ?? 'Player');
        _scene.add(mesh);
        remotePlayers.set(uid, { mesh, name });
    });

    socket.on('player:move', ({ uid, x, y, z, yaw }: { uid: string; x: number; y: number; z: number; yaw: number; pitch: number }) => {
        const entry = remotePlayers.get(uid);
        if (!entry) return;
        entry.targetX   = x;
        entry.targetY   = y - 1.8;
        entry.targetZ   = z;
        entry.targetYaw = yaw;
    });

    socket.on('player:leave', ({ uid }: { uid: string }) => {
        const entry = remotePlayers.get(uid);
        if (entry && _scene) {
            _scene.remove(entry.mesh);
            entry.mesh.traverse(o => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
        }
        remotePlayers.delete(uid);
    });

    socket.on('disconnect', () => {
        console.log('[Multiplayer] Disconnected');
    });
}

// ── Tick ──────────────────────────────────────────────────────────────────────
let _sendTimer = 0;

function tick(dt: number, camera: THREE.Camera, yaw: number, pitch: number): void {
    _sendTimer += dt;
    if (_sendTimer >= 0.1 && socket?.connected) {
        _sendTimer = 0;
        socket.emit('player:move', {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw,
            pitch,
        });
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
        connect(Auth.getToken() ?? '');
        onAuthStateChanged(auth, async (user) => {
            try {
                const t = user ? await user.getIdToken() : '';
                connect(t);
            } catch (err) {
                console.error('[Multiplayer] Auth state change error:', err);
            }
        });
    }).catch(err => {
        console.error('[Multiplayer] Init error:', err);
    });
}

export const Multiplayer = { tick };
