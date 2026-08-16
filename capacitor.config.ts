import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.cosmetiqueabdou.app",
  appName: "Stock Manager",
  // The plain Vite SPA build output — loaded locally by the WebView, no server.
  webDir: "dist",
  android: {
    allowMixedContent: true,
  },
  server: {
    androidScheme: "https",
  },
};

export default config;