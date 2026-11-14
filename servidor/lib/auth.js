// Acceso al panel: una sola contraseña (la crea el dueño la primera vez) y cookie firmada.
import { leerConfig, guardarConfig } from './db.js';
import { token } from './util.js';

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashClave(clave, sal) {
  const k = await crypto.subtle.importKey('raw', enc.encode(clave), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(sal), iterations: 100000 }, k, 256);
  return hex(bits);
}

async function firmar(texto, secreto) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(texto)));
}

const DURACION = 30 * 864e5; // 30 días

export async function crearClave(db, clave) {
  const sal = token(16);
  await guardarConfig(db, 'clave_sal', sal);
  await guardarConfig(db, 'clave_hash', await hashClave(clave, sal));
  await guardarConfig(db, 'secreto_sesion', token(32));
}

export async function claveCorrecta(db, clave) {
  const c = await leerConfig(db);
  if (!c.clave_hash) return false;
  return (await hashClave(clave, c.clave_sal)) === c.clave_hash;
}

export async function cookieSesion(db, seguro) {
  const c = await leerConfig(db);
  const exp = Date.now() + DURACION;
  const v = `${exp}.${await firmar(String(exp), c.secreto_sesion)}`;
  return `ps=${v}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACION / 1000}${seguro ? '; Secure' : ''}`;
}

export const cookieSalir = () => 'ps=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export async function sesionValida(request, env, db) {
  if (env.DEV_SIN_LOGIN === '1') return true;
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)ps=([^;]+)/);
  if (!m) return false;
  const [exp, firma] = m[1].split('.');
  if (!exp || !firma || Number(exp) < Date.now()) return false;
  const c = await leerConfig(db);
  if (!c.secreto_sesion) return false;
  return (await firmar(exp, c.secreto_sesion)) === firma;
}
