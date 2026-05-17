import { useCallback } from 'react';

interface ChunkData {
    empty: boolean;
    verts?: number[];
    norms?: number[];
    cols?: number[];
}

function encodeKey(key: string): string {
    return key.replace(/,/g, '_');
}

export function useChunks() {
    const get = useCallback(async (cx: number, cy: number, cz: number): Promise<ChunkData | null> => {
        const key = encodeKey(`${cx},${cy},${cz}`);
        try {
            const res = await fetch(`/api/chunks/${key}`);
            if (!res.ok) return null;
            return await res.json() as ChunkData;
        } catch {
            return null;
        }
    }, []);

    const put = useCallback(async (cx: number, cy: number, cz: number, data: ChunkData): Promise<void> => {
        const key = encodeKey(`${cx},${cy},${cz}`);
        try {
            await fetch(`/api/chunks/${key}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });
        } catch {
            /* ignore network errors */
        }
    }, []);

    const remove = useCallback(async (cx: number, cy: number, cz: number): Promise<void> => {
        const key = encodeKey(`${cx},${cy},${cz}`);
        try {
            await fetch(`/api/chunks/${key}`, { method: 'DELETE' });
        } catch {
            /* ignore */
        }
    }, []);

    return { get, put, remove };
}
