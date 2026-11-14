import { useState } from 'react';
import { api, useDatos, useAviso, ir, ChipCampania, Kpi, Embudo, Evento, pct, diaLindo, fechaCorta, TIPOS } from '../ui.jsx';

const FILTROS = [
  ['todos', 'Todos'],
  ['cola', 'En cola'],
  ['abrio', 'Abrieron'],
  ['noabrio', 'No abrieron'],
  ['clic', 'Tocaron el link'],
  ['escucho', 'Escucharon'],
  ['respondio', 'Respondieron'],
  ['problema', 'Con problemas'],
];

function estadoEnvio(e) {
  if (!e) return <span className="no">—</span>;
  if (e.estado === 'enviado') return <span title={fechaCorta(e.enviado)}>{fechaCorta(e.enviado)}</span>;
  if (e.estado === 'pendiente') return <span className="chip">{fechaCorta(e.programado)}</span>;
  if (e.estado === 'error') return <span className="chip mal" title={e.error}>Error</span>;
  if (e.estado === 'rebotado') return <span className="chip mal">Rebotó</span>;
  return <span className="chip">Cancelado</span>;
}

export default function Campania({ id }) {
  const [c, recargar, error] = useDatos(`campanias/${id}`);
  const avisar = useAviso();
  const [filtro, setFiltro] = useState('todos');
  const [busca, setBusca] = useState('');
  if (error) return <div className="aviso mal">{error}</div>;
  if (!c) return <div className="cargando">Cargando…</div>;

  const accion = async (a, msg) => {
    try { await api(`campanias/${id}/${a}`, { metodo: 'POST' }); avisar(msg); recargar(); }
    catch (e) { avisar(e.message, true); }
  };
  const borrar = async () => {
    if (!confirm(`¿Borrar la campaña "${c.nombre}" con todas sus estadísticas? No se puede deshacer.`)) return;
    try { await api(`campanias/${id}`, { metodo: 'DELETE' }); avisar('Campaña borrada'); ir('campanias'); }
    catch (e) { avisar(e.message, true); }
  };
  const escuchado = async (fila) => {
    const e = fila.principal || fila.recordatorio;
    try { await api(`envios/${e.id}/escuchado`, { metodo: 'POST', datos: { quitar: Boolean(fila.escuchado) } }); recargar(); }
    catch (x) { avisar(x.message, true); }
  };

  const s = c.stats;
  const q = busca.toLowerCase();
  const filas = c.contactos.filter((x) => {
    if (q && !`${x.nombre} ${x.email} ${x.soundcloud}`.toLowerCase().includes(q)) return false;
    const enviado = x.principal?.estado === 'enviado';
    switch (filtro) {
      case 'cola': return x.principal?.estado === 'pendiente' || x.recordatorio?.estado === 'pendiente';
      case 'abrio': return x.abierto;
      case 'noabrio': return enviado && !x.abierto;
      case 'clic': return x.clic;
      case 'escucho': return x.escuchado;
      case 'respondio': return x.respondio;
      case 'problema': return ['error', 'rebotado'].includes(x.principal?.estado) || x.estado_contacto !== 'activo';
      default: return true;
    }
  });
  const porGrupo = new Map(c.porGrupo.map((g) => [g.grupo_id, g]));
  const va = c.porVariante.find((v) => v.variante === 'A');
  const vb = c.porVariante.find((v) => v.variante === 'B');

  return (
    <>
      <div className="cabecera">
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {c.imagen ? <img className="portada" src={c.imagen} alt="" /> : <span className="portada" />}
          <div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}><h1>{c.nombre}</h1><ChipCampania estado={c.estado} /></div>
            <p>{c.artista} — {c.tema} · <a href={c.link} target="_blank" rel="noreferrer">abrir en SoundCloud ↗</a></p>
          </div>
        </div>
        <div className="acciones">
          {c.estado === 'borrador' && <button className="btn primario" onClick={() => accion('activar', 'Campaña en marcha')}>Activar</button>}
          {c.estado === 'activa' && <button className="btn" onClick={() => accion('pausar', 'Campaña pausada')}>Pausar</button>}
          {c.estado === 'pausada' && <button className="btn primario" onClick={() => accion('reanudar', 'Campaña reanudada')}>Reanudar</button>}
          {c.errores > 0 && <button className="btn" onClick={() => accion('reintentar', 'Se van a reintentar')}>Reintentar {c.errores} con error</button>}
          <a className="btn" href={`#/campanias/${id}/editar`}>Editar</a>
          {c.estado !== 'activa' && <button className="btn fantasma peligro" onClick={borrar}>Borrar</button>}
        </div>
      </div>

      {c.estado === 'borrador' && <div className="aviso info">Es un borrador: no se manda nada hasta que la actives.</div>}

      <div className="kpis">
        <Kpi titulo="Enviados" valor={`${s.recibidas || 0}/${s.contactos || 0}`} detalle={`${c.pendientes || 0} en cola`} />
        <Kpi titulo="Abrieron" valor={`${pct(s.abiertas, s.recibidas)}%`} detalle={`${s.abiertas || 0} contactos`} acento />
        <Kpi titulo="Tocaron el link" valor={`${pct(s.clics, s.recibidas)}%`} detalle={`${s.clics || 0} contactos`} />
        <Kpi titulo="Escucharon" valor={s.escuchadas || 0} detalle={`${s.respuestas || 0} respondieron`} />
        <Kpi titulo="Problemas" valor={(c.rebotes || 0) + (c.bajas || 0)} detalle={`${c.rebotes || 0} rebotes · ${c.bajas || 0} bajas`} />
      </div>

      <div className="grilla lado">
        <div className="tarjeta">
          <h2>Grupos</h2>
          <div className="tabla-envoltura" style={{ border: 0 }}>
            <table>
              <thead><tr><th>#</th><th>Grupo</th><th>Día</th><th className="num">Enviados</th><th className="num">Abrieron</th><th className="num">Clics</th><th className="num">Escucharon</th></tr></thead>
              <tbody>
                {c.grupos.map((g) => {
                  const x = porGrupo.get(g.grupo_id) || {};
                  return (
                    <tr key={g.grupo_id}>
                      <td>{g.orden + 1}</td><td><b>{g.nombre}</b></td>
                      <td>{g.dia ? diaLindo(g.dia) : '—'}</td>
                      <td className="num">{x.recibidas || 0}/{x.contactos || g.activos}</td>
                      <td className="num">{pct(x.abiertas, x.recibidas)}%</td>
                      <td className="num">{x.clics || 0}</td>
                      <td className="num">{x.escuchadas || 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="tarjeta">
          <h2>Embudo</h2>
          <Embudo s={s} />
          {c.asunto_b && (
            <>
              <div className="sep" />
              <h3 style={{ marginBottom: 8 }}>Asuntos A/B {c.ab_ganador && <span className="chip aviso">Ganó {c.ab_ganador}</span>}</h3>
              {[['A', c.asunto_a, va], ['B', c.asunto_b, vb]].map(([k, t, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0' }}>
                  <span><b>{k}</b> <span className="sub">{t}</span></span>
                  <span style={{ whiteSpace: 'nowrap' }}>{v ? `${pct(v.abiertas, v.enviados)}% (${v.abiertas}/${v.enviados})` : '—'}</span>
                </div>
              ))}
              {!c.ab_ganador && <p className="sub" style={{ margin: '6px 0 0' }}>El ganador se elige a las 24 h de terminar el primer grupo.</p>}
            </>
          )}
        </div>
      </div>

      <div className="bloque" style={{ marginTop: 16 }}>
        <div className="filtros">
          <input type="search" placeholder="Buscar contacto…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar contacto" />
          <div className="pestanias">
            {FILTROS.map(([k, t]) => <button key={k} className={`pestania ${filtro === k ? 'activa' : ''}`} onClick={() => setFiltro(k)}>{t}</button>)}
          </div>
        </div>
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th>Contacto</th><th>Grupo</th><th>Mail</th><th>Recordatorio</th><th>Abrió</th><th>Link</th><th>Escuchó</th><th>Respondió</th></tr></thead>
            <tbody>
              {filas.map((x) => (
                <tr key={x.contacto_id}>
                  <td><a href={`#/contactos/${x.contacto_id}`}><b>{x.nombre || x.email}</b></a><div className="sub">{TIPOS[x.tipo] || x.tipo}{x.soundcloud ? ` · @${x.soundcloud}` : ''}</div></td>
                  <td className="sub">{x.grupo}</td>
                  <td>{estadoEnvio(x.principal)}{x.principal?.variante && c.asunto_b && <span className="sub"> ({x.principal.variante})</span>}</td>
                  <td>{estadoEnvio(x.recordatorio)}</td>
                  <td>{x.abierto ? <span className="si" title={fechaCorta(x.abierto)}>✓ {x.aperturas > 1 ? `×${x.aperturas}` : ''}</span> : <span className="no">—</span>}</td>
                  <td>{x.clic ? <span className="si" title={fechaCorta(x.clic)}>✓ {x.clics > 1 ? `×${x.clics}` : ''}</span> : <span className="no">—</span>}</td>
                  <td>
                    <button className="btn chico fantasma" onClick={() => escuchado(x)} title={x.escuchado ? 'Quitar' : 'Marcar como escuchado'} disabled={!x.principal || x.principal.estado !== 'enviado'}>
                      {x.escuchado ? <span className="si">🎧 Sí</span> : <span className="no">Marcar</span>}
                    </button>
                  </td>
                  <td>{x.respondio ? <span className="si">↩ Sí</span> : <span className="no">—</span>}</td>
                </tr>
              ))}
              {!filas.length && <tr><td colSpan={8} className="vacio">Nadie en este filtro.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="tarjeta" style={{ marginTop: 16 }}>
        <h2>Actividad</h2>
        {c.eventos.length ? <div className="feed">{c.eventos.map((ev) => <Evento key={ev.id} ev={ev} conCampania={false} />)}</div>
          : <div className="vacio" style={{ padding: 20 }}>Todavía no hay movimiento.</div>}
      </div>
    </>
  );
}
