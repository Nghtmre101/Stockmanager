// Plain client-side Vite SPA configuration.
//
// The app is now a 100% offline-first static SPA: no TanStack Start, no Nitro,
// no dev/prod server. It is built to `dist/` and loaded directly from local
// files by Electron (Windows) or Capacitor (Android).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  // Relative base so the bundle works when opened from the filesystem
  // (file:// in Electron, capacitor://localhost on Android).
  base: "./",
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    // Regenerates src/routeTree.gen.ts from the file-based routes in src/routes.
    TanStackRouterVite({
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: { port: 5173 },
  preview: { port: 4173 },
});