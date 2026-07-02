/**
 * Generates a stable, anonymous browser/device fingerprint using FingerprintJS.
 * Stored in localStorage so it persists across sessions on the same device.
 */
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const STORAGE_KEY = 'zulu_device_fp';

export async function getFingerprint(): Promise<string> {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached) return cached;

    const agent  = await FingerprintJS.load();
    const result = await agent.get();
    localStorage.setItem(STORAGE_KEY, result.visitorId);
    return result.visitorId;
}
