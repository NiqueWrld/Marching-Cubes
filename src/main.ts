import * as THREE from 'three';
import { Auth } from './auth.js';
import { Multiplayer, initMultiplayer, spectatorTarget } from './multiplayer.js';
import { whenRoleKnown, currentRole, resolveAnonymousRole } from './lib/gameSession.js';
import { mobileInput } from './pages/Game/Controls/Mobile/index.js';
import { device } from './lib/isMobile.js';
import { CHUNK, ISO } from './lib/worldConstants.js';
import { densityAt } from './lib/terrain.js';
import { createWater } from './lib/water.js';
import { ChunkDB } from './lib/chunkDB.js';
import { loadInitialChunks, updateChunks, worldColliders, startReveal, tickReveal } from './lib/chunks.js';
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
const lockedText = (document.getElementById('locked-text') as HTMLElement | null) ?? lockedMsg;
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
lockedText.textContent  = 'Connecting to server…';

ChunkDB.open().then(async () => {
    try {
        // Race the role claim against a short timeout so the game still
        // starts if no React-side useDevice() ever calls claimRole().
        const roleTimeout = new Promise<void>(resolve => setTimeout(() => {
            resolveAnonymousRole();
            resolve();
        }, 3000));
        await Promise.race([whenRoleKnown, roleTimeout]);
        if (currentRole === 'spectator') {
            lockedText.textContent     = '👁 Spectator Mode\nAlready connected on another device.';
            lockedMsg.style.whiteSpace = 'pre-line';
            return;
        }
        lockedText.textContent = 'Loading world…';
        await Auth.ready;
        try {
            const saved = Auth.getToken() ? await Auth.loadServerPosition() : null;
            if (saved) {
                camera.position.set(saved.x, saved.y, saved.z);
                yaw   = saved.yaw;
                pitch = saved.pitch;
            }
        } catch (err) {
            console.error('[Game] Failed to load saved player position:', err);
        }
        await loadInitialChunks(scene, camera, () => { lockedMsg.style.display = 'none'; });

        // Raycast straight down against the actual baked mesh to find the
        // true surface (the TS density function disagrees with the C# baker,
        // so density-based checks can leave the player buried).
        {
            const ray = new THREE.Raycaster(
                new THREE.Vector3(camera.position.x, 500, camera.position.z),
                new THREE.Vector3(0, -1, 0),
                0, 1000,
            );
            const hits = ray.intersectObjects(worldColliders, false);
            const hit = hits.find(h => (h.object as THREE.Mesh).isMesh);
            if (hit) {
                camera.position.y = hit.point.y + EYE_HEIGHT + 0.1;
                velY = 0;
                console.log(`[Game] Spawn snapped to baked surface y=${camera.position.y.toFixed(2)} (hit=${hit.point.y.toFixed(2)})`);
            } else {
                console.warn('[Game] No surface hit below spawn — falling back to density scan');
                if (densityAt(camera.position.x, camera.position.y - EYE_HEIGHT, camera.position.z) > ISO) {
                    let y = camera.position.y;
                    while (y < 200 && densityAt(camera.position.x, y, camera.position.z) > ISO) y += 1;
                    camera.position.y = y + EYE_HEIGHT + 0.1;
                    velY = 0;
                }
            }
        }
        // Kick off the radial reveal from the player's feet.
        startReveal(camera.position);
    } catch (err) {
        console.error('[Game] World initialisation step failed:', err);
        lockedText.textContent = `Failed to load world: ${(err as Error)?.message ?? err}`;
        throw err;
    }
}).catch(err => {
    console.error('[Game] World initialisation failed:', err);
    lockedText.textContent = `Failed to load world: ${(err as Error)?.message ?? err}`;
});

// Surface otherwise-silent runtime errors
window.addEventListener('error', (e) => {
    console.error('[Game] Uncaught error:', e.error ?? e.message);
});
window.addEventListener('unhandledrejection', (e) => {
    console.error('[Game] Unhandled promise rejection:', e.reason);
});

// ─── Render loop ──────────────────────────────────────────────────────────────
let _lastCoordLog = 0;
const _down = new THREE.Vector3(0, -1, 0);
const _groundRay = new THREE.Raycaster(new THREE.Vector3(), _down, 0, 100);
function animate(): void {
    if (!running) return;
    requestAnimationFrame(animate);
    clock.update();
    const dt = Math.min(clock.getDelta(), 0.05);
    tickReveal(dt);

    const now = performance.now();
    if (now - _lastCoordLog > 500) {
        _lastCoordLog = now;
        const p = camera.position;
        console.log(`[Player] x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} z=${p.z.toFixed(2)} yaw=${yaw.toFixed(2)} pitch=${pitch.toFixed(2)}`);
    }

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

    // Skip physics until the baked world is in the scene — otherwise the
    // player falls through empty space before colliders exist.
    if (worldColliders.length === 0) {
        camera.position.set(0, 35, 0);
        velY = 0;
        waterMesh.position.x = camera.position.x;
        waterMesh.position.z = camera.position.z;
        waterUniforms.uTime.value += dt;
        renderer.render(scene, camera);
        return;
    }

    velY -= GRAVITY * dt;
    camera.position.y += velY * dt;

    const px = camera.position.x, pz = camera.position.z;
    const feetY = camera.position.y - EYE_HEIGHT;

    // Terrain collision via downward raycast against the baked mesh.
    // Start ray from well above the world's top so we always hit the top
    // surface, never the underside (the world's max y is ~48).
    _groundRay.set(new THREE.Vector3(px, 500, pz), _down);
    _groundRay.far = 1000;
    const groundHits = _groundRay.intersectObjects(worldColliders, false);
    const groundHit = groundHits[0];
    if (groundHit) {
        const surfY = groundHit.point.y;
        if (feetY < surfY) {
            camera.position.y = surfY + EYE_HEIGHT;
            if (velY < 0) velY = 0;
            onGround = true;
        } else {
            onGround = (feetY - surfY) < 0.25;
        }
    } else {
        onGround = false;
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
