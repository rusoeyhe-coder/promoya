import { useEffect, useRef, useState } from 'react';
import { api, useDatos, useAviso, ir, diaLindo, hoyISO } from '../ui.jsx';

const sumarDias = (dia, n) => { const d = new Date(dia + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export default function EditorCampania({ id }) {
  const avisar = useAviso();
  const [grupos] = useDatos('grupos');
  const [textos] = useDatos(id ? null : 'campanias/textos');
  const [f, setF] = useState(null);
  const [conB, setConB] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [vista, setVista] = useState(null);
  const [vistaTipo, setVistaTipo] = useState('principal');
  const cuerpoRef = useRef(null);
  const recRef = useRef(null);

  useEffect(() => {
    if (id) {
      api(`campanias/${id}`).then((c) => {
        setF({ ...c, grupos: c.grupos.map((g) => g.grupo_id) });
        setConB(Boolean(c.asunto_b));
      }).catch((e) => avisar(e.message, true));
    } else if (textos) {
      setF({ nombre: '', tema: '', artista: textos.artista || '', link: '', imagen: '', asunto_a: '', asunto_b: '', cuerpo: textos.cuerpo, recordatorio_dias: 4, recordatorio_asunto: '', recordatorio_cuerpo: textos.recordatorio, inicio: hoyISO(), grupos: [], estado: 'borrador' });
    }
  }, [id, textos]);

  // Vista previa del mail
  useEffect(() => {
    if (!f) return;
    const t = setTimeout(() => {
      api('vista-previa', { metodo: 'POST', datos: { ...f, asunto_b: conB ? f.asunto_b : '', tipo: vistaTipo } }).then(setVista).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [f, conB, vistaTipo]);

  if (!f || !grupos) return <div className="cargando">Cargando…</div>;
  const editable = f.estado === 'borrador';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'number' ? Number(e.target.value) : e.target.value }));

  const buscarSC = async (link = f.link) => {
    if (!/soundcloud\.com\//i.test(link)) return;
    setBuscando(true);
    try {
      const d = await api('soundcloud/info', { metodo: 'POST', datos: { url: link } });
      setF((x) => ({
        ...x, tema: x.tema || d.tema, artista: d.artista || x.artista, imagen: d.imagen || x.imagen,
        nombre: x.nombre || d.tema,
        asunto_a: x.asunto_a || `Promo: ${d.artista || x.artista} - ${d.tema}`,
        asunto_b: x.asunto_b || `{nombre}, te mando mi nuevo tema 🎧`,
      }));
    } catch (e) { avisar(e.message, true); }
    finally { setBuscando(false); }
  };

  const insertar = (ref, campo, txt) => {
    const el = ref.current;
    const v = f[campo] || '';
    const ini = el ? el.selectionStart : v.length, fin = el ? el.selectionEnd : v.length;
    setF((x) => ({ ...x, [campo]: v.slice(0, ini) + txt + v.slice(fin) }));
    setTimeout(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = ini + txt.length; } }, 0);
  };

  const alternarGrupo = (gid) => setF((x) => ({ ...x, grupos: x.grupos.includes(gid) ? x.grupos.filter((g) => g !== gid) : [...x.grupos, gid] }));
  const mover = (gid, d) => setF((x) => {
    const g = [...x.grupos]; const i = g.indexOf(gid); const j = i + d;
    if (j < 0 || j >= g.length) return x;
    [g[i], g[j]] = [g[j], g[i]];
    return { ...x, grupos: g };
  });

  const elegidos = f.grupos.map((gid) => grupos.find((g) => g.id === gid)).filter(Boolean);
  const totalContactos = elegidos.reduce((a, g) => a + (g.activos || 0), 0);
  const ordenados = [...elegidos, ...grupos.filter((g) => !f.grupos.includes(g.id))];

  const guardar = async (activar = false) => {
    setGuardando(true);
    try {
      const datos = { ...f, asunto_b: conB ? f.asunto_b : '' };
      let cid = id;
      if (id) await api(`campanias/${id}`, { metodo: 'PUT', datos });
      else cid = (await api('campanias', { metodo: 'POST', datos })).id;
      if (activar) {
        const r = await api(`campanias/${cid}/activar`, { metodo: 'POST' });
        avisar(`Campaña en marcha: ${r.total} mails programados`);
      } else avisar('Guardado');
      ir(`campanias/${cid}`);
    } catch (e) { avisar(e.message, true); }
    finally { setGuardando(false); }
  };

  return (
    <>
      <div className="cabecera">
        <div><h1>{id ? 'Editar campaña' : 'Nueva campaña'}</h1><p>{editable ? 'Pegá el link de SoundCloud y elegí a qué grupos va, en qué orden.' : 'La campaña ya arrancó: podés cambiar los textos de lo que falta enviar.'}</p></div>
        <div className="acciones">
          <a className="btn fantasma" href={id ? `#/campanias/${id}` : '#/campanias'}>Cancelar</a>
          <button className="btn" onClick={() => guardar(false)} disabled={guardando}>Guardar</button>
          {editable && <button className="btn primario" onClick={() => guardar(true)} disabled={guardando || !f.grupos.length}>Activar campaña</button>}
        </div>
      </div>

      <div className="grilla lado">
        <div>
          <div className="tarjeta">
            <h2>El tema</h2>
            <div className="campo">
              <label htmlFor="link">Link de SoundCloud</label>
              <input id="link" type="url" placeholder="https://soundcloud.com/movedeck/... (puede ser privado)" value={f.link} onChange={set('link')} onBlur={() => buscarSC()} onPaste={(e) => setTimeout(() => buscarSC(e.target.value), 0)} />
              <span className="ayuda">{buscando ? 'Buscando el tema en SoundCloud…' : 'Al pegarlo completo el nombre y la tapa solos.'}</span>
            </div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              {f.imagen ? <img className="portada" src={f.imagen} alt="" style={{ width: 84, height: 84 }} /> : <span className="portada" style={{ width: 84, height: 84 }} />}
              <div style={{ flex: 1 }}>
                <div className="fila">
                  <div className="campo"><label htmlFor="tema">Tema</label><input id="tema" type="text" value={f.tema} onChange={set('tema')} /></div>
                  <div className="campo"><label htmlFor="artista">Artista</label><input id="artista" type="text" value={f.artista} onChange={set('artista')} /></div>
                </div>
                <div className="campo" style={{ marginBottom: 0 }}><label htmlFor="nombre">Nombre de la campaña</label><input id="nombre" type="text" value={f.nombre} onChange={set('nombre')} placeholder="Ej: Promo Groove Machine (DJs)" /></div>
              </div>
            </div>
          </div>

          <div className="tarjeta">
            <h2>El mail</h2>
            <div className="campo">
              <label htmlFor="asa">Asunto {conB && 'A'}</label>
              <input id="asa" type="text" value={f.asunto_a} onChange={set('asunto_a')} placeholder="Promo: Artista - Nombre del tema" />
            </div>
            <label className="check" style={{ marginBottom: 10 }}><input type="checkbox" checked={conB} onChange={(e) => setConB(e.target.checked)} /> Probar dos asuntos distintos</label>
            {conB && (
              <div className="campo">
                <label htmlFor="asb">Asunto B</label>
                <input id="asb" type="text" value={f.asunto_b} onChange={set('asunto_b')} />
                <span className="ayuda">El primer grupo recibe mitad A y mitad B. A las 24 h, el que más abrieron se usa para el resto de los grupos.</span>
              </div>
            )}
            <div className="campo">
              <label htmlFor="cuerpo">Texto</label>
              <textarea id="cuerpo" ref={cuerpoRef} rows={9} value={f.cuerpo} onChange={set('cuerpo')} />
              <div className="marcadores">
                {['{nombre}', '{tema}', '{artista}', '{link}'].map((m) => <button key={m} type="button" onClick={() => insertar(cuerpoRef, 'cuerpo', m)}>{m}</button>)}
              </div>
              <span className="ayuda">{'{nombre}'} pone el primer nombre de cada contacto. {'{link}'} es el botón de SoundCloud (con seguimiento).</span>
            </div>
          </div>

          <div className="tarjeta">
            <h2>Recordatorio</h2>
            <div className="campo">
              <label htmlFor="rdias">Mandar recordatorio a los que no abrieron después de</label>
              <select id="rdias" value={f.recordatorio_dias} onChange={set('recordatorio_dias')} style={{ maxWidth: 220 }}>
                <option value={0}>No mandar recordatorio</option>
                {[2, 3, 4, 5, 7, 10].map((n) => <option key={n} value={n}>{n} días</option>)}
              </select>
            </div>
            {f.recordatorio_dias > 0 && (
              <>
                <div className="campo">
                  <label htmlFor="rasu">Asunto del recordatorio</label>
                  <input id="rasu" type="text" value={f.recordatorio_asunto} onChange={set('recordatorio_asunto')} placeholder="Si lo dejás vacío: «Re: (asunto original)»" />
                </div>
                <div className="campo" style={{ marginBottom: 0 }}>
                  <label htmlFor="rcue">Texto del recordatorio</label>
                  <textarea id="rcue" ref={recRef} rows={6} value={f.recordatorio_cuerpo} onChange={set('recordatorio_cuerpo')} />
                  <div className="marcadores">
                    {['{nombre}', '{tema}', '{link}'].map((m) => <button key={m} type="button" onClick={() => insertar(recRef, 'recordatorio_cuerpo', m)}>{m}</button>)}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="tarjeta">
            <h2>Grupos y días</h2>
            <div className="campo" style={{ maxWidth: 220 }}>
              <label htmlFor="ini">Empieza el</label>
              <input id="ini" type="date" value={f.inicio || hoyISO()} min={hoyISO()} onChange={set('inicio')} disabled={!editable} />
            </div>
            {!grupos.length ? (
              <div className="aviso">Primero armá grupos de contactos. <a className="btn chico" href="#/grupos">Ir a Grupos</a></div>
            ) : (
              <>
                <p className="sub" style={{ marginTop: 0 }}>Cada día sale un grupo, en el orden que elijas. Si un contacto está en dos grupos, le llega una sola vez.</p>
                <div className="grupo-sel">
                  {ordenados.map((g) => {
                    const i = f.grupos.indexOf(g.id);
                    const elegido = i >= 0;
                    return (
                      <div key={g.id} className={`grupo-item ${elegido ? 'elegido' : ''}`}>
                        <input type="checkbox" checked={elegido} disabled={!editable} onChange={() => alternarGrupo(g.id)} aria-label={`Elegir ${g.nombre}`} style={{ accentColor: 'var(--acento)' }} />
                        {elegido && <span className="orden">{i + 1}</span>}
                        <div style={{ minWidth: 0 }}>
                          <b>{g.nombre}</b> <span className="sub">{g.activos} contactos</span>
                          {elegido && <div className="sub">{diaLindo(sumarDias(f.inicio || hoyISO(), i))}</div>}
                        </div>
                        {elegido && editable && (
                          <div className="mover">
                            <button className="btn chico fantasma" onClick={() => mover(g.id, -1)} aria-label="Subir">↑</button>
                            <button className="btn chico fantasma" onClick={() => mover(g.id, 1)} aria-label="Bajar">↓</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {f.grupos.length > 0 && <p className="sub" style={{ marginBottom: 0 }}>{f.grupos.length} grupos · {totalContactos} mails · termina el {diaLindo(sumarDias(f.inicio || hoyISO(), f.grupos.length - 1))} (si ningún día supera el tope).</p>}
              </>
            )}
          </div>
        </div>

        <div style={{ position: 'sticky', top: 20 }}>
          <div className="tarjeta">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Así llega</h2>
              <div className="pestanias">
                <button className={`pestania ${vistaTipo === 'principal' ? 'activa' : ''}`} onClick={() => setVistaTipo('principal')}>Mail</button>
                {f.recordatorio_dias > 0 && <button className={`pestania ${vistaTipo === 'recordatorio' ? 'activa' : ''}`} onClick={() => setVistaTipo('recordatorio')}>Recordatorio</button>}
              </div>
            </div>
            <div className="vista-mail">
              <div className="cab"><b>{vista?.asunto || '(sin asunto)'}</b><br />De: {f.artista || 'vos'} · Para: Juan Pérez</div>
              <iframe title="Vista previa del mail" srcDoc={vista?.html || ''} sandbox="" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
