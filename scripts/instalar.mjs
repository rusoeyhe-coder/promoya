// Instalación desde la PC (para quien no usa el botón de GitHub).
// Requisitos: Node.js 20 o más nuevo y una cuenta gratis de Cloudflare.
// Uso:  npm install   y después   npm run instalar
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const wrangler = (args, opciones = {}) => spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { stdio: 'inherit', ...opciones });
const preguntar = async (txt) => { const rl = createInterface({ input: process.stdin, output: process.stdout }); const r = await rl.question(txt); rl.close(); return r.trim(); };

console.log('\n1/4  Armando el panel…');
if (spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' }).status) process.exit(1);

console.log('\n2/4  Entrá a tu cuenta de Cloudflare (se abre el navegador)…');
const quien = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'whoami'], { encoding: 'utf8' });
if (!/logged in/i.test(quien.stdout || '')) wrangler(['login']);

console.log('\n3/4  Publicando (la primera vez crea tu base de datos)…');
if (wrangler(['deploy']).status) process.exit(1);

console.log('\n4/4  Código de instalación');
const codigo = await preguntar('Tu nombre artístico (es tu usuario para entrar al panel): ');
if (codigo) wrangler(['secret', 'put', 'NOMBRE_ARTISTICO'], { input: codigo, stdio: ['pipe', 'inherit', 'inherit'] });

console.log('\nListo. Abrí la dirección que aparece arriba (termina en .workers.dev), entrá con tu nombre artístico, elegí tu contraseña y seguí los «Primeros pasos».\n');
