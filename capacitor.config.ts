import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.finapulse.app', // (Pastikan ID anda betul)
  appName: 'Finance Pulse',
  webDir: 'out', // <--- INI MESTI 'out' BUKAN 'build' ATAU 'dist'
  server: {
    androidScheme: 'https'
  }
};

export default config;