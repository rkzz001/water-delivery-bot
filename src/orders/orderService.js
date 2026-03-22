// Lógica de negocio de pedidos: crear, asignar y actualizar estado

import { validateOrder } from './orderModel.js';
import {
  createOrder,
  updateOrderStatus,
  getActiveOrdersByDriver,
  upsertClientAssignment,
} from '../database/queries.js';
import { ORDER_STATUS, MESSAGES, DRIVER_PHONES } from '../config.js';
import { sendMessage } from '../whatsapp/client.js';

/**
 * Crea un pedido validado y, si tiene repartidor asignado, notifica al repartidor.
 *
 * @param {{ clientPhone, driverId, address, details, status }} rawData
 * @returns {Promise<object>} El pedido recién creado
 */
export async function createNewOrder(rawData) {
  const validated = validateOrder(rawData);
  const order     = createOrder(validated);

  // Notificar al repartidor si el pedido viene asignado
  if (order.driver_id) {
    const driverPhone = DRIVER_PHONES[order.driver_id];
    if (driverPhone) {
      await sendMessage(driverPhone, MESSAGES.NEW_ORDER_NOTIFICATION(order));
    }
  }

  return order;
}

/**
 * Procesa la respuesta numérica de un repartidor (1 / 2 / 3).
 * Maneja la ambigüedad si el repartidor tiene más de un pedido activo.
 *
 * @param {number} driverId  - ID del repartidor
 * @param {string} input     - Texto recibido del repartidor
 * @returns {string}         - Mensaje de respuesta para el repartidor
 */
export function processDriverResponse(driverId, input) {
  const activeOrders = getActiveOrdersByDriver(driverId);

  if (activeOrders.length === 0) {
    return MESSAGES.DRIVER_NO_ACTIVE_ORDERS;
  }

  const trimmed = input.trim();

  if (!['1', '2', '3'].includes(trimmed)) {
    return MESSAGES.DRIVER_INVALID_RESPONSE;
  }

  // "3 Reprogramar" mantiene el pedido en PENDING (no cambia estado)
  if (trimmed === '3') {
    if (activeOrders.length > 1) {
      return MESSAGES.DRIVER_AMBIGUOUS_ORDERS(activeOrders.map((o) => o.id));
    }
    return `Pedido #${activeOrders[0].id} reprogramado. Te lo recordaré mañana.`;
  }

  // Para 1 (Entregado) y 2 (No atendió)
  if (activeOrders.length > 1) {
    return MESSAGES.DRIVER_AMBIGUOUS_ORDERS(activeOrders.map((o) => o.id));
  }

  const STATUS_MAP = { '1': ORDER_STATUS.DELIVERED, '2': ORDER_STATUS.NOT_ANSWERED };
  const newStatus  = STATUS_MAP[trimmed];
  updateOrderStatus(activeOrders[0].id, newStatus);
  return MESSAGES.ORDER_STATUS_UPDATED(activeOrders[0].id, newStatus);
}

/**
 * Asigna un pedido sin repartidor a un driver específico.
 */
export function assignOrder(orderId, driverId, clientPhone) {
  updateOrderStatus(orderId, ORDER_STATUS.ASSIGNED);
  upsertClientAssignment(clientPhone, driverId);
}
