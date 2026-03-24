// Validaciones y estructura de un pedido antes de persistirlo

import { ORDER_STATUS } from '../config.js';

const VALID_STATUSES = new Set(Object.values(ORDER_STATUS));

/**
 * Valida y normaliza los datos de un pedido entrante.
 * Lanza un Error con mensaje descriptivo si algún campo es inválido.
 *
 * @param {{ clientPhone, driverId, address, details, status }} raw
 * @returns {{ clientPhone: string, driverId: number|null, address: string, details: string, status: string }}
 */
export function validateOrder(raw) {
  const { clientPhone, driverId, address, details, status, paymentMethod, notes } = raw;

  if (!clientPhone || typeof clientPhone !== 'string' || !clientPhone.trim()) {
    throw new Error('El teléfono del cliente es obligatorio.');
  }

  if (!address || typeof address !== 'string' || !address.trim()) {
    throw new Error('La dirección es obligatoria.');
  }

  if (!details || typeof details !== 'string' || !details.trim()) {
    throw new Error('El detalle del pedido es obligatorio.');
  }

  if (status && !VALID_STATUSES.has(status)) {
    throw new Error(`Estado inválido: ${status}. Válidos: ${[...VALID_STATUSES].join(', ')}`);
  }

  // driverId puede ser null (pedido sin asignar)
  if (driverId !== null && driverId !== undefined && !Number.isInteger(driverId)) {
    throw new Error('El driver_id debe ser un entero o null.');
  }

  return {
    clientPhone:   clientPhone.trim(),
    driverId:      driverId ?? null,
    address:       address.trim(),
    details:       details.trim(),
    status:        status ?? ORDER_STATUS.PENDING,
    paymentMethod: paymentMethod ?? 'efectivo',
    notes:         notes ?? null,
  };
}
