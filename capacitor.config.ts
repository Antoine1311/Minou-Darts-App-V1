import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.siad.antigravity',
  appName: 'Antigravity Projector',
  webDir: 'dist',
  server: {
    url: 'https://minou-darts-v1.web.app',
    cleartext: true
  }
};

export default config;
