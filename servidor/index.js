// Punto de entrada del Worker de Cloudflare: panel (archivos de dist/), API, seguimiento y el cron.
import { onRequest as api } from './api.js';
import { apertura, clic, baja } from './lib/seguimiento.js';
import { asegurarEsquema, leerConfig } from './lib/db.js';
import { tick } from './lib/motor.js';
import { privacidad, condiciones } from './lib/legales.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return api({ request, env, params: { ruta: pathname.slice(5).split('/').filter(Boolean) } });
    }
    let m;
    if ((m = pathname.match(/^\/o\/([^/]+)$/))) return apertura(env, m[1]);
    if ((m = pathname.match(/^\/l\/([^/]+)$/))) return clic(env, m[1]);
    if ((m = pathname.match(/^\/baja\/([^/]+)$/))) return baja(env, request, m[1]);
    if (pathname === '/privacidad') return privacidad(env);
    if (pathname === '/condiciones') return condiciones(env);
    return env.ASSETS.fetch(request);
  },

  // Cada 10 minutos: manda la tanda que toque, crea recordatorios, revisa rebotes y respuestas.
  async scheduled(evento, env) {
    await asegurarEsquema(env.DB);
    const base = env.BASE_URL || (await leerConfig(env.DB)).base_url;
    if (!base) return; // todavía nadie abrió el panel: no sabemos la dirección pública
    const r = await tick(env, env.DB, { base });
    console.log(JSON.stringify(r));
  },
};
