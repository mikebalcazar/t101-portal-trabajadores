/* El cascarón (0.13), probado en una mesa de trabajo.
 *
 * Desde el 19-sep el Worker no tiene base: todo /api/* va a la suite, a
 * `/roster/{empresa}/api/…`, y /s101/* a la suite tal cual. Lo que se prueba
 * aquí es que reenvíe bien —la ruta, la empresa, la app, las cookies, los
 * datos de la empresa, el cuerpo— y que lo poco que contesta por sí mismo
 * (/api/salud, /api/config) diga la verdad. Quién entra y quién no lo decide
 * la suite, y eso está medido allá (suite101-api, pruebas/roster.spec.ts).
 *
 *     node pruebas/0112-cascaron.mjs
 */

import worker from '../src/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, que, dato = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

let llegadas = [];
function mundo(extra = {}) {
  llegadas = [];
  return {
    ORG_ID: 'forespot', EMPRESA: 'Taller 101', RAZON_SOCIAL: 'Taller 101 SA de CV', DOMICILIO: '5 de Mayo 60, Ciudad de México',
    CORREO_PRIVACIDAD: 'privacidad@ejemplo.mx', CORREO_AVISOS: 'avisos@ejemplo.mx', CORREO_REMITENTE: 'Taller 101 <x@ejemplo.mx>',
    AVISO_VERSION: '2026-09-03', PORTAL_VERSION: '0.13.0',
    API: {
      async fetch(req) {
        const u = new URL(req.url);
        llegadas.push({ ruta: u.pathname + u.search, metodo: req.method, cabeceras: Object.fromEntries(req.headers), cuerpo: req.method === 'GET' ? null : await req.text() });
        return new Response(JSON.stringify({ eco: u.pathname }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 't101_sesion=firmada; Path=/; HttpOnly' } });
      },
    },
    ASSETS: { async fetch() { return new Response('el sitio', { status: 200 }); } },
    ...extra,
  };
}
const pide = (ruta, init = {}, env = mundo()) =>
  worker.fetch(new Request(`https://t101-portal.mike-929.workers.dev${ruta}`, init), env, { waitUntil() {} });

console.log('\nLa puerta de la suite (/s101/*):');
{
  const r = await pide('/s101/auth/codigo', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App': 'me-quiero-hacer-pasar-por-otro' }, body: '{"correo":"x@y.mx"}' });
  rev(r.status === 200, '/s101/auth/codigo llega a la API', String(r.status));
  rev(llegadas[0]?.ruta === '/auth/codigo', 'y llega sin el prefijo', String(llegadas[0]?.ruta));
  rev(llegadas[0]?.cabeceras['x-app'] === 'roster101', 'el Worker pone X-App y pisa lo que mandó la pantalla', String(llegadas[0]?.cabeceras['x-app']));
  rev(llegadas[0]?.metodo === 'POST' && llegadas[0]?.cuerpo === '{"correo":"x@y.mx"}', 'y no se pierden el método ni el cuerpo');
}

console.log('\nLo que contesta el Worker por sí mismo:');
{
  const s = await (await pide('/api/salud')).json();
  rev(s.ok === true && s.servicio === 'roster101' && s.datos === 'suite' && s.empresa === 'forespot', '/api/salud se nombra y dice que los datos viven en la suite', JSON.stringify(s));
  rev(llegadas.length === 0, 'sin tocar la API');
  const c = await (await pide('/api/config')).json();
  rev(c.empresa === 'Taller 101' && c.razon_social === 'Taller 101 SA de CV' && c.aviso_version === '2026-09-03' && c.version === '0.13.0', '/api/config trae los datos de la empresa del wrangler.toml', JSON.stringify(c));
  rev(c.correo_remitente === undefined && c.correo_avisos === undefined, 'y no regala los correos internos');
  const sitio = await pide('/admin.html');
  rev((await sitio.text()) === 'el sitio', 'lo que no es /api ni /s101 es el sitio');
}

console.log('\nTodo lo demás de /api/* va al motor, en la suite:');
{
  const r = await pide('/api/admin/trabajadores?pagina=2', { headers: { Cookie: 's101=galleta-de-la-suite; t101_sesion=otra', Authorization: 'Bearer token-de-app' } });
  rev(r.status === 200, 'contesta lo que contestó la API', String(r.status));
  const l = llegadas[0];
  rev(l?.ruta === '/roster/forespot/api/admin/trabajadores?pagina=2', 'a /roster/{empresa}/api/… con la empresa del wrangler.toml y la consulta', String(l?.ruta));
  rev(l?.cabeceras['x-app'] === 'roster101', 'con X-App roster101');
  rev(l?.cabeceras.cookie === 's101=galleta-de-la-suite; t101_sesion=otra', 'las cookies viajan tal cual (la de la suite y la del trabajador)', String(l?.cabeceras.cookie));
  rev(l?.cabeceras.authorization === 'Bearer token-de-app', 'y el token de una app también');
  const datos = JSON.parse(decodeURIComponent(l?.cabeceras['x-roster'] || '%7B%7D'));
  rev(datos.empresa === 'Taller 101' && datos.razon_social === 'Taller 101 SA de CV' && datos.correo_avisos === 'avisos@ejemplo.mx' && datos.correo_remitente === 'Taller 101 <x@ejemplo.mx>' && datos.aviso_version === '2026-09-03',
    'los datos de la empresa van en X-Roster, codificados en ASCII', JSON.stringify(datos));
  rev(/^[\x21-\x7e]*$/.test(l?.cabeceras['x-roster'] || 'ñ'), 'y la cabecera no lleva ni un acento');
  rev(r.headers.get('set-cookie')?.startsWith('t101_sesion=firmada'), 'la cookie que pone la suite llega al navegador', String(r.headers.get('set-cookie')));
}
{
  const r = await pide('/api/entrar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"email":"a@b.mx","codigo":"123456"}' });
  rev(r.status === 200 && llegadas[0]?.metodo === 'POST' && llegadas[0]?.cuerpo === '{"email":"a@b.mx","codigo":"123456"}', 'un POST llega con su cuerpo entero', String(llegadas[0]?.cuerpo));
  rev(llegadas[0]?.cabeceras['content-type'] === 'application/json', 'y con su Content-Type');
}
{
  const fd = new FormData();
  fd.append('tipo', 'foto');
  fd.append('archivo', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'foto.png');
  const r = await pide('/api/docs', { method: 'POST', body: fd });
  rev(r.status === 200 && /multipart\/form-data/.test(llegadas[0]?.cabeceras['content-type'] || '') && /name="archivo"/.test(llegadas[0]?.cuerpo || ''), 'un documento (multipart) llega entero', String(llegadas[0]?.cabeceras['content-type']).slice(0, 40));
}
{
  const r = await pide('/api/yo', {}, mundo({ ORG_ID: '' }));
  rev(r.status === 503 && /ORG_ID/.test((await r.json()).error), 'sin ORG_ID el Worker lo dice, en vez de tocar a una empresa que no es', String(r.status));
  const sinApi = await pide('/api/yo', {}, mundo({ API: undefined }));
  rev(sinApi.status === 503, 'sin enlace a la suite, 503');
}

console.log();
if (fallas) { console.log(`FALLAS: ${fallas} de ${revisadas}`); process.exit(1); }
console.log(`Medido: ${revisadas} comprobaciones del cascarón, en verde.`);
