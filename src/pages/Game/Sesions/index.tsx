import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { firestore } from '../../../lib/firebase.js';
import { getFingerprint } from '../../../lib/fingerprint.js';
import { useAuth } from '../../../context/AuthContext.js';
import ROUTES from '../../../lib/routes.js';

interface DeviceSessionDoc {
    id: string;
    fingerprint: string;
    role?: 'player' | 'spectator';
    active?: boolean;
    lastSeen?: Timestamp | null;
    userAgent?: string;
}

function timeAgo(ts?: Timestamp | null): string {
    if (!ts) return 'never';
    const s = Math.max(0, Math.floor(Date.now() / 1000 - ts.seconds));
    if (s < 60)    return `${s}s ago`;
    if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function deviceLabel(ua?: string): string {
    if (!ua) return 'Unknown device';
    const os =
        /Android/i.test(ua)              ? 'Android' :
        /iPhone|iPad|iPod/i.test(ua)     ? 'iOS' :
        /Windows/i.test(ua)              ? 'Windows' :
        /Mac OS/i.test(ua)               ? 'macOS' :
        /Linux/i.test(ua)                ? 'Linux' : 'Unknown OS';
    const browser =
        /Edg\//i.test(ua)                ? 'Edge' :
        /Chrome\//i.test(ua)             ? 'Chrome' :
        /Firefox\//i.test(ua)            ? 'Firefox' :
        /Safari\//i.test(ua)             ? 'Safari' : 'Browser';
    return `${browser} on ${os}`;
}

export default function Sessions() {
    const { user } = useAuth();
    const [sessions, setSessions] = useState<DeviceSessionDoc[]>([]);
    const [thisFp, setThisFp]     = useState<string | null>(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    useEffect(() => {
        getFingerprint().then(setThisFp).catch(() => {});
    }, []);

    useEffect(() => {
        if (!user?.uid) return;
        const ref = collection(firestore, 'sessions', user.uid, 'devices');
        const unsub = onSnapshot(ref, (snap) => {
            setSessions(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<DeviceSessionDoc, 'id'>) })));
            setLoading(false);
        }, (err) => {
            setError(err.message);
            setLoading(false);
        });
        return unsub;
    }, [user?.uid]);

    return (
        <div className="min-h-screen bg-gray-950 text-white p-6">
            <div className="max-w-2xl mx-auto flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold">Sessions</h1>
                    <Link to={ROUTES.GAME} className="text-sm text-gray-400 hover:text-white">← Back to game</Link>
                </div>
                <p className="text-sm text-gray-400">
                    Devices that have joined the game with your account. The active player holds the
                    player role — other devices join as spectators.
                </p>

                {loading && <p className="text-gray-500 text-sm">Loading…</p>}
                {error && <p className="text-red-400 text-sm">Error: {error}</p>}
                {!loading && !error && sessions.length === 0 && (
                    <p className="text-gray-500 text-sm">No sessions yet.</p>
                )}

                <div className="flex flex-col gap-3">
                    {sessions.map((s) => (
                        <div
                            key={s.id}
                            className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center justify-between gap-4"
                        >
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{deviceLabel(s.userAgent)}</span>
                                    {s.id === thisFp && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 border border-blue-500/30">
                                            This device
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 truncate mt-0.5">
                                    {s.fingerprint?.slice(0, 16)}… · last seen {timeAgo(s.lastSeen)}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <span className={`w-2 h-2 rounded-full ${s.active ? 'bg-green-400' : 'bg-gray-600'}`} />
                                <span className={`text-xs px-2 py-1 rounded-full border ${
                                    s.role === 'player'
                                        ? 'text-green-300 border-green-500/30 bg-green-600/10'
                                        : 'text-amber-300 border-amber-500/30 bg-amber-600/10'
                                }`}>
                                    {s.role ?? 'unknown'}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}