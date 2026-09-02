// Portal de Trabajadores — Taller 101
// Cloudflare Worker + D1 + R2

import { Hono } from 'hono';
import {
  ahora, uuid, firmar, verificar, sha256, igualSeguro,
  cookie, leerCookie, normalizaEmail, limpiaNombre, csvCampo,
} from './lib.js';
import {
  revisaExpediente, emailValido,
  DOCS_OBLIGATORIOS, DOCS_OPCIONALES, NOMBRES_DOC,
} from './validar.js';
import { enviarCorreo, correoCodigo, correoConfirmacion, correoAvisoAdmin } from './correo.js';
import { armaZip, exportarCsv } from './exportar.js';

const app = new Hono();

const HORAS = 3600;
const VIDA_SESION = 12 * HORAS;
const MAX_ARCHIVO = 10 * 1024 * 1024; // 10 MB
const MIMES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);
const TIPOS = new Set([...DOCS_OBLIGATORIOS, ...DOCS_OPCIONALES]);

const err = (c, msg, code = 400, extra = {}) => c.json({ error: msg, ...extra }, code);

function secreto(env) {
  const s = env.SECRETO;
  if (!s) throw new Error('Falta el secreto SECRETO (wrangler secret put SECRETO)');
  return s;
}

async function registra(env, quien, accion, detalle = '') {
  try {
    await env.DB.prepare('INSERT INTO bitacora (cuando, quien, accion, detalle) VALUES (?,?,?,?)')
      .bind(ahora(), quien, accion, detalle).run();
  } catch (e) { console.error('bitacora', e); }
}

// ─────────────────────────── sesión ───────────────────────────

async function sesionTrabajador(c) {
  const tok = leerCookie(c.req, 't101_sesion');
  const datos = await verificar(tok, secreto(c.env));
  if (!datos || datos.rol !== 'trabajador') return null;
  return datos;
}

async function sesionAdmin(c) {
  const tok = leerCookie(c.req, 't101_admin');
  const datos = await verificar(tok, secreto(c.env));
  if (!datos || datos.rol !== 'admin') return null;
  return datos;
}

const exigeTrabajador = async (c, next) => {
  const s = await sesionTrabajador(c);
  if (!s) return err(c, 'Tu sesión venció. Vuelve a entrar con tu correo.', 401);
  c.set('trabajador', s);
  await next();
};

const exigeAdmin = async (c, next) => {
  const s = await sesionAdmin(c);
  if (!s) return err(c, 'Sesión de administración requerida.', 401);
  await next();
};

// ─────────────────── acceso por código de correo ───────────────────

app.post('/api/codigo', async (c) => {
  const { email: crudo } = await c.req.json().catch(() => ({}));
  const email = normalizaEmail(crudo);
  if (!emailValido(email)) return err(c, 'Escribe un correo válido.');

  // Sin llave de correo no hay forma de entregar el código: mejor decirlo de frente
  // que dejar al trabajador esperando un correo que nunca va a llegar.
  if (!c.env.RESEND_API_KEY && c.env.MODO_PRUEBA !== '1') {
    return err(c, 'El portal todavía no está habilitado para recibir registros. Avísale a administración de Taller 101.', 503);
  }

  const previo = await c.env.DB.prepare('SELECT enviado_en FROM codigos WHERE email = ?').bind(email).first();
  const t = Date.now();
  if (previo && t - previo.enviado_en < 45_000) {
    return err(c, 'Ya enviamos un código hace un momento. Revisa tu correo o espera 45 segundos.', 429);
  }

  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await sha256(codigo + '|' + email + '|' + secreto(c.env));
  await c.env.DB.prepare(
    `INSERT INTO codigos (email, hash, expira, intentos, enviado_en) VALUES (?,?,?,0,?)
     ON CONFLICT(email) DO UPDATE SET hash=excluded.hash, expira=excluded.expira, intentos=0, enviado_en=excluded.enviado_en`
  ).bind(email, hash, t + 10 * 60_000, t).run();

  const msg = correoCodigo(codigo);
  try {
    await enviarCorreo(c.env, { para: email, ...msg });
  } catch (e) {
    return err(c, 'No pudimos enviar el correo. Verifica la dirección o avísale a administración.', 502);
  }
  await registra(c.env, email, 'codigo_enviado');
  // Solo en desarrollo local (sin llave de correo y con MODO_PRUEBA=1) devolvemos el código
  const enPruebas = !c.env.RESEND_API_KEY && c.env.MODO_PRUEBA === '1';
  return c.json({ ok: true, mensaje: 'Te enviamos un código de 6 dígitos.', ...(enPruebas ? { codigo_prueba: codigo } : {}) });
});

app.post('/api/entrar', async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const email = normalizaEmail(cuerpo.email);
  const codigo = String(cuerpo.codigo || '').replace(/\D/g, '');
  if (!emailValido(email) || codigo.length !== 6) return err(c, 'Correo o código incompleto.');

  const fila = await c.env.DB.prepare('SELECT * FROM codigos WHERE email = ?').bind(email).first();
  if (!fila) return err(c, 'Pide un código nuevo.', 401);
  if (fila.expira < Date.now()) return err(c, 'El código venció. Pide uno nuevo.', 401);
  if (fila.intentos >= 5) return err(c, 'Demasiados intentos. Pide un código nuevo.', 429);

  const hash = await sha256(codigo + '|' + email + '|' + secreto(c.env));
  if (!igualSeguro(hash, fila.hash)) {
    await c.env.DB.prepare('UPDATE codigos SET intentos = intentos + 1 WHERE email = ?').bind(email).run();
    return err(c, 'Código incorrecto.', 401);
  }
  await c.env.DB.prepare('DELETE FROM codigos WHERE email = ?').bind(email).run();

  let t = await c.env.DB.prepare('SELECT * FROM trabajadores WHERE email = ?').bind(email).first();
  if (!t) {
    const id = uuid();
    const n = ahora();
    await c.env.DB.prepare(
      'INSERT INTO trabajadores (id, email, creado_en, actualizado_en) VALUES (?,?,?,?)'
    ).bind(id, email, n, n).run();
    await c.env.DB.prepare('UPDATE trabajadores SET folio = (SELECT COUNT(*) FROM trabajadores) WHERE id = ?').bind(id).run();
    t = await c.env.DB.prepare('SELECT * FROM trabajadores WHERE id = ?').bind(id).first();
    await registra(c.env, email, 'alta');
  }

  const token = await firmar(
    { rol: 'trabajador', id: t.id, email, exp: Math.floor(Date.now() / 1000) + VIDA_SESION },
    secreto(c.env)
  );
  c.header('Set-Cookie', cookie('t101_sesion', token, VIDA_SESION));
  await registra(c.env, email, 'ingreso');
  return c.json({ ok: true, nuevo: !t.nombre });
});

app.post('/api/salir', (c) => {
  c.header('Set-Cookie', cookie('t101_sesion', '', 0));
  return c.json({ ok: true });
});

// ─────────────────────────── expediente ───────────────────────────

async function documentosDe(env, id) {
  const { results } = await env.DB.prepare(
    'SELECT id, tipo, etiqueta, nombre_archivo, mime, tamano, subido_en FROM documentos WHERE trabajador_id = ? ORDER BY subido_en'
  ).bind(id).all();
  return results || [];
}

function faltantesDe(docs) {
  const hay = new Set(docs.map((d) => d.tipo));
  return DOCS_OBLIGATORIOS.filter((t) => !hay.has(t)).map((t) => NOMBRES_DOC[t]);
}

async function consentimientoDe(env, id) {
  return await env.DB.prepare('SELECT version, aceptado_en FROM consentimientos WHERE trabajador_id = ?').bind(id).first();
}

// El aviso de privacidad no es un adorno: sin él aceptado, el portal no guarda
// ni un dato ni un documento. Así el consentimiento es real y queda la constancia.
const exigeAviso = async (c, next) => {
  const s = c.get('trabajador');
  const consent = await consentimientoDe(c.env, s.id);
  if (!consent) return err(c, 'Antes de capturar tus datos tienes que aceptar el aviso de privacidad.', 403, { falta_aviso: true });
  await next();
};

app.post('/api/aviso', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const version = c.env.AVISO_VERSION || '1';
  await c.env.DB.prepare(
    `INSERT INTO consentimientos (trabajador_id, version, aceptado_en) VALUES (?,?,?)
     ON CONFLICT(trabajador_id) DO UPDATE SET version=excluded.version, aceptado_en=excluded.aceptado_en`
  ).bind(s.id, version, ahora()).run();
  await registra(c.env, s.email, 'aviso_aceptado', version);
  return c.json({ ok: true, version, aceptado_en: ahora() });
});

app.get('/api/yo', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const t = await c.env.DB.prepare('SELECT * FROM trabajadores WHERE id = ?').bind(s.id).first();
  if (!t) return err(c, 'No encontramos tu expediente.', 404);
  const docs = await documentosDe(c.env, s.id);
  const consent = await consentimientoDe(c.env, s.id);
  return c.json({ trabajador: t, documentos: docs, faltantes: faltantesDe(docs), aviso: consent || null });
});

app.put('/api/yo', exigeTrabajador, exigeAviso, async (c) => {
  const s = c.get('trabajador');
  const cuerpo = await c.req.json().catch(() => ({}));
  const { errores, limpio, ok } = revisaExpediente(cuerpo);
  const parcial = cuerpo.__parcial === true;

  if (!ok && !parcial) return err(c, 'Revisa los datos marcados.', 422, { errores });

  const dup = await c.env.DB.prepare(
    'SELECT id FROM trabajadores WHERE (curp = ? OR nss = ?) AND curp != "" AND id != ?'
  ).bind(limpio.curp, limpio.nss, s.id).first();
  if (dup && limpio.curp) return err(c, 'Esa CURP o NSS ya está registrada con otro correo. Avísale a administración.', 409);

  const docs = await documentosDe(c.env, s.id);
  const faltantes = faltantesDe(docs);
  const estado = ok && faltantes.length === 0 ? 'completo' : 'borrador';

  await c.env.DB.prepare(
    `UPDATE trabajadores SET nombre=?, apellido_paterno=?, apellido_materno=?, celular=?, nss=?, curp=?, rfc=?,
     banco=?, clabe=?, beneficiario=?, emerg_nombre=?, emerg_telefono=?, emerg_email=?, puesto=?,
     estado=?, actualizado_en=?, confirmado_en=COALESCE(confirmado_en, ?) WHERE id=?`
  ).bind(
    limpio.nombre, limpio.apellido_paterno, limpio.apellido_materno, limpio.celular, limpio.nss,
    limpio.curp, limpio.rfc, limpio.banco, limpio.clabe, limpio.beneficiario,
    limpio.emerg_nombre, limpio.emerg_telefono, limpio.emerg_email, limpio.puesto,
    estado, ahora(), ok ? ahora() : null, s.id
  ).run();

  const t = await c.env.DB.prepare('SELECT * FROM trabajadores WHERE id = ?').bind(s.id).first();

  if (ok && !parcial) {
    c.executionCtx.waitUntil((async () => {
      try {
        await enviarCorreo(c.env, { para: t.email, ...correoConfirmacion(t, faltantes) });
        if (c.env.CORREO_AVISOS) {
          await enviarCorreo(c.env, { para: c.env.CORREO_AVISOS, ...correoAvisoAdmin(t, faltantes) });
        }
      } catch (e) { console.error('correo confirmación', e); }
    })());
    await registra(c.env, t.email, 'expediente_guardado', estado);
  }

  return c.json({ ok: true, trabajador: t, faltantes, estado, correo_enviado: ok && !parcial });
});

// ─────────────────────────── documentos ───────────────────────────

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'application/pdf': 'pdf' };

app.post('/api/docs', exigeTrabajador, exigeAviso, async (c) => {
  const s = c.get('trabajador');
  const form = await c.req.formData().catch(() => null);
  if (!form) return err(c, 'No recibimos el archivo.');
  const tipo = String(form.get('tipo') || '');
  const etiqueta = String(form.get('etiqueta') || '').slice(0, 80);
  const archivo = form.get('archivo');

  if (!TIPOS.has(tipo)) return err(c, 'Tipo de documento no reconocido.');
  if (!archivo || typeof archivo === 'string') return err(c, 'Falta el archivo.');
  if (archivo.size > MAX_ARCHIVO) return err(c, 'El archivo pesa más de 10 MB. Toma la foto en menor calidad o comprime el PDF.');
  if (!MIMES.has(archivo.type)) return err(c, 'Solo aceptamos JPG, PNG, WEBP, HEIC o PDF.');

  const ext = EXT[archivo.type] || 'bin';
  const llave = `trabajadores/${s.id}/${tipo}-${Date.now()}.${ext}`;
  await c.env.DOCS.put(llave, archivo.stream(), { httpMetadata: { contentType: archivo.type } });

  // Un solo archivo por tipo, salvo "otro" y "dc3"
  if (tipo !== 'otro' && tipo !== 'dc3') {
    const viejos = await c.env.DB.prepare('SELECT id, llave FROM documentos WHERE trabajador_id = ? AND tipo = ?').bind(s.id, tipo).all();
    for (const v of viejos.results || []) {
      await c.env.DOCS.delete(v.llave).catch(() => {});
      await c.env.DB.prepare('DELETE FROM documentos WHERE id = ?').bind(v.id).run();
    }
  }

  const id = uuid();
  await c.env.DB.prepare(
    'INSERT INTO documentos (id, trabajador_id, tipo, etiqueta, nombre_archivo, llave, mime, tamano, subido_en) VALUES (?,?,?,?,?,?,?,?,?)'
  ).bind(id, s.id, tipo, etiqueta, archivo.name || `${tipo}.${ext}`, llave, archivo.type, archivo.size, ahora()).run();

  await c.env.DB.prepare('UPDATE trabajadores SET actualizado_en = ? WHERE id = ?').bind(ahora(), s.id).run();
  const docs = await documentosDe(c.env, s.id);
  await registra(c.env, s.email, 'documento_subido', tipo);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(docs) });
});

app.delete('/api/docs/:id', exigeTrabajador, async (c) => {
  const s = c.get('trabajador');
  const d = await c.env.DB.prepare('SELECT * FROM documentos WHERE id = ? AND trabajador_id = ?').bind(c.req.param('id'), s.id).first();
  if (!d) return err(c, 'Documento no encontrado.', 404);
  await c.env.DOCS.delete(d.llave).catch(() => {});
  await c.env.DB.prepare('DELETE FROM documentos WHERE id = ?').bind(d.id).run();
  const docs = await documentosDe(c.env, s.id);
  return c.json({ ok: true, documentos: docs, faltantes: faltantesDe(docs) });
});

app.get('/api/docs/:id/archivo', async (c) => {
  const st = await sesionTrabajador(c);
  const sa = await sesionAdmin(c);
  if (!st && !sa) return err(c, 'No autorizado.', 401);
  const d = await c.env.DB.prepare('SELECT * FROM documentos WHERE id = ?').bind(c.req.param('id')).first();
  if (!d) return err(c, 'Documento no encontrado.', 404);
  if (!sa && d.trabajador_id !== st.id) return err(c, 'No autorizado.', 403);
  const obj = await c.env.DOCS.get(d.llave);
  if (!obj) return err(c, 'El archivo ya no está en el almacenamiento.', 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': d.mime,
      'Content-Disposition': `inline; filename="${limpiaNombre(d.nombre_archivo)}"`,
      'Cache-Control': 'private, max-age=60',
    },
  });
});

// ─────────────────────────── administración ───────────────────────────

app.post('/api/admin/entrar', async (c) => {
  const { clave } = await c.req.json().catch(() => ({}));
  if (!c.env.CLAVE_ADMIN) return err(c, 'Falta configurar CLAVE_ADMIN.', 500);
  const a = await sha256(String(clave || ''));
  const b = await sha256(c.env.CLAVE_ADMIN);
  if (!igualSeguro(a, b)) {
    await new Promise((r) => setTimeout(r, 700));
    return err(c, 'Clave incorrecta.', 401);
  }
  const token = await firmar({ rol: 'admin', exp: Math.floor(Date.now() / 1000) + 8 * HORAS }, secreto(c.env));
  c.header('Set-Cookie', cookie('t101_admin', token, 8 * HORAS));
  await registra(c.env, 'admin', 'ingreso_admin');
  return c.json({ ok: true });
});

app.post('/api/admin/salir', (c) => {
  c.header('Set-Cookie', cookie('t101_admin', '', 0));
  return c.json({ ok: true });
});

app.get('/api/admin/trabajadores', exigeAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM trabajadores ORDER BY apellido_paterno, apellido_materno, nombre').all();
  const docs = await c.env.DB.prepare('SELECT id, trabajador_id, tipo, etiqueta, nombre_archivo, mime, tamano FROM documentos').all();
  const porTrab = {};
  for (const d of docs.results || []) (porTrab[d.trabajador_id] ||= []).push(d);
  const lista = (results || []).map((t) => {
    const ds = porTrab[t.id] || [];
    return { ...t, documentos: ds, faltantes: faltantesDe(ds) };
  });
  return c.json({ trabajadores: lista, nombres_doc: NOMBRES_DOC });
});

app.delete('/api/admin/trabajadores/:id', exigeAdmin, async (c) => {
  const id = c.req.param('id');
  const { results } = await c.env.DB.prepare('SELECT llave FROM documentos WHERE trabajador_id = ?').bind(id).all();
  for (const d of results || []) await c.env.DOCS.delete(d.llave).catch(() => {});
  await c.env.DB.prepare('DELETE FROM documentos WHERE trabajador_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM trabajadores WHERE id = ?').bind(id).run();
  await registra(c.env, 'admin', 'baja_trabajador', id);
  return c.json({ ok: true });
});

app.get('/api/admin/exportar', exigeAdmin, async (c) => {
  const zip = await armaZip(c.env);
  const fecha = new Date().toISOString().slice(0, 10);
  await registra(c.env, 'admin', 'exportacion');
  return new Response(zip, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="Expedientes Taller 101 ${fecha}.zip"`,
    },
  });
});

app.get('/api/admin/tabla.csv', exigeAdmin, async (c) => {
  const csv = await exportarCsv(c.env);
  return new Response('﻿' + csv, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="Trabajadores Taller 101.csv"' },
  });
});

app.get('/api/salud', (c) => c.json({ ok: true, servicio: 'Portal Taller 101', hora: ahora() }));

// Datos del responsable: los lee el navegador para armar el aviso de privacidad.
app.get('/api/config', (c) => c.json({
  empresa: c.env.EMPRESA || 'la empresa',
  razon_social: c.env.RAZON_SOCIAL || c.env.EMPRESA || 'la empresa',
  domicilio: c.env.DOMICILIO || '',
  correo_privacidad: c.env.CORREO_PRIVACIDAD || c.env.CORREO_AVISOS || '',
  aviso_version: c.env.AVISO_VERSION || '1',
}));

// ─────────────────────────── estáticos ───────────────────────────

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
