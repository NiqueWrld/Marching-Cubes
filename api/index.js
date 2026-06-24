require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const fs         = require('fs');

// Ensure chunks directory exists
const CHUNKS_DIR = path.join(__dirname, '..', 'chunks');
if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR);

// ─── Firebase Admin (optional – needed for auth & DB) ────────────────────────
let admin = null;
let db    = null;
try {
    admin = require('firebase-admin');
    const serviceAccount = require('../serviceAccountKey.json');
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

// Serve built frontend (production only — in dev, Vite serves the frontend)
const DIST_DIR = path.join(__dirname, '..', 'dist');
if (process.env.NODE_ENV !== 'development') {
    app.use(express.static(DIST_DIR, { redirect: false }));
}

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
    try {
        const snap = await db.ref(`players/${req.user.uid}/state`).once('value');
        res.json(snap.val() || null);
    } catch (err) {
        console.error('[GET /api/player]', err);
        res.status(500).json({ error: 'Database error' });
    }
});

app.post('/api/player', verifyToken, async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Database not configured' });
    const { x, y, z, yaw, pitch } = req.body;
    if ([x, y, z, yaw, pitch].some(v => typeof v !== 'number')) {
        return res.status(400).json({ error: 'Invalid body' });
    }
    try {
        await db.ref(`players/${req.user.uid}`).update({
            state:    { x, y, z, yaw, pitch },
            name:     req.user.name     ?? 'Unknown',
            photoURL: req.user.picture  ?? '',
            lastSeen: Date.now()
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('[POST /api/player]', err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── REST: chunks ─────────────────────────────────────────────────────────────
const CHUNK_KEY_RE = /^-?\d+_-?\d+_-?\d+$/;

app.get('/api/chunks/:key', (req, res) => {
    if (!CHUNK_KEY_RE.test(req.params.key)) return res.status(400).end();
    const file = path.join(CHUNKS_DIR, `${req.params.key}.json`);
    if (!fs.existsSync(file)) return res.json(null);
    res.sendFile(file, err => {
        if (err && !res.headersSent) {
            console.error('[GET /api/chunks]', err);
            res.status(500).end();
        }
    });
});

app.post('/api/chunks/:key', express.json({ limit: '4mb' }), (req, res) => {
    if (!CHUNK_KEY_RE.test(req.params.key)) return res.status(400).end();
    const file = path.join(CHUNKS_DIR, `${req.params.key}.json`);
    fs.writeFile(file, JSON.stringify(req.body), err => {
        if (err) { console.error('[POST /api/chunks]', err); return res.status(500).end(); }
        res.status(204).end();
    });
});

// ─── Socket.io auth middleware ────────────────────────────────────────────────
io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
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
const online    = new Map(); // uid → player state
const uidSockets = new Map(); // uid → Set<socketId>

io.on('connection', (socket) => {
    const uid      = socket.user.uid;
    const name     = socket.user.name     ?? 'Unknown';
    const photoURL = socket.user.picture  ?? '';

    console.log(`[+] ${name} (${uid}) connected [${socket.id}]`);

    socket.on('error', (err) => {
        console.error(`[Socket error] ${name} (${uid}) [${socket.id}]`, err);
    });
    socket.on('disconnect', (reason) => {
        console.log(`[~] ${name} (${uid}) [${socket.id}] disconnect reason: ${reason}`);
    });

    if (!uidSockets.has(uid)) uidSockets.set(uid, new Set());
    uidSockets.get(uid).add(socket.id);

    const alreadyOnline = online.has(uid);

    for (const [id, p] of online) {
        if (id !== uid) socket.emit('player:join', p);
    }

    if (alreadyOnline) {
        const primary = online.get(uid);
        socket.emit('spectator', {
            reason: 'Already connected on another device',
            x: primary?.x ?? 0,
            y: primary?.y ?? 0,
            z: primary?.z ?? 0,
            yaw: primary?.yaw ?? 0,
            pitch: primary?.pitch ?? 0,
        });
        console.log(`[S] ${name} (${uid}) joined as spectator on [${socket.id}]`);
    }

    online.set(uid, { uid, name, photoURL, x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });

    if (!alreadyOnline) {
        socket.broadcast.emit('player:join', { uid, name, photoURL });
    }

    socket.on('player:move', (data) => {
        const { x, y, z, yaw, pitch } = data;
        if ([x, y, z, yaw, pitch].some(v => typeof v !== 'number')) return;
        const entry = online.get(uid);
        if (entry) Object.assign(entry, { x, y, z, yaw, pitch });
        socket.broadcast.emit('player:move', { uid, x, y, z, yaw, pitch });
    });

    socket.on('disconnect', () => {
        const sockets = uidSockets.get(uid);
        if (sockets) {
            sockets.delete(socket.id);
            if (sockets.size === 0) {
                uidSockets.delete(uid);
                online.delete(uid);
                io.emit('player:leave', { uid });
                console.log(`[-] ${name} (${uid}) fully disconnected`);
            } else {
                console.log(`[-] ${name} (${uid}) disconnected one device, ${sockets.size} remaining`);
            }
        }
    });
});

// ─── SPA fallback (production only) ──────────────────────────────────────────
if (process.env.NODE_ENV !== 'development') {
    app.get('*', (req, res) => {
        const indexFile = path.join(DIST_DIR, 'index.html');
        if (!fs.existsSync(indexFile)) {
            return res.status(503).send('Frontend not built. Run: npm run build');
        }
        res.sendFile(indexFile);
    });
}

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error(`[Express error] ${req.method} ${req.originalUrl}`, err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

// Log every non-2xx response so we can spot silent 4xx/5xx from the client
app.use((req, res, next) => {
    res.on('finish', () => {
        if (res.statusCode >= 400) {
            console.warn(`[HTTP ${res.statusCode}] ${req.method} ${req.originalUrl}`);
        }
    });
    next();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Unhandled rejection]', reason);
    if (reason && reason.stack) console.error(reason.stack);
});
process.on('uncaughtException', (err) => {
    console.error('[Uncaught exception]', err);
});
process.on('warning', (w) => {
    console.warn('[Node warning]', w.name, w.message);
});

io.engine.on('connection_error', (err) => {
    console.error('[Socket.io connection error]', err.code, err.message, err.context);
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Zulu Wars server running → http://localhost:${PORT}`);
});
