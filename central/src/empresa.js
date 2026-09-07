// Qué se le pide a una empresa para abrirle su portal.
//
// Es el equivalente del expediente del trabajador, del otro lado del mostrador:
// los datos con los que se arma su aviso de privacidad y salen sus correos, y
// los papeles que respaldan que la empresa es quien dice ser.

export const DOCS_EMPRESA = [
  { tipo: 'csf', nombre: 'Constancia de Situación Fiscal', pista: 'La del SAT, con menos de tres meses', obligatorio: true },
  { tipo: 'identificacion', nombre: 'Identificación del representante', pista: 'INE o pasaporte de quien firma por la empresa', obligatorio: true },
  { tipo: 'domicilio', nombre: 'Comprobante de domicilio', pista: 'Luz, agua o predial del domicilio fiscal', obligatorio: true },
  { tipo: 'acta', nombre: 'Acta constitutiva', pista: 'Solo si es persona moral', obligatorio: false },
  { tipo: 'poder', nombre: 'Poder del representante', pista: 'Si quien firma no es el dueño', obligatorio: false },
  { tipo: 'aviso', nombre: 'Su aviso de privacidad', pista: 'Si ya tienen uno propio. Si no, se usa el de roster101 con sus datos', obligatorio: false },
  { tipo: 'logo', nombre: 'Su logotipo', pista: 'Para que el portal de sus trabajadores salga con su marca', obligatorio: false },
  { tipo: 'otro', nombre: 'Otro documento', pista: 'Lo que quieran agregar', obligatorio: false, multiple: true },
];

export const DOCS_OBLIGATORIOS = DOCS_EMPRESA.filter((d) => d.obligatorio).map((d) => d.tipo);

export const NOMBRES_DOC = Object.fromEntries(DOCS_EMPRESA.map((d) => [d.tipo, d.nombre]));

// Los campos que tienen que venir llenos, con el nombre que ve la empresa.
export const CAMPOS_OBLIGATORIOS = [
  ['nombre', 'el nombre de la empresa'],
  ['razon_social', 'la razón social'],
  ['rfc', 'el RFC'],
  ['domicilio', 'el domicilio fiscal'],
  ['representante', 'quién representa a la empresa'],
  ['telefono', 'un teléfono'],
  ['correo_privacidad', 'el correo para asuntos de datos personales'],
];

// RFC de persona moral (12) o física (13).
const RX_RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const RX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function revisaEmpresa(d) {
  const errores = {};
  const t = (v) => String(v ?? '').trim();

  const limpio = {
    nombre: t(d.nombre).slice(0, 80),
    razon_social: t(d.razon_social).slice(0, 140),
    rfc: t(d.rfc).toUpperCase().replace(/[\s-]/g, '').slice(0, 13),
    domicilio: t(d.domicilio).slice(0, 240),
    representante: t(d.representante).slice(0, 120),
    cargo: t(d.cargo).slice(0, 80),
    telefono: t(d.telefono).replace(/\D/g, '').slice(0, 15),
    correo_privacidad: t(d.correo_privacidad).toLowerCase().slice(0, 120),
    correo_avisos: t(d.correo_avisos).toLowerCase().slice(0, 120),
  };

  if (!limpio.nombre) errores.nombre = 'Escribe cómo se conoce a la empresa.';
  if (!limpio.razon_social) errores.razon_social = 'Escribe la razón social, como viene en la Constancia de Situación Fiscal.';
  if (!limpio.rfc) errores.rfc = 'Falta el RFC.';
  else if (!RX_RFC.test(limpio.rfc)) errores.rfc = 'Ese RFC no cuadra: son 12 caracteres para empresa y 13 para persona física.';
  if (!limpio.domicilio) errores.domicilio = 'Falta el domicilio fiscal completo. Va en el aviso de privacidad de sus trabajadores.';
  if (!limpio.representante) errores.representante = 'Escribe quién representa a la empresa.';
  if (limpio.telefono && limpio.telefono.length < 10) errores.telefono = 'El teléfono va a 10 dígitos.';
  if (!limpio.telefono) errores.telefono = 'Falta un teléfono de contacto.';
  if (!limpio.correo_privacidad) errores.correo_privacidad = 'Falta el correo para asuntos de datos personales.';
  else if (!RX_EMAIL.test(limpio.correo_privacidad)) errores.correo_privacidad = 'Ese correo no se ve bien escrito.';
  if (limpio.correo_avisos && !RX_EMAIL.test(limpio.correo_avisos)) errores.correo_avisos = 'Ese correo no se ve bien escrito.';

  return { errores, limpio, ok: Object.keys(errores).length === 0 };
}

// Qué le falta a una empresa para poder abrirle su portal: los datos vacíos y
// los documentos que no ha subido, en el idioma de quien lo va a leer.
export function faltantesDe(empresa, documentos = []) {
  const falta = [];
  for (const [campo, comoSeLlama] of CAMPOS_OBLIGATORIOS) {
    if (!String(empresa?.[campo] || '').trim()) falta.push(comoSeLlama);
  }
  const hay = new Set(documentos.map((d) => d.tipo));
  for (const tipo of DOCS_OBLIGATORIOS) {
    if (!hay.has(tipo)) falta.push(NOMBRES_DOC[tipo]);
  }
  return falta;
}
