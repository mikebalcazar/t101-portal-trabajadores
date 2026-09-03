/* Portal de Trabajadores — Taller 101 */
'use strict';

const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

const CAMPOS = ['nombre','apellido_paterno','apellido_materno','celular','puesto','nss','curp','rfc',
  'banco','clabe','beneficiario','emerg_nombre','emerg_telefono','emerg_email'];

const DOCS = [
  { tipo:'ine',         nombre:'Identificación — FRENTE',  pista:'El lado de tu foto. Sin reflejos y que se lean las letras.', obligatorio:true },
  { tipo:'ine_reverso', nombre:'Identificación — REVERSO', pista:'El lado del código de barras. Si usas pasaporte, sube otra vez la hoja de datos.', obligatorio:true },
  { tipo:'nss',      nombre:'Constancia de NSS',            pista:'La que descargas del IMSS',          obligatorio:true },
  { tipo:'csf',      nombre:'Cédula de Situación Fiscal',   pista:'La constancia del SAT, actualizada', obligatorio:true },
  { tipo:'curp',     nombre:'CURP impresa',                 pista:'La versión con código QR',           obligatorio:true },
  { tipo:'caratula', nombre:'Carátula de cuenta bancaria',  pista:'Donde se vea tu nombre y la CLABE',  obligatorio:true },
  { tipo:'dc3',      nombre:'Certificación DC-3',           pista:'Si tienes más de una, súbelas todas', obligatorio:false, multiple:true },
  { tipo:'otro',     nombre:'Otro documento',               pista:'Contrato, certificado, lo que te pidan', obligatorio:false, multiple:true },
];

let estado = { trabajador:null, documentos:[], faltantes:[] };
let cargando = false;

/* ─────────── utilidades ─────────── */

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { credentials:'same-origin', ...opciones });
  let datos = {};
  try { datos = await r.json(); } catch {}
  if (!r.ok) throw Object.assign(new Error(datos.error || 'Algo salió mal'), { estado:r.status, datos });
  return datos;
}

function aviso(texto, clase = 'info') {
  const caja = $('#aviso-global');
  caja.innerHTML = `<div class="aviso ${clase}" style="margin:14px 0 0">${texto}</div>`;
  if (clase === 'bien') setTimeout(() => { if (caja.textContent.includes(texto.replace(/<[^>]+>/g,'').slice(0,20))) caja.innerHTML=''; }, 9000);
  caja.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function ocupado(btn, si, textoOriginal) {
  btn.disabled = si;
  if (si) { btn.dataset.txt = btn.innerHTML; btn.innerHTML = '<span class="cargando"></span> Espera…'; }
  else { btn.innerHTML = textoOriginal || btn.dataset.txt || btn.innerHTML; }
}

const soloNum = (v) => String(v||'').replace(/\D/g,'');
const pesos = [3,7,1];
function clabeOk(c){ if(!/^\d{18}$/.test(c)) return false; let s=0; for(let i=0;i<17;i++) s+=((+c[i]*pesos[i%3])%10); return ((10-(s%10))%10)===+c[17]; }
function curpOk(c){
  if(!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/.test(c)) return false;
  const d='0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ'; let s=0;
  for(let i=0;i<17;i++) s+=d.indexOf(c[i])*(18-i);
  return String((10-(s%10))%10)===c[17];
}

/* ─────────── acceso ─────────── */

let correoEnCurso = '';

$('#btn-codigo').addEventListener('click', async () => {
  const email = $('#acc-email').value.trim().toLowerCase();
  $('#acc-error').textContent = '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { $('#acc-error').textContent = 'Escribe un correo válido.'; return; }
  const b = $('#btn-codigo'); ocupado(b, true);
  try {
    await api('/api/codigo', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email }) });
    correoEnCurso = email;
    $('#eco-email').textContent = email;
    $('#paso-correo').classList.add('oculto');
    $('#paso-codigo').classList.remove('oculto');
    $('#acc-codigo').focus();
  } catch (e) { $('#acc-error').textContent = e.message; }
  finally { ocupado(b, false, 'Enviarme el código'); }
});

$('#acc-email').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-codigo').click(); });
$('#acc-codigo').addEventListener('input', (e) => {
  e.target.value = soloNum(e.target.value).slice(0,6);
  if (e.target.value.length === 6) $('#btn-entrar').click();
});

$('#btn-entrar').addEventListener('click', async () => {
  const codigo = soloNum($('#acc-codigo').value);
  $('#cod-error').textContent = '';
  if (codigo.length !== 6) { $('#cod-error').textContent = 'El código son 6 dígitos.'; return; }
  const b = $('#btn-entrar'); ocupado(b, true);
  try {
    await api('/api/entrar', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ email:correoEnCurso, codigo }) });
    await abrirPanel();
  } catch (e) { $('#cod-error').textContent = e.message; $('#acc-codigo').value=''; }
  finally { ocupado(b, false, 'Entrar'); }
});

$('#btn-otro-correo').addEventListener('click', () => {
  $('#paso-codigo').classList.add('oculto');
  $('#paso-correo').classList.remove('oculto');
  $('#acc-codigo').value = '';
});

$('#btn-salir').addEventListener('click', async () => {
  await api('/api/salir', { method:'POST' }).catch(()=>{});
  location.reload();
});

/* ─────────── aviso de privacidad ───────────
   Obligatorio por la Ley Federal de Protección de Datos Personales en Posesión de
   los Particulares. El texto se arma con los datos del responsable que vienen del
   servidor, para que montarle el portal a otro negocio sea cambiar wrangler.toml. */

let config = null;

async function cargarConfig() {
  if (!config) config = await api('/api/config');
  return config;
}

function textoAviso(c) {
  const emp = c.razon_social || c.empresa;
  return `
<h3>1. Quién es responsable de tus datos</h3>
<p><b>${emp}</b>${c.domicilio ? `, con domicilio en ${c.domicilio}` : ''}, es la responsable de
guardar y usar los datos personales que captures en este portal.</p>
<p>Para cualquier cosa relacionada con tus datos, escribe a
<a href="mailto:${c.correo_privacidad}">${c.correo_privacidad}</a>.</p>

<h3>2. Qué datos te pedimos</h3>
<ul>
  <li>Nombre completo y apellidos.</li>
  <li>Teléfono celular y correo electrónico.</li>
  <li>CURP, Número de Seguro Social (NSS) y RFC.</li>
  <li>Banco, CLABE y nombre del beneficiario de la cuenta donde te pagamos.</li>
  <li>Tu fotografía.</li>
  <li>Nombre, teléfono y correo de tu contacto de emergencia.</li>
  <li>Copias de tu identificación, constancias del IMSS y del SAT, CURP, carátula del banco
      y, si aplica, tu certificación DC-3.</li>
</ul>
<div class="fuerte"><b>No te pedimos datos sensibles.</b> Nada de salud, religión, ideas
políticas, origen étnico, afiliación sindical ni preferencias. Si algún día llegara a hacer
falta alguno, se te pediría aparte y con tu permiso expreso.</div>

<h3>3. Para qué los usamos</h3>
<p>Solo para lo necesario de tu relación de trabajo con ${emp}:</p>
<ul>
  <li>Integrar y mantener tu expediente laboral.</li>
  <li>Pagarte por transferencia a tu cuenta.</li>
  <li>Darte de alta y cumplir ante el IMSS, el SAT y el Infonavit.</li>
  <li>Cumplir obligaciones de capacitación (la DC-3) y de seguridad e higiene.</li>
  <li>Localizar a tu contacto de emergencia si te pasa algo en el trabajo.</li>
</ul>
<div class="fuerte"><b>No hay otros usos.</b> Tus datos no se venden, no se rentan, no se usan
para publicidad y no se comparten con nadie que no esté en la lista de abajo.</div>

<h3>4. Con quién los compartimos</h3>
<p>Únicamente con quien hace falta para lo de arriba:</p>
<ul>
  <li><b>IMSS, SAT e Infonavit</b>, porque la ley obliga a ${emp} a reportarles.</li>
  <li><b>El banco</b>, para poder depositarte.</li>
  <li><b>El despacho contable</b> que lleva la nómina de ${emp}, obligado a guardar la misma
      confidencialidad.</li>
  <li><b>Autoridades</b>, cuando una orden legal lo exija.</li>
</ul>
<p>Estas transferencias no necesitan tu permiso aparte: la ley las permite porque son
necesarias para cumplir la relación laboral y las obligaciones que de ella nacen.</p>

<h3>5. Dónde se guardan</h3>
<p>En servidores de <b>Cloudflare</b>, que ${emp} contrata como proveedor de tecnología.
Eso implica que la información puede almacenarse fuera de México. Cloudflare solo puede
usarla para prestar el servicio, no para fines propios.</p>
<p>El acceso está protegido con código de un solo uso enviado a tu correo. Tus documentos
no tienen dirección pública: solo se pueden ver desde adentro del portal, y únicamente tú
y el personal de administración de ${emp} pueden verlos.</p>

<h3>6. Tus derechos</h3>
<p>Sobre tus datos personales tienes cuatro derechos, conocidos como <b>ARCO</b>:</p>
<ul>
  <li><b>Acceso:</b> saber qué tenemos tuyo y pedir copia.</li>
  <li><b>Rectificación:</b> corregir lo que esté mal o incompleto. Esto lo puedes hacer tú
      mismo aquí en el portal, cuando quieras.</li>
  <li><b>Cancelación:</b> pedir que borremos tus datos.</li>
  <li><b>Oposición:</b> pedir que dejemos de usarlos para algo en particular.</li>
</ul>
<p>Para ejercerlos, escribe a <a href="mailto:${c.correo_privacidad}">${c.correo_privacidad}</a>
diciendo qué quieres y adjuntando una identificación que compruebe que eres tú.
Te contestamos en un máximo de <b>20 días hábiles</b>, sin costo.</p>
<p>Ten en cuenta que hay datos que ${emp} está obligada por ley a conservar cierto tiempo
—los de nómina, IMSS y SAT—, aunque pidas su cancelación. En ese caso te explicaremos
cuáles son y hasta cuándo.</p>

<h3>7. Cómo retirar tu consentimiento</h3>
<p>Puedes retirarlo cuando quieras, por el mismo correo. Si lo haces, ${emp} dejará de usar
tus datos salvo en lo que la ley la obligue a seguir conservándolos.</p>

<h3>8. Si algo no te parece</h3>
<p>Si consideras que tu derecho a la protección de datos fue vulnerado, puedes acudir a la
<b>Secretaría Anticorrupción y Buen Gobierno</b>, que es la autoridad federal en la materia
desde 2025.</p>

<h3>9. Cambios a este aviso</h3>
<p>Si cambia, te lo mostraremos aquí mismo la próxima vez que entres y te pediremos que lo
aceptes de nuevo. No hay cambios silenciosos.</p>

<p class="sello">Versión ${c.aviso_version} · Aviso puesto a tu disposición en el momento en
que se recaban tus datos, conforme a la Ley Federal de Protección de Datos Personales en
Posesión de los Particulares.</p>`;
}

async function mostrarAviso(soloLectura = false) {
  const c = await cargarConfig();
  $('#texto-aviso').innerHTML = textoAviso(c);
  $('#eco-empresa').textContent = c.razon_social || c.empresa;
  $('#aviso-error').textContent = '';
  $('#chk-aviso').checked = false;
  $('#acceso').classList.add('oculto');
  $('#panel').classList.add('oculto');
  $('#aviso').classList.remove('oculto');
  // Cuando solo lo vienen a releer, no tiene caso volver a pedir que lo acepten.
  $('#chk-aviso').closest('.acepto').classList.toggle('oculto', soloLectura);
  $('#btn-aceptar-aviso').textContent = soloLectura ? 'Volver a mi expediente' : 'Acepto y continúo';
  $('#btn-aceptar-aviso').dataset.solo = soloLectura ? '1' : '';
  $('#btn-rechazar-aviso').classList.toggle('oculto', soloLectura);
  window.scrollTo(0, 0);
}

$('#btn-aceptar-aviso').addEventListener('click', async () => {
  const b = $('#btn-aceptar-aviso');
  if (b.dataset.solo) { $('#aviso').classList.add('oculto'); $('#panel').classList.remove('oculto'); return; }
  if (!$('#chk-aviso').checked) {
    $('#aviso-error').textContent = 'Marca la casilla para poder continuar.';
    return;
  }
  ocupado(b, true);
  try {
    await api('/api/aviso', { method: 'POST' });
    $('#aviso').classList.add('oculto');
    await abrirPanel();
  } catch (e) {
    $('#aviso-error').textContent = e.message;
  } finally { ocupado(b, false, 'Acepto y continúo'); }
});

$('#btn-rechazar-aviso').addEventListener('click', async () => {
  if (!confirm('Sin aceptar el aviso no podemos guardar tus datos. ¿Salir del portal?')) return;
  await api('/api/salir', { method: 'POST' }).catch(() => {});
  location.reload();
});

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'ver-aviso') { e.preventDefault(); mostrarAviso(true); }
});

/* ─────────── panel ─────────── */

async function abrirPanel() {
  const datos = await api('/api/yo');
  estado = datos;
  if (!datos.aviso) { await mostrarAviso(false); return; }
  $('#acceso').classList.add('oculto');
  $('#aviso').classList.add('oculto');
  $('#panel').classList.remove('oculto');
  $('#btn-salir').classList.remove('oculto');
  $('#quien').textContent = estado.trabajador.email;
  llenarFormulario();
  pintarDocumentos();
  pintarFoto();
  actualizarProgreso();
  window.scrollTo(0,0);
}

function llenarFormulario() {
  for (const c of CAMPOS) {
    const el = $(`#f-${c}`);
    if (el) el.value = estado.trabajador[c] || '';
  }
  pintarFirma();
}

function recolectar() {
  const d = {};
  for (const c of CAMPOS) { const el = $(`#f-${c}`); if (el) d[c] = el.value.trim(); }
  d.celular = soloNum(d.celular);
  d.emerg_telefono = soloNum(d.emerg_telefono);
  d.nss = soloNum(d.nss);
  d.clabe = soloNum(d.clabe);
  d.curp = (d.curp||'').toUpperCase();
  d.rfc = (d.rfc||'').toUpperCase();
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
  if (primero) primero.scrollIntoView({ behavior:'smooth', block:'center' });
}

function actualizarProgreso() {
  const d = recolectar();
  const obligatorios = ['nombre','apellido_paterno','apellido_materno','celular','nss','curp','banco','clabe','beneficiario','emerg_nombre','emerg_telefono'];
  const llenos = obligatorios.filter((k) => d[k]).length;
  const docsObl = DOCS.filter((x) => x.obligatorio).length + 2; // + foto + firma
  const hay = new Set(estado.documentos.map((x) => x.tipo));
  const docsListos = DOCS.filter((x) => x.obligatorio && hay.has(x.tipo)).length
    + (hay.has('foto') ? 1 : 0) + (hay.has('firma_bancaria') ? 1 : 0);
  const total = obligatorios.length + docsObl;
  const pct = Math.round(((llenos + docsListos) / total) * 100);
  $('#barra-progreso').style.width = pct + '%';
  const faltan = estado.faltantes || [];
  const completo = pct === 100 && faltan.length === 0;
  $('#etiqueta-estado').textContent = completo ? 'Completo' : 'Incompleto';
  $('#etiqueta-estado').className = 'etiqueta ' + (completo ? 'completo' : 'borrador');
  $('#texto-progreso').innerHTML = completo
    ? 'Tu expediente está completo. Gracias.'
    : `Llevas <b>${pct}%</b>. ${faltan.length ? 'Falta subir: ' + faltan.join(', ') + '.' : 'Termina de llenar los datos.'}`;
}

$$('[data-c]').forEach((el) => {
  el.addEventListener('input', () => { actualizarProgreso(); pintarFirma(); programarGuardado(); });
  el.addEventListener('blur', () => { if (cambiosPendientes) guardarAvance(); });
});

/* El contacto de emergencia con el mismo teléfono del trabajador no sirve de
   nada: si a él le pasa algo, ese número es justo el que no contesta. El
   servidor lo rechaza al guardar; aquí se avisa al momento para que no se
   entere hasta el final. */
const MSG_MISMO_TEL = 'Pon el teléfono de la otra persona, no el tuyo: si te pasa algo, tu propio celular es el que no va a contestar.';

function revisarTelefonoEmergencia() {
  const propio = soloNum($('#f-celular').value);
  const otro = soloNum($('#f-emerg_telefono').value);
  const caja = document.querySelector('[data-e="emerg_telefono"]');
  const campo = $('#f-emerg_telefono');
  if (propio && otro && propio === otro) {
    caja.textContent = MSG_MISMO_TEL;
    campo.classList.add('mal');
  } else if (caja.textContent === MSG_MISMO_TEL) {
    caja.textContent = '';
    campo.classList.remove('mal');
  }
}

['#f-celular', '#f-emerg_telefono'].forEach((sel) => {
  $(sel).addEventListener('input', revisarTelefonoEmergencia);
});

/* ─────────── documentos ─────────── */

function docsDe(tipo) { return estado.documentos.filter((d) => d.tipo === tipo); }

function pintarDocumentos() {
  const cont = $('#lista-docs');
  cont.innerHTML = '';
  for (const def of DOCS) {
    const mios = docsDe(def.tipo);
    const listo = mios.length > 0;
    const fila = document.createElement('div');
    fila.className = 'doc' + (listo ? ' listo' : '');
    fila.innerHTML = `
      <div class="marca">${listo ? '✓' : (def.obligatorio ? '!' : '+')}</div>
      <div class="info">
        <b>${def.nombre}${def.obligatorio ? '' : ' <span class="opc" style="font-weight:500;color:var(--tenue)">(opcional)</span>'}</b>
        <small class="pista"></small>
        <div class="archivos"></div>
      </div>
      <div class="acciones"></div>`;

    // La pista se queda siempre visible, entera y en las líneas que necesite.
    // Antes se recortaba con puntos suspensivos y en el celular no se alcanzaba
    // a leer justo la parte que dice qué hay que subir.
    const pista = fila.querySelector('.pista');
    pista.textContent = def.pista;

    // Y encima, tocando la tarjeta se abre el recuadro con todo grande: el
    // nombre del documento, la indicación completa y los archivos que ya subió,
    // con su nombre entero. En teléfono vertical la letra chica cuesta trabajo
    // aunque quepa, y hay quien trae la pantalla rayada o los lentes en el coche.
    const info = fila.querySelector('.info');
    info.classList.add('tocable');
    info.setAttribute('role', 'button');
    info.setAttribute('tabindex', '0');
    info.title = 'Toca para ver la indicación completa';
    const abre = (e) => {
      // Si tocó un botón o una liga de adentro, esa manda.
      if (e.target.closest('a, button')) return;
      abrirDescripcion(def, mios);
    };
    info.addEventListener('click', abre);
    info.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirDescripcion(def, mios); }
    });

    // Cada archivo en su propio renglón, con su nombre y sus botones. Cuando
    // alguien sube tres DC-3 ya no queda una torre de botones sin saber cuál es
    // cuál. El nombre va con textContent: los nombres los pone quien sube el
    // archivo y no tienen por qué acabar interpretados como HTML.
    const cajaArchivos = fila.querySelector('.archivos');
    for (const m of mios) {
      const renglon = document.createElement('div');
      renglon.className = 'archivo';

      const nom = document.createElement('span');
      nom.className = 'nombre';
      nom.textContent = m.etiqueta || m.nombre_archivo;
      nom.title = m.etiqueta || m.nombre_archivo;
      renglon.appendChild(nom);

      const ver = document.createElement('a');
      ver.className = 'btn suave chico'; ver.textContent = 'Ver';
      ver.href = `/api/docs/${m.id}/archivo`; ver.target = '_blank'; ver.rel = 'noopener';
      renglon.appendChild(ver);

      const bo = document.createElement('button');
      bo.className = 'btn peligro chico'; bo.textContent = '✕';
      bo.title = 'Quitar este archivo'; bo.onclick = () => borrarDoc(m.id);
      renglon.appendChild(bo);

      cajaArchivos.appendChild(renglon);
    }
    const acc = fila.querySelector('.acciones');
    if (!listo || def.multiple) {
      const foto = document.createElement('button');
      foto.className = 'btn ' + (listo ? 'suave' : 'primario') + ' chico';
      foto.textContent = '📷 Tomar';
      foto.title = 'Tomar foto del documento con la cámara';
      foto.onclick = async () => {
        let etiqueta = '';
        if (def.tipo === 'otro') etiqueta = prompt('¿Qué documento es?') || 'Otro documento';
        abrirCamara({
          tipo: def.tipo, etiqueta, titulo: def.nombre, forma: 'documento', lado: 'environment',
          pista: 'Que quepa completo y se lean las letras',
        });
      };
      acc.appendChild(foto);

      const sub = document.createElement('button');
      sub.className = 'btn suave chico';
      sub.textContent = '📁';
      sub.title = 'Subir un archivo o PDF';
      sub.onclick = () => pedirArchivo(def);
      acc.appendChild(sub);
    }
    cont.appendChild(fila);
  }
  abrirNombresLargos(cont);
}

/* ─────────── recuadro con la indicación completa ─────────── */

function abrirDescripcion(def, mios) {
  $('#desc-titulo').textContent = def.nombre + (def.obligatorio ? '' : ' (opcional)');
  $('#desc-texto').textContent = def.pista;

  const caja = $('#desc-archivos');
  caja.innerHTML = '';
  if (mios.length) {
    const rotulo = document.createElement('p');
    rotulo.className = 'rotulo';
    rotulo.textContent = mios.length === 1 ? 'Ya subiste:' : `Ya subiste ${mios.length} archivos:`;
    caja.appendChild(rotulo);
    for (const m of mios) {
      const li = document.createElement('div');
      li.className = 'uno';
      li.textContent = m.etiqueta || m.nombre_archivo;   // texto, nunca HTML
      caja.appendChild(li);
    }
  } else if (def.obligatorio) {
    const falta = document.createElement('p');
    falta.className = 'rotulo';
    falta.textContent = 'Este documento todavía te falta.';
    caja.appendChild(falta);
  }

  $('#modal-desc').classList.remove('oculto');
  $('#desc-cerrar').focus();
}

function cerrarDescripcion() { $('#modal-desc').classList.add('oculto'); }

$('#desc-cerrar').addEventListener('click', cerrarDescripcion);
$('#modal-desc').addEventListener('click', (e) => { if (e.target.id === 'modal-desc') cerrarDescripcion(); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#modal-desc').classList.contains('oculto')) cerrarDescripcion();
});

// Un nombre de archivo puede ser larguísimo. Se recorta a dos renglones, pero
// solo cuando de verdad no cabe: entonces se le pone "ver todo" y con un toque
// se abre. Hay que medirlo ya pintado, porque depende del ancho de la pantalla.
function abrirNombresLargos(cont) {
  for (const nom of cont.querySelectorAll('.archivo .nombre')) {
    nom.classList.add('recortado');
    if (nom.scrollHeight <= nom.clientHeight + 1) { nom.classList.remove('recortado'); continue; }
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.className = 'ver-todo';
    mas.textContent = 'ver todo';
    mas.onclick = () => {
      const abierto = nom.classList.toggle('recortado');
      mas.textContent = abierto ? 'ver todo' : 'ver menos';
    };
    nom.after(mas);
  }
}

function pedirArchivo(def) {
  const entrada = $('#entrada-doc');
  entrada.value = '';
  entrada.onchange = async () => {
    const archivo = entrada.files[0];
    if (!archivo) return;
    let etiqueta = '';
    if (def.tipo === 'otro') {
      etiqueta = prompt('¿Qué documento es? (ejemplo: Contrato, Certificado de curso)') || 'Otro documento';
    }
    if (archivo.type.startsWith('image/')) await subirImagen(def.tipo, archivo, etiqueta);
    else await subir(def.tipo, archivo, etiqueta);
  };
  entrada.click();
}

async function subir(tipo, archivo, etiqueta = '') {
  if (archivo.size > 10 * 1024 * 1024) { aviso('Ese archivo pesa más de 10 MB. Toma la foto en menor calidad.', 'mal'); return; }
  aviso('Subiendo <b>' + (etiqueta || tipo) + '</b>…', 'info');
  const fd = new FormData();
  fd.append('tipo', tipo);
  fd.append('etiqueta', etiqueta);
  fd.append('archivo', archivo, archivo.name || `${tipo}.jpg`);
  try {
    const r = await api('/api/docs', { method:'POST', body:fd });
    estado.documentos = r.documentos; estado.faltantes = r.faltantes;
    pintarDocumentos(); pintarFoto(); pintarFirma(); actualizarProgreso();
    if (cambiosPendientes) await guardarAvance();
    aviso('Listo, se guardó.', 'bien');
  } catch (e) { aviso(e.message, 'mal'); }
}

async function borrarDoc(id) {
  if (!confirm('¿Quitar este documento?')) return;
  const r = await api(`/api/docs/${id}`, { method:'DELETE' }).catch((e) => { aviso(e.message,'mal'); return null; });
  if (!r) return;
  estado.documentos = r.documentos; estado.faltantes = r.faltantes;
  pintarDocumentos(); pintarFoto(); pintarFirma(); actualizarProgreso();
}

/* ─────────── foto y cámara a pantalla completa ─────────── */

function pintarFoto() {
  const foto = docsDe('foto')[0];
  const img = $('#foto-vista'), vacio = $('#foto-vacia');
  if (foto) {
    img.src = `/api/docs/${foto.id}/archivo?t=${Date.now()}`;
    img.classList.remove('oculto'); vacio.classList.add('oculto');
    $('#btn-foto-camara').textContent = '📷 Tomar otra';
  } else { img.classList.add('oculto'); vacio.classList.remove('oculto'); }
}

$('#btn-foto-archivo').addEventListener('click', () => {
  const e = $('#entrada-foto'); e.value = '';
  e.onchange = async () => { if (e.files[0]) await subirImagen('foto', e.files[0]); };
  e.click();
});

$('#btn-foto-camara').addEventListener('click', () => abrirCamara({
  tipo: 'foto', titulo: 'Tu fotografía', forma: 'ovalo', lado: 'user',
  pista: 'Acomoda tu cara dentro del óvalo, con buena luz',
}));

// Reduce la imagen antes de subirla: en el celular una foto cruda pesa 4-8 MB
// y con datos móviles eso es medio minuto de espera.
async function subirImagen(tipo, archivo, etiqueta = '', ladoMayor = 1600) {
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

let camFlujo = null, camDestino = null, camLado = 'user';

async function abrirCamara(destino) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    aviso('Este navegador no deja usar la cámara. Usa el botón de subir archivo.', 'mal');
    return;
  }
  camDestino = destino;
  camLado = destino.lado || 'environment';
  $('#cam-titulo').textContent = destino.titulo;
  $('#cam-pista').textContent = destino.pista;
  $('#cam-guia').className = 'cam-guia' + (destino.forma === 'documento' ? ' documento' : '');
  $('#camara').classList.remove('oculto', 'confirmando');
  $('#cam-abajo-tomar').classList.remove('oculto');
  $('#cam-abajo-confirmar').classList.add('oculto');
  document.body.style.overflow = 'hidden';
  await encenderCamara();
}

async function encenderCamara() {
  apagarCamara();
  try {
    camFlujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: camLado, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    const v = $('#cam-video');
    v.srcObject = camFlujo;
    // La cámara de selfie se ve al revés si no la espejeamos; la foto guardada NO se espejea.
    v.classList.toggle('espejo', camLado === 'user');
  } catch (e) {
    cerrarCamara();
    aviso('No pudimos abrir la cámara. Dale permiso al navegador, o usa el botón de subir archivo.', 'mal');
  }
}

function apagarCamara() {
  if (camFlujo) { camFlujo.getTracks().forEach((t) => t.stop()); camFlujo = null; }
}

function cerrarCamara() {
  apagarCamara();
  $('#camara').classList.add('oculto');
  $('#camara').classList.remove('confirmando');
  document.body.style.overflow = '';
  const previa = $('#cam-previa');
  if (previa.src && previa.src.startsWith('blob:')) URL.revokeObjectURL(previa.src);
  previa.removeAttribute('src');
  camDestino = null;
}

$('#cam-cerrar').addEventListener('click', cerrarCamara);

$('#cam-voltear').addEventListener('click', async () => {
  camLado = camLado === 'user' ? 'environment' : 'user';
  await encenderCamara();
});

let camBlob = null;

$('#cam-disparar').addEventListener('click', async () => {
  const v = $('#cam-video');
  if (!v.videoWidth) return;
  const cv = document.createElement('canvas');
  const cx = cv.getContext('2d');

  if (camDestino.forma === 'ovalo') {
    // Retrato cuadrado, recortado del centro
    const lado = Math.min(v.videoWidth, v.videoHeight);
    cv.width = cv.height = Math.min(lado, 1200);
    cx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, cv.width, cv.height);
  } else {
    // Documento: cuadro completo, hasta 1800 px de lado mayor
    const escala = Math.min(1, 1800 / Math.max(v.videoWidth, v.videoHeight));
    cv.width = Math.round(v.videoWidth * escala);
    cv.height = Math.round(v.videoHeight * escala);
    cx.drawImage(v, 0, 0, cv.width, cv.height);
  }

  camBlob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.88));
  const previa = $('#cam-previa');
  previa.src = URL.createObjectURL(camBlob);
  $('#camara').classList.add('confirmando');
  $('#cam-abajo-tomar').classList.add('oculto');
  $('#cam-abajo-confirmar').classList.remove('oculto');
  apagarCamara();
});

$('#cam-repetir').addEventListener('click', async () => {
  $('#camara').classList.remove('confirmando');
  $('#cam-abajo-confirmar').classList.add('oculto');
  $('#cam-abajo-tomar').classList.remove('oculto');
  camBlob = null;
  await encenderCamara();
});

$('#cam-usar').addEventListener('click', async () => {
  if (!camBlob || !camDestino) return;
  const { tipo, etiqueta } = camDestino;
  const b = $('#cam-usar'); ocupado(b, true);
  const archivo = new File([camBlob], `${tipo}.jpg`, { type: 'image/jpeg' });
  cerrarCamara();
  ocupado(b, false, 'Usar esta foto');
  await subir(tipo, archivo, etiqueta || '');
});

/* ─────────── firma sobre los datos bancarios ─────────── */

const AZUL = '#0080C1', TINTA = '#122733';
let trazos = [], trazoActual = null, lienzo, ctx, escala = 2, altoDatos = 0;

function datosBancarios() {
  const d = recolectar();
  return [
    ['Trabajador', `${d.nombre} ${d.apellido_paterno} ${d.apellido_materno}`.trim() || '—'],
    ['CURP', d.curp || '—'],
    ['Banco', d.banco || '—'],
    ['CLABE', (d.clabe || '—').replace(/(\d{3})(\d{3})(\d{11})(\d{1})/, '$1 $2 $3 $4')],
    ['Beneficiario', d.beneficiario || '—'],
  ];
}

function dibujarLienzo() {
  const anchoCss = lienzo.clientWidth || 480;
  const alto = 420;
  lienzo.width = anchoCss * escala;
  lienzo.height = alto * escala;
  lienzo.style.height = alto + 'px';
  ctx = lienzo.getContext('2d');
  ctx.setTransform(escala, 0, 0, escala, 0, 0);
  const W = anchoCss;

  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, alto);

  // encabezado de marca
  ctx.fillStyle = AZUL; ctx.fillRect(0, 0, W, 44);
  ctx.fillStyle = '#fff'; ctx.font = '800 17px Raleway, sans-serif';
  ctx.fillText('TALLER 101', 16, 28);
  ctx.font = '600 11px Raleway, sans-serif';
  ctx.fillText('AUTORIZACIÓN DE PAGO POR TRANSFERENCIA', 118, 28);

  let y = 72;
  ctx.fillStyle = TINTA; ctx.font = '600 12px Raleway, sans-serif';
  ctx.fillText('Autorizo que mis pagos se depositen en la siguiente cuenta:', 16, y);
  y += 20;
  for (const [etq, val] of datosBancarios()) {
    ctx.fillStyle = '#6b7a85'; ctx.font = '500 11px Raleway, sans-serif';
    ctx.fillText(etq.toUpperCase(), 16, y);
    ctx.fillStyle = TINTA; ctx.font = '700 14px Raleway, sans-serif';
    ctx.fillText(String(val).slice(0, 46), 16, y + 17);
    y += 40;
  }
  ctx.strokeStyle = '#e2e8ed'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(16, y); ctx.lineTo(W - 16, y); ctx.stroke();
  altoDatos = y + 8;

  ctx.fillStyle = '#6b7a85'; ctx.font = '500 11px Raleway, sans-serif';
  ctx.fillText('FIRMA DEL TRABAJADOR — traza tu firma aquí abajo', 16, y + 22);

  // línea de firma
  ctx.strokeStyle = '#c9d4dc';
  ctx.beginPath(); ctx.moveTo(40, alto - 42); ctx.lineTo(W - 40, alto - 42); ctx.stroke();
  ctx.fillStyle = '#9aa8b2'; ctx.font = '500 10px Raleway, sans-serif';
  const fecha = new Date().toLocaleDateString('es-MX', { day:'2-digit', month:'long', year:'numeric' });
  ctx.fillText(`Ciudad de México, ${fecha}`, 40, alto - 26);

  // trazos guardados
  ctx.strokeStyle = '#12324a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const t of trazos) {
    if (t.length < 2) continue;
    ctx.beginPath(); ctx.moveTo(t[0].x, t[0].y);
    for (const p of t.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}

function puntoDe(ev) {
  const r = lienzo.getBoundingClientRect();
  return { x: ev.clientX - r.left, y: ev.clientY - r.top };
}

function abrirFirma() {
  const d = recolectar();
  const faltan = [];
  if (!d.banco) faltan.push('el banco');
  if (!clabeOk(d.clabe)) faltan.push('una CLABE válida de 18 dígitos');
  if (!d.beneficiario) faltan.push('el beneficiario');
  if (!d.nombre || !d.apellido_paterno) faltan.push('tu nombre completo');
  if (faltan.length) { aviso('Antes de firmar necesitas capturar ' + faltan.join(', ') + '.', 'mal'); return; }
  trazos = [];
  $('#modal-firma').classList.remove('oculto');
  lienzo = $('#lienzo-firma');
  requestAnimationFrame(dibujarLienzo);
}

$('#btn-firmar').addEventListener('click', abrirFirma);
$('#btn-cerrar-firma').addEventListener('click', () => $('#modal-firma').classList.add('oculto'));
$('#btn-borrar-firma').addEventListener('click', () => { trazos = []; dibujarLienzo(); });

document.addEventListener('pointerdown', (e) => {
  if (e.target !== $('#lienzo-firma')) return;
  e.preventDefault();
  const p = puntoDe(e);
  if (p.y < altoDatos) return;         // solo se firma debajo de los datos
  trazoActual = [p]; trazos.push(trazoActual);
  lienzo.setPointerCapture(e.pointerId);
});
document.addEventListener('pointermove', (e) => {
  if (!trazoActual) return;
  const p = puntoDe(e);
  trazoActual.push(p);
  ctx.strokeStyle = '#12324a'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const a = trazoActual[trazoActual.length - 2];
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(p.x, p.y); ctx.stroke();
});
document.addEventListener('pointerup', () => { trazoActual = null; });

$('#btn-guardar-firma').addEventListener('click', async () => {
  const puntos = trazos.reduce((n, t) => n + t.length, 0);
  if (puntos < 12) { alert('Traza tu firma sobre la línea antes de guardar.'); return; }
  const b = $('#btn-guardar-firma'); ocupado(b, true);
  try {
    // guarda primero los datos para que la imagen y el registro coincidan
    await guardar(true);
    const blob = await new Promise((res) => lienzo.toBlob(res, 'image/png'));
    await subir('firma_bancaria', new File([blob], 'datos-bancarios-firmados.png', { type:'image/png' }));
    $('#modal-firma').classList.add('oculto');
  } finally { ocupado(b, false, 'Guardar firma'); }
});

function pintarFirma() {
  const f = docsDe('firma_bancaria')[0];
  const caja = $('#estado-firma');
  if (f) {
    caja.className = 'aviso bien';
    caja.innerHTML = `Firmado ✓ — <a href="/api/docs/${f.id}/archivo" target="_blank" rel="noopener">ver el documento firmado</a>. Si cambias la CLABE o el banco, vuelve a firmar.`;
    $('#btn-firmar').textContent = '✍️ Volver a firmar';
  } else {
    caja.className = 'aviso info';
    caja.textContent = 'Cuando termines de escribir los datos, fírmalos.';
    $('#btn-firmar').textContent = '✍️ Revisar y firmar mis datos bancarios';
  }
}

window.addEventListener('resize', () => { if (!$('#modal-firma').classList.contains('oculto')) dibujarLienzo(); });

/* ─────────── guardar ─────────── */

async function guardar(parcial = false) {
  const cuerpo = recolectar();
  cuerpo.__parcial = parcial;
  try {
    const r = await api('/api/yo', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cuerpo) });
    estado.trabajador = r.trabajador; estado.faltantes = r.faltantes;
    pintarErrores(r.errores || {});
    actualizarProgreso();
    // El servidor guardó lo demás pero no aceptó un dato repetido.
    if (r.aviso) { aviso(r.aviso, 'mal'); return true; }
    if (!parcial) {
      aviso(r.faltantes.length
        ? `Guardamos tus datos y te mandamos un correo de confirmación. Todavía falta subir: <b>${r.faltantes.join(', ')}</b>.`
        : '¡Listo! Tu expediente quedó completo. Te mandamos un correo de confirmación.', 'bien');
    }
    return true;
  } catch (e) {
    if (e.datos && e.datos.errores) { pintarErrores(e.datos.errores); aviso('Revisa los campos marcados en rojo.', 'mal'); }
    else aviso(e.message, 'mal');
    return false;
  }
}

/* ─────────── guardado automático ───────────
   El expediente pide papeles que casi nadie trae el mismo día: NSS, CSF, carátula
   del banco. Si el portal exigiera todo de un jalón para guardar, nadie lo
   terminaría. Entonces todo lo escrito se guarda solo, sin validar nada, y la
   revisión completa se hace nada más al final, cuando el trabajador dice "ya". */

let temporizadorGuardado = null, cambiosPendientes = false, guardandoAvance = false;

function marcaGuardado(texto, clase = '') {
  const p = $('#pista-guardado');
  if (p) p.innerHTML = `<span class="marca-guardado ${clase}">${texto}</span>`;
}

function programarGuardado() {
  cambiosPendientes = true;
  marcaGuardado('Escribiendo…', 'trabajando');
  clearTimeout(temporizadorGuardado);
  temporizadorGuardado = setTimeout(guardarAvance, 1500);
}

async function guardarAvance() {
  if (guardandoAvance || !cambiosPendientes) return;
  guardandoAvance = true;
  clearTimeout(temporizadorGuardado);
  marcaGuardado('Guardando…', 'trabajando');
  const ok = await guardar(true);
  guardandoAvance = false;
  if (ok) {
    cambiosPendientes = false;
    const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
    marcaGuardado(`✓ Guardado a las ${hora}`);
  } else {
    marcaGuardado('No se pudo guardar. Revisa tu internet.', 'trabajando');
  }
}

// Si cierra la pestaña o se cambia de app en el celular, guardamos antes de irnos.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && cambiosPendientes) guardarAvance();
});

$('#btn-avance').addEventListener('click', async () => {
  const b = $('#btn-avance'); ocupado(b, true);
  cambiosPendientes = true;
  await guardarAvance();
  ocupado(b, false, 'Guardar y seguir después');
  aviso('Guardado. Puedes cerrar e irte: cuando vuelvas, entra con tu mismo correo y sigues donde te quedaste.', 'bien');
});

$('#btn-terminar').addEventListener('click', async () => {
  const b = $('#btn-terminar'); ocupado(b, true);
  clearTimeout(temporizadorGuardado);
  const ok = await guardar(false);
  if (ok) cambiosPendientes = false;
  ocupado(b, false, 'Ya terminé — revisar y enviar');
});

// Validación viva
$('#f-curp').addEventListener('blur', (e) => {
  const v = e.target.value.toUpperCase().trim(); e.target.value = v;
  document.querySelector('[data-e="curp"]').textContent = v && !curpOk(v) ? 'Esa CURP no es válida. Cópiala tal cual de tu documento.' : '';
});
$('#f-clabe').addEventListener('blur', (e) => {
  const v = soloNum(e.target.value);
  document.querySelector('[data-e="clabe"]').textContent = v && !clabeOk(v) ? 'La CLABE no cuadra. Son 18 dígitos, revísala en tu app del banco.' : '';
});

/* ─────────── arranque ─────────── */

(async function arranque() {
  try { await abrirPanel(); }
  catch { /* sin sesión: se queda en la pantalla de acceso */ }
})();
