import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.abelanand.fitlog',
  appName: 'SplitLog',
  webDir: 'dist',
  backgroundColor: '#0b0d10',
  ios: {
    contentInset: 'never',
    scheme: 'SplitLog',
  },
  android: {
    // The bundle is served from the app's assets; nothing is loaded from the network.
    allowMixedContent: false,
    backgroundColor: '#0b0d10',
  },
  plugins: {
    StatusBar: { style: 'DARK', overlaysWebView: true },
    Keyboard: { resize: 'native' },
    // Android: the web view goes edge-to-edge and env(safe-area-inset-*) carries the real bar
    // heights (WebView 140+), so the CSS written for the iPhone works unchanged. Older WebViews are
    // padded by Capacitor instead and the insets read 0.
    SystemBars: { insetsHandling: 'native', initialViewportFitValueHint: 'cover', style: 'DARK' },
    LocalNotifications: { smallIcon: 'ic_stat_splitlog', iconColor: '#C6F135' },
  },
}

export default config
