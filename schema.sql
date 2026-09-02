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
