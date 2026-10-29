// Starts the game server: `npm run server` (PORT sets the port, 8787 by default).
// If the client has been built (npm run build -w @nexus/client), it's served too.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accountsFromEnv } from './accounts.ts';
import { startServer } from './server.ts';

// Settings (Supabase keys) from the project's .env file, which git ignores.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
const accounts = accountsFromEnv();
const server = await startServer({ port, staticDir, accounts });
console.log(`Project Nexus game server on port ${server.port} (WebSocket at /ws).`);
console.log(accounts ? 'Accounts: on (Supabase).' : 'Accounts: off (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env); guest play only.');
