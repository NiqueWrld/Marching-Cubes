// ─── Multiplayer – Socket.io client ──────────────────────────────────────────
// Depends on: THREE (global), Auth (auth.js), scene (main.js)
// Socket.io client script is loaded via CDN in index.html

const Multiplayer = (() => {
    let socket = null;

    // uid → { mesh: THREE.Group, nameSprite: THREE.Sprite, ... }
    const remotePlayers = new Map();

    // ── Player mesh factory ───────────────────────────────────────────────────
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe07b39 });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xf5cba7 });
    const eyeMat  = new THREE.MeshLambertMaterial({ color: 0x111111 });

    function makePlayerMesh(name) {
        const group = new THREE.Group();

        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.4), bodyMat);
        body.position.y = 0.6;
        body.castShadow = true;
        group.add(body);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), headMat);
        head.position.y = 1.5;
        head.castShadow = true;
        group.add(head);

        // Eyes
        [-0.13, 0.13].forEach(ex => {
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.05), eyeMat);
            eye.position.set(ex, 1.53, 0.28);
            group.add(eye);
        });

        // Name label (canvas sprite)
        const canvas  = document.createElement('canvas');
        canvas.width  = 256; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle    = 'rgba(0,0,0,0.55)';
        ctx.roundRect(4, 4, 248, 56, 10);
        ctx.fill();
        ctx.font         = 'bold 28px monospace';
        ctx.fillStyle    = '#ffffff';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.slice(0, 18), 128, 32);

        const tex    = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sprite.position.y = 2.3;
        sprite.scale.set(2.2, 0.55, 1);
        group.add(sprite);

        return group;
    }

    // ── Connect ───────────────────────────────────────────────────────────────
    function connect(token) {
        if (socket) socket.disconnect();

        socket = io({ auth: { token } });

        socket.on('connect', () => {
            console.log('[Multiplayer] Connected as', Auth.getUser()?.displayName);
        });

        socket.on('connect_error', (err) => {
            console.warn('[Multiplayer] Connection error:', err.message);
        });

        socket.on('player:join', ({ uid, name, photoURL }) => {
            if (remotePlayers.has(uid)) return;
            const mesh = makePlayerMesh(name ?? 'Player');
            scene.add(mesh);
            remotePlayers.set(uid, { mesh, name });
            console.log('[Multiplayer] Player joined:', name);
        });

        socket.on('player:move', ({ uid, x, y, z, yaw, pitch }) => {
            const entry = remotePlayers.get(uid);
            if (!entry) return;
            // Smoothly lerp to new position (applied in animate loop)
            entry.targetX   = x;
            entry.targetY   = y - 1.8;   // camera is at eye height, draw feet position
            entry.targetZ   = z;
            entry.targetYaw = yaw;
        });

        socket.on('player:leave', ({ uid }) => {
            const entry = remotePlayers.get(uid);
            if (entry) {
                scene.remove(entry.mesh);
                entry.mesh.traverse(o => { if (o.geometry) o.geometry.dispose(); });
            }
            remotePlayers.delete(uid);
        });

        socket.on('disconnect', () => {
            console.log('[Multiplayer] Disconnected');
        });
    }

    // ── Send position (called from render loop) ───────────────────────────────
    let _sendTimer = 0;
    function tick(dt, camera, yaw, pitch) {
        // Send position update ~10× per second
        _sendTimer += dt;
        if (_sendTimer >= 0.1 && socket?.connected) {
            _sendTimer = 0;
            socket.emit('player:move', {
                x: camera.position.x,
                y: camera.position.y,
                z: camera.position.z,
                yaw,
                pitch
            });
        }

        // Lerp remote player meshes toward their last known position
        for (const entry of remotePlayers.values()) {
            if (entry.targetX === undefined) continue;
            const { mesh } = entry;
            mesh.position.x += (entry.targetX   - mesh.position.x) * Math.min(dt * 12, 1);
            mesh.position.y += (entry.targetY   - mesh.position.y) * Math.min(dt * 12, 1);
            mesh.position.z += (entry.targetZ   - mesh.position.z) * Math.min(dt * 12, 1);
            mesh.rotation.y  = entry.targetYaw ?? mesh.rotation.y;
        }
    }

    // ── Init: connect immediately (guest if not signed in) ────────────────────
    Auth.ready.then(() => {
        connect(Auth.getToken() ?? '');

        firebase.auth().onAuthStateChanged(async (user) => {
            const t = user ? await user.getIdToken() : '';
            connect(t);
        });
    });

    return { tick };
})();
