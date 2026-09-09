// Utilidades comunes — Portal Taller 101

export const ahora = () => new Date().toISOString();

export function uuid() {
  return crypto.randomUUID();
}

const enc = new TextEncoder();

async function claveHmac(secreto) {
  return crypto.subtle.importKey('raw', enc.encode(secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function firmar(payload, secreto) {
  const cuerpo = b64url(enc.encode(JSON.stringify(payload)));
  const k = await claveHmac(secreto);
  const sig = b64url(await crypto.subtle.sign('HMAC', k, enc.encode(cuerpo)));
  return `${cuerpo}.${sig}`;
}

export async function verificar(token, secreto) {
  if (!token || !token.includes('.')) return null;
  const [cuerpo, sig] = token.split('.');
  const k = await claveHmac(secreto);
  const ok = await crypto.subtle.verify('HMAC', k, deB64url(sig), enc.encode(cuerpo));
  if (!ok) return null;
  let datos;
  try { datos = JSON.parse(new TextDecoder().decode(deB64url(cuerpo))); } catch { return null; }
  if (!datos.exp || datos.exp < Math.floor(Date.now() / 1000)) return null;
  return datos;
}

export async function sha256(txt) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(txt)));
}

// Comparación en tiempo constante para contraseñas cortas
export function igualSeguro(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function cookie(nombre, valor, segundos) {
  const partes = [
    `${nombre}=${valor}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${segundos}`,
  ];
  return partes.join('; ');
}

export function leerCookie(req, nombre) {
  const raw = req.header('Cookie') || '';
  for (const parte of raw.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === nombre) return v.join('=');
  }
  return null;
}

export function normalizaEmail(e) {
  return String(e || '').trim().toLowerCase();
}

// Quita acentos y caracteres inválidos para nombres de carpeta/archivo
// El nombre del cliente que está usando la plataforma. roster101 es el programa;
// la empresa que lo renta se configura en wrangler.toml y es la que tiene que
// salir en los correos, en los archivos y en los documentos que firma la gente.
export const empresaDe = (env) => env.EMPRESA || env.RAZON_SOCIAL || 'la empresa';

export function limpiaNombre(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ._-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function csvCampo(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/* ─────────── claves guardadas ───────────
 * Una clave no se guarda: se guarda lo que sale de estirarla con PBKDF2 y su
 * sal. Así, si alguien se lleva la base, no se lleva la clave; y comparar dos
 * claves cuesta lo mismo estén bien o mal, que es lo que evita que se adivine
 * midiendo el tiempo.
 */

// 100,000 es el techo: el runtime de Workers no acepta más vueltas en PBKDF2 y
// deriveBits truena. Estuvo en 120,000 desde el 7-sep y nadie lo vio, porque la
// clave del arranque se compara con sha256 y ese camino no toca PBKDF2: se
// entraba bien, y solo habría fallado al CAMBIAR la clave, que es cuando se
// deriva de verdad. Lo destapó suite101-api, que tenía el mismo valor copiado
// de aquí y sí lo ejercía. Ver /api/salud/cripto, que ahora lo prueba en cada
// despliegue para que no se pueda volver a esconder.
export const VUELTAS_CLAVE = 100000;

export function salNueva() {
  return b64url(crypto.getRandomValues(new Uint8Array(16)));
}

export async function derivaClave(clave, sal, vueltas = VUELTAS_CLAVE) {
  const material = await crypto.subtle.importKey('raw', enc.encode(String(clave)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: deB64url(sal), iterations: vueltas, hash: 'SHA-256' },
    material,
    256
  );
  return b64url(new Uint8Array(bits));
}

// ¿Esta clave es la que produjo ese renglón? Se deriva con la sal y las vueltas
// que traiga el renglón, no con las de hoy: así una clave vieja se sigue
// pudiendo comparar aunque el costo haya subido desde entonces.
export async function claveCoincide(clave, fila) {
  if (!fila) return false;
  const h = await derivaClave(clave, fila.sal, fila.vueltas || VUELTAS_CLAVE);
  return igualSeguro(h, fila.hash);
}
