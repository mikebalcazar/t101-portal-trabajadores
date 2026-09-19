/* Humo en staging: el portal entero, de verdad, contra la API de staging y la
 * empresa demo. Corre en el corredor antes de publicar producción; si no sale
 * verde, producción no se toca.
 *
 * Lo que se recorre: la puerta de la suite (el dueño entra con el código que
 * staging devuelve), el panel (quién soy, la lista, las cuentas), y la puerta
 * del trabajador (correo, código, expediente vacío, aviso, salir). Lo que
 * escribe se queda en la empresa demo de staging, que es para eso.
 *
 *     PORTAL=https://t101-portal-staging.mike-929.workers.dev node scripts/humo.mjs
 */

const PORTAL = (process.env.PORTAL || 'https://t101-portal-staging.mike-929.workers.dev').replace(/\/$/, '');
const CORREO = process.env.CORREO_SUPERADMIN || 'mike@forespot.com';
const SELLO = `${Date.now()}`.slice(-6);

let fallas = 0, revisadas = 0, galleta = '';
const linea = (t) => console.log(t);
function rev(ok, texto, extra = '') {
  revisadas++; if (!ok) fallas++;
  linea(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
}
async function traer(ruta, { method = 'GET', body, cabeceras = {} } = {}) {
  const h = { ...cabeceras };
  if (galleta) h.Cookie = galleta;
  if (body) h['Content-Type'] = 'application/json';
  const r = await fetch(`${PORTAL}${ruta}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const puesta = r.headers.get('set-cookie');
  if (puesta) galleta = puesta.split(';')[0];
  const texto = await r.text();
  let crudo = null;
  try { crudo = JSON.parse(texto); } catch { /* no es JSON */ }
  const envuelto = crudo && typeof crudo === 'object' && 'ok' in crudo && ('data' in crudo || 'error' in crudo) && !('servicio' in crudo);
  const cuerpo = envuelto ? (crudo.ok ? crudo.data : { error: crudo.error, detalle: crudo.detalle }) : crudo;
  return { estado: r.status, texto, cuerpo, tipo: r.headers.get('content-type') || '' };
}

linea(`roster101 — humo en staging, ${new Date().toISOString()}`);
linea(`== ${PORTAL} ==`);

const salud = await traer('/api/salud');
rev(salud.estado === 200 && salud.cuerpo?.servicio === 'roster101' && salud.cuerpo?.datos === 'suite' && salud.cuerpo?.empresa === 'demo', 'el portal de staging contesta, con los datos en la suite y la empresa demo', JSON.stringify(salud.cuerpo));
const s = await traer('/s101/salud');
rev(s.estado === 200 && s.cuerpo?.entorno === 'staging', 'el enlace de servicio llega a la API de staging', `${s.estado} ${s.cuerpo?.entorno} · contrato ${s.cuerpo?.contrato}`);

linea('\n-- el panel, con la cuenta de la suite --');
rev((await traer('/api/admin/yo')).estado === 401, 'sin sesión el panel contesta 401');
const cod = await traer('/s101/auth/codigo', { method: 'POST', body: { correo: CORREO } });
rev(cod.estado === 200 && /^\d{6}$/.test(String(cod.cuerpo?.codigo_prueba || '')), 'staging devuelve el código del dueño de la suite', `${cod.estado}`);
const ent = await traer('/s101/auth/entrar', { method: 'POST', body: { correo: CORREO, codigo: cod.cuerpo?.codigo_prueba } });
rev(ent.estado === 200 && galleta.startsWith('s101='), 'y entra por la puerta del Worker', `${ent.estado}`);
const yo = await traer('/api/admin/yo');
rev(yo.estado === 200 && yo.cuerpo?.nivel === 'dueno', 'abre el panel de la empresa demo como dueño', `${yo.estado} ${yo.cuerpo?.nivel ?? yo.cuerpo?.error ?? ''}`);
const lista = await traer('/api/admin/trabajadores');
rev(lista.estado === 200 && Array.isArray(lista.cuerpo?.trabajadores), 'la lista de expedientes carga', `${lista.estado} · ${lista.cuerpo?.trabajadores?.length ?? '?'} expedientes`);
const csv = await traer('/api/admin/tabla.csv');
rev(csv.estado === 200 && /text\/csv/.test(csv.tipo), 'la tabla en CSV sale', `${csv.estado} ${csv.tipo}`);
const bit = await traer('/api/admin/bitacora?dias=1');
rev(bit.estado === 200 && Array.isArray(bit.cuerpo?.tipos), 'la bitácora carga con su catálogo', `${bit.estado}`);
const galletaDueno = galleta;

linea('\n-- la puerta del trabajador (sin cuenta en la suite) --');
galleta = '';
const correoT = `humo-${SELLO}@ejemplo.mx`;
const codT = await traer('/api/codigo', { method: 'POST', body: { email: correoT } });
rev(codT.estado === 200 && /^\d{6}$/.test(String(codT.cuerpo?.codigo_prueba || '')), 'pide su código y staging lo devuelve', `${codT.estado} ${codT.cuerpo?.error ?? ''}`);
const mal = await traer('/api/entrar', { method: 'POST', body: { email: correoT, codigo: '000000' } });
rev(mal.estado === 401, 'un código equivocado no entra', `${mal.estado}`);
const entT = await traer('/api/entrar', { method: 'POST', body: { email: correoT, codigo: codT.cuerpo?.codigo_prueba } });
rev(entT.estado === 200 && entT.cuerpo?.nuevo === true && galleta.startsWith('t101_sesion='), 'con el bueno entra, es nuevo, y su cookie es la de siempre', `${entT.estado}`);
const yoT = await traer('/api/yo');
rev(yoT.estado === 200 && yoT.cuerpo?.trabajador?.email === correoT && yoT.cuerpo?.aviso === null, 've su expediente vacío, sin aviso aceptado', `${yoT.estado} folio ${yoT.cuerpo?.trabajador?.folio}`);
const sinAviso = await traer('/api/yo', { method: 'PUT', body: { nombre: 'Humo' } });
rev(sinAviso.estado === 403 && sinAviso.cuerpo?.falta_aviso === true, 'sin aceptar el aviso no guarda nada', `${sinAviso.estado}`);
const aviso = await traer('/api/aviso', { method: 'POST' });
rev(aviso.estado === 200 && aviso.cuerpo?.version === '2026-09-03', 'acepta el aviso con la versión del wrangler.toml de staging', `${aviso.cuerpo?.version}`);
rev((await traer('/api/admin/yo')).estado === 401, 'con la cookie del trabajador el panel no abre');
await traer('/api/salir', { method: 'POST' });
rev((await traer('/api/yo')).estado === 401, 'sale, y la cookie ya no abre');

linea('\n-- el panel ve al trabajador nuevo --');
galleta = galletaDueno;
const lista2 = await traer('/api/admin/trabajadores');
const nuevo = (lista2.cuerpo?.trabajadores || []).find((t) => t.email === correoT);
rev(!!nuevo, 'el expediente recién abierto está en la lista', nuevo ? `folio ${nuevo.folio}` : 'no está');
if (nuevo) {
  const baja = await traer(`/api/admin/trabajadores/${nuevo.id}`, { method: 'DELETE' });
  rev(baja.estado === 200, 'y se manda a la papelera (para no llenar demo de humo)', `${baja.estado}`);
  const borrado = await traer(`/api/admin/papelera/${nuevo.id}`, { method: 'DELETE' });
  rev(borrado.estado === 200, 'y se borra ya', `${borrado.estado}`);
}

linea('');
linea(`${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas === 0 ? 0 : 1);
