const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 80, 380);

const camera   = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 500);
camera.position.set(0, 35, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.prepend(renderer.domElement);

// Lighting
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(60, 100, 40);
sun.castShadow = true;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8888aa, 0.6));
const hemi = new THREE.HemisphereLight(0x87ceeb, 0x556b2f, 0.4);
scene.add(hemi);

// Stars
const starGeo = new THREE.BufferGeometry();
const starPos = [];

// ─── Water ──────────────────────────────────────────────────────────────
const WATER_LEVEL = 8;
const waterUniforms = { uTime: { value: 0 } };
const waterMat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            vUv = uv;
            vec3 pos = position;
            float wave = sin(pos.x * 0.25 + uTime * 1.4) * 0.18
                       + cos(pos.z * 0.22 + uTime * 1.1) * 0.18
                       + sin((pos.x + pos.z) * 0.15 + uTime * 0.9) * 0.10;
            pos.y += wave;
            vWave = wave;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vWave;
        void main() {
            float foam = smoothstep(0.28, 0.38, vWave);
            vec3 deep    = vec3(0.04, 0.22, 0.48);
            vec3 shallow = vec3(0.10, 0.52, 0.78);
            vec3 foamCol = vec3(0.85, 0.93, 1.00);
            float t = sin(vUv.x * 18.0 + uTime * 1.8) * 0.5 + 0.5;
            vec3 col = mix(deep, shallow, t * 0.4 + 0.3);
            col = mix(col, foamCol, foam * 0.6);
            float alpha = 0.78 - foam * 0.15;
            gl_FragColor = vec4(col, alpha);
        }
    `
});
const waterMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3000, 3000, 120, 120),
    waterMat
);
waterMesh.rotation.x = -Math.PI / 2;
waterMesh.position.y = WATER_LEVEL;
scene.add(waterMesh);
for (let i = 0; i < 2000; i++) {
    const r = 250;
    starPos.push((Math.random()-0.5)*r*2, (Math.random()+0.2)*r, (Math.random()-0.5)*r*2);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff,size:0.4})));

// ─── Server-side chunk cache ──────────────────────────────────────────────────
const ChunkDB = (() => {
    // Chunk keys contain commas ("cx,cy,cz") – encode as "cx_cy_cz" for the URL
    function encode(key) { return key.replace(/,/g, '_'); }

    function open() { return Promise.resolve(); } // no-op, no init needed

    async function get(key) {
        try {
            const res = await fetch(`/api/chunks/${encode(key)}`);
            if (!res.ok) return null;
            return await res.json();
        } catch {
            return null;
        }
    }

    function put(key, value) {
        return fetch(`/api/chunks/${encode(key)}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(value)
        }).catch(() => {});
    }

    return { open, get, put };
})();

// ─── World / Chunk management ─────────────────────────────────────────────────
const noise   = new Noise(12345);
const ISO     = 0.0;
const CHUNK   = 16;
const RENDER  = 6;
const chunks  = new Map();
const mat     = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

// ─── Tree system ──────────────────────────────────────────────────────────────
const treeMeshes = new Map(); // key -> [mesh, ...]
const trunkMat   = new THREE.MeshLambertMaterial({ color: 0x6B3A2A });
const foliageMat = new THREE.MeshLambertMaterial({ color: 0x2D6A1F });
const foliageMat2 = new THREE.MeshLambertMaterial({ color: 0x3A8A2A }); // lighter variant

function seededRand(s) {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    return ((s ^ (s >>> 16)) >>> 0) / 0xFFFFFFFF;
}

// Returns surface Y within [oy, oy+CHUNK], or null if chunk doesn't straddle the surface
function findSurfaceInChunk(wx, oy, wz) {
    const bot = oy, top = oy + CHUNK;
    if (densityAt(wx, bot, wz) <= ISO) return null; // whole chunk above surface
    if (densityAt(wx, top, wz) >  ISO) return null; // whole chunk below surface
    let lo = bot, hi = top;
    for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) * 0.5;
        if (densityAt(wx, mid, wz) > ISO) lo = mid; else hi = mid;
    }
    return hi;
}

function buildTrees(key, cx, cy, cz) {
    if (treeMeshes.has(key)) return;
    const meshList = [];
    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
    const TREES_PER_CHUNK = 5;
    for (let i = 0; i < TREES_PER_CHUNK; i++) {
        const seed = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ Math.imul(i, 1234567);
        const wx = ox + seededRand(seed)     * CHUNK;
        const wz = oz + seededRand(seed + 1) * CHUNK;
        const sy = findSurfaceInChunk(wx, oy, wz);
        if (sy === null) continue;

        // Estimate surface normal via density gradient; skip if slope is too steep
        const e = 0.5;
        const gx = densityAt(wx + e, sy, wz) - densityAt(wx - e, sy, wz);
        const gy = densityAt(wx, sy + e, wz) - densityAt(wx, sy - e, wz);
        const gz = densityAt(wx, sy, wz + e) - densityAt(wx, sy, wz - e);
        const len = Math.sqrt(gx*gx + gy*gy + gz*gz) || 1;
        const flatness = gy / len; // 1 = perfectly flat, 0 = vertical
        if (flatness < 0.72) continue; // skip steep / rocky faces

        const trunkH  = 3.5 + seededRand(seed + 2) * 2.5;
        const foliageR = 2.2 + seededRand(seed + 3) * 1.8;
        const fMat = seededRand(seed + 4) > 0.5 ? foliageMat : foliageMat2;

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.35, trunkH, 7), trunkMat);
        trunk.position.set(wx, sy + trunkH * 0.5, wz);
        trunk.castShadow = trunk.receiveShadow = true;
        scene.add(trunk);
        meshList.push(trunk);

        // Two overlapping spheres for a fuller canopy
        const f1 = new THREE.Mesh(new THREE.SphereGeometry(foliageR, 7, 6), fMat);
        f1.position.set(wx, sy + trunkH + foliageR * 0.55, wz);
        f1.castShadow = true;
        scene.add(f1);
        meshList.push(f1);

        const f2 = new THREE.Mesh(new THREE.SphereGeometry(foliageR * 0.7, 6, 5), fMat);
        f2.position.set(
            wx + (seededRand(seed + 5) - 0.5) * foliageR,
            sy + trunkH + foliageR * 1.1,
            wz + (seededRand(seed + 6) - 0.5) * foliageR
        );
        f2.castShadow = true;
        scene.add(f2);
        meshList.push(f2);
    }
    treeMeshes.set(key, meshList);
}

function removeTrees(key) {
    const list = treeMeshes.get(key);
    if (list) {
        for (const m of list) { scene.remove(m); m.geometry.dispose(); }
        treeMeshes.delete(key);
    }
}

function densityAt(wx, wy, wz) {
    const scale = 0.035;
    const h = 14
        + noise.octave(wx * scale, 0, wz * scale, 5, 0.55, 2.1) * 22
        + noise.octave(wx * 0.008, 0, wz * 0.008, 2, 0.5, 2.0) * 20;
    return (h - wy) / 10.0;
}

function spawnMesh(key, verts, norms, cols) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(cols,  3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    chunks.set(key, mesh);
}

async function buildChunk(cx, cy, cz) {
    const key = `${cx},${cy},${cz}`;
    if (chunks.has(key)) return;
    // Mark as in-progress so concurrent calls don't double-build
    chunks.set(key, undefined);

    // Try loading from IndexedDB first
    const cached = await ChunkDB.get(key);
    if (cached) {
        if (cached.empty) { chunks.set(key, null); return; }
        spawnMesh(key, cached.verts, cached.norms, cached.cols);
        buildTrees(key, cx, cy, cz);
        return;
    }

    // Compute and save to DB
    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
    const {verts, norms, cols} = marchChunk(densityAt, ox, oy, oz, CHUNK, ISO);
    if (verts.length === 0) {
        chunks.set(key, null);
        ChunkDB.put(key, { empty: true });
        return;
    }
    spawnMesh(key, verts, norms, cols);
    buildTrees(key, cx, cy, cz);
    ChunkDB.put(key, { empty: false, verts: Array.from(verts), norms: Array.from(norms), cols: Array.from(cols) });
}

function removeChunk(key) {
    const mesh = chunks.get(key);
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    chunks.delete(key);
    removeTrees(key);
}

let lastCX = null, lastCY = null, lastCZ = null;
function updateChunks() {
    const cx = Math.floor(camera.position.x / CHUNK);
    const cy = Math.floor(camera.position.y / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);
    if (cx === lastCX && cy === lastCY && cz === lastCZ) return;
    lastCX = cx; lastCY = cy; lastCZ = cz;

    for (const key of chunks.keys()) {
        const [kx,ky,kz] = key.split(',').map(Number);
        if (Math.abs(kx-cx) > RENDER+1 || Math.abs(ky-cy) > RENDER+1 || Math.abs(kz-cz) > RENDER+1)
            removeChunk(key);
    }

    const queue = [];
    for (let dx = -RENDER; dx <= RENDER; dx++)
    for (let dy = -2; dy <= RENDER; dy++)
    for (let dz = -RENDER; dz <= RENDER; dz++) {
        const key = `${cx+dx},${cy+dy},${cz+dz}`;
        // skip if already built, empty, or currently loading (undefined)
        if (!chunks.has(key)) queue.push([cx+dx, cy+dy, cz+dz, dx*dx+dy*dy+dz*dz]);
    }
    queue.sort((a,b) => a[3]-b[3]);
    let built = 0;
    for (const [qx,qy,qz] of queue) {
        buildChunk(qx, qy, qz);
        if (++built >= 4) break;
    }
}

// ─── Player controls ──────────────────────────────────────────────────────────
const keys = {};
document.addEventListener('keydown', e => keys[e.code] = true);
document.addEventListener('keyup',   e => keys[e.code] = false);

const GRAVITY    = 30;   // units/s²
const JUMP_VEL   = 12;   // units/s
const EYE_HEIGHT = 1.8;  // camera above feet
let velY     = 0;
let onGround = false;

let yaw = 0, pitch = 0, locked = false;
const lockedMsg = document.getElementById('locked-msg');
const info      = document.getElementById('info');

document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    info.style.display      = locked ? 'none' : '';
    lockedMsg.style.display = 'none';
});

renderer.domElement.addEventListener('click', () => {
    renderer.domElement.requestPointerLock();
});

document.addEventListener('mousemove', e => {
    if (!locked) return;
    yaw   -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-Math.PI/2+0.01, Math.min(Math.PI/2-0.01, pitch));
});

// ─── Render loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
const posEl = document.getElementById('pos');
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
let playerSaveTimer = 0;

lockedMsg.style.display = 'block';
lockedMsg.textContent   = 'Loading world…';
ChunkDB.open().then(async () => {
    // Try server position first (signed-in), fall back to IndexedDB
    let saved = null;
    await Auth.ready;
    if (Auth.getToken()) {
        saved = await Auth.loadServerPosition();
    }
    if (!saved) saved = await ChunkDB.get('__player__');
    if (saved) {
        camera.position.set(saved.x, saved.y, saved.z);
        yaw   = saved.yaw;
        pitch = saved.pitch;
    }

    const cx = Math.floor(camera.position.x / CHUNK);
    const cy = Math.floor(camera.position.y / CHUNK);
    const cz = Math.floor(camera.position.z / CHUNK);

    // Collect all chunks sorted by distance from player (nearest first)
    const queue = [];
    for (let dx = -RENDER; dx <= RENDER; dx++)
    for (let dy = -2; dy <= RENDER; dy++)
    for (let dz = -RENDER; dz <= RENDER; dz++)
        queue.push([cx+dx, cy+dy, cz+dz, dx*dx+dy*dy+dz*dz]);
    queue.sort((a, b) => a[3] - b[3]);

    for (const [qx, qy, qz] of queue)
        await buildChunk(qx, qy, qz);

    lockedMsg.style.display = 'none';
});

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);

    if (locked) {
        const speed = keys['ShiftLeft'] ? 20 : 10;
        const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0,  0).applyQuaternion(camera.quaternion);
        fwd.y = 0; fwd.normalize();
        right.y = 0; right.normalize();
        if (keys['KeyW']) camera.position.addScaledVector(fwd,   speed * dt);
        if (keys['KeyS']) camera.position.addScaledVector(fwd,  -speed * dt);
        if (keys['KeyA']) camera.position.addScaledVector(right, -speed * dt);
        if (keys['KeyD']) camera.position.addScaledVector(right,  speed * dt);
        if (keys['Space'] && onGround) { velY = JUMP_VEL; onGround = false; }
    }

    // ── Gravity & ground collision ────────────────────────────────────────────
    velY -= GRAVITY * dt;
    camera.position.y += velY * dt;

    const px = camera.position.x, pz = camera.position.z;
    const feetY = camera.position.y - EYE_HEIGHT;

    if (densityAt(px, feetY, pz) > ISO) {
        // Feet are underground – binary-search upward for the surface
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
        // Check a small step below to know if we're standing on solid ground
        onGround = densityAt(px, feetY - 0.25, pz) > ISO;
    }

    updateChunks();

    const p = camera.position;
    posEl.textContent = `Position: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;

    // Save player state every ~2 seconds (IndexedDB + server)
    playerSaveTimer += dt;
    if (playerSaveTimer >= 2) {
        playerSaveTimer = 0;
        ChunkDB.put('__player__', { x: p.x, y: p.y, z: p.z, yaw, pitch });
        Auth.saveServerPosition(p.x, p.y, p.z, yaw, pitch);
    }

    // Multiplayer tick (send position, lerp remote players)
    Multiplayer.tick(dt, camera, yaw, pitch);

    waterUniforms.uTime.value += dt;

    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

window.addEventListener('beforeunload', () => {
    const p = camera.position;
    ChunkDB.put('__player__', { x: p.x, y: p.y, z: p.z, yaw, pitch });
});

animate();
