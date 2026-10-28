import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Online games: the game server (npm run server) answers at /ws.
  server: { port: 5173, open: false, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
});
