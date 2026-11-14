// API del panel: /api/...
import { asegurarEsquema, todos, uno, ejec, leerConfig, guardarConfig, registrarEvento, CONFIG_DEFECTO } from './lib/db.js';
import { crearClave, claveCorrecta, cookieSesion, cookieSalir, sesionValida } from './lib/auth.js';
import { json, emailValido, usuarioSoundcloud, diaAR } from './lib/util.js';
import { planificarCampania, proyectar, tick, cupoDeHoy, contactosFrios, mejorHora } from './lib/motor.js';
import { armarMail, CUERPO_DEFECTO, RECORDATORIO_DEFECTO } from './lib/plantilla.js';
import { gmailConfigurado, urlConsentimiento, completarConexion, desconectar } from './lib/gmail.js';

const LIBRES = new Set(['GET sesion', 'POST login', 'POST crear-clave', 'GET gmail/vuelta']);

export async function onRequest({ request, env, params }) {
  const db = env.DB;
  await asegurarEsquema(db);
  const url = new URL(request.url);
  const base = url.origin;
  const partes = [].concat(params.ruta || []);
  const ruta = partes.join('/');
  const metodo = request.method;
  const cuerpo = ['POST', 'PUT'].includes(metodo) ? await request.json().catch(() => ({})) : {};
  const ctx = { request, env, db, base, url, cuerpo, partes };

  try {
    const clave = `${metodo} ${ruta}`;
    if (!LIBRES.has(clave) && !(await sesionValida(request, env, db))) return json({ error: 'Tenés que entrar de nuevo' }, 401);
    const r = await rutear(metodo, partes, ctx);
    return r ?? json({ error: 'No existe' }, 404);
  } catch (e) {
    return json({ error: e.message || String(e) }, e.estado || 500);
  }
}

const err = (msg, estado = 400) => Object.assign(new Error(msg), { estado });
// "DJ  Movedeck" = "dj movedeck" = "DJ MOVEDECK" (sin importar mayúsculas, tildes ni espacios de más)
const normalizar = (s = '') => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

async function rutear(m, [a, b, c], ctx) {
  const { db, env, cuerpo, base, request, url } = ctx;

  // ---------- Sesión ----------
  if (a === 'sesion' && m === 'GET') {
    const conf = await leerConfig(db);
    // El cron necesita saber la dirección pública para armar los links de los mails
    if (conf.base_url !== base && !/localhost|127\.0\.0\.1/.test(base)) await guardarConfig(db, 'base_url', base);
    const logueado = await sesionValida(request, env, db);
    return json({
      logueado,
      necesitaClave: !conf.clave_hash && env.DEV_SIN_LOGIN !== '1',
      artista: conf.remitente_nombre || '',
      configurado: Boolean(conf.remitente_nombre && conf.gmail_refresh),
      dev: env.DEV_SIN_LOGIN === '1',
    });
  }
  if (a === 'crear-clave' && m === 'POST') {
    const conf = await leerConfig(db);
    if (conf.clave_hash) throw err('La contraseña ya está creada');
    // El nombre artístico es el usuario para entrar. Tiene que coincidir con el que se puso al instalar
    // (NOMBRE_ARTISTICO), así nadie más puede crear la contraseña antes que vos.
    const usuario = String(cuerpo.usuario || '').trim();
    if (!usuario) throw err('Poné tu nombre artístico');
    const esperado = env.NOMBRE_ARTISTICO || env.CODIGO_ALTA || conf.codigo_alta;
    const conLink = conf.codigo_alta && String(cuerpo.codigo || '').trim() === conf.codigo_alta;
    if (esperado && !conLink && normalizar(usuario) !== normalizar(esperado)) throw err('Ese nombre artístico no coincide con el que pusiste al instalar', 403);
    if (String(cuerpo.clave || '').length < 6) throw err('Usá al menos 6 caracteres');
    await crearClave(db, cuerpo.clave);
    const nombre = env.NOMBRE_ARTISTICO && normalizar(env.NOMBRE_ARTISTICO) === normalizar(usuario) ? env.NOMBRE_ARTISTICO.trim() : usuario;
    await guardarConfig(db, 'usuario', nombre);
    if (!conf.remitente_nombre) await guardarConfig(db, 'remitente_nombre', nombre);
    await guardarConfig(db, 'codigo_alta', '');
    return json({ ok: true }, 200, { 'set-cookie': await cookieSesion(db, base.startsWith('https')) });
  }
  if (a === 'login' && m === 'POST') {
    // Freno contra quien pruebe contraseñas: 6 intentos fallidos → 15 minutos de espera
    const conf = await leerConfig(db);
    const fallos = String(conf.login_fallos || '').split(',').map(Number).filter((t) => t > Date.now() - 15 * 60e3);
    if (fallos.length >= 6) throw err('Demasiados intentos. Esperá 15 minutos.', 429);
    const usuarioOk = !conf.usuario || normalizar(cuerpo.usuario) === normalizar(conf.usuario);
    if (!usuarioOk || !(await claveCorrecta(db, String(cuerpo.clave || '')))) {
      await guardarConfig(db, 'login_fallos', [...fallos, Date.now()].join(','));
      throw err('Nombre artístico o contraseña incorrectos', 401);
    }
    await guardarConfig(db, 'login_fallos', '');
    return json({ ok: true }, 200, { 'set-cookie': await cookieSesion(db, base.startsWith('https')) });
  }
  if (a === 'cambiar-clave' && m === 'POST') {
    if (!(await claveCorrecta(db, String(cuerpo.actual || '')))) throw err('La contraseña actual no es correcta', 401);
    if (String(cuerpo.nueva || '').length < 6) throw err('Usá al menos 6 caracteres');
    await crearClave(db, cuerpo.nueva); // cambia también el secreto: cierra las otras sesiones
    return json({ ok: true }, 200, { 'set-cookie': await cookieSesion(db, base.startsWith('https')) });
  }

  // ---------- Primeros pasos ----------
  if (a === 'inicio' && m === 'GET') {
    const conf = await leerConfig(db);
    const n = await uno(db, `SELECT (SELECT COUNT(*) FROM contactos) AS contactos, (SELECT COUNT(*) FROM grupos) AS grupos, (SELECT COUNT(*) FROM campanias) AS campanias,
      (SELECT COUNT(*) FROM contactos WHERE soundcloud = '') AS sinSoundcloud`);
    return json({
      artista: conf.remitente_nombre || '', soundcloud: conf.soundcloud_perfil || '', firma: conf.firma || '',
      googleId: conf.google_client_id || '', googleSecreto: Boolean(conf.google_client_secret), googleDelServidor: Boolean(env.GOOGLE_CLIENT_ID),
      gmailConectado: Boolean(conf.gmail_refresh), gmailEmail: conf.gmail_email || '',
      redireccion: `${base}/api/gmail/vuelta`, origen: base,
      ...n,
    });
  }
  if (a === 'salir' && m === 'POST') return json({ ok: true }, 200, { 'set-cookie': cookieSalir() });

  // ---------- Resumen ----------
  if (a === 'resumen' && m === 'GET') {
    const conf = await leerConfig(db);
    const tot = await uno(db, `SELECT
      (SELECT COUNT(*) FROM contactos WHERE estado = 'activo') AS activos,
      (SELECT COUNT(*) FROM contactos) AS contactos,
      (SELECT COUNT(*) FROM campanias WHERE estado = 'activa') AS activas,
      (SELECT COUNT(*) FROM envios WHERE estado = 'pendiente') AS pendientes`);
    const g = await statsGlobales(db);
    const eventos = await todos(db, `SELECT ev.*, ct.nombre, ct.email, ca.nombre AS campania FROM eventos ev
      LEFT JOIN contactos ct ON ct.id = ev.contacto_id LEFT JOIN campanias ca ON ca.id = ev.campania_id
      WHERE ev.tipo IN ('apertura','clic','escucha','respuesta','rebote','baja','ab','like','repost','comentario')
      ORDER BY ev.ts DESC LIMIT 40`);
    const frios = await contactosFrios(db, conf);
    return json({
      ...tot, ...g, frios: frios.size,
      cupo: await cupoDeHoy(db, conf),
      proyeccion: await proyectar(db, 14),
      eventos,
      gmail: { configurado: gmailConfigurado(env, conf), conectado: Boolean(conf.gmail_refresh), email: conf.gmail_email || '' },
      modoPrueba: env.MODO_PRUEBA === '1',
    });
  }

  // ---------- Contactos ----------
  if (a === 'contactos') {
    if (!b && m === 'GET') return json(await listarContactos(db));
    if (b === 'importar' && m === 'POST') return json(await importar(db, cuerpo.filas || []));
    if (!b && m === 'POST') {
      const r = await importar(db, [cuerpo], { estricto: true });
      return json(r);
    }
    const id = Number(b);
    if (id && !c && m === 'GET') return json(await fichaContacto(db, id));
    if (id && !c && m === 'PUT') {
      const x = cuerpo;
      if (x.email && !emailValido(x.email)) throw err('Email inválido');
      await ejec(db, `UPDATE contactos SET nombre = ?, email = ?, soundcloud = ?, tipo = ?, pais = ?, etiquetas = ?, notas = ?, estado = ?, actualizado = ? WHERE id = ?`,
        String(x.nombre || '').trim(), String(x.email).trim().toLowerCase(), usuarioSoundcloud(x.soundcloud), x.tipo || 'dj', x.pais || '', x.etiquetas || '', x.notas || '', x.estado || 'activo', Date.now(), id);
      if (x.estado && x.estado !== 'activo') await ejec(db, "UPDATE envios SET estado = 'cancelado' WHERE contacto_id = ? AND estado = 'pendiente'", id);
      return json({ ok: true });
    }
    if (id && !c && m === 'DELETE') {
      await db.batch([
        db.prepare('DELETE FROM grupo_contactos WHERE contacto_id = ?').bind(id),
        db.prepare("UPDATE envios SET estado = 'cancelado' WHERE contacto_id = ? AND estado = 'pendiente'").bind(id),
        db.prepare('DELETE FROM contactos WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // ---------- Grupos ----------
  if (a === 'grupos') {
    if (!b && m === 'GET') {
      return json(await todos(db, `SELECT g.*, COUNT(c.id) AS cantidad, SUM(CASE WHEN c.estado = 'activo' THEN 1 ELSE 0 END) AS activos
        FROM grupos g LEFT JOIN grupo_contactos gc ON gc.grupo_id = g.id LEFT JOIN contactos c ON c.id = gc.contacto_id
        GROUP BY g.id ORDER BY g.nombre COLLATE NOCASE`));
    }
    if (b === 'auto' && m === 'POST') return json(await gruposAuto(db, cuerpo));
    if (!b && m === 'POST') {
      if (!String(cuerpo.nombre || '').trim()) throw err('Poné un nombre');
      const r = await ejec(db, 'INSERT INTO grupos (nombre, creado) VALUES (?, ?)', cuerpo.nombre.trim(), Date.now());
      await ponerMiembros(db, r.meta.last_row_id, cuerpo.contactos || []);
      return json({ id: r.meta.last_row_id });
    }
    const id = Number(b);
    if (id && m === 'GET') {
      const g = await uno(db, 'SELECT * FROM grupos WHERE id = ?', id);
      if (!g) throw err('No existe', 404);
      g.contactos = (await todos(db, 'SELECT contacto_id FROM grupo_contactos WHERE grupo_id = ?', id)).map((x) => x.contacto_id);
      return json(g);
    }
    if (id && m === 'PUT') {
      if (cuerpo.nombre) await ejec(db, 'UPDATE grupos SET nombre = ? WHERE id = ?', cuerpo.nombre.trim(), id);
      if (cuerpo.contactos) {
        await ejec(db, 'DELETE FROM grupo_contactos WHERE grupo_id = ?', id);
        await ponerMiembros(db, id, cuerpo.contactos);
      }
      return json({ ok: true });
    }
    if (id && m === 'DELETE') {
      const usado = await uno(db, "SELECT c.nombre FROM campania_grupos cg JOIN campanias c ON c.id = cg.campania_id WHERE cg.grupo_id = ? AND c.estado IN ('activa','pausada') LIMIT 1", id);
      if (usado) throw err(`Lo usa la campaña "${usado.nombre}", que está en curso`);
      await db.batch([
        db.prepare('DELETE FROM grupo_contactos WHERE grupo_id = ?').bind(id),
        db.prepare('DELETE FROM campania_grupos WHERE grupo_id = ?').bind(id),
        db.prepare('DELETE FROM grupos WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // ---------- Campañas ----------
  if (a === 'campanias') {
    if (!b && m === 'GET') return json(await listarCampanias(db));
    if (b === 'textos' && m === 'GET') { const conf = await leerConfig(db); return json({ cuerpo: CUERPO_DEFECTO, recordatorio: RECORDATORIO_DEFECTO, artista: conf.remitente_nombre || '' }); }
    if (!b && m === 'POST') {
      const x = validarCampania(cuerpo);
      const r = await ejec(db, `INSERT INTO campanias (nombre, tema, artista, link, imagen, asunto_a, asunto_b, cuerpo, recordatorio_dias, recordatorio_asunto, recordatorio_cuerpo, inicio, creado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, x.nombre, x.tema, x.artista, x.link, x.imagen, x.asunto_a, x.asunto_b, x.cuerpo, x.recordatorio_dias, x.recordatorio_asunto, x.recordatorio_cuerpo, x.inicio, Date.now());
      await ponerGrupos(db, r.meta.last_row_id, cuerpo.grupos || []);
      return json({ id: r.meta.last_row_id });
    }
    const id = Number(b);
    const camp = id ? await uno(db, 'SELECT * FROM campanias WHERE id = ?', id) : null;
    if (id && !camp) throw err('No existe la campaña', 404);
    if (id && !c && m === 'GET') return json(await detalleCampania(db, camp));
    if (id && !c && m === 'PUT') {
      const x = validarCampania({ ...camp, ...cuerpo });
      await ejec(db, `UPDATE campanias SET nombre = ?, tema = ?, artista = ?, link = ?, imagen = ?, asunto_a = ?, asunto_b = ?, cuerpo = ?, recordatorio_dias = ?, recordatorio_asunto = ?, recordatorio_cuerpo = ?, inicio = ? WHERE id = ?`,
        x.nombre, x.tema, x.artista, x.link, x.imagen, x.asunto_a, x.asunto_b, x.cuerpo, x.recordatorio_dias, x.recordatorio_asunto, x.recordatorio_cuerpo, x.inicio, id);
      if (cuerpo.grupos && camp.estado === 'borrador') await ponerGrupos(db, id, cuerpo.grupos);
      return json({ ok: true });
    }
    if (id && !c && m === 'DELETE') {
      if (camp.estado === 'activa') throw err('Pausala antes de borrarla');
      await db.batch([
        db.prepare('DELETE FROM eventos WHERE campania_id = ?').bind(id),
        db.prepare('DELETE FROM envios WHERE campania_id = ?').bind(id),
        db.prepare('DELETE FROM campania_grupos WHERE campania_id = ?').bind(id),
        db.prepare('DELETE FROM campanias WHERE id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
    if (id && c === 'activar' && m === 'POST') {
      if (camp.estado !== 'borrador') throw err('La campaña ya fue activada');
      return json(await planificarCampania(db, id));
    }
    if (id && c === 'pausar' && m === 'POST') { await ejec(db, "UPDATE campanias SET estado = 'pausada' WHERE id = ? AND estado = 'activa'", id); return json({ ok: true }); }
    if (id && c === 'reanudar' && m === 'POST') { await ejec(db, "UPDATE campanias SET estado = 'activa' WHERE id = ? AND estado = 'pausada'", id); return json({ ok: true }); }
    if (id && c === 'reintentar' && m === 'POST') {
      const r = await ejec(db, "UPDATE envios SET estado = 'pendiente', error = NULL WHERE campania_id = ? AND estado = 'error'", id);
      return json({ ok: true, cantidad: r.meta.changes });
    }
    if (id && c === 'vista' && m === 'POST') {
      const conf = await leerConfig(db);
      const x = { ...camp, ...cuerpo };
      const contacto = { nombre: cuerpo.nombrePrueba || 'Juan Pérez', email: 'ejemplo@mail.com' };
      const env1 = { token: 'VISTA', tipo: cuerpo.tipo || 'principal', variante: cuerpo.variante || 'A' };
      return json(armarMail({ campania: x, contacto, envio: env1, config: conf, base }));
    }
  }
  if (a === 'vista-previa' && m === 'POST') {
    const conf = await leerConfig(db);
    const contacto = { nombre: 'Juan Pérez', email: 'ejemplo@mail.com' };
    return json(armarMail({ campania: cuerpo, contacto, envio: { token: 'VISTA', tipo: cuerpo.tipo || 'principal', variante: cuerpo.variante || 'A' }, config: conf, base }));
  }

  // Marcar a mano que lo escuchó (además de lo que detecta SoundCloud)
  if (a === 'envios' && Number(b) && c === 'escuchado' && m === 'POST') {
    const e = await uno(db, 'SELECT * FROM envios WHERE id = ?', Number(b));
    if (!e) throw err('No existe', 404);
    const t = cuerpo.quitar ? null : Date.now();
    await ejec(db, 'UPDATE envios SET escuchado = ? WHERE campania_id = ? AND contacto_id = ?', t, e.campania_id, e.contacto_id);
    if (t) await registrarEvento(db, { envio_id: e.id, contacto_id: e.contacto_id, campania_id: e.campania_id, tipo: 'escucha', detalle: 'Marcado a mano' });
    return json({ ok: true });
  }

  // ---------- SoundCloud ----------
  if (a === 'soundcloud' && b === 'info' && m === 'POST') {
    const link = String(cuerpo.url || '').trim();
    if (!/^https?:\/\/(on\.|m\.|www\.)?soundcloud\.com\//i.test(link)) throw err('Pegá un link de SoundCloud');
    const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(link)}`);
    if (!r.ok) throw err('SoundCloud no encontró ese link (¿es privado o está mal copiado?)');
    const d = await r.json();
    const [tema, artista] = splitTitulo(d.title, d.author_name);
    return json({ tema, artista, imagen: (d.thumbnail_url || '').replace('-t500x500', '-t300x300'), autor: d.author_name });
  }

  // ---------- Calendario / motor ----------
  if (a === 'calendario' && m === 'GET') return json(await proyectar(db, Number(url.searchParams.get('dias')) || 21));
  if (a === 'tick' && m === 'POST') return json(await tick(env, db, { base, forzarVentana: Boolean(cuerpo.forzar) && env.MODO_PRUEBA === '1' }));

  // ---------- Gmail ----------
  if (a === 'gmail') {
    if (b === 'conectar' && m === 'GET') {
      if (!gmailConfigurado(env, await leerConfig(db))) throw err('Faltan las claves de Google: cargalas en Primeros pasos');
      return Response.redirect(await urlConsentimiento(env, db, base), 302);
    }
    if (b === 'vuelta' && m === 'GET') {
      try {
        if (url.searchParams.get('error')) throw new Error('Cancelaste el permiso de Google');
        await completarConexion(env, db, base, url.searchParams.get('code'), url.searchParams.get('state'));
        return Response.redirect(`${base}/#/inicio?gmail=ok`, 302);
      } catch (e) {
        return Response.redirect(`${base}/#/inicio?gmail=${encodeURIComponent(e.message)}`, 302);
      }
    }
    if (b === 'desconectar' && m === 'POST') { await desconectar(db); return json({ ok: true }); }
  }

  // ---------- Ajustes ----------
  if (a === 'ajustes') {
    const EDITABLES = ['tope_diario', 'arranque', 'hora_desde', 'hora_hasta', 'hora_envio', 'tanda', 'remitente_nombre', 'firma', 'recordatorio_dias', 'frio_promos', 'soundcloud_perfil', 'google_client_id'];
    if (m === 'GET') {
      const conf = await leerConfig(db);
      const out = Object.fromEntries(EDITABLES.map((k) => [k, conf[k] ?? '']));
      return json({ ...out, google_secreto_cargado: Boolean(conf.google_client_secret), primer_envio: conf.primer_envio || '', redireccion: `${base}/api/gmail/vuelta`,
        gmail: { configurado: gmailConfigurado(env, conf), conectado: Boolean(conf.gmail_refresh), email: conf.gmail_email || '' }, defecto: CONFIG_DEFECTO });
    }
    if (m === 'PUT') {
      const tope = Number(cuerpo.tope_diario);
      if (cuerpo.tope_diario !== undefined && (!(tope > 0) || tope > 400)) throw err('El tope diario tiene que estar entre 1 y 400');
      if (cuerpo.soundcloud_perfil !== undefined) cuerpo.soundcloud_perfil = usuarioSoundcloud(cuerpo.soundcloud_perfil);
      for (const k of EDITABLES) if (cuerpo[k] !== undefined) await guardarConfig(db, k, String(cuerpo[k]).trim());
      // El secreto de Google solo se escribe (nunca se devuelve). Vacío = no cambiarlo.
      if (String(cuerpo.google_client_secret || '').trim()) await guardarConfig(db, 'google_client_secret', String(cuerpo.google_client_secret).trim());
      return json({ ok: true });
    }
  }
  return null;
}

// ================= Ayudantes =================

function splitTitulo(titulo = '', autor = '') {
  // oEmbed devuelve "Tema by Autor"
  let t = String(titulo).replace(new RegExp(`\\s+by\\s+${autor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '').trim();
  const m = t.match(/^(.+?)\s+[-–]\s+(.+)$/);
  if (m) return [m[2].trim(), m[1].trim()];
  return [t, autor];
}

function validarCampania(x) {
  const s = (v) => String(v ?? '').trim();
  const out = {
    nombre: s(x.nombre) || s(x.tema), tema: s(x.tema), artista: s(x.artista), link: s(x.link), imagen: s(x.imagen),
    asunto_a: s(x.asunto_a), asunto_b: s(x.asunto_b), cuerpo: s(x.cuerpo) || CUERPO_DEFECTO,
    recordatorio_dias: Math.max(0, Math.min(30, Number(x.recordatorio_dias ?? 4) | 0)),
    recordatorio_asunto: s(x.recordatorio_asunto), recordatorio_cuerpo: s(x.recordatorio_cuerpo),
    inicio: /^\d{4}-\d{2}-\d{2}$/.test(s(x.inicio)) ? s(x.inicio) : diaAR(),
  };
  if (!out.nombre) throw err('Poné el nombre del tema');
  if (!/^https?:\/\//i.test(out.link)) throw err('Falta el link de SoundCloud');
  if (!out.asunto_a) throw err('Falta el asunto del mail');
  return out;
}

async function ponerGrupos(db, campaniaId, grupos) {
  const lote = [db.prepare('DELETE FROM campania_grupos WHERE campania_id = ?').bind(campaniaId)];
  grupos.forEach((g, i) => lote.push(db.prepare('INSERT OR IGNORE INTO campania_grupos (campania_id, grupo_id, orden) VALUES (?, ?, ?)').bind(campaniaId, Number(g), i)));
  await db.batch(lote);
}

async function ponerMiembros(db, grupoId, ids) {
  const lote = [...new Set(ids.map(Number))].filter(Boolean).map((cid) => db.prepare('INSERT OR IGNORE INTO grupo_contactos (grupo_id, contacto_id) VALUES (?, ?)').bind(grupoId, cid));
  for (let i = 0; i < lote.length; i += 90) await db.batch(lote.slice(i, i + 90));
}

async function importar(db, filas, { estricto = false } = {}) {
  let nuevos = 0, actualizados = 0;
  const errores = [];
  const lote = [];
  const existentes = new Set((await todos(db, 'SELECT email FROM contactos')).map((x) => x.email.toLowerCase()));
  const vistos = new Set();
  for (const [i, f] of filas.entries()) {
    const email = String(f.email || '').trim().toLowerCase();
    if (!emailValido(email)) { errores.push(`Fila ${i + 1}: email inválido "${f.email || ''}"`); continue; }
    if (vistos.has(email)) continue;
    vistos.add(email);
    if (existentes.has(email)) actualizados++; else nuevos++;
    lote.push(db.prepare(`INSERT INTO contactos (nombre, email, soundcloud, tipo, pais, etiquetas, notas, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(email) DO UPDATE SET
        nombre = CASE WHEN excluded.nombre != '' THEN excluded.nombre ELSE contactos.nombre END,
        soundcloud = CASE WHEN excluded.soundcloud != '' THEN excluded.soundcloud ELSE contactos.soundcloud END,
        tipo = CASE WHEN excluded.tipo != '' THEN excluded.tipo ELSE contactos.tipo END,
        pais = CASE WHEN excluded.pais != '' THEN excluded.pais ELSE contactos.pais END,
        etiquetas = CASE WHEN excluded.etiquetas != '' THEN excluded.etiquetas ELSE contactos.etiquetas END,
        notas = CASE WHEN excluded.notas != '' THEN excluded.notas ELSE contactos.notas END,
        actualizado = excluded.creado`)
      .bind(String(f.nombre || '').trim(), email, usuarioSoundcloud(f.soundcloud), normalizarTipo(f.tipo), String(f.pais || '').trim(), String(f.etiquetas || '').trim(), String(f.notas || '').trim(), Date.now()));
  }
  if (estricto && errores.length) throw err(errores[0].replace(/^Fila 1: e/, 'E'));
  if (estricto && actualizados) throw err('Ya hay un contacto con ese email');
  for (let i = 0; i < lote.length; i += 90) await db.batch(lote.slice(i, i + 90));
  return { nuevos, actualizados, errores };
}

function normalizarTipo(t = '') {
  const s = String(t).toLowerCase().trim();
  if (!s) return 'dj';
  if (/sello|label/.test(s)) return 'sello';
  if (/radio|podcast/.test(s)) return 'radio';
  if (/blog|prensa|medio|revista|playlist|curador/.test(s)) return 'prensa';
  if (/dj|productor|artista/.test(s)) return 'dj';
  return 'otro';
}

const CTE_POR_CAMPANIA = `pc AS (
  SELECT contacto_id, campania_id,
    MAX(CASE WHEN estado IN ('enviado','rebotado') AND tipo = 'principal' THEN 1 ELSE 0 END) AS rec,
    MAX(CASE WHEN abierto IS NOT NULL THEN 1 ELSE 0 END) AS ab,
    MAX(CASE WHEN clic IS NOT NULL THEN 1 ELSE 0 END) AS cl,
    MAX(CASE WHEN escuchado IS NOT NULL THEN 1 ELSE 0 END) AS es,
    MAX(CASE WHEN respondio IS NOT NULL THEN 1 ELSE 0 END) AS re,
    MAX(COALESCE(respondio, escuchado, clic, abierto, 0)) AS ult
  FROM envios GROUP BY contacto_id, campania_id)`;

async function statsGlobales(db) {
  return uno(db, `WITH ${CTE_POR_CAMPANIA}
    SELECT COALESCE(SUM(rec),0) AS recibidas, COALESCE(SUM(ab),0) AS abiertas, COALESCE(SUM(cl),0) AS clics,
      COALESCE(SUM(es),0) AS escuchadas, COALESCE(SUM(re),0) AS respuestas FROM pc`);
}

async function listarContactos(db) {
  const conf = await leerConfig(db);
  const frios = await contactosFrios(db, conf);
  const filas = await todos(db, `WITH ${CTE_POR_CAMPANIA},
    s AS (SELECT contacto_id, SUM(rec) AS recibidas, SUM(ab) AS abiertas, SUM(cl) AS clics, SUM(es) AS escuchadas, SUM(re) AS respuestas, MAX(ult) AS ultima FROM pc GROUP BY contacto_id)
    SELECT c.*, COALESCE(s.recibidas,0) AS recibidas, COALESCE(s.abiertas,0) AS abiertas, COALESCE(s.clics,0) AS clics,
      COALESCE(s.escuchadas,0) AS escuchadas, COALESCE(s.respuestas,0) AS respuestas, s.ultima,
      (SELECT GROUP_CONCAT(g.nombre, ', ') FROM grupo_contactos gc JOIN grupos g ON g.id = gc.grupo_id WHERE gc.contacto_id = c.id) AS grupos
    FROM contactos c LEFT JOIN s ON s.contacto_id = c.id ORDER BY c.nombre COLLATE NOCASE, c.email`);
  return filas.map((f) => ({ ...f, frio: frios.has(f.id) }));
}

async function fichaContacto(db, id) {
  const conf = await leerConfig(db);
  const c = await uno(db, 'SELECT * FROM contactos WHERE id = ?', id);
  if (!c) throw err('No existe el contacto', 404);
  const historial = await todos(db, `SELECT e.*, ca.nombre AS campania, ca.tema, g.nombre AS grupo FROM envios e
    JOIN campanias ca ON ca.id = e.campania_id LEFT JOIN grupos g ON g.id = e.grupo_id
    WHERE e.contacto_id = ? ORDER BY COALESCE(e.enviado, e.programado) DESC`, id);
  const eventos = await todos(db, `SELECT ev.*, ca.nombre AS campania FROM eventos ev LEFT JOIN campanias ca ON ca.id = ev.campania_id
    WHERE ev.contacto_id = ? ORDER BY ev.ts DESC LIMIT 100`, id);
  const grupos = await todos(db, 'SELECT g.id, g.nombre FROM grupo_contactos gc JOIN grupos g ON g.id = gc.grupo_id WHERE gc.contacto_id = ?', id);
  const frios = await contactosFrios(db, conf);
  return { ...c, historial, eventos, grupos, frio: frios.has(id), mejorHora: await mejorHora(db, id, conf) };
}

async function gruposAuto(db, x) {
  const tam = Math.max(1, Math.min(400, Number(x.tamanio) || 25));
  const conf = await leerConfig(db);
  let cts = await todos(db, "SELECT id, tipo, etiquetas FROM contactos WHERE estado = 'activo' ORDER BY id");
  if (x.tipo) cts = cts.filter((c) => c.tipo === x.tipo);
  if (x.etiqueta) cts = cts.filter((c) => c.etiquetas.toLowerCase().split(/[,;]/).map((s) => s.trim()).includes(String(x.etiqueta).toLowerCase().trim()));
  if (x.excluirFrios) { const f = await contactosFrios(db, conf); cts = cts.filter((c) => !f.has(c.id)); }
  if (!cts.length) throw err('No hay contactos activos con ese filtro');
  if (x.mezclar !== false) for (let i = cts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [cts[i], cts[j]] = [cts[j], cts[i]]; }
  const prefijo = String(x.prefijo || 'Grupo').trim();
  const creados = [];
  for (let i = 0; i < cts.length; i += tam) {
    const nombre = `${prefijo} ${creados.length + 1}`;
    const r = await ejec(db, 'INSERT INTO grupos (nombre, creado) VALUES (?, ?)', nombre, Date.now());
    await ponerMiembros(db, r.meta.last_row_id, cts.slice(i, i + tam).map((c) => c.id));
    creados.push({ id: r.meta.last_row_id, nombre, cantidad: Math.min(tam, cts.length - i) });
  }
  return { creados };
}

async function statsCampania(db, where, ...p) {
  return todos(db, `WITH ${CTE_POR_CAMPANIA}
    SELECT pc.campania_id, COUNT(*) AS contactos, SUM(rec) AS recibidas, SUM(ab) AS abiertas, SUM(cl) AS clics, SUM(es) AS escuchadas, SUM(re) AS respuestas
    FROM pc ${where} GROUP BY pc.campania_id`, ...p);
}

async function listarCampanias(db) {
  const camps = await todos(db, 'SELECT * FROM campanias ORDER BY creado DESC');
  const st = new Map((await statsCampania(db, '')).map((s) => [s.campania_id, s]));
  const est = new Map((await todos(db, `SELECT campania_id, SUM(estado = 'pendiente') AS pendientes, SUM(estado = 'error') AS errores, SUM(estado = 'rebotado') AS rebotes
    FROM envios GROUP BY campania_id`)).map((s) => [s.campania_id, s]));
  const grupos = await todos(db, 'SELECT cg.campania_id, g.nombre, cg.dia, cg.orden FROM campania_grupos cg JOIN grupos g ON g.id = cg.grupo_id ORDER BY cg.orden');
  return camps.map((c) => ({
    ...c, ...(st.get(c.id) || { contactos: 0, recibidas: 0, abiertas: 0, clics: 0, escuchadas: 0, respuestas: 0 }),
    ...(est.get(c.id) || { pendientes: 0, errores: 0, rebotes: 0 }),
    grupos: grupos.filter((g) => g.campania_id === c.id),
  }));
}

async function detalleCampania(db, camp) {
  const id = camp.id;
  const grupos = await todos(db, `SELECT cg.*, g.nombre, (SELECT COUNT(*) FROM grupo_contactos gc JOIN contactos c ON c.id = gc.contacto_id WHERE gc.grupo_id = g.id AND c.estado = 'activo') AS activos
    FROM campania_grupos cg JOIN grupos g ON g.id = cg.grupo_id WHERE cg.campania_id = ? ORDER BY cg.orden`, id);
  const porGrupo = await todos(db, `WITH ${CTE_POR_CAMPANIA}, gr AS (SELECT DISTINCT campania_id, contacto_id, grupo_id FROM envios WHERE campania_id = ? AND tipo = 'principal')
    SELECT gr.grupo_id, COUNT(*) AS contactos, SUM(rec) AS recibidas, SUM(ab) AS abiertas, SUM(cl) AS clics, SUM(es) AS escuchadas, SUM(re) AS respuestas
    FROM pc JOIN gr ON gr.campania_id = pc.campania_id AND gr.contacto_id = pc.contacto_id GROUP BY gr.grupo_id`, id);
  const porVariante = await todos(db, `SELECT variante, COUNT(*) AS enviados, SUM(abierto IS NOT NULL OR clic IS NOT NULL) AS abiertas, SUM(clic IS NOT NULL) AS clics
    FROM envios WHERE campania_id = ? AND tipo = 'principal' AND estado IN ('enviado','rebotado') AND variante IN ('A','B') GROUP BY variante`, id);
  const filas = await todos(db, `SELECT e.*, c.nombre, c.email, c.soundcloud, c.tipo AS tipo_contacto, c.estado AS estado_contacto, g.nombre AS grupo
    FROM envios e JOIN contactos c ON c.id = e.contacto_id LEFT JOIN grupos g ON g.id = e.grupo_id
    WHERE e.campania_id = ? ORDER BY e.programado`, id);
  // Una fila por contacto: el mail principal + su recordatorio
  const porContacto = new Map();
  for (const f of filas) {
    const k = f.contacto_id;
    if (!porContacto.has(k)) porContacto.set(k, { contacto_id: k, nombre: f.nombre, email: f.email, soundcloud: f.soundcloud, tipo: f.tipo_contacto, estado_contacto: f.estado_contacto, grupo: f.grupo });
    const o = porContacto.get(k);
    o[f.tipo] = f;
    for (const campo of ['abierto', 'clic', 'escuchado', 'respondio']) if (f[campo] && (!o[campo] || f[campo] < o[campo])) o[campo] = f[campo];
    o.aperturas = (o.aperturas || 0) + f.aperturas;
    o.clics = (o.clics || 0) + f.clics;
  }
  const [st] = await statsCampania(db, 'WHERE pc.campania_id = ?', id);
  const eventos = await todos(db, `SELECT ev.*, ct.nombre, ct.email FROM eventos ev LEFT JOIN contactos ct ON ct.id = ev.contacto_id
    WHERE ev.campania_id = ? AND ev.tipo NOT IN ('envio') ORDER BY ev.ts DESC LIMIT 60`, id);
  const bajas = await uno(db, "SELECT COUNT(*) AS c FROM eventos WHERE campania_id = ? AND tipo = 'baja'", id);
  const conteo = await uno(db, `SELECT SUM(estado = 'pendiente') AS pendientes, SUM(estado = 'error') AS errores, SUM(estado = 'rebotado') AS rebotes,
    SUM(estado = 'enviado' AND tipo = 'recordatorio') AS recordatorios FROM envios WHERE campania_id = ?`, id);
  return { ...camp, grupos, porGrupo, porVariante, contactos: [...porContacto.values()], stats: st || {}, eventos, bajas: bajas.c, ...conteo };
}
