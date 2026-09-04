// Ver el portal como se ve en un celular, sin celular.
//
// La red de estas sesiones no alcanza el portal publicado, así que la única
// forma de revisar el acomodo en pantalla chica es levantarlo aquí y
// fotografiarlo. Con esto se encontró que la tarjeta de botones tapaba un
// tercio del teléfono y que las casillas medían lo ancho de su tarjeta.
//
// Cómo se usa:
//   1. npm install
//   2. npm i --no-save playwright          (no va en package.json: el
//      despliegue no lo necesita y bajarlo tarda)
//   3. echo "SECRETO=lo-que-sea" > .dev.vars   (y CLAVE_ADMIN, RESEND_API_KEY)
//   4. npx wrangler d1 execute t101-trabajadores --local --file=./schema.sql
//   5. npx wrangler dev --local --port 8787
//   6. node scripts/vista-movil.mjs ./tomas
//
// Para ver el expediente o el panel hace falta una sesión. Se firma una a mano
// con la misma llave del .dev.vars:
//   node -e "import('./src/lib.js').then(async l => console.log(
//     await l.firmar({rol:'trabajador', id:'demo-1', email:'x@y.z',
//       exp: Math.floor(Date.now()/1000)+43200}, 'lo-que-sea')))"
// y se pasa en TOKEN_TRABAJADOR / TOKEN_ADMIN.

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const salida = process.argv[2] || './tomas';
const base = process.env.BASE || 'http://127.0.0.1:8787';
const CROMO = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(salida, { recursive: true });

const galleta = (nombre, valor) => ({
  name: nombre, value: valor, domain: new URL(base).hostname,
  path: '/', httpOnly: true, secure: false,
});

// Lo que delata un acomodo roto: algo que se sale de la pantalla, letra
// demasiado chica, o un botón al que no se le puede atinar con el dedo.
const revisar = () => {
  const r = { ventana: innerWidth, ancho: document.documentElement.scrollWidth, alto: document.body.scrollHeight, problemas: [] };
  const dentroDeUnCarril = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const c = el.getBoundingClientRect();
    if (!c.width) continue;
    const quien = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    if (c.right > innerWidth + 1 && !dentroDeUnCarril(el)) r.problemas.push(`se sale: ${quien} llega a ${Math.round(c.right)}`);
    if ((el.tagName === 'BUTTON' || el.tagName === 'A') && c.height && c.height < 40 && el.offsetParent) {
      r.problemas.push(`botón bajo (${Math.round(c.height)}px): ${el.textContent.trim().slice(0, 28)}`);
    }
  }
  r.problemas = [...new Set(r.problemas)].slice(0, 15);
  return r;
};

const navegador = await chromium.launch({ executablePath: CROMO });

async function retrata(nombre, ruta, token) {
  const ctx = await navegador.newContext({ ...devices['iPhone 12'], locale: 'es-MX' });
  if (token) await ctx.addCookies([galleta(token.nombre, token.valor)]);
  const p = await ctx.newPage();
  await p.goto(base + ruta, { waitUntil: 'networkidle' });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${salida}/${nombre}.png` });
  await p.screenshot({ path: `${salida}/${nombre}-completo.png`, fullPage: true });
  console.log(nombre, JSON.stringify(await p.evaluate(revisar), null, 1));
  await ctx.close();
}

await retrata('acceso', '/', null);
if (process.env.TOKEN_TRABAJADOR) await retrata('expediente', '/', { nombre: 't101_sesion', valor: process.env.TOKEN_TRABAJADOR });
if (process.env.TOKEN_ADMIN) await retrata('panel', '/admin', { nombre: 't101_admin', valor: process.env.TOKEN_ADMIN });

await navegador.close();
