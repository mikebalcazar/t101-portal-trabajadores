/* Mide el 0.11 de punta a punta: las cuentas de administración con contraseña.
 *
 * Levanta su propio Worker (`wrangler dev --local`) sobre una base nueva en una
 * carpeta temporal, así que no toca la base local de desarrollo ni necesita
 * `.dev.vars`. Con Playwright recorre las pantallas en un teléfono de 390×844 y
 * con `fetch` pega a la API. Al final lee la base de verdad (el .sqlite que
 * dejó el Worker) para comprobar que la bitácora trae el correo de quien
 * exportó, y no `'admin'`.
 *
 * El camino que pide el encargo: arranque con la clave compartida → crear al
 * dueño → salir → entrar con correo y contraseña → cambio obligado → crear un
 * admin y una consulta → consulta no exporta → exportar como admin → la
 * bitácora trae su correo.
 *
 *     node pruebas/0111-cuentas-admin.mjs
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { chromium } from 'playwright';

const RAIZ = new URL('../', import.meta.url).pathname;
const PUERTO = 8797;
const BASE = `http://127.0.0.1:${PUERTO}`;
const CLAVE_COMPARTIDA = 'clave-compartida-de-la-prueba';
const persistir = mkdtempSync(join(tmpdir(), 'roster101-0111-'));

let fallas = 0;
const rev = (ok, que, dato = '') => {
  if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};
const seccion = (t) => console.log(`\n${t}`);

/* ── el Worker, sobre una base nueva ── */
execFileSync('npx', ['wrangler', 'd1', 'execute', 't101-trabajadores', '--local', '--persist-to', persistir,
  '--file=./schema.sql', '--yes'], { cwd: RAIZ, stdio: 'ignore' });

const worker = spawn('npx', [
  'wrangler', 'dev', '--local', '--port', String(PUERTO), '--inspector-port', '9339', '--persist-to', persistir,
  '--var', 'SECRETO:secreto-de-la-prueba-0111', '--var', `CLAVE_ADMIN:${CLAVE_COMPARTIDA}`,
  '--var', 'MODO_PRUEBA:1', '--var', 'RESEND_API_KEY:',
], { cwd: RAIZ, stdio: 'ignore', detached: true });

async function esperaWorker() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${BASE}/api/salud`); if (r.ok) return; } catch { /* todavía no */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('el Worker no levantó en 60 s');
}

function apagar() {
  try { process.kill(-worker.pid, 'SIGTERM'); } catch { /* ya se fue */ }
}

/* ── un cliente de API con su propia cookie, como un navegador ── */
function cliente() {
  let galleta = '';
  return async (ruta, cuerpo, metodo = cuerpo === undefined ? 'GET' : 'POST') => {
    const r = await fetch(BASE + ruta, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(galleta ? { Cookie: galleta } : {}) },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const sc = r.headers.get('set-cookie');
    if (sc) galleta = sc.split(';')[0];
    const tipo = r.headers.get('content-type') || '';
    const datos = tipo.includes('json') ? await r.json().catch(() => ({})) : await r.arrayBuffer();
    return { status: r.status, datos, tipo };
  };
}

try {
  await esperaWorker();

  /* ── un trabajador, para que la tabla tenga un renglón con botón de baja ── */
  {
    const c = cliente();
    const cod = await c('/api/codigo', { email: 'trabajador@ejemplo.mx' });
    await c('/api/entrar', { email: 'trabajador@ejemplo.mx', codigo: cod.datos.codigo_prueba });
  }

  /* ════════ pantallas, en un teléfono ════════ */
  const CHROMIUM = process.env.CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  const navegador = await chromium.launch(existsSync(CHROMIUM) ? { executablePath: CHROMIUM } : {});
  const errores = [];
  const contexto = async () => {
    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errores.push('excepción: ' + e));
    p.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errores.push(m.text()); });
    return { ctx, p };
  };
  const visible = (p, sel) => p.locator(sel).evaluate((el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)).catch(() => false);
  const sinScroll = async (p, donde) => {
    const [a, b] = await p.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    rev(a <= b, `sin scroll horizontal en ${donde}`, `${a} vs ${b}`);
  };

  seccion('1. Arranque: la clave compartida sólo sirve para crear al dueño');
  const { ctx: ctxDueno, p: pd } = await contexto();
  await pd.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await pd.waitForSelector('#caja-arranque:not(.oculto)', { timeout: 10000 });
  rev(!(await visible(pd, '#caja-cuenta')), 'sin cuentas, NO se enseña el formulario de correo y contraseña');
  rev(await visible(pd, '#caja-arranque'), 'se enseña el de la clave compartida');
  await sinScroll(pd, 'la pantalla del arranque');

  await pd.fill('#clave-arranque', 'una clave que no es');
  await pd.click('#btn-arranque');
  await pd.waitForFunction(() => document.querySelector('#arranque-error')?.textContent.trim().length > 0, null, { timeout: 5000 });
  rev((await pd.locator('#arranque-error').textContent()).includes('Clave incorrecta'), 'la clave compartida mal escrita se rechaza');

  await pd.fill('#clave-arranque', CLAVE_COMPARTIDA);
  await pd.click('#btn-arranque');
  await pd.waitForSelector('#caja-primera:not(.oculto)', { timeout: 5000 });
  rev(await visible(pd, '#caja-primera'), 'con la clave compartida se abre «Tu cuenta de dueño», no el panel');
  rev(!(await visible(pd, '#panel')), 'el panel sigue cerrado');

  // La primera cuenta, con una contraseña que lleva el usuario del correo: se rechaza.
  await pd.fill('#pri-nombre', 'Mike');
  await pd.fill('#pri-email', 'Mike@Ejemplo.mx');
  await pd.fill('#pri-clave', 'mike-con-algo-mas');
  await pd.fill('#pri-clave2', 'mike-con-algo-mas');
  await pd.click('#btn-primera');
  await pd.waitForFunction(() => document.querySelector('#caja-primera [data-e="clave"]')?.textContent.trim().length > 0, null, { timeout: 5000 });
  rev((await pd.locator('#caja-primera [data-e="clave"]').textContent()).includes('usuario de tu correo'), 'una contraseña con el usuario del correo se rechaza en pantalla');

  await pd.fill('#pri-clave', 'la frase del dueno 2026');
  await pd.fill('#pri-clave2', 'la frase del dueno 2026');
  await pd.click('#btn-primera');
  await pd.waitForSelector('#panel:not(.oculto)', { timeout: 10000 });
  rev(await visible(pd, '#panel'), 'creada la cuenta, se abre el panel');
  rev((await pd.locator('#quien').textContent()).trim() === 'Mike · Dueño', 'arriba dice quién está adentro', await pd.locator('#quien').textContent());
  rev(await visible(pd, '#caja-cuentas'), 'el dueño ve la tarjeta de cuentas');
  rev(await visible(pd, '#btn-zip'), 'el dueño ve el botón de exportar');
  await pd.waitForSelector('[data-baja]', { timeout: 5000 });
  rev((await pd.locator('[data-baja]').count()) === 1, 'el dueño ve el botón de baja del trabajador');
  await sinScroll(pd, 'el panel del dueño');

  seccion('2. La clave compartida ya no abre; el dueño da de alta a un admin desde la pantalla');
  const api = cliente();
  const otra = await api('/api/admin/entrar', { clave: CLAVE_COMPARTIDA });
  rev(otra.status === 400 && !otra.datos.ok, 'la clave compartida ya no abre nada', `${otra.status} ${otra.datos.error}`);
  const estado = await api('/api/admin/estado');
  rev(estado.datos.cuentas === true, '/api/admin/estado ya dice que hay cuentas');

  await pd.locator('#caja-cuentas summary').click();
  await pd.fill('#cu-nombre', 'Ana Admin');
  await pd.fill('#cu-email', 'ana@ejemplo.mx');
  await pd.selectOption('#cu-nivel', 'admin');
  await pd.fill('#cu-clave', 'roble-marea-lluvia-41');
  await pd.click('#btn-crear-cuenta');
  await pd.waitForSelector('#aviso-cuentas .aviso', { timeout: 8000 });
  const avisoAlta = await pd.locator('#aviso-cuentas .aviso').first();
  rev((await avisoAlta.getAttribute('class')).includes('bien'), 'la cuenta de Ana se creó desde la pantalla', (await avisoAlta.textContent()).trim());
  await pd.waitForFunction(() => document.querySelectorAll('#cuentas-lista .cuenta').length === 2, null, { timeout: 5000 }).catch(() => {});
  rev((await pd.locator('#cuentas-lista .cuenta').count()) === 2, 'la lista de cuentas ya trae dos');
  rev((await pd.locator('#cuentas-lista .etiqueta.provisional').count()) === 1, 'la nueva sale marcada con contraseña provisional');

  // Y una consulta, por la API con la cookie del dueño (misma sesión que el navegador).
  const galletaDueno = (await ctxDueno.cookies()).find((c) => c.name === 't101_admin');
  const comoDueno = async (ruta, cuerpo, metodo) => fetch(BASE + ruta, {
    method: metodo || (cuerpo === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', Cookie: `t101_admin=${galletaDueno.value}` },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const rc = await comoDueno('/api/admin/cuentas', { nombre: 'Con Sulta', email: 'consulta@ejemplo.mx', nivel: 'consulta', clave: 'cobre-nube-piedra-52' });
  rev(rc.status === 200, 'se creó la cuenta de consulta', String(rc.status));
  const repetida = await comoDueno('/api/admin/cuentas', { nombre: 'Otra', email: 'ana@ejemplo.mx', nivel: 'consulta', clave: 'provisional-x-larga-3' });
  rev(repetida.status === 409, 'un correo repetido se rechaza', String(repetida.status));

  seccion('3. Salir y entrar con correo y contraseña; el cambio obligado');
  await pd.click('#btn-salir');
  await pd.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 10000 });
  rev(await visible(pd, '#caja-cuenta'), 'al salir aparece el formulario de correo y contraseña');
  rev(!(await visible(pd, '#caja-arranque')), 'y ya no el de la clave compartida');
  await ctxDueno.close();

  const { ctx: ctxAna, p: pa } = await contexto();
  await pa.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await pa.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 10000 });
  await pa.fill('#acc-email', 'ana@ejemplo.mx');
  await pa.fill('#acc-clave', 'esta no es');
  await pa.click('#btn-entrar');
  await pa.waitForFunction(() => document.querySelector('#acc-error')?.textContent.trim().length > 0, null, { timeout: 5000 });
  const rojo = (await pa.locator('#acc-error').textContent()).trim();
  rev(rojo.startsWith('Correo o contraseña incorrectos.'), 'el error no dice cuál de los dos está mal', rojo);

  await pa.fill('#acc-clave', 'roble-marea-lluvia-41');
  await pa.click('#btn-entrar');
  await pa.waitForSelector('#caja-obligado:not(.oculto)', { timeout: 10000 });
  rev(await visible(pa, '#caja-obligado'), 'con la provisional se abre el cambio obligado, no el panel');
  rev(!(await visible(pa, '#panel')), 'el panel sigue cerrado hasta cambiarla');
  const cerrado = await fetch(`${BASE}/api/admin/trabajadores`, { headers: { Cookie: `t101_admin=${(await ctxAna.cookies()).find((c) => c.name === 't101_admin').value}` } });
  rev(cerrado.status === 403 && (await cerrado.json()).debe_cambiar === true, 'el servidor tampoco deja pasar hasta cambiarla', String(cerrado.status));
  await sinScroll(pa, 'el cambio obligado');

  await pa.fill('#ob-actual', 'roble-marea-lluvia-41');
  await pa.fill('#ob-nueva', 'ahora si es la mia 7');
  await pa.fill('#ob-nueva2', 'ahora si es la mia 7');
  await pa.click('#btn-obligado');
  await pa.waitForSelector('#panel:not(.oculto)', { timeout: 10000 });
  rev((await pa.locator('#quien').textContent()).trim() === 'Ana Admin · Administración', 'Ana entra como administración', await pa.locator('#quien').textContent());
  rev(!(await visible(pa, '#caja-cuentas')), 'admin NO ve la tarjeta de cuentas');
  rev(await visible(pa, '#btn-zip'), 'admin sí ve exportar');
  await pa.waitForSelector('[data-baja]', { timeout: 5000 });
  rev((await pa.locator('[data-baja]').count()) === 1, 'admin sí ve el botón de baja');

  seccion('4. Consulta: entra, cambia la provisional, y no exporta ni da de baja');
  const { ctx: ctxCon, p: pc } = await contexto();
  await pc.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await pc.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 10000 });
  await pc.fill('#acc-email', 'consulta@ejemplo.mx');
  await pc.fill('#acc-clave', 'cobre-nube-piedra-52');
  await pc.click('#btn-entrar');
  await pc.waitForSelector('#caja-obligado:not(.oculto)', { timeout: 10000 });
  await pc.fill('#ob-actual', 'cobre-nube-piedra-52');
  await pc.fill('#ob-nueva', 'solo miro y ya 2026');
  await pc.fill('#ob-nueva2', 'solo miro y ya 2026');
  await pc.click('#btn-obligado');
  await pc.waitForSelector('#panel:not(.oculto)', { timeout: 10000 });
  await pc.waitForSelector('#cuerpo tr', { timeout: 5000 });
  rev((await pc.locator('#quien').textContent()).trim() === 'Con Sulta · Consulta', 'consulta entra como consulta');
  rev(!(await visible(pc, '#btn-zip')) && !(await visible(pc, '#btn-csv')), 'consulta NO ve exportar ni CSV');
  rev((await pc.locator('[data-baja]').count()) === 0, 'consulta NO ve el botón de baja');
  rev(!(await visible(pc, '#caja-cuentas')), 'consulta NO ve la tarjeta de cuentas');
  rev(await visible(pc, '#btn-ficha'), 'consulta sí ve fichas');
  rev((await pc.locator('#cuerpo tr').count()) === 1, 'consulta sí ve la lista de expedientes');
  await pc.locator('[data-abrir]').first().click();
  await pc.waitForSelector('#exp-cuerpo [data-c]', { timeout: 5000 });
  rev(await pc.locator('#exp-cuerpo [data-c]').first().isDisabled(), 'en el expediente, los campos están apagados para consulta');
  rev(!(await visible(pc, '#exp-guardar')), 'y no hay botón de guardar');
  await sinScroll(pc, 'el panel de consulta');

  const galletaCon = (await ctxCon.cookies()).find((c) => c.name === 't101_admin').value;
  const comoConsulta = (ruta, op = {}) => fetch(BASE + ruta, { ...op, headers: { 'Content-Type': 'application/json', Cookie: `t101_admin=${galletaCon}`, ...(op.headers || {}) } });
  const rz = await comoConsulta('/api/admin/exportar');
  rev(rz.status === 403, 'el servidor le niega el ZIP a consulta', String(rz.status));
  rev((await comoConsulta('/api/admin/tabla.csv')).status === 403, 'y el CSV');
  rev((await comoConsulta('/api/admin/cuentas')).status === 403, 'y las cuentas');
  const trabajadores = await (await comoConsulta('/api/admin/trabajadores')).json();
  const idT = trabajadores.trabajadores[0].id;
  rev((await comoConsulta(`/api/admin/trabajadores/${idT}`, { method: 'DELETE' })).status === 403, 'y la baja');
  rev((await comoConsulta(`/api/admin/trabajadores/${idT}`, { method: 'PUT', body: JSON.stringify({ __parcial: true, nombre: 'X' }) })).status === 403, 'y capturar en el expediente');
  const fichas = await comoConsulta('/api/admin/fichas', { method: 'POST', body: JSON.stringify({ ids: [idT] }) });
  rev(fichas.status === 200 && (fichas.headers.get('content-type') || '').includes('pdf'), 'pero las fichas en PDF sí', String(fichas.status));

  seccion('5. Exportar como admin: la bitácora trae su correo');
  const galletaAna = (await ctxAna.cookies()).find((c) => c.name === 't101_admin').value;
  const zip = await fetch(`${BASE}/api/admin/exportar`, { headers: { Cookie: `t101_admin=${galletaAna}` } });
  rev(zip.status === 200 && (zip.headers.get('content-type') || '').includes('zip'), 'Ana exporta el ZIP', String(zip.status));
  const bajaAna = await fetch(`${BASE}/api/admin/trabajadores/${idT}`, { method: 'DELETE', headers: { Cookie: `t101_admin=${galletaAna}` } });
  rev(bajaAna.status === 200, 'Ana da de baja al trabajador', String(bajaAna.status));

  seccion('6. Olvidé mi contraseña, con el código al correo de la empresa');
  const suelto = cliente();
  const olv = await suelto('/api/admin/clave/olvide', { email: 'ana@ejemplo.mx' });
  rev(olv.status === 200 && /^\d{6}$/.test(olv.datos.codigo_prueba || ''), 'se genera el código para la cuenta de Ana', JSON.stringify(olv.datos));
  const ajeno = await suelto('/api/admin/clave/restaurar', { email: 'consulta@ejemplo.mx', codigo: olv.datos.codigo_prueba, nueva: 'una nueva bien larga 5' });
  rev(ajeno.status === 401, 'el código de Ana no sirve para otra cuenta', String(ajeno.status));
  const rest = await suelto('/api/admin/clave/restaurar', { email: 'ana@ejemplo.mx', codigo: olv.datos.codigo_prueba, nueva: 'una nueva bien larga 5' });
  rev(rest.status === 200, 'con el código y su correo, Ana pone una nueva', JSON.stringify(rest.datos));
  const entraAna = await suelto('/api/admin/entrar', { email: 'ana@ejemplo.mx', clave: 'una nueva bien larga 5' });
  rev(entraAna.status === 200 && entraAna.datos.debe_cambiar === false, 'y entra con ella, sin cambio obligado (la puso ella)', JSON.stringify(entraAna.datos));
  // Un correo que no es cuenta contesta igual y no da código.
  const nadie = await cliente()('/api/admin/clave/olvide', { email: 'nadie@ejemplo.mx' });
  rev(nadie.status === 200 && !nadie.datos.codigo_prueba, 'un correo sin cuenta recibe la misma respuesta, sin código');

  seccion('7. Candados y quitar el acceso');
  const cuentas = (await (await comoDueno('/api/admin/cuentas')).json()).cuentas;
  const idDueno = cuentas.find((c) => c.nivel === 'dueno').id;
  const idCon = cuentas.find((c) => c.email === 'consulta@ejemplo.mx').id;
  rev((await comoDueno(`/api/admin/cuentas/${idDueno}`, undefined, 'DELETE')).status === 409, 'el dueño no se borra a sí mismo');
  rev((await comoDueno(`/api/admin/cuentas/${idDueno}`, { activo: false }, 'PUT')).status === 409, 'ni se desactiva');
  rev((await comoDueno(`/api/admin/cuentas/${idDueno}`, { nivel: 'admin' }, 'PUT')).status === 409, 'ni se baja de nivel siendo el último');
  const apaga = await comoDueno(`/api/admin/cuentas/${idCon}`, { activo: false }, 'PUT');
  rev(apaga.status === 200, 'a consulta se le quita el acceso');
  const yaNo = await comoConsulta('/api/admin/trabajadores');
  rev(yaNo.status === 401, 'y su sesión abierta deja de servir en ese momento', String(yaNo.status));
  const noEntra = await cliente()('/api/admin/entrar', { email: 'consulta@ejemplo.mx', clave: 'solo miro y ya 2026' });
  rev(noEntra.status === 401, 'ni puede volver a entrar', String(noEntra.status));
  const galletaAna2 = suelto;
  const noTocaAna = await fetch(`${BASE}/api/admin/cuentas/${idCon}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: `t101_admin=${galletaAna}` }, body: JSON.stringify({ activo: true }) });
  rev(noTocaAna.status === 403, 'admin no puede tocar cuentas', String(noTocaAna.status));
  void galletaAna2;

  seccion('7b. En escritorio (1440 px): mismo panel, sin desbordes');
  const ctxAncho = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  const pw = await ctxAncho.newPage();
  pw.on('pageerror', (e) => errores.push('excepción: ' + e));
  await pw.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await pw.waitForSelector('#caja-cuenta:not(.oculto)', { timeout: 10000 });
  await pw.fill('#acc-email', 'ana@ejemplo.mx');
  await pw.fill('#acc-clave', 'una nueva bien larga 5');
  await pw.click('#btn-entrar');
  await pw.waitForSelector('#panel:not(.oculto)', { timeout: 10000 });
  rev((await pw.locator('#quien').textContent()).trim() === 'Ana Admin · Administración', 'en escritorio Ana entra con la contraseña que puso con el código');
  rev(!(await visible(pw, '#caja-cuentas')), 'y sigue sin ver la tarjeta de cuentas');
  await sinScroll(pw, 'el panel en escritorio');
  await ctxAncho.close();

  rev(errores.length === 0, 'cero errores de JavaScript en todas las pantallas', errores.join(' | ') || 'ninguno');
  await navegador.close();

  /* ════════ la base, leída de verdad ════════ */
  seccion('8. La bitácora, leída del .sqlite que dejó el Worker');
  apagar();
  await new Promise((r) => setTimeout(r, 1500));
  const carpeta = join(persistir, 'v3', 'd1', 'miniflare-D1DatabaseObject');
  const archivo = readdirSync(carpeta).find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
  const db = new DatabaseSync(join(carpeta, archivo), { readOnly: true });
  const filas = db.prepare("SELECT quien, accion, detalle FROM bitacora WHERE accion IN ('exportacion','baja_trabajador','ingreso_admin','cuenta_creada','cuenta_desactivada','clave_cambiada','clave_restaurada') ORDER BY id").all();
  const exportacion = filas.filter((f) => f.accion === 'exportacion');
  rev(exportacion.length === 1 && exportacion[0].quien === 'ana@ejemplo.mx', 'la exportación quedó a nombre de ana@ejemplo.mx', JSON.stringify(exportacion));
  const baja = filas.filter((f) => f.accion === 'baja_trabajador');
  rev(baja.length === 1 && baja[0].quien === 'ana@ejemplo.mx', 'la baja quedó a nombre de ana@ejemplo.mx', JSON.stringify(baja));
  rev(!filas.some((f) => f.quien === 'admin'), 'ningún renglón dice «admin» a secas');
  const altas = filas.filter((f) => f.accion === 'cuenta_creada');
  rev(altas.length === 3 && altas[1].quien === 'mike@ejemplo.mx' && altas[2].quien === 'mike@ejemplo.mx', 'las altas de Ana y de consulta quedaron a nombre del dueño', JSON.stringify(altas.map((a) => [a.quien, a.detalle])));
  rev(filas.some((f) => f.accion === 'cuenta_desactivada' && f.quien === 'mike@ejemplo.mx' && f.detalle === 'consulta@ejemplo.mx'), 'quitarle el acceso a consulta quedó apuntado');
  rev(filas.filter((f) => f.accion === 'clave_cambiada' && f.detalle === 'cambio obligado al entrar').length === 2, 'los dos cambios obligados quedaron apuntados');
  rev(filas.some((f) => f.accion === 'clave_restaurada' && f.quien === 'ana@ejemplo.mx'), 'la restauración con código quedó a nombre de Ana');
  const cuentasDb = db.prepare('SELECT email, nivel, activo, debe_cambiar, hash, sal, vueltas FROM administradores ORDER BY creado_en').all();
  rev(cuentasDb.every((c) => c.vueltas === 100000 && c.hash.length > 30 && c.sal.length > 10), 'las contraseñas están derivadas con PBKDF2 de 100 000 vueltas, con sal', JSON.stringify(cuentasDb.map((c) => [c.email, c.nivel, c.activo, c.debe_cambiar, c.vueltas])));
  rev(!cuentasDb.some((c) => ['la frase del dueno 2026', 'ahora si es la mia 7', 'una nueva bien larga 5'].includes(c.hash)), 'ninguna contraseña quedó en claro');
  db.close();
} catch (e) {
  fallas++;
  console.log('  [MAL] la prueba tronó:', e && e.stack || e);
} finally {
  apagar();
  rmSync(persistir, { recursive: true, force: true });
}

console.log();
if (fallas) { console.log(`FALLAS: ${fallas}`); process.exit(1); }
console.log('0.11 medido de punta a punta: cuentas con contraseña, niveles y bitácora con nombre.');
