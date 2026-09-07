-- La clave del panel de la empresa deja de vivir en el repositorio y pasa a
-- vivir aquí, hasheada. Se guardan también las que ya se usaron, para poder
-- negar que alguien vuelva a poner una de los últimos seis meses.
--
-- Nunca se guarda la clave: se guarda el resultado de derivarla con PBKDF2 y su
-- sal. Para saber si una clave nueva ya se usó hay que derivarla contra la sal
-- de cada clave vieja, que es justo lo que hace el código.
CREATE TABLE IF NOT EXISTS claves_admin (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  hash       TEXT NOT NULL,
  sal        TEXT NOT NULL,
  vueltas    INTEGER NOT NULL,
  creada_en  TEXT NOT NULL,
  vigente    INTEGER NOT NULL DEFAULT 0,   -- 1 = es la que abre hoy
  quien      TEXT DEFAULT ''               -- 'cambio' | 'restauracion' | 'bootstrap'
);
CREATE INDEX IF NOT EXISTS idx_claves_vigente ON claves_admin(vigente);
CREATE INDEX IF NOT EXISTS idx_claves_creada ON claves_admin(creada_en DESC);

-- Códigos para recuperar la clave cuando se olvidó. Van al correo configurado
-- de la empresa, no a uno que se escriba en la pantalla: si se pudiera escribir,
-- cualquiera pediría el código a su propio correo.
CREATE TABLE IF NOT EXISTS codigos_admin (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  hash       TEXT NOT NULL,
  expira     INTEGER NOT NULL,
  intentos   INTEGER NOT NULL DEFAULT 0,
  enviado_en INTEGER NOT NULL
);
