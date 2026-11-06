// Starts the game server: `npm run server` (PORT sets the port, 8787 by default).
// If the client has been built (npm run build -w @nexus/client), it's served too.

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accountsFromEnv } from './accounts.ts';
import { errorDetails, log, startLog } from './log.ts';
import { startServer } from './server.ts';

// Settings (Supabase keys) from the project's .env file, which git ignores.
const envFile = fileURLToPath(new URL('../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

// The log: the terminal and logs/server.log (connections, disconnects, errors, stuck bots).
const logFile = fileURLToPath(new URL('../../../logs/server.log', import.meta.url));
startLog({ file: logFile, console: true });
// An unexpected error is logged; the server keeps running so the other games go on.
process.on('uncaughtException', (e) => log('uncaught-exception', errorDetails(e)));
process.on('unhandledRejection', (e) => log('unhandled-rejection', errorDetails(e)));

const port = Number(process.env.PORT ?? 8787);
const staticDir = fileURLToPath(new URL('../../client/dist', import.meta.url));
const accounts = accountsFromEnv();
const server = await startServer({ port, staticDir, accounts });
console.log(`Project Nexus game server on port ${server.port} (WebSocket at /ws).`);
console.log(accounts ? 'Accounts: on (Supabase).' : 'Accounts: off (no SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env); guest play only.');
console.log(`Server log: ${logFile} (recent entries at /api/debug/log from this computer).`);
log('server-start', { port: server.port, accounts: !!accounts });
