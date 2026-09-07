/* roster101 — Administración */
'use strict';
const $ = (s) => document.querySelector(s);

const NOMBRES = {
  foto:'Foto', firma_bancaria:'Firma bancaria', ine:'INE frente', ine_reverso:'INE reverso', nss:'NSS',
  csf:'CSF', curp:'CURP', caratula:'Carátula', dc3:'DC-3', otro:'Otro',
};
const ORDEN = ['foto','firma_bancaria','ine','ine_reverso','nss','csf','curp','caratula','dc3','otro'];

let trabajadores = [];
const elegidos = new Set();

async function api(ruta, op = {}) {
  const r = await fetch(ruta, { credentials:'same-origin', ...op });
  let d = {}; try { d = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(d.error || 'Error'), { estado:r.status });
  return d;
}

$('#btn-entrar').addEventListener('click', async () => {
  const clave = $('#clave').value;
  $('#acc-error').textContent = '';
  const b = $('#btn-entrar'); b.disabled = true;
  try {
    await api('/api/admin/entrar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ clave }) });
    await abrir();
  } catch (e) { $('#acc-error').textContent = e.message; }
  finally { b.disabled = false; }
});
$('#clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-entrar').click(); });

$('#btn-salir').addEventListener('click', async () => { await api('/api/admin/salir', { method:'POST' }); location.reload(); });
$('#btn-refrescar').addEventListener('click', cargar);
$('#buscar').addEventListener('input', pintar);

async function abrir() {
  await cargar();                       // si no hay sesión, esto lanza 401 y no abrimos nada
  $('#acceso').classList.add('oculto');
  $('#panel').classList.remove('oculto');
  $('#btn-salir').classList.remove('oculto');
}

async function cargar() {
  const d = await api('/api/admin/trabajadores');
  trabajadores = d.trabajadores;
  const completos = trabajadores.filter((t) => t.estado === 'completo').length;
  $('#resumen').innerHTML = `<b>${trabajadores.length}</b> trabajadores registrados · <b>${completos}</b> con expediente completo · <b>${trabajadores.length - completos}</b> con pendientes.`;
  pintar();
  cargarDuplicados();
  cargarPapelera();
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
    cuerpo.innerHTML = '<tr><td colspan="10" class="centrado" style="padding:30px;color:var(--tenue)">Sin resultados.</td></tr>';
    return;
  }
  for (const t of lista) {
    const docs = t.documentos || [];
    const hay = {}; for (const d of docs) (hay[d.tipo] ||= []).push(d);
    const chips = ORDEN.filter((k) => hay[k]).map((k) =>
      hay[k].map((d) => `<a class="btn suave chico" style="margin:2px 2px 0 0" target="_blank" rel="noopener" href="/api/docs/${d.id}/archivo">${esc(NOMBRES[k])}</a>`).join('')
    ).join('');
    const falta = (t.faltantes || []).length;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="checkbox" class="palomita" data-id="${t.id}"${elegidos.has(t.id) ? ' checked' : ''}></td>
      <td class="mono">${t.folio ?? ''}</td>
      <td><b>${esc(t.apellido_paterno)} ${esc(t.apellido_materno)}</b><br><span style="color:var(--tenue)">${esc(t.nombre)}${t.puesto ? ' · ' + esc(t.puesto) : ''}</span></td>
      <td><span class="mono">${esc(t.celular)}</span><br><span style="color:var(--tenue);font-size:12px">${esc(t.email)}</span></td>
      <td class="mono">${esc(t.nss)}<br>${esc(t.curp)}</td>
      <td>${esc(t.banco)}<br><span class="mono" style="font-size:12px">${esc(t.clabe)}</span></td>
      <td>${esc(t.emerg_nombre)}${t.emerg_parentesco ? ` <span style="color:var(--tenue)">(${esc(t.emerg_parentesco)})</span>` : ''}<br><span class="mono" style="font-size:12px">${esc(t.emerg_telefono)}</span></td>
      <td class="celda-docs">${chips || '<span style="color:var(--tenue)">—</span>'}${falta ? `<details class="faltan"><summary>Faltan ${falta}</summary>${esc((t.faltantes||[]).join(', '))}</details>` : ''}</td>
      <td><span class="etiqueta ${t.estado === 'completo' ? 'completo' : 'borrador'}">${t.estado === 'completo' ? 'Completo' : 'Pendiente'}</span></td>
      <td><button class="btn peligro chico" data-baja="${t.id}">Baja</button></td>`;
    cuerpo.appendChild(tr);
  }
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
        <button class="btn suave chico" data-restaurar="${t.id}" data-nombre="${esc(nom)}">↩ Devolver</button>
        <button class="btn peligro chico" data-purgar="${t.id}" data-nombre="${esc(nom)}">Borrar ya</button>
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

(async () => { pintarMarca(); try { await abrir(); } catch {} })();

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
