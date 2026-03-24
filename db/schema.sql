-- Esquema de la base de datos para el bot de reparto de agua en bidones
-- Ejecutar en Supabase: Dashboard → SQL Editor → New query → pegar y ejecutar

-- Asignaciones cliente → repartidor preferido (tabla interna del bot)
CREATE TABLE IF NOT EXISTS client_assignments (
  phone      TEXT PRIMARY KEY,
  driver_id  INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sesiones de conversación activas (tabla interna del bot)
CREATE TABLE IF NOT EXISTS sessions (
  phone      TEXT PRIMARY KEY,
  step       TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos de agua en bidones
CREATE TABLE IF NOT EXISTS pedidos (
  id          BIGSERIAL PRIMARY KEY,
  cliente     TEXT        NOT NULL,             -- teléfono del cliente
  producto    TEXT        NOT NULL,             -- ej: "2 bidones de 20 litros"
  direccion   TEXT        NOT NULL,
  driver_id   INTEGER,                          -- uso interno para consultas del bot
  repartidor  TEXT,                             -- nombre del repartidor (nullable si sin asignar)
  metodo_pago TEXT        DEFAULT 'efectivo',   -- efectivo | transferencia
  total       INTEGER     DEFAULT 0,            -- precio total en pesos
  nota        TEXT,                             -- aclaración opcional del cliente
  estado      TEXT        NOT NULL DEFAULT 'PENDING',
  -- Estados: PENDING | ASSIGNED | DELIVERED | NOT_ANSWERED | UNASSIGNED
  origen      TEXT        NOT NULL DEFAULT 'bot',
  -- Origen: bot (WhatsApp) | telefono (carga manual desde dashboard)
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Realtime para el dashboard (ejecutar una sola vez)
-- ALTER TABLE pedidos REPLICA IDENTITY FULL;
-- En Supabase Dashboard: Database → Replication → activar tabla pedidos
