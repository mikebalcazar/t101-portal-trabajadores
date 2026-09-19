// Lista de clientes de roster101, para que el despliegue los publique a todos.
//
// Cada cliente es un archivo en clientes/ (un Worker por empresa; sus datos
// viven en su base de la suite). El de Taller 101 es el wrangler.toml de la
// raíz. Los archivos que empiezan con guion bajo son plantillas y no se publican.
import { readdirSync, readFileSync } from 'node:fs';

const nombreDe = (texto) => (texto.match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1];
const orgDe = (texto) => (texto.match(/^ORG_ID\s*=\s*"([^"]+)"/m) || [])[1];

const raiz = readFileSync('wrangler.toml', 'utf8');
const lista = [{ slug: 'taller101', config: 'wrangler.toml', worker: nombreDe(raiz), org: orgDe(raiz), raiz: true }];

for (const archivo of readdirSync('clientes').sort()) {
  if (!archivo.endsWith('.toml') || archivo.startsWith('_')) continue;
  const texto = readFileSync(`clientes/${archivo}`, 'utf8');
  lista.push({ slug: archivo.replace(/\.toml$/, ''), config: `clientes/${archivo}`, worker: nombreDe(texto), org: orgDe(texto), raiz: false });
}

if (process.argv[2] === '--tabla') {
  for (const c of lista) console.log(`${c.slug.padEnd(20)} ${String(c.worker).padEnd(28)} empresa ${c.org}`);
} else {
  console.log(JSON.stringify(lista));
}
