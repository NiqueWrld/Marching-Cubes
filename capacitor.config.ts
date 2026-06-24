import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.zuluwars.app',
  appName: 'Zulu Wars',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
