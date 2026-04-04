// Gestión del estado de conversación por número de teléfono, con persistencia en PostgreSQL

import { getSession, upsertSession, deleteSession } from '../database/queries.js';
import { STEPS } from '../config.js';

// ─── Mutex por teléfono (evita race condition con mensajes simultáneos) ────────
const sessionLocks = new Map(); // phone → Promise<void>

export async function withSessionLock(phone, fn) {
  const prev = sessionLocks.get(phone) ?? Promise.resolve();
  let resolve;
  const current = new Promise(r => { resolve = r; });
  sessionLocks.set(phone, current);
  await prev;
  try {
    return await fn();
  } finally {
    resolve();
    if (sessionLocks.get(phone) === current) sessionLocks.delete(phone);
  }
}

/**
 * Devuelve la sesión activa de un número, o una sesión IDLE vacía si no existe.
 */
export async function getOrCreateSession(phone) {
  const row = await getSession(phone);
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
export async function saveSession(phone, step, data) {
  await upsertSession(phone, step, data);
}

/**
 * Elimina la sesión (equivale a resetear a IDLE sin ocupar espacio en DB).
 */
export async function clearSession(phone) {
  await deleteSession(phone);
}
