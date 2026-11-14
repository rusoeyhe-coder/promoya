import { useDatos, ChipCampania, pct, diaLindo } from '../ui.jsx';

export default function Campanias() {
  const [lista, , error] = useDatos('campanias');
  if (error) return <div className="aviso mal">{error}</div>;
  if (!lista) return <div className="cargando">Cargando…</div>;
  return (
    <>
      <div className="cabecera">
        <div><h1>Campañas</h1><p>Una campaña por tema: a quién se manda, qué día y cómo le fue.</p></div>
        <a className="btn primario" href="#/campanias/nueva">+ Nueva campaña</a>
      </div>
      {!lista.length ? (
        <div className="tarjeta vacio"><b>Todavía no hay campañas</b>Pegá el link de SoundCloud de tu tema nuevo y elegí los grupos.<div style={{ marginTop: 16 }}><a className="btn primario" href="#/campanias/nueva">Crear la primera</a></div></div>
      ) : (
        <div className="camp-lista">
          {lista.map((c) => {
            const total = c.contactos || 0;
            const prox = c.grupos.find((g) => g.dia && c.estado === 'activa' && g.dia >= new Date().toISOString().slice(0, 10));
            return (
              <a key={c.id} className="camp" href={`#/campanias/${c.id}`}>
                {c.imagen ? <img className="portada" src={c.imagen} alt="" /> : <span className="portada" />}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <h2 style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.nombre}</h2><ChipCampania estado={c.estado} />
                    {c.errores > 0 && <span className="chip mal">{c.errores} con error</span>}
                  </div>
                  <div className="sub" style={{ marginTop: 3 }}>
                    {c.grupos.length} {c.grupos.length === 1 ? 'grupo' : 'grupos'} · {total} contactos
                    {c.estado === 'borrador' ? '' : ` · ${c.pendientes} en cola`}
                    {prox ? ` · próximo grupo: ${diaLindo(prox.dia)}` : ''}
                  </div>
                  {total > 0 && <div className="barra"><i style={{ width: `${pct(c.recibidas, total)}%` }} /></div>}
                </div>
                <div className="nums">
                  <div><b>{c.recibidas}</b><small>Enviados</small></div>
                  <div><b>{pct(c.abiertas, c.recibidas)}%</b><small>Abrieron</small></div>
                  <div><b>{c.clics}</b><small>Clics</small></div>
                  <div><b>{c.escuchadas}</b><small>Escucharon</small></div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </>
  );
}
