/* Mide la puerta del panel ya publicada, desde afuera.
 *
 * El chat no alcanza *.workers.dev: el proxy de salida se lo rechaza. El
 * corredor de GitHub sí. Por eso esto corre allá y lo que mide vuelve por el
 * comentario del commit (OPERAR §6).
 *
 * Es producción, con los expedientes de verdad, así que aquí NO se entra y NO
 * se escribe: todo lo que se mide se mide desde afuera de la puerta, y lo que
 * se comprueba es que la puerta esté donde debe y diga que no cuando toca.
 * Entrar y escribir se hace en staging (scripts/humo.mjs), antes de publicar.
 *
 *     PORTAL=https://… node scripts/medir-puerta.mjs
 */

const PORTAL = (process.env.PORTAL || 'https://roster101.taller101.com').replace(/\/$/, '');
const API = process.env.API || 'https://suite101-api.mike-929.workers.dev';

let fallas = 0, revisadas = 0;
const linea = (t) => console.log(t);
function rev(ok, texto, extra = '') {
  revisadas++; if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}

async function traer(ruta, { method = 'GET', body, cabeceras = {} } = {}) {
  const t0 = Date.now();
  const h = { ...cabeceras };
  if (body) h['Content-Type'] = 'application/json';
  let r;
  try {
    r = await fetch(`${PORTAL}${ruta}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  } catch (e) {
    return { estado: 0, ms: Date.now() - t0, texto: String(e), cuerpo: null, ubicacion: '' };
  }
  const texto = await r.text();
  let crudo = null;
  try { crudo = JSON.parse(texto); } catch { /* HTML */ }
  // Sólo la API de la suite envuelve en `{ ok, data }`; lo que contesta el
  // propio portal trae `ok` pegado a los datos.
  const envuelto = crudo && typeof crudo === 'object' && 'ok' in crudo && ('data' in crudo || 'error' in crudo);
  const cuerpo = envuelto ? (crudo.ok ? crudo.data : { error: crudo.error, detalle: crudo.detalle }) : crudo;
  return { estado: r.status, ms: Date.now() - t0, ubicacion: r.headers.get('location') || '', texto, cuerpo };
}

linea(`roster101 — la puerta del panel, medida el ${new Date().toISOString()}`);
linea('');
linea(`== ${PORTAL} ==`);

const salud = await traer('/api/salud');
rev(salud.estado === 200 && salud.cuerpo?.servicio === 'roster101', 'el portal contesta y se nombra', `${salud.estado} ${salud.cuerpo?.servicio ?? ''}`);
rev(salud.cuerpo?.datos === 'suite' && salud.cuerpo?.empresa === 'forespot', 'y dice que los datos viven en la suite, en la empresa forespot', `${salud.cuerpo?.datos} ${salud.cuerpo?.empresa}`);

const config = await traer('/api/config');
rev(config.cuerpo?.version === '0.13.1', 'sirve la versión que se acaba de publicar', String(config.cuerpo?.version));

linea('');
linea('-- la puerta de la suite --');
const s = await traer('/s101/salud');
rev(s.estado === 200 && s.cuerpo?.servicio === 'suite101-api', 'el enlace de servicio llega a suite101-api', `${s.estado} · contrato ${s.cuerpo?.contrato}`);
rev(s.cuerpo?.entorno === 'produccion', 'y es la API de producción, no la de prueba', String(s.cuerpo?.entorno));

const yo = await traer('/s101/yo');
rev(yo.estado === 401 && yo.cuerpo?.error === 'sin_sesion', '/s101/yo sin sesión contesta 401', `${yo.estado} ${yo.cuerpo?.error ?? ''}`);

const cod = await traer('/s101/auth/codigo', { method: 'POST', body: { correo: 'nadie-de-roster101@ejemplo.mx' } });
rev(cod.estado === 200, 'pedir código contesta 200 aunque el correo no exista', `${cod.estado} en ${cod.ms} ms`);
rev(!/codigo_prueba/.test(cod.texto), 'y producción NUNCA devuelve el código en la respuesta');

const google = await traer(`/s101/auth/google?volver_a=${encodeURIComponent(PORTAL + '/admin.html')}`);
rev(google.estado !== 403, 'esta dirección está dada de alta en la API para entrar con Google', `${google.estado} ${google.cuerpo?.error ?? ''}`);
if (google.estado === 302) {
  rev(google.ubicacion.startsWith('https://accounts.google.com/'), 'y manda a Google', google.ubicacion.slice(0, 60));
  rev(new URL(google.ubicacion).searchParams.get('redirect_uri') === `${API}/auth/google/callback`, 'Google devuelve a la API, no al portal');
} else {
  rev(google.estado === 501, 'Google todavía no está prendido (501), pero la puerta existe', String(google.estado));
}

linea('');
linea('-- el panel --');
for (const [ruta, que] of [['/api/admin/yo', 'quién soy'], ['/api/admin/trabajadores', 'la lista de expedientes'], ['/api/admin/tabla.csv', 'la tabla en CSV']]) {
  const r = await traer(ruta);
  rev(r.estado === 401, `sin sesión, ${que} contesta 401`, String(r.estado));
}
const conGalleta = await traer('/api/admin/yo', { cabeceras: { Cookie: 's101=inventada.firmaQueNoEs; t101_admin=tampoco' } });
rev(conGalleta.estado === 401, 'con cookies inventadas —la de la suite y la vieja del panel—, tampoco', String(conGalleta.estado));

linea('');
linea('-- la puerta vieja ya no existe --');
for (const ruta of ['/api/admin/entrar', '/api/admin/clave', '/api/admin/clave/olvide', '/api/admin/clave/restaurar', '/api/admin/cuentas/primera']) {
  const r = await traer(ruta, { method: 'POST', body: {} });
  const abrio = r.estado === 200 && r.cuerpo && typeof r.cuerpo === 'object' && !('error' in r.cuerpo);
  rev(!abrio, `${ruta} no abre nada`, `${r.estado}`);
}

linea('');
linea('-- la puerta del trabajador NO cambió --');
const portada = await traer('/');
rev(portada.estado === 200, 'la portada del trabajador contesta', String(portada.estado));
const entrar = await traer('/api/entrar', { method: 'POST', body: { email: 'nadie@ejemplo.mx', codigo: '000000' } });
rev(entrar.estado === 401, 'y su puerta sigue ahí, pidiendo un código de verdad (la contesta la suite)', String(entrar.estado));
const yoT = await traer('/api/yo', { cabeceras: { Cookie: 't101_sesion=inventada.firmaQueNoEs' } });
rev(yoT.estado === 401, 'una cookie de trabajador inventada no abre nada', String(yoT.estado));

linea('');
linea(`${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
