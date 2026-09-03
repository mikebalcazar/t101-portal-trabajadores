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
import { armaFichas, nombreArchivoFichas, CAMPOS_FICHA, CAMPOS_POR_DEFECTO } from './ficha.js';

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

// ───────────────────────── papelera ─────────────────────────
// Dar de baja no borra: aparta. Un expediente apartado desaparece del panel,
// del CSV, del ZIP y de las fichas, y deja de estorbar para registrar de nuevo
// esa CURP o ese NSS. A los 30 días se borra de verdad, con sus documentos.
// Hasta entonces se puede devolver.

const DIAS_PAPELERA = 30;
const SOLO_VIVOS = 'id NOT IN (SELECT trabajador_id FROM papelera)';

// Borra de verdad a un trabajador: primero los archivos, luego los renglones.
// Si un archivo ya no está en R2 no importa: lo que se busca es que no quede.
async function borraDeVerdad(env, id) {
  const { results } = await env.DB.prepare('SELECT llave FROM documentos WHERE trabajador_id = ?').bind(id).all();
  for (const d of results || []) await env.DOCS.delete(d.llave).catch(() => {});
  await env.DB.prepare('DELETE FROM documentos WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM consentimientos WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM papelera WHERE trabajador_id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM trabajadores WHERE id = ?').bind(id).run();
}

// Vacía lo que ya cumplió sus 30 días. Se llama sola todas las madrugadas y
// también cada vez que la administración abre el panel, por si el reloj de
// Cloudflare no corrió: así el plazo se cumple aunque falle una de las dos.
async function vaciaVencidos(env) {
  const t = Math.floor(Date.now() / 1000);
  const { results } = await env.DB.prepare(
    'SELECT trabajador_id FROM papelera WHERE borra_el <= ?'
  ).bind(t).all();
  const ids = (results || []).map((r) => r.trabajador_id);
  for (const id of ids) {
    await borraDeVerdad(env, id);
    await registra(env, 'sistema', 'borrado_definitivo', `${id} (cumplió ${DIAS_PAPELERA} días en la papelera)`);
  }
  return ids.length;
}

async function estaEnPapelera(env, id) {
  return await env.DB.prepare('SELECT * FROM papelera WHERE trabajador_id = ?').bind(id).first();
}

// ───────────────── datos que no se pueden repetir ─────────────────
// Cada uno de estos identifica a una sola persona: si aparece en dos expedientes,
// o hubo un error de dedo o alguien se está registrando dos veces. El portal no
// deja guardarlo y la administración los ve juntos en su panel.

const UNICOS = [
  ['curp',    'la CURP',    'Esta CURP ya está registrada en otro expediente.'],
  ['nss',     'el NSS',     'Este NSS ya está registrado en otro expediente.'],
  ['rfc',     'el RFC',     'Este RFC ya está registrado en otro expediente.'],
  ['celular', 'el celular', 'Este celular ya está registrado en otro expediente.'],
  ['email',   'el correo',  'Este correo ya está registrado en otro expediente.'],
];

// Devuelve los campos del expediente que chocan con OTRO trabajador.
// A propósito no se dice con quién: eso son datos de un tercero y el trabajador
// no tiene por qué verlos. Quien los ve es la administración, en su panel.
async function choquesDe(env, id, datos) {
  const choques = [];
  for (const [campo, nombre, mensaje] of UNICOS) {
    const valor = String(datos[campo] || '').trim();
    if (!valor) continue;
    const otro = await env.DB.prepare(
      `SELECT id FROM trabajadores WHERE ${campo} = ? AND id != ? AND ${SOLO_VIVOS} LIMIT 1`
    ).bind(valor, id).first();
    if (otro) choques.push({ campo, nombre, mensaje });
  }
  return choques;
}

function enumera(cosas) {
  if (cosas.length === 1) return cosas[0];
  return cosas.slice(0, -1).join(', ') + ' y ' + cosas[cosas.length - 1];
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

  const choques = await choquesDe(c.env, s.id, limpio);
  const avisoChoque = choques.length
    ? `Ya hay otro expediente con ${enumera(choques.map((ch) => ch.nombre))}. Revisa que no sea un error de dedo; si el dato es correcto, avísale a administración de Taller 101.`
    : '';
  const erroresChoque = {};
  for (const ch of choques) erroresChoque[ch.campo] = ch.mensaje;

  if (choques.length && !parcial) {
    return err(c, avisoChoque, 409, { errores: erroresChoque, duplicados: choques.map((ch) => ch.campo) });
  }

  // Guardando a medias: el dato repetido no se guarda, pero todo lo demás sí. Si
  // le trabáramos el guardado completo, un solo campo con problema le tiraría el
  // avance de toda la sesión y se rinde antes de terminar el expediente.
  for (const ch of choques) limpio[ch.campo] = '';

  const docs = await documentosDe(c.env, s.id);
  const faltantes = faltantesDe(docs);
  // Con un dato repetido el expediente no puede darse por bueno, aunque lo demás esté.
  const estado = ok && !choques.length && faltantes.length === 0 ? 'completo' : 'borrador';

  await c.env.DB.prepare(
    `UPDATE trabajadores SET nombre=?, apellido_paterno=?, apellido_materno=?, celular=?, nss=?, curp=?, rfc=?,
     banco=?, clabe=?, beneficiario=?, emerg_nombre=?, emerg_telefono=?, emerg_email=?, puesto=?,
     estado=?, actualizado_en=?, confirmado_en=COALESCE(confirmado_en, ?) WHERE id=?`
  ).bind(
    limpio.nombre, limpio.apellido_paterno, limpio.apellido_materno, limpio.celular, limpio.nss,
    limpio.curp, limpio.rfc, limpio.banco, limpio.clabe, limpio.beneficiario,
    limpio.emerg_nombre, limpio.emerg_telefono, limpio.emerg_email, limpio.puesto,
    estado, ahora(), ok && !choques.length ? ahora() : null, s.id
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

  return c.json({
    ok: true, trabajador: t, faltantes, estado, correo_enviado: ok && !parcial,
    ...(choques.length ? { errores: erroresChoque, duplicados: choques.map((ch) => ch.campo), aviso: avisoChoque } : {}),
  });
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

// ─────────────────── freno contra adivinar la clave ───────────────────
// Tres fallos seguidos desde una misma dirección de internet y esa dirección
// queda bloqueada. Cada bloqueo siguiente dura más que el anterior. El bloqueo
// es por dirección, no global, para que nadie pueda dejar a la administración
// fuera de su propio panel a puros intentos fallidos.

const FALLOS_PERMITIDOS = 3;
const CASTIGOS = [15 * 60, 60 * 60, 4 * 3600, 24 * 3600]; // segundos
const OLVIDO = 30 * 60; // fallos sueltos se perdonan a la media hora

function quienIntenta(c) {
  return (
    c.req.header('CF-Connecting-IP') ||
    (c.req.header('x-forwarded-for') || '').split(',')[0].trim() ||
    'desconocido'
  );
}

function esperaLegible(seg) {
  const min = Math.ceil(seg / 60);
  if (min <= 1) return 'un minuto';
  if (min < 90) return `${min} minutos`;
  const hrs = Math.round(min / 60);
  return hrs === 1 ? 'una hora' : `${hrs} horas`;
}

async function leeIntentos(env, llave) {
  try {
    return await env.DB.prepare('SELECT * FROM intentos_admin WHERE llave = ?').bind(llave).first();
  } catch (e) { console.error('intentos_admin lee', e); return null; }
}

async function guardaIntentos(env, llave, fallos, castigos, hasta, t) {
  try {
    await env.DB.prepare(
      `INSERT INTO intentos_admin (llave, fallos, castigos, bloqueado_hasta, visto_en)
       VALUES (?,?,?,?,?)
       ON CONFLICT(llave) DO UPDATE SET
         fallos = excluded.fallos,
         castigos = excluded.castigos,
         bloqueado_hasta = excluded.bloqueado_hasta,
         visto_en = excluded.visto_en`
    ).bind(llave, fallos, castigos, hasta, t).run();
  } catch (e) { console.error('intentos_admin guarda', e); }
}

async function limpiaIntentos(env, llave, t) {
  try {
    await env.DB.prepare('DELETE FROM intentos_admin WHERE llave = ?').bind(llave).run();
    // De paso, tira los renglones viejos que ya no bloquean nada.
    await env.DB.prepare('DELETE FROM intentos_admin WHERE bloqueado_hasta < ? AND visto_en < ?')
      .bind(t, t - OLVIDO).run();
  } catch (e) { console.error('intentos_admin limpia', e); }
}

app.post('/api/admin/entrar', async (c) => {
  const { clave } = await c.req.json().catch(() => ({}));
  if (!c.env.CLAVE_ADMIN) return err(c, 'Falta configurar CLAVE_ADMIN.', 500);

  const llave = quienIntenta(c);
  const t = Math.floor(Date.now() / 1000);
  const previo = await leeIntentos(c.env, llave);

  // Bloqueado: se contesta sin tocar la base, para que un ataque no pueda
  // gastar la cuota de escrituras a punta de intentos.
  if (previo && previo.bloqueado_hasta > t) {
    return err(
      c,
      `Demasiados intentos fallidos. Este dispositivo queda bloqueado; vuelve a intentar en ${esperaLegible(previo.bloqueado_hasta - t)}.`,
      429,
      { espera: previo.bloqueado_hasta - t }
    );
  }

  const a = await sha256(String(clave || ''));
  const b = await sha256(c.env.CLAVE_ADMIN);

  if (!igualSeguro(a, b)) {
    await new Promise((r) => setTimeout(r, 700));

    const sigueLaRacha = previo && (t - previo.visto_en) < OLVIDO;
    const fallos = (sigueLaRacha ? previo.fallos : 0) + 1;
    let castigos = previo ? previo.castigos : 0;

    if (fallos >= FALLOS_PERMITIDOS) {
      const dura = CASTIGOS[Math.min(castigos, CASTIGOS.length - 1)];
      castigos += 1;
      const hasta = t + dura;
      // El contador vuelve a cero: los tres siguientes fallos ganan el castigo
      // que sigue, más largo.
      await guardaIntentos(c.env, llave, 0, castigos, hasta, t);
      await registra(c.env, llave, 'admin_bloqueado', `${esperaLegible(dura)} (bloqueo #${castigos})`);
      return err(
        c,
        `Clave incorrecta. Por seguridad, el acceso desde este dispositivo queda bloqueado ${esperaLegible(dura)}.`,
        429,
        { espera: dura }
      );
    }

    await guardaIntentos(c.env, llave, fallos, castigos, 0, t);
    await registra(c.env, llave, 'admin_clave_mala', `intento ${fallos} de ${FALLOS_PERMITIDOS}`);
    const quedan = FALLOS_PERMITIDOS - fallos;
    return err(
      c,
      `Clave incorrecta. Te queda${quedan === 1 ? '' : 'n'} ${quedan} intento${quedan === 1 ? '' : 's'} antes de que se bloquee el acceso.`,
      401,
      { quedan }
    );
  }

  if (previo) await limpiaIntentos(c.env, llave, t);
  const token = await firmar({ rol: 'admin', exp: Math.floor(Date.now() / 1000) + 8 * HORAS }, secreto(c.env));
  c.header('Set-Cookie', cookie('t101_admin', token, 8 * HORAS));
  await registra(c.env, 'admin', 'ingreso_admin');
  return c.json({ ok: true });
});

app.post('/api/admin/salir', (c) => {
  c.header('Set-Cookie', cookie('t101_admin', '', 0));
  return c.json({ ok: true });
});

// Choques entre expedientes que ya están guardados. Sirve para lo que entró
// antes de este freno, y para lo que se haya cargado a mano.
// Ficha de trabajador en PDF, de uno o de varios. Pensada para mandarse desde el
// celular: el panel la comparte con el botón de compartir del teléfono.
//
// Los datos bancarios NO van por default. Van solo si quien exporta lo pide, para
// que una ficha que se manda por WhatsApp no lleve la CLABE de nadie sin querer.
const TOPE_FICHAS = 50;

const IDS_CAMPOS = new Set(CAMPOS_FICHA.map((x) => x.id));

app.post('/api/admin/fichas', exigeAdmin, async (c) => {
  const cuerpo = await c.req.json().catch(() => ({}));
  const pedidos = Array.isArray(cuerpo.ids) ? cuerpo.ids.filter((x) => typeof x === 'string' && x) : [];

  // Qué campos van en la hoja. Si no mandan lista, la ficha sale completa menos
  // los datos bancarios, como salía antes. `banco: true` se sigue entendiendo.
  const campos = Array.isArray(cuerpo.campos)
    ? cuerpo.campos.filter((x) => IDS_CAMPOS.has(x))
    : [...CAMPOS_POR_DEFECTO];
  if (cuerpo.banco === true && !campos.includes('banco')) campos.push('banco');
  const conBanco = campos.includes('banco');

  if (!pedidos.length) return err(c, 'Selecciona al menos un trabajador.', 400);
  if (pedidos.length > TOPE_FICHAS) {
    return err(c, `Son muchas de golpe. Haz tandas de ${TOPE_FICHAS} o menos.`, 400);
  }

  const marcas = pedidos.map(() => '?').join(',');
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM trabajadores WHERE id IN (${marcas}) AND ${SOLO_VIVOS}
     ORDER BY apellido_paterno, apellido_materno, nombre`
  ).bind(...pedidos).all();
  const gente = results || [];
  if (!gente.length) return err(c, 'No encontré esos expedientes.', 404);

  for (const t of gente) {
    t.__foto = null;
    // Si la ficha va sin fotografía, ni se busca: es un archivo menos que sacar
    // de R2 y una foto menos rodando en un PDF que no la necesita.
    const foto = !campos.includes('foto') ? null : await c.env.DB.prepare(
      "SELECT llave, mime FROM documentos WHERE trabajador_id = ? AND tipo = 'foto' ORDER BY subido_en DESC LIMIT 1"
    ).bind(t.id).first();
    if (foto) {
      // Solo el JPEG se puede pegar tal cual dentro del PDF. Si subió PNG o PDF,
      // la ficha sale con el recuadro vacío y avisa, en vez de mentir.
      if (foto.mime === 'image/jpeg') {
        const obj = await c.env.DOCS.get(foto.llave);
        if (obj) t.__foto = { bytes: new Uint8Array(await obj.arrayBuffer()) };
        else t.__foto = { bytes: null };
      } else {
        t.__foto = { bytes: null };
      }
    }
  }

  const fecha = new Date().toLocaleDateString('es-MX', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const pdf = armaFichas(gente, {
    empresa: c.env.EMPRESA || 'Taller 101',
    campos, fecha,
  });

  const nombre = nombreArchivoFichas(gente, new Date().toISOString().slice(0, 10));
  const simple = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '');
  await registra(c.env, 'admin', 'fichas_pdf', `${gente.length} ficha(s) con: ${campos.join(', ') || 'solo el nombre'}`);

  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${simple}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      'Cache-Control': 'no-store',
    },
  });
});

app.get('/api/admin/duplicados', exigeAdmin, async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, folio, nombre, apellido_paterno, apellido_materno, email, celular, nss, curp, rfc, estado
     FROM trabajadores WHERE ${SOLO_VIVOS}`
  ).all();
  const gente = results || [];
  const grupos = [];
  for (const [campo, nombre] of UNICOS) {
    const por = new Map();
    for (const t of gente) {
      const v = String(t[campo] || '').trim();
      if (!v) continue;
      if (!por.has(v)) por.set(v, []);
      por.get(v).push(t);
    }
    for (const [valor, quienes] of por) {
      if (quienes.length > 1) grupos.push({ campo, nombre, valor, trabajadores: quienes });
    }
  }
  return c.json({ duplicados: grupos });
});

app.get('/api/admin/trabajadores', exigeAdmin, async (c) => {
  await vaciaVencidos(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM trabajadores WHERE ${SOLO_VIVOS} ORDER BY apellido_paterno, apellido_materno, nombre`
  ).all();
  const docs = await c.env.DB.prepare('SELECT id, trabajador_id, tipo, etiqueta, nombre_archivo, mime, tamano FROM documentos').all();
  const porTrab = {};
  for (const d of docs.results || []) (porTrab[d.trabajador_id] ||= []).push(d);
  const lista = (results || []).map((t) => {
    const ds = porTrab[t.id] || [];
    return { ...t, documentos: ds, faltantes: faltantesDe(ds) };
  });
  return c.json({ trabajadores: lista, nombres_doc: NOMBRES_DOC });
});

// Dar de baja: se manda a la papelera, no se borra.
app.delete('/api/admin/trabajadores/:id', exigeAdmin, async (c) => {
  const id = c.req.param('id');
  const t = await c.env.DB.prepare('SELECT id, email FROM trabajadores WHERE id = ?').bind(id).first();
  if (!t) return err(c, 'Ese trabajador ya no está.', 404);
  if (await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador ya está en la papelera.', 409);

  const ahoraSeg = Math.floor(Date.now() / 1000);
  await c.env.DB.prepare(
    'INSERT INTO papelera (trabajador_id, borrado_en, borra_el) VALUES (?,?,?)'
  ).bind(id, ahora(), ahoraSeg + DIAS_PAPELERA * 86400).run();
  await registra(c.env, 'admin', 'baja_trabajador', `${t.email} → papelera (${DIAS_PAPELERA} días)`);
  return c.json({ ok: true, dias: DIAS_PAPELERA });
});

// Lo que está en la papelera, con los días que le quedan.
app.get('/api/admin/papelera', exigeAdmin, async (c) => {
  await vaciaVencidos(c.env);
  const { results } = await c.env.DB.prepare(
    `SELECT t.id, t.folio, t.nombre, t.apellido_paterno, t.apellido_materno, t.email, t.curp, t.nss,
            p.borrado_en, p.borra_el,
            (SELECT COUNT(*) FROM documentos d WHERE d.trabajador_id = t.id) AS documentos
     FROM papelera p JOIN trabajadores t ON t.id = p.trabajador_id
     ORDER BY p.borra_el`
  ).all();
  const t = Math.floor(Date.now() / 1000);
  const lista = (results || []).map((r) => ({
    ...r,
    dias_restantes: Math.max(0, Math.ceil((r.borra_el - t) / 86400)),
  }));
  return c.json({ papelera: lista, dias: DIAS_PAPELERA });
});

// Devolver a alguien de la papelera. Puede que mientras estuvo apartado alguien
// más se haya registrado con su mismo dato; en ese caso no se devuelve solo,
// porque quedarían dos expedientes con la misma CURP.
app.post('/api/admin/papelera/:id/restaurar', exigeAdmin, async (c) => {
  const id = c.req.param('id');
  if (!await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador no está en la papelera.', 404);
  const t = await c.env.DB.prepare('SELECT * FROM trabajadores WHERE id = ?').bind(id).first();
  if (!t) return err(c, 'Ese expediente ya no existe.', 404);

  const choques = await choquesDe(c.env, id, t);
  if (choques.length) {
    return err(
      c,
      `No lo puedo devolver: mientras estuvo en la papelera, otro expediente se quedó con ${enumera(choques.map((ch) => ch.nombre))}. Resuelve ese choque primero.`,
      409,
      { duplicados: choques.map((ch) => ch.campo) }
    );
  }

  await c.env.DB.prepare('DELETE FROM papelera WHERE trabajador_id = ?').bind(id).run();
  await registra(c.env, 'admin', 'restaurar_trabajador', t.email);
  return c.json({ ok: true });
});

// Borrar ya, sin esperar los 30 días. Esto sí no se deshace.
app.delete('/api/admin/papelera/:id', exigeAdmin, async (c) => {
  const id = c.req.param('id');
  if (!await estaEnPapelera(c.env, id)) return err(c, 'Ese trabajador no está en la papelera.', 404);
  const t = await c.env.DB.prepare('SELECT email FROM trabajadores WHERE id = ?').bind(id).first();
  await borraDeVerdad(c.env, id);
  await registra(c.env, 'admin', 'borrado_definitivo', `${t ? t.email : id} (a mano)`);
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
  version: c.env.PORTAL_VERSION || '',
}));

// ─────────────────────────── estáticos ───────────────────────────

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

// El reloj de Cloudflare pasa cada madrugada a vaciar lo que ya cumplió sus 30
// días en la papelera. El panel también lo hace al abrirse, así que el plazo se
// respeta aunque una de las dos vías falle.
export default {
  fetch: app.fetch,
  async scheduled(evento, env, ctx) {
    ctx.waitUntil((async () => {
      const cuantos = await vaciaVencidos(env);
      if (cuantos) console.log(`papelera: ${cuantos} expediente(s) borrados definitivamente`);
    })());
  },
};
