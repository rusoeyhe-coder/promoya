import { useEffect, useState, useCallback, createContext, useContext } from 'react';

// ---------- API ----------
export async function api(ruta, { metodo = 'GET', datos } = {}) {
  const r = await fetch(`/api/${ruta}`, {
    method: metodo,
    headers: datos ? { 'content-type': 'application/json' } : undefined,
    body: datos ? JSON.stringify(datos) : undefined,
    credentials: 'same-origin',
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && ruta !== 'login') { window.dispatchEvent(new Event('sin-sesion')); }
  if (!r.ok) throw new Error(d.error || `Error ${r.status}`);
  return d;
}

export function useDatos(ruta, deps = []) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const cargar = useCallback(() => {
    if (!ruta) return Promise.resolve();
    return api(ruta).then((d) => { setDatos(d); setError(''); }).catch((e) => setError(e.message));
  }, [ruta]);
  useEffect(() => { cargar(); }, [cargar, ...deps]);
  // Se actualiza solo cada 30 s mientras la pestaña está a la vista
  useEffect(() => {
    if (!ruta) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.modal')) cargar(); }, 30000);
    return () => clearInterval(t);
  }, [cargar]);
  return [datos, cargar, error];
}

// ---------- Ruteo por #hash ----------
export function useRuta() {
  const leer = () => (location.hash.replace(/^#\/?/, '') || 'resumen');
  const [ruta, setRuta] = useState(leer);
  useEffect(() => {
    const f = () => { setRuta(leer()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return ruta;
}
export const ir = (r) => { location.hash = '#/' + r; };

// ---------- Avisos ----------
const AvisoCtx = createContext(() => {});
export const useAviso = () => useContext(AvisoCtx);
export function ProveedorAvisos({ children }) {
  const [t, setT] = useState(null);
  const avisar = useCallback((texto, mal = false) => {
    setT({ texto, mal, id: Math.random() });
  }, []);
  useEffect(() => { if (!t) return; const x = setTimeout(() => setT(null), 3200); return () => clearTimeout(x); }, [t]);
  return (
    <AvisoCtx.Provider value={avisar}>
      {children}
      {t && <div className={`toast ${t.mal ? 'mal' : ''}`} role="status">{t.texto}</div>}
    </AvisoCtx.Provider>
  );
}

// ---------- Formatos ----------
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function fechaCorta(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getDate()} ${MESES[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
export function diaLindo(dia) {
  const d = new Date(dia + 'T12:00:00');
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}
export function hace(ms) {
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'recién';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `hace ${Math.floor(s / 86400)} d`;
  return fechaCorta(ms);
}
export const hoyISO = () => {
  const d = new Date(Date.now() - 3 * 3600e3);
  return d.toISOString().slice(0, 10);
};

// ---------- Piezas ----------
export const ESTADOS_CAMPANIA = {
  borrador: ['Borrador', ''],
  activa: ['Enviando', 'acento'],
  pausada: ['Pausada', 'aviso'],
  terminada: ['Terminada', 'ok'],
};
export function ChipCampania({ estado }) {
  const [t, c] = ESTADOS_CAMPANIA[estado] || [estado, ''];
  return <span className={`chip ${c}`}>{estado === 'activa' && <i className="punto" />}{t}</span>;
}

export const TIPOS = { dj: 'DJ', sello: 'Sello', radio: 'Radio', prensa: 'Prensa / blog', otro: 'Otro' };
export const ESTADOS_CONTACTO = { activo: ['Activo', 'ok'], baja: ['Se dio de baja', 'mal'], rebotado: ['Rebotó', 'mal'], pausado: ['Pausado', 'aviso'] };
export function ChipContacto({ c }) {
  if (c.estado !== 'activo') { const [t, k] = ESTADOS_CONTACTO[c.estado] || [c.estado, '']; return <span className={`chip ${k}`}>{t}</span>; }
  if (c.frio) return <span className="chip frio" title="No abrió las últimas promos">❄ Frío</span>;
  return null;
}

export const ICONOS_EVENTO = {
  apertura: ['✉', 'Abrió el mail', 'azul'],
  clic: ['▶', 'Tocó el link', 'acento'],
  escucha: ['🎧', 'Escuchó en SoundCloud', 'ok'],
  like: ['♥', 'Le dio like', 'ok'],
  repost: ['↻', 'Reposteó', 'ok'],
  comentario: ['💬', 'Comentó en SoundCloud', 'ok'],
  respuesta: ['↩', 'Te respondió el mail', 'ok'],
  rebote: ['⚠', 'Rebotó (el mail no existe)', 'mal'],
  baja: ['✕', 'Se dio de baja', 'mal'],
  envio: ['→', 'Se le envió', ''],
  recordatorio: ['⟳', 'Se le mandó el recordatorio', ''],
  ab: ['A/B', 'Asunto ganador', 'aviso'],
};

export function Evento({ ev, conCampania = true, conContacto = true }) {
  const [ico, txt, color] = ICONOS_EVENTO[ev.tipo] || ['•', ev.tipo, ''];
  const quien = ev.nombre || ev.email;
  return (
    <div className="ev">
      <span className={`ico chip ${color}`} style={{ padding: 0, justifyContent: 'center' }}>{ico}</span>
      <div>
        {conContacto && quien && <a href={`#/contactos/${ev.contacto_id}`}><b>{quien}</b></a>} {ev.tipo === 'ab' ? ev.detalle : txt.toLowerCase()}
        {conCampania && ev.campania && <span className="sub"> · {ev.campania}</span>}
        {ev.detalle && ev.tipo !== 'ab' && !['envio', 'recordatorio'].includes(ev.tipo) && <div className="sub">{ev.detalle}</div>}
      </div>
      <span className="cuando">{hace(ev.ts)}</span>
    </div>
  );
}

export function Modal({ titulo, onCerrar, children, pie }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onCerrar();
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [onCerrar]);
  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="modal" role="dialog" aria-label={titulo}>
        <h2>{titulo}</h2>
        {children}
        {pie && <div className="pie-modal">{pie}</div>}
      </div>
    </div>
  );
}

export function Kpi({ titulo, valor, detalle, acento }) {
  return <div className={`kpi ${acento ? 'acento' : ''}`}><small>{titulo}</small><b>{valor}</b>{detalle && <span>{detalle}</span>}</div>;
}

export function Embudo({ s }) {
  const base = s.recibidas || 0;
  const pasos = [
    ['Recibieron', base, '#555'],
    ['Abrieron', s.abiertas || 0, 'var(--azul)'],
    ['Tocaron link', s.clics || 0, 'var(--acento)'],
    ['Escucharon', s.escuchadas || 0, 'var(--ok)'],
    ['Respondieron', s.respuestas || 0, '#c792ea'],
  ];
  return (
    <div className="embudo">
      {pasos.map(([t, v, c]) => (
        <div className="paso" key={t}>
          <span className="sub" style={{ fontSize: 13 }}>{t}</span>
          <div className="pista"><i style={{ width: `${base ? Math.max(v ? 2 : 0, (v / base) * 100) : 0}%`, background: c }} /></div>
          <b>{v}{t !== 'Recibieron' && base ? <span className="sub"> {pct(v, base)}%</span> : ''}</b>
        </div>
      ))}
    </div>
  );
}

export const Icono = {
  resumen: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 13h8V3H3zM13 21h8v-8h-8zM13 3v6h8V3zM3 21h8v-4H3z" /></svg>,
  inicio: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3 8-8" /><path d="M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9" /></svg>,
  campanias: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 11l18-8-8 18-2-8-8-2z" /></svg>,
  contactos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="8" r="4" /><path d="M1 21c0-4 4-6 8-6s8 2 8 6M17 4a4 4 0 010 8M23 21c0-3-2-5-5-6" /></svg>,
  grupos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>,
  sellos: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /></svg>,
  ajustes: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" /></svg>,
};
