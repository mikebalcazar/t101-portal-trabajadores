-- Portal de Trabajadores Taller 101 — esquema D1
CREATE TABLE IF NOT EXISTS trabajadores (
  id                TEXT PRIMARY KEY,
  folio             INTEGER,
  email             TEXT NOT NULL UNIQUE,
  nombre            TEXT DEFAULT '',
  apellido_paterno  TEXT DEFAULT '',
  apellido_materno  TEXT DEFAULT '',
  celular           TEXT DEFAULT '',
  nss               TEXT DEFAULT '',
  curp              TEXT DEFAULT '',
  rfc               TEXT DEFAULT '',
  banco             TEXT DEFAULT '',
  clabe             TEXT DEFAULT '',
  beneficiario      TEXT DEFAULT '',
  emerg_nombre      TEXT DEFAULT '',
  emerg_telefono    TEXT DEFAULT '',
  emerg_email       TEXT DEFAULT '',
  puesto            TEXT DEFAULT '',
  estado            TEXT NOT NULL DEFAULT 'borrador',  -- borrador | completo
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL,
  confirmado_en     TEXT
);

CREATE TABLE IF NOT EXISTS documentos (
  id             TEXT PRIMARY KEY,
  trabajador_id  TEXT NOT NULL REFERENCES trabajadores(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,      -- foto | firma_bancaria | ine | nss | csf | curp | caratula | dc3 | otro
  etiqueta       TEXT DEFAULT '',    -- nombre libre cuando tipo = otro
  nombre_archivo TEXT NOT NULL,
  llave          TEXT NOT NULL,      -- key en R2
  mime           TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  subido_en      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_trab ON documentos(trabajador_id);

CREATE TABLE IF NOT EXISTS codigos (
  email      TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando    TEXT NOT NULL,
  quien     TEXT NOT NULL,
  accion    TEXT NOT NULL,
  detalle   TEXT DEFAULT ''
);

-- Constancia de que el trabajador leyó y aceptó el aviso de privacidad.
-- Tabla aparte (y no columnas nuevas en "trabajadores") para que el esquema se
-- pueda volver a aplicar sobre una base que ya existe sin romper nada.
CREATE TABLE IF NOT EXISTS consentimientos (
  trabajador_id TEXT PRIMARY KEY,
  version       TEXT NOT NULL,
  aceptado_en   TEXT NOT NULL
);

-- Freno contra la adivinación de la clave de administración. Un renglón por
-- dirección de internet: los fallos seguidos, cuántas veces ya se le castigó
-- (para que cada bloqueo dure más que el anterior) y hasta cuándo dura el
-- bloqueo vigente, en segundos desde 1970.
CREATE TABLE IF NOT EXISTS intentos_admin (
  llave           TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  castigos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  visto_en        INTEGER NOT NULL DEFAULT 0
);

-- Papelera. Dar de baja a alguien no borra nada: se apunta aquí y su expediente
-- deja de aparecer en el panel, en el CSV, en el ZIP y en las fichas. A los 30
-- días se borra de verdad, con todo y documentos. Antes de eso se puede
-- restaurar, o borrar de inmediato si así se decide.
CREATE TABLE IF NOT EXISTS papelera (
  trabajador_id TEXT PRIMARY KEY,
  borrado_en    TEXT NOT NULL,   -- ISO, para mostrarlo
  borra_el      INTEGER NOT NULL -- segundos desde 1970: cuándo toca borrar de verdad
);
