/* La puerta del panel (0.12), probada en una mesa de trabajo.
 *
 * El Worker es un módulo con `export default { fetch }`, así que se puede
 * llamar aquí mismo con un `env` de mentiras: una suite que contesta lo que se
 * le diga y una base con dos renglones. Lo que se prueba es lo único que cambió
 * —quién entra al panel y quién no— y se prueba sobre todo lo que NO debe
 * pasar: eso es lo que un despliegue no enseña hasta que ya es tarde.
 *
 * La puerta del trabajador no cambió y por eso no se toca aquí; sigue medida
 * en 0101.
 *
 *     node pruebas/0112-puerta-de-la-suite.mjs
 */

import worker from '../src/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, que, dato = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

/* ─────────── el mundo de mentiras ─────────── */

// Quién es cada galleta para la suite. Lo que no esté aquí, la suite no lo
// conoce.
const SUITE = {
  duena: { usuario: { id: 'u1', correo: 'mike@forespot.com', nombre: 'Mike' }, superadmin: true, orgs: [] },
  admina: { usuario: { id: 'u2', correo: 'fer@forespot.com', nombre: 'Fer' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'admin', apps: [] }] },
  consulta: { usuario: { id: 'u3', correo: 'consulta@forespot.com', nombre: 'Quien Mira' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'staff', apps: ['roster101'] }] },
  apagada: { usuario: { id: 'u4', correo: 'apagada@forespot.com', nombre: 'Sin Acceso' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'staff', apps: ['roster101'] }] },
  sin_roster: { usuario: { id: 'u5', correo: 'solo-dash@forespot.com', nombre: 'Sólo Dash' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'socio', apps: ['dash101'] }] },
  sin_cuenta: { usuario: { id: 'u6', correo: 'nadie@forespot.com', nombre: 'Nadie' }, superadmin: false, orgs: [{ id: 'forespot', rol: 'staff', apps: ['roster101'] }] },
};

// Las dos cuentas que hay hoy en producción, más dos para los casos de borde.
const CUENTAS = [
  { id: 'c-mike', email: 'mike@forespot.com', nombre: 'Mike Balcazar', nivel: 'dueno', activo: 1 },
  { id: 'c-fer', email: 'fer@forespot.com', nombre: 'Fer Balcazar', nivel: 'admin', activo: 1 },
  { id: 'c-con', email: 'consulta@forespot.com', nombre: 'Quien Mira', nivel: 'consulta', activo: 1 },
  { id: 'c-off', email: 'apagada@forespot.com', nombre: 'Sin Acceso', nivel: 'admin', activo: 0 },
];

let pedidasALaSuite = [];
let escrito = [];      // lo que el Worker mandó escribir, para leer la bitácora

function mundo({ cuentas = CUENTAS } = {}) {
  pedidasALaSuite = [];
  escrito = [];
  return {
    EMPRESA: 'Taller 101', PORTAL_VERSION: '0.12.0',
    API: {
      async fetch(req) {
        const u = new URL(req.url);
        pedidasALaSuite.push({ ruta: u.pathname, app: req.headers.get('X-App'), metodo: req.method });
        if (u.pathname !== '/yo') return new Response(JSON.stringify({ ok: true, data: { eco: u.pathname } }), { status: 200 });
        const galleta = /(?:^|;\s*)s101=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1];
        const llevada = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') || null;
        const quien = SUITE[galleta ?? ''] ?? SUITE[llevada ?? ''] ?? null;
        if (!quien) return new Response(JSON.stringify({ ok: false, error: 'sin_sesion' }), { status: 401 });
        return new Response(JSON.stringify({ ok: true, data: quien }), { status: 200 });
      },
    },
    DB: {
      prepare(sql) {
        return {
          bind(...a) {
            return {
              async first() {
                if (/FROM administradores WHERE email/.test(sql)) return cuentas.find((c) => c.email === a[0]) ?? null;
                if (/COUNT\(\*\) AS n FROM administradores/.test(sql)) return { n: cuentas.length };
                return null;
              },
              async all() { return { results: [] }; },
              async run() { escrito.push({ sql, a }); return { success: true }; },
            };
          },
          async first() {
            if (/COUNT\(\*\) AS n FROM administradores/.test(sql)) return { n: cuentas.length };
            return null;
          },
          async all() { return { results: [] }; },
          async run() { return { success: true }; },
        };
      },
      async batch() { return []; },
    },
    DOCS: { async get() { return null; }, async head() { return null; }, async delete() {} },
    ASSETS: { async fetch() { return new Response('el sitio', { status: 200 }); } },
  };
}

const pide = (ruta, cabeceras = {}, env = mundo()) =>
  worker.fetch(new Request(`https://t101-portal.mike-929.workers.dev${ruta}`, { headers: cabeceras }), env, { waitUntil() {} });

const comoQuien = (galleta) => ({ Cookie: `s101=${galleta}` });

/* ─────────── lo que se prueba ─────────── */

console.log('\nLa puerta de la suite:');
{
  const env = mundo();
  const r = await worker.fetch(new Request('https://t101-portal.mike-929.workers.dev/s101/auth/codigo', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App': 'me-quiero-hacer-pasar-por-otro' }, body: '{"correo":"x@y.mx"}',
  }), env, { waitUntil() {} });
  rev(r.status === 200, '/s101/auth/codigo llega a la API', String(r.status));
  rev(pedidasALaSuite[0]?.ruta === '/auth/codigo', 'y llega sin el prefijo', String(pedidasALaSuite[0]?.ruta));
  rev(pedidasALaSuite[0]?.app === 'roster101', 'el Worker pone X-App y pisa lo que mandó la pantalla', String(pedidasALaSuite[0]?.app));
  rev(pedidasALaSuite[0]?.metodo === 'POST', 'y no se pierde el método', String(pedidasALaSuite[0]?.metodo));
}

console.log('\nQuién entra al panel:');
for (const [galleta, nivel, quien] of [
  ['duena', 'dueno', 'la dueña de la suite, que además tiene cuenta'],
  ['admina', 'admin', 'quien trae la lista de apps vacía (o sea todas)'],
  ['consulta', 'consulta', 'quien trae roster101 en su lista'],
]) {
  const r = await pide('/api/admin/yo', comoQuien(galleta));
  const d = await r.json().catch(() => ({}));
  rev(r.status === 200 && d.nivel === nivel, `${quien} entra con nivel ${nivel}`, `${r.status} ${d.nivel ?? d.error ?? ''}`);
}
{
  const r = await pide('/api/admin/yo', comoQuien('consulta'));
  const d = await r.json();
  rev(d.permisos && d.permisos.expedientes === true && d.permisos.exportar === false,
    'y el panel recibe sus permisos, no sólo su nivel', JSON.stringify(d.permisos));
  rev(d.debe_cambiar === undefined, 'ya no se habla de cambiar contraseña');
}

console.log('\nQuién NO entra:');
for (const [cabeceras, quien] of [
  [{}, 'sin nada'],
  [{ Cookie: 's101=inventada' }, 'con una galleta que la suite no reconoce'],
  [{ Authorization: 'Bearer inventado' }, 'con un token que la suite no reconoce'],
  [comoQuien('sin_roster'), 'quien entra a la suite pero no trae roster101 en sus apps'],
  [comoQuien('sin_cuenta'), 'quien entra a la suite pero no tiene cuenta en el panel'],
  [comoQuien('apagada'), 'quien tiene cuenta pero se la apagaron'],
]) {
  const r = await pide('/api/admin/yo', cabeceras);
  rev(r.status === 401, `${quien}, no`, String(r.status));
}

console.log('\nEl arranque, sin clave compartida:');
{
  const vacio = mundo({ cuentas: [] });
  const r = await pide('/api/admin/yo', comoQuien('duena'), vacio);
  const d = await r.json().catch(() => ({}));
  rev(r.status === 200 && d.nivel === 'dueno' && d.de_la_suite === true,
    'con el panel recién puesto, el dueño de la suite entra como dueño', `${r.status} ${d.nivel ?? d.error ?? ''}`);
  const otro = await pide('/api/admin/yo', comoQuien('admina'), mundo({ cuentas: [] }));
  rev(otro.status === 401, 'y nadie más: un panel vacío no se abre solo', String(otro.status));
  const estado = await pide('/api/admin/estado', {}, mundo({ cuentas: [] }));
  rev((await estado.json()).cuentas === false, 'la pantalla puede saber que todavía no hay cuentas');
}

console.log('\nLa puerta vieja ya no abre:');
for (const ruta of ['/api/admin/entrar', '/api/admin/clave', '/api/admin/clave/olvide', '/api/admin/clave/restaurar', '/api/admin/cuentas/primera']) {
  const r = await worker.fetch(new Request(`https://t101-portal.mike-929.workers.dev${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  }), mundo(), { waitUntil() {} });
  // Ya no existen: lo que contesta es el sitio (`ASSETS`), no un 200 con sesión.
  rev(r.status !== 200 || (await r.text()) === 'el sitio', `${ruta} ya no es una puerta`, String(r.status));
}

console.log('\nCada nivel hace lo suyo, y la bitácora dice quién fue:');
{
  const noExporta = await pide('/api/admin/tabla.csv', comoQuien('consulta'));
  rev(noExporta.status === 403, 'consulta NO exporta la tabla', String(noExporta.status));

  const siExporta = await pide('/api/admin/tabla.csv', comoQuien('admina'));
  rev(siExporta.status === 200, 'administración sí exporta la tabla', String(siExporta.status));

  // El ZIP sí deja renglón en la bitácora, y con el correo de quien lo pidió:
  // es lo que medía el 0111 leyendo el .sqlite.
  const env = mundo();
  const zip = await pide('/api/admin/exportar', comoQuien('admina'), env);
  rev(zip.status === 200, 'y el ZIP con todo', String(zip.status));
  const renglon = escrito.find((e) => /INSERT INTO bitacora/.test(e.sql) && e.a[2] === 'exportacion');
  rev(!!renglon && renglon.a[1] === 'fer@forespot.com',
    'la bitácora guarda el correo de quien exportó, no «admin»', String(renglon?.a?.[1]));
  const noZip = await pide('/api/admin/exportar', comoQuien('consulta'));
  rev(noZip.status === 403, 'y consulta tampoco saca el ZIP', String(noZip.status));
}

console.log('\nLa cookie vieja del panel no vale nada:');
{
  const r = await pide('/api/admin/yo', { Cookie: 't101_admin=loquesea' });
  rev(r.status === 401, 'una cookie t101_admin suelta no abre el panel', String(r.status));
}

console.log();
if (fallas) { console.log(`FALLAS: ${fallas} de ${revisadas}`); process.exit(1); }
console.log(`Medido: ${revisadas} comprobaciones de la puerta del panel, en verde.`);
