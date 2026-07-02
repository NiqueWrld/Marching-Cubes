import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { firestore } from '../lib/firebase.js';
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from '../lib/settings.js';
import { useAuth } from './AuthContext.js';
import type { GameSettings } from '../types/Settings.js';

interface SettingsContextValue {
    settings: GameSettings;
    /** Update a single setting — persists and applies live to a running game. */
    update: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
    /** Restore all settings to their defaults. */
    reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue>({
    settings: DEFAULT_SETTINGS,
    update: () => {},
    reset: () => {},
});

/**
 * Game settings context — single source of truth for UI components.
 * Persists to localStorage, syncs to Firestore (`settings/{uid}`) for
 * signed-in players, and broadcasts the `quicklife:settings` event that
 * main.ts listens to, so changes apply live in-game.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [settings, setSettings] = useState<GameSettings>(loadSettings);
    const saveTimer = useRef<number | undefined>(undefined);

    // Stay in sync if another provider instance / tab changes the settings.
    useEffect(() => {
        const onChange = (e: Event) => setSettings((e as CustomEvent<GameSettings>).detail);
        window.addEventListener('quicklife:settings', onChange);
        return () => window.removeEventListener('quicklife:settings', onChange);
    }, []);

    // On sign-in, load the player's settings from Firestore (if any).
    useEffect(() => {
        if (!user?.uid) return;
        getDoc(doc(firestore, 'settings', user.uid)).then((snap) => {
            if (!snap.exists()) return;
            const remote = { ...DEFAULT_SETTINGS, ...(snap.data() as Partial<GameSettings>), uid: user.uid };
            setSettings(remote);
            saveSettings(remote); // localStorage + live-apply in game
        }).catch((err) => {
            console.warn('[Settings] Failed to load from Firestore:', err);
        });
    }, [user?.uid]);

    /** Debounced Firestore write — sliders fire many changes per second. */
    function persistRemote(next: GameSettings) {
        if (!user?.uid) return;
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
            setDoc(doc(firestore, 'settings', user.uid), next, { merge: true }).catch((err) => {
                console.warn('[Settings] Failed to save to Firestore:', err);
            });
        }, 800);
    }

    function update<K extends keyof GameSettings>(key: K, value: GameSettings[K]) {
        const next = { ...settings, [key]: value, uid: user?.uid ?? null };
        setSettings(next);
        saveSettings(next);
        persistRemote(next);
    }

    function reset() {
        const next = { ...DEFAULT_SETTINGS, uid: user?.uid ?? null };
        setSettings(next);
        saveSettings(next);
        persistRemote(next);
    }

    return (
        <SettingsContext.Provider value={{ settings, update, reset }}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    return useContext(SettingsContext);
}
