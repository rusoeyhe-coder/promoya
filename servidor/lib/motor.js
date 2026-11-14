// Motor de difusión: arma la cola de cada campaña, respeta el tope diario y el arranque gradual,
// manda por tandas, crea los recordatorios y elige el asunto ganador.
import { todos, uno, ejec, leerConfig, guardarConfig, registrarEvento } from './db.js';
import { diaAR, horaAR, msDeDiaHoraAR, sumarDias, diasEntre } from './util.js';
import { armarMail, armarMime } from './plantilla.js';
import { enviarRaw, revisarBandeja } from './gmail.js';

const n = (v, d) => (Number.isFinite(Number(v)) && v !== '' ? Number(v) : d);

// Tope de un día concreto, con el arranque gradual (semana 1, 2, 3...).
export function topeParaDia(config, dia) {
  const tope = n(config.tope_diario, 100);
  const escalones = String(config.arranque || '').split(',').map(Number).filter((x) => x > 0);
  if (!escalones.length) return tope;
  const primer = config.primer_envio || dia;
  const semana = Math.max(0, Math.floor(diasEntre(primer, dia) / 7));
  return Math.min(tope, escalones[Math.min(semana, escalones.length - 1)]);
}

export async function cupoDeHoy(db, config, ahora = Date.now()) {
  const hoy = diaAR(ahora);
  const desde = msDeDiaHoraAR(hoy, 0);
  const r = await uno(db, "SELECT COUNT(*) AS c FROM envios WHERE enviado >= ? AND estado IN ('enviado','rebotado')", desde);
  const tope = topeParaDia(config, hoy);
  return { dia: hoy, tope, enviados: r.c, restante: Math.max(0, tope - r.c) };
}

// Hora en que más abre/toca el contacto (hora Argentina). Necesita al menos 2 señales.
export async function mejorHora(db, contactoId, config) {
  const desde = n(config.hora_desde, 10), hasta = n(config.hora_hasta, 20);
  const ev = await todos(db, "SELECT ts FROM eventos WHERE contacto_id = ? AND tipo IN ('apertura','clic') ORDER BY ts DESC LIMIT 30", contactoId);
  if (ev.length < 2) return { hora: n(config.hora_envio, 11), aprendida: false };
  const cuenta = {};
  for (const e of ev) { const h = horaAR(e.ts); cuenta[h] = (cuenta[h] || 0) + 1; }
  let mejor = Object.entries(cuenta).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] | 0;
  mejor = Math.min(hasta - 1, Math.max(desde, mejor));
  return { hora: mejor, aprendida: true };
}

const minutoAzar = () => Math.floor(Math.random() * 50);

// Al activar: un grupo por día desde la fecha de inicio. Un contacto que está en dos grupos recibe una sola vez.
export async function planificarCampania(db, campaniaId) {
  const config = await leerConfig(db);
  const camp = await uno(db, 'SELECT * FROM campanias WHERE id = ?', campaniaId);
  if (!camp) throw new Error('No existe la campaña');
  const grupos = await todos(db, 'SELECT * FROM campania_grupos WHERE campania_id = ? ORDER BY orden', campaniaId);
  if (!grupos.length) throw new Error('Elegí al menos un grupo');
  const hoy = diaAR();
  const inicio = camp.inicio && camp.inicio >= hoy ? camp.inicio : hoy;
  const vistos = new Set((await todos(db, "SELECT contacto_id FROM envios WHERE campania_id = ? AND tipo = 'principal'", campaniaId)).map((x) => x.contacto_id));
  let total = 0, alternar = 0;
  const lote = [];
  for (const g of grupos) {
    const dia = sumarDias(inicio, g.orden);
    lote.push(db.prepare('UPDATE campania_grupos SET dia = ? WHERE campania_id = ? AND grupo_id = ?').bind(dia, campaniaId, g.grupo_id));
    const cts = await todos(db, `SELECT c.id FROM contactos c JOIN grupo_contactos gc ON gc.contacto_id = c.id
      WHERE gc.grupo_id = ? AND c.estado = 'activo' ORDER BY c.id`, g.grupo_id);
    for (const c of cts) {
      if (vistos.has(c.id)) continue;
      vistos.add(c.id);
      const { hora } = await mejorHora(db, c.id, config);
      const variante = camp.asunto_b && g.orden === 0 ? (alternar++ % 2 ? 'B' : 'A') : null;
      lote.push(db.prepare(`INSERT OR IGNORE INTO envios (token, campania_id, contacto_id, grupo_id, tipo, variante, programado)
        VALUES (?, ?, ?, ?, 'principal', ?, ?)`).bind(crypto.randomUUID().replace(/-/g, '').slice(0, 18), campaniaId, c.id, g.grupo_id, variante, msDeDiaHoraAR(dia, hora, minutoAzar())));
      total++;
    }
  }
  lote.push(db.prepare("UPDATE campanias SET estado = 'activa', inicio = ? WHERE id = ?").bind(inicio, campaniaId));
  for (let i = 0; i < lote.length; i += 90) await db.batch(lote.slice(i, i + 90));
  return { total, inicio };
}

// Proyección de los próximos días: cuántos salen cada día respetando el tope (lo que no entra pasa al día siguiente).
export async function proyectar(db, dias = 21) {
  const config = await leerConfig(db);
  const hoyCupo = await cupoDeHoy(db, config);
  const pend = await todos(db, `SELECT e.programado, e.tipo, e.campania_id, c.nombre FROM envios e JOIN campanias c ON c.id = e.campania_id
    WHERE e.estado = 'pendiente' AND c.estado = 'activa' ORDER BY (e.tipo = 'recordatorio'), e.programado`);
  const salida = [];
  let cola = pend.map((p) => ({ ...p, dia: diaAR(p.programado) }));
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(hoyCupo.dia, i);
    const tope = i === 0 ? hoyCupo.restante : topeParaDia({ ...config, primer_envio: config.primer_envio || hoyCupo.dia }, dia);
    const listos = cola.filter((p) => p.dia <= dia);
    const salen = listos.slice(0, tope);
    const ids = new Set(salen);
    cola = cola.filter((p) => !ids.has(p));
    const porCampania = {};
    for (const s of salen) porCampania[s.nombre] = (porCampania[s.nombre] || 0) + 1;
    salida.push({ dia, tope: i === 0 ? hoyCupo.tope : tope, ya: i === 0 ? hoyCupo.enviados : 0, salen: salen.length, atrasados: Math.max(0, listos.length - salen.length), porCampania });
  }
  return salida;
}

// ---- La pasada del cron (cada 10 minutos) ----
export async function tick(env, db, { base, forzarVentana = false } = {}) {
  const ahora = Date.now();
  let config = await leerConfig(db);
  const res = { enviados: 0, errores: 0, recordatorios: 0, ganadores: 0, terminadas: 0 };
  const conGmail = Boolean(config.gmail_refresh);
  const prueba = env.MODO_PRUEBA === '1';

  await crearRecordatorios(db, config, ahora, res);
  await elegirGanadores(db, ahora, res);

  if (conGmail) {
    try { Object.assign(res, { bandeja: await revisarBandeja(env, db) }); }
    catch (e) { res.bandejaError = e.message; }
  }

  const h = horaAR(ahora);
  const enVentana = h >= n(config.hora_desde, 10) && h < n(config.hora_hasta, 20);
  if (!enVentana && !forzarVentana) { res.fueraDeHorario = true; return res; }
  if (!conGmail && !prueba) { res.sinGmail = true; return res; }

  const cupo = await cupoDeHoy(db, config, ahora);
  const limite = Math.min(cupo.restante, n(config.tanda, 8));
  res.cupo = cupo;
  if (limite <= 0) { res.topeAlcanzado = cupo.restante <= 0; return res; }

  const cola = await todos(db, `SELECT e.* FROM envios e JOIN campanias c ON c.id = e.campania_id
    WHERE e.estado = 'pendiente' AND c.estado = 'activa' AND e.programado <= ?
    ORDER BY (e.tipo = 'recordatorio'), e.programado LIMIT ?`, ahora, limite);

  for (const envio of cola) {
    const camp = await uno(db, 'SELECT * FROM campanias WHERE id = ?', envio.campania_id);
    const ct = await uno(db, 'SELECT * FROM contactos WHERE id = ?', envio.contacto_id);
    if (!ct || ct.estado !== 'activo') {
      await ejec(db, "UPDATE envios SET estado = 'cancelado', error = 'contacto no activo' WHERE id = ?", envio.id);
      continue;
    }
    if (envio.tipo === 'principal' && !envio.variante) {
      envio.variante = camp.asunto_b ? (camp.ab_ganador || (envio.id % 2 ? 'B' : 'A')) : 'A';
    }
    if (envio.tipo === 'recordatorio') {
      const p = await uno(db, "SELECT asunto FROM envios WHERE campania_id = ? AND contacto_id = ? AND tipo = 'principal'", envio.campania_id, envio.contacto_id);
      envio.asunto_original = p?.asunto;
    }
    const mail = armarMail({ campania: camp, contacto: ct, envio, config, base });
    try {
      let id = 'prueba-' + envio.token, hilo = null;
      if (conGmail) {
        const raw = armarMime({ de: config.gmail_email, deNombre: config.remitente_nombre || config.gmail_email, para: ct.email, paraNombre: ct.nombre, ...mail });
        const r = await enviarRaw(env, db, raw);
        id = r.id; hilo = r.threadId;
      }
      const t = Date.now();
      await ejec(db, "UPDATE envios SET estado = 'enviado', enviado = ?, gmail_id = ?, gmail_hilo = ?, variante = ?, asunto = ?, error = NULL WHERE id = ?",
        t, id, hilo, envio.variante, mail.asunto, envio.id);
      await registrarEvento(db, { envio_id: envio.id, contacto_id: ct.id, campania_id: camp.id, tipo: envio.tipo === 'recordatorio' ? 'recordatorio' : 'envio', detalle: mail.asunto, ts: t });
      if (!config.primer_envio) { await guardarConfig(db, 'primer_envio', diaAR(t)); config = { ...config, primer_envio: diaAR(t) }; }
      res.enviados++;
    } catch (e) {
      res.errores++;
      await ejec(db, "UPDATE envios SET estado = 'error', error = ? WHERE id = ?", String(e.message).slice(0, 300), envio.id);
      if (/no está conectado|invalid_grant|401|403|429|Rate/i.test(e.message)) { res.frenado = e.message; break; }
    }
  }

  await cerrarCampanias(db, ahora, res);
  return res;
}

async function crearRecordatorios(db, config, ahora, res) {
  const cand = await todos(db, `SELECT e.campania_id, e.contacto_id, e.grupo_id FROM envios e JOIN campanias c ON c.id = e.campania_id
    WHERE e.tipo = 'principal' AND e.estado = 'enviado' AND c.estado = 'activa' AND c.recordatorio_dias > 0
      AND e.abierto IS NULL AND e.clic IS NULL AND e.respondio IS NULL AND e.escuchado IS NULL
      AND e.enviado + c.recordatorio_dias * 86400000 <= ?
      AND NOT EXISTS (SELECT 1 FROM envios r WHERE r.campania_id = e.campania_id AND r.contacto_id = e.contacto_id AND r.tipo = 'recordatorio')
    LIMIT 200`, ahora);
  for (const c of cand) {
    const { hora } = await mejorHora(db, c.contacto_id, config);
    let dia = diaAR(ahora);
    if (msDeDiaHoraAR(dia, hora) < ahora) dia = sumarDias(dia, 1);
    await ejec(db, `INSERT OR IGNORE INTO envios (token, campania_id, contacto_id, grupo_id, tipo, programado) VALUES (?, ?, ?, ?, 'recordatorio', ?)`,
      crypto.randomUUID().replace(/-/g, '').slice(0, 18), c.campania_id, c.contacto_id, c.grupo_id, msDeDiaHoraAR(dia, hora, minutoAzar()));
    res.recordatorios++;
  }
}

// Asunto A/B: cuando el primer grupo lleva 24 h enviado, gana el que más abrieron (o tocaron).
async function elegirGanadores(db, ahora, res) {
  const camps = await todos(db, "SELECT id FROM campanias WHERE estado = 'activa' AND asunto_b != '' AND ab_ganador IS NULL");
  for (const c of camps) {
    const r = await todos(db, `SELECT variante, COUNT(*) AS env, SUM(CASE WHEN abierto IS NOT NULL OR clic IS NOT NULL THEN 1 ELSE 0 END) AS ab,
      SUM(CASE WHEN estado = 'pendiente' THEN 1 ELSE 0 END) AS pend, MAX(enviado) AS ultimo
      FROM envios WHERE campania_id = ? AND tipo = 'principal' AND variante IN ('A','B') GROUP BY variante`, c.id);
    if (r.length < 2 || r.some((x) => x.pend > 0) || r.some((x) => !x.ultimo || x.ultimo > ahora - 864e5)) continue;
    const tasa = (v) => { const x = r.find((y) => y.variante === v); return x.env ? x.ab / x.env : 0; };
    const ganador = tasa('B') > tasa('A') ? 'B' : 'A';
    await ejec(db, 'UPDATE campanias SET ab_ganador = ? WHERE id = ?', ganador, c.id);
    await registrarEvento(db, { campania_id: c.id, tipo: 'ab', detalle: `Ganó el asunto ${ganador} (A ${Math.round(tasa('A') * 100)}% · B ${Math.round(tasa('B') * 100)}%)` });
    res.ganadores++;
  }
}

async function cerrarCampanias(db, ahora, res) {
  const camps = await todos(db, `SELECT c.id, c.recordatorio_dias,
      (SELECT COUNT(*) FROM envios e WHERE e.campania_id = c.id AND e.estado = 'pendiente') AS pend,
      (SELECT MAX(enviado) FROM envios e WHERE e.campania_id = c.id AND e.tipo = 'principal') AS ultimo
    FROM campanias c WHERE c.estado = 'activa'`);
  for (const c of camps) {
    if (c.pend > 0 || !c.ultimo) continue;
    if (c.recordatorio_dias > 0 && c.ultimo + (c.recordatorio_dias + 1) * 864e5 > ahora) continue;
    await ejec(db, "UPDATE campanias SET estado = 'terminada' WHERE id = ?", c.id);
    res.terminadas++;
  }
}

// Contactos fríos: las últimas N promos que recibió no las abrió, ni tocó, ni respondió.
export async function contactosFrios(db, config) {
  const N = n(config.frio_promos, 3);
  // Una fila por (contacto, campaña): cuenta si abrió el principal o el recordatorio.
  const filas = await todos(db, `SELECT contacto_id,
      MAX(abierto IS NOT NULL OR clic IS NOT NULL OR escuchado IS NOT NULL OR respondio IS NOT NULL) AS senal,
      MAX(CASE WHEN tipo = 'principal' THEN enviado END) AS cuando
    FROM envios WHERE estado = 'enviado' GROUP BY contacto_id, campania_id
    HAVING cuando IS NOT NULL AND cuando < ? ORDER BY contacto_id, cuando DESC`, Date.now() - 2 * 864e5);
  const por = new Map();
  for (const f of filas) { if (!por.has(f.contacto_id)) por.set(f.contacto_id, []); por.get(f.contacto_id).push(f.senal); }
  const frios = new Set();
  for (const [id, s] of por) if (s.length >= N && s.slice(0, N).every((x) => !x)) frios.add(id);
  return frios;
}
