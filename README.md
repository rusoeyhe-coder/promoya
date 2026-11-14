# PromoYa

Plataforma para promocionar tus temas nuevos por mail: cargás tus contactos (DJs, sellos, radios), armás una campaña con el link de SoundCloud y la plataforma manda los mails sola, de a grupos, desde **tu Gmail**, sin pasarse de 100 por día. Después te muestra quién abrió, quién tocó el link y quién escuchó.

**Guía paso a paso para empezar: https://promosya.pages.dev**

Cada uno instala **su propia copia gratis en su cuenta de Cloudflare**: los contactos, las campañas y las estadísticas quedan en tu base de datos, y nadie más los ve.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/promosya/promoya)

## Qué hace

- **Campañas por tema:** pegás el link de SoundCloud (puede ser privado) y completa solo el nombre y la tapa.
- **Un grupo por día:** elegís los grupos y el orden; cada día sale uno.
- **Cuida tu Gmail:** máximo diario configurable (100 por defecto) y arranque gradual (30 → 60 → 100 por semana). Los mails salen de a uno, personalizados con el nombre de cada contacto.
- **Seguimiento:** aperturas, clics en el link y respuestas. Si el mail rebota o la persona se da de baja, se marca sola.
- **Recordatorio automático** a los que no abrieron, a los X días.
- **Mejor horario:** aprende a qué hora abre cada contacto y le manda a esa hora.
- **Dos asuntos distintos (A/B):** el primer grupo recibe mitad y mitad, y el resto recibe el que más se abrió.
- **Ficha de cada contacto** con todo su historial, y **contactos fríos** (los que no abren nunca).
- **Usuario de SoundCloud por contacto,** para saber quién te escuchó.
- Funciona en la compu y en el celular (se puede agregar a la pantalla de inicio como app).

## Instalar tu copia (gratis)

Necesitás una cuenta de **Cloudflare** (gratis) y una de **GitHub** (gratis).

1. Tocá el botón **Deploy to Cloudflare** de arriba y entrá con tu cuenta de Cloudflare.
2. Conectá tu GitHub cuando te lo pida: se crea una copia del proyecto en tu cuenta.
3. En **NOMBRE_ARTISTICO** poné tu nombre artístico (por ejemplo, *DJ Fulano*). Es tu usuario para entrar al panel, y así nadie más puede adueñarse de tu copia antes que vos.
4. Tocá **Create and deploy**. En uno o dos minutos te da tu dirección, que termina en `.workers.dev`.
5. Abrila, poné tu nombre artístico, elegí tu contraseña y seguí los **Primeros pasos** que aparecen en la app: tus datos de artista, conectar tu Gmail (te guía paso a paso, unos 10 minutos), cargar contactos, armar grupos y crear tu primera campaña.

Todo entra en el plan gratis de Cloudflare: Workers, base de datos D1 y la tarea que manda los mails cada 10 minutos.

### Entrar al panel

Siempre entrás con tu **nombre artístico** y tu **contraseña**. No importan las mayúsculas ni las tildes del nombre. La contraseña se cambia en Ajustes.

### Sin GitHub (desde la compu)

Con [Node.js](https://nodejs.org) instalado, descargá el proyecto y en su carpeta corré:

```
npm install
npm run instalar
```

Te abre el navegador para entrar a Cloudflare, crea tu base de datos, publica y te pide tu nombre artístico (tu usuario).

## Actualizar

Si instalaste con el botón: cuando haya mejoras, entrá a tu copia en GitHub y tocá **Sync fork**. Cloudflare publica la versión nueva solo, y tus datos no se tocan.

Si instalaste desde la compu: bajá la versión nueva y corré `npm run deploy`.

## Preguntas

**¿Por qué tengo que crear algo en Google Cloud?** Para que una app pueda mandar mails desde tu Gmail, Google pide que cada uno cree su propio permiso. Es gratis y se hace una sola vez. 

**«Publicar app» aparece gris en Google Cloud.** Falta completar **Desarrollo de la marca**: nombre de la app, correo de asistencia, información de contacto del desarrollador y, en «Dominio de la app», la página principal, la política de privacidad (`/privacidad`), las condiciones (`/condiciones`) y tu dominio autorizado. La guía de Primeros pasos te muestra cada dato con un botón para copiarlo.

**Al conectar Gmail sale «Google no ha verificado esta aplicación».** Es normal, porque la app es tuya y no pasó por la revisión de Google:
1. Tocá **Configuración avanzada** (abajo a la izquierda). No toques «Volver a un sitio seguro».
2. Tocá **Ir a PromoYa (no seguro)**.
3. Si aparecen casillas de permisos, marcalas todas y tocá **Continuar**.
4. Volvés solo al panel con el mensaje «¡Gmail conectado!».

**¿Puedo mandar más de 100 por día?** Gmail permite unos 500 por día en una cuenta común, pero mandar muchos de golpe hace que tus mails terminen en spam. Podés cambiar el tope en Ajustes.

**¿Cómo sabe quién escuchó?** Por el link: cada contacto recibe uno propio que pasa por tu copia y lo lleva a SoundCloud. Además, si cargás el usuario de SoundCloud de cada contacto, podés cruzarlo con lo que ves en tus estadísticas de SoundCloud.

---

### Para desarrollar

- `npm run dev`: panel en http://localhost:3900 y API con base local. El archivo `.dev.vars` (copiá `.dev.vars.example`) acepta `MODO_PRUEBA=1` (no manda mails reales) y `DEV_SIN_LOGIN=1`.
- Código: `src/` (panel React), `servidor/` (Worker: API, seguimiento, motor de envíos y cron).
