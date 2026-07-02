import { useEffect, useState } from 'react';
import { ref, onValue } from 'firebase/database';
import { useAuth } from '../context/AuthContext.js';
import { database } from '../lib/firebase.js';
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
}

export function usePlayer(): UsePlayerResult {
    const { user, loading: authLoading } = useAuth();
    const [position, setPosition]     = useState<PlayerPosition | null>(null);
    const [posLoading, setPosLoading]  = useState(false);
    const [onlineCount, setOnlineCount] = useState<number | null>(null);
    const [isSpectator, setIsSpectator] = useState(false);

    // Subscribe to server-saved position in real-time via RTDB
    useEffect(() => {
        if (!user) { setPosition(null); setPosLoading(false); return; }
        setPosLoading(true);
        const posRef = ref(database, `players/${user.uid}/position`);
        const unsub = onValue(posRef, (snap) => {
            setPosition(snap.exists() ? (snap.val() as PlayerPosition) : null);
            setPosLoading(false);
        }, () => { setPosLoading(false); });
        return unsub;
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
    };
}

