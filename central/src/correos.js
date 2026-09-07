// Los correos de roster101 central: la invitación al representante de una
// empresa, el recordatorio de lo que le falta, su código de acceso, y el aviso
// a roster101 cuando alguien termina de entregar.
//
// Estos van firmados por roster101, no por una empresa: aquí la plataforma
// habla por sí misma.

const AZUL = '#0080C1';
const OSCURO = '#122733';

function plantilla({ titulo, cuerpo, pie }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:'Raleway',Helvetica,Arial,sans-serif;color:${OSCURO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px">
<tr><td align="center">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 14px rgba(18,39,51,.08)">
    <tr><td style="background:${AZUL};padding:20px 26px">
      <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:.5px">roster101</span>
    </td></tr>
    <tr><td style="padding:28px 26px">
      <h1 style="margin:0 0 14px;font-size:20px;color:${OSCURO}">${titulo}</h1>
      ${cuerpo}
    </td></tr>
    <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
      ${pie || 'roster101 · expedientes de trabajadores'}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

const boton = (liga, texto) =>
  `<a href="${liga}" style="display:inline-block;background:${AZUL};color:#fff;text-decoration:none;font-weight:700;font-size:16px;padding:13px 22px;border-radius:10px">${texto}</a>`;

export function correoCodigo(codigo) {
  return {
    asunto: `Tu código de acceso: ${codigo} — roster101`,
    html: plantilla({
      titulo: 'Código de acceso',
      cuerpo: `<p style="margin:0 0 18px;font-size:15px;line-height:1.6">Con este código entras a llenar los datos de tu empresa. Vence en 10 minutos.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:10px;color:${AZUL};background:#f0f7fb;border-radius:10px;padding:16px;text-align:center">${codigo}</div>
      <p style="margin:18px 0 0;font-size:13px;color:#6b7a85">Si tú no lo pediste, ignora este correo.</p>`,
    }),
    texto: `Tu código de acceso a roster101 es ${codigo}. Vence en 10 minutos.`,
  };
}

export function correoInvitacion(nombre, liga, correo) {
  return {
    asunto: `${nombre}: registren su empresa en roster101`,
    html: plantilla({
      titulo: `Bienvenidos, ${nombre}`,
      cuerpo: `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Para abrirles el portal donde sus trabajadores van a registrar sus datos y subir sus documentos, primero necesitamos los de la empresa. Se llena desde el celular y se guarda solo: pueden dejarlo a medias y volver.</p>
      <p style="margin:0 0 20px;font-size:15px;line-height:1.6">Entren con este mismo correo —<strong>${correo}</strong>—; les mandamos un código de seis dígitos y listo, no hay contraseña que recordar.</p>
      <p style="margin:0 0 22px">${boton(liga, 'Registrar mi empresa')}</p>
      <p style="margin:0 0 8px;font-size:15px"><strong>Lo que van a necesitar a la mano:</strong></p>
      <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.7">
        <li>Su Constancia de Situación Fiscal</li>
        <li>Identificación de quien firma por la empresa</li>
        <li>Un comprobante del domicilio fiscal</li>
      </ul>
      <p style="margin:18px 0 0;font-size:14px;line-height:1.6;color:#6b7a85">Cuando terminen, lo revisamos y les abrimos su portal.</p>`,
      pie: 'Les llegó este correo porque alguien de roster101 dio de alta a su empresa.',
    }),
    texto: `${nombre}: registren su empresa en roster101 entrando a ${liga} con el correo ${correo}. Tengan a la mano su Constancia de Situación Fiscal, la identificación de quien firma y un comprobante de domicilio.`,
  };
}

export function correoRecordatorio(empresa, faltantes, liga, nota = '') {
  const lista = faltantes.length
    ? `<p style="margin:16px 0 6px;font-size:15px"><strong>Falta:</strong></p><ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.7">${faltantes.map((f) => `<li>${f}</li>`).join('')}</ul>`
    : '';
  const razon = nota
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;background:#fdf6f2;border-left:3px solid #C9694A;padding:11px 13px;border-radius:6px">${nota}</p>`
    : '';
  return {
    asunto: `${empresa.nombre}: falta poco para abrirles su portal`,
    html: plantilla({
      titulo: 'Nos falta algo suyo',
      cuerpo: `${razon}<p style="margin:0 0 16px;font-size:15px;line-height:1.6">Para poder abrirles el portal de sus trabajadores todavía necesitamos lo siguiente. Se entra con el mismo correo de siempre.</p>
      ${lista}
      <p style="margin:22px 0 0">${boton(liga, 'Continuar el registro')}</p>`,
    }),
    texto: `${empresa.nombre}: para abrirles su portal falta ${faltantes.join(', ') || nota}. Continúen en ${liga}`,
  };
}

export function correoExpedienteCompleto(empresa, documentos, liga) {
  const filas = [
    ['Empresa', empresa.nombre],
    ['Razón social', empresa.razon_social],
    ['RFC', empresa.rfc],
    ['Representante', `${empresa.representante}${empresa.cargo ? ` · ${empresa.cargo}` : ''}`],
    ['Domicilio', empresa.domicilio],
    ['Contacto', `${empresa.correo_contacto} · ${empresa.telefono}`],
    ['Documentos', `${documentos.length}`],
  ];
  return {
    asunto: `${empresa.nombre} ya entregó todo — falta tu visto bueno`,
    html: plantilla({
      titulo: `${empresa.nombre} terminó su registro`,
      cuerpo: `<p style="margin:0 0 14px;font-size:15px;line-height:1.6">Capturaron sus datos y subieron sus documentos. Falta que los revises para abrirles su portal.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        ${filas.map(([k, v]) => `<tr><td style="padding:6px 0;color:#6b7a85;white-space:nowrap;vertical-align:top">${k}</td><td style="padding:6px 0 6px 12px"><strong>${v || '—'}</strong></td></tr>`).join('')}
      </table>
      <p style="margin:22px 0 0">${boton(`${liga}/roster`, 'Revisar y abrirles su portal')}</p>`,
    }),
    texto: `${empresa.nombre} terminó su registro. Revísalo en ${liga}/roster`,
  };
}
