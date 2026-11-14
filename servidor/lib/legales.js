// Páginas públicas de política de privacidad y condiciones de uso (Google las pide para publicar la app de OAuth).
import { asegurarEsquema, leerConfig } from './db.js';
import { escaparHtml } from './util.js';

function pagina(titulo, cuerpo) {
  return new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title><style>
:root{color-scheme:light dark}body{margin:0;background:#0a0a0a;color:#e8e8e8;font:16px/1.6 system-ui,Arial,sans-serif}
main{max-width:720px;margin:0 auto;padding:40px 16px 60px}h1{font-size:28px;margin:0 0 6px}h2{font-size:18px;margin:28px 0 8px;color:#ff8a33}
p,li{color:#cfcfcf}a{color:#ff8a33}.sub{color:#888;font-size:14px}
</style></head><body><main>${cuerpo}</main></body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
}

async function datos(env) {
  await asegurarEsquema(env.DB);
  const c = await leerConfig(env.DB);
  const nombre = escaparHtml(c.remitente_nombre || 'el dueño de esta copia');
  const contacto = c.gmail_email ? `<a href="mailto:${escaparHtml(c.gmail_email)}">${escaparHtml(c.gmail_email)}</a>` : 'el mail desde el que recibiste la promo';
  return { nombre, contacto };
}

export async function privacidad(env) {
  const { nombre, contacto } = await datos(env);
  return pagina('Política de privacidad', `
<h1>Política de privacidad</h1>
<p class="sub">PromoYa — copia de ${nombre}</p>
<p>PromoYa es una herramienta personal que usa ${nombre} para mandar, desde su propia cuenta de Gmail, mails con links a su música en SoundCloud a contactos que conoce (DJs, sellos, radios y prensa), y para ver quién los abrió y escuchó.</p>
<h2>Qué datos se usan</h2>
<ul>
<li><b>De los contactos:</b> nombre, email, usuario de SoundCloud y notas que carga ${nombre}. Por cada mail se registra si se abrió (con una imagen de seguimiento), si se tocó el link, si rebotó y si hubo respuesta.</li>
<li><b>De la cuenta de Gmail de ${nombre}:</b> con su permiso, la app usa la API de Gmail para <b>enviar</b> los mails de las campañas y para <b>leer</b> la bandeja de entrada solo con el fin de detectar rebotes, respuestas y pedidos de baja de esos contactos.</li>
</ul>
<h2>Dónde se guardan</h2>
<p>Todo se guarda en una base de datos de la cuenta de Cloudflare de ${nombre}. No se vende, no se comparte con terceros y no se usa para publicidad ni para entrenar modelos de inteligencia artificial.</p>
<h2>Uso de datos de Google</h2>
<p>El uso y la transferencia de la información recibida de las API de Google respetan la <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">Política de datos de usuario de los servicios de API de Google</a>, incluidos los requisitos de uso limitado. Los datos de Gmail solo se usan para las funciones descritas acá.</p>
<h2>Darte de baja o borrar tus datos</h2>
<p>Cada mail trae un link para dejar de recibir promos. Si querés que se borren tus datos, escribí a ${contacto}. ${nombre} puede desconectar Gmail cuando quiera desde la app o desde <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a>.</p>
<p class="sub">Última actualización: noviembre de 2026.</p>`);
}

export async function condiciones(env) {
  const { nombre, contacto } = await datos(env);
  return pagina('Condiciones de uso', `
<h1>Condiciones de uso</h1>
<p class="sub">PromoYa — copia de ${nombre}</p>
<p>Esta copia de PromoYa es de uso personal de ${nombre}, para promocionar su propia música a contactos que conoce. No es un servicio abierto al público.</p>
<h2>Uso responsable</h2>
<ul>
<li>Los mails se mandan de a uno, con un tope diario, y cada uno incluye un link para darse de baja.</li>
<li>Quien se da de baja o cuyo mail rebota no vuelve a recibir promos.</li>
<li>No se usa para mandar spam ni para contactar a personas que no tienen relación con la música de ${nombre}.</li>
</ul>
<h2>Contacto</h2>
<p>Por cualquier consulta, escribí a ${contacto}.</p>
<p>Ver también la <a href="/privacidad">política de privacidad</a>.</p>
<p class="sub">Última actualización: noviembre de 2026.</p>`);
}
