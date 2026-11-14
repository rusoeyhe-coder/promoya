// Aperturas (píxel), clics (link rastreado) y bajas.
import { asegurarEsquema, uno, ejec, registrarEvento } from './db.js';
import { escaparHtml } from './util.js';

// Los antivirus de algunos correos abren/tocan todo apenas llega: lo que pasa en los primeros segundos no cuenta.
const MARGEN_BOT = 8000;

async function buscar(db, tok) {
  if (!/^[A-Za-z0-9]{6,40}$/.test(tok || '')) return null;
  return uno(db, `SELECT e.*, c.link FROM envios e JOIN campanias c ON c.id = e.campania_id WHERE e.token = ?`, tok);
}

const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), (c) => c.charCodeAt(0));

export async function apertura(env, tok) {
  const db = env.DB;
  await asegurarEsquema(db);
  const e = await buscar(db, tok.replace(/\.gif$/, ''));
  if (e && e.enviado && Date.now() - e.enviado > MARGEN_BOT) {
    await ejec(db, 'UPDATE envios SET abierto = COALESCE(abierto, ?), aperturas = aperturas + 1 WHERE id = ?', Date.now(), e.id);
    if (!e.abierto) await registrarEvento(db, { envio_id: e.id, contacto_id: e.contacto_id, campania_id: e.campania_id, tipo: 'apertura' });
  }
  return new Response(GIF, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store, no-cache, must-revalidate, max-age=0' } });
}

export async function clic(env, tok) {
  const db = env.DB;
  await asegurarEsquema(db);
  const e = await buscar(db, tok);
  if (!e) return new Response('Link vencido', { status: 404 });
  if (e.enviado && Date.now() - e.enviado > MARGEN_BOT) {
    const t = Date.now();
    // Si tocó el link, seguro lo abrió (aunque su correo bloquee las imágenes)
    await ejec(db, 'UPDATE envios SET clic = COALESCE(clic, ?), clics = clics + 1, abierto = COALESCE(abierto, ?) WHERE id = ?', t, t, e.id);
    if (!e.clic) await registrarEvento(db, { envio_id: e.id, contacto_id: e.contacto_id, campania_id: e.campania_id, tipo: 'clic' });
    if (!e.abierto) await registrarEvento(db, { envio_id: e.id, contacto_id: e.contacto_id, campania_id: e.campania_id, tipo: 'apertura', detalle: 'por el clic' });
  }
  return Response.redirect(e.link, 302);
}

const pagina = (titulo, contenido) => new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${titulo}</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0b;color:#eee;font:16px/1.5 system-ui,Arial,sans-serif;padding:16px;box-sizing:border-box}
.c{max-width:420px;text-align:center}h1{font-size:22px;margin:0 0 10px}p{color:#aaa}button{background:#ff6a00;color:#000;border:0;border-radius:6px;padding:12px 20px;font-weight:700;font-size:15px;cursor:pointer}</style></head>
<body><div class="c">${contenido}</div></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });

export async function baja(env, request, tok) {
  const db = env.DB;
  await asegurarEsquema(db);
  const e = await buscar(db, tok);
  if (!e) return pagina('Link vencido', '<h1>Link vencido</h1><p>Este link ya no es válido.</p>');
  const ct = await uno(db, 'SELECT * FROM contactos WHERE id = ?', e.contacto_id);
  // GET solo muestra el botón (así los antivirus que abren links no dan de baja a nadie). POST da de baja.
  if (request.method !== 'POST') {
    if (ct?.estado === 'baja') return pagina('Listo', '<h1>Ya estás dado de baja</h1><p>No vas a recibir más promos.</p>');
    return pagina('Dejar de recibir promos', `<h1>¿Dejar de recibir las promos?</h1><p>${escaparHtml(ct?.email || '')}</p>
<form method="post"><button>Sí, darme de baja</button></form>`);
  }
  if (ct && ct.estado !== 'baja') {
    await ejec(db, "UPDATE contactos SET estado = 'baja', actualizado = ? WHERE id = ?", Date.now(), ct.id);
    await ejec(db, "UPDATE envios SET estado = 'cancelado' WHERE contacto_id = ? AND estado = 'pendiente'", ct.id);
    await registrarEvento(db, { envio_id: e.id, contacto_id: ct.id, campania_id: e.campania_id, tipo: 'baja' });
  }
  return pagina('Listo', '<h1>Listo</h1><p>No vas a recibir más promos. ¡Gracias por haber escuchado!</p>');
}
