-- Esquema completo de la base de datos para el sistema de reparto de agua

-- Relación aprendida: teléfono cliente → repartidor preferido
CREATE TABLE IF NOT EXISTS client_assignments (
  phone        TEXT PRIMARY KEY,
  driver_id    INTEGER NOT NULL,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- Pedidos de agua en bidones
CREATE TABLE IF NOT EXISTS orders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  client_phone TEXT NOT NULL,
  driver_id    INTEGER,               -- NULL si SIN ASIGNAR
  address      TEXT NOT NULL,
  details      TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'PENDING',
  -- Estados válidos: PENDING | ASSIGNED | DELIVERED | NOT_ANSWERED | UNASSIGNED
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- Sesiones de conversación persistidas para resiliencia ante reinicios
CREATE TABLE IF NOT EXISTS sessions (
  phone        TEXT PRIMARY KEY,
  step         TEXT NOT NULL,
  -- Pasos válidos: IDLE | WAITING_ORDER | WAITING_ADDRESS | WAITING_DRIVER
  data         TEXT NOT NULL DEFAULT '{}',  -- JSON serializado
  updated_at   TEXT DEFAULT (datetime('now'))
);
