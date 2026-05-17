import * as THREE from 'three';
import { Auth } from './auth.js';
import { Multiplayer, initMultiplayer, spectatorTarget } from './multiplayer.js';
import { whenRoleKnown, currentRole } from './lib/gameSession.js';
import { mobileInput } from './pages/Game/Controls/Mobile/index.js';
import { device } from './lib/isMobile.js';
import { CHUNK, ISO } from './lib/worldConstants.js';
import { densityAt } from './lib/terrain.js';
import { createWater } from './lib/water.js';
import { ChunkDB } from './lib/chunkDB.js';
import { loadInitialChunks, updateChunks } from './lib/chunks.js';
import { treeColliders } from './lib/trees.js';

export function startGame(container: HTMLElement): () => void {

// ─── Scene ────────────────────────────────────────────────────────────────────
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 120, 512);

const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 700);
camera.position.set(0, 35, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.shadowMap.enabled = true;
container.prepend(renderer.domElement);

// ─── Lighting ─────────────────────────────────────────────────────────────────
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(60, 100, 40);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8888aa, 0.6));
scene.add(new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.4));

// ─── Stars ────────────────────────────────────────────────────────────────────
const starGeo = new THREE.BufferGeometry();
const starPos: number[] = [];
for (let i = 0; i < 2000; i++) {
    const r = 250;
    starPos.push((Math.random() - 0.5) * r * 2, (Math.random() + 0.2) * r, (Math.random() - 0.5) * r * 2);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.4 })));

// ─── Water ────────────────────────────────────────────────────────────────────
const { mesh: waterMesh, uniforms: waterUniforms } = createWater();
scene.add(waterMesh);

// ─── Player controls ──────────────────────────────────────────────────────────
const keys: Record<string, boolean> = {};
document.addEventListener('keydown', e => { keys[e.code] = true; });
document.addEventListener('keyup',   e => { keys[e.code] = false; });

const GRAVITY    = 30;
const JUMP_VEL   = 12;
const EYE_HEIGHT = 1.8;
let velY     = 0;
let onGround = false;
let yaw = 0, pitch = 0, locked = false;

const lockedMsg = document.getElementById('locked-msg') as HTMLElement;
const info      = document.getElementById('info')       as HTMLElement;

document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    info.style.display      = locked ? 'none' : '';
    lockedMsg.style.display = 'none';
});

renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!locked) return;
    yaw   -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
});

// ─── Auth button wiring ───────────────────────────────────────────────────────
document.getElementById('sign-in-btn') ?.addEventListener('click', () => Auth.signIn());
document.getElementById('sign-out-btn')?.addEventListener('click', () => Auth.signOut());

// ─── Multiplayer init ─────────────────────────────────────────────────────────
initMultiplayer(scene);

// ─── World init ───────────────────────────────────────────────────────────────
const clock = new THREE.Timer();
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let playerSaveTimer  = 0;
let playerSaveFailed = false;
let running          = true;

lockedMsg.classList.remove('hidden');
lockedMsg.style.display = 'block';
lockedMsg.textContent   = 'Connecting to server…';

ChunkDB.open().then(async () => {
    await whenRoleKnown;
    if (currentRole === 'spectator') {
        lockedMsg.textContent      = '👁 Spectator Mode\nAlready connected on another device.';
        lockedMsg.style.whiteSpace = 'pre-line';
        return;
    }
    lockedMsg.textContent = 'Loading world…';
    await Auth.ready;
    const saved = Auth.getToken() ? await Auth.loadServerPosition() : null;
    if (saved) {
        camera.position.set(saved.x, saved.y, saved.z);
        yaw   = saved.yaw;
        pitch = saved.pitch;
    }
    await loadInitialChunks(scene, camera, () => { lockedMsg.style.display = 'none'; });
}).catch(err => {
    console.error('[Game] World initialisation failed:', err);
    lockedMsg.textContent = 'Failed to load world. See console for details.';
});

// ─── Render loop ──────────────────────────────────────────────────────────────
function animate(): void {
    if (!running) return;
    requestAnimationFrame(animate);
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);

    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);

    // Spectator: mirror primary player's camera exactly
    if (currentRole === 'spectator') {
        camera.position.set(spectatorTarget.x, spectatorTarget.y, spectatorTarget.z);
        yaw   = spectatorTarget.yaw;
        pitch = spectatorTarget.pitch;
        euler.set(pitch, yaw, 0);
        camera.quaternion.setFromEuler(euler);
        waterMesh.position.x = camera.position.x;
        waterMesh.position.z = camera.position.z;
        waterUniforms.uTime.value += dt;
        renderer.render(scene, camera);
        return;
    }

    if (locked) {
        const speed = keys['ShiftLeft'] ? 20 : 10;
        const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0,  0).applyQuaternion(camera.quaternion);
        fwd.y = 0; fwd.normalize();
        right.y = 0; right.normalize();
        if (keys['KeyW']) camera.position.addScaledVector(fwd,    speed * dt);
        if (keys['KeyS']) camera.position.addScaledVector(fwd,   -speed * dt);
        if (keys['KeyA']) camera.position.addScaledVector(right, -speed * dt);
        if (keys['KeyD']) camera.position.addScaledVector(right,  speed * dt);
        if (keys['Space'] && onGround) { velY = JUMP_VEL; onGround = false; }
    }

    // Mobile controls
    if (device.isMobile && (mobileInput.forward !== 0 || mobileInput.strafe !== 0 || mobileInput.lookDx !== 0 || mobileInput.lookDy !== 0 || mobileInput.jump)) {
        const mSpeed = mobileInput.sprint ? 20 : 10;
        const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0,  0).applyQuaternion(camera.quaternion);
        fwd.y = 0; fwd.normalize();
        right.y = 0; right.normalize();
        camera.position.addScaledVector(fwd,   mobileInput.forward * mSpeed * dt);
        camera.position.addScaledVector(right, mobileInput.strafe  * mSpeed * dt);
        yaw   -= mobileInput.lookDx * 0.005;
        pitch -= mobileInput.lookDy * 0.005;
        pitch = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, pitch));
        if (mobileInput.jump && onGround) { velY = JUMP_VEL; onGround = false; mobileInput.jump = false; }
    }

    velY -= GRAVITY * dt;
    camera.position.y += velY * dt;

    const px = camera.position.x, pz = camera.position.z;
    const feetY = camera.position.y - EYE_HEIGHT;

    // Terrain collision (step-up via binary search)
    if (densityAt(px, feetY, pz) > ISO) {
        let lo = feetY, hi = feetY + 2;
        while (hi < feetY + 30 && densityAt(px, hi, pz) > ISO) hi += 1;
        for (let i = 0; i < 10; i++) {
            const mid = (lo + hi) * 0.5;
            if (densityAt(px, mid, pz) > ISO) lo = mid; else hi = mid;
        }
        camera.position.y = hi + EYE_HEIGHT;
        if (velY < 0) velY = 0;
        onGround = true;
    } else {
        onGround = densityAt(px, feetY - 0.25, pz) > ISO;
    }

    // Tree collision
    const playerR = 0.35;
    for (const col of treeColliders.values()) {
        for (const c of col.trunks) {
            if (camera.position.y < c.yBot || camera.position.y - EYE_HEIGHT > c.yTop) continue;
            const dx = camera.position.x - c.x;
            const dz = camera.position.z - c.z;
            const dist2 = dx * dx + dz * dz;
            const minDist = c.r + playerR;
            if (dist2 < minDist * minDist && dist2 > 0) {
                const dist = Math.sqrt(dist2);
                const push = (minDist - dist) / dist;
                camera.position.x += dx * push;
                camera.position.z += dz * push;
            }
        }
        for (const c of col.foliage) {
            const dx = camera.position.x - c.x;
            const dy = camera.position.y - c.y;
            const dz = camera.position.z - c.z;
            const dist2 = dx * dx + dy * dy + dz * dz;
            const minDist = c.r + playerR;
            if (dist2 < minDist * minDist && dist2 > 0) {
                const dist = Math.sqrt(dist2);
                const push = (minDist - dist) / dist;
                camera.position.x += dx * push;
                camera.position.y += dy * push;
                camera.position.z += dz * push;
            }
        }
    }

    updateChunks(scene, camera);

    // Periodic position save
    const p = camera.position;
    playerSaveTimer += dt;
    if (playerSaveTimer >= 2 && !playerSaveFailed) {
        playerSaveTimer = 0;
        Auth.saveServerPosition(p.x, p.y, p.z, yaw, pitch).catch(() => { playerSaveFailed = true; });
    }

    Multiplayer.tick(dt, camera, yaw, pitch);
    waterMesh.position.x = camera.position.x;
    waterMesh.position.z = camera.position.z;
    waterUniforms.uTime.value += dt;
    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}
window.addEventListener('resize', onResize);

window.addEventListener('beforeunload', () => {
    if (currentRole !== 'spectator') {
        const p = camera.position;
        Auth.saveServerPosition(p.x, p.y, p.z, yaw, pitch);
    }
});

animate();

return function cleanup() {
    running = false;
    window.removeEventListener('resize', onResize);
    renderer.domElement.remove();
    renderer.dispose();
};

} // end startGame

export { CHUNK };
