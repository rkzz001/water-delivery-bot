// FSM pura del bot: recibe (phone, text, session, assignment) → retorna { reply, nextStep, sideEffects }

import { STEPS, MESSAGES, DRIVERS } from '../config.js';

/**
 * Máquina de estados finitos del bot.
 *
 * Es una función PURA: no toca la DB, no envía mensajes.
 * Todos los efectos secundarios se describen en el objeto `sideEffects`
 * y se ejecutan desde el coordinador en src/index.js.
 *
 * @param {string} phone          - Número del remitente
 * @param {string} text           - Texto del mensaje recibido
 * @param {{ step: string, data: object }} session  - Estado actual de la conversación
 * @param {{ driver_id: number } | null} assignment - Asignación previa cliente→repartidor
 *
 * @returns {{
 *   reply: string,
 *   nextStep: string,
 *   nextData: object,
 *   sideEffects: {
 *     createOrder?: { driverId: number|null, status: string },
 *     saveAssignment?: { driverId: number }
 *   }
 * }}
 */
export function handleMessage(phone, text, session, assignment) {
  const { step, data } = session;
  const input = text.trim();

  switch (step) {

    // ── IDLE: cualquier mensaje arranca el flujo ──────────────────────────────
    case STEPS.IDLE:
      return {
        reply:       MESSAGES.ASK_ORDER,
        nextStep:    STEPS.WAITING_ORDER,
        nextData:    {},
        sideEffects: {},
      };

    // ── WAITING_ORDER: guardar detalles del pedido ────────────────────────────
    case STEPS.WAITING_ORDER:
      return {
        reply:       MESSAGES.ASK_ADDRESS,
        nextStep:    STEPS.WAITING_ADDRESS,
        nextData:    { details: input },
        sideEffects: {},
      };

    // ── WAITING_ADDRESS: guardar dirección y decidir si ya conocemos al repartidor
    case STEPS.WAITING_ADDRESS: {
      const orderData = { ...data, address: input };

      // Cliente ya conocido → crear pedido directo
      if (assignment) {
        const driverName = DRIVERS[assignment.driver_id];
        return {
          reply:       MESSAGES.ORDER_REGISTERED_WITH_DRIVER(driverName),
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {
            createOrder: {
              driverId: assignment.driver_id,
              status:   'ASSIGNED',
              ...orderData,
            },
          },
        };
      }

      // Cliente desconocido → preguntar repartidor
      return {
        reply:       MESSAGES.ASK_DRIVER,
        nextStep:    STEPS.WAITING_DRIVER,
        nextData:    orderData,
        sideEffects: {},
      };
    }

    // ── WAITING_DRIVER: elegir repartidor o indicar que no sabe ───────────────
    case STEPS.WAITING_DRIVER: {
      if (input === '1' || input === '2' || input === '3') {
        const driverId = parseInt(input, 10);
        return {
          reply:       MESSAGES.ORDER_REGISTERED,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {
            createOrder:    { driverId, status: 'ASSIGNED', ...data },
            saveAssignment: { driverId },
          },
        };
      }

      if (input === '4') {
        return {
          reply:       MESSAGES.ORDER_REGISTERED_NO_DRIVER,
          nextStep:    STEPS.IDLE,
          nextData:    {},
          sideEffects: {
            createOrder: { driverId: null, status: 'UNASSIGNED', ...data },
          },
        };
      }

      // Respuesta inválida → mantener estado
      return {
        reply:       MESSAGES.INVALID_DRIVER_CHOICE,
        nextStep:    STEPS.WAITING_DRIVER,
        nextData:    data,
        sideEffects: {},
      };
    }

    // ── Estado desconocido: resetear a IDLE ───────────────────────────────────
    default:
      return {
        reply:       MESSAGES.ASK_ORDER,
        nextStep:    STEPS.WAITING_ORDER,
        nextData:    {},
        sideEffects: {},
      };
  }
}
