/* Mide la entrada del panel (0.13.1): correo → contraseña → «olvidé» → código
 * → contraseña nueva → panel, como en las demás pantallas de la suite; y que
 * el PIN ya no esté.
 *
 * Cómo: se sirve `public/` como sitio estático y se simulan `/s101/*` (la
 * suite) y `/api/*` (el motor), así que no hace falta ni Worker ni base.
 * Teléfono de 390×844. Se mide sobre todo lo que NO debe pasar: la contraseña
 * equivocada y el correo sin cuenta dicen lo mismo; el código malo dice
 * cuántos intentos quedan; sin contraseña puesta no se abre el panel.
 *
 *     node pruebas/0113-entrada-del-panel.mjs
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
  } catch { res.writeHead(404).end('no está'); }
});
await new Promise((r) => servidor.listen(0, r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let fallas = 0;
const rev = (ok, que, dato = '') => {
  if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

const errores = [];
p.on('pageerror', (e) => errores.push('excepción: ' + e));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });

/* La suite de mentiras: una cuenta (fer) con contraseña «la-buena-de-fer»,
 * que también tiene renglón en el panel; y un correo (nueva) sin contraseña
 * todavía, que entra con código y la pone. El código bueno es 123456. */
let sesion = null;           // { correo, como }
let claveDeNueva = null;
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
const okSuite = (data) => json(200, { ok: true, data });
const noSuite = (status, error, detalle) => json(status, { ok: false, error, ...(detalle ? { detalle } : {}) });
const pedidas = [];
await p.route('**/s101/**', async (route) => {
  const u = new URL(route.request().url());
  const ruta = u.pathname.replace(/^\/s101/, '');
  const cuerpo = route.request().postDataJSON?.() ?? {};
  pedidas.push(ruta);
  if (ruta === '/auth/codigo') return route.fulfill(okSuite({ enviado: true }));
  if (ruta === '/auth/entrar') {
    if (cuerpo.pin) return route.fulfill(noSuite(400, 'datos_invalidos'));
    if (cuerpo.clave !== undefined) {
      const bien = (cuerpo.correo === 'fer@ejemplo.mx' && cuerpo.clave === 'la-buena-de-fer') || (cuerpo.correo === 'nueva@ejemplo.mx' && claveDeNueva && cuerpo.clave === claveDeNueva);
      if (!bien) return route.fulfill(noSuite(cuerpo.correo === 'nadie@ejemplo.mx' ? 403 : 401, cuerpo.correo === 'nadie@ejemplo.mx' ? 'sin_permiso' : 'clave_invalida'));
      sesion = { correo: cuerpo.correo, como: 'clave' };
      return route.fulfill(okSuite({ entro: true }));
    }
    if (cuerpo.codigo !== undefined) {
      if (cuerpo.codigo !== '123456') return route.fulfill(noSuite(401, 'codigo_invalido', { intentos_restantes: 3 }));
      sesion = { correo: cuerpo.correo, como: 'codigo' };
      return route.fulfill(okSuite({ entro: true }));
    }
    return route.fulfill(noSuite(400, 'datos_invalidos'));
  }
  if (ruta === '/auth/clave') {
    if (!sesion) return route.fulfill(noSuite(401, 'sin_sesion'));
    if (cuerpo.clave === 'contrasenacontrasena') return route.fulfill(noSuite(400, 'clave_debil', { porque: 'es demasiado obvia' }));
    claveDeNueva = cuerpo.clave;
    return route.fulfill(okSuite({ puesta: true }));
  }
  if (ruta === '/yo') {
    if (!sesion) return route.fulfill(noSuite(401, 'sin_sesion'));
    return route.fulfill(okSuite({
      usuario: { correo: sesion.correo }, entro_con: sesion.como,
      tiene_clave: sesion.correo === 'fer@ejemplo.mx' || !!claveDeNueva,
      // Sólo esta cuenta trae Google ligado (contrato 0.17.2).
      tiene_google: sesion.correo === 'congoogle@ejemplo.mx',
      orgs: [],
    }));
  }
  if (ruta === '/auth/salir') { sesion = null; return route.fulfill(okSuite({})); }
  return route.fulfill(noSuite(404, 'no_encontrado'));
});
await p.route('**/api/**', async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/api/config') return route.fulfill(json(200, { empresa: 'Taller de prueba', razon_social: 'Taller de prueba', correo_privacidad: 'privacidad@ejemplo.mx', version: '0.13.1' }));
  if (u.pathname === '/api/admin/estado') return route.fulfill(json(200, { cuentas: true }));
  if (u.pathname === '/api/admin/yo') {
    if (!sesion) return route.fulfill(json(401, { error: 'Entra con tu cuenta de la suite 101.' }));
    return route.fulfill(json(200, { id: 'c-1', email: sesion.correo, nombre: 'Quien Sea', nivel: 'admin', permisos: { expedientes: true, fichas: true, exportar: true, baja: true, cuentas: false, capturar: true }, de_la_suite: false }));
  }
  if (u.pathname === '/api/admin/trabajadores') return route.fulfill(json(200, { trabajadores: [], nombres_doc: {} }));
  return route.fulfill(json(200, { ok: true }));
});

await p.goto(`${base}/admin.html`, { waitForLoad: 'domcontentloaded' }).catch(() => {});
await p.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 8000 });

console.log('\nLa pantalla del correo:');
rev(await p.locator('#btn-google').isVisible(), 'ofrece «Entrar con Google»');
rev((await p.locator('#btn-modo').count()) === 0, 'ya no hay «Entrar con mi PIN»');
rev(!/PIN/.test(await p.locator('#caja-cuenta').textContent()), 'y no se habla de PIN');
await p.locator('#acc-email').fill('no-es-correo');
await p.locator('#btn-entrar').click();
rev((await p.locator('#acc-error').textContent()).trim() !== '', 'un correo mal escrito se frena aquí');
rev(pedidas.length === 0, 'sin tocar la suite todavía');

console.log('\nLa contraseña:');
await p.locator('#acc-email').fill('Fer@Ejemplo.mx');
await p.locator('#btn-entrar').click();
await p.waitForSelector('#caja-clave:not(.oculto)', { timeout: 5000 });
rev(pedidas.length === 0, 'pasar a la contraseña no pregunta nada a la suite (no es un directorio de cuentas)');
rev(/fer@ejemplo\.mx/.test(await p.locator('#clave-ayuda').textContent()), 'dice a qué cuenta, en minúsculas');
await p.locator('#clave').fill('la-mala');
await p.locator('#btn-clave').click();
await p.waitForFunction(() => document.querySelector('#clave-error').textContent.trim().length > 0, null, { timeout: 5000 });
const malaClave = (await p.locator('#clave-error').textContent()).trim();
rev(malaClave === 'Ese correo y esa contraseña no coinciden.', 'la contraseña equivocada no dice de más', JSON.stringify(malaClave));
await p.locator('#btn-otro-correo').click();
await p.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 5000 });
await p.locator('#acc-email').fill('nadie@ejemplo.mx');
await p.locator('#btn-entrar').click();
await p.waitForSelector('#caja-clave:not(.oculto)', { timeout: 5000 });
rev((await p.locator('#clave-error').textContent()).trim() === '' && (await p.locator('#clave').inputValue()) === '', 'al cambiar de correo la pantalla llega limpia');
await p.locator('#clave').fill('cualquiera');
await p.locator('#btn-clave').click();
await p.waitForFunction(() => document.querySelector('#clave-error').textContent.trim().length > 0, null, { timeout: 5000 });
rev((await p.locator('#clave-error').textContent()).trim() === malaClave, 'y un correo sin cuenta dice EXACTAMENTE lo mismo');
await p.locator('#btn-otro-correo').click();
await p.locator('#acc-email').fill('fer@ejemplo.mx');
await p.locator('#btn-entrar').click();
await p.locator('#clave').fill('la-buena-de-fer');
await p.locator('#btn-clave').click();
await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
rev(true, 'con la buena se abre el panel');
rev(pedidas.includes('/yo'), 'y se le preguntó a la suite quién es antes de abrir');
rev((await p.locator('#caja-nueva').getAttribute('class')).includes('oculto'), 'a quien ya tiene contraseña no se le pide otra');

console.log('\n«Olvidé mi contraseña», que es la misma puerta para quien nunca tuvo una:');
await p.locator('#btn-salir').click();
await p.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 8000 });
pedidas.length = 0;
await p.locator('#acc-email').fill('nueva@ejemplo.mx');
await p.locator('#btn-entrar').click();
await p.waitForSelector('#caja-clave:not(.oculto)', { timeout: 5000 });
await p.locator('#btn-olvide').click();
await p.waitForSelector('#caja-codigo:not(.oculto)', { timeout: 5000 });
rev(pedidas.includes('/auth/codigo'), 'pide el código a la suite');
rev(/nueva@ejemplo\.mx/.test(await p.locator('#cod-ayuda').textContent()), 'y dice a qué correo se mandó');
await p.locator('#cod-digitos').fill('000000');
await p.locator('#btn-codigo').click();
await p.waitForFunction(() => document.querySelector('#cod-error').textContent.trim().length > 0, null, { timeout: 5000 });
rev(/Te quedan 3 intentos/.test(await p.locator('#cod-error').textContent()), 'el código malo dice cuántos intentos quedan', (await p.locator('#cod-error').textContent()).trim());
await p.locator('#cod-digitos').fill('123456');
await p.locator('#btn-codigo').click();
await p.waitForSelector('#caja-nueva:not(.oculto)', { timeout: 5000 });
rev((await p.locator('#panel').getAttribute('class')).includes('oculto'), 'entró con código y sin contraseña: NO se abre el panel, se pide la contraseña');
rev(/Ponle una contraseña/.test(await p.locator('#nueva-titulo').textContent()), 'como primera vez');
await p.locator('#nueva').fill('corta');
await p.locator('#nueva2').fill('corta');
await p.locator('#btn-nueva').click();
rev(/10 caracteres/.test(await p.locator('#nueva-error').textContent()), 'una corta se frena aquí');
await p.locator('#nueva').fill('una-contraseña-larga');
await p.locator('#nueva2').fill('otra-contraseña-larga');
await p.locator('#btn-nueva').click();
rev(/No coincidieron/.test(await p.locator('#nueva-error').textContent()) && (await p.locator('#nueva').inputValue()) === '', 'si no coinciden, se borran las dos');
await p.locator('#nueva').fill('contrasenacontrasena');
await p.locator('#nueva2').fill('contrasenacontrasena');
await p.locator('#btn-nueva').click();
await p.waitForFunction(() => /obvia/.test(document.querySelector('#nueva-error').textContent), null, { timeout: 5000 });
rev(true, 'lo que la suite rechaza se dice con sus palabras');
await p.locator('#nueva').fill('la-de-nueva-2026');
await p.locator('#nueva2').fill('la-de-nueva-2026');
await p.locator('#btn-nueva').click();
await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
rev(claveDeNueva === 'la-de-nueva-2026' && pedidas.includes('/auth/clave'), 'se guarda en la suite y se abre el panel');

/* Con Google ligado no hace falta contraseña: Google ya es una forma de
 * volver mañana, que es lo único que cuida esta pantalla. Sin esto se le
 * pedía una contraseña cada vez que entraba con un código (le pasó al dueño
 * de la suite el 19-sep, en master101). */
console.log('\nCon Google ligado no se le pide contraseña, aunque entre con un código:');
{
  await p.locator('#btn-salir').click();
  await p.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 8000 });
  await p.locator('#acc-email').fill('congoogle@ejemplo.mx');
  await p.locator('#btn-entrar').click();
  await p.waitForSelector('#caja-clave:not(.oculto)', { timeout: 5000 });
  await p.locator('#btn-olvide').click();
  await p.waitForSelector('#caja-codigo:not(.oculto)', { timeout: 5000 });
  await p.locator('#cod-digitos').fill('123456');
  await p.locator('#btn-codigo').click();
  await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
  rev((await p.locator('#caja-nueva').getAttribute('class')).includes('oculto'), 'entra directo al panel: ya tiene por dónde volver');
}

console.log('\nY de ahí en adelante entra con su contraseña:');
await p.locator('#btn-salir').click();
await p.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 8000 });
await p.locator('#acc-email').fill('nueva@ejemplo.mx');
await p.locator('#btn-entrar').click();
await p.locator('#clave').fill('la-de-nueva-2026');
await p.locator('#btn-clave').click();
await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
rev(true, 'la contraseña recién puesta abre');

const ancho = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
rev(ancho[0] <= ancho[1], 'no hay scroll horizontal en un teléfono de 390 px', ancho.join(' vs '));
rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | ') || 'ninguno');

await navegador.close();
servidor.close();
console.log();
if (fallas) { console.log(`FALLAS: ${fallas}`); process.exit(1); }
console.log('0.13.1 medido: el panel entra como las demás pantallas de la suite.');
