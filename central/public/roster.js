/* roster101 — panel de la plataforma.
 *
 * Aquí se ve cada empresa que está entrando: qué le falta, qué entregó y, cuando
 * ya está revisada, el botón que le abre su portal. Ese botón dispara el mismo
 * flujo de alta que ya está probado, con los datos que capturó la propia
 * empresa: nadie los vuelve a teclear.
 */

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let empresas = [];
let nombresDoc = {};

async function api(ruta, opciones = {}) {
  const r = await fetch(ruta, { credentials: 'same-origin', ...opciones });
  const datos = (r.headers.get('Content-Type') || '').includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) { const e = new Error(datos.error || 'Algo salió mal.'); e.datos = datos; e.estado = r.status; throw e; }
  return datos;
}

function aviso(texto, clase = 'info') {
  $('#aviso-global').innerHTML = `<div class="aviso ${clase}">${texto}</div>`;
  if (clase === 'bien') setTimeout(() => { $('#aviso-global').innerHTML = ''; }, 6000);
}

function ocupado(btn, si, texto) {
  btn.disabled = si;
  if (si) { btn.dataset.txt = btn.textContent; btn.textContent = 'Espera…'; }
  else btn.textContent = texto || btn.dataset.txt || btn.textContent;
}

/* ─────────── entrar ─────────── */

$('#btn-entrar').addEventListener('click', async () => {
  const b = $('#btn-entrar'); ocupado(b, true);
  try {
    await api('/api/roster/entrar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clave: $('#clave').value }),
    });
    await abrir();
  } catch (e) {
    $('#aviso-acceso').innerHTML = `<div class="aviso mal">${esc(e.message)}</div>`;
  } finally { ocupado(b, false, 'Entrar'); }
});

$('#clave').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-entrar').click(); });

$('#btn-salir').addEventListener('click', async () => {
  await api('/api/roster/salir', { method: 'POST' }).catch(() => {});
  location.reload();
});

/* ─────────── la lista ─────────── */

const ESTADOS = {
  invitada: { texto: 'Invitada, no ha entrado', clase: 'borrador' },
  llenando: { texto: 'Llenando', clase: 'borrador' },
  completa: { texto: 'Por revisar', clase: 'revisar' },
  revisada: { texto: 'Revisada', clase: 'revisar' },
  activa: { texto: 'Con portal', clase: 'completo' },
};

function cuando(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
}

async function abrir() {
  const r = await api('/api/roster/empresas');
  empresas = r.empresas;
  nombresDoc = r.nombres_doc || {};
  $('#acceso').classList.add('oculto');
  $('#panel').classList.remove('oculto');
  $('#btn-salir').classList.remove('oculto');
  pintar();
}

function pintar() {
  $('#c-empresas').textContent = empresas.length;
  const porRevisar = empresas.filter((e) => e.estado === 'completa').length;
  $('#c-revisar').textContent = porRevisar;
  $('#c-revisar').classList.toggle('pendiente', porRevisar > 0);
  $('#c-activas').textContent = empresas.filter((e) => e.estado === 'activa').length;

  const cont = $('#lista');
  cont.innerHTML = '';
  if (!empresas.length) {
    cont.innerHTML = '<div class="tarjeta"><p class="ayuda" style="margin:0">Todavía no hay ninguna empresa. Invita a la primera arriba.</p></div>';
    return;
  }

  for (const e of empresas) {
    const est = ESTADOS[e.estado] || { texto: e.estado, clase: 'borrador' };
    const caja = document.createElement('details');
    caja.className = 'empresa tarjeta';
    if (e.estado === 'completa') caja.open = true;

    const docs = (e.documentos || []).map((d) =>
      `<a class="btn suave chico" href="/api/docs/${d.id}/archivo" target="_blank" rel="noopener">${esc(nombresDoc[d.tipo] || d.tipo)}</a>`).join(' ');

    const faltan = (e.faltantes || []).length
      ? `<div class="faltantes">${e.faltantes.map((f) => `<span class="chip falta">${esc(f)}</span>`).join('')}</div>`
      : '';

    caja.innerHTML = `
      <summary>
        <span class="nombre">${esc(e.nombre || 'Sin nombre')}</span>
        <span class="etiqueta ${est.clase}">${est.texto}</span>
        <span class="razon">${esc(e.razon_social || 'Falta su razón social')} · invitada el ${cuando(e.creado_en)}</span>
        ${faltan}
      </summary>
      <div class="detalle">
        <div class="datos">
          <div class="dato"><div class="etq">Contacto</div><div class="val">${esc(e.correo_contacto)}${e.telefono ? ' · ' + esc(e.telefono) : ''}</div></div>
          <div class="dato"><div class="etq">Representante</div><div class="val">${esc(e.representante || '—')}${e.cargo ? ' · ' + esc(e.cargo) : ''}</div></div>
          <div class="dato"><div class="etq">RFC</div><div class="val mono">${esc(e.rfc || '—')}</div></div>
          <div class="dato"><div class="etq">Nombre corto</div><div class="val mono">${esc(e.slug || '—')}</div></div>
          <div class="dato" style="grid-column:1/-1"><div class="etq">Domicilio fiscal</div><div class="val">${esc(e.domicilio || '—')}</div></div>
          <div class="dato"><div class="etq">Correo de privacidad</div><div class="val">${esc(e.correo_privacidad || '—')}</div></div>
          <div class="dato"><div class="etq">Correo de avisos</div><div class="val">${esc(e.correo_avisos || e.correo_contacto)}</div></div>
          ${e.portal_url ? `<div class="dato" style="grid-column:1/-1"><div class="etq">Su portal</div><div class="val"><a href="${esc(e.portal_url)}" target="_blank" rel="noopener">${esc(e.portal_url)}</a></div></div>` : ''}
          ${e.nota ? `<div class="dato" style="grid-column:1/-1"><div class="etq">Nota</div><div class="val">${esc(e.nota)}</div></div>` : ''}
        </div>
        <div>
          <div class="etq" style="margin-bottom:6px">Documentos (${(e.documentos || []).length})</div>
          <div class="chips-docs">${docs || '<span class="ayuda">Todavía no sube nada.</span>'}</div>
        </div>
        <div class="acciones" data-id="${e.id}"></div>
      </div>`;

    const acciones = caja.querySelector('.acciones');
    const puedeAbrir = e.estado === 'revisada' || (e.estado === 'completa' && !(e.faltantes || []).length);

    if (e.estado !== 'activa') {
      acciones.appendChild(boton('Recordarle lo que falta', 'suave', () => recordar(e)));
    }
    if (e.estado === 'completa') {
      acciones.appendChild(boton('Marcar como revisada', 'suave', () => revisar(e)));
      acciones.appendChild(boton('Regresársela', 'suave', () => regresar(e)));
    }
    if (puedeAbrir) {
      acciones.appendChild(boton('Abrirle su portal', 'primario', () => abrirPortal(e)));
    }
    cont.appendChild(caja);
  }
}

function boton(texto, clase, alTocar) {
  const b = document.createElement('button');
  b.className = `btn ${clase}`;
  b.textContent = texto;
  b.onclick = () => alTocar(b);
  return b;
}

/* ─────────── acciones ─────────── */

async function recordar(e) {
  try {
    await api(`/api/roster/recordar/${e.id}`, { method: 'POST' });
    aviso(`Le mandamos el recordatorio a ${esc(e.correo_contacto)}.`, 'bien');
  } catch (err) { aviso(esc(err.message), 'mal'); }
}

async function revisar(e) {
  try {
    await api(`/api/roster/revisar/${e.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nota: '' }),
    });
    await abrir();
    aviso(`${esc(e.nombre)} queda lista para abrirle su portal.`, 'bien');
  } catch (err) { aviso(esc(err.message), 'mal'); }
}

async function regresar(e) {
  const nota = prompt('¿Qué tienen que corregir? Esto es justo lo que van a leer:');
  if (!nota || !nota.trim()) return;
  try {
    await api(`/api/roster/regresar/${e.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nota }),
    });
    await abrir();
    aviso(`Se la regresamos a ${esc(e.nombre)} con tu nota.`, 'bien');
  } catch (err) { aviso(esc(err.message), 'mal'); }
}

async function abrirPortal(e) {
  if (!confirm(`¿Abrirle su portal a ${e.nombre}?\n\nSe le crea su base, su bucket y su Worker, y le llega por correo su liga y su clave. Tarda como un minuto.`)) return;
  try {
    await api(`/api/roster/abrir/${e.id}`, { method: 'POST' });
    await abrir();
    aviso(`Se disparó el alta de ${esc(e.nombre)}. En un minuto le llega su correo.`, 'bien');
  } catch (err) {
    // Si falta la llave de GitHub, el servidor devuelve los datos listos para
    // correr el alta a mano: más vale enseñarlos que dejar a nadie adivinando.
    const datos = err.datos && err.datos.entradas;
    if (datos) {
      aviso(`${esc(err.message)}<br><br><b>Datos para el flujo "Alta de cliente":</b><br>` +
        Object.entries(datos).map(([k, v]) => `<span class="mono">${esc(k)}</span>: ${esc(v)}`).join('<br>'), 'mal');
    } else aviso(esc(err.message), 'mal');
  }
}

$('#btn-invitar').addEventListener('click', async () => {
  const b = $('#btn-invitar'); ocupado(b, true);
  try {
    const r = await api('/api/roster/invitar', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: $('#inv-nombre').value.trim(), correo_contacto: $('#inv-correo').value.trim() }),
    });
    $('#inv-nombre').value = ''; $('#inv-correo').value = '';
    await abrir();
    aviso(r.correo_enviado
      ? 'Invitación mandada. Ya puede entrar con su correo.'
      : 'Empresa dada de alta, pero el correo no salió: falta configurar la llave de Resend.', r.correo_enviado ? 'bien' : 'mal');
  } catch (e) { aviso(esc(e.message), 'mal'); }
  finally { ocupado(b, false, 'Mandar invitación'); }
});

(async () => { try { await abrir(); } catch { /* sin sesión: pide la clave */ } })();
