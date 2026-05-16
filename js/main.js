const scene    = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 60, 200);

const camera   = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 300);
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
for (let i = 0; i < 2000; i++) {
    const r = 250;
    starPos.push((Math.random()-0.5)*r*2, (Math.random()+0.2)*r, (Math.random()-0.5)*r*2);
}
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff,size:0.4})));

// ─── World / Chunk management ─────────────────────────────────────────────────
const noise   = new Noise(12345);
const ISO     = 0.0;
const CHUNK   = 16;
const RENDER  = 3;
const chunks  = new Map();
const mat     = new THREE.MeshLambertMaterial({ vertexColors: true });

function densityAt(wx, wy, wz) {
    const scale = 0.035;
    const h = 14
        + noise.octave(wx * scale, 0, wz * scale, 5, 0.55, 2.1) * 22
        + noise.octave(wx * 0.008, 0, wz * 0.008, 2, 0.5, 2.0) * 20;
    return (h - wy) / 10.0;
}

function buildChunk(cx, cy, cz) {
    const key = `${cx},${cy},${cz}`;
    if (chunks.has(key)) return;
    const ox = cx * CHUNK, oy = cy * CHUNK, oz = cz * CHUNK;
    const {verts, norms, cols} = marchChunk(densityAt, ox, oy, oz, CHUNK, ISO);
    if (verts.length === 0) { chunks.set(key, null); return; }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal',   new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('color',    new THREE.Float32BufferAttribute(cols,  3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    chunks.set(key, mesh);
}

function removeChunk(key) {
    const mesh = chunks.get(key);
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); }
    chunks.delete(key);
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

lockedMsg.style.display = 'block';
lockedMsg.textContent   = 'Generating world…';
for (let dx = -RENDER; dx <= RENDER; dx++)
for (let dy = -2; dy <= RENDER; dy++)
for (let dz = -RENDER; dz <= RENDER; dz++)
    buildChunk(dx, dy, dz);
lockedMsg.style.display = 'none';

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);

    if (locked) {
        const speed = (keys['ShiftLeft'] || keys['ShiftRight']) ? 30 : 12;
        const fwd   = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const right = new THREE.Vector3(1, 0,  0).applyQuaternion(camera.quaternion);
        fwd.y = 0; fwd.normalize();
        right.y = 0; right.normalize();
        if (keys['KeyW']) camera.position.addScaledVector(fwd,   speed * dt);
        if (keys['KeyS']) camera.position.addScaledVector(fwd,  -speed * dt);
        if (keys['KeyA']) camera.position.addScaledVector(right, -speed * dt);
        if (keys['KeyD']) camera.position.addScaledVector(right,  speed * dt);
        if (keys['Space'])   camera.position.y += speed * dt;
        if (keys['ShiftLeft'] && !keys['KeyW'] && !keys['KeyS']) camera.position.y -= speed * dt;
    }

    updateChunks();

    const p = camera.position;
    posEl.textContent = `Position: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`;
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

animate();
