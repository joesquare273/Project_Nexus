import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Online games: the game server (npm run server) answers at /ws.
  server: { port: 5173, open: false, proxy: { '/ws': { target: 'ws://localhost:8787', ws: true }, '/api': 'http://localhost:8787' } },
  // The browser's Supabase settings (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) come from the project's .env.
  envDir: '../..',
});
