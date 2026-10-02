/* 0118 · La empresa del dominio propio manda sobre ORG_ID (2-oct-2026).
 *
 * Mike: «que al abrirla les abra sus portales personalizados (ej.
 * roster101.dominioempresa.com)». Este Worker era de UNA empresa (ORG_ID en
 * wrangler.toml); por el dominio de otra abriría la de siempre. Ahora, si la
 * puerta de las empresas (puerta/ de la API) manda X-Dominio-Empresa y
 * X-Org-Empresa, el motor se toca en /roster/{esa empresa}/api, y el aviso de
 * privacidad lleva su nombre. Sin las cabeceras, nada cambia.
 *
 *   node pruebas/0118-la-empresa-del-dominio.mjs
 */
import { readFileSync } from 'node:fs';
import { empresaDe, nombreDeEmpresa, datosEmpresa } from '../src/index.js';

let fallas = 0, revisadas = 0;
const rev = (ok, texto, extra = '') => {
  revisadas++; if (!ok) fallas++;
  console.log(`  ${ok ? 'ok   ' : 'FALLA'} ${texto}${extra ? '  →  ' + extra : ''}`);
};
const req = (o = {}) => new Request('https://roster101.acme.com/api/x', { headers: o });
const env = { ORG_ID: 'forespot', EMPRESA: 'Taller 101' };

console.log('· sin dominio, lo de siempre');
rev(empresaDe(req(), env) === 'forespot', 'ORG_ID manda cuando no hay dominio');
rev(nombreDeEmpresa(req(), env) === 'Taller 101', 'y el nombre es el del wrangler.toml');

console.log('· por el dominio de una empresa');
rev(empresaDe(req({ 'X-Dominio-Empresa': 'acme.com', 'X-Org-Empresa': 'acme' }), env) === 'acme', 'la empresa del dominio manda sobre ORG_ID');
rev(empresaDe(req({ 'X-Org-Empresa': 'acme' }), env) === 'forespot', 'X-Org-Empresa sola, a mano, no vale');
rev(nombreDeEmpresa(req({ 'X-Dominio-Empresa': 'acme.com', 'X-Empresa-Nombre': encodeURIComponent('Acme Muebles') }), env) === 'Acme Muebles', 'el nombre viene decodificado');
rev(datosEmpresa(env, 'Acme Muebles').empresa === 'Acme Muebles' && datosEmpresa(env).empresa === 'Taller 101', 'y los datos del aviso lo usan, sin perder el de siempre');

console.log('· el código ya no se cuelga de ORG_ID a secas');
const src = readFileSync('src/index.js', 'utf8');
rev(!/encodeURIComponent\(c\.env\.ORG_ID\)/.test(src), 'la ruta del motor se arma con la empresa resuelta');
rev(/empresaDe\(req, c\.env\)/.test(src) && /nombreDeEmpresa\(req, c\.env\)/.test(src), 'y /api/* la usa, con el nombre');

console.log(`\n${revisadas} revisadas · ${fallas} fallas`);
process.exit(fallas ? 1 : 0);
