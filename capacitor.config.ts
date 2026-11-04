import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig & { androidScheme?: string } = {
  appId: 'ua.taxbook.app',
  appName: 'Книга обліку ФОП (№ 261)',
  webDir: 'dist',
  androidScheme: 'https',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#1E293B',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
