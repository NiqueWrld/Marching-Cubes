/**
 * gameSession.ts
 *
 * Firestore-backed role management: determines whether this device is a
 * "player" or a "spectator" for the current authenticated user.
 *
 * Firestore path:  sessions/{uid}/devices/{fingerprint}
 * Fields:
 *   fingerprint, role, active, lastSeen, userAgent
 *
 * Logic:
 *   - On claim, run a transaction: if any OTHER device for this uid has
 *     role === 'player' and active === true and lastSeen within 30 s → spectator.
 *   - Otherwise → player.
 *   - On unload → mark active = false.
 */

import {
    doc, getDoc, setDoc, runTransaction,
    serverTimestamp, Timestamp, collection, getDocs,
} from 'firebase/firestore';
import { firestore } from './firebase.js';

export type GameRole = 'player' | 'spectator';

// ── Module-level promise so non-React code (main.ts) can await the role ───────
let _resolveRole!: (role: GameRole) => void;
export const whenRoleKnown: Promise<GameRole> = new Promise(res => { _resolveRole = res; });
export let currentRole: GameRole | null = null;

/** Resolve as anonymous 'player' when the user isn't signed in (no Firestore claim). */
export function resolveAnonymousRole(): GameRole {
    if (currentRole) return currentRole;
    currentRole = 'player';
    _resolveRole('player');
    return 'player';
}

/** How many seconds before a session is considered stale / abandoned */
const STALE_SECONDS = 30;

function isStale(lastSeen: Timestamp | null): boolean {
    if (!lastSeen) return true;
    return (Date.now() / 1000 - lastSeen.seconds) > STALE_SECONDS;
}

/**
 * Claim a role for this device. Resolves the module-level `whenRoleKnown`
 * promise so that main.ts can await it.
 */
export async function claimRole(uid: string, fingerprint: string): Promise<GameRole> {
    const devicesRef = collection(firestore, 'sessions', uid, 'devices');
    const thisRef    = doc(devicesRef, fingerprint);

    let role: GameRole = 'player';

    await runTransaction(firestore, async (tx) => {
        const snap = await getDocs(devicesRef);

        // Check if any other device already holds an active player role
        const hasActivePlayer = snap.docs.some(d => {
            if (d.id === fingerprint) return false;
            const data = d.data();
            return data.role === 'player'
                && data.active === true
                && !isStale(data.lastSeen as Timestamp | null);
        });

        role = hasActivePlayer ? 'spectator' : 'player';

        tx.set(thisRef, {
            fingerprint,
            uid,
            role,
            active:    true,
            lastSeen:  serverTimestamp(),
            userAgent: navigator.userAgent,
        }, { merge: true });
    });

    // Keep lastSeen fresh while the tab is open
    const heartbeat = setInterval(() => {
        setDoc(thisRef, { lastSeen: serverTimestamp(), active: true }, { merge: true })
            .catch(() => {/* ignore */});
    }, 10_000);

    // Release the role on tab close
    window.addEventListener('beforeunload', () => {
        clearInterval(heartbeat);
        // Use sendBeacon-friendly approach — best-effort
        navigator.sendBeacon?.('/api/noop'); // just to flush; actual cleanup below
        setDoc(thisRef, { active: false }, { merge: true }).catch(() => {/* ignore */});
    });

    currentRole = role;
    (window as unknown as Record<string, unknown>).__spectator__ = (role as string) === 'spectator';
    _resolveRole(role);
    return role;
}
