import { useState } from 'react';
import { api, useDatos, useAviso, ir, Modal, ChipContacto, Evento, Kpi, TIPOS, pct, fechaCorta } from '../ui.jsx';
import { FormContacto } from './Contactos.jsx';

const ESTADO_ENVIO = { enviado: 'Enviado', pendiente: 'En cola', error: 'Error', rebotado: 'Rebotó', cancelado: 'Cancelado' };

export default function Ficha({ id }) {
  const [c, recargar, error] = useDatos(`contactos/${id}`);
  const avisar = useAviso();
  const [editar, setEditar] = useState(false);
  if (error) return <div className="aviso mal">{error}</div>;
  if (!c) return <div className="cargando">Cargando…</div>;

  // Una fila por campaña
  const porCamp = new Map();
  for (const e of c.historial) {
    if (!porCamp.has(e.campania_id)) porCamp.set(e.campania_id, { campania: e.campania, id: e.campania_id, grupo: e.grupo });
    porCamp.get(e.campania_id)[e.tipo] = e;
  }
  const camps = [...porCamp.values()];
  const recibidas = camps.filter((x) => x.principal?.estado === 'enviado' || x.principal?.estado === 'rebotado').length;
  const senal = (x, k) => x.principal?.[k] || x.recordatorio?.[k];
  const abiertas = camps.filter((x) => senal(x, 'abierto')).length;
  const clics = camps.filter((x) => senal(x, 'clic')).length;
  const escuchadas = camps.filter((x) => senal(x, 'escuchado')).length;
  const respuestas = camps.filter((x) => senal(x, 'respondio')).length;

  const borrar = async () => {
    if (!confirm(`¿Borrar a ${c.nombre || c.email}? Se pierde su historial. No se puede deshacer.`)) return;
    try { await api(`contactos/${id}`, { metodo: 'DELETE' }); avisar('Contacto borrado'); ir('contactos'); }
    catch (e) { avisar(e.message, true); }
  };

  return (
    <>
      <div className="cabecera">
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h1>{c.nombre || c.email}</h1><ChipContacto c={c} /></div>
          <p>
            {c.email} · {TIPOS[c.tipo] || c.tipo}{c.pais ? ` · ${c.pais}` : ''}
            {c.soundcloud && <> · <a href={`https://soundcloud.com/${c.soundcloud}`} target="_blank" rel="noreferrer">@{c.soundcloud} ↗</a></>}
          </p>
        </div>
        <div className="acciones">
          <a className="btn fantasma" href="#/contactos">← Contactos</a>
          <button className="btn" onClick={() => setEditar(true)}>Editar</button>
          <button className="btn fantasma peligro" onClick={borrar}>Borrar</button>
        </div>
      </div>

      {c.frio && c.estado === 'activo' && <div className="aviso info"><span>❄ <b>Contacto frío:</b> no abrió las últimas promos. Probá escribirle personalmente o sacalo de los grupos.</span></div>}
      {!c.soundcloud && <div className="aviso"><span>Falta su usuario de SoundCloud: sin eso no puedo detectar si escuchó.</span><button className="btn chico" onClick={() => setEditar(true)}>Cargarlo</button></div>}

      <div className="kpis">
        <Kpi titulo="Promos recibidas" valor={recibidas} />
        <Kpi titulo="Abrió" valor={`${pct(abiertas, recibidas)}%`} detalle={`${abiertas} de ${recibidas}`} acento />
        <Kpi titulo="Tocó el link" valor={clics} />
        <Kpi titulo="Escuchó" valor={escuchadas} detalle={`${respuestas} respuestas`} />
        <Kpi titulo="Mejor hora" valor={`${String(c.mejorHora.hora).padStart(2, '0')}:00`} detalle={c.mejorHora.aprendida ? 'aprendida de sus aperturas' : 'por defecto (todavía no hay datos)'} />
      </div>

      <div className="grilla lado">
        <div>
          <h2 style={{ marginBottom: 10 }}>Promos que le mandaste</h2>
          <div className="tabla-envoltura">
            <table>
              <thead><tr><th>Campaña</th><th>Mail</th><th>Recordatorio</th><th>Abrió</th><th>Link</th><th>Escuchó</th><th>Respondió</th></tr></thead>
              <tbody>
                {camps.map((x) => (
                  <tr key={x.id} className="clic" onClick={() => ir(`campanias/${x.id}`)}>
                    <td><b>{x.campania}</b><div className="sub">{x.grupo}</div></td>
                    <td>{x.principal ? (x.principal.estado === 'enviado' ? fechaCorta(x.principal.enviado) : <span className="chip">{ESTADO_ENVIO[x.principal.estado]}</span>) : '—'}</td>
                    <td>{x.recordatorio ? (x.recordatorio.estado === 'enviado' ? fechaCorta(x.recordatorio.enviado) : <span className="chip">{ESTADO_ENVIO[x.recordatorio.estado]}</span>) : <span className="no">—</span>}</td>
                    <td>{senal(x, 'abierto') ? <span className="si">✓</span> : <span className="no">—</span>}</td>
                    <td>{senal(x, 'clic') ? <span className="si">✓</span> : <span className="no">—</span>}</td>
                    <td>{senal(x, 'escuchado') ? <span className="si">🎧</span> : <span className="no">—</span>}</td>
                    <td>{senal(x, 'respondio') ? <span className="si">↩</span> : <span className="no">—</span>}</td>
                  </tr>
                ))}
                {!camps.length && <tr><td colSpan={7} className="vacio">Todavía no le mandaste ninguna promo.</td></tr>}
              </tbody>
            </table>
          </div>
          {c.notas && <div className="tarjeta" style={{ marginTop: 16 }}><h3 style={{ marginBottom: 6 }}>Notas</h3><div style={{ whiteSpace: 'pre-wrap' }}>{c.notas}</div></div>}
          <div className="mini-stats" style={{ marginTop: 14 }}>
            <span>Grupos: <b>{c.grupos.map((g) => g.nombre).join(', ') || 'ninguno'}</b></span>
            {c.etiquetas && <span>Etiquetas: <b>{c.etiquetas}</b></span>}
            <span>Cargado: <b>{fechaCorta(c.creado)}</b></span>
          </div>
        </div>
        <div className="tarjeta">
          <h2>Historial</h2>
          {c.eventos.length ? <div className="feed">{c.eventos.map((ev) => <Evento key={ev.id} ev={ev} conContacto={false} />)}</div>
            : <div className="vacio" style={{ padding: 20 }}>Sin movimiento todavía.</div>}
        </div>
      </div>

      {editar && <Modal titulo="Editar contacto" onCerrar={() => setEditar(false)}><FormContacto inicial={c} onCancelar={() => setEditar(false)} onGuardado={() => { setEditar(false); recargar(); }} /></Modal>}
    </>
  );
}
