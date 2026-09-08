/* Autoguardado — roster101
   ============================================================================
   Nadie debería tener que acordarse de apretar "Guardar". En obra y en oficina
   pasa lo mismo: se llena media pantalla, entra una llamada, se cambia de app,
   se va la señal, y al volver no está nada. El botón existe, pero el dato se
   perdió antes de que alguien lo apretara.

   Esta pieza sale de public/app.js, el portal del trabajador, donde el
   mecanismo ya lleva tiempo funcionando en teléfonos de verdad. Aquí está
   sacado aparte para que el panel de la empresa y el central lo usen igual, en
   vez de tener tres copias que se van separando poco a poco.

   Cubre cuatro maneras de perder lo escrito:

     1. Se deja de escribir  -> se guarda solo a los 1.5 s de la última tecla.
     2. Se sale del campo    -> se guarda de inmediato, sin esperar.
     3. Se cierra o se manda al fondo -> se manda con keepalive, que el
        navegador termina solo aunque la página ya no exista. Un fetch normal
        se corta a medias en el celular.
     4. No hay señal         -> queda copia en el teléfono, se reintenta al
        volver la conexión y cada 20 s mientras quede algo pendiente.

   La copia local es el último cinturón: si el servidor nunca llegó a recibir
   nada, al volver a abrir se ofrece lo que había. Se compara contra la fecha
   del servidor para no revivir un dato viejo encima de uno nuevo.

   Uso:

     const auto = Autoguardado({
       llave:      'roster101:exp:' + id,   // dónde va la copia local
       recolectar: () => ({ ... }),          // lee la pantalla
       enviar:     async (datos) => true,    // manda al servidor; true si quedó
       ruta:       '/api/...',               // para el envío de salida
       marca:      (texto, clase) => {},     // pinta el indicador
       fechaServidor: () => '2026-09-08T...' // ISO de la última vez que guardó
     });
     auto.vigilar(document.querySelector('#form'));  // engancha input/change/blur
     auto.recuperar();                               // ofrece la copia local
     auto.soltar();                                  // al cerrar la pantalla
   ============================================================================ */

window.Autoguardado = function Autoguardado(cfg) {
  const ESPERA = 1500;      // desde la última tecla
  const REINTENTO = 20000;  // mientras quede algo sin guardar

  let pendiente = false;
  let guardando = false;
  let temporizador = null;
  let intervalo = null;
  let vivo = true;
  const marca = cfg.marca || (() => {});

  /* ---- copia en el aparato ---- */

  function copiar() {
    try {
      localStorage.setItem(cfg.llave, JSON.stringify({
        hora: new Date().toISOString(),
        datos: cfg.recolectar(),
      }));
    } catch { /* sin espacio o en modo privado: el servidor sigue guardando */ }
  }

  function borrarCopia() {
    try { localStorage.removeItem(cfg.llave); } catch { /* da igual */ }
  }

  function leerCopia() {
    try { return JSON.parse(localStorage.getItem(cfg.llave) || 'null'); } catch { return null; }
  }

  /* ---- guardar ---- */

  function programar() {
    if (!vivo) return;
    pendiente = true;
    copiar();
    marca('Escribiendo…', 'trabajando');
    clearTimeout(temporizador);
    temporizador = setTimeout(ahora, ESPERA);
  }

  async function ahora() {
    if (!vivo || guardando || !pendiente) return false;
    guardando = true;
    clearTimeout(temporizador);
    marca('Guardando…', 'trabajando');
    let ok = false;
    try { ok = await cfg.enviar(cfg.recolectar()); } catch { ok = false; }
    guardando = false;
    if (ok) {
      pendiente = false;
      borrarCopia();
      const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
      marca(`✓ Guardado a las ${hora}`);
    } else {
      // No se dice "error": desde el teléfono, lo normal es que sea la señal, y
      // lo escrito no se perdió. Asustar aquí hace que la gente deje de llenar.
      marca('Sin conexión. Lo escrito está a salvo aquí; se guarda solo cuando vuelva la señal.', 'trabajando');
    }
    return ok;
  }

  /* ---- la salida ----
     Al cerrar la pestaña o mandar la app al fondo ya no hay a quién avisarle
     nada, así que se manda directo y sin leer la respuesta. keepalive es lo que
     deja que el navegador lo termine cuando la página ya no está. */

  function alSalir() {
    if (!vivo || !pendiente || !cfg.ruta) return;
    copiar();
    try {
      const cuerpo = cfg.recolectar();
      cuerpo.__parcial = true;
      fetch(cfg.ruta, {
        method: cfg.metodo || 'PUT',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo),
      }).then((r) => { if (r.ok) { pendiente = false; borrarCopia(); } }).catch(() => {});
    } catch { /* si ni eso se pudo, queda la copia local */ }
  }

  /* ---- recuperar lo que no alcanzó a subir ---- */

  function recuperar(aplicar) {
    const c = leerCopia();
    if (!c || !c.datos) return 0;
    const servidor = (cfg.fechaServidor && cfg.fechaServidor()) || '';
    // Si el servidor ya tiene algo igual de nuevo o más, la copia sobra: revivirla
    // pisaría con lo viejo un dato que alguien ya corrigió.
    if (servidor && c.hora <= servidor) { borrarCopia(); return 0; }
    const cambios = aplicar(c.datos);
    if (!cambios) { borrarCopia(); return 0; }
    pendiente = true;
    return cambios;
  }

  /* ---- enganches ---- */

  function vigilar(raiz) {
    const campos = (raiz || document).querySelectorAll('[data-c]');
    campos.forEach((el) => {
      el.addEventListener('input', programar);
      // Los <select> y el autollenado del navegador a veces disparan change sin
      // input: sin esto, un dato elegido de la lista no se guardaría solo.
      el.addEventListener('change', programar);
      el.addEventListener('blur', () => { if (pendiente) ahora(); });
    });
    return campos.length;
  }

  window.addEventListener('pagehide', alSalir);
  window.addEventListener('beforeunload', alSalir);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') alSalir();
  });
  window.addEventListener('online', () => { if (pendiente) ahora(); });
  intervalo = setInterval(() => {
    if (pendiente && !guardando && navigator.onLine) ahora();
  }, REINTENTO);

  return {
    programar,
    ahora,
    vigilar,
    recuperar,
    copiar,
    borrarCopia,
    hayPendiente: () => pendiente,
    marcarPendiente: () => { pendiente = true; },
    // Al cerrar la ficha se apaga: si no, el temporizador seguiría mandando los
    // datos de una pantalla que ya no está a la vista.
    soltar: () => {
      vivo = false;
      clearTimeout(temporizador);
      clearInterval(intervalo);
    },
  };
};
