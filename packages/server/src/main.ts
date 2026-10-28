// Starts the game server: `npm run server` (PORT sets the port, 8787 by default).
// If the client has been built (npm run build -w @nexus/client), it's served too.

import { fileURLToPath } from 'node:url';
import { startServer } from './server.ts';

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
const server = await startServer({ port, staticDir });
console.log(`Project Nexus game server on port ${server.port} (WebSocket at /ws).`);
