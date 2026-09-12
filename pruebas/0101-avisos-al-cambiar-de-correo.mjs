/* Mide el 0.10.1: que los avisos rojos no se queden pegados al picar
 * «Usar otro correo».
 *
 * Cómo: se sirve `public/` como sitio estático y se simulan las respuestas
 * de `/api/*`, así que no hace falta ni Worker ni base. Teléfono de 390×844,
 * que es donde esto se usa. Se mide lo que el handoff de roster101 §4 pide:
 * los tres textos de error vacíos al volver, sin scroll horizontal y cero
 * errores de JavaScript.
 *
 *     node pruebas/0101-avisos-al-cambiar-de-correo.mjs
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
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
  } catch {
    res.writeHead(404).end('no está');
  }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0;
const rev = (ok, que, dato = '') => {
  if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

// El Chromium que ya trae la máquina; no se descarga otro.
const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

/* Errores de JavaScript, no de red: el 401 de `/api/yo` es a propósito —así
 * arranca quien no ha entrado— y el navegador lo escribe en la consola como
 * «Failed to load resource». Eso no es un error del portal. */
const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

/* Sin sesión (`/api/yo` 401, que es como arranca quien no ha entrado), el
 * código se pide bien y entrar siempre falla: es el camino del defecto. */
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
await p.route('**/api/**', async (route) => {
  const url = route.request().url();
  if (url.includes('/api/config')) return route.fulfill(json(200, { empresa: 'Taller de prueba', razon_social: 'Taller de prueba', correo_privacidad: 'privacidad@ejemplo.mx', version: '0.10.1' }));
  if (url.includes('/api/yo')) return route.fulfill(json(401, { error: 'sin_sesion' }));
  if (url.includes('/api/codigo')) return route.fulfill(json(200, { ok: true, enviado: true }));
  if (url.includes('/api/entrar')) return route.fulfill(json(401, { error: 'El código no es correcto' }));
  return route.fulfill(json(200, { ok: true }));
});

await p.goto(base, { waitUntil: 'domcontentloaded' });

// El campo del correo, como lo quiere un teléfono.
const campo = p.locator('#acc-email');
rev((await campo.getAttribute('enterkeyhint')) === 'send', 'el teclado trae la tecla «enviar»');
rev((await campo.getAttribute('autocapitalize')) === 'off', 'no capitaliza el correo');
rev((await campo.getAttribute('spellcheck')) === 'false', 'no le pone ortografía al correo');

// 1) Pedir el código.
await campo.fill('trabajador@ejemplo.mx');
await p.locator('#btn-codigo').click();
await p.waitForSelector('#paso-codigo:not(.oculto)', { timeout: 5000 });

/* 2) Fallar el código a propósito. Al llegar a seis dígitos se manda solo
 *    (roster101-handoff §5): no hay que picar «Entrar». */
await p.locator('#acc-codigo').fill('000000');
await p.waitForFunction(() => document.querySelector('#cod-error')?.textContent.trim().length > 0, null, { timeout: 5000 });
const rojo = (await p.locator('#cod-error').textContent()).trim();
rev(rojo === 'El código no es correcto', 'sale el aviso rojo que manda el servidor', JSON.stringify(rojo));

// 3) Picar «Usar otro correo» y volver a pedir.
await p.locator('#btn-otro-correo').click();
await p.waitForSelector('#paso-correo:not(.oculto)', { timeout: 5000 });

const textos = {};
for (const id of ['cod-error', 'acc-error']) textos[id] = (await p.locator(`#${id}`).textContent()).trim();
rev(textos['cod-error'] === '', 'al volver, «El código no es correcto» ya no está', JSON.stringify(textos['cod-error']));
rev(textos['acc-error'] === '', 'al volver, el aviso del correo está vacío', JSON.stringify(textos['acc-error']));
rev((await p.locator('#acc-codigo').inputValue()) === '', 'el código escrito se limpia');

// 4) Pedir otro código: la pantalla no debe traer el aviso viejo.
await p.locator('#acc-email').fill('otro@ejemplo.mx');
await p.locator('#btn-codigo').click();
await p.waitForSelector('#paso-codigo:not(.oculto)', { timeout: 5000 });
rev((await p.locator('#cod-error').textContent()).trim() === '', 'al pedir otro código, la pantalla llega limpia');

const ancho = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
rev(ancho[0] <= ancho[1], 'no hay scroll horizontal en un teléfono de 390 px', ancho.join(' vs '));
rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | ') || 'ninguno');

await navegador.close();
servidor.close();
console.log();
if (fallas) { console.log(`FALLAS: ${fallas}`); process.exit(1); }
console.log('0.10.1 medido: el aviso rojo ya no se queda pegado.');
