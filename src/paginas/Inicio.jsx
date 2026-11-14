import { useEffect, useState } from 'react';
import { api, useDatos, useAviso } from '../ui.jsx';

function Paso({ n, titulo, hecho, abierto, onAbrir, children, resumen }) {
  return (
    <div className="tarjeta paso-inicio">
      <button className="paso-cab" onClick={onAbrir} aria-expanded={abierto}>
        <span className={`paso-num ${hecho ? 'hecho' : ''}`}>{hecho ? '✓' : n}</span>
        <span style={{ flex: 1, textAlign: 'left' }}><b>{titulo}</b>{resumen && <span className="sub" style={{ display: 'block' }}>{resumen}</span>}</span>
        <span className="sub">{abierto ? '▲' : '▼'}</span>
      </button>
      {abierto && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

function Copiar({ texto }) {
  const avisar = useAviso();
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <input type="text" readOnly value={texto} onFocus={(e) => e.target.select()} aria-label="Texto para copiar" />
      <button className="btn" onClick={() => navigator.clipboard.writeText(texto).then(() => avisar('Copiado'))}>Copiar</button>
    </div>
  );
}

export default function Inicio({ onCambio }) {
  const [d, recargar, error] = useDatos('inicio');
  const avisar = useAviso();
  const [abierto, setAbierto] = useState(null);
  const [datos, setDatos] = useState(null);
  const [google, setGoogle] = useState({ id: '', secreto: '' });
  const [msgGmail, setMsgGmail] = useState('');

  useEffect(() => {
    if (!d) return;
    setDatos((x) => x || { remitente_nombre: d.artista, soundcloud_perfil: d.soundcloud, firma: d.firma });
    setGoogle((x) => (x.id ? x : { id: d.googleId, secreto: '' }));
    setAbierto((x) => x ?? (!d.artista ? 1 : !d.gmailConectado ? 2 : !d.contactos ? 3 : !d.grupos ? 4 : 5));
  }, [d]);
  useEffect(() => {
    const m = location.hash.match(/gmail=([^&]+)/);
    if (m) setMsgGmail(decodeURIComponent(m[1]));
  }, []);

  if (error) return <div className="aviso mal">{error}</div>;
  if (!d || !datos) return <div className="cargando">Cargando…</div>;

  const guardarDatos = async () => {
    if (!datos.remitente_nombre.trim()) return avisar('Poné tu nombre artístico', true);
    try { await api('ajustes', { metodo: 'PUT', datos }); avisar('Guardado'); await recargar(); onCambio?.(); setAbierto(2); }
    catch (e) { avisar(e.message, true); }
  };
  const guardarGoogle = async () => {
    if (!google.id.trim() || (!google.secreto.trim() && !d.googleSecreto)) return avisar('Pegá las dos claves', true);
    if (!/\.apps\.googleusercontent\.com$/.test(google.id.trim())) return avisar('El ID de cliente termina en .apps.googleusercontent.com', true);
    try { await api('ajustes', { metodo: 'PUT', datos: { google_client_id: google.id, google_client_secret: google.secreto } }); setGoogle((g) => ({ ...g, secreto: '' })); avisar('Claves guardadas'); recargar(); }
    catch (e) { avisar(e.message, true); }
  };

  const clavesListas = d.googleDelServidor || (d.googleId && d.googleSecreto);
  const hechos = [Boolean(d.artista), d.gmailConectado, d.contactos > 0, d.grupos > 0, d.campanias > 0];
  const listos = hechos.filter(Boolean).length;
  const set = (k) => (e) => setDatos((x) => ({ ...x, [k]: e.target.value }));
  const abrir = (n) => () => setAbierto(abierto === n ? 0 : n);

  return (
    <>
      <div className="cabecera">
        <div><h1>Primeros pasos</h1><p>Dejá tu copia lista para mandar promos. Todo queda guardado en tu propia cuenta.</p></div>
        <span className="chip acento">{listos} de 5 listos</span>
      </div>
      {msgGmail && <div className={`aviso ${msgGmail === 'ok' ? 'ok' : 'mal'}`}>{msgGmail === 'ok' ? '¡Gmail conectado!' : msgGmail}</div>}

      <Paso n={1} titulo="Tus datos de artista" hecho={hechos[0]} abierto={abierto === 1} onAbrir={abrir(1)} resumen={d.artista ? `${d.artista}${d.soundcloud ? ` · soundcloud.com/${d.soundcloud}` : ''}` : 'Tu nombre y tu SoundCloud'}>
        <div className="fila">
          <div className="campo"><label htmlFor="ia">Nombre artístico</label><input id="ia" type="text" value={datos.remitente_nombre} onChange={set('remitente_nombre')} placeholder="Así te ven en la bandeja de entrada" /></div>
          <div className="campo"><label htmlFor="isc">Tu SoundCloud</label><input id="isc" type="text" value={datos.soundcloud_perfil} onChange={set('soundcloud_perfil')} placeholder="soundcloud.com/tu-usuario" /></div>
        </div>
        <div className="campo"><label htmlFor="ifi">Firma de los mails</label><textarea id="ifi" rows={3} style={{ minHeight: 70 }} value={datos.firma} onChange={set('firma')} placeholder={'Si la dejás vacía uso tu nombre y tu SoundCloud.\nEj: Tu Nombre\nCiudad, País\ninstagram.com/tu-usuario'} /></div>
        <button className="btn primario" onClick={guardarDatos}>Guardar y seguir</button>
      </Paso>

      <Paso n={2} titulo="Conectar tu Gmail" hecho={hechos[1]} abierto={abierto === 2} onAbrir={abrir(2)} resumen={d.gmailConectado ? `Conectado: ${d.gmailEmail}` : 'Los mails salen desde tu cuenta, uno por uno'}>
        {d.gmailConectado ? (
          <p style={{ margin: 0 }}><span className="chip ok"><i className="punto" /> Conectado</span> <b>{d.gmailEmail}</b>. Podés cambiarlo en Ajustes.</p>
        ) : (
          <>
            {!d.googleDelServidor && (
              <>
                <p className="sub" style={{ marginTop: 0 }}>Google pide que cada uno cree su propio «permiso» para que una app mande mails desde su Gmail. Se hace una sola vez y tarda unos 10 minutos. Entrá con <b>la cuenta de Gmail desde la que vas a mandar las promos</b>.</p>
                <ol className="instrucciones">
                  <li>Abrí <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">Google Cloud → Proyecto nuevo ↗</a>, poné de nombre <b>PromoYa</b> y tocá <b>Crear</b>.</li>
                  <li>Abrí <a href="https://console.cloud.google.com/apis/library/gmail.googleapis.com" target="_blank" rel="noreferrer">Gmail API ↗</a> (fijate que arriba esté elegido el proyecto «PromoYa») y tocá <b>Habilitar</b>.</li>
                  <li>Abrí <a href="https://console.cloud.google.com/auth/overview" target="_blank" rel="noreferrer">Google Auth Platform ↗</a> → <b>Comenzar</b>: nombre de la app <b>PromoYa</b>, tu mail de asistencia, público <b>Externo</b>, tu mail de contacto, aceptá y <b>Crear</b>.</li>
                  <li>Entrá a <a href="https://console.cloud.google.com/auth/branding" target="_blank" rel="noreferrer">Desarrollo de la marca ↗</a> y fijate que estén completos <b>Nombre de la app</b>, <b>Correo electrónico de asistencia</b> y, abajo de todo, <b>Información de contacto del desarrollador</b> (tu mail). En <b>Dominio de la app</b> completá también:
                    <div style={{ margin: '8px 0', display: 'grid', gap: 6 }}>
                      <span className="sub">Página principal de la aplicación</span><Copiar texto={d.origen} />
                      <span className="sub">Vínculo a la Política de Privacidad</span><Copiar texto={`${d.origen}/privacidad`} />
                      <span className="sub">Vínculo a las Condiciones del Servicio</span><Copiar texto={`${d.origen}/condiciones`} />
                      <span className="sub">Dominios autorizados → Agregar dominio</span><Copiar texto={d.origen.replace(/^https?:\/\//, '')} />
                    </div>
                    Tocá <b>Guardar</b>. <span className="sub">No subas logo: si subís uno, Google pide una revisión que tarda semanas.</span></li>
                  <li>Ahora entrá a <a href="https://console.cloud.google.com/auth/audience" target="_blank" rel="noreferrer">Público ↗</a>, tocá <b>Publicar app</b> y confirmá. <span className="sub">(Si queda «en prueba», Google corta el permiso cada 7 días. Si el botón sigue gris, es porque falta algún dato del paso anterior.)</span></li>
                  <li>En <b>Clientes</b> → <b>Crear cliente</b> → tipo <b>Aplicación web</b>. En <b>URI de redireccionamiento autorizados</b> agregá exactamente esta dirección:
                    <div style={{ margin: '8px 0' }}><Copiar texto={d.redireccion} /></div>
                    Tocá <b>Crear</b>.</li>
                  <li>Copiá el <b>ID de cliente</b> y el <b>Secreto del cliente</b> que te muestra y pegalos acá:</li>
                </ol>
                <div className="fila">
                  <div className="campo"><label htmlFor="gid">ID de cliente</label><input id="gid" type="text" value={google.id} onChange={(e) => setGoogle((g) => ({ ...g, id: e.target.value }))} placeholder="…apps.googleusercontent.com" autoComplete="off" /></div>
                  <div className="campo"><label htmlFor="gse">Secreto del cliente</label><input id="gse" type="password" value={google.secreto} onChange={(e) => setGoogle((g) => ({ ...g, secreto: e.target.value }))} placeholder={d.googleSecreto ? 'Ya está cargado (dejalo vacío para no cambiarlo)' : 'GOCSPX-…'} autoComplete="off" /></div>
                </div>
                <p className="sub" style={{ marginTop: 0 }}>Se guardan en tu base de datos, en tu cuenta de Cloudflare. Nadie más las ve.</p>
                <button className="btn" onClick={guardarGoogle}>Guardar claves</button>
                <div className="sep" />
              </>
            )}
            <h3 style={{ marginBottom: 8 }}>Último paso: conectar</h3>
            <p className="sub" style={{ marginTop: 0 }}>Al tocar «Conectar Gmail» elegí la cuenta desde la que vas a mandar las promos. Google va a mostrar un aviso rojo: <b>«Google no ha verificado esta aplicación»</b>. Es normal, porque la app es tuya y no pasó por la revisión de Google:</p>
            <ol className="instrucciones">
              <li>Tocá <b>Configuración avanzada</b> (abajo a la izquierda, en letra chica). <span className="sub">No toques «Volver a un sitio seguro».</span></li>
              <li>Tocá <b>Ir a PromoYa (no seguro)</b> <span className="sub">(o el nombre que le pusiste a la app en Google)</span>.</li>
              <li>Si aparecen casillas de permisos, <b>marcalas todas</b> y tocá <b>Continuar</b>. <span className="sub">«Enviar» es para mandar las promos; «Ver tus mails» es solo para detectar rebotes, respuestas y bajas.</span></li>
              <li>Volvés solo a esta página con el mensaje <b>«¡Gmail conectado!»</b>.</li>
            </ol>
            <a className={`btn primario ${clavesListas ? '' : 'deshabilitado'}`} href={clavesListas ? '/api/gmail/conectar' : undefined} aria-disabled={!clavesListas}>Conectar Gmail</a>
            {!clavesListas && <span className="sub" style={{ marginLeft: 10 }}>Primero guardá las claves.</span>}
          </>
        )}
      </Paso>

      <Paso n={3} titulo="Cargar tus contactos" hecho={hechos[2]} abierto={abierto === 3} onAbrir={abrir(3)} resumen={d.contactos ? `${d.contactos} contactos${d.sinSoundcloud ? ` · ${d.sinSoundcloud} sin usuario de SoundCloud` : ''}` : 'DJs, sellos, radios…'}>
        <p className="sub" style={{ marginTop: 0 }}>Importá un CSV (desde Excel: Guardar como CSV, o desde Contactos de Google: Exportar). Columnas: <b>nombre, email, soundcloud, tipo, país, etiquetas</b>. Cargá el usuario de SoundCloud de cada uno: así la plataforma sabe cuándo te escucharon.</p>
        <a className="btn primario" href="#/contactos">Ir a Contactos</a>
      </Paso>

      <Paso n={4} titulo="Armar grupos" hecho={hechos[3]} abierto={abierto === 4} onAbrir={abrir(4)} resumen={d.grupos ? `${d.grupos} grupos` : 'Cada día de una campaña sale un grupo'}>
        <p className="sub" style={{ marginTop: 0 }}>Dividí tus contactos en grupos (por ejemplo, de a 25). Así mandás de a poco y Gmail no te marca como spam.</p>
        <a className="btn primario" href="#/grupos">Ir a Grupos</a>
      </Paso>

      <Paso n={5} titulo="Tu primera campaña" hecho={hechos[4]} abierto={abierto === 5} onAbrir={abrir(5)} resumen={d.campanias ? `${d.campanias} campañas` : 'Pegá el link de tu tema y listo'}>
        <p className="sub" style={{ marginTop: 0 }}>Pegá el link de SoundCloud de tu tema (puede ser privado), elegí los grupos y activala. La plataforma manda sola, respetando el tope diario.</p>
        <a className="btn primario" href="#/campanias/nueva">Crear campaña</a>
      </Paso>

      <p className="sub" style={{ marginTop: 18 }}>📱 Tip: en el celular, abrí esta página y elegí «Agregar a la pantalla de inicio» para tenerla como app.</p>
    </>
  );
}
