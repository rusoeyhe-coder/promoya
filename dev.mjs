// Arranca la API (wrangler dev, puerto 8788) y el panel (vite, puerto 3900) juntos.
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
process.chdir(dirname(fileURLToPath(import.meta.url)));
if (!existsSync('dist')) mkdirSync('dist');
const env = { ...process.env, NODE_OPTIONS: '--use-system-ca' };
const correr = (nombre, args) => {
  const p = spawn(process.execPath, args, { stdio: 'inherit', env });
  p.on('exit', (c) => { console.log(`[${nombre}] terminó (${c})`); process.exit(c ?? 0); });
  return p;
};
correr('api', ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', '8788', '--ip', '127.0.0.1', '--persist-to', '.wrangler/state']);
correr('panel', ['node_modules/vite/bin/vite.js']);
