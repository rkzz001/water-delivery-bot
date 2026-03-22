// Todas las queries SQL del sistema: cada función encapsula una operación atómica

import { getDb } from './connection.js';
import { ORDER_STATUS } from '../config.js';

// ─── Sesiones ────────────────────────────────────────────────────────────────

export function getSession(phone) {
  return getDb()
    .prepare('SELECT * FROM sessions WHERE phone = ?')
    .get(phone);
}

export function upsertSession(phone, step, data) {
  getDb()
    .prepare(`
      INSERT INTO sessions (phone, step, data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        step       = excluded.step,
        data       = excluded.data,
        updated_at = excluded.updated_at
    `)
    .run(phone, step, JSON.stringify(data));
}

export function deleteSession(phone) {
  getDb()
    .prepare('DELETE FROM sessions WHERE phone = ?')
    .run(phone);
}

// ─── Asignaciones cliente → repartidor ───────────────────────────────────────

export function getClientAssignment(phone) {
  return getDb()
    .prepare('SELECT * FROM client_assignments WHERE phone = ?')
    .get(phone);
}

export function upsertClientAssignment(phone, driverId) {
  getDb()
    .prepare(`
      INSERT INTO client_assignments (phone, driver_id, updated_at)
      VALUES (?, ?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET
        driver_id  = excluded.driver_id,
        updated_at = excluded.updated_at
    `)
    .run(phone, driverId);
}

// ─── Pedidos ─────────────────────────────────────────────────────────────────

export function createOrder({ clientPhone, driverId, address, details, status }) {
  const result = getDb()
    .prepare(`
      INSERT INTO orders (client_phone, driver_id, address, details, status)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(clientPhone, driverId ?? null, address, details, status);

  return getOrderById(result.lastInsertRowid);
}

export function getOrderById(id) {
  return getDb()
    .prepare('SELECT * FROM orders WHERE id = ?')
    .get(id);
}

export function updateOrderStatus(id, status) {
  getDb()
    .prepare(`
      UPDATE orders
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
    .run(status, id);
}

// Pedidos activos (PENDING o ASSIGNED) asignados a un repartidor específico
export function getActiveOrdersByDriver(driverId) {
  return getDb()
    .prepare(`
      SELECT * FROM orders
      WHERE driver_id = ?
        AND status IN (?, ?)
      ORDER BY created_at ASC
    `)
    .all(driverId, ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED);
}

// Pedidos pendientes o no atendidos agrupados por repartidor (para el scheduler)
export function getPendingOrdersGroupedByDriver() {
  return getDb()
    .prepare(`
      SELECT * FROM orders
      WHERE status IN (?, ?)
        AND driver_id IS NOT NULL
      ORDER BY driver_id, created_at ASC
    `)
    .all(ORDER_STATUS.PENDING, ORDER_STATUS.NOT_ANSWERED);
}
