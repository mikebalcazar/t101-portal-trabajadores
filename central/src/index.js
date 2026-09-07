// roster101 central — donde una empresa nueva entrega sus datos y sus papeles,
// y donde roster101 los revisa y le abre su portal.
//
// Es el mismo trato que el portal de trabajadores, que ya sabemos que funciona:
// se entra con un correo y un código de seis dígitos, se llena desde el celular,
// se guarda solo mientras se escribe y los documentos se suben con la cámara.
// Lo que cambia es quién llena —el representante de la empresa, no el
// trabajador— y qué se le pide.

import { Hono } from 'hono';
import {
  ahora, uuid, firmar, verificar, sha256, igualSeguro,
  cookie, leerCookie, normalizaEmail, limpiaNombre,
} from '../../src/lib.js';
import { enviarCorreo } from '../../src/correo.js';
import {
  DOCS_EMPRESA, DOCS_OBLIGATORIOS, NOMBRES_DOC, revisaEmpresa, faltantesDe,
} from './empresa.js';
import { correoInvitacion, correoRecordatorio, correoExpedienteCompleto, correoCodigo } from './correos.js';

const app = new Hono();

const HORAS = 3600;
const VIDA_SESION = 12 * HORAS;
const VIDA_CODIGO = 10 * 60;
const TOPE_ARCHIVO = 10 * 1024 * 1024;

const secreto = (env) => env.SECRETO || 'sin-secreto';
const err = (c, mensaje, codigo = 400, extra = {}) => c.json({ error: mensaje, ...extra }, codigo);

async function registra(env, quien, accion, detalle = '') {
  try {
    await env.DB.prepare('INSERT INTO bitacora (cuando, quien, accion, detalle) VALUES (?,?,?,?)')
      .bind(ahora(), quien, accion, detalle).run();
  } catch (e) { console.error('bitacora', e); }
}

// El nombre corto con el que se van a llamar su Worker, su base y su bucket.
export function nombreCorto(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 32);
}

/* ─────────────────────── quién eres ─────────────────────── */

const exigeEmpresa = async (c, next) => {
  const datos = await verificar(leerCookie(c.req, 'roster_empresa'), secreto(c.env));
  if (!datos || datos.rol !== 'empresa') return err(c, 'Entra con tu correo para continuar.', 401);
  c.set('sesion', datos);
  await next();
};

const exigeRoster = async (c, next) => {
  const datos = await verificar(leerCookie(c.req, 'roster_admin'), secreto(c.env));
  if (!datos || datos.rol !== 'roster') return err(c, 'Entra con la clave de roster101.', 401);
  await next();
};

/* ─────────────────────── acceso de la empresa ─────────────────────── */

app.post('/api/codigo', async (c) => {
  const { email } = await c.req.json().catch(() => ({}));
  const correo = normalizaEmail(email);
  if (!correo) return err(c, 'Escribe tu correo.');

  // Solo entra quien fue invitado: aquí no hay registro abierto.
  const empresa = await c.env.DB.prepare('SELECT id, nombre FROM empresas WHERE correo_contacto = ?').bind(correo).first();
  if (!empresa) {
    return err(c, 'Ese correo no tiene invitación. Escríbele a quien te mandó la liga.', 404);
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  await c.env.DB.prepare(
    `INSERT INTO codigos (email, hash, expira, intentos, enviado_en) VALUES (?,?,?,0,?)
     ON CONFLICT(email) DO UPDATE SET hash=excluded.hash, expira=excluded.expira, intentos=0, enviado_en=excluded.enviado_en`
  ).bind(correo, await sha256(codigo + secreto(c.env)), Math.floor(Date.now() / 1000) + VIDA_CODIGO, Math.floor(Date.now() / 1000)).run();

  if (!c.env.RESEND_API_KEY) {
    console.log('[código simulado]', correo, codigo);
    return err(c, 'El correo todavía no está configurado. Avísale a roster101.', 503);
  }
  await enviarCorreo(c.env, { para: correo, ...correoCodigo(codigo) });
  await registra(c.env, correo, 'codigo_enviado');
  return c.json({ ok: true });
});

app.post('/api/entrar', async (c) => {
  const { email, codigo } = await c.req.json().catch(() => ({}));
  const correo = normalizaEmail(email);
  const fila = await c.env.DB.prepare('SELECT * FROM codigos WHERE email = ?').bind(correo).first();
  if (!fila) return err(c, 'Pide un código primero.', 404);
  if (fila.expira < Math.floor(Date.now() / 1000)) return err(c, 'El código ya venció. Pide otro.', 410);
  if (fila.intentos >= 5) return err(c, 'Demasiados intentos. Pide un código nuevo.', 429);

  const bueno = igualSeguro(await sha256(String(codigo || '') + secreto(c.env)), fila.hash);
  if (!bueno) {
    await c.env.DB.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE email = ?').bind(correo).run();
    return err(c, 'Ese código no es. Revisa el correo.', 401);
  }
  await c.env.DB.prepare('DELETE FROM codigos WHERE email = ?').bind(correo).run();

  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE correo_contacto = ?').bind(correo).first();
  if (!empresa) return err(c, 'Ese correo no tiene invitación.', 404);
  if (empresa.estado === 'invitada') {
    await c.env.DB.prepare('UPDATE empresas SET estado = ?, actualizado_en = ? WHERE id = ?')
      .bind('llenando', ahora(), empresa.id).run();
  }

  const token = await firmar(
    { rol: 'empresa', id: empresa.id, email: correo, exp: Math.floor(Date.now() / 1000) + VIDA_SESION },
    secreto(c.env)
  );
  c.header('Set-Cookie', cookie('roster_empresa', token, VIDA_SESION));
  await registra(c.env, correo, 'entro');
  return c.json({ ok: true });
});

app.post('/api/salir', (c) => {
  c.header('Set-Cookie', cookie('roster_empresa', '', 0));
  return c.json({ ok: true });
});

/* ─────────────────────── los datos de la empresa ─────────────────────── */

async function documentosDe(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT id, tipo, etiqueta, nombre_archivo, mime, tamano, subido_en FROM documentos_empresa WHERE empresa_id = ? ORDER BY subido_en'
  ).bind(id).all();
  return results || [];
}

app.get('/api/yo', exigeEmpresa, async (c) => {
  const s = c.get('sesion');
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.id).first();
  if (!empresa) return err(c, 'No encontramos tu registro.', 404);
  const docs = await documentosDe(c.env, s.id);
  return c.json({ empresa, documentos: docs, faltantes: faltantesDe(empresa, docs) });
});

app.put('/api/yo', exigeEmpresa, async (c) => {
  const s = c.get('sesion');
  const cuerpo = await c.req.json().catch(() => ({}));
  const parcial = cuerpo.__parcial === true;
  const { errores, limpio, ok } = revisaEmpresa(cuerpo);
  if (!ok && !parcial) return err(c, 'Revisa los datos marcados.', 422, { errores });

  // El nombre corto se saca del nombre comercial la primera vez y ya no se
  // mueve: de él dependen el Worker, la base y el bucket que se le van a crear.
  const actual = await c.env.DB.prepare('SELECT slug FROM empresas WHERE id = ?').bind(s.id).first();
  let slug = actual?.slug || '';
  if (!slug && limpio.nombre) {
    slug = nombreCorto(limpio.nombre);
    const chocado = await c.env.DB.prepare('SELECT id FROM empresas WHERE slug = ? AND id <> ?').bind(slug, s.id).first();
    if (chocado) slug = `${slug}-${s.id.slice(0, 4)}`;
  }

  await c.env.DB.prepare(
    `UPDATE empresas SET slug=?, nombre=?, razon_social=?, rfc=?, domicilio=?, representante=?, cargo=?,
     telefono=?, correo_privacidad=?, correo_avisos=?, actualizado_en=? WHERE id=?`
  ).bind(
    slug, limpio.nombre, limpio.razon_social, limpio.rfc, limpio.domicilio, limpio.representante,
    limpio.cargo, limpio.telefono, limpio.correo_privacidad, limpio.correo_avisos, ahora(), s.id
  ).run();

  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.id).first();
  const docs = await documentosDe(c.env, s.id);
  return c.json({ ok: true, empresa, documentos: docs, faltantes: faltantesDe(empresa, docs) });
});

// "Ya terminé": la empresa dice que entregó todo. A partir de aquí le toca a
// roster101 revisarlo, y le llega el aviso en el momento.
app.post('/api/terminar', exigeEmpresa, async (c) => {
  const s = c.get('sesion');
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.id).first();
  const docs = await documentosDe(c.env, s.id);
  const faltantes = faltantesDe(empresa, docs);
  if (faltantes.length) return err(c, 'Todavía falta algo.', 422, { faltantes });

  await c.env.DB.prepare('UPDATE empresas SET estado = ?, enviado_en = ?, actualizado_en = ? WHERE id = ?')
    .bind('completa', ahora(), ahora(), s.id).run();
  await registra(c.env, empresa.correo_contacto, 'expediente_completo', empresa.nombre);

  if (c.env.CORREO_ROSTER) {
    c.executionCtx.waitUntil((async () => {
      try {
        await enviarCorreo(c.env, {
          para: c.env.CORREO_ROSTER,
          ...correoExpedienteCompleto(empresa, docs, c.env.LIGA_CENTRAL || ''),
        });
      } catch (e) { console.error('aviso a roster101', e); }
    })());
  }
  return c.json({ ok: true });
});

/* ─────────────────────── documentos de la empresa ─────────────────────── */

app.post('/api/docs', exigeEmpresa, async (c) => {
  const s = c.get('sesion');
  const form = await c.req.formData().catch(() => null);
  if (!form) return err(c, 'No recibimos el archivo.');
  const tipo = String(form.get('tipo') || '');
  const etiqueta = String(form.get('etiqueta') || '').slice(0, 80);
  const archivo = form.get('archivo');
  if (!DOCS_EMPRESA.some((d) => d.tipo === tipo)) return err(c, 'Ese tipo de documento no existe.');
  if (!archivo || typeof archivo === 'string') return err(c, 'No recibimos el archivo.');
  if (archivo.size > TOPE_ARCHIVO) return err(c, 'El archivo pesa más de 10 MB.');

  const id = uuid();
  const llave = `${s.id}/${tipo}-${id}`;
  await c.env.DOCS.put(llave, archivo.stream(), { httpMetadata: { contentType: archivo.type || 'application/octet-stream' } });

  const definicion = DOCS_EMPRESA.find((d) => d.tipo === tipo);
  if (!definicion.multiple) {
    // Un documento que no se repite reemplaza al anterior: si mandan otra CSF,
    // vale la nueva y la vieja se va, para que nadie revise la equivocada.
    const viejos = await c.env.DB.prepare('SELECT id, llave FROM documentos_empresa WHERE empresa_id = ? AND tipo = ?').bind(s.id, tipo).all();
    for (const v of viejos.results || []) {
      await c.env.DOCS.delete(v.llave).catch(() => {});
      await c.env.DB.prepare('DELETE FROM documentos_empresa WHERE id = ?').bind(v.id).run();
    }
  }

  await c.env.DB.prepare(
    'INSERT INTO documentos_empresa (id, empresa_id, tipo, etiqueta, nombre_archivo, llave, mime, tamano, subido_en) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(id, s.id, tipo, etiqueta, limpiaNombre(archivo.name || tipo), llave, archivo.type || '', archivo.size, ahora()).run();

  // Un documento nuevo después de haber dicho "ya terminé" regresa el registro
  // a revisión: lo que se apruebe tiene que ser lo que de verdad está.
  await c.env.DB.prepare(
    `UPDATE empresas SET actualizado_en = ?, estado = CASE WHEN estado IN ('completa','revisada') THEN 'llenando' ELSE estado END WHERE id = ?`
  ).bind(ahora(), s.id).run();

  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.id).first();
  const docs = await documentosDe(c.env, s.id);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(empresa, docs) });
});

app.get('/api/docs/:id/archivo', async (c) => {
  const id = c.req.param('id');
  const doc = await c.env.DB.prepare('SELECT * FROM documentos_empresa WHERE id = ?').bind(id).first();
  if (!doc) return err(c, 'No encontramos ese documento.', 404);

  // Lo puede ver su dueño o roster101, nadie más.
  const dEmpresa = await verificar(leerCookie(c.req, 'roster_empresa'), secreto(c.env));
  const dRoster = await verificar(leerCookie(c.req, 'roster_admin'), secreto(c.env));
  const suyo = dEmpresa && dEmpresa.rol === 'empresa' && dEmpresa.id === doc.empresa_id;
  const deRoster = dRoster && dRoster.rol === 'roster';
  if (!suyo && !deRoster) return err(c, 'No tienes permiso para ver este documento.', 403);

  const obj = await c.env.DOCS.get(doc.llave);
  if (!obj) return err(c, 'El archivo ya no está.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': doc.mime || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${limpiaNombre(doc.nombre_archivo)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});

app.delete('/api/docs/:id', exigeEmpresa, async (c) => {
  const s = c.get('sesion');
  const doc = await c.env.DB.prepare('SELECT * FROM documentos_empresa WHERE id = ? AND empresa_id = ?').bind(c.req.param('id'), s.id).first();
  if (!doc) return err(c, 'No encontramos ese documento.', 404);
  await c.env.DOCS.delete(doc.llave).catch(() => {});
  await c.env.DB.prepare('DELETE FROM documentos_empresa WHERE id = ?').bind(doc.id).run();
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(s.id).first();
  const docs = await documentosDe(c.env, s.id);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(empresa, docs) });
});

/* ─────────────────────── el panel de roster101 ─────────────────────── */

app.post('/api/roster/entrar', async (c) => {
  const { clave } = await c.req.json().catch(() => ({}));
  const llave = c.req.header('CF-Connecting-IP') || 'sin-direccion';
  const t = Math.floor(Date.now() / 1000);

  const freno = await c.env.DB.prepare('SELECT * FROM intentos_admin WHERE llave = ?').bind(llave).first();
  if (freno && freno.bloqueado_hasta > t) {
    const min = Math.ceil((freno.bloqueado_hasta - t) / 60);
    return err(c, `Demasiados intentos. Vuelve a intentar en ${min} minuto${min === 1 ? '' : 's'}.`, 429);
  }

  if (!c.env.CLAVE_ROSTER || !igualSeguro(String(clave || ''), c.env.CLAVE_ROSTER)) {
    const fallos = (freno?.fallos || 0) + 1;
    let castigos = freno?.castigos || 0;
    let hasta = 0;
    if (fallos >= 3) {
      const escalera = [15 * 60, 60 * 60, 4 * 60 * 60, 24 * 60 * 60];
      hasta = t + escalera[Math.min(castigos, escalera.length - 1)];
      castigos += 1;
    }
    await c.env.DB.prepare(
      `INSERT INTO intentos_admin (llave, fallos, castigos, bloqueado_hasta, visto_en) VALUES (?,?,?,?,?)
       ON CONFLICT(llave) DO UPDATE SET fallos=excluded.fallos, castigos=excluded.castigos,
       bloqueado_hasta=excluded.bloqueado_hasta, visto_en=excluded.visto_en`
    ).bind(llave, hasta ? 0 : fallos, castigos, hasta, t).run();
    return err(c, 'Esa no es la clave.', 401);
  }

  await c.env.DB.prepare('DELETE FROM intentos_admin WHERE llave = ?').bind(llave).run();
  const token = await firmar({ rol: 'roster', exp: Math.floor(Date.now() / 1000) + 8 * HORAS }, secreto(c.env));
  c.header('Set-Cookie', cookie('roster_admin', token, 8 * HORAS));
  await registra(c.env, 'roster101', 'entro_al_panel');
  return c.json({ ok: true });
});

app.post('/api/roster/salir', (c) => {
  c.header('Set-Cookie', cookie('roster_admin', '', 0));
  return c.json({ ok: true });
});

app.get('/api/roster/empresas', exigeRoster, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM empresas ORDER BY creado_en DESC').all();
  const empresas = [];
  for (const e of results || []) {
    const docs = await documentosDe(c.env, e.id);
    empresas.push({ ...e, documentos: docs, faltantes: faltantesDe(e, docs) });
  }
  return c.json({ empresas, docs: DOCS_EMPRESA, nombres_doc: NOMBRES_DOC });
});

// Invitar: se crea el registro y se le manda la liga al representante.
app.post('/api/roster/invitar', exigeRoster, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const nombre = String(cuerpo.nombre || '').trim();
  const correo = normalizaEmail(cuerpo.correo_contacto);
  if (!nombre) return err(c, 'Falta el nombre de la empresa.');
  if (!correo) return err(c, 'Falta el correo de quien va a llenar.');

  const repetido = await c.env.DB.prepare('SELECT id FROM empresas WHERE correo_contacto = ?').bind(correo).first();
  if (repetido) return err(c, 'Ese correo ya tiene una invitación.', 409);

  const id = uuid();
  const { results } = await c.env.DB.prepare('SELECT MAX(folio) AS ultimo FROM empresas').all();
  const folio = ((results?.[0]?.ultimo) || 0) + 1;
  await c.env.DB.prepare(
    'INSERT INTO empresas (id, folio, nombre, correo_contacto, estado, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?)'
  ).bind(id, folio, nombre, correo, 'invitada', ahora(), ahora()).run();

  const liga = c.env.LIGA_CENTRAL || new URL(c.req.url).origin;
  if (c.env.RESEND_API_KEY) {
    await enviarCorreo(c.env, { para: correo, ...correoInvitacion(nombre, liga, correo) });
  }
  await registra(c.env, 'roster101', 'invito', `${nombre} <${correo}>`);
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(id).first();
  return c.json({ ok: true, empresa, correo_enviado: !!c.env.RESEND_API_KEY });
});

app.post('/api/roster/recordar/:id', exigeRoster, async (c) => {
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(c.req.param('id')).first();
  if (!empresa) return err(c, 'No encontramos esa empresa.', 404);
  const docs = await documentosDe(c.env, empresa.id);
  const liga = c.env.LIGA_CENTRAL || new URL(c.req.url).origin;
  if (!c.env.RESEND_API_KEY) return err(c, 'El correo no está configurado.', 503);
  await enviarCorreo(c.env, { para: empresa.correo_contacto, ...correoRecordatorio(empresa, faltantesDe(empresa, docs), liga) });
  await registra(c.env, 'roster101', 'recordatorio', empresa.nombre);
  return c.json({ ok: true });
});

// Revisada: Mike ya la vio y está de acuerdo. Es el paso antes de abrirle.
app.post('/api/roster/revisar/:id', exigeRoster, async (c) => {
  const { nota = '' } = await c.req.json().catch(() => ({}));
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(c.req.param('id')).first();
  if (!empresa) return err(c, 'No encontramos esa empresa.', 404);
  await c.env.DB.prepare('UPDATE empresas SET estado = ?, nota = ?, actualizado_en = ? WHERE id = ?')
    .bind('revisada', String(nota).slice(0, 400), ahora(), empresa.id).run();
  await registra(c.env, 'roster101', 'revisada', empresa.nombre);
  return c.json({ ok: true });
});

// Regresarla: algo no cuadra y se le pide corregir. Le llega el correo con la
// razón, para que no se quede esperando.
app.post('/api/roster/regresar/:id', exigeRoster, async (c) => {
  const { nota = '' } = await c.req.json().catch(() => ({}));
  if (!String(nota).trim()) return err(c, 'Escribe qué hay que corregir: es lo que va a leer la empresa.');
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(c.req.param('id')).first();
  if (!empresa) return err(c, 'No encontramos esa empresa.', 404);
  await c.env.DB.prepare('UPDATE empresas SET estado = ?, nota = ?, actualizado_en = ? WHERE id = ?')
    .bind('llenando', String(nota).slice(0, 400), ahora(), empresa.id).run();
  const liga = c.env.LIGA_CENTRAL || new URL(c.req.url).origin;
  if (c.env.RESEND_API_KEY) {
    await enviarCorreo(c.env, { para: empresa.correo_contacto, ...correoRecordatorio(empresa, [], liga, String(nota)) });
  }
  await registra(c.env, 'roster101', 'regresada', `${empresa.nombre}: ${nota}`);
  return c.json({ ok: true });
});

// Abrirle su portal: se dispara el flujo de alta que ya está probado, con los
// datos que la propia empresa capturó. Si no hay llave de GitHub configurada,
// se dice claro y se devuelven los datos para hacerlo a mano.
app.post('/api/roster/abrir/:id', exigeRoster, async (c) => {
  const empresa = await c.env.DB.prepare('SELECT * FROM empresas WHERE id = ?').bind(c.req.param('id')).first();
  if (!empresa) return err(c, 'No encontramos esa empresa.', 404);
  const docs = await documentosDe(c.env, empresa.id);
  const faltantes = faltantesDe(empresa, docs);
  if (faltantes.length) return err(c, 'Todavía le falta algo a esta empresa.', 422, { faltantes });

  const entradas = {
    slug: empresa.slug || nombreCorto(empresa.nombre),
    empresa: empresa.nombre,
    razon_social: empresa.razon_social,
    domicilio: empresa.domicilio,
    correo_privacidad: empresa.correo_privacidad,
    correo_avisos: empresa.correo_avisos || empresa.correo_contacto,
    correo_contacto: empresa.correo_contacto,
    simulacro: 'false',
  };

  if (!c.env.GITHUB_TOKEN || !c.env.GITHUB_REPO) {
    return err(c, 'Falta configurar la llave de GitHub para disparar el alta. Mientras, córrela a mano con estos datos.', 503, { entradas });
  }

  const r = await fetch(`https://api.github.com/repos/${c.env.GITHUB_REPO}/actions/workflows/alta-cliente.yml/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${c.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'roster101-central',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main', inputs: entradas }),
  });
  if (!r.ok) {
    const detalle = await r.text();
    console.error('dispatch alta', r.status, detalle);
    return err(c, 'No se pudo disparar el alta en GitHub.', 502, { entradas });
  }

  await c.env.DB.prepare('UPDATE empresas SET estado = ?, abierto_en = ?, actualizado_en = ? WHERE id = ?')
    .bind('activa', ahora(), ahora(), empresa.id).run();
  await registra(c.env, 'roster101', 'portal_abierto', empresa.nombre);
  return c.json({ ok: true, entradas });
});

/* ─────────────────────── lo demás ─────────────────────── */

app.get('/api/salud', (c) => c.json({ ok: true, servicio: 'roster101 central', hora: ahora() }));

app.get('/api/config', (c) => c.json({
  version: c.env.PORTAL_VERSION || '',
  docs: DOCS_EMPRESA,
  obligatorios: DOCS_OBLIGATORIOS,
}));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
