// Entry point: inicializa DB, WhatsApp, health check y scheduler

import { initDb }                  from './database/connection.js';
import { initPriceCache }          from './cache/precioCache.js';
import { initDisponibilidadCache,
         isTodayClosed }           from './cache/disponibilidadCache.js';
import { getClientAssignment,
         upsertClientAssignment,
         getOrderById,
         assignOrderToDriver }   from './database/queries.js';
import { getOrCreateSession,
         saveSession,
         clearSession }           from './bot/sessionManager.js';
import { handleMessage }          from './bot/messageHandler.js';
import { createNewOrder,
         processDriverResponse,
         applyDriverAction,
         resendOrderToDriver }    from './orders/orderService.js';
import { onMessage, onAdminGroupMessage,
         sendMessage,
         initWhatsApp }           from './whatsapp/client.js';
import { startReminderJob }       from './scheduler/reminderJob.js';
import { startHealthServer }      from './http/healthCheck.js';
import { DRIVER_PHONES, DRIVERS, STEPS,
         MESSAGES, ADMIN_PHONE,
         NOTIFY_GROUP_ID }        from './config.js';

// ─── Base de datos ────────────────────────────────────────────────────────────

try {
  await initDb();
  console.log('[DB] Conexión establecida y esquema aplicado.');
} catch (err) {
  console.error('[DB] Error al inicializar la base de datos:', err.message);
  process.exit(1);
}

await initPriceCache();
await initDisponibilidadCache();

// ─── Health check + panel de asignación ──────────────────────────────────────

startHealthServer(async (orderId, driverId) => {
  const order = await getOrderById(orderId);
  if (!order) throw new Error(`No existe el pedido #${orderId}`);

  const updatedOrder = await assignOrderToDriver(orderId, driverId);
  await upsertClientAssignment(order.cliente, driverId);

  const driverPhone = DRIVER_PHONES[driverId];
  if (driverPhone) {
    await sendMessage(driverPhone, MESSAGES.NEW_ORDER_NOTIFICATION(updatedOrder));
  }

  return MESSAGES.ADMIN_ASSIGN_SUCCESS(orderId, DRIVERS[driverId], order.cliente);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDriverIdByPhone(phone) {
  for (const [id, driverPhone] of Object.entries(DRIVER_PHONES)) {
    if (driverPhone && driverPhone === phone) return parseInt(id, 10);
  }
  return null;
}

// ─── Coordinador de mensajes ──────────────────────────────────────────────────

async function handleClientToNotify(clientToNotify) {
  if (!clientToNotify) return;
  await saveSession(clientToNotify.clientPhone, STEPS.WAITING_RESCHEDULE, {
    orderId: clientToNotify.orderId,
  });
}

function parseAssignCommand(text) {
  const match = text.trim().match(/^asignar\s+#?(\d+)\s+([1-3])$/i);
  if (!match) return null;
  return { orderId: parseInt(match[1], 10), driverId: parseInt(match[2], 10) };
}

function extractOrderIdFromQuote(quotedText) {
  if (!quotedText) return null;
  const match = quotedText.match(/Nuevo pedido #(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

onMessage(async (from, text, quotedText) => {
  try {
    // ── Mensaje de un repartidor ─────────────────────────────────────────────
    const driverId = getDriverIdByPhone(from);
    if (driverId !== null) {
      const session = await getOrCreateSession(from);

      if (session.step === STEPS.WAITING_ORDER_SELECTION) {
        const { pendingAction, orderIds } = session.data;
        const orderId = parseInt(text.trim().replace('#', ''), 10);

        if (!orderIds.includes(orderId)) {
          await sendMessage(from, MESSAGES.DRIVER_INVALID_ORDER_SELECTION(orderIds));
          return;
        }

        const { reply, clientToNotify } = await applyDriverAction(orderId, pendingAction);
        await handleClientToNotify(clientToNotify);
        await clearSession(from);
        await sendMessage(from, reply);
        return;
      }

      const quotedOrderId = extractOrderIdFromQuote(quotedText);
      if (quotedOrderId && ['1', '2', '3'].includes(text.trim())) {
        const { reply, clientToNotify } = await applyDriverAction(quotedOrderId, text.trim());
        await handleClientToNotify(clientToNotify);
        await clearSession(from);
        await sendMessage(from, reply);
        return;
      }

      const { reply, waitForSelection, clientToNotify } = await processDriverResponse(driverId, text);
      await handleClientToNotify(clientToNotify);

      if (waitForSelection) {
        await saveSession(from, STEPS.WAITING_ORDER_SELECTION, {
          pendingAction: waitForSelection.action,
          orderIds:      waitForSelection.orderIds,
        });
      }

      await sendMessage(from, reply);
      return;
    }

    // ── Mensaje de un cliente ────────────────────────────────────────────────

    // Verificar disponibilidad: domingo o feriado
    const cerrado = isTodayClosed();
    if (cerrado) {
      const msg = cerrado.esDomingo
        ? MESSAGES.CLOSED_SUNDAY
        : MESSAGES.CLOSED_HOLIDAY(cerrado.motivo);
      await sendMessage(from, msg);
      return;
    }

    const hour = new Date().getHours();
    if (hour >= 14) {
      await sendMessage(from, MESSAGES.CLOSED_FOR_TODAY);
      return;
    }

    const session    = await getOrCreateSession(from);
    const assignment = await getClientAssignment(from);

    const { reply, nextStep, nextData, sideEffects } = handleMessage(
      from,
      text,
      session,
      assignment ?? null,
    );

    if (sideEffects.createOrder) {
      const { driverId: orderDriverId, status, address, details, paymentMethod, notes } = sideEffects.createOrder;
      await createNewOrder({ clientPhone: from, driverId: orderDriverId, address, details, status, paymentMethod, notes });
    }

    if (sideEffects.saveAssignment) {
      await upsertClientAssignment(from, sideEffects.saveAssignment.driverId);
    }

    if (sideEffects.rescheduleOrder) {
      await resendOrderToDriver(sideEffects.rescheduleOrder.orderId);
    }

    if (nextStep === STEPS.IDLE) {
      await clearSession(from);
    } else {
      await saveSession(from, nextStep, nextData);
    }

    await sendMessage(from, reply);

  } catch (err) {
    console.error(`[Bot] Error procesando mensaje de ${from}:`, err.message);
    await sendMessage(from, 'Ocurrió un error. Por favor, intentá de nuevo.');
  }
});

// ─── Comandos del admin desde el grupo ───────────────────────────────────────

if (NOTIFY_GROUP_ID) {
  onAdminGroupMessage(NOTIFY_GROUP_ID, null, async (text, quotedText) => {
    try {
      let orderId, driverId;

      if (['1', '2', '3'].includes(text) && quotedText) {
        const match = quotedText.match(/Pedido sin repartidor #(\d+)/);
        if (match) {
          orderId  = parseInt(match[1], 10);
          driverId = parseInt(text, 10);
        }
      }

      if (!orderId) {
        const cmd = parseAssignCommand(text);
        if (!cmd) return;
        orderId  = cmd.orderId;
        driverId = cmd.driverId;
      }

      const order = await getOrderById(orderId);
      if (!order) {
        await sendMessage(NOTIFY_GROUP_ID, MESSAGES.ADMIN_ASSIGN_NOT_FOUND(orderId));
        return;
      }

      const updatedOrder = await assignOrderToDriver(orderId, driverId);
      await upsertClientAssignment(order.cliente, driverId);

      const driverPhone = DRIVER_PHONES[driverId];
      if (driverPhone) {
        await sendMessage(driverPhone, MESSAGES.NEW_ORDER_NOTIFICATION(updatedOrder));
      }

      await sendMessage(NOTIFY_GROUP_ID, MESSAGES.ADMIN_ASSIGN_SUCCESS(orderId, DRIVERS[driverId], order.cliente));
    } catch (err) {
      console.error('[Bot] Error procesando comando del admin:', err.message);
    }
  });
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

startReminderJob();

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

console.log('[Bot] Iniciando cliente de WhatsApp...');
initWhatsApp().catch((err) => {
  console.error('[WhatsApp] Error fatal al inicializar:', err.message);
  process.exit(1);
});
