import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Cloudflare tunnel hostname (NO protocol, only hostname)
const TUNNEL_HOST =
  process.env.VITE_TUNNEL_HOST ||
  process.env.TUNNEL_HOSTNAME ||
  "jewelry-shopping-dreams-learned.trycloudflare.com";

// Backend URL for proxying API requests
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://localhost:4000";

export default defineConfig(() => ({
  plugins: [react()],
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@apps": path.resolve(__dirname, "src/apps"),
      "@shared": path.resolve(__dirname, "src/shared"),
      "@pages": path.resolve(__dirname, "src/pages"),
    },
    // Ensure only ONE copy of React is ever loaded, regardless of which
    // dependency pulls it in. Without this, Vite can bundle separate React
    // instances for app code vs. MUI/router deps, causing the
    // "Cannot read properties of null (reading 'useContext')" hook error.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  optimizeDeps: {
    // Pre-bundle React so it's always resolved from the same pre-built chunk.
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    cors: true,

    // Allow Cloudflare forwarded hostname
    allowedHosts: [TUNNEL_HOST],

    // Proxy API requests to backend
    proxy: {
      "/api": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
      },
      "/uploads": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
      },
      "/debug": {
        target: BACKEND_URL,
        changeOrigin: true,
        secure: false,
      },
    },

    // Fix websocket HMR over Cloudflare
    hmr: {
      protocol: "wss",
      host: TUNNEL_HOST,
      clientPort: 443,
    },
  },
}));
