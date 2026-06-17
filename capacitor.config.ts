// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.financepulse.app',
  appName: 'FinaPulse',
  webDir: 'out', // Ini mesti sama dengan nama folder yang terhasil selepas 'npm run build'
  server: {
    androidScheme: 'https'
  }
};

export default config;