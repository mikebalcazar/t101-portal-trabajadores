/* Administración — Portal de Trabajadores Taller 101 */
'use strict';
const $ = (s) => document.querySelector(s);

const NOMBRES = {
  foto:'Foto', firma_bancaria:'Firma bancaria', ine:'INE frente', ine_reverso:'INE reverso', nss:'NSS',
  csf:'CSF', curp:'CURP', caratula:'Carátula', dc3:'DC-3', otro:'Otro',
};
const ORDEN = ['foto','firma_bancaria','ine','ine_reverso','nss','csf','curp','caratula','dc3','otro'];

let trabajadores = [];

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
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function pintar() {
  const q = $('#buscar').value.trim().toLowerCase();
  const cuerpo = $('#cuerpo');
  cuerpo.innerHTML = '';
  const lista = trabajadores.filter((t) => !q || JSON.stringify(t).toLowerCase().includes(q));
  if (!lista.length) {
    cuerpo.innerHTML = '<tr><td colspan="9" class="centrado" style="padding:30px;color:var(--tenue)">Sin resultados.</td></tr>';
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
      <td class="mono">${t.folio ?? ''}</td>
      <td><b>${esc(t.apellido_paterno)} ${esc(t.apellido_materno)}</b><br><span style="color:var(--tenue)">${esc(t.nombre)}${t.puesto ? ' · ' + esc(t.puesto) : ''}</span></td>
      <td><span class="mono">${esc(t.celular)}</span><br><span style="color:var(--tenue);font-size:12px">${esc(t.email)}</span></td>
      <td class="mono">${esc(t.nss)}<br>${esc(t.curp)}</td>
      <td>${esc(t.banco)}<br><span class="mono" style="font-size:12px">${esc(t.clabe)}</span></td>
      <td>${esc(t.emerg_nombre)}<br><span class="mono" style="font-size:12px">${esc(t.emerg_telefono)}</span></td>
      <td style="max-width:280px">${chips || '<span style="color:var(--tenue)">—</span>'}${falta ? `<div style="color:var(--alerta);font-size:11.5px;margin-top:4px">Faltan ${falta}: ${esc((t.faltantes||[]).join(', '))}</div>` : ''}</td>
      <td><span class="etiqueta ${t.estado === 'completo' ? 'completo' : 'borrador'}">${t.estado === 'completo' ? 'Completo' : 'Pendiente'}</span></td>
      <td><button class="btn peligro chico" data-baja="${t.id}">Baja</button></td>`;
    cuerpo.appendChild(tr);
  }
  cuerpo.querySelectorAll('[data-baja]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Esto borra al trabajador Y todos sus documentos. No se puede deshacer. ¿Seguro?')) return;
    await api(`/api/admin/trabajadores/${b.dataset.baja}`, { method:'DELETE' });
    await cargar();
  }));
}

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
    a.download = `Expedientes Taller 101 ${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (e) { alert(e.message); }
  finally { b.disabled = false; b.textContent = txt; }
});

(async () => { try { await abrir(); } catch {} })();
