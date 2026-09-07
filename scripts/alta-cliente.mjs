// Escribe el archivo de un cliente nuevo a partir de la plantilla.
//
// Lo usa el flujo "Alta de cliente". Los datos entran por variables de entorno
// para que ni el nombre de la empresa ni sus correos tengan que ir escapados en
// la linea de comandos.
import { readFileSync, writeFileSync } from 'node:fs';

const { SLUG, BASE_ID, EMPRESA, RAZON_SOCIAL, DOMICILIO, CORREO_PRIVACIDAD, CORREO_AVISOS } = process.env;

if (!/^[a-z0-9]([a-z0-9-]{1,30}[a-z0-9])$/.test(SLUG || '')) {
  console.error('Nombre corto inválido:', SLUG);
  process.exit(1);
}

// Las comillas dobles romperían el TOML; se cambian por comillas tipográficas,
// que además es como se escribe bien un nombre.
const texto = (v) => String(v || '').replace(/"/g, '”').trim();

// La versión y la del aviso salen del wrangler.toml de la raíz: así un cliente
// nuevo nace con lo mismo que ya trae Taller 101.
const raiz = readFileSync('wrangler.toml', 'utf8');
const deRaiz = (llave, porDefecto) => (raiz.match(new RegExp(`^${llave} = "([^"]+)"`, 'm')) || [])[1] || porDefecto;

const archivo = `# ${texto(EMPRESA)} — cliente de roster101.
#
# Lo generó el flujo "Alta de cliente"; se puede editar a mano cuando la empresa
# mande sus datos definitivos (razón social, domicilio, correos). Cada cambio
# que llegue a main se publica solo.
#
# Las rutas son relativas a esta carpeta: el código vive un nivel arriba.
name = "roster101-${SLUG}"
main = "../src/index.js"
compatibility_date = "${deRaiz('compatibility_date', '2026-08-01')}"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "../public"
binding = "ASSETS"

[[d1_databases]]
binding = "DB"
database_name = "roster101-${SLUG}"
database_id = "${BASE_ID}"
migrations_dir = "../migrations"

[[r2_buckets]]
binding = "DOCS"
bucket_name = "roster101-${SLUG}-docs"

[vars]
EMPRESA = "${texto(EMPRESA)}"
RAZON_SOCIAL = "${texto(RAZON_SOCIAL)}"
DOMICILIO = "${texto(DOMICILIO)}"
CORREO_PRIVACIDAD = "${texto(CORREO_PRIVACIDAD)}"
CORREO_REMITENTE = "${texto(EMPRESA)} <expedientes@envios.taller101.mx>"
CORREO_AVISOS = "${texto(CORREO_AVISOS)}"
AVISO_VERSION = "${deRaiz('AVISO_VERSION', '2026-09-03')}"
PORTAL_VERSION = "${deRaiz('PORTAL_VERSION', '0.3.0')}"

# Barrido diario de la papelera, 4:00 UTC.
[triggers]
crons = ["0 4 * * *"]
`;

writeFileSync(`clientes/${SLUG}.toml`, archivo);
console.log(`Escrito clientes/${SLUG}.toml`);
