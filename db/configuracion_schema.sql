-- Tabla de configuración de precios del catálogo
CREATE TABLE IF NOT EXISTS configuracion (
  clave  TEXT PRIMARY KEY,
  valor  INTEGER NOT NULL
);

INSERT INTO configuracion (clave, valor) VALUES
  ('sifon_soda', 1000),
  ('bidon_5l',   1800),
  ('bidon_8l',   2600),
  ('bidon_10l',  2500),
  ('bidon_12l',  3500),
  ('bidon_20l',  4000),
  ('hora_corte', 14)
ON CONFLICT (clave) DO NOTHING;

-- Tabla de fechas no laborables (feriados, cierres especiales)
CREATE TABLE IF NOT EXISTS fechas_cerrado (
  fecha  DATE PRIMARY KEY,
  motivo TEXT NOT NULL DEFAULT 'Feriado'
);

-- Habilitar Realtime en ambas tablas
ALTER TABLE configuracion  REPLICA IDENTITY FULL;
ALTER TABLE fechas_cerrado REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE configuracion;
ALTER PUBLICATION supabase_realtime ADD TABLE fechas_cerrado;
