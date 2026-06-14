import { defineConfig } from 'vite';

// In dev/preview the WebSocket server runs separately on :8080. Proxy /ws to it so
// the browser always connects to the same origin it loaded the page from — this works
// regardless of how the page is reached (localhost, a LAN IP, or a proxied preview URL).
// In production the static site is served elsewhere and VITE_WS_URL points at the API.
const wsProxy = {
  '/ws': { target: 'ws://localhost:8080', ws: true, changeOrigin: true },
};

export default defineConfig({
  server: { proxy: wsProxy },
  preview: { proxy: wsProxy },
});
