// roster101 — el Worker de una empresa: sirve la pantalla y reenvía todo a la suite.
//
// DESDE EL 19-SEP-2026 AQUÍ NO HAY BASE NI BUCKET. Mike decidió que todo lo de
// una empresa viva en su base de la suite: los expedientes, los documentos, la
// bitácora, la papelera y las cuentas del panel están en la base por empresa
// de suite101-api (migración 0007, prefijo `roster_`), y el motor —el mismo
// código que corría aquí, con sus mismas reglas— corre dentro de la API, en
// `/roster/{empresa}/api/*`.
//
// Lo que queda en este Worker es el cascarón:
//   · la pantalla (public/): el portal del trabajador y el panel de la empresa;
//   · /s101/*  → la suite, por el enlace de servicio, con X-App puesto aquí;
//   · /api/*   → la suite, a `/roster/{ORG_ID}/api/…`, con los datos de la
//                empresa (nombre, razón social, domicilio, correos, versión del
//                aviso) en la cabecera X-Roster: siguen viviendo en el
//                wrangler.toml de cada empresa. Un Worker por empresa, como
//                siempre (Mike, 19-sep).
//
// Las dos puertas siguen siendo dos (Mike, 16-sep): el trabajador entra con su
// correo y un código, sin cuenta en la suite —su cookie la firma ahora la
// suite—; el panel entra con la cuenta de la suite. Las dos pasan por aquí tal
// cual y es la API la que decide.
//
// Bindings: API (service binding a suite101-api), ASSETS (el sitio).
// Vars: ORG_ID (la empresa de la suite) y los datos de la empresa.

import { Hono } from 'hono';

const app = new Hono();

const APP = 'roster101';
const PREFIJO_SUITE = '/s101';

const ahora = () => new Date().toISOString();
const err = (c, msg, code = 400, extra = {}) => c.json({ error: msg, ...extra }, code);

/* Desde el 25-sep-2026 el portal de Taller 101 vive en su dominio propio
 * (`DOMINIO_PROPIO`, en el wrangler.toml de la raíz). La dirección de
 * workers.dev SE QUEDA VIVA pero manda para allá (Mike, 25-sep: «redirigir,
 * no apagar»): las ligas que ya recibieron los trabajadores por correo siguen
 * sirviendo y todos acaban en el dominio. Sólo la PANTALLA (lecturas GET/HEAD
 * de la página y sus archivos): `/api/*` no se redirige —una app con token le
 * pega ahí— y `/s101/*` desde workers.dev viene de una página que ya se está
 * yendo. Los Workers de otras empresas y staging no tienen `DOMINIO_PROPIO`. */
export function aDominioPropio(req, env, u) {
  const d = env.DOMINIO_PROPIO;
  if (!d || u.hostname === d || !u.hostname.endsWith('.workers.dev')) return null;
  if (req.method !== 'GET' && req.method !== 'HEAD') return null;
  if (u.pathname === PREFIJO_SUITE || u.pathname.startsWith(PREFIJO_SUITE + '/') || u.pathname.startsWith('/api/')) return null;
  return Response.redirect(`https://${d}${u.pathname}${u.search}`, 301);
}
app.use('*', async (c, next) => {
  const ida = aDominioPropio(c.req.raw, c.env, new URL(c.req.url));
  if (ida) return ida;
  await next();
});

/* ─────────── la puerta de la suite ───────────
 * El panel le habla a `suite101-api` desde este mismo origen, por `/s101/*`,
 * con un *service binding*: una llamada de Worker a Worker que nunca sale a
 * internet. El Worker pone `X-App`; la pantalla no lo manda, y si lo manda se
 * sobrescribe: la app no decide quién dice ser. */
app.all(`${PREFIJO_SUITE}/*`, async (c) => {
  if (!c.env.API) return err(c, 'La puerta de la suite no está conectada.', 503);
  const u = new URL(c.req.url);
  u.pathname = u.pathname.slice(PREFIJO_SUITE.length) || '/';
  const p = new Request(u, c.req.raw);
  p.headers.set('X-App', APP);
  return await c.env.API.fetch(p);
});

/* ─────────── lo que contesta este Worker por sí mismo ─────────── */

// Señal de vida, sin sesión: la usa el despliegue para comprobar que el Worker
// quedó arriba. `datos: 'suite'` es lo que mide el verificador desde el 19-sep.
app.get('/api/salud', (c) => c.json({ ok: true, servicio: 'roster101', datos: 'suite', empresa: c.env.ORG_ID || '', hora: ahora() }));

// Datos del responsable: los lee el navegador para armar el aviso de privacidad.
// Salen de aquí y no de la suite porque viven en el wrangler.toml de la empresa.
export const datosEmpresa = (env) => ({
  empresa: env.EMPRESA || 'la empresa',
  razon_social: env.RAZON_SOCIAL || env.EMPRESA || 'la empresa',
  domicilio: env.DOMICILIO || '',
  correo_privacidad: env.CORREO_PRIVACIDAD || env.CORREO_AVISOS || '',
  correo_avisos: env.CORREO_AVISOS || '',
  correo_remitente: env.CORREO_REMITENTE || '',
  aviso_version: env.AVISO_VERSION || '1',
  version: env.PORTAL_VERSION || '',
});
app.get('/api/config', (c) => {
  const d = datosEmpresa(c.env);
  return c.json({ empresa: d.empresa, razon_social: d.razon_social, domicilio: d.domicilio, correo_privacidad: d.correo_privacidad, aviso_version: d.aviso_version, version: d.version });
});

/* ─────────── todo lo demás de /api/* es del motor, que vive en la suite ─────────── */

app.all('/api/*', async (c) => {
  if (!c.env.API) return err(c, 'La puerta de la suite no está conectada.', 503);
  if (!c.env.ORG_ID) return err(c, 'Este portal no tiene empresa: falta ORG_ID en su configuración.', 503);
  const req = c.req.raw;
  const entrada = new URL(req.url);
  const destino = new URL(`https://suite101-api/roster/${encodeURIComponent(c.env.ORG_ID)}${entrada.pathname}`);
  destino.search = entrada.search;

  const h = new Headers({ 'X-App': APP });
  // Las dos llaves posibles: la cookie del trabajador (t101_sesion) o la de la
  // suite (s101), que viajan en la misma cabecera; y el token de una app.
  for (const nombre of ['cookie', 'authorization', 'content-type', 'content-length', 'if-none-match']) {
    const v = req.headers.get(nombre);
    if (v) h.set(nombre, v);
  }
  // Los datos de la empresa, codificados: una cabecera sólo lleva ASCII y
  // «Razón social» o «Ciudad de México» la romperían.
  h.set('X-Roster', encodeURIComponent(JSON.stringify(datosEmpresa(c.env))));

  // El cuerpo se lee entero antes de reenviarlo (un documento son hasta 10 MB;
  // cabe): así el enlace de servicio no se queda con un flujo a medias si la
  // suite contesta antes de leerlo todo.
  const cuerpo = req.method === 'GET' || req.method === 'HEAD' ? null : await req.arrayBuffer();
  return await c.env.API.fetch(new Request(destino.toString(), { method: req.method, headers: h, body: cuerpo }));
});

// ─────────────────────────── estáticos ───────────────────────────

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// Ya no hay reloj: la papelera se vacía en la suite cada vez que se abre el
// panel, que era la segunda vía de siempre.
export default { fetch: app.fetch };
