import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from '../lib/firebase.js';
import { getFingerprint } from '../lib/fingerprint.js';
import { device } from '../lib/isMobile.js';
import { claimRole } from '../lib/gameSession.js';
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

            // Claim player / spectator role if user is signed in
            let role: GameRole | null = null;
            if (user?.uid) {
                role = await claimRole(user.uid, fingerprint);
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

    return session;
}
