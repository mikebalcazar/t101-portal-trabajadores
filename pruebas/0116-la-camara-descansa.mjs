/* La cámara descansa: pide lo justo, se apaga al irse al fondo y vuelve sola.
 * Y el reintento de guardado sólo existe mientras haya algo por guardar.
 *
 * Mike, 29-sep-2026: «Hay que reducir el consumo de recursos de las apps en
 * MÓVIL. Es crítico.» En roster101 el gasto está en la cámara: la vista
 * previa pedía 1920×1440 (y el escáner 2560×1920) cuando la foto guardada se
 * recorta a 1200–1800 de lado, y el sensor seguía prendido con la app en el
 * fondo. Además, un `setInterval` de 20 s despertaba al teléfono toda la
 * sesión, con la ficha ya guardada.
 *
 * CÓMO SE MIDE SIN CÁMARA
 *
 * Se sirve `public/` como sitio estático y, antes de que cargue la app, se
 * le pone a `navigator.mediaDevices.getUserMedia` un doble que apunta con
 * qué resolución se le pidió y devuelve un flujo de verdad (el de un lienzo,
 * que `video.srcObject` sí acepta) con `stop()` contado. Después se finge
 * que la app se va al fondo cambiando `document.visibilityState` y avisando
 * `visibilitychange`, que es exactamente lo que hace el teléfono.
 *
 *     node pruebas/0116-la-camara-descansa.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const RAIZ = new URL('../public/', import.meta.url).pathname;
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json', '.png': 'image/png' };

const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  const archivo = join(RAIZ, ruta === '/' ? 'index.html' : ruta);
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0;
const rev = (ok, que, dato = '') => {
  if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

// El doble de la cámara: apunta las peticiones y cuenta los stop().
await p.addInitScript(() => {
  window.__cam = { pedidas: [], paradas: 0, vivos: 0 };
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = async (c) => {
    window.__cam.pedidas.push(c);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 48;
    cv.getContext('2d').fillRect(0, 0, 64, 48);
    const flujo = cv.captureStream(5);
    for (const t of flujo.getTracks()) {
      const stop = t.stop.bind(t);
      t.stop = () => { window.__cam.paradas++; window.__cam.vivos--; stop(); };
    }
    window.__cam.vivos++;
    return flujo;
  };
  // Para fingir que la app se va al fondo y vuelve.
  let visible = 'visible';
  Object.defineProperty(document, 'visibilityState', { get: () => visible, configurable: true });
  Object.defineProperty(document, 'hidden', { get: () => visible === 'hidden', configurable: true });
  window.__fondo = (si) => { visible = si ? 'hidden' : 'visible'; document.dispatchEvent(new Event('visibilitychange')); };
});
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
await p.route('**/api/**', (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/config') return route.fulfill(json(200, { empresa: 'Taller de prueba', razon_social: 'Taller de prueba', correo_privacidad: 'privacidad@ejemplo.mx', version: 'prueba' }));
  if (u.pathname === '/api/yo') return route.fulfill(json(401, { error: 'sin_sesion' }));
  return route.fulfill(json(200, { ok: true }));
});
await p.goto(base);
await p.waitForTimeout(400);

const cam = () => p.evaluate(() => ({ ...window.__cam, ultima: window.__cam.pedidas.at(-1)?.video }));
const espera = (fn, ms = 3000) => p.waitForFunction(fn, null, { timeout: ms }).then(() => true).catch(() => false);

console.log('· la cámara de la foto del trabajador');
// El botón existe aunque no haya sesión; se le pica por código, que es lo mismo que el dedo.
await p.evaluate(() => document.querySelector('#btn-foto-camara').click());
rev(await espera(() => window.__cam.pedidas.length === 1), 'al abrir, se pide la cámara una vez');
let c = await cam();
rev(c.ultima && c.ultima.width.ideal <= 1280 && c.ultima.height.ideal <= 960, 'y se pide a lo más 1280×960, no 1920×1440', `${c.ultima?.width?.ideal}×${c.ultima?.height?.ideal}`);
rev(c.vivos === 1, 'el sensor está prendido');
rev(!(await p.evaluate(() => document.querySelector('#camara').classList.contains('oculto'))), 'la pantalla de la cámara está abierta');

await p.evaluate(() => window.__fondo(true));
rev(await espera(() => window.__cam.vivos === 0), 'al irse la app al fondo, el sensor se apaga');
rev(!(await p.evaluate(() => document.querySelector('#camara').classList.contains('oculto'))), 'pero la pantalla de la cámara sigue abierta: no se le cierra a nadie');

await p.evaluate(() => window.__fondo(false));
rev(await espera(() => window.__cam.pedidas.length === 2 && window.__cam.vivos === 1), 'al volver, se vuelve a prender sola');
c = await cam();
rev(c.ultima && c.ultima.width.ideal <= 1280, 'con la misma resolución baja');

await p.evaluate(() => document.querySelector('#cam-cerrar').click());
rev(await espera(() => window.__cam.vivos === 0), 'al cerrarla, se apaga');
await p.evaluate(() => { window.__fondo(true); window.__fondo(false); });
await p.waitForTimeout(300);
c = await cam();
rev(c.pedidas.length === 2 && c.vivos === 0, 'y cerrada, irse al fondo y volver NO la prende', `${c.pedidas.length} peticiones`);

console.log('· el escáner de documentos');
await p.evaluate(() => { window.__cam.pedidas = []; window.Escaner.capturar({ tipo: 'tarjeta', titulo: 'INE — frente' }); });
rev(await espera(() => window.__cam.pedidas.length === 1 && window.__cam.vivos === 1), 'al abrir, se pide la cámara y queda prendida');
c = await cam();
rev(c.ultima && c.ultima.width.ideal <= 1280 && c.ultima.height.ideal <= 960, 'a lo más 1280×960, no 2560×1920', `${c.ultima?.width?.ideal}×${c.ultima?.height?.ideal}`);
await p.evaluate(() => window.__fondo(true));
rev(await espera(() => window.__cam.vivos === 0), 'al fondo, se apaga');
await p.evaluate(() => window.__fondo(false));
rev(await espera(() => window.__cam.pedidas.length === 2 && window.__cam.vivos === 1), 'al volver, se prende sola');
await p.evaluate(() => document.querySelector('.esc-cerrar').click());
rev(await espera(() => window.__cam.vivos === 0), 'al cerrar, se apaga');

console.log('· el reintento de guardado sólo vive mientras haya algo por guardar');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const auto = readFileSync(new URL('../public/autoguardado.js', import.meta.url), 'utf8');
rev(!/setInterval\(/.test(app), 'app.js: sin setInterval fijo');
rev(/function vigilarPendientes\(\)/.test(app) && /cambiosPendientes = true; vigilarPendientes\(\);/.test(app), 'el reintento se arma cuando algo queda pendiente');
rev(/visibilityState === 'visible'\) guardarAvance\(\)/.test(app), 'y no dispara con la app en el fondo');
rev(!/setInterval\(/.test(auto), 'autoguardado.js: sin setInterval fijo');
rev(/function reintentar\(\)/.test(auto) && /pendiente = true; reintentar\(\);/.test(auto), 'lo mismo en la ficha del administrador');
rev(/clearTimeout\(reintento\)/.test(auto), 'y al soltar la ficha se apaga');

rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
await navegador.close();
servidor.close();
console.log(fallas ? `\n${fallas} fallas` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
