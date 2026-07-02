import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.niquewrld.quicklife',
    appName: 'QuickLife',
    // Loader page in www/ probes localhost:3000 and falls back to production.
    webDir: 'www',
    server: {
        androidScheme: 'http',
        cleartext: true,
        allowNavigation: ['localhost', 'zulu-wars.vercel.app']
    },
    android: {
        backgroundColor: '#030712'
    }
};

export default config;
