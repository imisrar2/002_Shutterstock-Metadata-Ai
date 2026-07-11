import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// This config builds ONLY the Side Panel React app (sidepanel.html).
// The background service worker and content script are bundled separately
// via esbuild in scripts/build.mjs to keep them as single, import-free files,
// which is required for a Manifest V3 content script (classic script context)
// and keeps the background service worker lean and dependency-free.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src")
    }
  },
  build: {
    outDir: "dist",
    emptyOutDir: false,
    target: "esnext",
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, "sidepanel.html")
      },
      output: {
        entryFileNames: "src/sidepanel/[name].js",
        chunkFileNames: "src/sidepanel/chunks/[name]-[hash].js",
        assetFileNames: "src/sidepanel/assets/[name]-[hash][extname]"
      }
    }
  }
});
