/* roster101 — Panel de la empresa */
'use strict';
const $ = (s) => document.querySelector(s);

const NOMBRES = {
  foto:'Foto', firma_bancaria:'Firma bancaria', ine:'INE frente', ine_reverso:'INE reverso', nss:'NSS',
  csf:'CSF', curp:'CURP', caratula:'Carátula', dc3:'DC-3', otro:'Otro',
};
const ORDEN = ['foto','firma_bancaria','ine','ine_reverso','nss','csf','curp','caratula','dc3','otro'];

let trabajadores = [];
const elegidos = new Set();

// Cómo se ve la lista: completa para revisar a alguien, compacta para pasar
// lista. Se declara aquí arriba porque el arranque de la página la lee antes de
// llegar a las funciones que la usan.
const VISTA = 'roster101.panel.vista';
let vista = 'completa';
try { if (localStorage.getItem(VISTA) === 'compacta') vista = 'compacta'; } catch { /* da igual */ }

async function api(ruta, op = {}) {
  const r = await fetch(ruta, { credentials:'same-origin', ...op });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(d.error || 'Error'), { estado:r.status, datos:d });
  return d;
}

/* ─────────── quién soy ───────────
   Cada persona entra con su correo y su contraseña (0.11). `yo` es lo que el
   servidor dice de la sesión: nombre, nivel y qué puede hacer. La pantalla se
   acomoda a eso: a quien no puede exportar no se le pinta el botón. */
let yo = null;
const puedo = (que) => !!(yo && yo.permisos && yo.permisos[que]);
const NIVEL_DICE = { dueno: 'Dueño', admin: 'Administración', consulta: 'Consulta' };
const json = (cuerpo) => ({ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cuerpo) });

$('#btn-entrar').addEventListener('click', async () => {
  const caja = $('#caja-cuenta');
  limpiaErrores(caja);
  $('#aviso-acceso').innerHTML = '';
  const b = $('#btn-entrar'); b.disabled = true;
  try {
    await api('/api/admin/entrar', json({ email: $('#acc-email').value, clave: $('#acc-clave').value }));
    $('#acc-clave').value = '';
    await abrir();
  } catch (e) {
    $('#acc-error').textContent = e.message;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; }
});
$('#acc-clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-entrar').click(); });
$('#acc-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#acc-clave').focus(); });

// El arranque: la clave compartida abre sólo para crear la primera cuenta.
$('#btn-arranque').addEventListener('click', async () => {
  $('#arranque-error').textContent = '';
  const b = $('#btn-arranque'); b.disabled = true;
  try {
    const r = await api('/api/admin/entrar', json({ clave: $('#clave-arranque').value }));
    $('#clave-arranque').value = '';
    if (r.arranque) {
      $('#caja-arranque').classList.add('oculto');
      $('#caja-primera').classList.remove('oculto');
      $('#pri-nombre').focus();
    } else {
      await abrir();
    }
  } catch (e) { $('#arranque-error').textContent = e.message; }
  finally { b.disabled = false; }
});
$('#clave-arranque').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-arranque').click(); });

$('#btn-primera').addEventListener('click', async () => {
  const caja = $('#caja-primera');
  limpiaErrores(caja);
  $('#aviso-primera').innerHTML = '';
  if (!clavesCuadran('#caja-primera', '#pri-clave', '#pri-clave2')) return;
  const b = $('#btn-primera'); b.disabled = true; b.textContent = 'Creando…';
  try {
    await api('/api/admin/cuentas/primera', json({
      nombre: $('#pri-nombre').value, email: $('#pri-email').value, clave: $('#pri-clave').value,
    }));
    $('#pri-clave').value = ''; $('#pri-clave2').value = '';
    await abrir();
  } catch (e) {
    $('#aviso-primera').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Crear mi cuenta'; }
});

// El cambio obligado: alguien más puso esta contraseña y hay que cambiarla
// antes de que el panel se abra.
$('#btn-obligado').addEventListener('click', async () => {
  const caja = $('#caja-obligado');
  limpiaErrores(caja);
  $('#aviso-obligado').innerHTML = '';
  if (!clavesCuadran('#caja-obligado', '#ob-nueva', '#ob-nueva2')) return;
  const b = $('#btn-obligado'); b.disabled = true; b.textContent = 'Cambiando…';
  try {
    await api('/api/admin/clave', json({ actual: $('#ob-actual').value, nueva: $('#ob-nueva').value }));
    $('#ob-actual').value = ''; $('#ob-nueva').value = ''; $('#ob-nueva2').value = '';
    $('#caja-obligado').classList.add('oculto');
    await abrir();
  } catch (e) {
    $('#aviso-obligado').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Cambiar mi contraseña'; }
});

async function salir() { await api('/api/admin/salir', { method:'POST' }); location.reload(); }
$('#btn-salir').addEventListener('click', salir);
$('#btn-salir-ob').addEventListener('click', salir);
$('#btn-refrescar').addEventListener('click', cargar);
$('#buscar').addEventListener('input', pintar);

async function abrir() {
  yo = await api('/api/admin/yo');      // si no hay sesión, esto lanza 401 y no abrimos nada
  $('#btn-salir').classList.remove('oculto');
  if (yo.debe_cambiar) {
    // Se entró con una contraseña que puso alguien más: antes de ver nada, una propia.
    for (const c of ['#caja-cuenta', '#caja-arranque', '#caja-primera', '#caja-restaurar']) $(c).classList.add('oculto');
    $('#caja-obligado').classList.remove('oculto');
    $('#ob-actual').focus();
    return;
  }
  aplicaPermisos();
  ponVista(vista, false);   // solo acomoda; pintar viene con los datos
  await cargar();
  $('#acceso').classList.add('oculto');
  $('#panel').classList.remove('oculto');
}

// Lo que la cuenta no puede hacer, no se pinta. El servidor lo rechaza de todos
// modos, pero un botón que siempre falla es una pantalla mal hecha.
function aplicaPermisos() {
  const q = $('#quien');
  q.textContent = `${yo.nombre || yo.email} · ${NIVEL_DICE[yo.nivel] || yo.nivel}`;
  q.title = yo.email;
  q.classList.remove('oculto');
  document.querySelectorAll('.solo-exportar').forEach((el) => el.classList.toggle('oculto', !puedo('exportar')));
  document.querySelectorAll('.solo-cuentas').forEach((el) => el.classList.toggle('oculto', !puedo('cuentas')));
  $('#exp-guardar').classList.toggle('oculto', !puedo('capturar'));
  document.body.classList.toggle('sin-baja', !puedo('baja'));
}

async function cargar() {
  const d = await api('/api/admin/trabajadores');
  trabajadores = d.trabajadores;
  const completos = trabajadores.filter((t) => t.estado === 'completo').length;
  $('#resumen').innerHTML = `<b>${trabajadores.length}</b> trabajadores registrados · <b>${completos}</b> con expediente completo · <b>${trabajadores.length - completos}</b> con pendientes.`;
  pintar();
  cargarDuplicados();
  cargarPapelera();
  cargarCuentas();
}

// El portal ya no deja guardar un dato repetido, pero esto muestra lo que haya
// entrado antes de ese freno. Si no hay nada, la tarjeta ni se ve.
async function cargarDuplicados() {
  const caja = $('#duplicados');
  const lista = $('#dup-lista');
  try {
    const d = await api('/api/admin/duplicados');
    const grupos = d.duplicados || [];
    if (!grupos.length) { caja.classList.add('oculto'); return; }
    lista.innerHTML = grupos.map((g) => {
      const quienes = g.trabajadores.map((t) => {
        const nom = [t.apellido_paterno, t.apellido_materno, t.nombre].filter(Boolean).join(' ').trim();
        return `<li>${esc(nom || '(sin nombre)')} · <span class="mono" style="font-size:12px">${esc(t.email)}</span>${t.folio ? ` · #${esc(t.folio)}` : ''}</li>`;
      }).join('');
      return `<div style="margin-top:14px">
        <div>Mismo ${esc(g.nombre)}: <span class="mono"><b>${esc(g.valor)}</b></span></div>
        <ul style="margin:6px 0 0 18px;color:var(--tenue)">${quienes}</ul>
      </div>`;
    }).join('');
    caja.classList.remove('oculto');
  } catch { caja.classList.add('oculto'); }
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function pintar() {
  const q = $('#buscar').value.trim().toLowerCase();
  const cuerpo = $('#cuerpo');
  cuerpo.innerHTML = '';
  const lista = trabajadores.filter((t) => !q || JSON.stringify(t).toLowerCase().includes(q));
  if (!lista.length) {
    cuerpo.innerHTML = '<tr><td colspan="11" class="centrado" style="padding:30px;color:var(--tenue)">Sin resultados.</td></tr>';
    return;
  }
  for (const t of lista) {
    const docs = t.documentos || [];
    const hay = {}; for (const d of docs) (hay[d.tipo] ||= []).push(d);
    const chips = ORDEN.filter((k) => hay[k]).map((k) =>
      hay[k].map((d) => `<a class="btn suave chico" style="margin:2px 2px 0 0" target="_blank" rel="noopener" href="/api/docs/${d.id}/archivo">${esc(NOMBRES[k])}</a>`).join('')
    ).join('');
    const faltanDocs = t.faltantes || [];
    const faltanCampos = (t.faltan_campos || []).map((f) => f.nombre);
    const falta = faltanDocs.length + faltanCampos.length;
    const detalleFalta = [
      faltanCampos.length ? `<b>Por escribir:</b> ${esc(faltanCampos.join(', '))}` : '',
      faltanDocs.length ? `<b>Por entregar:</b> ${esc(faltanDocs.join(', '))}` : '',
    ].filter(Boolean).join('<br>');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="palomita" data-id="${t.id}"${elegidos.has(t.id) ? ' checked' : ''}></td>
      <td class="mono">${t.folio ?? ''}</td>
      <td><button class="abre-exp" data-abrir="${t.id}" title="Abrir su expediente">${nombreCelda(t)}</button></td>
      <td class="solo-compacta mono">${esc(t.rfc) || '<span style="color:var(--alerta)">falta</span>'}</td>
      <td><span class="mono">${esc(t.celular)}</span><br><span style="color:var(--tenue);font-size:12px">${esc(t.email)}</span></td>
      <td class="mono">${esc(t.nss)}<br>${esc(t.curp)}</td>
      <td>${esc(t.banco)}<br><span class="mono" style="font-size:12px">${esc(t.clabe)}</span></td>
      <td>${esc(t.emerg_nombre)}${t.emerg_parentesco ? ` <span style="color:var(--tenue)">(${esc(t.emerg_parentesco)})</span>` : ''}<br><span class="mono" style="font-size:12px">${esc(t.emerg_telefono)}</span></td>
      <td class="celda-docs">${chips || '<span style="color:var(--tenue)">—</span>'}${falta ? `<details class="faltan"><summary>Faltan ${falta}</summary>${detalleFalta}</details>` : ''}</td>
      <td><span class="etiqueta ${t.estado === 'completo' ? 'completo' : 'borrador'}">${t.estado === 'completo' ? 'Completo' : 'Pendiente'}</span></td>
      <td>${puedo('baja') ? `<button class="btn peligro chico" data-baja="${t.id}">Baja</button>` : ''}</td>`;
    // Doble clic en el renglón abre su expediente tal como lo ve la persona. Se
    // deja fuera la primera y la última celda: ahí viven la palomita y el botón
    // de baja, y abrir una ventana encima de un clic a esos dos estorba.
    tr.addEventListener('dblclick', (e) => {
      if (e.target.closest('input, button, a, details')) return;  // el nombre ya abre con un clic
      abrirExpediente(t.id);
    });
    tr.title = 'Doble clic para abrir su expediente';
    cuerpo.appendChild(tr);
  }
  cuerpo.querySelectorAll('[data-abrir]').forEach((b) =>
    b.addEventListener('click', () => abrirExpediente(b.dataset.abrir)));

  cuerpo.querySelectorAll('.palomita').forEach((p) => p.addEventListener('change', () => {
    if (p.checked) elegidos.add(p.dataset.id); else elegidos.delete(p.dataset.id);
    contarElegidos();
  }));
  contarElegidos();

  cuerpo.querySelectorAll('[data-baja]').forEach((b) => b.addEventListener('click', async () => {
    const t = trabajadores.find((x) => x.id === b.dataset.baja);
    const quien = t ? `${t.apellido_paterno} ${t.apellido_materno} ${t.nombre}`.trim() : 'este trabajador';
    if (!confirm(`¿Dar de baja a ${quien}?\n\nSe va a la papelera con todo y documentos. Ahí se queda 30 días, y en ese plazo lo puedes devolver. Cumplidos los 30 días se borra de verdad.`)) return;
    b.disabled = true;
    try { await api(`/api/admin/trabajadores/${b.dataset.baja}`, { method:'DELETE' }); }
    catch (e) { alert(e.message); b.disabled = false; return; }
    await cargar();
  }));
}

/* ─────────── papelera ─────────── */

async function cargarPapelera() {
  const caja = $('#papelera');
  const lista = $('#pap-lista');
  try {
    const d = await api('/api/admin/papelera');
    const gente = d.papelera || [];
    if (!gente.length) { caja.classList.add('oculto'); lista.innerHTML = ''; return; }
    lista.innerHTML = gente.map((t) => {
      const nom = [t.apellido_paterno, t.apellido_materno, t.nombre].filter(Boolean).join(' ').trim() || '(sin nombre)';
      const dias = t.dias_restantes;
      const urge = dias <= 5;
      const cuando = dias === 0 ? 'se borra hoy'
        : dias === 1 ? 'se borra mañana'
        : `se borra en ${dias} días`;
      return `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid var(--linea, #e6e8ea)">
        <div style="flex:1;min-width:200px">
          <b>${esc(nom)}</b>${t.folio ? ` · <span class="mono" style="font-size:12px">#${esc(t.folio)}</span>` : ''}<br>
          <span style="color:var(--tenue);font-size:12px">${esc(t.email)} · ${t.documentos} documento${t.documentos === 1 ? '' : 's'} guardado${t.documentos === 1 ? '' : 's'}</span>
        </div>
        <span style="font-size:12.5px;color:${urge ? 'var(--alerta)' : 'var(--tenue)'}">${esc(cuando)}</span>
        ${puedo('baja') ? `<button class="btn suave chico" data-restaurar="${t.id}" data-nombre="${esc(nom)}">↩ Devolver</button>
        <button class="btn peligro chico" data-purgar="${t.id}" data-nombre="${esc(nom)}">Borrar ya</button>` : ''}
      </div>`;
    }).join('');
    caja.classList.remove('oculto');

    lista.querySelectorAll('[data-restaurar]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try { await api(`/api/admin/papelera/${b.dataset.restaurar}/restaurar`, { method:'POST' }); }
      catch (e) { alert(e.message); b.disabled = false; return; }
      await cargar();
    }));

    lista.querySelectorAll('[data-purgar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`Borrar YA a ${b.dataset.nombre}, sin esperar los 30 días.\n\nSe van su expediente y todos sus documentos. Esto sí no se puede deshacer.`)) return;
      b.disabled = true;
      try { await api(`/api/admin/papelera/${b.dataset.purgar}`, { method:'DELETE' }); }
      catch (e) { alert(e.message); b.disabled = false; return; }
      await cargar();
    }));
  } catch { caja.classList.add('oculto'); }
}

/* ─────────── fichas en PDF ─────────── */

function contarElegidos() {
  // Alguien pudo quedar seleccionado y luego darse de baja: solo cuentan los que siguen.
  const vivos = new Set(trabajadores.map((t) => t.id));
  for (const id of [...elegidos]) if (!vivos.has(id)) elegidos.delete(id);

  const n = elegidos.size;
  $('#cuenta-sel').textContent = n === 0 ? 'Nadie seleccionado.'
    : n === 1 ? '1 trabajador seleccionado.' : `${n} trabajadores seleccionados.`;
  $('#btn-ficha').disabled = n === 0;
  const zip = $('#con-documentos').checked;
  $('#btn-ficha').textContent = zip
    ? (n > 1 ? `⬇ Descargar ${n} fichas + documentos` : '⬇ Descargar ficha + documentos')
    : (n > 1 ? `⬇ Descargar ${n} fichas PDF` : '⬇ Descargar ficha PDF');
  const compartir = $('#btn-compartir');
  compartir.disabled = n === 0;
  compartir.classList.toggle('oculto', !puedeCompartir || n === 0);

  const visibles = [...document.querySelectorAll('.palomita')];
  const todos = $('#sel-todos');
  todos.checked = visibles.length > 0 && visibles.every((p) => p.checked);
  todos.indeterminate = !todos.checked && visibles.some((p) => p.checked);
}

$('#sel-todos').addEventListener('change', (e) => {
  document.querySelectorAll('.palomita').forEach((p) => {
    p.checked = e.target.checked;
    if (p.checked) elegidos.add(p.dataset.id); else elegidos.delete(p.dataset.id);
  });
  contarElegidos();
});

// Si el teléfono sabe compartir archivos, mejor mandarla directo que bajarla.
const puedeCompartir = !!(navigator.canShare && navigator.share);

// Qué campos van en la ficha. Casi nunca se entrega todo: muchas veces basta el
// nombre y el NSS, o el nombre y la CURP. El nombre y el folio van siempre.
function camposElegidos() {
  return [...document.querySelectorAll('.campo-ficha')].filter((c) => c.checked).map((c) => c.dataset.campo);
}

function ponerCampos(ids) {
  document.querySelectorAll('.campo-ficha').forEach((c) => { c.checked = ids.includes(c.dataset.campo); });
}

// Los datos bancarios nunca entran en un atajo: se prenden a mano, a propósito.
$('#campos-minimo').addEventListener('click', () => ponerCampos(['nss']));
$('#con-documentos').addEventListener('change', contarElegidos);
$('#campos-todo').addEventListener('click', () => {
  ponerCampos([...document.querySelectorAll('.campo-ficha')].map((c) => c.dataset.campo).filter((x) => x !== 'banco'));
});

async function pedirFichas() {
  const r = await fetch('/api/admin/fichas', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [...elegidos], campos: camposElegidos(), documentos: $('#con-documentos').checked }),
  });
  if (!r.ok) {
    let d = {}; try { d = await r.json(); } catch {}
    throw new Error(d.error || 'No se pudo armar el PDF.');
  }
  const cd = r.headers.get('Content-Disposition') || '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
  const zip = $('#con-documentos').checked;
  const nombre = m ? decodeURIComponent(m[1]) : (zip ? 'Fichas.zip' : 'Ficha.pdf');
  return { blob: await r.blob(), nombre, tipo: zip ? 'application/zip' : 'application/pdf' };
}

$('#btn-ficha').addEventListener('click', async () => {
  const b = $('#btn-ficha'); const txt = b.textContent;
  b.disabled = true; b.textContent = $('#con-documentos').checked ? 'Juntando todo…' : 'Armando el PDF…';
  try {
    const { blob, nombre } = await pedirFichas();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { alert(e.message); }
  finally { b.disabled = false; b.textContent = txt; contarElegidos(); }
});

$('#btn-compartir').addEventListener('click', async () => {
  const b = $('#btn-compartir'); const txt = b.textContent;
  b.disabled = true; b.textContent = $('#con-documentos').checked ? 'Juntando todo…' : 'Armando el PDF…';
  try {
    const { blob, nombre, tipo } = await pedirFichas();
    const archivo = new File([blob], nombre, { type: tipo });
    if (!navigator.canShare({ files: [archivo] })) {
      alert('Este teléfono no deja compartir archivos desde el navegador. Usa el botón de descargar y mándalo desde ahí.');
      return;
    }
    await navigator.share({ files: [archivo], title: nombre });
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // le picó cancelar, no es error
    alert(e.message);
  }
  finally { b.disabled = false; b.textContent = txt; contarElegidos(); }
});

$('#btn-zip').addEventListener('click', async () => {
  const b = $('#btn-zip'); const txt = b.textContent;
  b.disabled = true; b.textContent = 'Armando el ZIP…';
  try {
    const r = await fetch('/api/admin/exportar', { credentials:'same-origin' });
    if (!r.ok) throw new Error('No se pudo exportar');
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // El nombre lo manda el servidor, que es quien sabe de qué empresa es.
    const cd = r.headers.get('Content-Disposition') || '';
    const m = /filename="([^"]+)"/.exec(cd);
    a.download = m ? m[1] : `Expedientes ${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { alert(e.message); }
  finally { b.disabled = false; b.textContent = txt; }
});

// El nombre de la empresa en los pies de página sale de su configuración.
async function pintarMarca() {
  try {
    const c = await (await fetch('/api/config', { credentials: 'same-origin' })).json();
    const nombre = c.razon_social || c.empresa;
    if (nombre) document.querySelectorAll('.eco-empresa').forEach((e) => { e.textContent = nombre; });
  } catch { /* si no se alcanza, se queda el texto genérico */ }
}

// Sin sesión, `abrir` truena con 401 y se queda la pantalla de la clave: eso es
// lo normal. Cualquier otro error sí se enseña, para que un panel en blanco no
// se vea igual que un panel que no ha entrado.
(async () => {
  pintarMarca();
  try { await abrir(); return; } catch (e) { if (e.estado !== 401) console.error('No se pudo abrir el panel:', e); }
  // Sin sesión: ¿ya hay cuentas? Si no, se entra con la clave compartida del
  // arranque para crear la primera.
  try {
    const d = await api('/api/admin/estado');
    $('#caja-cuenta').classList.toggle('oculto', !d.cuentas);
    $('#caja-arranque').classList.toggle('oculto', d.cuentas);
    (d.cuentas ? $('#acc-email') : $('#clave-arranque')).focus();
  } catch (e) { console.error('No se pudo saber si el panel tiene cuentas:', e); }
})();

/* ─────────── la clave del panel ─────────── */
// La clave ya no vive en el repositorio: vive en el Worker, hasheada, junto con
// las que ya se usaron. De aquí sale cambiarla sabiéndola, y recuperarla cuando
// se olvidó con un código que llega al correo configurado de la empresa.

function limpiaErrores(caja) {
  for (const e of caja.querySelectorAll('.error')) e.textContent = '';
  for (const c of caja.querySelectorAll('.campo.falta')) c.classList.remove('falta');
}

function marcaErrores(caja, errores = {}) {
  for (const [campo, texto] of Object.entries(errores)) {
    const e = caja.querySelector(`[data-e="${campo}"]`);
    if (e) { e.textContent = texto; e.closest('.campo')?.classList.add('falta'); }
  }
}

/* ─────────── la clave se escribe dos veces ───────────
   Una clave mal tecleada no se nota: la pantalla enseña puntitos, el servidor
   la guarda tal cual llegó, y el error aparece al siguiente intento de entrar
   -- cuando ya no se puede. Por eso se pide dos veces, y en la segunda no se
   deja pegar: copiar y pegar dos veces el mismo error de dedo no comprueba
   nada. Tecleada de nuevo, un dedo equivocado casi nunca cae en el mismo sitio.

   A cambio de la molestia va el botón de ver lo escrito: si se usa un gestor
   de contraseñas y la clave es larga, se pega en el primer campo, se teclea en
   el segundo, y si no cuadran se puede mirar por qué en vez de adivinar. */
document.querySelectorAll('[data-sin-pegar]').forEach((el) => {
  const no = (e) => {
    e.preventDefault();
    const caja = el.closest('.campo')?.querySelector('.error');
    if (caja) caja.textContent = 'Aquí no se pega: escríbela para comprobar que no trae un error de dedo.';
  };
  el.addEventListener('paste', no);
  el.addEventListener('drop', no);
});

function ojo(boton, ...campos) {
  const b = $(boton);
  if (!b) return;
  b.addEventListener('click', () => {
    const oculto = $(campos[0]).type === 'password';
    campos.forEach((c) => { const el = $(c); if (el) el.type = oculto ? 'text' : 'password'; });
    b.textContent = oculto ? 'Ocultar lo que escribí' : 'Ver lo que escribí';
  });
}
ojo('#btn-ver-clave', '#cl-nueva', '#cl-nueva2');
ojo('#btn-ver-res', '#res-nueva', '#res-nueva2');
ojo('#btn-ver-pri', '#pri-clave', '#pri-clave2');
ojo('#btn-ver-ob', '#ob-nueva', '#ob-nueva2');

// Las dos tienen que coincidir antes de mandar nada. Se comprueba aquí y no en
// el servidor a propósito: la segunda copia nunca sale de esta pantalla.
function clavesCuadran(caja, uno, dos) {
  const a = $(uno).value, b = $(dos).value;
  if (a && a === b) return true;
  const err = document.querySelector(`${caja} [data-e="nueva2"]`);
  if (err) err.textContent = b ? 'No coinciden. Revisa las dos.' : 'Escribe la clave otra vez para confirmarla.';
  $(dos).focus();
  return false;
}

$('#btn-cambiar-clave').addEventListener('click', async () => {
  const caja = $('#caja-clave');
  limpiaErrores(caja);
  $('#aviso-clave').innerHTML = '';
  if (!clavesCuadran('#caja-clave', '#cl-nueva', '#cl-nueva2')) return;
  const b = $('#btn-cambiar-clave'); b.disabled = true; b.textContent = 'Cambiando…';
  try {
    const r = await api('/api/admin/clave', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ actual: $('#cl-actual').value, nueva: $('#cl-nueva').value }),
    });
    $('#cl-actual').value = ''; $('#cl-nueva').value = ''; $('#cl-nueva2').value = '';
    $('#aviso-clave').innerHTML = `<div class="aviso bien">${esc(r.mensaje)}</div>`;
  } catch (e) {
    $('#aviso-clave').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Cambiar mi contraseña'; }
});

/* ── recuperar, desde la pantalla de acceso ── */

$('#btn-olvide').addEventListener('click', async () => {
  const email = $('#acc-email').value.trim();
  limpiaErrores($('#caja-cuenta'));
  if (!email) {
    marcaErrores($('#caja-cuenta'), { email: 'Escribe primero el correo de tu cuenta.' });
    $('#acc-email').focus();
    return;
  }
  const b = $('#btn-olvide'); b.disabled = true; b.textContent = 'Mandando el código…';
  try {
    const r = await api('/api/admin/clave/olvide', json({ email }));
    $('#caja-cuenta').classList.add('oculto');
    $('#caja-restaurar').classList.remove('oculto');
    $('#res-email').value = email;
    $('#txt-restaurar').innerHTML =
      `Si <b>${esc(email)}</b> es una cuenta de este panel, se mandó un código a <b>${esc(r.correo)}</b>, el correo configurado de la empresa. Vence en 15 minutos.`;
    $('#res-codigo').focus();
  } catch (e) {
    $('#acc-error').textContent = e.message;
    marcaErrores($('#caja-cuenta'), e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Olvidé mi contraseña'; }
});

// En el arranque lo que se recupera es la clave compartida: el código llega
// al mismo correo de la empresa y con él se pone una nueva, para poder llegar
// a crear la primera cuenta.
let resArranque = false;
$('#btn-olvide-arranque').addEventListener('click', async () => {
  $('#arranque-error').textContent = '';
  const b = $('#btn-olvide-arranque'); b.disabled = true; b.textContent = 'Mandando el código…';
  try {
    const r = await api('/api/admin/clave/olvide', json({}));
    resArranque = true;
    $('#caja-arranque').classList.add('oculto');
    $('#caja-restaurar').classList.remove('oculto');
    $('#res-campo-email').classList.add('oculto');
    $('#caja-restaurar h2').textContent = 'Recuperar la clave compartida';
    $('#txt-restaurar').innerHTML =
      `Se mandó un código a <b>${esc(r.correo)}</b>, el correo configurado de la empresa. Vence en 15 minutos. Con él pones una clave compartida nueva; sirve para entrar a crear tu cuenta de dueño.`;
    $('#res-codigo').focus();
  } catch (e) {
    $('#arranque-error').textContent = e.message;
  } finally { b.disabled = false; b.textContent = 'Olvidé la clave compartida'; }
});

$('#btn-cancelar-res').addEventListener('click', () => {
  $('#caja-restaurar').classList.add('oculto');
  $(resArranque ? '#caja-arranque' : '#caja-cuenta').classList.remove('oculto');
  $('#res-codigo').value = ''; $('#res-nueva').value = ''; $('#res-nueva2').value = '';
});

$('#btn-restaurar').addEventListener('click', async () => {
  const caja = $('#caja-restaurar');
  limpiaErrores(caja);
  $('#aviso-restaurar').innerHTML = '';
  if (!clavesCuadran('#caja-restaurar', '#res-nueva', '#res-nueva2')) return;
  const b = $('#btn-restaurar'); b.disabled = true; b.textContent = 'Guardando…';
  try {
    const r = await api('/api/admin/clave/restaurar', json({
      email: $('#res-email').value, codigo: $('#res-codigo').value, nueva: $('#res-nueva').value,
    }));
    caja.classList.add('oculto');
    $('#res-codigo').value = ''; $('#res-nueva').value = ''; $('#res-nueva2').value = '';
    if (r.arranque) {
      $('#caja-arranque').classList.remove('oculto');
      $('#arranque-error').textContent = '';
      $('#caja-arranque .ayuda').innerHTML = `<div class="aviso bien">${esc(r.mensaje)}</div>`;
      $('#clave-arranque').focus();
      return;
    }
    $('#caja-cuenta').classList.remove('oculto');
    $('#acc-email').value = $('#res-email').value;
    $('#acc-clave').value = '';
    $('#acc-error').textContent = '';
    $('#aviso-acceso').innerHTML = `<div class="aviso bien">${esc(r.mensaje)}</div>`;
    $('#acc-clave').focus();
  } catch (e) {
    $('#aviso-restaurar').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Poner la contraseña nueva'; }
});

/* ─────────── las cuentas de este panel (solo dueño) ─────────── */
// Quién entra y qué puede hacer. Crear, cambiar de nivel, apagar, reponer la
// contraseña y borrar. Los candados los pone el servidor (el último dueño no
// se toca, nadie se apaga a sí mismo); aquí sólo se enseñan sus mensajes.

let cuNiveles = [];

function fechaCorta(iso) {
  if (!iso) return 'nunca ha entrado';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-MX', { timeZone: 'America/Mexico_City', hour: '2-digit', minute: '2-digit', hour12: true });
}

function pintaNiveles(select, elegido) {
  select.innerHTML = cuNiveles.map((n) => `<option value="${esc(n.nivel)}"${n.nivel === elegido ? ' selected' : ''}>${esc(n.nombre)}</option>`).join('');
}

async function cargarCuentas() {
  if (!puedo('cuentas')) return;
  const lista = $('#cuentas-lista');
  try {
    const d = await api('/api/admin/cuentas');
    cuNiveles = d.niveles || [];
    if (!$('#cu-nivel').options.length) {
      pintaNiveles($('#cu-nivel'), 'consulta');
      diceNivel();
    }
    const cuentas = d.cuentas || [];
    const activas = cuentas.filter((c) => c.activo).length;
    $('#cuentas-resumen').textContent = `${cuentas.length} cuenta${cuentas.length === 1 ? '' : 's'}, ${activas} activa${activas === 1 ? '' : 's'}. Solo la dueña o el dueño ve esto.`;
    lista.innerHTML = cuentas.map((c) => {
      const soyYo = c.id === yo.id;
      return `<div class="cuenta${c.activo ? '' : ' inactiva'}" data-id="${esc(c.id)}">
        <div class="datos">
          <b>${esc(c.nombre || '(sin nombre)')}</b>${soyYo ? ' <span class="ayuda" style="display:inline;margin:0">(tú)</span>' : ''}
          ${c.activo ? '' : ' <span class="etiqueta inactiva">sin acceso</span>'}
          ${c.debe_cambiar ? ' <span class="etiqueta provisional">contraseña provisional</span>' : ''}<br>
          <span style="color:var(--tenue);font-size:12px">${esc(c.email)} · última entrada: ${esc(fechaCorta(c.ultimo_acceso))}</span>
        </div>
        ${soyYo
          ? `<span class="etiqueta nivel">${esc(NIVEL_DICE[c.nivel] || c.nivel)}</span>`
          : `<select data-nivel="${esc(c.id)}" aria-label="Nivel de ${esc(c.email)}"></select>
             <button class="btn suave chico" data-reponer="${esc(c.id)}" data-email="${esc(c.email)}">Reponer contraseña</button>
             <button class="btn suave chico" data-apagar="${esc(c.id)}" data-activo="${c.activo ? 1 : 0}" data-email="${esc(c.email)}">${c.activo ? 'Quitar acceso' : 'Devolver acceso'}</button>
             <button class="btn peligro chico" data-borrar="${esc(c.id)}" data-email="${esc(c.email)}">Borrar</button>`}
      </div>`;
    }).join('');

    for (const sel of lista.querySelectorAll('[data-nivel]')) {
      const c = cuentas.find((x) => x.id === sel.dataset.nivel);
      pintaNiveles(sel, c.nivel);
      sel.addEventListener('change', () => cambiaCuenta(sel.dataset.nivel, { nivel: sel.value }));
    }
    lista.querySelectorAll('[data-apagar]').forEach((b) => b.addEventListener('click', () => {
      const activa = b.dataset.activo === '1';
      if (activa && !confirm(`¿Quitarle el acceso a ${b.dataset.email}?\n\nNo se borra nada: deja de poder entrar hasta que se lo devuelvas.`)) return;
      cambiaCuenta(b.dataset.apagar, { activo: !activa });
    }));
    lista.querySelectorAll('[data-reponer]').forEach((b) => b.addEventListener('click', async () => {
      const clave = prompt(`Contraseña provisional para ${b.dataset.email}.\n\nDíctasela: al entrar, el panel la obliga a cambiarla por una suya.`, sugiereContrasena());
      if (clave == null) return;
      await accionCuenta(() => api(`/api/admin/cuentas/${b.dataset.reponer}/clave`, json({ clave })),
        `Listo. ${b.dataset.email} entra con esa contraseña y tiene que cambiarla al entrar.`);
    }));
    lista.querySelectorAll('[data-borrar]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`¿Borrar la cuenta de ${b.dataset.email}?\n\nSu rastro en la bitácora se queda. Si sólo quieres que no entre por un tiempo, mejor quítale el acceso.`)) return;
      await accionCuenta(() => api(`/api/admin/cuentas/${b.dataset.borrar}`, { method: 'DELETE' }), `Se borró la cuenta de ${b.dataset.email}.`);
    }));
  } catch (e) {
    lista.innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
  }
}

async function accionCuenta(hacer, mensaje) {
  $('#aviso-cuentas').innerHTML = '';
  try {
    await hacer();
    $('#aviso-cuentas').innerHTML = `<div class="aviso bien">${esc(mensaje)}</div>`;
  } catch (e) {
    $('#aviso-cuentas').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
  }
  await cargarCuentas();
}

function cambiaCuenta(id, cambio) {
  return accionCuenta(() => api(`/api/admin/cuentas/${id}`, { ...json(cambio), method: 'PUT' }), 'Guardado.');
}

function diceNivel() {
  const n = cuNiveles.find((x) => x.nivel === $('#cu-nivel').value);
  $('#cu-nivel-dice').textContent = n ? n.dice : '';
}
$('#cu-nivel').addEventListener('change', diceNivel);

// Tres palabras y un número: fácil de dictar por teléfono, imposible de adivinar.
const PALABRAS = ['roble', 'marea', 'lluvia', 'cobre', 'nube', 'piedra', 'trigo', 'sauce', 'faro', 'brisa', 'canto', 'sierra', 'arena', 'nogal', 'ceniza', 'viento', 'lirio', 'cedro', 'ámbar', 'ola'];
function sugiereContrasena() {
  const al = () => PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
  return `${al()}-${al()}-${al()}-${Math.floor(10 + Math.random() * 90)}`;
}
$('#cu-sugerir').addEventListener('click', () => { $('#cu-clave').value = sugiereContrasena(); });

$('#btn-crear-cuenta').addEventListener('click', async () => {
  const caja = $('#caja-cuentas');
  limpiaErrores(caja);
  const b = $('#btn-crear-cuenta'); b.disabled = true; b.textContent = 'Creando…';
  try {
    const r = await api('/api/admin/cuentas', json({
      nombre: $('#cu-nombre').value, email: $('#cu-email').value, nivel: $('#cu-nivel').value, clave: $('#cu-clave').value,
    }));
    $('#cu-nombre').value = ''; $('#cu-email').value = ''; $('#cu-clave').value = '';
    $('#aviso-cuentas').innerHTML = `<div class="aviso bien">Listo: ${esc(r.cuenta.email)} ya puede entrar con la contraseña provisional, y la tiene que cambiar al entrar.</div>`;
    await cargarCuentas();
  } catch (e) {
    $('#aviso-cuentas').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    marcaErrores(caja, e.datos?.errores);
  } finally { b.disabled = false; b.textContent = 'Crear la cuenta'; }
});

/* ─────────── cómo se ve la lista ─────────── */
// La vista completa es para revisar a alguien; la compacta, para pasar lista.
// Con veinte columnas no se puede leer de corrido quién es quién, así que la
// compacta deja nada más el nombre —empezando por apellidos, como se busca— y
// el RFC, que es el dato que se anda cotejando contra nómina. Se acuerda de cuál
// se dejó puesta.
// En la vista completa el nombre va en dos renglones, con el puesto debajo. En
// la compacta va en uno solo: son los apellidos primero y el nombre después,
// que es como se lee una lista.
function nombreCelda(t) {
  const apellidos = `${esc(t.apellido_paterno)} ${esc(t.apellido_materno)}`.trim();
  if (vista === 'compacta') {
    return `${apellidos ? `<b>${apellidos}</b> ` : ''}${esc(t.nombre)}`.trim() || '<span style="color:var(--tenue)">(sin nombre)</span>';
  }
  return `<b>${apellidos}</b><br><span style="color:var(--tenue)">${esc(t.nombre)}${t.puesto ? ' · ' + esc(t.puesto) : ''}</span>`;
}

function ponVista(cual, repintar = true) {
  vista = cual;
  try { localStorage.setItem(VISTA, cual); } catch { /* da igual */ }
  $('#tabla-caja').classList.toggle('compacta', cual === 'compacta');
  $('#vista-completa').classList.toggle('activa', cual === 'completa');
  $('#vista-compacta').classList.toggle('activa', cual === 'compacta');
  if (repintar) pintar();
}

$('#vista-completa').addEventListener('click', () => ponVista('completa'));
$('#vista-compacta').addEventListener('click', () => ponVista('compacta'));

/* ─────────── el expediente de una persona, como ella lo ve ─────────── */
// Abrirlo desde el panel evita el ida y vuelta de "¿qué te falta?" por teléfono:
// se ve el formato completo, con lo que escribió y lo que no, y se puede capturar
// por ella lo que haga falta. Los documentos se ven pero no se tocan: subirlos y
// borrarlos sigue siendo cosa suya, y el servidor no tiene ninguna ruta que
// permita otra cosa.

let expAbierto = null;   // el trabajador que está en pantalla
let expAuto = null;      // el autoguardado de la ficha abierta
let expCampos = [];      // el catálogo de campos, como lo manda el servidor

const vent = () => $('#ventana-exp');

async function abrirExpediente(id) {
  vent().classList.remove('oculto');
  document.body.style.overflow = 'hidden';
  $('#exp-cuerpo').innerHTML = '<p class="ayuda">Cargando…</p>';
  $('#exp-titulo').textContent = 'Expediente';
  $('#exp-sub').textContent = '';
  try {
    const d = await api('/api/admin/trabajadores/' + id);
    expAbierto = d;
    expCampos = d.campos || [];
    pintarExpediente(d);
    if (puedo('capturar')) engancharAutoguardado(id);
    else for (const el of $('#exp-cuerpo').querySelectorAll('[data-c]')) el.disabled = true;
  } catch (e) {
    $('#exp-cuerpo').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
  }
}

function cerrarExpediente() {
  // Lo que esté a medias se manda antes de que la ficha desaparezca. Si no
  // hubiera señal, la copia local sigue ahí y se ofrece al volver a abrirla.
  if (expAuto && expAuto.hayPendiente()) expAuto.ahora();
  if (expAuto) { expAuto.soltar(); expAuto = null; }
  vent().classList.add('oculto');
  document.body.style.overflow = '';
  expAbierto = null;
}

function pintarExpediente(d) {
  const t = d.trabajador;
  const nom = [t.apellido_paterno, t.apellido_materno, t.nombre].filter(Boolean).join(' ').trim() || '(sin nombre)';
  $('#exp-titulo').textContent = nom;
  $('#exp-sub').innerHTML = `${esc(t.email)}${t.folio ? ' · folio ' + esc(t.folio) : ''} · ` +
    `<span class="etiqueta ${t.estado === 'completo' ? 'completo' : 'borrador'}">${t.estado === 'completo' ? 'Completo' : 'Pendiente'}</span>`;

  const faltanCampos = d.faltan_campos || [];
  const faltanDocs = d.faltantes || [];
  const porCampo = Object.fromEntries(faltanCampos.map((f) => [f.campo, f.porque]));

  // Lo que falta, hasta arriba: es la razón por la que se abre esta ventana.
  const resumen = (faltanCampos.length || faltanDocs.length)
    ? `<div class="aviso mal">
         <b>Le falta:</b>
         ${faltanCampos.length ? `<div style="margin-top:6px"><b>Por escribir</b> — ${esc(faltanCampos.map((f) => f.nombre).join(', '))}</div>` : ''}
         ${faltanDocs.length ? `<div style="margin-top:6px"><b>Por entregar</b> — ${esc(faltanDocs.join(', '))}</div>` : ''}
       </div>`
    : '<div class="aviso bien"><b>No le falta nada.</b> Tiene sus datos completos y entregó todos sus documentos.</div>';

  const aviso = d.aviso
    ? `<p class="ayuda">Aceptó el aviso de privacidad (versión ${esc(d.aviso.version)}).</p>`
    : '<div class="aviso mal">Todavía <b>no acepta el aviso de privacidad</b>. Eso solo lo puede hacer él desde su portal, y hasta entonces su expediente no puede darse por completo.</div>';

  // Los campos, en el mismo orden y con el mismo nombre que en su formato.
  const secciones = [];
  for (const c of expCampos) {
    let sec = secciones.find((x) => x.nombre === c.seccion);
    if (!sec) { sec = { nombre: c.seccion, campos: [] }; secciones.push(sec); }
    sec.campos.push(c);
  }

  const formulario = secciones.map((sec) => `
    <section class="exp-seccion">
      <h3>${esc(sec.nombre)}</h3>
      <div class="rejilla">
        ${sec.campos.map((c) => {
          const valor = t[c.campo] == null ? '' : String(t[c.campo]);
          const mal = porCampo[c.campo];
          const control = c.opciones
            ? `<select data-c="${esc(c.campo)}">
                 <option value="">¿Quién es de él?</option>
                 ${c.opciones.map((o) => `<option${o === valor ? ' selected' : ''}>${esc(o)}</option>`).join('')}
               </select>`
            : `<input data-c="${esc(c.campo)}" value="${esc(valor)}"${c.mayusculas ? ' style="text-transform:uppercase"' : ''}>`;
          return `<div class="campo${mal ? ' falta' : ''}">
            <label>${esc(c.nombre)}${c.opcional ? ' <span class="opc">(opcional)</span>' : ''}${c.pista ? ` <span class="opc">(${esc(c.pista)})</span>` : ''}</label>
            ${control}
            <div class="error" data-e="${esc(c.campo)}">${mal ? esc(mal) : ''}</div>
          </div>`;
        }).join('')}
      </div>
    </section>`).join('');

  // Los documentos: se ven, no se tocan.
  const hay = {};
  for (const doc of d.documentos || []) (hay[doc.tipo] ||= []).push(doc);
  const nombres = d.nombres_doc || {};
  const tipos = [...new Set([...(d.obligatorios || []), ...Object.keys(hay)])];
  const documentos = tipos.map((tipo) => {
    const entregados = hay[tipo] || [];
    const obligatorio = (d.obligatorios || []).includes(tipo);
    return `<div class="exp-doc${entregados.length ? '' : ' falta'}">
      <span class="exp-doc-nombre">${esc(nombres[tipo] || tipo)}${obligatorio ? '' : ' <span class="opc">(opcional)</span>'}</span>
      ${entregados.length
        ? entregados.map((doc) => `<a class="btn suave chico" target="_blank" rel="noopener" href="/api/docs/${esc(doc.id)}/archivo">Ver${doc.etiqueta ? ' · ' + esc(doc.etiqueta) : ''}</a>`).join(' ')
        : '<span class="exp-doc-falta">No lo ha subido</span>'}
    </div>`;
  }).join('');

  $('#exp-cuerpo').innerHTML = `
    ${resumen}
    ${aviso}
    <div id="exp-error"></div>
    ${formulario}
    <section class="exp-seccion">
      <h3>Documentos</h3>
      <p class="ayuda">Solo para verlos. Subir y borrar documentos lo hace él desde su portal: así el expediente sigue siendo suyo y queda claro quién entregó qué.</p>
      <div class="exp-docs">${documentos}</div>
    </section>`;
}

/* Aquí se captura el expediente de alguien más: alguien de oficina teclea a
   mano lo que el trabajador no subió. Es media pantalla de datos y hasta ahora
   solo se guardaba apretando el botón. Una pestaña cerrada, una sesión vencida
   o un cambio de app y se perdía todo, sin que quedara rastro de que existió. */
function engancharAutoguardado(id) {
  if (expAuto) expAuto.soltar();
  expAuto = Autoguardado({
    llave: 'roster101:expediente:' + id,
    ruta: '/api/admin/trabajadores/' + id,
    metodo: 'PUT',
    fechaServidor: () => (expAbierto && expAbierto.trabajador && expAbierto.trabajador.actualizado_en) || '',
    marca: (texto, clase) => {
      const p = $('#exp-aviso-guardado');
      if (p) p.innerHTML = `<span class="marca-guardado ${clase || ''}">${esc(texto)}</span>`;
    },
    recolectar: () => {
      const datos = { __parcial: true };
      for (const el of $('#exp-cuerpo').querySelectorAll('[data-c]')) datos[el.dataset.c] = el.value;
      return datos;
    },
    enviar: async (datos) => {
      const r = await api('/api/admin/trabajadores/' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
      });
      // Solo se refresca el encabezado y el estado. Volver a pintar la ficha
      // entera mientras alguien escribe le borraría el cursor de debajo de las
      // manos: eso se deja para cuando aprieta el botón a propósito.
      expAbierto = { ...expAbierto, trabajador: r.trabajador, faltan_campos: r.faltan_campos, faltantes: r.faltantes };
      return true;
    },
  });
  expAuto.vigilar($('#exp-cuerpo'));

  const rescatados = expAuto.recuperar((datos) => {
    let n = 0;
    for (const el of $('#exp-cuerpo').querySelectorAll('[data-c]')) {
      const v = datos[el.dataset.c];
      if (v == null || v === '' || v === el.value) continue;
      el.value = v; n++;
    }
    return n;
  });
  if (rescatados) {
    $('#exp-aviso-guardado').innerHTML =
      `<span class="marca-guardado trabajando">Recuperamos ${rescatados} dato${rescatados === 1 ? '' : 's'} que se habían capturado y no alcanzaron a guardarse.</span>`;
    expAuto.ahora();
  }
}

async function guardarExpediente() {
  if (!expAbierto) return;
  const b = $('#exp-guardar');
  const datos = { __parcial: true };
  for (const el of $('#exp-cuerpo').querySelectorAll('[data-c]')) datos[el.dataset.c] = el.value;

  b.disabled = true; b.textContent = 'Guardando…';
  $('#exp-aviso-guardado').textContent = '';
  try {
    const r = await api('/api/admin/trabajadores/' + expAbierto.trabajador.id, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
    });
    // Se vuelve a pintar con lo que contestó el servidor: así lo que se ve es lo
    // que de verdad quedó guardado, y lo que sigue faltando se actualiza solo.
    expAbierto = { ...expAbierto, trabajador: r.trabajador, faltan_campos: r.faltan_campos, faltantes: r.faltantes };
    pintarExpediente(expAbierto);
    const quedan = (r.faltan_campos || []).length;
    $('#exp-aviso-guardado').textContent = quedan
      ? `Guardado. Todavía le faltan ${quedan} dato${quedan === 1 ? '' : 's'}.`
      : 'Guardado. Ya no le falta ningún dato.';
    await cargar();
  } catch (e) {
    $('#exp-error').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
    if (e.datos && e.datos.errores) {
      for (const [campo, texto] of Object.entries(e.datos.errores)) {
        const caja = $('#exp-cuerpo').querySelector(`[data-e="${campo}"]`);
        if (caja) { caja.textContent = texto; caja.closest('.campo')?.classList.add('falta'); }
      }
    }
  } finally { b.disabled = false; b.textContent = 'Guardar lo que capturé'; }
}

$('#exp-cerrar').addEventListener('click', cerrarExpediente);
$('#exp-guardar').addEventListener('click', guardarExpediente);
vent().querySelector('.ventana-fondo').addEventListener('click', cerrarExpediente);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !vent().classList.contains('oculto')) cerrarExpediente(); });

/* ─────────── bitácora: todo lo que pasa, y qué se ve ─────────── */
// Se carga solo cuando se abre la tarjeta: es la única parte del panel que puede
// traer miles de renglones. Qué se ve lo deciden las casillas, no el servidor:
// de entrada viene prendida la única que casi siempre se consulta —quién pidió
// su código— y lo demás se palomea cuando hace falta.

let bitPagina = 0;
let bitRenglones = [];
let bitTipos = [];                     // el catálogo, tal como lo manda el servidor
let bitElegidas = null;                // se llena abajo con lo de la vez pasada, o con el default
const RECUERDO = 'roster101.bitacora.acciones';

// Fecha y hora en la del centro de México, que es la que ve quien lee el panel.
function fechaHora(iso) {
  const d = new Date(iso);
  const zona = { timeZone: 'America/Mexico_City' };
  const dia = d.toLocaleDateString('es-MX', { ...zona, day: '2-digit', month: 'short', year: 'numeric' });
  const hora = d.toLocaleTimeString('es-MX', { ...zona, hour: '2-digit', minute: '2-digit', hour12: true });
  return { dia, hora };
}

// Lo que se palomeó la última vez. Si el navegador no deja guardar, no pasa nada:
// se vuelve al default y la bitácora sigue sirviendo igual.
function recordar() {
  try { localStorage.setItem(RECUERDO, JSON.stringify([...bitElegidas])); } catch { /* da igual */ }
}
function recordado() {
  try {
    const v = JSON.parse(localStorage.getItem(RECUERDO) || 'null');
    return Array.isArray(v) ? v : null;
  } catch { return null; }
}

// Lo palomeado la vez pasada se lee antes de la primera consulta, para que la
// lista y las casillas nunca enseñen cosas distintas.
bitElegidas = recordado() ? new Set(recordado()) : null;

function filtrosBit() {
  const p = new URLSearchParams();
  p.set('dias', $('#bit-dias').value);
  // Sin nada palomeado no se pide nada: el servidor volvería al default y se
  // vería justo lo que se acaba de apagar.
  if (bitElegidas) p.set('acciones', [...bitElegidas].join(','));
  const q = $('#bit-buscar').value.trim();
  if (q) p.set('q', q);
  return p;
}

async function cargarBitacora(seguir = false) {
  const lista = $('#bit-lista');
  bitPagina = seguir ? bitPagina + 1 : 0;
  if (!seguir) { bitRenglones = []; lista.innerHTML = ''; $('#bit-resumen').textContent = 'Cargando…'; }

  // Nada palomeado: ni se pregunta, se dice y ya.
  if (bitElegidas && !bitElegidas.size) {
    bitRenglones = [];
    lista.innerHTML = '<p class="ayuda" style="margin:12px 0 0">No hay nada palomeado. Escoge arriba qué quieres ver.</p>';
    $('#bit-resumen').textContent = '';
    $('#bit-mas').classList.add('oculto');
    $('#bit-csv').classList.add('oculto');
    if (!bitTipos.length) { bitTipos = (await api('/api/admin/bitacora?dias=1&pagina=0')).tipos || []; pintarCasillas(); }
    return;
  }
  $('#bit-csv').classList.remove('oculto');

  const p = filtrosBit();
  $('#bit-csv').href = '/api/admin/bitacora.csv?' + p.toString();
  p.set('pagina', String(bitPagina));

  try {
    const d = await api('/api/admin/bitacora?' + p.toString());
    if (d.tipos && !bitTipos.length) { bitTipos = d.tipos; pintarCasillas(); }
    bitRenglones = bitRenglones.concat(d.renglones || []);
    pintarBitacora(d.total);
  } catch (e) {
    $('#bit-resumen').textContent = 'No se pudo leer la bitácora: ' + e.message;
  }
}

// Las casillas salen del catálogo del servidor, agrupadas como vienen.
function pintarCasillas() {
  if (!bitElegidas) bitElegidas = new Set(bitTipos.filter((t) => t.sola).map((t) => t.accion));
  else {
    // Si el catálogo cambió, lo que ya no existe se cae solo.
    const validas = new Set(bitTipos.map((t) => t.accion));
    bitElegidas = new Set([...bitElegidas].filter((a) => validas.has(a)));
  }
  const grupos = [];
  for (const t of bitTipos) {
    let g = grupos.find((x) => x.nombre === t.grupo);
    if (!g) { g = { nombre: t.grupo, tipos: [] }; grupos.push(g); }
    g.tipos.push(t);
  }
  $('#bit-tipos').innerHTML = grupos.map((g) => `
    <div class="grupo-tipos">
      <div class="etq-grupo">${esc(g.nombre)}</div>
      <div class="palomitas-campos">
        ${g.tipos.map((t) => `<label><input type="checkbox" class="bit-tipo" data-accion="${esc(t.accion)}"${bitElegidas.has(t.accion) ? ' checked' : ''}> ${esc(t.corto)}</label>`).join('')}
      </div>
    </div>`).join('');

  for (const casilla of document.querySelectorAll('.bit-tipo')) {
    casilla.addEventListener('change', () => {
      if (casilla.checked) bitElegidas.add(casilla.dataset.accion);
      else bitElegidas.delete(casilla.dataset.accion);
      recordar();
      cargarBitacora();
    });
  }
}

function marcarTodas(cuales) {
  bitElegidas = new Set(cuales);
  for (const c of document.querySelectorAll('.bit-tipo')) c.checked = bitElegidas.has(c.dataset.accion);
  recordar();
  cargarBitacora();
}

function pintarBitacora(total) {
  const lista = $('#bit-lista');
  if (!bitRenglones.length) {
    lista.innerHTML = '<p class="ayuda" style="margin:12px 0 0">No hay nada apuntado con esos filtros.</p>';
    $('#bit-resumen').textContent = '';
    $('#bit-mas').classList.add('oculto');
    return;
  }

  // Se agrupa por día: casi siempre lo que se busca es "¿quién pidió entrar el martes?"
  let diaAnterior = '';
  lista.innerHTML = bitRenglones.map((r) => {
    const { dia, hora } = fechaHora(r.cuando);
    const encabezado = dia === diaAnterior ? '' : `<div class="bit-dia">${esc(dia)}</div>`;
    diaAnterior = dia;
    return `${encabezado}
      <div class="bit-renglon ${esc(r.tono || '')}">
        <span class="bit-hora">${esc(hora)}</span>
        <span class="bit-quien">${esc(r.quien)}</span>
        <span class="bit-dice">${esc(r.dice)}${r.detalle ? ` <span class="bit-detalle">· ${esc(r.detalle)}</span>` : ''}</span>
      </div>`;
  }).join('');

  $('#bit-resumen').innerHTML = `<b>${bitRenglones.length}</b> de <b>${total}</b> movimientos.`;
  $('#bit-mas').classList.toggle('oculto', bitRenglones.length >= total);
}

$('#caja-bitacora').addEventListener('toggle', () => {
  if ($('#caja-bitacora').open && !bitRenglones.length && !bitTipos.length) cargarBitacora();
});
$('#bit-dias').addEventListener('change', () => cargarBitacora());
$('#bit-mas').addEventListener('click', () => cargarBitacora(true));
$('#bit-todo').addEventListener('click', () => marcarTodas(bitTipos.map((t) => t.accion)));
$('#bit-nada').addEventListener('click', () => marcarTodas([]));
$('#bit-normal').addEventListener('click', () => marcarTodas(bitTipos.filter((t) => t.sola).map((t) => t.accion)));

let esperaBusqueda;
$('#bit-buscar').addEventListener('input', () => {
  clearTimeout(esperaBusqueda);
  esperaBusqueda = setTimeout(() => cargarBitacora(), 350);
});
