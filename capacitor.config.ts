import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.abelanand.fitlog',
  appName: 'FitLog',
  webDir: 'dist',
  backgroundColor: '#0b0d10',
  ios: {
    contentInset: 'never',
    scheme: 'FitLog',
  },
  plugins: {
    StatusBar: { style: 'DARK', overlaysWebView: true },
    Keyboard: { resize: 'native' },
  },
}

export default config
