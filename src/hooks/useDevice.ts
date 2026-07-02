import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { firestore } from '../lib/firebase.js';
import { getFingerprint } from '../lib/fingerprint.js';
import { device } from '../lib/isMobile.js';
import { claimRole, resolveAnonymousRole } from '../lib/gameSession.js';
import { useAuth } from '../context/AuthContext.js';
import type { Device } from '../types/Device.js';
import type { GameRole } from '../lib/gameSession.js';

export interface DeviceSession {
    fingerprint: string;
    registered: boolean;
    role: GameRole | null;
    device: Device;
}

/**
 * On mount, generates a device fingerprint, upserts the device document in
 * Firestore, and claims a game role (player / spectator) for the current user.
 */
export function useDevice(): DeviceSession | null {
    const { user } = useAuth();
    const [session, setSession] = useState<DeviceSession | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function register() {
            const fingerprint = await getFingerprint();
            if (cancelled) return;

            // Register device metadata
            const docRef = doc(firestore, 'devices', fingerprint);
            await setDoc(docRef, {
                fingerprint,
                uid:           user?.uid ?? null,
                type:          device.type,
                isMobile:      device.isMobile,
                isTablet:      device.isTablet,
                isDesktop:     device.isDesktop,
                isTouchScreen: device.isTouchScreen,
                screenWidth:   device.screenWidth,
                screenHeight:  device.screenHeight,
                userAgent:     navigator.userAgent,
                language:      navigator.language,
                timezone:      Intl.DateTimeFormat().resolvedOptions().timeZone,
                lastSeen:      serverTimestamp(),
            }, { merge: true });
            await setDoc(docRef, { createdAt: serverTimestamp() }, { merge: true });

            // Claim player / spectator role if user is signed in,
            // otherwise resolve immediately as an anonymous player so the
            // game can start without auth.
            let role: GameRole | null = null;
            if (user?.uid) {
                role = await claimRole(user.uid, fingerprint);
            } else {
                role = resolveAnonymousRole();
            }

            if (!cancelled) {
                setSession({ fingerprint, registered: true, role, device });
            }
        }

        register().catch(err => {
            console.warn('[useDevice] Failed to register device:', err);
        });

        return () => { cancelled = true; };
    }, [user?.uid]);

    // Watch this device's role — if it's changed remotely (e.g. the player
    // role was handed to/away from this device on the Sessions page),
    // reload so the game restarts with the new role.
    useEffect(() => {
        if (!user?.uid || !session?.fingerprint || !session.role) return;
        const ownRef = doc(firestore, 'sessions', user.uid, 'devices', session.fingerprint);
        return onSnapshot(ownRef, (snap) => {
            const role = snap.data()?.role as GameRole | undefined;
            if (role && role !== session.role) {
                window.location.reload();
            }
        });
    }, [user?.uid, session?.fingerprint, session?.role]);

    return session;
}
