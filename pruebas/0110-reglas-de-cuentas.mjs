/* Mide las reglas de las cuentas del panel sin Worker ni base: los niveles,
 * sus permisos y los candados.
 *
 * Desde el 0.12 ya no hay reglas de contraseña que medir aquí: la sesión la da
 * la suite 101 y las reglas viven en `suite101-api`, con sus propias pruebas.
 *
 *     node pruebas/0110-reglas-de-cuentas.mjs
 */
import {
  NIVELES, puede, permisosDe, nivelValido, candado, duenosActivos,
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
console.log('Medido: niveles y candados como los pide el encargo.');
