require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');

// Ensure chunks directory exists
const CHUNKS_DIR = path.join(__dirname, 'chunks');
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR);

// ─── Firebase Admin (optional – needed for auth & DB) ────────────────────────
// Download your service account key from:
// Firebase Console → Project Settings → Service Accounts → Generate New Private Key
// Save it as serviceAccountKey.json (project root)
let admin = null;
let db    = null;
try {
    admin = require('firebase-admin');
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential:  admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    db = admin.database();
    console.log('[Firebase] Admin SDK initialised');
} catch (err) {
    console.warn('[Firebase] Admin SDK not available – auth/DB disabled.');
    console.warn('           Place serviceAccountKey.json in the project root to enable.');
}

// ─── Express + Socket.io ──────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve built frontend
const DIST_DIR = path.join(__dirname, 'dist');
// redirect:false prevents /game → /game/ redirect that would serve game/index.html
// (a standalone page that never calls startGame) instead of the React SPA.
app.use(express.static(DIST_DIR, { redirect: false }));

// ─── Auth middleware ──────────────────────────────────────────────────────────
async function verifyToken(req, res, next) {
    if (!admin) return res.status(503).json({ error: 'Auth not configured' });
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing token' });
    }
    try {
        req.user = await admin.auth().verifyIdToken(header.split('Bearer ')[1]);
        next();
    } catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// ─── REST: server capabilities ───────────────────────────────────────────────
app.get('/api/status', (req, res) => {
    res.json({ auth: !!admin, db: !!db });
});

// ─── REST: player position ────────────────────────────────────────────────────
app.get('/api/player', verifyToken, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const snap = await db.ref(`players/${req.user.uid}/state`).once('value');
    res.json(snap.val() || null);
});

app.post('/api/player', verifyToken, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { x, y, z, yaw, pitch } = req.body;
    if ([x, y, z, yaw, pitch].some(v => typeof v !== 'number')) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    await db.ref(`players/${req.user.uid}`).update({
        state:    { x, y, z, yaw, pitch },
        name:     req.user.name     ?? 'Unknown',
        photoURL: req.user.picture  ?? '',
        lastSeen: Date.now()
    });
    res.json({ ok: true });
});

// ─── REST: chunks ─────────────────────────────────────────────────────────────
// Key format: cx_cy_cz  (underscores, optional leading minus per component)
const CHUNK_KEY_RE = /^-?\d+_-?\d+_-?\d+$/;

app.get('/api/chunks/:key', (req, res) => {
    if (!CHUNK_KEY_RE.test(req.params.key)) return res.status(400).end();
    const file = path.join(CHUNKS_DIR, `${req.params.key}.json`);
    if (!fs.existsSync(file)) return res.status(404).end();
    res.sendFile(file);
});

app.post('/api/chunks/:key', express.json({ limit: '4mb' }), (req, res) => {
    if (!CHUNK_KEY_RE.test(req.params.key)) return res.status(400).end();
    const file = path.join(CHUNKS_DIR, `${req.params.key}.json`);
    fs.writeFile(file, JSON.stringify(req.body), err => {
        if (err) return res.status(500).end();
        res.status(204).end();
    });
});

// ─── Socket.io auth middleware ────────────────────────────────────────────────
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    // If Firebase Admin is unavailable, allow guest connections
    if (!admin) {
        socket.user = { uid: `guest_${socket.id}`, name: 'Guest', picture: '' };
        return next();
    }
    if (!token) return next(new Error('No token'));
    try {
        socket.user = await admin.auth().verifyIdToken(token);
        next();
    } catch {
        next(new Error('Invalid token'));
    }
});

// ─── Socket.io connections ────────────────────────────────────────────────────
// uid → { uid, name, photoURL, x, y, z, yaw, pitch }
const online = new Map();

io.on('connection', (socket) => {
    const uid      = socket.user.uid;
    const name     = socket.user.name     ?? 'Unknown';
    const photoURL = socket.user.picture  ?? '';

    console.log(`[+] ${name} (${uid}) connected`);

    // Send snapshot of everyone already online
    for (const [id, p] of online) {
        if (id !== uid) socket.emit('player:join', p);
    }

    // Add to online map
    online.set(uid, { uid, name, photoURL, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });

    // Announce arrival to others
    socket.broadcast.emit('player:join', { uid, name, photoURL });

    // Position update
    socket.on('player:move', (data) => {
        const { x, y, z, yaw, pitch } = data;
        if ([x, y, z, yaw, pitch].some(v => typeof v !== 'number')) return;
        const entry = online.get(uid);
        if (entry) Object.assign(entry, { x, y, z, yaw, pitch });
        socket.broadcast.emit('player:move', { uid, x, y, z, yaw, pitch });
    });

    // Disconnect
    socket.on('disconnect', () => {
        online.delete(uid);
        io.emit('player:leave', { uid });
        console.log(`[-] ${name} (${uid}) disconnected`);
    });
});

// ─── SPA fallback ───────────────────────────────────────────────────────────
// Must be after all API routes so it only catches unmatched routes
app.get('*', (req, res) => {
    const indexFile = path.join(DIST_DIR, 'index.html');
    if (!fs.existsSync(indexFile)) {
        return res.status(503).send('Frontend not built. Run: npm run build');
    }
    res.sendFile(indexFile);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Marching Cubes server running → http://localhost:${PORT}`);
});
