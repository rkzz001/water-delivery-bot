// Gestión del estado de conversación por número de teléfono, con persistencia en SQLite

import { getSession, upsertSession, deleteSession } from '../database/queries.js';
import { STEPS } from '../config.js';

/**
 * Devuelve la sesión activa de un número, o una sesión IDLE vacía si no existe.
 */
export function getOrCreateSession(phone) {
  const row = getSession(phone);
  if (row) {
    return {
      step: row.step,
      data: JSON.parse(row.data),
    };
  }
  return { step: STEPS.IDLE, data: {} };
}

/**
 * Persiste el nuevo estado de la sesión.
 */
export function saveSession(phone, step, data) {
  upsertSession(phone, step, data);
}

/**
 * Elimina la sesión (equivale a resetear a IDLE sin ocupar espacio en DB).
 */
export function clearSession(phone) {
  deleteSession(phone);
}
