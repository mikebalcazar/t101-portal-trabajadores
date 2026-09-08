/* roster101 — registro de la empresa
 *
 * El mismo trato que el portal de trabajadores: se entra con un correo y un
 * código, se guarda solo mientras se escribe, y los documentos se suben con la
 * cámara del celular. Lo que cambia es quién llena y qué se le pide.
 */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const CAMPOS = ['nombre', 'razon_social', 'rfc', 'telefono', 'domicilio',
  'representante', 'cargo', 'correo_privacidad', 'correo_avisos'];

const OBLIGATORIOS = ['nombre', 'razon_social', 'rfc', 'telefono', 'domicilio',
  'representante', 'correo_privacidad'];

let estado = { empresa: null, documentos: [], faltantes: [] };
let config = null;
let cambiosPendientes = false;
let avisoTemporizador = null;
let marcaTemporizador = null;

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { credentials: 'same-origin', ...opciones });
  const tipo = r.headers.get('Content-Type') || '';
  const datos = tipo.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) {
    const e = new Error(datos.error || 'Algo salió mal. Inténtenlo otra vez.');
    e.datos = datos; e.estado = r.status;
    throw e;
  }
  return datos;
}

function aviso(texto, clase = 'info', mover = true) {
  const caja = $('#aviso-global');
  caja.innerHTML = `<div class="aviso ${clase}" style="margin:14px 0 0">${texto}</div>`;
  clearTimeout(avisoTemporizador);
  if (clase === 'bien') avisoTemporizador = setTimeout(() => { caja.innerHTML = ''; }, 5000);
  if (mover) caja.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function ocupado(btn, si, textoOriginal) {
  btn.disabled = si;
  if (si) { btn.dataset.txt = btn.innerHTML; btn.innerHTML = '<span class="cargando"></span> Espera…'; }
  else { btn.innerHTML = textoOriginal || btn.dataset.txt || btn.innerHTML; }
}

const soloNum = (v) => String(v || '').replace(/\D/g, '');
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ─────────── acceso ─────────── */

$('#btn-codigo').addEventListener('click', async () => {
  const b = $('#btn-codigo'); ocupado(b, true);
  const email = $('#acc-email').value.trim();
  $('[data-e="email"]').textContent = '';
  try {
    await api('/api/codigo', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    $('#paso-codigo').classList.remove('oculto');
    $('#acc-codigo').focus();
    $('#aviso-acceso').innerHTML = '<div class="aviso bien">Les mandamos el código. Revisen su correo; a veces tarda un minuto.</div>';
  } catch (e) {
    $('[data-e="email"]').textContent = e.message;
  } finally { ocupado(b, false, 'Enviarme el código'); }
});

$('#acc-codigo').addEventListener('input', (e) => { e.target.value = soloNum(e.target.value).slice(0, 6); });

$('#btn-entrar').addEventListener('click', async () => {
  const b = $('#btn-entrar'); ocupado(b, true);
  try {
    await api('/api/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('#acc-email').value.trim(), codigo: $('#acc-codigo').value.trim() }),
    });
    await abrirPanel();
  } catch (e) {
    $('#aviso-acceso').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
  } finally { ocupado(b, false, 'Entrar'); }
});

$('#btn-salir').addEventListener('click', async () => {
  await api('/api/salir', { method: 'POST' }).catch(() => {});
  location.reload();
});

/* ─────────── el registro ─────────── */

async function abrirPanel() {
  const r = await api('/api/yo');
  estado = { empresa: r.empresa, documentos: r.documentos, faltantes: r.faltantes };
  $('#acceso').classList.add('oculto');
  $('#panel').classList.remove('oculto');
  $('#btn-salir').classList.remove('oculto');
  $('#quien').textContent = estado.empresa.nombre || estado.empresa.correo_contacto;
  llenarFormulario();
  pintarDocumentos();
  pintarNota();
  actualizarProgreso();
  recuperarLoNoGuardado();
}

/* Si la vez pasada se escribió algo y no alcanzó a subir -- se fue la señal, se
   cerró la pestaña, venció la sesión -- está en el aparato. Se pone en los
   campos y se manda, y se avisa: que se vea que no se perdió. */
async function recuperarLoNoGuardado() {
  const n = auto.recuperar((datos) => {
    let cambios = 0;
    for (const c of CAMPOS) {
      const el = $(`#f-${c}`);
      const v = datos[c];
      if (!el || v == null || v === '' || v === (estado.empresa[c] || '')) continue;
      el.value = v; cambios++;
    }
    return cambios;
  });
  if (!n) return;
  cambiosPendientes = true;
  actualizarProgreso();
  await guardarAvance();
  aviso(`Recuperamos <b>${n} dato${n === 1 ? '' : 's'}</b> que habían escrito y no alcanzaron a guardarse. Ya quedaron.`, 'bien');
}

function llenarFormulario() {
  for (const c of CAMPOS) {
    const el = $(`#f-${c}`);
    if (el) el.value = estado.empresa[c] || '';
  }
}

function recolectar() {
  const d = {};
  for (const c of CAMPOS) { const el = $(`#f-${c}`); if (el) d[c] = el.value.trim(); }
  d.rfc = (d.rfc || '').toUpperCase();
  d.telefono = soloNum(d.telefono);
  return d;
}

function pintarErrores(errores = {}) {
  $$('[data-e]').forEach((el) => { el.textContent = ''; });
  $$('[data-c]').forEach((el) => el.classList.remove('mal'));
  let primero = null;
  for (const [campo, msg] of Object.entries(errores)) {
    const e = document.querySelector(`[data-e="${campo}"]`);
    const i = document.querySelector(`[data-c="${campo}"]`);
    if (e) e.textContent = msg;
    if (i) { i.classList.add('mal'); primero = primero || i; }
  }
  if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// Lo que roster101 les pidió corregir, si algo.
function pintarNota() {
  const caja = $('#nota-roster');
  const nota = (estado.empresa.nota || '').trim();
  const regresada = nota && estado.empresa.estado === 'llenando' && estado.empresa.enviado_en;
  caja.classList.toggle('oculto', !regresada);
  if (regresada) caja.innerHTML = `<b>Nos falta corregir esto:</b> ${esc(nota)}`;
}

function actualizarProgreso() {
  const d = recolectar();
  const docsObl = (config?.obligatorios || []).length || 3;
  const hay = new Set(estado.documentos.map((x) => x.tipo));
  const docsListos = (config?.obligatorios || []).filter((t) => hay.has(t)).length;
  const llenos = OBLIGATORIOS.filter((k) => d[k]).length;
  const total = OBLIGATORIOS.length + docsObl;
  const pct = Math.round(((llenos + docsListos) / total) * 100);
  $('#barra-progreso').style.width = pct + '%';

  const enviado = estado.empresa.estado === 'completa' || estado.empresa.estado === 'revisada' || estado.empresa.estado === 'activa';
  const etq = $('#etiqueta-estado');
  etq.textContent = enviado ? 'Enviado' : (pct === 100 ? 'Listo para enviar' : 'Incompleto');
  etq.className = 'etiqueta ' + (enviado || pct === 100 ? 'completo' : 'borrador');

  const faltan = estado.faltantes || [];
  $('#texto-progreso').innerHTML = enviado
    ? 'Ya lo revisamos nosotros. Les avisamos en cuanto su portal esté abierto.'
    : (faltan.length
      ? `Llevan <b>${pct}%</b>. Falta: ${esc(faltan.join(', '))}.`
      : `Llevan <b>${pct}%</b>. Ya pueden enviarlo.`);
  $('#btn-terminar').disabled = enviado || faltan.length > 0;
}

/* ─────────── documentos ─────────── */

function docsDe(tipo) { return estado.documentos.filter((d) => d.tipo === tipo); }

function pintarDocumentos() {
  const cont = $('#lista-docs');
  cont.innerHTML = '';
  for (const def of (config?.docs || [])) {
    const mios = docsDe(def.tipo);
    const listo = mios.length > 0;
    const fila = document.createElement('div');
    fila.className = 'doc' + (listo ? ' listo' : '');
    fila.innerHTML = `
      <div class="marca">${listo ? '✓' : (def.obligatorio ? '!' : '+')}</div>
      <div class="info">
        <b>${esc(def.nombre)}${def.obligatorio ? '' : ' <span class="opc" style="font-weight:500;color:var(--tenue)">(opcional)</span>'}</b>
        <small class="pista">${esc(def.pista || '')}</small>
        <div class="archivos"></div>
      </div>
      <div class="acciones"></div>`;

    const archivos = fila.querySelector('.archivos');
    for (const doc of mios) {
      const renglon = document.createElement('div');
      renglon.className = 'archivo';
      renglon.innerHTML = `<a class="nombre" href="/api/docs/${doc.id}/archivo" target="_blank" rel="noopener">${esc(doc.nombre_archivo)}</a>`;
      const quitar = document.createElement('button');
      quitar.className = 'btn suave chico';
      quitar.textContent = 'Quitar';
      quitar.onclick = () => borrarDoc(doc.id);
      renglon.appendChild(quitar);
      archivos.appendChild(renglon);
    }

    const acciones = fila.querySelector('.acciones');
    const camara = document.createElement('button');
    camara.className = 'btn primario chico';
    const esTarjeta = def.captura === 'tarjeta';
    camara.textContent = def.captura
      ? (esTarjeta ? (listo && !def.multiple ? '📷 Cambiar' : '📷 Tomar') : '📄 Escanear')
      : '📷 Tomar';
    camara.onclick = async () => {
      if (!def.captura) { pedirArchivo(def, true); return; }
      let etiqueta = '';
      if (def.tipo === 'otro') etiqueta = prompt('¿Qué documento es?') || 'Otro documento';
      const archivo = await Escaner.capturar({
        tipo: esTarjeta ? 'tarjeta' : 'hoja',
        titulo: def.nombre,
        nombre: def.tipo,
        pista: esTarjeta ? 'Encuadra la identificación dentro del marco'
                         : 'Pon el documento sobre una mesa y encuádralo',
      });
      if (archivo) await subir(def.tipo, archivo, etiqueta);
    };
    const archivo = document.createElement('button');
    archivo.className = 'btn suave chico';
    archivo.textContent = '📁';
    archivo.title = 'Subir un archivo que ya tengan';
    archivo.onclick = () => pedirArchivo(def, false);
    acciones.append(camara, archivo);

    cont.appendChild(fila);
  }
}

function pedirArchivo(def, camara) {
  const entrada = $('#entrada-doc');
  entrada.value = '';
  if (camara) entrada.setAttribute('capture', 'environment'); else entrada.removeAttribute('capture');
  entrada.onchange = async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    let etiqueta = '';
    if (def.tipo === 'otro') etiqueta = prompt('¿Qué documento es?') || 'Otro documento';
    if (archivo.type.startsWith('image/')) await subirImagen(def.tipo, archivo, etiqueta);
    else await subir(def.tipo, archivo, etiqueta);
  };
  entrada.click();
}

// Las fotos se encogen antes de subirlas: en el celular una foto cruda son
// varios megas y no hace falta tanto para leer una constancia.
async function subirImagen(tipo, archivo, etiqueta = '', ladoMayor = 1800) {
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, ladoMayor / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala), h = Math.round(bitmap.height * escala);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    cv.getContext('2d').drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.86));
    await subir(tipo, new File([blob], `${tipo}.jpg`, { type: 'image/jpeg' }), etiqueta);
  } catch {
    await subir(tipo, archivo, etiqueta);
  }
}

async function subir(tipo, archivo, etiqueta = '') {
  if (archivo.size > 10 * 1024 * 1024) { aviso('Ese archivo pesa más de 10 MB.', 'mal'); return; }
  aviso('Subiendo…', 'info', false);
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('etiqueta', etiqueta);
  fd.append('archivo', archivo, archivo.name || `${tipo}.jpg`);
  try {
    const r = await api('/api/docs', { method: 'POST', body: fd });
    estado.documentos = r.documentos; estado.faltantes = r.faltantes;
    pintarDocumentos(); actualizarProgreso();
    aviso('Listo, se guardó.', 'bien', false);
  } catch (e) { aviso(e.message, 'mal'); }
}

async function borrarDoc(id) {
  if (!confirm('¿Quitar este documento?')) return;
  try {
    const r = await api(`/api/docs/${id}`, { method: 'DELETE' });
    estado.documentos = r.documentos; estado.faltantes = r.faltantes;
    pintarDocumentos(); actualizarProgreso();
  } catch (e) { aviso(e.message, 'mal'); }
}

/* ─────────── guardado ─────────── */

function marcaGuardado(texto, clase = '') {
  const p = $('#pista-guardado');
  if (!p) return;
  p.classList.remove('inicial');
  p.innerHTML = `<span class="marca-guardado ${clase}">${texto}</span>`;
  clearTimeout(marcaTemporizador);
  if (!clase) marcaTemporizador = setTimeout(() => { p.innerHTML = ''; }, 5000);
}

/* El temporizador estaba aquí a mano y solo cubría el caso fácil: que dejen de
   escribir. Faltaba lo demás -- copia en el aparato, envío al cerrar con
   keepalive, reintento al volver la señal -- que es justo lo que salva los
   datos cuando la conexión falla. Ahora lo pone la pieza compartida, la misma
   que usa el portal del trabajador. */
const auto = Autoguardado({
  llave: 'roster101:central:' + (location.host || ''),
  ruta: '/api/yo',
  metodo: 'PUT',
  fechaServidor: () => (estado.empresa && estado.empresa.actualizado_en) || '',
  marca: marcaGuardado,
  recolectar,
  enviar: async (datos) => {
    datos.__parcial = true;
    const r = await api('/api/yo', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
    });
    estado.empresa = r.empresa; estado.faltantes = r.faltantes;
    pintarErrores({});
    actualizarProgreso();
    return true;
  },
});

function programarGuardado() {
  cambiosPendientes = true;
  auto.programar();
}

async function guardar(parcial) {
  const cuerpo = recolectar();
  cuerpo.__parcial = parcial;
  try {
    const r = await api('/api/yo', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    estado.empresa = r.empresa; estado.faltantes = r.faltantes;
    pintarErrores({});
    actualizarProgreso();
    return true;
  } catch (e) {
    if (e.datos && e.datos.errores) { pintarErrores(e.datos.errores); aviso('Revisen los campos marcados en rojo.', 'mal'); }
    else aviso(e.message, 'mal');
    return false;
  }
}

async function guardarAvance() {
  if (cambiosPendientes) auto.marcarPendiente();
  const quedo = await auto.ahora();
  if (quedo) cambiosPendientes = false;
  return quedo;
}

$$('[data-c]').forEach((el) => {
  el.addEventListener('input', actualizarProgreso);
  el.addEventListener('change', actualizarProgreso);
});
// input, change, blur, salida con keepalive y reintento: todo lo pone la pieza.
auto.vigilar(document);

$('#btn-avance').addEventListener('click', async () => {
  const b = $('#btn-avance'); ocupado(b, true);
  cambiosPendientes = true;
  await guardarAvance();
  ocupado(b, false);
  aviso('Guardado. Pueden cerrar y volver cuando quieran con el mismo correo.', 'bien');
});

$('#btn-terminar').addEventListener('click', async () => {
  const b = $('#btn-terminar'); ocupado(b, true);
  const ok = await guardar(false);
  if (ok) {
    cambiosPendientes = false;
    try {
      await api('/api/terminar', { method: 'POST' });
      estado.empresa.estado = 'completa';
      actualizarProgreso();
      aviso('Recibido. Lo revisamos y les avisamos en cuanto su portal esté abierto.', 'bien');
    } catch (e) {
      if (e.datos && e.datos.faltantes) aviso('Todavía falta: ' + esc(e.datos.faltantes.join(', ')), 'mal');
      else aviso(e.message, 'mal');
    }
  }
  ocupado(b, false);
});

/* ─────────── arranque ─────────── */

async function cargarConfig() {
  if (!config) config = await api('/api/config');
  return config;
}

(async function arranque() {
  try {
    const c = await cargarConfig();
    if (c.version) { $('#version').textContent = 'v' + c.version; $('#version').classList.remove('oculto'); }
  } catch { /* sin configuración, se sigue */ }
  try { await abrirPanel(); }
  catch { pintarDocumentos(); /* sin sesión: se queda en la pantalla de acceso */ }
})();
