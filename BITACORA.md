# Bitácora del Portal de Trabajadores

Cada renglón es una versión publicada. La más reciente hasta arriba.

| Fecha | Versión | Qué cambió |
|---|---|---|
| 2026-09-02 | 0.1.3 | La identificación se pide en dos fotos: **frente** y **reverso**, cada una obligatoria y con su propio botón. Lo que ya se había subido como "INE" cuenta como el frente, así que nadie tiene que volver a subirlo. **Falta publicar.** |
| 2026-09-01 | 0.1.2 | Aviso de privacidad obligatorio, guardado por partes y cámara a pantalla completa. Publicado y verificado en producción. |
| 2026-09-01 | 0.1.1 | **Correos funcionando.** Dominio `envios.taller101.mx` verificado en Resend, llave puesta, remitente apuntado ahí. Además: aviso claro cuando el correo no está configurado, en vez de decir "te enviamos un código" y no enviar nada. Versión `5b24d2cb`. |
| 2026-09-01 | 0.1.0 | **Primera publicación.** Portal y panel de administración verificados en vivo. Versión `24e078ad`. |

---

## Estado actual — LISTO PARA USARSE

| | |
|---|---|
| Portal | https://t101-portal.mike-929.workers.dev |
| Administración | https://t101-portal.mike-929.workers.dev/admin |
| Clave de admin | `formon-caoba-formon-98` |
| Base de datos | D1 `t101-trabajadores` ✓ |
| Documentos | R2 `t101-documentos` ✓ |
| Correos | Resend, desde `expedientes@envios.taller101.mx` ✓ |
| Dominio propio | Pendiente. `trabajadores.taller101.mx` exige mover el DNS de taller101.mx de GoDaddy a Cloudflare |

## Probado de punta a punta en producción

1. El portal carga y el panel de administración entra con la clave.
2. Se pide código con un correo real → el correo llega **a la bandeja de entrada**, no a spam.
3. El código abre el expediente.

## Pendiente de probar con un caso real

Llenar un expediente completo, subir los documentos, recibir el correo de confirmación
y exportar el ZIP. Todo eso ya se probó en local; falta verlo con un trabajador de verdad.

## Notas de decisiones

- **Email Service de Cloudflare: descartado.** Exige plan Workers Paid, 5 USD al mes. Resend hace lo mismo gratis.
- El SPF quedó como `v=spf1 include:dc-....._spfm.send.envios.taller101.mx ~all`: GoDaddy envuelve el include de Amazon SES en su propio registro. Funciona igual y Resend lo dio por bueno.
- El subdominio de Cloudflare quedó `mike-929.workers.dev` (el que asignó solo). Cambiarlo después rompería las ligas repartidas.
- El certificado TLS de un subdominio `workers.dev` recién creado tarda de 10 a 30 minutos. Si el portal no carga justo después de publicar, casi siempre es eso.

## Limpieza pendiente

En **resend.com → API keys** hay una llave llamada `t101-portal` con permiso **Full access**,
creada por error. La que usa el portal es `t101-portal-envio` (solo envío, solo este dominio).
Borra la de Full access.
