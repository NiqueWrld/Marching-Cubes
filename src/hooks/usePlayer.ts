import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.js';
import type { Player, PlayerPosition } from '../types/Player.js';

interface UsePlayerResult {
    /** Fully resolved Player object, or null if not signed in / still loading */
    player: Player | null;
    /** True while auth or position is being fetched */
    loading: boolean;
    /** Number of players currently online (polled every 2 s) */
    onlineCount: number | null;
    /** Whether the current session is a spectator (duplicate login) */
    isSpectator: boolean;
    /** True when the Express API server is reachable */
    serverOnline: boolean;
}

export function usePlayer(): UsePlayerResult {
    const { user, loading: authLoading } = useAuth();
    const [position, setPosition]     = useState<PlayerPosition | null>(null);
    const [posLoading, setPosLoading]  = useState(false);
    const [onlineCount, setOnlineCount] = useState<number | null>(null);
    const [isSpectator, setIsSpectator] = useState(false);
    const [serverOnline, setServerOnline] = useState(true);

    // Check API reachability via /api/status (already exists on the server)
    useEffect(() => {
        let cancelled = false;

        async function check() {
            try {
                const res = await fetch('/api/status', { cache: 'no-store' });
                if (!cancelled) setServerOnline(res.ok);
            } catch {
                if (!cancelled) setServerOnline(false);
            }
        }

        check();
        const id = setInterval(check, 10_000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

    // Load server-saved position when user is available
    useEffect(() => {
        if (!user) { setPosition(null); return; }
        setPosLoading(true);
        user.getIdToken()
            .then(token =>
                fetch('/api/player', { headers: { Authorization: `Bearer ${token}` } })
            )
            .then(res => {
                if (!res.ok) return null;
                return res.json() as Promise<PlayerPosition | null>;
            })
            .then(pos => { setPosition(pos); })
            .catch(() => { setPosition(null); })
            .finally(() => { setPosLoading(false); });
    }, [user]);

    // Poll online player count and spectator flag from globals set by multiplayer.ts
    useEffect(() => {
        function read() {
            const g = window as unknown as { __playerCount__?: number; __spectator__?: boolean };
            setOnlineCount(g.__playerCount__ ?? null);
            setIsSpectator(g.__spectator__ === true);
        }
        read();
        const id = setInterval(read, 2000);
        return () => clearInterval(id);
    }, []);

    const player: Player | null = user
        ? {
            uid:         user.uid,
            displayName: user.displayName ?? 'Player',
            email:       user.email,
            photoURL:    user.photoURL,
            position:    position ?? { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 },
          }
        : null;

    return {
        player,
        loading: authLoading || posLoading,
        onlineCount,
        isSpectator,
        serverOnline,
    };
}

