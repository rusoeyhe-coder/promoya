// Base de datos D1: esquema, ayudas de consulta y configuración.

const ESQUEMA = [
  `CREATE TABLE IF NOT EXISTS contactos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    soundcloud TEXT NOT NULL DEFAULT '',
    tipo TEXT NOT NULL DEFAULT 'dj',
    pais TEXT NOT NULL DEFAULT '',
    etiquetas TEXT NOT NULL DEFAULT '',
    notas TEXT NOT NULL DEFAULT '',
    estado TEXT NOT NULL DEFAULT 'activo',
    creado INTEGER NOT NULL,
    actualizado INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS ix_contactos_sc ON contactos(soundcloud)`,
  `CREATE TABLE IF NOT EXISTS grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    creado INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS grupo_contactos (
    grupo_id INTEGER NOT NULL,
    contacto_id INTEGER NOT NULL,
    PRIMARY KEY (grupo_id, contacto_id)
  )`,
  `CREATE TABLE IF NOT EXISTS campanias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    tema TEXT NOT NULL DEFAULT '',
    artista TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL,
    imagen TEXT NOT NULL DEFAULT '',
    asunto_a TEXT NOT NULL,
    asunto_b TEXT NOT NULL DEFAULT '',
    cuerpo TEXT NOT NULL,
    recordatorio_dias INTEGER NOT NULL DEFAULT 4,
    recordatorio_asunto TEXT NOT NULL DEFAULT '',
    recordatorio_cuerpo TEXT NOT NULL DEFAULT '',
    ab_ganador TEXT,
    estado TEXT NOT NULL DEFAULT 'borrador',
    inicio TEXT,
    creado INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS campania_grupos (
    campania_id INTEGER NOT NULL,
    grupo_id INTEGER NOT NULL,
    orden INTEGER NOT NULL,
    dia TEXT,
    PRIMARY KEY (campania_id, grupo_id)
  )`,
  `CREATE TABLE IF NOT EXISTS envios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT NOT NULL UNIQUE,
    campania_id INTEGER NOT NULL,
    contacto_id INTEGER NOT NULL,
    grupo_id INTEGER,
    tipo TEXT NOT NULL DEFAULT 'principal',
    variante TEXT,
    asunto TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente',
    programado INTEGER NOT NULL,
    enviado INTEGER,
    gmail_id TEXT,
    gmail_hilo TEXT,
    error TEXT,
    abierto INTEGER,
    aperturas INTEGER NOT NULL DEFAULT 0,
    clic INTEGER,
    clics INTEGER NOT NULL DEFAULT 0,
    escuchado INTEGER,
    respondio INTEGER,
    UNIQUE (campania_id, contacto_id, tipo)
  )`,
  `CREATE INDEX IF NOT EXISTS ix_envios_cola ON envios(estado, programado)`,
  `CREATE INDEX IF NOT EXISTS ix_envios_contacto ON envios(contacto_id)`,
  `CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    envio_id INTEGER,
    contacto_id INTEGER,
    campania_id INTEGER,
    tipo TEXT NOT NULL,
    ts INTEGER NOT NULL,
    detalle TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS ix_eventos_contacto ON eventos(contacto_id, ts)`,
  `CREATE INDEX IF NOT EXISTS ix_eventos_ts ON eventos(ts)`,
  `CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT)`,
  `CREATE TABLE IF NOT EXISTS gmail_vistos (id TEXT PRIMARY KEY, ts INTEGER)`,
];

let listo = false;
export async function asegurarEsquema(db) {
  if (listo) return;
  await db.batch(ESQUEMA.map((s) => db.prepare(s)));
  listo = true;
}

export const todos = async (db, sql, ...p) => (await db.prepare(sql).bind(...p).all()).results;
export const uno = (db, sql, ...p) => db.prepare(sql).bind(...p).first();
export const ejec = (db, sql, ...p) => db.prepare(sql).bind(...p).run();

// ---- Configuración ----
export const CONFIG_DEFECTO = {
  tope_diario: '100',       // máximo de mails por día (todas las campañas juntas)
  arranque: '30,60,100',    // arranque gradual: tope por semana desde el primer envío
  hora_desde: '10',         // ventana de envío (hora Argentina)
  hora_hasta: '20',
  hora_envio: '11',         // hora por defecto si no se conoce la mejor hora del contacto
  tanda: '8',               // mails por cada pasada del cron (cada 10 min)
  remitente_nombre: '',      // nombre artístico (se carga en Primeros pasos)
  firma: '',                 // se arma con tu nombre y tu SoundCloud si la dejás vacía
  recordatorio_dias: '4',
  frio_promos: '3',         // promos seguidas sin abrir para marcarlo frío
};

export async function leerConfig(db) {
  const filas = await todos(db, 'SELECT clave, valor FROM config');
  const c = { ...CONFIG_DEFECTO };
  for (const f of filas) c[f.clave] = f.valor;
  return c;
}

export const guardarConfig = (db, clave, valor) =>
  ejec(db, 'INSERT INTO config (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor', clave, String(valor));

export const registrarEvento = (db, { envio_id = null, contacto_id = null, campania_id = null, tipo, detalle = '', ts = Date.now() }) =>
  ejec(db, 'INSERT INTO eventos (envio_id, contacto_id, campania_id, tipo, ts, detalle) VALUES (?, ?, ?, ?, ?, ?)',
    envio_id, contacto_id, campania_id, tipo, ts, detalle);
