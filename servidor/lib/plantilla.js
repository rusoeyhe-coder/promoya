// Arma el mail de cada contacto: asunto, texto, HTML y el mensaje MIME listo para Gmail.
import { escaparHtml, primerNombre } from './util.js';

export const CUERPO_DEFECTO = `Hola {nombre},

Te comparto mi nuevo tema "{tema}". Lo terminé hace poco y me encantaría saber qué te parece y si lo pasarías en tus sets.

Escuchalo acá: {link}

¡Gracias por el apoyo!`;

export const RECORDATORIO_DEFECTO = `Hola {nombre},

Te escribo por si se te pasó el mail de la semana pasada: te había mandado "{tema}".

Te dejo el link de nuevo: {link}

Cualquier devolución me sirve muchísimo. ¡Abrazo!`;

function reemplazar(txt, datos) {
  return String(txt || '').replace(/\{(nombre|tema|artista|link)\}/gi, (_, k) => datos[k.toLowerCase()] ?? '');
}

export function armarMail({ campania, contacto, envio, config, base }) {
  const esRecordatorio = envio.tipo === 'recordatorio';
  const link = `${base}/l/${envio.token}`;
  const baja = `${base}/baja/${envio.token}`;
  const nombre = primerNombre(contacto.nombre) || 'qué tal';
  const datos = { nombre, tema: campania.tema, artista: campania.artista, link };

  const asuntoBase = esRecordatorio
    ? campania.recordatorio_asunto || `Re: ${envio.asunto_original || campania.asunto_a}`
    : (envio.variante === 'B' && campania.asunto_b) ? campania.asunto_b : campania.asunto_a;
  const asunto = reemplazar(asuntoBase, { ...datos, link: '' }).trim();

  const cuerpo = (esRecordatorio ? campania.recordatorio_cuerpo || RECORDATORIO_DEFECTO : campania.cuerpo) || CUERPO_DEFECTO;
  const tieneLink = /\{link\}/i.test(cuerpo);
  const firma = config.firma || [config.remitente_nombre, config.soundcloud_perfil && `soundcloud.com/${config.soundcloud_perfil}`].filter(Boolean).join('\n');

  // Texto plano
  let texto = reemplazar(cuerpo, datos);
  if (!tieneLink) texto += `\n\nEscuchalo acá: ${link}`;
  texto += `\n\n${firma}\n\n—\nSi no querés recibir más promos: ${baja}`;

  // HTML simple, con pinta de mail personal (llega mejor a la bandeja principal)
  const tarjeta = `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0;border-collapse:collapse">
  <tr>
    ${campania.imagen ? `<td style="padding:0 14px 0 0;vertical-align:middle"><a href="${link}"><img src="${escaparHtml(campania.imagen)}" width="96" height="96" alt="" style="display:block;border-radius:6px;border:0"></a></td>` : ''}
    <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif">
      <div style="font-size:15px;font-weight:bold;color:#111">${escaparHtml(campania.tema || campania.nombre)}</div>
      ${campania.artista ? `<div style="font-size:13px;color:#666;margin:2px 0 8px">${escaparHtml(campania.artista)}</div>` : ''}
      <a href="${link}" style="display:inline-block;background:#ff5500;color:#fff;text-decoration:none;font-size:14px;font-weight:bold;padding:9px 16px;border-radius:4px">&#9654; Escuchar en SoundCloud</a>
    </td>
  </tr>
</table>`;

  const parrafos = reemplazar(escaparHtml(cuerpo), { ...datos, nombre: escaparHtml(nombre), tema: escaparHtml(campania.tema), artista: escaparHtml(campania.artista), link: '\u0000LINK\u0000' })
    .split(/\n{2,}/)
    .map((p) => {
      if (p.includes('\u0000LINK\u0000')) {
        const antes = p.replace('\u0000LINK\u0000', '').replace(/[:\s]+$/, '').trim();
        return (antes ? `<p style="margin:0 0 6px">${antes.replace(/\n/g, '<br>')}</p>` : '') + tarjeta;
      }
      return `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`;
    })
    .join('\n');

  const html = `<!doctype html><html><body style="margin:0;padding:0">
<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px;padding:8px">
${parrafos}
${tieneLink ? '' : tarjeta}
<p style="margin:18px 0 0;color:#444">${escaparHtml(firma).replace(/\n/g, '<br>')}</p>
<p style="margin:28px 0 0;font-size:11px;color:#999">Si no querés recibir más promos, <a href="${baja}" style="color:#999">tocá acá</a>.</p>
</div>
<img src="${base}/o/${envio.token}.gif" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">
</body></html>`;

  return { asunto, texto, html, link, baja };
}

// ---- MIME para la API de Gmail ----
const b64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const b64url = (str) => b64(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cortar76 = (s) => s.replace(/(.{76})/g, '$1\r\n');
const encabezadoUtf8 = (s) => `=?UTF-8?B?${b64(s)}?=`;

export function armarMime({ de, deNombre, para, paraNombre, asunto, texto, html, baja }) {
  const limite = 'mdp' + Math.random().toString(36).slice(2);
  const lineas = [
    `From: ${encabezadoUtf8(deNombre)} <${de}>`,
    `To: ${paraNombre ? encabezadoUtf8(paraNombre) + ' ' : ''}<${para}>`,
    `Subject: ${encabezadoUtf8(asunto)}`,
    'MIME-Version: 1.0',
    `List-Unsubscribe: <${baja}?uno=1>, <mailto:${de}?subject=baja>`,
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    '',
    `--${limite}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    cortar76(b64(texto)),
    `--${limite}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    cortar76(b64(html)),
    `--${limite}--`,
    '',
  ];
  return b64url(lineas.join('\r\n'));
}
