import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import './estilos.css';
import { api, useRuta, ProveedorAvisos, Icono } from './ui.jsx';
import Resumen from './paginas/Resumen.jsx';
import Campanias from './paginas/Campanias.jsx';
import EditorCampania from './paginas/EditorCampania.jsx';
import Campania from './paginas/Campania.jsx';
import Contactos from './paginas/Contactos.jsx';
import Ficha from './paginas/Ficha.jsx';
import Grupos from './paginas/Grupos.jsx';
import Ajustes from './paginas/Ajustes.jsx';
import Inicio from './paginas/Inicio.jsx';

const NAV = [
  ['inicio', 'Primeros pasos'],
  ['resumen', 'Resumen'],
  ['campanias', 'Campañas'],
  ['contactos', 'Contactos'],
  ['grupos', 'Grupos'],
  ['ajustes', 'Ajustes'],
];

function Marca({ artista }) {
  return <div className="marca"><b>{artista || 'PromoYa'}</b><span>{artista ? 'PROMOYA' : 'PROMOS POR MAIL'}</span></div>;
}

function Acceso({ crear, artista, onListo }) {
  const [usuario, setUsuario] = useState(() => { try { return localStorage.getItem('promoya-usuario') || ''; } catch { return ''; } });
  const [clave, setClave] = useState('');
  const [clave2, setClave2] = useState('');
  const codigoLink = new URLSearchParams(location.search).get('alta') || '';
  const codigo = codigoLink;
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (crear && clave !== clave2) return setError('Las contraseñas no coinciden');
    setEnviando(true);
    try {
      await api(crear ? 'crear-clave' : 'login', { metodo: 'POST', datos: { usuario, clave, codigo } });
      try { localStorage.setItem('promoya-usuario', usuario.trim()); } catch {}
      if (codigoLink) history.replaceState(null, '', location.pathname + location.hash);
      onListo();
    }
    catch (x) { setError(x.message); }
    finally { setEnviando(false); }
  };
  return (
    <div className="login">
      <form className="tarjeta" onSubmit={enviar}>
        <Marca artista={artista} />
        {crear && <p className="sub" style={{ marginTop: 0 }}>Es la primera vez: poné tu nombre artístico y elegí una contraseña. Con esos dos datos vas a entrar siempre.</p>}
        <div className="campo"><label htmlFor="usuario">Nombre artístico</label>
          <input id="usuario" type="text" autoFocus={!usuario} value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" autoCapitalize="off" />
          {crear && <span className="ayuda">Es tu usuario para entrar. Usá el mismo que pusiste al instalar.</span>}</div>
        <div className="campo"><label htmlFor="clave">Contraseña</label>
          <input id="clave" type="password" autoFocus={Boolean(usuario)} value={clave} onChange={(e) => setClave(e.target.value)} autoComplete={crear ? 'new-password' : 'current-password'} />
          {crear && <span className="ayuda">Mínimo 6 caracteres: pueden ser solo números, solo letras o lo que quieras.</span>}</div>
        {crear && <div className="campo"><label htmlFor="clave2">Repetila</label>
          <input id="clave2" type="password" value={clave2} onChange={(e) => setClave2(e.target.value)} autoComplete="new-password" /></div>}
        {error && <div className="aviso mal">{error}</div>}
        <button className="btn primario" style={{ width: '100%' }} disabled={enviando || !clave || !usuario.trim()}>{crear ? 'Crear y entrar' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function App() {
  const [sesion, setSesion] = useState(null);
  const ruta = useRuta();
  const revisar = () => api('sesion').then(setSesion).catch(() => setSesion({ logueado: false }));
  useEffect(() => {
    revisar();
    const f = () => setSesion((s) => ({ ...s, logueado: false }));
    window.addEventListener('sin-sesion', f);
    return () => window.removeEventListener('sin-sesion', f);
  }, []);

  if (!sesion) return <div className="cargando">Cargando…</div>;
  if (!sesion.logueado) return <Acceso crear={sesion.necesitaClave} artista={sesion.artista} onListo={revisar} />;

  const [seccion, id, extra] = ruta.split('?')[0].split('/');
  let pagina;
  if (seccion === 'campanias' && id === 'nueva') pagina = <EditorCampania />;
  else if (seccion === 'campanias' && id && extra === 'editar') pagina = <EditorCampania id={id} />;
  else if (seccion === 'campanias' && id) pagina = <Campania id={id} />;
  else if (seccion === 'campanias') pagina = <Campanias />;
  else if (seccion === 'contactos' && id) pagina = <Ficha id={id} />;
  else if (seccion === 'contactos') pagina = <Contactos />;
  else if (seccion === 'grupos') pagina = <Grupos />;
  else if (seccion === 'ajustes') pagina = <Ajustes />;
  else if (seccion === 'inicio' || (seccion === 'resumen' && !location.hash.replace(/^#\/?/, '') && !sesion.configurado)) pagina = <Inicio onCambio={revisar} />;
  else pagina = <Resumen />;

  const salir = async () => { await api('salir', { metodo: 'POST' }); revisar(); };
  return (
    <div className="app">
      <nav className="lateral">
        <Marca artista={sesion.artista} />
        {NAV.filter(([k]) => k !== 'inicio' || !sesion.configurado || seccion === 'inicio').map(([k, t]) => (
          <a key={k} href={`#/${k}`} className={`nav ${(pagina.type === Inicio ? k === 'inicio' : seccion === k || (k === 'resumen' && pagina.type === Resumen)) ? 'activa' : ''}`}>
            {Icono[k]}<span>{t}</span>
          </a>
        ))}
        <div className="pie">
          {sesion.dev ? 'Modo prueba en la PC' : <button className="btn fantasma chico" onClick={salir}>Cerrar sesión</button>}
        </div>
      </nav>
      <main className="principal" key={ruta.split('?')[0]}>{pagina}</main>
    </div>
  );
}

const raiz = window.__raiz || (window.__raiz = createRoot(document.getElementById('raiz')));
raiz.render(<ProveedorAvisos><App /></ProveedorAvisos>);
