import { Noise } from '../noise.js';
import { CHUNK, ISO } from './worldConstants.js';

export const noise = new Noise(12345);

export function densityAt(wx: number, wy: number, wz: number): number {
    const scale = 0.035;
    const h = 14
        + noise.octave(wx * scale, 0, wz * scale, 5, 0.55, 2.1) * 22
        + noise.octave(wx * 0.008, 0, wz * 0.008, 2, 0.5, 2.0) * 20;
    return (h - wy) / 10.0;
}

export function seededRand(s: number): number {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    return ((s ^ (s >>> 16)) >>> 0) / 0xFFFFFFFF;
}

export function findSurfaceInChunk(wx: number, oy: number, wz: number): number | null {
    const bot = oy, top = oy + CHUNK;
    if (densityAt(wx, bot, wz) <= ISO) return null;
    if (densityAt(wx, top, wz) >  ISO) return null;
    let lo = bot, hi = top;
    for (let i = 0; i < 16; i++) {
        const mid = (lo + hi) * 0.5;
        if (densityAt(wx, mid, wz) > ISO) lo = mid; else hi = mid;
    }
    return hi;
}
