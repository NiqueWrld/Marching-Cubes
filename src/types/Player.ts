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
