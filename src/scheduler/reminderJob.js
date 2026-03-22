// Cron job diario: envía a cada repartidor un resumen de sus pedidos pendientes

import cron from 'node-cron';
import { getPendingOrdersGroupedByDriver } from '../database/queries.js';
import { sendMessage } from '../whatsapp/client.js';
import { DRIVER_PHONES, MESSAGES } from '../config.js';

function groupByDriver(orders) {
  return orders.reduce((acc, order) => {
    if (!acc[order.driver_id]) acc[order.driver_id] = [];
    acc[order.driver_id].push(order);
    return acc;
  }, {});
}

/**
 * Envía recordatorios a todos los repartidores con pedidos pendientes.
 * Exportada para poder invocarla manualmente en tests.
 */
export async function sendReminders() {
  try {
    const orders  = getPendingOrdersGroupedByDriver();
    const grouped = groupByDriver(orders);

    for (const [driverId, driverOrders] of Object.entries(grouped)) {
      const driverPhone = DRIVER_PHONES[driverId];
      if (!driverPhone) continue;

      const lines   = driverOrders.map((o) => MESSAGES.REMINDER_LINE(o));
      const message = [MESSAGES.REMINDER_HEADER, ...lines].join('\n');

      await sendMessage(driverPhone, message);
    }
  } catch (err) {
    console.error('[Scheduler] Error al enviar recordatorios:', err.message);
  }
}

/**
 * Registra el cron job: todos los días a las 09:00 hora local.
 */
export function startReminderJob() {
  cron.schedule('0 9 * * *', () => {
    sendReminders();
  });

  console.log('[Scheduler] Recordatorio diario programado para las 09:00.');
}
