// Entry point: inicializa DB, registra handlers de WhatsApp y arranca el scheduler

import { getDb }               from './database/connection.js';
import { getClientAssignment } from './database/queries.js';
import { getOrCreateSession, saveSession, clearSession } from './bot/sessionManager.js';
import { handleMessage }       from './bot/messageHandler.js';
import { createNewOrder }      from './orders/orderService.js';
import { processDriverResponse } from './orders/orderService.js';
import { upsertClientAssignment } from './database/queries.js';
import { onMessage, sendMessage } from './whatsapp/simulator.js';
import { startReminderJob }    from './scheduler/reminderJob.js';
import { DRIVER_PHONES, STEPS } from './config.js';

// ─── Inicialización ───────────────────────────────────────────────────────────

try {
  // Forzar apertura de conexión y aplicación del schema al arrancar
  getDb();
  console.log('[DB] Conexión establecida y esquema aplicado.');
} catch (err) {
  console.error('[DB] Error al inicializar la base de datos:', err.message);
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Devuelve el driver_id si el teléfono pertenece a un repartidor conocido, o null
function getDriverIdByPhone(phone) {
  for (const [id, driverPhone] of Object.entries(DRIVER_PHONES)) {
    if (driverPhone === phone) return parseInt(id, 10);
  }
  return null;
}

// ─── Coordinador de mensajes ──────────────────────────────────────────────────

onMessage(async (from, text) => {
  try {
    // ── Mensaje de un repartidor ─────────────────────────────────────────────
    const driverId = getDriverIdByPhone(from);
    if (driverId !== null) {
      const reply = processDriverResponse(driverId, text);
      sendMessage(from, reply);
      return;
    }

    // ── Mensaje de un cliente ────────────────────────────────────────────────
    const session    = getOrCreateSession(from);
    const assignment = getClientAssignment(from);

    const { reply, nextStep, nextData, sideEffects } = handleMessage(
      from,
      text,
      session,
      assignment ?? null,
    );

    // Ejecutar efectos secundarios descritos por la FSM
    if (sideEffects.createOrder) {
      const { driverId: orderDriverId, status, address, details } = sideEffects.createOrder;
      createNewOrder({
        clientPhone: from,
        driverId:    orderDriverId,
        address,
        details,
        status,
      });
    }

    if (sideEffects.saveAssignment) {
      upsertClientAssignment(from, sideEffects.saveAssignment.driverId);
    }

    // Persistir sesión (o limpiarla si volvemos a IDLE)
    if (nextStep === STEPS.IDLE) {
      clearSession(from);
    } else {
      saveSession(from, nextStep, nextData);
    }

    sendMessage(from, reply);

  } catch (err) {
    console.error(`[Bot] Error procesando mensaje de ${from}:`, err.message);
    sendMessage(from, 'Ocurrió un error. Por favor, intentá de nuevo.');
  }
});

// ─── Scheduler ────────────────────────────────────────────────────────────────

startReminderJob();

console.log('[Bot] Sistema de pedidos activo. Esperando mensajes...');
