// Utilidades compartidas por la página (Pages Functions) y el worker del cron.

// Argentina es UTC-3 todo el año (sin horario de verano).
export const AR_OFFSET = -3 * 3600e3;

export const diaAR = (ms = Date.now()) => new Date(ms + AR_OFFSET).toISOString().slice(0, 10);
export const horaAR = (ms = Date.now()) => new Date(ms + AR_OFFSET).getUTCHours();
export const msDeDiaHoraAR = (dia, hora, min = 0) =>
  Date.parse(dia + 'T00:00:00Z') + (hora * 60 + min) * 60e3 - AR_OFFSET;

export function sumarDias(dia, n) {
  const d = new Date(dia + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasEntre(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
}

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const ALFABETO = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function token(n = 14) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (const x of b) s += ALFABETO[x % ALFABETO.length];
  return s;
}

export const escaparHtml = (s = '') =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const emailValido = (e = '') => /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(String(e).trim());

// "https://soundcloud.com/djfulano/" o "@djfulano" → "djfulano"
export function usuarioSoundcloud(v = '') {
  let s = String(v).trim();
  if (!s) return '';
  s = s.replace(/^@/, '');
  const m = s.match(/soundcloud\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  return s.toLowerCase().replace(/\/+$/, '');
}

export function primerNombre(nombre = '') {
  return String(nombre).trim().split(/\s+/)[0] || '';
}
