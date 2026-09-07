// Lista de clientes de roster101, para que el despliegue los publique a todos.
//
// Cada cliente es un archivo en clientes/. El de Taller 101 es el wrangler.toml
// de la raíz, que además es el que se usa para trabajar en local. Los archivos
// que empiezan con guion bajo son plantillas y no se publican.
import { readdirSync, readFileSync } from 'node:fs';

const nombreDe = (texto) => (texto.match(/^\s*name\s*=\s*"([^"]+)"/m) || [])[1];
const baseDe = (texto) => (texto.match(/database_name\s*=\s*"([^"]+)"/) || [])[1];

const lista = [{
  slug: 'taller101',
  config: 'wrangler.toml',
  worker: nombreDe(readFileSync('wrangler.toml', 'utf8')),
  base: baseDe(readFileSync('wrangler.toml', 'utf8')),
  raiz: true,
}];

for (const archivo of readdirSync('clientes').sort()) {
  if (!archivo.endsWith('.toml') || archivo.startsWith('_')) continue;
  const texto = readFileSync(`clientes/${archivo}`, 'utf8');
  lista.push({
    slug: archivo.replace(/\.toml$/, ''),
    config: `clientes/${archivo}`,
    worker: nombreDe(texto),
    base: baseDe(texto),
    raiz: false,
  });
}

if (process.argv[2] === '--tabla') {
  for (const c of lista) console.log(`${c.slug.padEnd(20)} ${String(c.worker).padEnd(28)} ${c.base}`);
} else {
  console.log(JSON.stringify(lista));
}
