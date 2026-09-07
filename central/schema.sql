-- roster101 central — esquema D1
--
-- Aquí viven las empresas que rentan la plataforma, no los trabajadores. Cada
-- empresa que da de alta sus datos aquí acaba teniendo, del otro lado, su
-- propio portal con su propia base: esto es nada más el mostrador de entrada.

CREATE TABLE IF NOT EXISTS empresas (
  id                TEXT PRIMARY KEY,
  folio             INTEGER,
  slug              TEXT UNIQUE,          -- nombre corto: así se llamarán su Worker y su base
  nombre            TEXT DEFAULT '',      -- el nombre con el que se conocen
  razon_social      TEXT DEFAULT '',
  rfc               TEXT DEFAULT '',
  domicilio         TEXT DEFAULT '',
  representante     TEXT DEFAULT '',      -- quién firma por la empresa
  cargo             TEXT DEFAULT '',
  telefono          TEXT DEFAULT '',
  correo_contacto   TEXT NOT NULL UNIQUE, -- con este correo entra el representante
  correo_privacidad TEXT DEFAULT '',      -- a dónde escriben los trabajadores sobre sus datos
  correo_avisos     TEXT DEFAULT '',      -- quién recibe el aviso cuando alguien guarda su expediente
  -- invitada: se le mandó la liga y no ha entrado
  -- llenando: ya entró y va a medias
  -- completa: ella dice que terminó; toca revisar
  -- revisada: Mike la revisó y está lista para abrirle su portal
  -- activa: ya tiene su portal
  -- rechazada: se le pidió corregir algo
  estado            TEXT NOT NULL DEFAULT 'invitada',
  nota              TEXT DEFAULT '',      -- lo que se le pidió corregir, si algo
  portal_url        TEXT DEFAULT '',
  creado_en         TEXT NOT NULL,
  actualizado_en    TEXT NOT NULL,
  enviado_en        TEXT,                 -- cuando la empresa dijo "ya terminé"
  abierto_en        TEXT                  -- cuando se le abrió su portal
);

CREATE TABLE IF NOT EXISTS documentos_empresa (
  id             TEXT PRIMARY KEY,
  empresa_id     TEXT NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  tipo           TEXT NOT NULL,   -- csf | identificacion | domicilio | acta | poder | logo | aviso | otro
  etiqueta       TEXT DEFAULT '',
  nombre_archivo TEXT NOT NULL,
  llave          TEXT NOT NULL,   -- key en R2
  mime           TEXT NOT NULL,
  tamano         INTEGER NOT NULL,
  subido_en      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_docs_empresa ON documentos_empresa(empresa_id);

-- Códigos de acceso de un solo uso, igual que en el portal de trabajadores.
CREATE TABLE IF NOT EXISTS codigos (
  email      TEXT PRIMARY KEY,
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bitacora (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  cuando  TEXT NOT NULL,
  quien   TEXT NOT NULL,
  accion  TEXT NOT NULL,
  detalle TEXT DEFAULT ''
);

-- Freno contra la adivinación de la clave, igual que en el portal.
CREATE TABLE IF NOT EXISTS intentos_admin (
  llave           TEXT PRIMARY KEY,
  fallos          INTEGER NOT NULL DEFAULT 0,
  castigos        INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0,
  visto_en        INTEGER NOT NULL DEFAULT 0
);
