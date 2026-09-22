/* El botón «atrás» del navegador, que hasta hoy sacaba del portal.
 *
 * Mike, 22-sep-2026: «en todas las apps, cuando picas el botón de back en el
 * navegador te saca hasta la página anterior (…). Queremos que cuando picas
 * back te regrese a la función anterior».
 *
 * Aquí no hay secciones que recorrer: el portal del trabajador es UNA forma,
 * y el panel de administración es UNA tabla. Lo que sí hay son cosas que se
 * abren ENCIMA y tapan todo —la cámara a pantalla completa, la descripción
 * de un documento, la ficha de una persona—, y ahí «atrás» se llevaba el
 * portal entero en vez de cerrar lo que estaba abierto. En un teléfono, con
 * la cámara puesta, «atrás» es el gesto natural para salirse de ahí.
 *
 * POR QUÉ ESTE ARCHIVO NO ES UN MÓDULO
 *
 * Las otras apps de la suite importan `navegar.js` con `import`. Aquí no:
 * `app.js` y `admin.js` se cargan como guiones normales y comparten cosas
 * por `window` con `escaner.js` y `autoguardado.js`. Volverlos módulos para
 * esto rompería ese reparto sin necesidad, así que este archivo deja su
 * única función en `window.navegar101` y se carga antes que ellos.
 *
 * LA IDEA
 *
 * Abrir algo encima empuja una entrada del historial; cerrarlo —con «atrás»
 * o con el botón de la app— la consume. Las dos cosas tienen que hacer lo
 * mismo: si el botón nada más escondiera, el siguiente «atrás» reabriría lo
 * que la persona acaba de cerrar y parecería que el portal se devolvió solo.
 *
 * Se lleva una PILA y no un solo lugar, porque nada impide que mañana algo
 * se abra encima de otra cosa, y un «atrás» tiene que cerrar una sola.
 */

(function () {
  const pila = [];

  /**
   * Abrir algo encima de lo que hay. `cerrar` es lo que la app hace para
   * quitarlo de la pantalla —y nada más eso: del historial se encarga esto—.
   * Devuelve la función con la que la app lo cierra.
   */
  function abrirEncima(cerrar) {
    pila.push(cerrar);
    const mio = pila.length;
    history.pushState({ ...(history.state || {}), encima: mio }, '', null);
    return function () { if (pila.length >= mio) history.back(); };
  }

  window.addEventListener('popstate', function () {
    const cerrar = pila.pop();
    if (cerrar) cerrar();
  });

  window.navegar101 = { abrirEncima };
})();
