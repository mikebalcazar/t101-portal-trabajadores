// Le manda a roster101 la clave de su propio panel cuando se instala el central.
// Va por correo y no al registro de Actions: una clave escrita en una bitácora
// se queda ahí para siempre.
const { RESEND_API_KEY, PARA, LIGA, CLAVE, REMITENTE = 'roster101 <expedientes@envios.taller101.mx>' } = process.env;

const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f4f6f8;font-family:Helvetica,Arial,sans-serif;color:#122733">
<table role="presentation" width="100%" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden">
  <tr><td style="background:#0080C1;padding:20px 26px"><span style="color:#fff;font-size:22px;font-weight:800">roster101</span></td></tr>
  <tr><td style="padding:28px 26px">
    <h1 style="margin:0 0 14px;font-size:20px">Tu panel de clientes ya está arriba</h1>
    <p style="font-size:15px;margin:0 0 6px"><strong>Panel</strong><br><a href="${LIGA}/roster">${LIGA}/roster</a></p>
    <p style="font-size:15px;margin:14px 0 6px"><strong>Liga que se les manda a las empresas</strong><br><a href="${LIGA}">${LIGA}</a></p>
    <p style="font-size:15px;margin:14px 0 0">Clave del panel:</p>
    <div style="font-size:22px;font-weight:800;letter-spacing:2px;color:#0080C1;background:#f0f7fb;border-radius:10px;padding:14px;text-align:center;margin:6px 0 0">${CLAVE}</div>
    <p style="font-size:13px;color:#6b7a85;margin:8px 0 0">No queda escrita en el repositorio ni en la bitácora de GitHub: este correo es el único lugar donde está.</p>
  </td></tr>
</table></td></tr></table></body></html>`;

const r = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ from: REMITENTE, to: [PARA], subject: 'Tu panel de clientes de roster101 ya está arriba', html,
    text: `Panel: ${LIGA}/roster\nLiga para las empresas: ${LIGA}\nClave: ${CLAVE}` }),
});
if (!r.ok) { console.error('Resend respondió', r.status, await r.text()); process.exit(1); }
console.log('Clave mandada por correo a', PARA);
