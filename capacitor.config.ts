import type { CapacitorConfig } from '@capacitor/cli';

// Configuration Capacitor pour le build mobile
// En production hors-ligne, Capacitor charge directement les fichiers locaux préchargés dans le dossier 'dist'.
// Si vous souhaitez forcer le chargement de l'URL Firebase en ligne pendant le développement, définissez la variable d'environnement CAPACITOR_LIVE_RELOAD=true
const isLiveReload = process.env.CAPACITOR_LIVE_RELOAD === 'true';

const config: CapacitorConfig = {
  appId: 'com.siad.antigravity',
  appName: 'Antigravity Projector',
  webDir: 'dist',
  ...(isLiveReload ? {
    server: {
      url: 'https://minou-darts-v1.web.app',
      cleartext: true
    }
  } : {})
};

export default config;
