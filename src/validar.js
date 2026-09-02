// Validación de datos mexicanos — Portal Taller 101

const RX = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
  curp: /^[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d$/,
  rfc: /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/,
  nss: /^\d{11}$/,
  clabe: /^\d{18}$/,
  celular: /^\d{10}$/,
};

// Dígito verificador CLABE (ponderaciones 3,7,1)
export function clabeValida(clabe) {
  if (!RX.clabe.test(clabe)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += ((Number(clabe[i]) * pesos[i % 3]) % 10);
  const dv = (10 - (suma % 10)) % 10;
  return dv === Number(clabe[17]);
}

// Dígito verificador CURP (posición 18)
export function curpValida(curp) {
  if (!RX.curp.test(curp)) return false;
  const dic = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += dic.indexOf(curp[i]) * (18 - i);
  const dv = (10 - (suma % 10)) % 10;
  return String(dv) === curp[17];
}

export const soloDigitos = (v) => String(v || '').replace(/\D/g, '');

export function revisaExpediente(d) {
  const errores = {};
  const t = (v) => String(v || '').trim();

  if (!t(d.nombre)) errores.nombre = 'Escribe tu nombre o nombres.';
  if (!t(d.apellido_paterno)) errores.apellido_paterno = 'Falta el apellido paterno.';
  if (!t(d.apellido_materno)) errores.apellido_materno = 'Falta el apellido materno.';

  const cel = soloDigitos(d.celular);
  if (!RX.celular.test(cel)) errores.celular = 'El celular debe tener 10 dígitos.';

  const nss = soloDigitos(d.nss);
  if (!RX.nss.test(nss)) errores.nss = 'El NSS debe tener 11 dígitos.';

  const curp = t(d.curp).toUpperCase();
  if (!curpValida(curp)) errores.curp = 'CURP inválida (18 caracteres, verifica el último dígito).';

  const rfc = t(d.rfc).toUpperCase();
  if (rfc && !RX.rfc.test(rfc)) errores.rfc = 'RFC inválido (12 o 13 caracteres).';

  if (!t(d.banco)) errores.banco = 'Indica el banco.';
  const clabe = soloDigitos(d.clabe);
  if (!clabeValida(clabe)) errores.clabe = 'CLABE inválida (18 dígitos, no coincide el dígito verificador).';
  if (!t(d.beneficiario)) errores.beneficiario = 'Escribe el nombre del beneficiario de la cuenta.';

  if (!t(d.emerg_nombre)) errores.emerg_nombre = 'Falta el nombre del contacto de emergencia.';
  const celE = soloDigitos(d.emerg_telefono);
  if (celE.length < 10) errores.emerg_telefono = 'Teléfono de emergencia a 10 dígitos.';
  const emailE = t(d.emerg_email);
  if (emailE && !RX.email.test(emailE)) errores.emerg_email = 'Correo del contacto de emergencia inválido.';

  const limpio = {
    nombre: t(d.nombre),
    apellido_paterno: t(d.apellido_paterno),
    apellido_materno: t(d.apellido_materno),
    celular: cel,
    nss,
    curp,
    rfc,
    banco: t(d.banco),
    clabe,
    beneficiario: t(d.beneficiario),
    emerg_nombre: t(d.emerg_nombre),
    emerg_telefono: celE,
    emerg_email: emailE,
    puesto: t(d.puesto),
  };
  return { errores, limpio, ok: Object.keys(errores).length === 0 };
}

export const emailValido = (e) => RX.email.test(String(e || '').trim());

// Documentos obligatorios del expediente
export const DOCS_OBLIGATORIOS = ['foto', 'firma_bancaria', 'ine', 'ine_reverso', 'nss', 'csf', 'curp', 'caratula'];
export const DOCS_OPCIONALES = ['dc3', 'otro'];

export const NOMBRES_DOC = {
  foto: 'Fotografía',
  firma_bancaria: 'Datos bancarios firmados',
  ine: 'Identificación — frente',
  ine_reverso: 'Identificación — reverso',
  nss: 'Constancia NSS',
  csf: 'Cédula de Situación Fiscal',
  curp: 'CURP',
  caratula: 'Carátula de cuenta bancaria',
  dc3: 'Certificación DC-3',
  otro: 'Otro documento',
};
