import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.niquewrld.quicklife',
    appName: 'QuickLife',
    // Placeholder only — the app loads server.url; nothing is bundled.
    webDir: 'www',
    server: {
        // Load the live site so the app always runs the latest deploy.
        url: 'https://zulu-wars.vercel.app',
        cleartext: false
    },
    android: {
        backgroundColor: '#030712'
    }
};

export default config;
