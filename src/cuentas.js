// roster101 — cuentas de administración: niveles, permisos y reglas de contraseña
//
// Aquí no hay base ni Worker: son las reglas solas, para que se puedan probar
// sin levantar nada (pruebas/0110-reglas-de-cuentas.mjs). Lo que toca la base
// vive en index.js.

// Tres niveles. El de arriba manda sobre las cuentas; el de abajo solo mira.
export const NIVELES = ['dueno', 'admin', 'consulta'];

export const NOMBRE_NIVEL = {
  dueno: 'Dueño',
  admin: 'Administración',
  consulta: 'Consulta',
};

export const DICE_NIVEL = {
  dueno: 'Todo, y además maneja las cuentas de este panel.',
  admin: 'Ve, captura, exporta y da de baja. No toca las cuentas.',
  consulta: 'Solo ve expedientes y saca fichas. No exporta ni da de baja.',
};

// Qué puede hacer cada nivel. La tabla es la del encargo, tal cual:
//   expedientes  ver la lista y abrir cada expediente
//   fichas       fichas en PDF (con o sin documentos)
//   exportar     el ZIP con todo y la tabla en CSV
//   baja         mandar a la papelera, devolver y borrar ya
//   cuentas      crear, cambiar, apagar y borrar cuentas de este panel
//   capturar     escribir en el expediente de alguien. No está en la tabla del
//                encargo; se le niega a consulta porque «consulta» es mirar.
const PERMISOS = {
  dueno:    { expedientes: true, fichas: true, exportar: true,  baja: true,  cuentas: true,  capturar: true },
  admin:    { expedientes: true, fichas: true, exportar: true,  baja: true,  cuentas: false, capturar: true },
  consulta: { expedientes: true, fichas: true, exportar: false, baja: false, cuentas: false, capturar: false },
};

export function puede(nivel, que) {
  return !!(PERMISOS[nivel] && PERMISOS[nivel][que]);
}

export function permisosDe(nivel) {
  return { ...(PERMISOS[nivel] || {}) };
}

export function nivelValido(n) {
  return NIVELES.includes(n);
}

/* ─────────── la contraseña ───────────
 * Mínimo diez caracteres. A propósito no se exige mayúscula ni símbolo: eso
 * solo empuja a poner «1» y «!» al final y no protege nada. Lo que sí se niega
 * es lo que cualquiera probaría primero: el usuario del propio correo, las
 * obvias y las que son casi un solo carácter.
 */
export const CONTRASENA_MINIMO = 10;

// Lo que se prueba primero cuando se adivina. Se compara sin mayúsculas ni
// acentos, y basta con que la contraseña lo contenga.
export const OBVIAS = [
  'contrasena', 'password', 'passw0rd', 'clave123', 'admin123', 'administrador',
  '1234567890', '0987654321', '123456789', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'abcdefghij', 'roster101', 'taller101', 'bienvenido', 'bienvenida', 'temporal',
];

export function normaliza(txt) {
  return String(txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Devuelve el problema, o null si la contraseña sirve.
export function revisaContrasena(clave, email = '') {
  const c = String(clave || '');
  if (c.length < CONTRASENA_MINIMO) return `La contraseña necesita al menos ${CONTRASENA_MINIMO} caracteres.`;
  if (c.trim() !== c) return 'La contraseña no puede empezar ni terminar con espacio: se pierde al copiarla.';
  if (new Set(c).size < 4) return 'Esa contraseña es demasiado sencilla: usa al menos cuatro caracteres distintos.';

  const plana = normaliza(c);
  const usuario = normaliza(String(email || '').split('@')[0]);
  if (usuario.length >= 3 && plana.includes(usuario)) {
    return 'La contraseña no puede llevar el usuario de tu correo: es lo primero que cualquiera probaría.';
  }
  for (const obvia of OBVIAS) {
    if (plana.includes(obvia)) return 'Esa contraseña es de las que cualquiera prueba primero. Escoge otra.';
  }
  // Puros dígitos seguidos, hacia arriba o hacia abajo, aunque no sean los diez.
  if (/^\d+$/.test(plana) && esSecuencia(plana)) return 'Esa contraseña es una secuencia de números. Escoge otra.';
  return null;
}

function esSecuencia(digitos) {
  let sube = true, baja = true;
  for (let i = 1; i < digitos.length; i++) {
    const d = (digitos.charCodeAt(i) - digitos.charCodeAt(i - 1) + 10) % 10;
    if (d !== 1) sube = false;
    if (d !== 9) baja = false;
  }
  return sube || baja;
}

/* ─────────── los candados ───────────
 * Se deciden aquí, con la lista de cuentas en la mano, para que se puedan
 * probar sin base. `cuentas` son los renglones tal cual; `yo` es la cuenta de
 * quien está pidiendo el cambio; `objetivo` la que se quiere tocar.
 */

export function duenosActivos(cuentas) {
  return cuentas.filter((c) => c.nivel === 'dueno' && c.activo).length;
}

// ¿Se puede quitar de en medio a `objetivo` (borrarla, apagarla o bajarla de
// dueño)? Devuelve el motivo por el que no, o null.
export function candado(cuentas, yo, objetivo, cambio) {
  if (!objetivo) return 'Esa cuenta no existe.';
  const esYo = String(objetivo.id) === String(yo.id);

  if (cambio.borrar || cambio.activo === false) {
    if (esYo) return cambio.borrar ? 'No te puedes borrar a ti misma.' : 'No te puedes desactivar a ti misma.';
  }

  // El último dueño en pie no se borra, no se apaga y no se baja de nivel: sin
  // él nadie podría volver a manejar las cuentas.
  const esUltimoDueno = objetivo.nivel === 'dueno' && objetivo.activo && duenosActivos(cuentas) <= 1;
  if (esUltimoDueno) {
    if (cambio.borrar) return 'Es la única cuenta de dueño activa: no se puede borrar. Nombra a otro dueño primero.';
    if (cambio.activo === false) return 'Es la única cuenta de dueño activa: no se puede desactivar. Nombra a otro dueño primero.';
    if (cambio.nivel && cambio.nivel !== 'dueno') return 'Es la única cuenta de dueño activa: no se puede bajar de nivel. Nombra a otro dueño primero.';
  }
  return null;
}
