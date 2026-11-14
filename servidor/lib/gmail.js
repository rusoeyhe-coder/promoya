// Conexión con el Gmail del proyecto: permiso (OAuth), envío, rebotes y respuestas.
import { leerConfig, guardarConfig, todos, uno, ejec, registrarEvento } from './db.js';
import { token } from './util.js';

const ALCANCES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly', // para detectar rebotes y respuestas
  'openid', 'email',
].join(' ');

// Las claves del cliente OAuth de Google: de los secretos del servidor o de los Ajustes (guardadas en tu propia base).
export const credenciales = (env, c = {}) => ({ id: env.GOOGLE_CLIENT_ID || c.google_client_id || '', secreto: env.GOOGLE_CLIENT_SECRET || c.google_client_secret || '' });
export const gmailConfigurado = (env, c) => { const k = credenciales(env, c); return Boolean(k.id && k.secreto); };

export async function urlConsentimiento(env, db, base) {
  const estado = token(20);
  const k = credenciales(env, await leerConfig(db));
  await guardarConfig(db, 'gmail_estado', estado);
  const p = new URLSearchParams({
    client_id: k.id,
    redirect_uri: `${base}/api/gmail/vuelta`,
    response_type: 'code',
    scope: ALCANCES,
    access_type: 'offline',
    prompt: 'consent',
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function completarConexion(env, db, base, code, estado) {
  const c = await leerConfig(db);
  if (!estado || estado !== c.gmail_estado) throw new Error('El permiso venció, probá conectar de nuevo.');
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: credenciales(env, c).id, client_secret: credenciales(env, c).secreto,
      redirect_uri: `${base}/api/gmail/vuelta`, grant_type: 'authorization_code',
    }),
  });
  const t = await r.json();
  if (!r.ok || !t.refresh_token) throw new Error(t.error_description || t.error || 'Google no devolvió el permiso.');
  const perfil = await (await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { authorization: `Bearer ${t.access_token}` },
  })).json();
  await guardarConfig(db, 'gmail_refresh', t.refresh_token);
  await guardarConfig(db, 'gmail_acceso', t.access_token);
  await guardarConfig(db, 'gmail_vence', Date.now() + (t.expires_in - 120) * 1000);
  await guardarConfig(db, 'gmail_email', perfil.emailAddress || '');
  await guardarConfig(db, 'gmail_estado', '');
  return perfil.emailAddress;
}

export async function desconectar(db) {
  for (const k of ['gmail_refresh', 'gmail_acceso', 'gmail_vence', 'gmail_email']) await guardarConfig(db, k, '');
}

async function tokenAcceso(env, db) {
  const c = await leerConfig(db);
  if (!c.gmail_refresh) throw new Error('Gmail no está conectado');
  if (c.gmail_acceso && Number(c.gmail_vence) > Date.now()) return c.gmail_acceso;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credenciales(env, c).id, client_secret: credenciales(env, c).secreto,
      refresh_token: c.gmail_refresh, grant_type: 'refresh_token',
    }),
  });
  const t = await r.json();
  if (!r.ok) {
    if (t.error === 'invalid_grant') await guardarConfig(db, 'gmail_refresh', ''); // permiso revocado
    throw new Error('Gmail: ' + (t.error_description || t.error));
  }
  await guardarConfig(db, 'gmail_acceso', t.access_token);
  await guardarConfig(db, 'gmail_vence', Date.now() + (t.expires_in - 120) * 1000);
  return t.access_token;
}

async function api(env, db, ruta, opciones = {}) {
  const acceso = await tokenAcceso(env, db);
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${ruta}`, {
    ...opciones,
    headers: { authorization: `Bearer ${acceso}`, 'content-type': 'application/json', ...(opciones.headers || {}) },
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error?.message || `Gmail respondió ${r.status}`);
  return d;
}

export const enviarRaw = (env, db, raw) =>
  api(env, db, 'messages/send', { method: 'POST', body: JSON.stringify({ raw }) });

// Revisa los rebotes (mailer-daemon) y las respuestas de los contactos. Corre como mucho 1 vez por hora.
export async function revisarBandeja(env, db, { forzar = false } = {}) {
  const c = await leerConfig(db);
  if (!c.gmail_refresh) return { rebotes: 0, respuestas: 0 };
  if (!forzar && Number(c.gmail_revisado || 0) > Date.now() - 3600e3) return { salteado: true };
  await guardarConfig(db, 'gmail_revisado', Date.now());
  const yo = (c.gmail_email || '').toLowerCase();
  let rebotes = 0, respuestas = 0;

  const listar = async (q) => (await api(env, db, `messages?maxResults=50&q=${encodeURIComponent(q)}`)).messages || [];
  const yaVisto = async (id) => Boolean(await uno(db, 'SELECT id FROM gmail_vistos WHERE id = ?', id));
  const marcar = (id) => ejec(db, 'INSERT OR IGNORE INTO gmail_vistos (id, ts) VALUES (?, ?)', id, Date.now());

  // Rebotes
  for (const m of await listar('from:(mailer-daemon OR postmaster) newer_than:4d')) {
    if (await yaVisto(m.id)) continue;
    const full = await api(env, db, `messages/${m.id}?format=full`);
    const cab = Object.fromEntries((full.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    let candidatos = [];
    if (cab['x-failed-recipients']) candidatos = cab['x-failed-recipients'].split(',');
    else candidatos = (textoDe(full.payload) + ' ' + (full.snippet || '')).match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) || [];
    for (const e of new Set(candidatos.map((x) => x.trim().toLowerCase()))) {
      if (e === yo) continue;
      const ct = await uno(db, 'SELECT id FROM contactos WHERE email = ?', e);
      if (!ct) continue;
      await ejec(db, "UPDATE contactos SET estado = 'rebotado', actualizado = ? WHERE id = ?", Date.now(), ct.id);
      const ultimo = await uno(db, "SELECT id, campania_id FROM envios WHERE contacto_id = ? AND estado = 'enviado' ORDER BY enviado DESC LIMIT 1", ct.id);
      if (ultimo) await ejec(db, "UPDATE envios SET estado = 'rebotado' WHERE id = ?", ultimo.id);
      await ejec(db, "UPDATE envios SET estado = 'cancelado' WHERE contacto_id = ? AND estado = 'pendiente'", ct.id);
      await registrarEvento(db, { envio_id: ultimo?.id, contacto_id: ct.id, campania_id: ultimo?.campania_id, tipo: 'rebote', detalle: (full.snippet || '').slice(0, 200) });
      rebotes++;
    }
    await marcar(m.id);
  }

  // Respuestas de contactos
  for (const m of await listar('in:inbox newer_than:4d -from:me -from:mailer-daemon')) {
    if (await yaVisto(m.id)) continue;
    const meta = await api(env, db, `messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
    const cab = Object.fromEntries((meta.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value]));
    const de = ((cab.from || '').match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0].toLowerCase();
    const ct = de && await uno(db, 'SELECT id FROM contactos WHERE email = ?', de);
    // Baja por mail (el botón "Anular suscripción" de Gmail manda un mail con asunto "baja")
    if (ct && /^\s*baja\s*$/i.test(cab.subject || '')) {
      await ejec(db, "UPDATE contactos SET estado = 'baja', actualizado = ? WHERE id = ?", Date.now(), ct.id);
      await ejec(db, "UPDATE envios SET estado = 'cancelado' WHERE contacto_id = ? AND estado = 'pendiente'", ct.id);
      await registrarEvento(db, { contacto_id: ct.id, tipo: 'baja', detalle: 'Pidió la baja por mail' });
      await marcar(m.id);
      continue;
    }
    if (ct) {
      const ultimo = await uno(db, "SELECT id, campania_id FROM envios WHERE contacto_id = ? AND estado = 'enviado' AND enviado > ? ORDER BY enviado DESC LIMIT 1", ct.id, Date.now() - 45 * 864e5);
      if (ultimo) {
        await ejec(db, 'UPDATE envios SET respondio = COALESCE(respondio, ?) WHERE id = ?', Date.now(), ultimo.id);
        // Si respondió, no le mandamos el recordatorio
        await ejec(db, "UPDATE envios SET estado = 'cancelado' WHERE campania_id = ? AND contacto_id = ? AND tipo = 'recordatorio' AND estado = 'pendiente'", ultimo.campania_id, ct.id);
        await registrarEvento(db, { envio_id: ultimo.id, contacto_id: ct.id, campania_id: ultimo.campania_id, tipo: 'respuesta', detalle: `${cab.subject || ''} — ${meta.snippet || ''}`.slice(0, 300) });
        respuestas++;
      }
    }
    await marcar(m.id);
  }
  await ejec(db, 'DELETE FROM gmail_vistos WHERE ts < ?', Date.now() - 10 * 864e5);
  return { rebotes, respuestas };
}

function textoDe(parte) {
  if (!parte) return '';
  let s = '';
  if (parte.body?.data && /^text\//.test(parte.mimeType || '')) {
    try { s += atob(parte.body.data.replace(/-/g, '+').replace(/_/g, '/')); } catch {}
  }
  for (const p of parte.parts || []) s += ' ' + textoDe(p);
  return s;
}
