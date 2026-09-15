/* Mide las reglas de las cuentas del panel (0.11) sin Worker ni base: los
 * niveles y sus permisos, qué contraseñas se rechazan y los candados.
 *
 *     node pruebas/0110-reglas-de-cuentas.mjs
 */
import {
  NIVELES, puede, permisosDe, nivelValido,
  revisaContrasena, CONTRASENA_MINIMO, candado, duenosActivos,
} from '../src/cuentas.js';

let fallas = 0;
const rev = (ok, que, dato = '') => {
  if (!ok) fallas++;
  console.log(`  [${ok ? 'ok ' : 'MAL'}] ${que}${dato ? ' — ' + dato : ''}`);
};

console.log('Niveles y permisos (la tabla del encargo):');
rev(NIVELES.join(',') === 'dueno,admin,consulta', 'son tres niveles: dueño, admin y consulta');
// dueño: todo
for (const q of ['expedientes', 'fichas', 'exportar', 'baja', 'cuentas']) rev(puede('dueno', q), `dueño puede ${q}`);
// admin: todo menos cuentas
for (const q of ['expedientes', 'fichas', 'exportar', 'baja']) rev(puede('admin', q), `admin puede ${q}`);
rev(!puede('admin', 'cuentas'), 'admin NO maneja cuentas');
// consulta: ve y saca fichas, nada más
rev(puede('consulta', 'expedientes'), 'consulta ve expedientes');
rev(puede('consulta', 'fichas'), 'consulta saca fichas');
rev(!puede('consulta', 'exportar'), 'consulta NO exporta');
rev(!puede('consulta', 'baja'), 'consulta NO da de baja');
rev(!puede('consulta', 'cuentas'), 'consulta NO maneja cuentas');
rev(!puede('consulta', 'capturar'), 'consulta NO captura en expedientes ajenos');
rev(!puede('otro', 'expedientes') && !puede(undefined, 'fichas'), 'un nivel que no existe no puede nada');
rev(!nivelValido('arranque') && nivelValido('consulta'), '«arranque» no es un nivel que se pueda dar de alta');
rev(Object.keys(permisosDe('dueno')).length === 6, 'permisosDe devuelve la tabla completa', Object.keys(permisosDe('dueno')).join(','));

console.log('\nContraseñas:');
rev(CONTRASENA_MINIMO === 10, 'el mínimo es 10');
rev(revisaContrasena('corta1234') !== null, 'nueve caracteres se rechazan');
rev(revisaContrasena('diez chars') === null, 'diez caracteres pasan (con espacio adentro)');
rev(revisaContrasena('minusculas sin nada mas') === null, 'sin mayúscula ni símbolo pasa: no se exigen');
rev(revisaContrasena(' empieza con espacio') !== null, 'con espacio al principio se rechaza');
rev(revisaContrasena('aaaaaaaaaab') !== null, 'con menos de cuatro caracteres distintos se rechaza');
rev(revisaContrasena('mike.balcazar2026', 'mike.balcazar@ejemplo.mx') !== null, 'con el usuario del correo se rechaza');
rev(revisaContrasena('MIKEBALCAZAR-99', 'mike.balcazar@ejemplo.mx') === null, 'el usuario con punto no es el mismo que sin punto: pasa');
rev(revisaContrasena('MIKE-y-punto-99', 'mike@ejemplo.mx') !== null, 'el usuario se busca sin mayúsculas');
rev(revisaContrasena('otra cosa larga', 'ab@ejemplo.mx') === null, 'un usuario de dos letras no cuenta (estaría en cualquier palabra)');
rev(revisaContrasena('Contraseña2026') !== null, '«Contraseña2026» es obvia (con acento y mayúscula)');
rev(revisaContrasena('password12') !== null, '«password12» es obvia');
rev(revisaContrasena('1234567890') !== null, '«1234567890» es obvia');
rev(revisaContrasena('9876543210') !== null, 'los dígitos al revés también');
rev(revisaContrasena('4567890123') !== null, 'una secuencia que da la vuelta también');
rev(revisaContrasena('2938471650') === null, 'diez dígitos sin orden sí pasan');
rev(revisaContrasena('roster101 es mia') !== null, '«roster101» adentro se rechaza');
rev(revisaContrasena('roble-marea-lluvia-42') === null, 'tres palabras y un número pasan');
rev(revisaContrasena(null) !== null && revisaContrasena(undefined) !== null, 'vacía se rechaza sin tronar');

console.log('\nCandados:');
const cuentas = [
  { id: 'd1', email: 'duena@e.mx', nivel: 'dueno', activo: 1 },
  { id: 'a1', email: 'admin@e.mx', nivel: 'admin', activo: 1 },
  { id: 'c1', email: 'consulta@e.mx', nivel: 'consulta', activo: 0 },
];
const duena = cuentas[0];
rev(duenosActivos(cuentas) === 1, 'hay un solo dueño activo');
rev(candado(cuentas, duena, duena, { borrar: true }) !== null, 'la dueña no se puede borrar a sí misma');
rev(candado(cuentas, duena, duena, { activo: false }) !== null, 'la dueña no se puede desactivar a sí misma');
rev(candado(cuentas, duena, duena, { nivel: 'admin' }) !== null, 'el último dueño no se baja de nivel');
rev(candado(cuentas, duena, duena, { nivel: 'dueno' }) === null, 'dejarlo en dueño no es bajarlo');
rev(candado(cuentas, duena, duena, { nombre: 'Otro nombre' }) === null, 'cambiarse el nombre sí se puede');
rev(candado(cuentas, duena, cuentas[1], { borrar: true }) === null, 'a un admin sí se le puede borrar');
rev(candado(cuentas, duena, cuentas[1], { activo: false }) === null, 'a un admin sí se le puede quitar el acceso');
rev(candado(cuentas, duena, cuentas[2], { activo: true }) === null, 'a una consulta apagada se le puede devolver el acceso');
rev(candado(cuentas, duena, null, { borrar: true }) !== null, 'una cuenta que no existe da motivo, no truena');

const dos = [...cuentas, { id: 'd2', email: 'otra@e.mx', nivel: 'dueno', activo: 1 }];
rev(candado(dos, duena, dos[3], { borrar: true }) === null, 'con dos dueños, uno sí se puede borrar');
rev(candado(dos, duena, dos[3], { nivel: 'consulta' }) === null, 'con dos dueños, uno sí se puede bajar');
rev(candado(dos, duena, duena, { borrar: true }) !== null, 'pero nadie se borra a sí mismo, ni con dos dueños');
const dosUnoApagado = [...cuentas, { id: 'd2', email: 'otra@e.mx', nivel: 'dueno', activo: 0 }];
rev(candado(dosUnoApagado, duena, duena, { nivel: 'admin' }) !== null, 'un dueño apagado no cuenta: el activo sigue siendo el último');

console.log();
if (fallas) { console.log(`FALLAS: ${fallas}`); process.exit(1); }
console.log('0.11 medido: niveles, contraseñas y candados como los pide el encargo.');
