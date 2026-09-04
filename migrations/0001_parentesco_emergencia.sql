-- Parentesco del contacto de emergencia.
--
-- Las columnas nuevas no se pueden agregar desde schema.sql: ahí las tablas se
-- crean con CREATE TABLE IF NOT EXISTS, y una tabla que ya existe se queda como
-- estaba. Por eso los cambios a la base van aquí, uno por archivo, y D1 lleva
-- la cuenta de cuáles ya aplicó: correr el despliegue dos veces no los repite.
ALTER TABLE trabajadores ADD COLUMN emerg_parentesco TEXT DEFAULT '';
