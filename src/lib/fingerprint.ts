/**
 * Generates a stable, anonymous browser/device fingerprint.
 * Hashes a combination of navigator + screen + timezone signals.
 * Stored in localStorage so it persists across sessions on the same device.
 */

const STORAGE_KEY = 'zulu_device_fp';

async function hashString(str: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function collectSignals(): string {
    const n = navigator;
    const s = screen;
    return [
        n.userAgent,
        n.language,
        n.hardwareConcurrency,
        n.maxTouchPoints,
        s.width,
        s.height,
        s.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|');
}

export async function getFingerprint(): Promise<string> {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached;

    const fp = await hashString(collectSignals());
    localStorage.setItem(STORAGE_KEY, fp);
    return fp;
}
