/**
 * Player position — persisted to the Firebase Realtime Database at
 * `players/{uid}/position` (autosaved every 2 s by main.ts and on unload,
 * loaded back on game start). Live multiplayer positions are published
 * separately to `presence/{uid}`.
 */
export interface PlayerPosition {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
}

export interface Player {
    uid: string;
    displayName: string;
    email: string | null;
    photoURL: string | null;
    position: PlayerPosition;
}
