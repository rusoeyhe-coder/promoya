import { useState } from 'react';
import { api, useDatos, useAviso, Modal, TIPOS, ChipContacto } from '../ui.jsx';

function Auto({ onCerrar, onListo, total }) {
  const avisar = useAviso();
  const [f, setF] = useState({ tamanio: 25, tipo: '', etiqueta: '', prefijo: 'Grupo', excluirFrios: true, mezclar: true });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const crear = async () => {
    try { const r = await api('grupos/auto', { metodo: 'POST', datos: { ...f, tamanio: Number(f.tamanio) } }); avisar(`${r.creados.length} grupos creados`); onListo(); }
    catch (e) { avisar(e.message, true); }
  };
  const cant = Math.ceil(total / Math.max(1, Number(f.tamanio) || 1));
  return (
    <Modal titulo="Armar grupos automáticamente" onCerrar={onCerrar} pie={<><button className="btn fantasma" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={crear}>Crear grupos</button></>}>
      <div className="fila">
        <div className="campo"><label htmlFor="at">Personas por grupo</label><input id="at" type="number" min={1} max={400} value={f.tamanio} onChange={set('tamanio')} />
          <span className="ayuda">Con {total} activos salen unos {cant} grupos (uno por día).</span></div>
        <div className="campo"><label htmlFor="ap">Nombre</label><input id="ap" type="text" value={f.prefijo} onChange={set('prefijo')} /><span className="ayuda">Quedan «{f.prefijo} 1», «{f.prefijo} 2»…</span></div>
      </div>
      <div className="fila">
        <div className="campo"><label htmlFor="ati">Solo de este tipo</label>
          <select id="ati" value={f.tipo} onChange={set('tipo')}><option value="">Todos</option>{Object.entries(TIPOS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></div>
        <div className="campo"><label htmlFor="ae">Solo con la etiqueta</label><input id="ae" type="text" value={f.etiqueta} onChange={set('etiqueta')} placeholder="(opcional)" /></div>
      </div>
      <label className="check" style={{ marginBottom: 8 }}><input type="checkbox" checked={f.excluirFrios} onChange={set('excluirFrios')} /> Dejar afuera a los contactos fríos</label>
      <label className="check"><input type="checkbox" checked={f.mezclar} onChange={set('mezclar')} /> Mezclarlos al azar</label>
    </Modal>
  );
}

function Editar({ grupo, contactos, onCerrar, onListo }) {
  const avisar = useAviso();
  const [nombre, setNombre] = useState(grupo?.nombre || '');
  const [sel, setSel] = useState(new Set(grupo?.contactos || []));
  const [busca, setBusca] = useState('');
  const q = busca.toLowerCase();
  const vis = contactos.filter((c) => !q || `${c.nombre} ${c.email} ${c.etiquetas}`.toLowerCase().includes(q));
  const alternar = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const guardar = async () => {
    try {
      if (grupo?.id) await api(`grupos/${grupo.id}`, { metodo: 'PUT', datos: { nombre, contactos: [...sel] } });
      else await api('grupos', { metodo: 'POST', datos: { nombre, contactos: [...sel] } });
      avisar('Grupo guardado'); onListo();
    } catch (e) { avisar(e.message, true); }
  };
  return (
    <Modal titulo={grupo?.id ? 'Editar grupo' : 'Nuevo grupo'} onCerrar={onCerrar} pie={<><span className="sub" style={{ marginRight: 'auto', alignSelf: 'center' }}>{sel.size} elegidos</span><button className="btn fantasma" onClick={onCerrar}>Cancelar</button><button className="btn primario" onClick={guardar}>Guardar</button></>}>
      <div className="campo"><label htmlFor="gn">Nombre</label><input id="gn" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus /></div>
      <div className="filtros">
        <input type="search" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" style={{ maxWidth: 'none', flex: 1 }} />
        <button className="btn chico" onClick={() => setSel((s) => new Set([...s, ...vis.map((c) => c.id)]))}>Todos</button>
        <button className="btn chico" onClick={() => setSel((s) => { const n = new Set(s); vis.forEach((c) => n.delete(c.id)); return n; })}>Ninguno</button>
      </div>
      <div className="grupo-sel" style={{ maxHeight: 340 }}>
        {vis.map((c) => (
          <label key={c.id} className={`grupo-item ${sel.has(c.id) ? 'elegido' : ''}`} style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.has(c.id)} onChange={() => alternar(c.id)} style={{ accentColor: 'var(--acento)' }} />
            <div style={{ minWidth: 0 }}><b>{c.nombre || c.email}</b> <span className="sub">{c.email}</span></div>
            <span style={{ marginLeft: 'auto' }}><ChipContacto c={c} /></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function Grupos() {
  const [grupos, recargar, error] = useDatos('grupos');
  const [contactos, recargarC] = useDatos('contactos');
  const avisar = useAviso();
  const [modal, setModal] = useState(null);
  if (error) return <div className="aviso mal">{error}</div>;
  if (!grupos || !contactos) return <div className="cargando">Cargando…</div>;
  const activos = contactos.filter((c) => c.estado === 'activo');
  const sinGrupo = activos.filter((c) => !c.grupos).length;

  const abrir = async (g) => { try { setModal({ tipo: 'editar', grupo: await api(`grupos/${g.id}`) }); } catch (e) { avisar(e.message, true); } };
  const borrar = async (g) => {
    if (!confirm(`¿Borrar el grupo "${g.nombre}"? Los contactos no se borran.`)) return;
    try { await api(`grupos/${g.id}`, { metodo: 'DELETE' }); avisar('Grupo borrado'); recargar(); recargarC(); }
    catch (e) { avisar(e.message, true); }
  };
  const borrarTodos = async () => {
    if (!confirm(`¿Borrar los ${grupos.length} grupos? Los contactos no se borran.`)) return;
    for (const g of grupos) { try { await api(`grupos/${g.id}`, { metodo: 'DELETE' }); } catch (e) { avisar(e.message, true); } }
    recargar(); recargarC();
  };
  const listo = () => { setModal(null); recargar(); recargarC(); };

  return (
    <>
      <div className="cabecera">
        <div><h1>Grupos</h1><p>Cada día de una campaña sale un grupo. Así mandás de a poco y no quemás el Gmail.</p></div>
        <div className="acciones">
          {grupos.length > 1 && <button className="btn fantasma peligro" onClick={borrarTodos}>Borrar todos</button>}
          <button className="btn" onClick={() => setModal({ tipo: 'editar', grupo: null })}>+ Grupo a mano</button>
          <button className="btn primario" onClick={() => setModal({ tipo: 'auto' })} disabled={!activos.length}>Armar automáticamente</button>
        </div>
      </div>
      {sinGrupo > 0 && grupos.length > 0 && <div className="aviso info">{sinGrupo} contactos activos no están en ningún grupo.</div>}
      {!grupos.length ? (
        <div className="tarjeta vacio"><b>No hay grupos</b>{activos.length ? `Tenés ${activos.length} contactos activos. Dividilos en grupos de, por ejemplo, 25.` : 'Primero cargá tus contactos.'}
          <div style={{ marginTop: 16 }}>{activos.length ? <button className="btn primario" onClick={() => setModal({ tipo: 'auto' })}>Armar automáticamente</button> : <a className="btn primario" href="#/contactos">Ir a Contactos</a>}</div></div>
      ) : (
        <div className="tabla-envoltura">
          <table>
            <thead><tr><th>Grupo</th><th className="num">Contactos</th><th className="num">Activos</th><th></th></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.id} className="clic" onClick={() => abrir(g)}>
                  <td><b>{g.nombre}</b></td><td className="num">{g.cantidad}</td><td className="num">{g.activos || 0}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn chico fantasma peligro" onClick={(e) => { e.stopPropagation(); borrar(g); }}>Borrar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal?.tipo === 'auto' && <Auto total={activos.length} onCerrar={() => setModal(null)} onListo={listo} />}
      {modal?.tipo === 'editar' && <Editar grupo={modal.grupo} contactos={contactos} onCerrar={() => setModal(null)} onListo={listo} />}
    </>
  );
}
