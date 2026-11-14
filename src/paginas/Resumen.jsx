import { useState } from 'react';
import { api, useDatos, Kpi, Embudo, Evento, diaLindo, useAviso, pct } from '../ui.jsx';

export default function Resumen() {
  const [d, recargar, error] = useDatos('resumen');
  const avisar = useAviso();
  const [corriendo, setCorriendo] = useState(false);
  if (error) return <div className="aviso mal">{error}</div>;
  if (!d) return <div className="cargando">Cargando…</div>;

  const maxDia = Math.max(1, ...d.proyeccion.map((x) => Math.max(x.tope, x.salen + x.ya)));
  const pendientesProx = d.proyeccion.reduce((a, x) => a + x.salen, 0);

  const tanda = async () => {
    setCorriendo(true);
    try {
      const r = await api('tick', { metodo: 'POST', datos: { forzar: true } });
      avisar(r.sinGmail ? 'Gmail no está conectado' : r.fueraDeHorario ? 'Fuera del horario de envío' : `Tanda: ${r.enviados} enviados${r.recordatorios ? `, ${r.recordatorios} recordatorios creados` : ''}`);
      recargar();
    } catch (e) { avisar(e.message, true); }
    finally { setCorriendo(false); }
  };

  return (
    <>
      <div className="cabecera">
        <div><h1>Resumen</h1><p>Cómo vienen tus promos.</p></div>
        <div className="acciones">
          {d.modoPrueba && <button className="btn" onClick={tanda} disabled={corriendo}>{corriendo ? 'Enviando…' : 'Simular una tanda'}</button>}
          <a className="btn primario" href="#/campanias/nueva">+ Nueva campaña</a>
        </div>
      </div>

      {d.modoPrueba && <div className="aviso info"><span><b>Modo prueba:</b> los envíos se simulan, no sale ningún mail real.</span></div>}
      {!d.modoPrueba && !d.gmail.conectado && (
        <div className="aviso"><span><b>Gmail sin conectar.</b> Las campañas quedan en espera hasta que conectes el Gmail del proyecto.</span><a className="btn chico" href="#/ajustes">Conectar</a></div>
      )}

      <div className="kpis">
        <Kpi titulo="Contactos activos" valor={d.activos} detalle={d.frios ? `${d.frios} fríos` : `${d.contactos} en total`} />
        <Kpi titulo="Hoy" valor={`${d.cupo.enviados}/${d.cupo.tope}`} detalle={`quedan ${d.cupo.restante} mails`} acento />
        <Kpi titulo="Campañas enviando" valor={d.activas} detalle={`${d.pendientes} mails en cola`} />
        <Kpi titulo="Abrieron" valor={`${pct(d.abiertas, d.recibidas)}%`} detalle={`${d.abiertas} de ${d.recibidas}`} />
        <Kpi titulo="Escucharon" valor={d.escuchadas} detalle={`${d.clics} tocaron el link`} />
      </div>

      <div className="grilla lado">
        <div className="tarjeta">
          <h2>Próximos 14 días</h2>
          {pendientesProx === 0 && !d.proyeccion[0].ya
            ? <div className="vacio" style={{ padding: 24 }}>No hay envíos programados.</div>
            : (
              <div className="dias">
                {d.proyeccion.map((x, i) => (
                  <div className="dia" key={x.dia} title={Object.entries(x.porCampania).map(([k, v]) => `${k}: ${v}`).join('\n')}>
                    <span className={i === 0 ? '' : 'sub'}>{i === 0 ? 'Hoy' : diaLindo(x.dia)}</span>
                    <div className="pista">
                      <i className="ya" style={{ width: `${((x.ya + x.salen) / maxDia) * 100}%` }} />
                      <i style={{ left: `${(x.ya / maxDia) * 100}%`, width: `${(x.salen / maxDia) * 100}%` }} />
                    </div>
                    <span className="num">{x.ya + x.salen}<span className="sub">/{x.tope}</span></span>
                  </div>
                ))}
              </div>
            )}
          {d.proyeccion.some((x) => x.atrasados) && <p className="sub" style={{ marginBottom: 0 }}>Algunos días superan el tope: lo que no entra pasa al día siguiente.</p>}
          <p className="sub" style={{ marginBottom: 0 }}>El tope sube solo: arranca con menos mails por día y crece por semana para cuidar tu Gmail.</p>
        </div>
        <div className="tarjeta">
          <h2>Todas las campañas</h2>
          <Embudo s={d} />
        </div>
      </div>

      <div className="tarjeta">
        <h2>Actividad reciente</h2>
        {d.eventos.length ? <div className="feed">{d.eventos.map((ev) => <Evento key={ev.id} ev={ev} />)}</div>
          : <div className="vacio" style={{ padding: 24 }}>Acá vas a ver quién abre, escucha y responde.</div>}
      </div>
    </>
  );
}
