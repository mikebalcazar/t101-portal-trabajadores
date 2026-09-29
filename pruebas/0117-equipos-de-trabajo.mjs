/* Equipos de trabajo (0.53.0).
 *
 * Mike, 29-sep-2026: «Quiero poder agrupar por "equipo de trabajo" en roster.
 * Que la gente ponga en qué equipo de trabajo está, pero esos equipos los doy
 * de alta yo, y ellos sólo seleccionan cuál de los disponibles es el suyo, o
 * "no tengo equipo".»
 *
 * Se sirve `public/` como sitio estático con una API de mentiras que guarda
 * los equipos en memoria. Se mide:
 *   · el portal del trabajador: el campo ofrece los equipos prendidos y «No
 *     tengo equipo», y al terminar manda `equipo_id`;
 *   · el panel: la tarjeta da de alta un equipo (con permiso de capturar),
 *     la lista se agrupa por equipo con «Sin equipo» al final, y el
 *     expediente ofrece las opciones {valor, texto} y guarda `equipo_id`.
 *
 *     node pruebas/0117-equipos-de-trabajo.mjs
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
const json = (status, cuerpo) => ({ status, contentType: 'application/json', body: JSON.stringify(cuerpo) });

/* La empresa de mentiras: dos equipos (uno apagado) y tres trabajadores. */
const equipos = [
  { id: 'eq-1', nombre: 'Ebanistería', activo: 1, orden: 0 },
  { id: 'eq-2', nombre: 'Instalación', activo: 1, orden: 1 },
  { id: 'eq-3', nombre: 'Pintura', activo: 0, orden: 2 },
];
const trabajadores = [
  { id: 't-1', email: 'ana@ejemplo.mx', nombre: 'Ana', apellido_paterno: 'Zúñiga', apellido_materno: '', estado: 'completo', equipo_id: 'eq-2', documentos: [], faltantes: [], faltan_campos: [] },
  { id: 't-2', email: 'beto@ejemplo.mx', nombre: 'Beto', apellido_paterno: 'Álvarez', apellido_materno: '', estado: 'borrador', equipo_id: null, documentos: [], faltantes: [], faltan_campos: [] },
  { id: 't-3', email: 'caro@ejemplo.mx', nombre: 'Caro', apellido_paterno: 'Mena', apellido_materno: '', estado: 'completo', equipo_id: 'eq-1', documentos: [], faltantes: [], faltan_campos: [] },
];
const conNombre = (t) => ({ ...t, equipo_nombre: equipos.find((e) => e.id === t.equipo_id)?.nombre ?? null });
const catalogo = () => equipos.map((e) => ({ ...e, cuantos: trabajadores.filter((t) => t.equipo_id === e.id).length }));
const CAMPOS = [
  { campo: 'nombre', nombre: 'Nombre(s)', seccion: 'Datos personales' },
  { campo: 'apellido_paterno', nombre: 'Apellido paterno', seccion: 'Datos personales' },
  { campo: 'puesto', nombre: 'Puesto', seccion: 'Datos personales', opcional: true },
  { campo: 'equipo_id', nombre: 'Equipo de trabajo', seccion: 'Datos personales', opcional: true, vacio: 'No tiene equipo', opciones: equipos.filter((e) => e.activo).map((e) => ({ valor: e.id, texto: e.nombre })) },
];
const yoTrabajador = () => ({ trabajador: { ...trabajadores[1], folio: 2 }, aviso: { version: '2026-09-03', aceptado_en: '2026-09-10T00:00:00Z' }, faltantes: [], documentos: [], expediente_estado: 'borrador' });
const puts = [];   // lo que se guardó: { ruta, cuerpo }
const posts = [];

async function rutas(p) {
  await p.route('**/s101/**', (route) => route.fulfill(json(200, { ok: true, data: { usuario: { correo: 'fer@ejemplo.mx' }, entro_con: 'clave', tiene_clave: true, orgs: [] } })));
  await p.route('**/api/**', async (route) => {
    const u = new URL(route.request().url());
    const metodo = route.request().method();
    const cuerpo = route.request().postDataJSON?.() ?? {};
    const r = u.pathname;
    if (r === '/api/config') return route.fulfill(json(200, { empresa: 'Taller de prueba', razon_social: 'Taller de prueba', correo_privacidad: 'privacidad@ejemplo.mx', version: 'prueba' }));
    // ── el trabajador ──
    if (r === '/api/yo' && metodo === 'GET') return route.fulfill(json(200, yoTrabajador()));
    if (r === '/api/yo' && metodo === 'PUT') {
      puts.push({ ruta: r, cuerpo });
      trabajadores[1] = { ...trabajadores[1], ...cuerpo, equipo_id: cuerpo.equipo_id || null };
      return route.fulfill(json(200, { ...yoTrabajador(), errores: {} }));
    }
    if (r === '/api/equipos') return route.fulfill(json(200, { equipos: equipos.filter((e) => e.activo).map((e) => ({ id: e.id, nombre: e.nombre })) }));
    // ── el panel ──
    if (r === '/api/admin/estado') return route.fulfill(json(200, { cuentas: true }));
    if (r === '/api/admin/yo') return route.fulfill(json(200, { id: 'c-1', email: 'fer@ejemplo.mx', nombre: 'Fer', nivel: 'admin', permisos: { expedientes: true, fichas: true, exportar: true, baja: true, cuentas: false, capturar: true }, de_la_suite: false }));
    if (r === '/api/admin/trabajadores' && metodo === 'GET') return route.fulfill(json(200, { trabajadores: trabajadores.map(conNombre), equipos: catalogo(), nombres_doc: {} }));
    if (r === '/api/admin/equipos' && metodo === 'GET') return route.fulfill(json(200, { equipos: catalogo() }));
    if (r === '/api/admin/equipos' && metodo === 'POST') {
      posts.push({ ruta: r, cuerpo });
      const e = { id: 'eq-' + (equipos.length + 1), nombre: String(cuerpo.nombre || '').trim(), activo: 1, orden: equipos.length };
      equipos.push(e);
      return route.fulfill(json(200, { ok: true, equipo: { ...e, cuantos: 0 } }));
    }
    const mEq = r.match(/^\/api\/admin\/equipos\/([^/]+)$/);
    if (mEq && metodo === 'PUT') {
      puts.push({ ruta: r, cuerpo });
      const e = equipos.find((x) => x.id === mEq[1]);
      if (cuerpo.nombre !== undefined) e.nombre = cuerpo.nombre;
      if (cuerpo.activo !== undefined) e.activo = cuerpo.activo ? 1 : 0;
      return route.fulfill(json(200, { ok: true, equipo: { ...e, cuantos: 0 } }));
    }
    const mTr = r.match(/^\/api\/admin\/trabajadores\/([^/]+)$/);
    if (mTr && metodo === 'GET') {
      const t = trabajadores.find((x) => x.id === mTr[1]);
      return route.fulfill(json(200, { trabajador: conNombre(t), documentos: [], faltantes: [], faltan_campos: [], aviso: null, campos: CAMPOS }));
    }
    if (mTr && metodo === 'PUT') {
      puts.push({ ruta: r, cuerpo });
      const i = trabajadores.findIndex((x) => x.id === mTr[1]);
      trabajadores[i] = { ...trabajadores[i], ...cuerpo, equipo_id: cuerpo.equipo_id || null };
      return route.fulfill(json(200, { trabajador: conNombre(trabajadores[i]), faltantes: [], faltan_campos: [], errores: {} }));
    }
    if (r === '/api/admin/duplicados') return route.fulfill(json(200, { duplicados: [] }));
    if (r === '/api/admin/papelera') return route.fulfill(json(200, { papelera: [] }));
    if (r === '/api/admin/cuentas') return route.fulfill(json(403, { error: 'no' }));
    return route.fulfill(json(200, { ok: true }));
  });
}

const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium';
const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
const errores = [];

/* ── 1. el trabajador ── */
{
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push('trabajador: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push('trabajador: ' + m.text()); });
  await rutas(p);
  await p.goto(base);
  await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
  console.log('· el portal del trabajador');
  const sel = p.locator('#f-equipo_id');
  rev(await sel.isVisible(), 'el campo «Equipo de trabajo» está a la vista');
  const opciones = await sel.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent]));
  rev(opciones[0][0] === '' && /No tengo equipo/.test(opciones[0][1]), 'la primera opción es «No tengo equipo»', JSON.stringify(opciones[0]));
  rev(opciones.slice(1).map((o) => o[1]).join('|') === 'Ebanistería|Instalación', 'y luego sólo los equipos prendidos (Pintura, apagado, no sale)', opciones.slice(1).map((o) => o[1]).join('|'));
  rev((await sel.inputValue()) === '', 'Beto no tiene equipo todavía');
  await sel.selectOption('eq-2');
  await p.locator('#btn-terminar').click();
  await p.waitForFunction(() => window.__nada, null, { timeout: 1500 }).catch(() => {});
  const guardado = puts.filter((x) => x.ruta === '/api/yo').at(-1);
  rev(!!guardado && guardado.cuerpo.equipo_id === 'eq-2', 'al terminar, el expediente manda equipo_id', JSON.stringify(guardado?.cuerpo?.equipo_id));
  await ctx.close();
}

/* ── 2. el panel ── */
{
  // Beto acaba de escoger Instalación desde su portal; para medir el grupo
  // «Sin equipo» se le regresa a ninguno.
  trabajadores[1].equipo_id = null;
  const ctx = await navegador.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errores.push('panel: ' + e));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push('panel: ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  await rutas(p);
  await p.goto(`${base}/admin.html`);
  await p.waitForSelector('#panel:not(.oculto)', { timeout: 8000 });
  await p.waitForSelector('#equipos-lista .cuenta', { state: 'attached', timeout: 8000 });
  // La tarjeta viene plegada: se abre para tocarla.
  await p.evaluate(() => { document.querySelector('#caja-equipos').open = true; });

  console.log('· la tarjeta de equipos');
  rev((await p.locator('#equipos-lista .cuenta').count()) === 3, 'enseña los tres equipos, apagado incluido');
  rev(/apagado/.test(await p.locator('#equipos-lista [data-equipo="eq-3"]').innerText()), 'y dice cuál está apagado');
  rev(/1 trabajador\b/.test(await p.locator('#equipos-lista [data-equipo="eq-1"]').innerText()), 'con cuántos hay en cada uno');
  await p.locator('#eq-nombre').fill('Herrería');
  await p.locator('#btn-crear-equipo').click();
  await p.waitForSelector('#equipos-lista [data-equipo="eq-4"]', { timeout: 5000 });
  rev(posts.length === 1 && posts[0].cuerpo.nombre === 'Herrería', 'dar de alta manda el nombre', JSON.stringify(posts[0]?.cuerpo));
  rev(/Herrería/.test(await p.locator('#aviso-equipos').innerText()), 'y lo confirma');
  await p.locator('#equipos-lista [data-apagar-equipo="eq-4"]').click();
  await p.waitForFunction(() => document.querySelector('#equipos-lista [data-equipo="eq-4"]')?.textContent.includes('apagado'), null, { timeout: 5000 });
  const apagar = puts.find((x) => x.ruta === '/api/admin/equipos/eq-4');
  rev(!!apagar && apagar.cuerpo.activo === false, '«Apagar» manda activo: false', JSON.stringify(apagar?.cuerpo));

  console.log('· la lista agrupada por equipo');
  rev((await p.locator('tr.grupo').count()) === 0, 'sin agrupar no hay encabezados');
  rev(/Instalación/.test(await p.locator('[data-abrir="t-1"]').locator('..').innerText()), 'pero cada renglón dice su equipo');
  await p.locator('#agrupar').selectOption('equipo');
  const grupos = await p.locator('tr.grupo').evaluateAll((trs) => trs.map((tr) => tr.dataset.grupo));
  rev(grupos.join('|') === 'Ebanistería|Instalación|Sin equipo', 'agrupa en el orden del catálogo y «Sin equipo» al final', grupos.join('|'));
  const orden = await p.locator('#cuerpo-tabla tr, tbody tr').evaluateAll((trs) => trs.map((tr) => tr.dataset.grupo || tr.querySelector('[data-abrir]')?.dataset.abrir).filter(Boolean));
  rev(orden.join('|') === 'Ebanistería|t-3|Instalación|t-1|Sin equipo|t-2', 'cada quien bajo su encabezado', orden.join('|'));
  await p.locator('#agrupar').selectOption('');
  rev((await p.locator('tr.grupo').count()) === 0, 'y se quita el agrupado');

  console.log('· el expediente desde el panel');
  await p.locator('[data-abrir="t-2"]').click();
  await p.waitForSelector('#exp-cuerpo select[data-c="equipo_id"]', { timeout: 5000 });
  const selExp = p.locator('#exp-cuerpo select[data-c="equipo_id"]');
  const ops = await selExp.locator('option').evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()]));
  rev(ops[0][0] === '' && ops[0][1] === 'No tiene equipo', 'la opción vacía dice lo que manda el servidor', JSON.stringify(ops[0]));
  rev(ops.slice(1).map((o) => o.join('=')).join('|') === 'eq-1=Ebanistería|eq-2=Instalación', 'las opciones llevan su id como valor y su nombre como texto', ops.slice(1).map((o) => o.join('=')).join('|'));
  await selExp.selectOption('eq-1');
  await p.locator('#exp-guardar').click();
  await p.waitForFunction(() => document.querySelector('#exp-aviso-guardado')?.textContent.trim().length > 0, null, { timeout: 5000 }).catch(() => {});
  const cap = puts.filter((x) => x.ruta === '/api/admin/trabajadores/t-2').at(-1);
  rev(!!cap && cap.cuerpo.equipo_id === 'eq-1', 'guardar la captura manda equipo_id', JSON.stringify(cap?.cuerpo?.equipo_id));
  await ctx.close();
}

await navegador.close();
servidor.close();
rev(errores.length === 0, 'sin errores de JavaScript', errores.join(' | '));
console.log(fallas ? `\n${fallas} falla(s).` : '\nTodo en orden.');
process.exit(fallas ? 1 : 0);
