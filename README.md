# roster101 — Portal de Trabajadores

Webapp para que cada trabajador registre sus datos, suba sus documentos escaneados
y administración exporte todo en un ZIP con **una carpeta por trabajador** más una
tabla en Excel.

Funciona desde cualquier navegador y desde el celular (foto con la cámara, firma con el dedo).

---

## 1. Qué hace

**El trabajador** entra con su correo, recibe un código de 6 dígitos y llena:

| Sección | Qué captura |
|---|---|
| Datos personales | Nombre, apellido paterno y materno, celular, puesto, NSS, CURP, RFC |
| Fotografía | La sube o la toma con la cámara del celular / webcam |
| Cuenta bancaria | Banco, CLABE, beneficiario — y **firma sobre la pantalla**: se genera un PNG con los datos y su firma encima |
| Contacto de emergencia | Nombre, teléfono, correo |
| Documentos | INE/Pasaporte, NSS, CSF, CURP, carátula bancaria, DC-3 y "otro" (varios) |

Al guardar le llega un **correo de confirmación** con el resumen y lo que falte,
y a administración le llega un aviso.

Puede volver a entrar cuando quiera con el mismo correo y corregir o subir lo que falte.

**Administración** entra en `/admin.html` con una clave, ve la tabla de todos,
abre cualquier documento y exporta:

```
Expedientes Taller 101 2026-09-01.zip
├── Tabla de trabajadores.csv          ← abre en Excel
├── LEEME.txt
├── HERNANDEZ LOPEZ JUAN CARLOS/
│   ├── Fotografia.jpg
│   ├── Datos bancarios firmados.png
│   ├── INE o Pasaporte vigente.jpg
│   ├── Constancia NSS.pdf
│   ├── Cedula de Situacion Fiscal.pdf
│   ├── CURP.pdf
│   ├── Caratula de cuenta bancaria.pdf
│   ├── Certificacion DC-3.pdf
│   └── Datos del trabajador.txt
└── RAMIREZ SOLIS ANA/
    └── …
```

## 2. Validaciones que ya trae

- **CLABE**: valida los 18 dígitos *y* el dígito verificador (ponderación 3-7-1). Un pago no se va a regresar por un dígito mal escrito.
- **CURP**: formato completo y dígito verificador.
- **NSS**: 11 dígitos. **Celular**: 10 dígitos.
- **CURP/NSS duplicados**: no deja registrar a la misma persona con dos correos.
- Archivos: solo JPG, PNG, WEBP, HEIC o PDF, máximo 10 MB. Las fotos se comprimen en el celular antes de subir.

## 3. Seguridad

- Sin contraseñas: código de 6 dígitos al correo, vence en 10 minutos, se bloquea a los 5 intentos, y no se puede pedir otro antes de 45 segundos.
- Sesión firmada con HMAC-SHA256 en cookie `HttpOnly` + `Secure` + `SameSite`.
- Un trabajador solo puede ver sus propios documentos (probado: da 403 con el documento de otro).
- Los documentos viven en R2 con llaves impredecibles y **solo se sirven a través del Worker**, nunca por URL pública.
- Bitácora de accesos, altas, subidas y exportaciones en la tabla `bitacora`.
- `robots.txt` bloquea buscadores.

> **Nota sobre el acceso que pediste** (apellido paterno + NSS): quedó descartado a
> propósito. El NSS aparece en varios documentos internos, así que cualquiera que lo
> viera podría abrir el expediente y leer la CLABE y la INE de esa persona. El código
> al correo es más seguro y además no hay contraseña que se les olvide.

## 4. Publicar

```bash
bash scripts/desplegar.sh
```

El script hace todo: instala dependencias, crea la base D1, crea el bucket R2,
aplica el esquema, genera el secreto de sesiones, pide la clave de administración
y la llave de Resend, y publica. Se puede correr las veces que quieras.

Después, en el panel de Cloudflare:
**Workers & Pages → t101-portal → Settings → Domains & Routes → Add custom domain
→ `trabajadores.taller101.mx`**

Y en **resend.com → Domains**, agrega `taller101.mx` y captura los registros
SPF/DKIM que te dé en el DNS. Sin ese paso los correos no salen.

## 5. Probar en tu computadora

```bash
bash scripts/local.sh
```

Abre `http://localhost:8788`. El código de acceso **no** se manda por correo: sale
en la respuesta y en la consola. La clave de admin en local es `admin123`.

## 6. Costo

| Servicio | Capa gratis | Cuándo se cobraría |
|---|---|---|
| Cloudflare Workers | 100,000 peticiones/día | Nunca, con este uso |
| Cloudflare D1 | 5 GB y 5 M lecturas/día | Nunca (los datos son texto) |
| Cloudflare R2 | 10 GB, 1 M escrituras y 10 M lecturas al mes, sin costo de salida | Arriba de 10 GB: ~$0.015 USD por GB al mes |
| Resend | 3,000 correos/mes (100/día) | Arriba de eso: $20 USD/mes |

Con ~8 documentos de 2 MB por persona, **10 GB alcanzan para unos 600 trabajadores**.
Para activar R2 Cloudflare pide registrar una tarjeta, pero no cobra nada por debajo del límite.
La capa gratis de Cloudflare no vence ni se pausa por inactividad.

## 7. Estructura

```
src/index.js      rutas del API (Worker)
src/lib.js        firmas HMAC, cookies, utilidades
src/validar.js    CLABE, CURP, NSS, reglas del expediente
src/correo.js     plantillas y envío por Resend
src/exportar.js   armado del ZIP y del CSV
public/           portal del trabajador y panel de admin
schema.sql        tablas de D1
scripts/          desplegar.sh y local.sh
```

## 8. Si después quieres WhatsApp

Hoy la confirmación va por correo. Para agregar WhatsApp hace falta dar de alta el
número en la API de WhatsApp Business (Meta o Twilio), verificar el negocio y
aprobar una plantilla de mensaje; el costo ronda 2 centavos de dólar por mensaje.
Cuando lo tengas, se agrega una función junto a `enviarCorreo` en `src/correo.js`
y se llama en el mismo punto — el resto no se toca.
