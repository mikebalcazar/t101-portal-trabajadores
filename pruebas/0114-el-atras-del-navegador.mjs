/* El «atrás» del navegador (Mike, 22-sep-2026).
 *
 * «En todas las apps, cuando picas el botón de back en el navegador te saca
 * hasta la página anterior (…). Queremos que cuando picas back te regrese a
 * la función anterior».
 *
 * Aquí no hay secciones que recorrer: el portal del trabajador es UNA forma y
 * el panel de administración es UNA tabla. Lo que sí hay son cosas que se
 * abren ENCIMA y tapan todo:
 *
 *   · la cámara a pantalla completa, en el teléfono del trabajador. Con la
 *     cámara puesta, «atrás» es el gesto natural para salirse de ahí, y
 *     hasta hoy se llevaba el portal entero;
 *   · el recuadro con la indicación de un documento;
 *   · la ficha de una persona en el panel, que es lo más hondo que hay:
 *     buscarla, picarla, abrirla. Salir de ahí con «atrás» perdía también la
 *     búsqueda.
 *
 * Se mide en un navegador de verdad, contra `public/` servido aquí mismo con
 * la suite y el motor de mentiras: lo que se rompe no es la lógica, es lo que
 * el navegador hace con el historial.
 *
 *     node pruebas/0114-el-atras-del-navegador.mjs
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

let fallas = 0, revisadas = 0;
const rev = (ok, que, dato = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});

const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });
const okSuite = (data) => json(200, { ok: true, data });

/** Una pestaña de teléfono con la suite y el motor de mentiras puestos. */
async function pestana(con = {}) {
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push('excepción: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
  await p.route('**/s101/**', (route) => {
    const ruta = new URL(route.request().url()).pathname.replace(/^\/s101/, '');
    if (ruta === '/yo') return route.fulfill(okSuite({ usuario: { correo: 'fer@ejemplo.mx' }, entro_con: 'clave', tiene_clave: true, tiene_google: false, orgs: [] }));
    if (ruta === '/auth/entrar') return route.fulfill(okSuite({ entro: true }));
    return route.fulfill(okSuite({}));
  });
  await p.route('**/api/**', (route) => {
    const u = new URL(route.request().url());
    const r = con[u.pathname];
    if (r) return route.fulfill(json(200, r));
    if (u.pathname === '/api/config') return route.fulfill(json(200, { empresa: 'Taller de prueba', razon_social: 'Taller de prueba', correo_privacidad: 'privacidad@ejemplo.mx', version: 'prueba' }));
    if (u.pathname === '/api/admin/estado') return route.fulfill(json(200, { cuentas: true }));
    // Sin sesión de trabajador: el portal arranca en la pantalla del correo,
    // que es de donde salen los recuadros que aquí se miden.
    if (u.pathname === '/api/yo') return route.fulfill(json(401, { error: 'Entra con tu correo.' }));
    return route.fulfill(json(200, { ok: true }));
  });
  return { ctx, p, errores };
}

/* ────────────────────────────────────────────────────────────────────────
 * 1. El panel: la ficha de una persona
 * ──────────────────────────────────────────────────────────────────────── */
console.log('\nEl panel — la ficha de una persona (lo más hondo que hay):');
{
  const PERSONA = { id: 't-1', email: 'juan@ejemplo.mx', nombre: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'López', estado: 'borrador', folio: 'A-1' };
  const { ctx, p, errores } = await pestana({
    '/api/admin/yo': { id: 'c-1', email: 'fer@ejemplo.mx', nombre: 'Fer', nivel: 'admin', permisos: { expedientes: true, fichas: true, exportar: true, baja: true, cuentas: false, capturar: true }, de_la_suite: false },
    '/api/admin/trabajadores': { trabajadores: [PERSONA], nombres_doc: {} },
    '/api/admin/trabajadores/t-1': { trabajador: PERSONA, campos: [], documentos: [], bitacora: [] },
  });
  await p.goto(`${base}/admin.html`).catch(() => {});
  await p.waitForSelector('#panel:not(.oculto)', { timeout: 10000 });

  const antes = await p.evaluate(() => history.length);
  await p.locator('[data-abrir="t-1"]').click();
  await p.waitForSelector('#ventana-exp:not(.oculto)', { timeout: 8000 });
  rev(true, 'se abre la ficha de la persona');
  rev(await p.evaluate(() => history.length) === antes + 1, 'y deja una entrada en el historial');

  await p.goBack();
  await p.waitForSelector('#ventana-exp.oculto', { timeout: 8000 }).catch(() => {});
  rev(await p.locator('#ventana-exp').evaluate((e) => e.classList.contains('oculto')), '«atrás» cierra la ficha');
  rev(await p.locator('#panel').isVisible(), 'y el panel sigue puesto: no sacó del sitio');
  rev(new URL(p.url()).pathname === '/admin.html', 'ni cambió de página', p.url());

  /* Cerrar con el botón tiene que hacer LO MISMO que «atrás»: RETROCEDER. Si
   * escribiera una entrada nueva, el siguiente «atrás» reabriría la ficha que
   * se acaba de cerrar y parecería que el panel se devolvió solo. Se mide
   * contando: retroceder no alarga el historial, apilar sí. */
  await p.locator('[data-abrir="t-1"]').click();
  await p.waitForSelector('#ventana-exp:not(.oculto)', { timeout: 8000 });
  const conFicha = await p.evaluate(() => history.length);
  await p.locator('#exp-cerrar').click();
  await p.waitForFunction(() => document.querySelector('#ventana-exp').classList.contains('oculto'), null, { timeout: 8000 });
  rev(true, 'el botón de cerrar también la cierra');
  const trasCerrar = await p.evaluate(() => history.length);
  rev(trasCerrar === conFicha, 'retrocediendo, sin escribir una entrada de más', `${trasCerrar} vs ${conFicha}`);

  rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | '));
  await ctx.close();
}

/* ────────────────────────────────────────────────────────────────────────
 * 2. El portal del trabajador: lo que se abre encima
 * ──────────────────────────────────────────────────────────────────────── */
console.log('\nEl portal del trabajador — la indicación de un documento:');
{
  const { ctx, p, errores } = await pestana();
  await p.goto(`${base}/`).catch(() => {});
  await p.waitForSelector('#paso-correo', { timeout: 10000 });

  /* El recuadro se abre con una función de la propia pantalla: así se mide
   * lo que importa —qué hace el historial— sin tener que fingir un
   * expediente entero. */
  const antes = await p.evaluate(() => history.length);
  await p.evaluate(() => abrirDescripcion({ nombre: 'INE', pista: 'Los dos lados, legibles.', obligatorio: true }, []));
  await p.waitForSelector('#modal-desc:not(.oculto)', { timeout: 5000 });
  rev(true, 'se abre la indicación del documento');
  rev(await p.evaluate(() => history.length) === antes + 1, 'y deja una entrada en el historial');

  await p.goBack();
  await p.waitForFunction(() => document.querySelector('#modal-desc').classList.contains('oculto'), null, { timeout: 5000 });
  rev(true, '«atrás» la cierra');
  rev(new URL(p.url()).pathname === '/', 'sin sacar del portal', p.url());

  await p.evaluate(() => abrirDescripcion({ nombre: 'INE', pista: 'Los dos lados.', obligatorio: true }, []));
  await p.waitForSelector('#modal-desc:not(.oculto)', { timeout: 5000 });
  const conRecuadro = await p.evaluate(() => history.length);
  await p.locator('#desc-cerrar').click();
  await p.waitForFunction(() => document.querySelector('#modal-desc').classList.contains('oculto'), null, { timeout: 5000 });
  rev(await p.evaluate(() => history.length) === conRecuadro,
      'el botón de cerrar retrocede, sin escribir una entrada de más');

  rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | '));
  await ctx.close();
}

console.log('\nEl portal del trabajador — la cámara a pantalla completa:');
{
  const { ctx, p, errores } = await pestana();
  // Una cámara de mentiras: un lienzo que se graba a sí mismo. Sin esto el
  // navegador del corredor no tiene con qué abrirla.
  await p.addInitScript(() => {
    const lienzo = () => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; c.getContext('2d').fillRect(0, 0, 320, 240); return c.captureStream(10); };
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: async () => lienzo() }, configurable: true });
  });
  await p.goto(`${base}/`).catch(() => {});
  await p.waitForSelector('#paso-correo', { timeout: 10000 });

  const antes = await p.evaluate(() => history.length);
  await p.evaluate(() => abrirCamara({ tipo: 'ine', titulo: 'Tu INE', pista: 'De frente', etiqueta: 'INE', forma: 'documento' }));
  await p.waitForSelector('#camara:not(.oculto)', { timeout: 8000 });
  rev(true, 'se abre la cámara a pantalla completa');
  rev(await p.evaluate(() => history.length) === antes + 1, 'y deja una entrada en el historial');

  await p.goBack();
  await p.waitForFunction(() => document.querySelector('#camara').classList.contains('oculto'), null, { timeout: 8000 });
  rev(true, '«atrás» cierra la cámara en vez de sacar del portal');
  rev(new URL(p.url()).pathname === '/', 'y la pantalla sigue siendo la del portal', p.url());
  /* Apagar la cámara no es cosmético: si el flujo se queda vivo, la luz del
   * teléfono se queda prendida y la batería se va. */
  rev(await p.evaluate(() => {
    const f = document.querySelector('#cam-video').srcObject;
    return !f || f.getTracks().every((t) => t.readyState === 'ended');
  }), 'y apaga el flujo de la cámara');

  await p.evaluate(() => abrirCamara({ tipo: 'ine', titulo: 'Tu INE', pista: 'De frente', etiqueta: 'INE', forma: 'documento' }));
  await p.waitForSelector('#camara:not(.oculto)', { timeout: 8000 });
  const conCamara = await p.evaluate(() => history.length);
  await p.locator('#cam-cerrar').click();
  await p.waitForFunction(() => document.querySelector('#camara').classList.contains('oculto'), null, { timeout: 8000 });
  rev(await p.evaluate(() => history.length) === conCamara,
      'el botón de cerrar retrocede, sin escribir una entrada de más');

  rev(errores.length === 0, 'cero errores de JavaScript', errores.join(' | '));
  await ctx.close();
}

await navegador.close();
servidor.close();
console.log(`\n${revisadas} revisadas · ${fallas} ${fallas === 1 ? 'falla' : 'fallas'}`);
process.exit(fallas ? 1 : 0);
