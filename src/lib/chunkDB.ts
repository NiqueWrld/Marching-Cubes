import type { ChunkData } from '../types/Chunk.js';

function encode(key: string): string { return key.replace(/,/g, '_'); }

export const ChunkDB = {
    open(): Promise<void> { return Promise.resolve(); },

    async get(key: string): Promise<ChunkData | null> {
        try {
            const res = await fetch(`/api/chunks/${encode(key)}`);
            if (!res.ok) return null;
            const data = await res.json() as ChunkData | null;
            return data ?? null;
        } catch {
            return null;
        }
    },

    put(key: string, value: ChunkData): Promise<Response | void> {
        return fetch(`/api/chunks/${encode(key)}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(value),
        }).catch(() => {});
    },
};
