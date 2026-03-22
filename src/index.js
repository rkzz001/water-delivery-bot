// Entry point: inicializa DB, WhatsApp, health check y scheduler

import { getDb }                  from './database/connection.js';
import { getClientAssignment,
         upsertClientAssignment } from './database/queries.js';
import { getOrCreateSession,
         saveSession,
         clearSession }           from './bot/sessionManager.js';
import { handleMessage }          from './bot/messageHandler.js';
import { createNewOrder,
         processDriverResponse }  from './orders/orderService.js';
import { onMessage, sendMessage,
         initWhatsApp }           from './whatsapp/client.js';
import { startReminderJob }       from './scheduler/reminderJob.js';
import { startHealthServer }      from './http/healthCheck.js';
import { DRIVER_PHONES, STEPS }   from './config.js';

// ─── Base de datos ────────────────────────────────────────────────────────────

try {
  getDb();
  console.log('[DB] Conexión establecida y esquema aplicado.');
} catch (err) {
  console.error('[DB] Error al inicializar la base de datos:', err.message);
  process.exit(1);
}

// ─── Health check HTTP (Railway/Render) ───────────────────────────────────────

startHealthServer();

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Devuelve el driver_id si el teléfono pertenece a un repartidor conocido, o null
function getDriverIdByPhone(phone) {
  for (const [id, driverPhone] of Object.entries(DRIVER_PHONES)) {
    if (driverPhone && driverPhone === phone) return parseInt(id, 10);
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
      await sendMessage(from, reply);
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
      await createNewOrder({ clientPhone: from, driverId: orderDriverId, address, details, status });
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

    await sendMessage(from, reply);

  } catch (err) {
    console.error(`[Bot] Error procesando mensaje de ${from}:`, err.message);
    await sendMessage(from, 'Ocurrió un error. Por favor, intentá de nuevo.');
  }
});

// ─── Scheduler ────────────────────────────────────────────────────────────────

startReminderJob();

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

console.log('[Bot] Iniciando cliente de WhatsApp...');
initWhatsApp().catch((err) => {
  console.error('[WhatsApp] Error fatal al inicializar:', err.message);
  process.exit(1);
});
