import { useEffect, useState } from 'react';
import { api, useDatos, useAviso, diaLindo } from '../ui.jsx';

export default function Ajustes() {
  const [d, recargar, error] = useDatos('ajustes');
  const avisar = useAviso();
  const [f, setF] = useState(null);
  const [msgGmail, setMsgGmail] = useState('');
  useEffect(() => { if (d) setF((x) => x || d); }, [d]); // no pisar lo que estás escribiendo
  useEffect(() => {
    const m = location.hash.match(/gmail=([^&]+)/);
    if (m) setMsgGmail(decodeURIComponent(m[1]));
  }, []);
  if (error) return <div className="aviso mal">{error}</div>;
  if (!f) return <div className="cargando">Cargando…</div>;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    try { await api('ajustes', { metodo: 'PUT', datos: f }); avisar('Ajustes guardados'); recargar(); }
    catch (e) { avisar(e.message, true); }
  };
  const desconectar = async () => {
    if (!confirm('¿Desconectar Gmail? Las campañas quedan en espera hasta que lo vuelvas a conectar.')) return;
    await api('gmail/desconectar', { metodo: 'POST' }); recargar();
  };
  const escalones = String(f.arranque || '').split(',').map((x) => x.trim()).filter(Boolean);

  return (
    <>
      <div className="cabecera">
        <div><h1>Ajustes</h1><p>Gmail, límites de envío y firma.</p></div>
        <button className="btn primario" onClick={guardar}>Guardar cambios</button>
      </div>

      {msgGmail && <div className={`aviso ${msgGmail === 'ok' ? 'ok' : 'mal'}`}>{msgGmail === 'ok' ? '¡Gmail conectado!' : msgGmail}</div>}

      <div className="grilla g2">
        <div className="tarjeta">
          <h2>Gmail del proyecto</h2>
          {d.gmail.conectado ? (
            <>
              <p style={{ marginTop: 0 }}><span className="chip ok"><i className="punto" /> Conectado</span> <b>{d.gmail.email}</b></p>
              <p className="sub">Los mails salen desde esta cuenta, uno por uno, como si los mandaras vos. Una vez por hora reviso la bandeja para detectar rebotes y respuestas.</p>
              <button className="btn fantasma peligro" onClick={desconectar}>Desconectar</button>
            </>
          ) : d.gmail.configurado ? (
            <>
              <p className="sub" style={{ marginTop: 0 }}>Conectá el Gmail desde el que querés mandar las promos. Google te va a pedir permiso para enviar y leer (para detectar rebotes y respuestas).</p>
              <a className="btn primario" href="/api/gmail/conectar">Conectar Gmail</a>
            </>
          ) : (
            <div className="aviso" style={{ marginBottom: 0 }}><span>Faltan las claves de Google.</span><a className="btn chico" href="#/inicio">Ver Primeros pasos</a></div>
          )}
          <details style={{ marginTop: 14 }}>
            <summary className="sub" style={{ cursor: 'pointer' }}>Claves de Google (cliente OAuth)</summary>
            <div style={{ marginTop: 10 }}>
              <div className="campo"><label htmlFor="gid">ID de cliente</label><input id="gid" type="text" value={f.google_client_id} onChange={set('google_client_id')} autoComplete="off" /></div>
              <div className="campo"><label htmlFor="gse">Secreto del cliente</label><input id="gse" type="password" value={f.google_client_secret || ''} onChange={set('google_client_secret')} placeholder={d.google_secreto_cargado ? 'Cargado (dejalo vacío para no cambiarlo)' : ''} autoComplete="off" /></div>
              <span className="ayuda">Dirección de redirección para Google: <code>{d.redireccion}</code>. Guardá con «Guardar cambios».</span>
            </div>
          </details>
        </div>

        <div className="tarjeta">
          <h2>Límites de envío</h2>
          <div className="fila">
            <div className="campo"><label htmlFor="tope">Máximo por día</label><input id="tope" type="number" min={1} max={400} value={f.tope_diario} onChange={set('tope_diario')} />
              <span className="ayuda">Sumando todas las campañas.</span></div>
            <div className="campo"><label htmlFor="arr">Arranque gradual</label><input id="arr" type="text" value={f.arranque} onChange={set('arranque')} />
              <span className="ayuda">{escalones.length ? escalones.map((x, i) => `sem. ${i + 1}${i === escalones.length - 1 ? '+' : ''}: ${x}`).join(' · ') : 'Vacío = sin arranque gradual'}</span></div>
          </div>
          <div className="fila">
            <div className="campo"><label htmlFor="hd">Mandar desde las</label><input id="hd" type="number" min={0} max={23} value={f.hora_desde} onChange={set('hora_desde')} /></div>
            <div className="campo"><label htmlFor="hh">Hasta las</label><input id="hh" type="number" min={1} max={24} value={f.hora_hasta} onChange={set('hora_hasta')} /></div>
            <div className="campo"><label htmlFor="he">Hora por defecto</label><input id="he" type="number" min={0} max={23} value={f.hora_envio} onChange={set('hora_envio')} /></div>
          </div>
          <p className="sub" style={{ margin: 0 }}>Hora Argentina. Cuando un contacto ya abrió mails, se le manda a la hora en que suele abrir. {f.primer_envio ? `Primer envío: ${diaLindo(f.primer_envio)}.` : ''}</p>
        </div>

        <div className="tarjeta">
          <h2>Tus datos y firma</h2>
          <div className="fila">
            <div className="campo"><label htmlFor="rn">Nombre artístico</label><input id="rn" type="text" value={f.remitente_nombre} onChange={set('remitente_nombre')} /></div>
            <div className="campo"><label htmlFor="sp">Tu SoundCloud</label><input id="sp" type="text" value={f.soundcloud_perfil} onChange={set('soundcloud_perfil')} placeholder="soundcloud.com/tu-usuario" /></div>
          </div>
          <div className="campo" style={{ marginBottom: 0 }}><label htmlFor="fi">Firma</label><textarea id="fi" rows={4} style={{ minHeight: 90 }} value={f.firma} onChange={set('firma')} placeholder="Vacía = tu nombre y tu SoundCloud" /></div>
        </div>

        <div className="tarjeta">
          <h2>Seguimiento</h2>
          <div className="campo"><label htmlFor="rd">Recordatorio por defecto (días)</label><input id="rd" type="number" min={0} max={30} value={f.recordatorio_dias} onChange={set('recordatorio_dias')} /></div>
          <div className="campo"><label htmlFor="fp">Marcar como frío después de</label>
            <select id="fp" value={f.frio_promos} onChange={set('frio_promos')}>{[2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} promos seguidas sin abrir</option>)}</select></div>
          <div className="campo" style={{ marginBottom: 0 }}><label htmlFor="ta">Mails por tanda (cada 10 min)</label><input id="ta" type="number" min={1} max={30} value={f.tanda} onChange={set('tanda')} />
            <span className="ayuda">Mandar de a poco se ve más natural para Gmail.</span></div>
        </div>

        <CambiarClave />
      </div>
    </>
  );
}

function CambiarClave() {
  const avisar = useAviso();
  const [x, setX] = useState({ actual: '', nueva: '', repetir: '' });
  const set = (k) => (e) => setX((v) => ({ ...v, [k]: e.target.value }));
  const cambiar = async (e) => {
    e.preventDefault();
    if (x.nueva !== x.repetir) return avisar('Las contraseñas nuevas no coinciden', true);
    try { await api('cambiar-clave', { metodo: 'POST', datos: x }); setX({ actual: '', nueva: '', repetir: '' }); avisar('Contraseña cambiada'); }
    catch (er) { avisar(er.message, true); }
  };
  return (
    <form className="tarjeta" onSubmit={cambiar}>
      <h2>Contraseña del panel</h2>
      <div className="campo"><label htmlFor="ca">Actual</label><input id="ca" type="password" value={x.actual} onChange={set('actual')} autoComplete="current-password" /></div>
      <div className="fila">
        <div className="campo"><label htmlFor="cn">Nueva</label><input id="cn" type="password" value={x.nueva} onChange={set('nueva')} autoComplete="new-password" /></div>
        <div className="campo"><label htmlFor="cr">Repetila</label><input id="cr" type="password" value={x.repetir} onChange={set('repetir')} autoComplete="new-password" /></div>
      </div>
      <button className="btn" disabled={!x.actual || !x.nueva}>Cambiar contraseña</button>
    </form>
  );
}
