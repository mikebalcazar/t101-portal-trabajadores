// La dirección de workers.dev manda al dominio propio; el dominio, /api/* y
// los Workers sin DOMINIO_PROPIO (otras empresas, staging) siguen igual.
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }) };
const prod = { DOMINIO_PROPIO: 'roster101.taller101.com', ORG_ID: 'forespot', EMPRESA: 'Taller 101', ASSETS, API };
const otra = { ORG_ID: 'demo', EMPRESA: 'Empresa demo', ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env, { waitUntil() {} });

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://t101-portal.mike-929.workers.dev/?x=1', prod);
ok(r.status === 301, 'una lectura de la pantalla en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://roster101.taller101.com/?x=1', 'y conserva ruta y consulta');
r = await pide('https://t101-portal.mike-929.workers.dev/admin.html', prod);
ok(r.status === 301, 'el panel también');
r = await pide('https://roster101.taller101.com/', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio se sirve la pantalla');
r = await pide('https://t101-portal.mike-929.workers.dev/api/salud', prod);
ok(r.status === 200, '/api/* en workers.dev sigue contestando');
r = await pide('https://t101-portal.mike-929.workers.dev/s101/yo', prod);
ok(r.status === 200, 'la puerta a la suite no se redirige');
r = await pide('https://t101-portal.mike-929.workers.dev/', prod, { method: 'POST' });
ok(r.status !== 301, 'lo que no es lectura tampoco');
r = await pide('https://t101-portal-staging.mike-929.workers.dev/', otra);
ok(r.status === 200 && await r.text() === 'sitio', 'un Worker sin DOMINIO_PROPIO (otra empresa, staging) sirve tal cual');
console.log(`${n} revisadas · 0 fallas`);
