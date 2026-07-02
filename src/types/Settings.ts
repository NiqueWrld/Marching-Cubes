/** Game settings persisted in localStorage (see lib/settings.ts). */
export interface GameSettings {
    /** UID of the player these settings belong to (null when signed out). */
    uid?: string | null;
    /** Mouse look sensitivity multiplier (1 = default). */
    sensitivity: number;
    /** Camera field of view in degrees. */
    fov: number;
    /** Render shadows. */
    shadows: boolean;
    /** Show the debug HUD. */
    debugHud: boolean;
}