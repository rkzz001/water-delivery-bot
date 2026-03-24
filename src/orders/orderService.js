// Lógica de negocio de pedidos: crear, asignar y actualizar estado

import { validateOrder } from './orderModel.js';
import {
  createOrder,
  getOrderById,
  updateOrderStatus,
  getActiveOrdersByDriver,
  upsertClientAssignment,
} from '../database/queries.js';
import { calculateTotal } from '../bot/messageHandler.js';
import { ORDER_STATUS, MESSAGES, DRIVER_PHONES, DRIVERS, NOTIFY_GROUP_ID } from '../config.js';
import { sendMessage } from '../whatsapp/client.js';

/**
 * Crea un pedido validado, calcula el total, resuelve el nombre del repartidor
 * y persiste en Supabase. Si tiene repartidor asignado, notifica al repartidor.
 */
export async function createNewOrder(rawData) {
  const validated  = validateOrder(rawData);
  const total      = calculateTotal(validated.details);
  const repartidor = validated.driverId ? (DRIVERS[validated.driverId] ?? null) : null;

  const order = await createOrder({ ...validated, total, repartidor });

  if (order.driver_id) {
    const driverPhone = DRIVER_PHONES[order.driver_id];
    if (driverPhone) {
      await sendMessage(driverPhone, MESSAGES.NEW_ORDER_NOTIFICATION(order));
    }
  } else if (NOTIFY_GROUP_ID) {
    await sendMessage(NOTIFY_GROUP_ID, MESSAGES.UNASSIGNED_ORDER_NOTIFICATION(order));
  }

  return order;
}

/**
 * Procesa la respuesta numérica de un repartidor (1 / 2 / 3).
 * Si tiene más de un pedido activo, retorna waitForSelection.
 */
export async function processDriverResponse(driverId, input) {
  const activeOrders = await getActiveOrdersByDriver(driverId);

  if (activeOrders.length === 0) {
    return { reply: MESSAGES.DRIVER_NO_ACTIVE_ORDERS };
  }

  const trimmed = input.trim();

  if (!['1', '2', '3'].includes(trimmed)) {
    return { reply: MESSAGES.DRIVER_INVALID_RESPONSE };
  }

  if (activeOrders.length > 1) {
    return {
      reply:            MESSAGES.DRIVER_AMBIGUOUS_ORDERS(activeOrders.map((o) => o.id)),
      waitForSelection: { action: trimmed, orderIds: activeOrders.map((o) => o.id) },
    };
  }

  const actionResult = await applyDriverAction(activeOrders[0].id, trimmed);
  return { reply: actionResult.reply, clientToNotify: actionResult.clientToNotify };
}

/**
 * Aplica una acción (1/2/3) a un pedido específico por ID.
 */
export async function applyDriverAction(orderId, action) {
  if (action === '3') {
    return { reply: `Pedido #${orderId} reprogramado. Te lo recordaré mañana.` };
  }

  const STATUS_MAP = { '1': ORDER_STATUS.DELIVERED, '2': ORDER_STATUS.NOT_ANSWERED };
  const newStatus  = STATUS_MAP[action];
  await updateOrderStatus(orderId, newStatus);

  if (action === '2') {
    const order = await getOrderById(orderId);
    if (order?.cliente) {
      await sendMessage(order.cliente, MESSAGES.ASK_RESCHEDULE);
      return {
        reply:          MESSAGES.ORDER_STATUS_UPDATED(orderId, newStatus),
        clientToNotify: { clientPhone: order.cliente, orderId },
      };
    }
  }

  return { reply: MESSAGES.ORDER_STATUS_UPDATED(orderId, newStatus) };
}

/**
 * Reenvía la notificación de un pedido al repartidor (para reprogramar).
 */
export async function resendOrderToDriver(orderId) {
  const order = await getOrderById(orderId);
  if (!order) return;
  const driverPhone = DRIVER_PHONES[order.driver_id];
  if (driverPhone) {
    await sendMessage(driverPhone, MESSAGES.NEW_ORDER_NOTIFICATION(order));
  }
}

/**
 * Asigna un pedido sin repartidor a un driver específico.
 */
export async function assignOrder(orderId, driverId, clientPhone) {
  await updateOrderStatus(orderId, ORDER_STATUS.ASSIGNED);
  await upsertClientAssignment(clientPhone, driverId);
}
