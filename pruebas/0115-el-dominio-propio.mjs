// La dirección de workers.dev y la de antes (DOMINIO_ANTERIOR, taller101.com)
// mandan al dominio propio; el dominio, /api/*, /s101/* y los Workers sin
// DOMINIO_PROPIO (otras empresas, staging) siguen igual.
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const ASSETS = { fetch: async () => new Response('sitio') };
const API = { fetch: async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }) };
const prod = { DOMINIO_PROPIO: 'roster.suite101.app', DOMINIO_ANTERIOR: 'roster101.taller101.com', ORG_ID: 'forespot', EMPRESA: 'Taller 101', ASSETS, API };
const otra = { ORG_ID: 'demo', EMPRESA: 'Empresa demo', ASSETS, API };
const pide = (url, env, init) => worker.fetch(new Request(url, init), env, { waitUntil() {} });

let n = 0; const ok = (c, m) => { n++; assert.ok(c, m); console.log('  ok   ', m); };

let r = await pide('https://t101-portal.mike-929.workers.dev/?x=1', prod);
ok(r.status === 301, 'una lectura de la pantalla en workers.dev manda al dominio con 301');
ok(r.headers.get('location') === 'https://roster.suite101.app/?x=1', 'y conserva ruta y consulta');
r = await pide('https://t101-portal.mike-929.workers.dev/admin.html', prod);
ok(r.status === 301, 'el panel también');
r = await pide('https://roster.suite101.app/', prod);
ok(r.status === 200 && await r.text() === 'sitio', 'en el dominio se sirve la pantalla');
r = await pide('https://t101-portal.mike-929.workers.dev/api/salud', prod);
ok(r.status === 200, '/api/* en workers.dev sigue contestando');
r = await pide('https://t101-portal.mike-929.workers.dev/s101/yo', prod);
ok(r.status === 200, 'la puerta a la suite no se redirige');
r = await pide('https://t101-portal.mike-929.workers.dev/', prod, { method: 'POST' });
ok(r.status !== 301, 'lo que no es lectura tampoco');
r = await pide('https://t101-portal-staging.mike-929.workers.dev/', otra);
ok(r.status === 200 && await r.text() === 'sitio', 'un Worker sin DOMINIO_PROPIO (otra empresa, staging) sirve tal cual');
// Sin la «s» (Mike, 30-sep-2026): http en el dominio propio manda a https.
r = await pide('http://roster.suite101.app/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://roster.suite101.app/?x=1', 'http en el dominio propio manda a https con 301, con ruta y consulta');
r = await pide('http://roster.suite101.app/', prod, { method: 'POST' });
ok(r.status !== 301, 'pero un POST por http no se convierte en GET');
r = await pide('http://t101-portal-staging.mike-929.workers.dev/', otra);
ok(r.status !== 301, 'y sin DOMINIO_PROPIO no se toca');
// 11-oct-2026 · la suite se mudó a suite101.app: la dirección de taller101.com
// sigue viva y manda al dominio nuevo, con las mismas reglas que workers.dev.
const VIEJA = 'https://roster101.taller101.com';
r = await pide(`${VIEJA}/admin.html?pestana=equipos&x=1`, prod);
ok(r.status === 301 && r.headers.get('location') === 'https://roster.suite101.app/admin.html?pestana=equipos&x=1', 'la dirección vieja manda a la nueva con 301, con ruta y consulta');
r = await pide(`${VIEJA}/`, prod, { method: 'HEAD' });
ok(r.status === 301, 'un HEAD también');
r = await pide(`${VIEJA}/s101/yo`, prod);
ok(r.status === 200, 'la puerta a la suite desde la dirección vieja no se redirige');
r = await pide(`${VIEJA}/s101`, prod);
ok(r.status !== 301, 'ni /s101 pelón');
r = await pide(`${VIEJA}/api/salud`, prod);
ok(r.status === 200, '/api/* del portal desde la dirección vieja sigue contestando, sin redirigir');
r = await pide(`${VIEJA}/api/yo`, prod);
ok(r.status !== 301, 'ni la sesión del trabajador');
r = await pide(`${VIEJA}/api/entrar`, prod, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
ok(r.status !== 301, 'ni su entrada (POST)');
r = await pide(`${VIEJA}/`, prod, { method: 'POST' });
ok(r.status !== 301, 'lo que no es lectura en la dirección vieja tampoco');
r = await pide('http://roster101.taller101.com/?x=1', prod);
ok(r.status === 301 && r.headers.get('location') === 'https://roster.suite101.app/?x=1', 'la vieja por http va directo a la nueva por https');
r = await pide('https://roster.acme.com/?x=1', prod, { headers: { 'X-Dominio-Empresa': 'roster.acme.com', 'X-Org-Empresa': 'acme' } });
ok(r.status === 200 && await r.text() === 'sitio', 'un dominio de empresa (roster.acme.com) no se redirige');
r = await pide('https://roster101.acme.com/', prod);
ok(r.status === 200, 'ni roster101.acme.com');
r = await pide('https://roster101.taller101.com.acme.com/', prod);
ok(r.status === 200, 'ni un host que sólo empieza como la dirección vieja');
const dos = { ...prod, DOMINIO_ANTERIOR: ' roster101.taller101.com , portal.taller101.com ' };
r = await pide('https://portal.taller101.com/x?y=2', dos);
ok(r.status === 301 && r.headers.get('location') === 'https://roster.suite101.app/x?y=2', 'DOMINIO_ANTERIOR acepta varias, separadas por comas');
r = await pide('https://roster101.taller101.com/', otra);
ok(r.status === 200, 'sin DOMINIO_PROPIO, la dirección vieja tampoco se toca');
console.log(`${n} revisadas · 0 fallas`);
