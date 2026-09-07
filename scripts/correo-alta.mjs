// El correo que recibe una empresa cuando se da de alta en roster101.
//
// Lleva sus ligas, la clave del panel y lo que falta que nos manden. Se manda
// desde el flujo "Alta de cliente"; los datos entran por variables de entorno
// para que la clave no ande dando vueltas en la línea de comandos.
const {
  RESEND_API_KEY, CORREO_CONTACTO, EMPRESA, LIGA_PORTAL, CLAVE_ADMIN,
  REMITENTE = 'roster101 <expedientes@envios.taller101.mx>',
} = process.env;

const falta = [
  'Razón social completa, como aparece en la Constancia de Situación Fiscal',
  'La Constancia de Situación Fiscal (PDF)',
  'Domicilio fiscal completo: calle, número, colonia, alcaldía o municipio, C.P. y ciudad',
  'Correo al que sus trabajadores pueden escribir sobre sus datos personales',
  'Su aviso de privacidad, si ya tienen uno propio; si no, se usa el de roster101 con sus datos',
  'Su logotipo, si quieren que aparezca en el portal',
];

const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:Helvetica,Arial,sans-serif;color:#122733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#0381C2;padding:20px 26px"><span style="color:#fff;font-size:20px;font-weight:800">roster101</span></td></tr>
  <tr><td style="padding:28px 26px">
    <h1 style="margin:0 0 14px;font-size:20px">Su portal ya está arriba, ${EMPRESA}</h1>
    <p style="font-size:15px;line-height:1.6;margin:0 0 18px">Sus trabajadores ya pueden entrar a registrar sus datos y subir sus documentos desde el celular.</p>
    <p style="font-size:15px;margin:0 0 6px"><strong>Portal del trabajador</strong><br>
      <a href="${LIGA_PORTAL}">${LIGA_PORTAL}</a></p>
    <p style="font-size:15px;margin:14px 0 6px"><strong>Panel de la empresa</strong><br>
      <a href="${LIGA_PORTAL}/admin">${LIGA_PORTAL}/admin</a></p>
    <p style="font-size:15px;margin:14px 0 0">Clave del panel:</p>
    <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#0381C2;background:#f0f7fb;border-radius:10px;padding:14px;text-align:center;margin:6px 0 0">${CLAVE_ADMIN}</div>
    <p style="font-size:13px;color:#6b7a85;margin:8px 0 0">Guárdela y no la reenvíe: con ella se ven los expedientes de toda su gente.</p>
    <h2 style="font-size:16px;margin:26px 0 8px">Lo que falta que nos manden</h2>
    <ul style="margin:0;padding-left:20px;font-size:15px;line-height:1.7">${falta.map((f) => `<li>${f}</li>`).join('')}</ul>
    <p style="font-size:15px;line-height:1.6;margin:18px 0 0">Con eso queda el aviso de privacidad de su empresa y los correos salen a su nombre. Puede responder a este mismo correo.</p>
  </td></tr>
  <tr><td style="padding:16px 26px 24px;border-top:1px solid #e6ebef;font-size:12px;color:#6b7a85">
    roster101 · plataforma de expedientes de trabajadores
  </td></tr>
</table></td></tr></table></body></html>`;

const texto = `Su portal ya está arriba, ${EMPRESA}.
Portal: ${LIGA_PORTAL}
Panel: ${LIGA_PORTAL}/admin
Clave del panel: ${CLAVE_ADMIN}

Falta que nos manden:
${falta.map((f) => '- ' + f).join('\n')}`;

const r = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: REMITENTE,
    to: [CORREO_CONTACTO],
    subject: `Su portal de trabajadores ya está listo — roster101`,
    html,
    text: texto,
  }),
});
if (!r.ok) {
  console.error('Resend respondió', r.status, await r.text());
  process.exit(1);
}
console.log('Correo de alta enviado a', CORREO_CONTACTO);
