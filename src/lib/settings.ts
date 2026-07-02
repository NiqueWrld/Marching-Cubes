/**
 * Game settings persisted in localStorage.
 * Read by main.ts at startup and live where possible.
 */

export interface GameSettings {
    /** Mouse look sensitivity multiplier (1 = default). */
    sensitivity: number;
    /** Camera field of view in degrees. */
    fov: number;
    /** Render shadows. */
    shadows: boolean;
    /** Show the debug HUD. */
    debugHud: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
    sensitivity: 1,
    fov: 75,
    shadows: true,
    debugHud: false,
};

const STORAGE_KEY = 'quicklife_settings';

export function loadSettings(): GameSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) as Partial<GameSettings> };
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveSettings(settings: GameSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // Let a running game instance pick up changes immediately.
    window.dispatchEvent(new CustomEvent('quicklife:settings', { detail: settings }));
}
