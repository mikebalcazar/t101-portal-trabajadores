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

**Administración** entra en `/admin.html` **con su cuenta de la suite 101** —el
mismo correo de todas las aplicaciones: código de 6 dígitos, PIN o Google—, ve la
tabla de todos, abre cualquier documento y exporta:

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

- El trabajador entra sin contraseña: código de 6 dígitos al correo, vence en 10 minutos, se bloquea a los 5 intentos, y no se puede pedir otro antes de 45 segundos. Quien llega nuevo se da de alta solo, que es lo que hace que suba sus documentos sin que nadie lo capture antes.
- El panel entra por la suite 101 y aquí ya no vive ninguna contraseña. Son **dos altas y las dos hacen falta**: en **workshop101** que la persona exista en la suite y traiga `roster101` entre sus apps; en **Cuentas de este panel** de qué nivel es. Se casan por el correo, y quien entra a la suite sin cuenta aquí ve una pantalla que se lo dice.
- El dueño de la suite entra siempre al panel, y entra como dueño. Es lo que arranca un panel recién puesto —antes lo hacía una clave compartida— y la salida si el último dueño se queda fuera.
- Sesión firmada con HMAC-SHA256 en cookie `HttpOnly` + `Secure` + `SameSite`.
- Un trabajador solo puede ver sus propios documentos (probado: da 403 con el documento de otro).
- Los documentos viven en el bucket de la suite con llaves impredecibles y **solo se sirven a través de la suite**, nunca por URL pública.
- Bitácora de accesos, altas, subidas y exportaciones en la tabla `roster_bitacora` de la base de la empresa.
- `robots.txt` bloquea buscadores.

> **Nota sobre el acceso que pediste** (apellido paterno + NSS): quedó descartado a
> propósito. El NSS aparece en varios documentos internos, así que cualquiera que lo
> viera podría abrir el expediente y leer la CLABE y la INE de esa persona. El código
> al correo es más seguro y además no hay contraseña que se les olvide.

## 4. Dónde viven los datos (desde el 19-sep-2026)

**En la suite 101.** Mike decidió que todo lo de una empresa viva en su base de
la suite: los expedientes, los documentos, la bitácora, la papelera y las
cuentas del panel están en la base por empresa de `suite101-api` (migración
0007, tablas `roster_*`), y los documentos en el bucket de la suite bajo
`orgs/{empresa}/roster/`. El motor —el mismo código que corría aquí, con sus
mismas reglas— corre dentro de la API, en `/roster/{empresa}/api/*`.

Este Worker es el **cascarón** de una empresa: sirve la pantalla y reenvía
`/api/*` a la suite con la empresa de su `wrangler.toml` (`ORG_ID`) y sus
datos (nombre, razón social, domicilio, correos, versión del aviso) en la
cabecera `X-Roster`. Las dos puertas siguen siendo dos: el trabajador entra con
su correo y un código (su cookie la firma ahora la suite); el panel entra con la
cuenta de la suite. El dueño y la administración de la empresa abren el panel
como dueños aunque nadie los haya dado de alta en él todavía.

La central de roster101 (registro de empresas, panel maestro) **se retiró**: el
alta de una empresa se hace en master101, prendiéndole roster101, y se le agrega
su archivo en `clientes/` (ver `clientes/_plantilla.toml`). Un Worker por
empresa, como siempre.

## 5. Publicar y probar

Cada empujón a `main` publica solo: pruebas → staging (empresa demo, contra la
API de staging) → humo en staging (entra y escribe de verdad) → producción, un
Worker por empresa → medición de la puerta de Taller 101 desde afuera. Único
secreto del repositorio: `CLOUDFLARE_API_TOKEN`.

El portal ya no corre en local (su puerta es la suite, por un *service binding*
que sólo existe en Cloudflare). Para probar cambios:

```
npm run prueba      # el cascarón con una suite de mentiras, y la pantalla con un navegador
```

y para probar el portal entero, staging:
https://t101-portal-staging.mike-929.workers.dev (el código de acceso sale en
la respuesta, no por correo).

## 6. Costo

| Servicio | Capa gratis | Cuándo se cobraría |
|---|---|---|
| Cloudflare Workers | 100,000 peticiones/día | Nunca, con este uso |
| Base de la suite (Durable Object) | 5 GB por empresa | Nunca, con este uso |
| Cloudflare R2 (el bucket de la suite) | 10 GB, 1 M escrituras y 10 M lecturas al mes, sin costo de salida | Arriba de 10 GB: ~$0.015 USD por GB al mes |
| Resend | 3,000 correos/mes (100/día) | Arriba de eso: $20 USD/mes |

Con ~8 documentos de 2 MB por persona, **10 GB alcanzan para unos 600 trabajadores**.
Para activar R2 Cloudflare pide registrar una tarjeta, pero no cobra nada por debajo del límite.
La capa gratis de Cloudflare no vence ni se pausa por inactividad.

## 7. Estructura

```
src/index.js      el cascarón: /s101/* y /api/* a la suite, /api/salud y /api/config aquí
public/           portal del trabajador y panel de la empresa
clientes/         un archivo por empresa (Worker por empresa); _plantilla.toml es el molde
scripts/          humo.mjs (staging), medir-puerta.mjs (producción, sólo mira), clientes.mjs
pruebas/          0112 el cascarón, 0101 la pantalla en un teléfono
```

El motor (rutas, validaciones, correos, fichas, exportación, cuentas) vive en
`suite101-api/src/roster/`, con sus pruebas (`pruebas/roster.spec.ts`).

## 8. Si después quieres WhatsApp

Hoy la confirmación va por correo. Para agregar WhatsApp hace falta dar de alta el
número en la API de WhatsApp Business (Meta o Twilio), verificar el negocio y
aprobar una plantilla de mensaje; el costo ronda 2 centavos de dólar por mensaje.
Cuando lo tengas, se agrega una función junto a `enviarCorreo` en `src/correo.js`
y se llama en el mismo punto — el resto no se toca.
