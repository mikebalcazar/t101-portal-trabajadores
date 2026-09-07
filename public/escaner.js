/* Escáner de documentos con la cámara del celular — roster101
 *
 * Tres problemas que resuelve, en orden de qué tanto molestaban:
 *
 * 1. El marco que se ve en pantalla no servía de nada: la foto salía completa,
 *    con la mesa, la mano y el piso. Ahora el marco manda: lo que queda adentro
 *    es lo que se guarda, recortado al milímetro. Para la identificación el
 *    marco tiene la proporción exacta de una credencial (85.6 × 54 mm).
 *
 * 2. Una foto de un papel no es un escaneo: sale chueca, con sombra y gris.
 *    Después de disparar se pueden mover las cuatro esquinas sobre la hoja y el
 *    programa la endereza —una transformación de perspectiva, hecha a mano aquí
 *    mismo— y le quita la sombra dividiendo entre la iluminación de fondo. Queda
 *    blanco de papel y negro de tinta.
 *
 * 3. Un expediente se entrega en PDF, no en un montón de fotos. Los documentos
 *    salen en PDF —varias hojas en un solo archivo si hace falta—, armado aquí
 *    byte por byte, como la ficha del panel: un Worker no tiene dónde meter una
 *    librería de PDF y tampoco hace falta.
 *
 * Nada de esto usa librerías: son unas cuantas matemáticas y el canvas que ya
 * trae el navegador. Se usa así:
 *
 *   const archivo = await Escaner.capturar({ tipo: 'tarjeta', titulo: 'INE — frente' });
 *   if (archivo) subir(archivo);
 */

window.Escaner = (function () {
  'use strict';

  // Proporciones reales: una credencial mide 85.6 × 54 mm y una hoja carta
  // 215.9 × 279.4 mm. El marco de la pantalla usa la misma proporción, así que
  // lo que se ve encuadrado es lo que se guarda.
  // Lo que se le deja de aire al marco por lado. Lo justo para que se vea que es
  // un recuadro y no el borde de la pantalla.
  const MARGEN = 10;

  const FORMAS = {
    tarjeta: { razon: 85.6 / 54, vertical: false, salida: 1600, pdf: false },
    hoja: { razon: 215.9 / 279.4, vertical: true, salida: 1700, pdf: true },
  };

  let capa = null;      // la pantalla completa de la cámara
  let flujo = null;     // el video de la cámara prendida
  let paginas = [];     // las hojas ya escaneadas de este documento
  let resolver = null;  // a quién le contestamos cuando termine
  let opciones = {};
  let cuadro = null;    // el disparo congelado, sin recortar
  let esquinas = null;  // las cuatro esquinas que se pueden mover
  let formaActual = null; // tarjeta u hoja: de ahí sale el tamaño del marco

  /* ────────────────── la pantalla ────────────────── */

  function construir() {
    if (capa) return capa;
    capa = document.createElement('div');
    capa.className = 'escaner oculto';
    capa.innerHTML = `
      <video class="esc-video" playsinline autoplay muted></video>
      <canvas class="esc-lienzo"></canvas>
      <div class="esc-marco"><div class="esc-guia"></div></div>
      <svg class="esc-esquinas" aria-hidden="true"><polygon></polygon></svg>

      <div class="esc-arriba">
        <button class="esc-redondo esc-cerrar" aria-label="Cerrar">✕</button>
        <span class="esc-titulo"></span>
        <span class="esc-paginas"></span>
      </div>

      <p class="esc-pista"></p>

      <div class="esc-abajo esc-paso-camara">
        <button class="esc-obturador" aria-label="Tomar la foto"><span></span></button>
        <p class="esc-etiqueta">Encuadra dentro del marco y pícale al botón</p>
      </div>

      <div class="esc-abajo esc-paso-ajuste oculto">
        <p class="esc-etiqueta">Mueve las esquinas hasta las orillas del documento</p>
        <div class="esc-botones">
          <button class="btn suave esc-repetir">↻ Repetir</button>
          <button class="btn primario esc-enderezar">Escanear</button>
        </div>
      </div>

      <div class="esc-abajo esc-paso-listo oculto">
        <div class="esc-botones">
          <button class="btn suave esc-repetir2">↻ Repetir</button>
          <button class="btn suave esc-otra oculto">+ Otra hoja</button>
          <button class="btn primario esc-usar">Usar</button>
        </div>
      </div>`;
    document.body.appendChild(capa);

    capa.querySelector('.esc-cerrar').addEventListener('click', () => terminar(null));
    capa.querySelector('.esc-obturador').addEventListener('click', disparar);
    capa.querySelector('.esc-repetir').addEventListener('click', repetir);
    capa.querySelector('.esc-repetir2').addEventListener('click', repetir);
    capa.querySelector('.esc-enderezar').addEventListener('click', enderezarYFiltrar);
    capa.querySelector('.esc-otra').addEventListener('click', otraHoja);
    capa.querySelector('.esc-usar').addEventListener('click', entregar);
    prepararArrastre();
    return capa;
  }

  const q = (sel) => capa.querySelector(sel);
  const paso = (cual) => {
    for (const p of ['camara', 'ajuste', 'listo']) {
      q(`.esc-paso-${p}`).classList.toggle('oculto', p !== cual);
    }
    capa.classList.toggle('congelado', cual !== 'camara');
    q('.esc-marco').classList.toggle('oculto', cual !== 'camara');
    q('.esc-esquinas').classList.toggle('oculto', cual !== 'ajuste');
  };

  /* ────────────────── prender y apagar ────────────────── */

  async function prender() {
    apagar();
    flujo = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
      audio: false,
    });
    const v = q('.esc-video');
    v.srcObject = flujo;
    await v.play().catch(() => {});
  }

  function apagar() {
    if (flujo) { flujo.getTracks().forEach((t) => t.stop()); flujo = null; }
  }

  function terminar(archivo) {
    apagar();
    capa.classList.add('oculto');
    document.body.style.overflow = '';
    paginas = [];
    cuadro = null;
    esquinas = null;
    const contestar = resolver;
    resolver = null;
    if (contestar) contestar(archivo);
  }

  /* ────────────────── disparar ────────────────── */

  // El marco que se ve en pantalla, traducido a píxeles del video. El video se
  // muestra recortado (object-fit: cover), así que hay que deshacer ese recorte
  // para saber qué parte del cuadro real está adentro del marco.
  function marcoEnVideo() {
    const v = q('.esc-video');
    const guia = q('.esc-guia').getBoundingClientRect();
    const caja = v.getBoundingClientRect();
    const escala = Math.max(caja.width / v.videoWidth, caja.height / v.videoHeight);
    const sobraX = (v.videoWidth * escala - caja.width) / 2;
    const sobraY = (v.videoHeight * escala - caja.height) / 2;
    return {
      x: (guia.left - caja.left + sobraX) / escala,
      y: (guia.top - caja.top + sobraY) / escala,
      an: guia.width / escala,
      al: guia.height / escala,
    };
  }

  function disparar() {
    const v = q('.esc-video');
    if (!v.videoWidth) return;
    const forma = FORMAS[opciones.tipo] || FORMAS.hoja;
    formaActual = forma;
    const m = marcoEnVideo();

    // Se guarda un poco más de lo que encuadra el marco: 4% de aire alrededor
    // para que un pulso no le corte la orilla al documento, y para tener de
    // dónde jalar las esquinas.
    const aire = forma.pdf ? 0.06 : 0.04;
    const x = Math.max(0, m.x - m.an * aire);
    const y = Math.max(0, m.y - m.al * aire);
    const an = Math.min(v.videoWidth - x, m.an * (1 + aire * 2));
    const al = Math.min(v.videoHeight - y, m.al * (1 + aire * 2));

    const lienzo = q('.esc-lienzo');
    const escala = Math.min(1, forma.salida / Math.max(an, al));
    lienzo.width = Math.round(an * escala);
    lienzo.height = Math.round(al * escala);
    lienzo.getContext('2d').drawImage(v, x, y, an, al, 0, 0, lienzo.width, lienzo.height);
    cuadro = lienzo.getContext('2d').getImageData(0, 0, lienzo.width, lienzo.height);
    apagar();

    if (forma.pdf) {
      // Las esquinas empiezan donde estaba el marco, que es donde el documento
      // debería estar; de ahí se corrigen a mano si quedó chueco.
      const dx = lienzo.width * aire / (1 + aire * 2);
      const dy = lienzo.height * aire / (1 + aire * 2);
      esquinas = [
        { x: dx, y: dy },
        { x: lienzo.width - dx, y: dy },
        { x: lienzo.width - dx, y: lienzo.height - dy },
        { x: dx, y: lienzo.height - dy },
      ];
      q('.esc-pista').textContent = 'Arrastra las esquinas hasta las orillas de la hoja';
      // Primero se muestra el lienzo y hasta entonces se dibujan las esquinas:
      // mientras está escondido no tiene medidas, y salían encimadas en una
      // orilla en lugar de sobre el documento.
      paso('ajuste');
      requestAnimationFrame(dibujarEsquinas);
    } else {
      // La credencial ya quedó recortada a su marco: no hay nada que enderezar.
      paso('listo');
      q('.esc-pista').textContent = 'Que se lean las letras y no haya reflejos';
      actualizarBotones();
    }
  }

  function repetir() {
    cuadro = null;
    esquinas = null;
    q('.esc-pista').textContent = opciones.pista || '';
    paso('camara');
    prender().catch(() => terminar(null));
  }

  /* ────────────────── mover las esquinas ────────────────── */

  function posicionEnLienzo(evento) {
    const l = q('.esc-lienzo').getBoundingClientRect();
    const lienzo = q('.esc-lienzo');
    return {
      x: ((evento.clientX - l.left) / l.width) * lienzo.width,
      y: ((evento.clientY - l.top) / l.height) * lienzo.height,
    };
  }

  function dibujarEsquinas() {
    const svg = q('.esc-esquinas');
    const lienzo = q('.esc-lienzo');
    const l = lienzo.getBoundingClientRect();
    const capaCaja = capa.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${lienzo.width} ${lienzo.height}`);
    svg.style.left = `${l.left - capaCaja.left}px`;
    svg.style.top = `${l.top - capaCaja.top}px`;
    svg.style.width = `${l.width}px`;
    svg.style.height = `${l.height}px`;
    svg.querySelector('polygon').setAttribute('points', esquinas.map((p) => `${p.x},${p.y}`).join(' '));
    svg.querySelectorAll('circle').forEach((c) => c.remove());
    const radio = Math.max(lienzo.width, lienzo.height) * 0.035;
    for (const p of esquinas) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); c.setAttribute('r', radio);
      svg.appendChild(c);
    }
  }

  function prepararArrastre() {
    let arrastrando = -1;
    const svg = q('.esc-esquinas');
    const cerca = (p) => {
      let mejor = -1, dist = Infinity;
      esquinas.forEach((e, i) => {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < dist) { dist = d; mejor = i; }
      });
      const lienzo = q('.esc-lienzo');
      return dist < Math.max(lienzo.width, lienzo.height) * 0.15 ? mejor : -1;
    };
    svg.addEventListener('pointerdown', (e) => {
      if (!esquinas) return;
      arrastrando = cerca(posicionEnLienzo(e));
      if (arrastrando >= 0) { svg.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    svg.addEventListener('pointermove', (e) => {
      if (arrastrando < 0 || !esquinas) return;
      const lienzo = q('.esc-lienzo');
      const p = posicionEnLienzo(e);
      esquinas[arrastrando] = {
        x: Math.min(Math.max(p.x, 0), lienzo.width),
        y: Math.min(Math.max(p.y, 0), lienzo.height),
      };
      dibujarEsquinas();
      e.preventDefault();
    });
    const soltar = () => { arrastrando = -1; };
    svg.addEventListener('pointerup', soltar);
    svg.addEventListener('pointercancel', soltar);
    window.addEventListener('resize', () => {
      if (formaActual) medirGuia(formaActual);
      if (esquinas) dibujarEsquinas();
    });
  }

  /* ────────────────── enderezar y limpiar ────────────────── */

  // Resuelve el sistema de 8 ecuaciones que lleva un rectángulo a un cuadrilátero
  // (la transformación de perspectiva). Con eso, para cada píxel de la hoja
  // derecha sabemos de dónde sacarlo en la foto chueca.
  function transformacion(destino, origen) {
    const a = [], b = [];
    for (let i = 0; i < 4; i++) {
      const { x: X, y: Y } = destino[i];
      const { x, y } = origen[i];
      a.push([X, Y, 1, 0, 0, 0, -X * x, -Y * x]); b.push(x);
      a.push([0, 0, 0, X, Y, 1, -X * y, -Y * y]); b.push(y);
    }
    // Eliminación de Gauss con pivoteo parcial
    for (let col = 0; col < 8; col++) {
      let mejor = col;
      for (let f = col + 1; f < 8; f++) if (Math.abs(a[f][col]) > Math.abs(a[mejor][col])) mejor = f;
      [a[col], a[mejor]] = [a[mejor], a[col]];
      [b[col], b[mejor]] = [b[mejor], b[col]];
      const pivote = a[col][col] || 1e-9;
      for (let f = col + 1; f < 8; f++) {
        const factor = a[f][col] / pivote;
        if (!factor) continue;
        for (let c = col; c < 8; c++) a[f][c] -= factor * a[col][c];
        b[f] -= factor * b[col];
      }
    }
    const h = new Array(8).fill(0);
    for (let f = 7; f >= 0; f--) {
      let suma = b[f];
      for (let c = f + 1; c < 8; c++) suma -= a[f][c] * h[c];
      h[f] = suma / (a[f][f] || 1e-9);
    }
    return h;
  }

  function enderezar(imagen, cuatroEsquinas, anchoSalida, altoSalida) {
    const h = transformacion(
      [{ x: 0, y: 0 }, { x: anchoSalida, y: 0 }, { x: anchoSalida, y: altoSalida }, { x: 0, y: altoSalida }],
      cuatroEsquinas
    );
    const salida = new ImageData(anchoSalida, altoSalida);
    const orig = imagen.data, dest = salida.data;
    const ancho = imagen.width, alto = imagen.height;
    for (let Y = 0; Y < altoSalida; Y++) {
      for (let X = 0; X < anchoSalida; X++) {
        const den = h[6] * X + h[7] * Y + 1;
        const x = Math.round((h[0] * X + h[1] * Y + h[2]) / den);
        const y = Math.round((h[3] * X + h[4] * Y + h[5]) / den);
        const d = (Y * anchoSalida + X) * 4;
        if (x < 0 || y < 0 || x >= ancho || y >= alto) {
          dest[d] = dest[d + 1] = dest[d + 2] = 255; dest[d + 3] = 255;
          continue;
        }
        const o = (y * ancho + x) * 4;
        dest[d] = orig[o]; dest[d + 1] = orig[o + 1]; dest[d + 2] = orig[o + 2]; dest[d + 3] = 255;
      }
    }
    return salida;
  }

  // El truco de siempre para que una foto parezca escaneo: la sombra y la luz
  // despareja son un fondo que cambia despacio, así que se estima ese fondo con
  // un desenfoque grande y se divide la imagen entre él. Lo que queda es papel
  // blanco parejo y tinta oscura, sin importar dónde estaban la lámpara y la
  // sombra de la mano.
  function aEscaneo(imagen) {
    const { width: an, height: al, data } = imagen;
    const gris = new Float32Array(an * al);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      gris[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }

    // Promedio por ventanas grandes, con imagen integral para que sea rápido
    // aunque el radio sea de cien píxeles.
    const suma = new Float64Array((an + 1) * (al + 1));
    for (let y = 0; y < al; y++) {
      let fila = 0;
      for (let x = 0; x < an; x++) {
        fila += gris[y * an + x];
        suma[(y + 1) * (an + 1) + (x + 1)] = suma[y * (an + 1) + (x + 1)] + fila;
      }
    }
    const radio = Math.max(12, Math.round(Math.min(an, al) / 12));
    const fondo = new Float32Array(an * al);
    for (let y = 0; y < al; y++) {
      const y0 = Math.max(0, y - radio), y1 = Math.min(al - 1, y + radio);
      for (let x = 0; x < an; x++) {
        const x0 = Math.max(0, x - radio), x1 = Math.min(an - 1, x + radio);
        const total = suma[(y1 + 1) * (an + 1) + (x1 + 1)] - suma[y0 * (an + 1) + (x1 + 1)]
          - suma[(y1 + 1) * (an + 1) + x0] + suma[y0 * (an + 1) + x0];
        fondo[y * an + x] = total / ((y1 - y0 + 1) * (x1 - x0 + 1));
      }
    }

    // Dividir entre el fondo deja todo en torno a 1. Lo que está por encima de
    // 0.93 es papel y se va a blanco; lo que baja de 0.55 es tinta y se va a
    // negro; en medio se estira para que las letras claras no se pierdan.
    const salida = new ImageData(an, al);
    const s = salida.data;
    for (let p = 0, d = 0; p < gris.length; p++, d += 4) {
      const razon = gris[p] / Math.max(fondo[p], 1);
      let v = (razon - 0.55) / (0.93 - 0.55);
      v = v < 0 ? 0 : v > 1 ? 1 : v;
      const c = Math.round(v * 255);
      s[d] = s[d + 1] = s[d + 2] = c;
      s[d + 3] = 255;
    }
    return salida;
  }

  async function enderezarYFiltrar() {
    const boton = q('.esc-enderezar');
    boton.disabled = true;
    boton.textContent = 'Escaneando…';
    await new Promise((r) => setTimeout(r, 30));   // que alcance a pintarse el botón

    const forma = FORMAS[opciones.tipo] || FORMAS.hoja;
    // El tamaño de salida respeta la proporción de una hoja carta, no la del
    // recorte: una hoja escaneada tiene que verse como una hoja.
    const anchoSalida = Math.round(forma.salida * forma.razon);
    const altoSalida = forma.salida;
    const derecha = enderezar(cuadro, esquinas, anchoSalida, altoSalida);
    const escaneada = aEscaneo(derecha);

    const lienzo = q('.esc-lienzo');
    lienzo.width = anchoSalida;
    lienzo.height = altoSalida;
    lienzo.getContext('2d').putImageData(escaneada, 0, 0);

    boton.disabled = false;
    boton.textContent = 'Escanear';
    q('.esc-pista').textContent = 'Así se va a guardar. Si quedó chueco, repite.';
    paso('listo');
    actualizarBotones();
  }

  /* ────────────────── varias hojas y entrega ────────────────── */

  function actualizarBotones() {
    const forma = FORMAS[opciones.tipo] || FORMAS.hoja;
    q('.esc-otra').classList.toggle('oculto', !forma.pdf);
    q('.esc-usar').textContent = forma.pdf
      ? (paginas.length ? `Guardar PDF (${paginas.length + 1} hojas)` : 'Guardar PDF')
      : 'Usar esta foto';
    q('.esc-paginas').textContent = paginas.length ? `${paginas.length} hoja${paginas.length === 1 ? '' : 's'} guardada${paginas.length === 1 ? '' : 's'}` : '';
  }

  async function hojaActualComoJpeg() {
    const lienzo = q('.esc-lienzo');
    const blob = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', 0.9));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), ancho: lienzo.width, alto: lienzo.height };
  }

  async function otraHoja() {
    paginas.push(await hojaActualComoJpeg());
    cuadro = null; esquinas = null;
    q('.esc-pista').textContent = 'Pon la siguiente hoja dentro del marco';
    paso('camara');
    actualizarBotones();
    await prender().catch(() => terminar(null));
  }

  async function entregar() {
    const boton = q('.esc-usar');
    boton.disabled = true;
    const forma = FORMAS[opciones.tipo] || FORMAS.hoja;
    const nombre = opciones.nombre || opciones.tipoDoc || 'documento';
    try {
      if (!forma.pdf) {
        const lienzo = q('.esc-lienzo');
        const blob = await new Promise((res) => lienzo.toBlob(res, 'image/jpeg', 0.9));
        terminar(new File([blob], `${nombre}.jpg`, { type: 'image/jpeg' }));
        return;
      }
      const hojas = [...paginas, await hojaActualComoJpeg()];
      const pdf = armarPdf(hojas);
      terminar(new File([pdf], `${nombre}.pdf`, { type: 'application/pdf' }));
    } finally { boton.disabled = false; }
  }

  /* ────────────────── el PDF, a mano ────────────────── */

  // Un PDF con una imagen JPEG por hoja. El formato sabe leer JPEG tal cual
  // (filtro DCTDecode), así que no hay que convertir nada: se pega el archivo
  // y se le dice dónde va.
  function armarPdf(hojas) {
    const CARTA = { an: 612, al: 792 };   // puntos, tamaño carta
    const MARGEN = 18;
    const partes = [];
    const posiciones = [];
    let largo = 0;
    const codificador = new TextEncoder();

    const crudo = (txt) => { const b = codificador.encode(txt); partes.push(b); largo += b.length; };
    const bytes = (b) => { partes.push(b); largo += b.length; };
    const abre = (num) => { posiciones[num] = largo; crudo(`${num} 0 obj\n`); };
    const cierra = () => crudo('endobj\n');

    const IDS = { catalogo: 1, paginas: 2 };
    let siguiente = 3;
    const hojasPdf = hojas.map((h) => ({
      ...h,
      pagina: siguiente++,
      flujo: siguiente++,
      imagen: siguiente++,
    }));

    crudo('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

    abre(IDS.catalogo);
    crudo(`<< /Type /Catalog /Pages ${IDS.paginas} 0 R >>\n`);
    cierra();

    abre(IDS.paginas);
    crudo(`<< /Type /Pages /Count ${hojasPdf.length} /Kids [${hojasPdf.map((h) => `${h.pagina} 0 R`).join(' ')}] >>\n`);
    cierra();

    for (const h of hojasPdf) {
      // La imagen se acomoda centrada, lo más grande que quepa con márgenes.
      const escala = Math.min((CARTA.an - MARGEN * 2) / h.ancho, (CARTA.al - MARGEN * 2) / h.alto);
      const an = h.ancho * escala, al = h.alto * escala;
      const x = (CARTA.an - an) / 2, y = (CARTA.al - al) / 2;
      const contenido = `q ${an.toFixed(2)} 0 0 ${al.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im Do Q`;

      abre(h.pagina);
      crudo(`<< /Type /Page /Parent ${IDS.paginas} 0 R /MediaBox [0 0 ${CARTA.an} ${CARTA.al}] ` +
        `/Resources << /XObject << /Im ${h.imagen} 0 R >> >> /Contents ${h.flujo} 0 R >>\n`);
      cierra();

      const cuerpo = codificador.encode(contenido);
      abre(h.flujo);
      crudo(`<< /Length ${cuerpo.length} >>\nstream\n`);
      bytes(cuerpo);
      crudo('\nendstream\n');
      cierra();

      abre(h.imagen);
      crudo(`<< /Type /XObject /Subtype /Image /Width ${h.ancho} /Height ${h.alto} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${h.bytes.length} >>\nstream\n`);
      bytes(h.bytes);
      crudo('\nendstream\n');
      cierra();
    }

    const total = siguiente;
    const inicioXref = largo;
    crudo(`xref\n0 ${total}\n0000000000 65535 f \n`);
    for (let i = 1; i < total; i++) {
      crudo(`${String(posiciones[i] ?? 0).padStart(10, '0')} 00000 n \n`);
    }
    crudo(`trailer\n<< /Size ${total} /Root ${IDS.catalogo} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);

    const todo = new Uint8Array(largo);
    let i = 0;
    for (const p of partes) { todo.set(p, i); i += p.length; }
    return todo;
  }

  /* ────────────────── la puerta de entrada ────────────────── */

  // El marco se dibuja del tamaño exacto del papel que se va a fotografiar.
  // Si se dejara en porcentajes, en un teléfono angosto el ancho se recorta y el
  // recuadro deja de tener la forma del documento: la gente encuadra mal y el
  // recorte sale estirado. Se calcula la caja más grande con esa proporción que
  // cabe en la pantalla, y se vuelve a calcular si el teléfono se gira.
  function medirGuia(forma) {
    const capaRect = capa.getBoundingClientRect();
    if (!capaRect.width || !capaRect.height) return;

    // El área que de verdad se puede usar es la pantalla menos lo que tapan los
    // controles. Con el teléfono parado son dos franjas, arriba y abajo; acostado
    // los botones se van al costado derecho, y entonces lo que hay que apartar es
    // ancho, no alto. Se decide midiendo: una franja que cruza toda la pantalla
    // quita alto; una que no, quita ancho.
    let arriba = 0, abajo = 0, derecha = 0;
    const barras = [q('.esc-arriba'), ...capa.querySelectorAll('.esc-abajo')]
      .filter((e) => e && !e.classList.contains('oculto'));

    for (const barra of barras) {
      const r = barra.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.width >= capaRect.width * 0.9) {
        // franja horizontal: quita alto del lado en el que esté pegada
        if (r.top - capaRect.top < capaRect.height / 2) arriba = Math.max(arriba, r.height);
        else abajo = Math.max(abajo, r.height);
      } else {
        derecha = Math.max(derecha, r.width);
      }
    }

    const marco = q('.esc-marco');
    marco.style.paddingTop = Math.round(arriba) + 'px';
    marco.style.paddingBottom = Math.round(abajo) + 'px';
    marco.style.paddingRight = Math.round(derecha) + 'px';

    const libreAncho = capaRect.width - derecha - MARGEN * 2;
    const libreAlto = capaRect.height - arriba - abajo - MARGEN * 2;
    if (libreAncho <= 0 || libreAlto <= 0) return;

    // La caja más grande con la proporción del papel que cabe ahí. Se toma la
    // que mande de las dos: en un teléfono angosto manda el ancho, y acostado
    // manda el alto.
    const ancho = Math.min(libreAncho, libreAlto * forma.razon);
    const guia = q('.esc-guia');
    guia.style.width = Math.round(ancho) + 'px';
    guia.style.height = Math.round(ancho / forma.razon) + 'px';
  }

  async function capturar(config) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return null;
    construir();
    opciones = config || {};
    paginas = [];
    cuadro = null;
    esquinas = null;

    const forma = FORMAS[opciones.tipo] || FORMAS.hoja;
    q('.esc-titulo').textContent = opciones.titulo || 'Documento';
    q('.esc-pista').textContent = opciones.pista || (forma.pdf
      ? 'Pon el documento sobre una mesa y encuádralo en el marco'
      : 'Encuadra la credencial dentro del marco');
    capa.classList.remove('oculto');
    document.body.style.overflow = 'hidden';
    paso('camara');
    medirGuia(forma); // después de paso(): antes, el marco está escondido y no mide
    actualizarBotones();

    try { await prender(); } catch { terminar(null); return null; }
    return new Promise((res) => { resolver = res; });
  }

  // Las dos piezas del escaneo se exponen aparte: sirven para armar un PDF de
  // algo que ya se subió, y para poder probarlas sin cámara de por medio.
  return { capturar, armarPdf, enderezar, aEscaneo };
})();
