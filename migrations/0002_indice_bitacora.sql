-- La bitácora se lee al revés (lo más reciente primero) y siempre acotada a los
-- últimos días. Sin este índice, cada consulta recorre la tabla entera, que solo
-- crece.
CREATE INDEX IF NOT EXISTS idx_bitacora_cuando ON bitacora(cuando DESC);
CREATE INDEX IF NOT EXISTS idx_bitacora_accion ON bitacora(accion);
