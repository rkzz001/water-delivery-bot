// Caché de disponibilidad: domingos + fechas_cerrado de Supabase.
// Se carga al arrancar y se actualiza vía Realtime cuando el Dashboard marca/desmarca días.

import { supabase } from '../database/supabaseClient.js';

const fechasCerradas = new Set();   // Set<'YYYY-MM-DD'>
const motivosMap     = new Map();   // Map<'YYYY-MM-DD', string>

/** Devuelve la fecha actual en Argentina como 'YYYY-MM-DD'. */
function getArgToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

/** Devuelve el día de la semana en Argentina (0 = domingo). */
function getArgDayOfWeek() {
  const argStr = new Date().toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  return new Date(argStr).getDay();
}

export async function initDisponibilidadCache() {
  const { data, error } = await supabase.from('fechas_cerrado').select('fecha, motivo');
  if (error) {
    console.warn('[DisponibilidadCache] No se pudo cargar fechas_cerrado.', error.message);
    return;
  }
  for (const row of data ?? []) {
    fechasCerradas.add(row.fecha);
    motivosMap.set(row.fecha, row.motivo);
  }
  console.log(`[DisponibilidadCache] ${fechasCerradas.size} fechas cerradas cargadas.`);

  supabase
    .channel('fechas-cerrado-realtime')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fechas_cerrado' }, (payload) => {
      fechasCerradas.add(payload.new.fecha);
      motivosMap.set(payload.new.fecha, payload.new.motivo);
      console.log(`[DisponibilidadCache] Fecha cerrada agregada: ${payload.new.fecha}`);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'fechas_cerrado' }, (payload) => {
      fechasCerradas.delete(payload.old.fecha);
      motivosMap.delete(payload.old.fecha);
      console.log(`[DisponibilidadCache] Fecha cerrada eliminada: ${payload.old.fecha}`);
    })
    .subscribe();
}

/**
 * Retorna null si hoy es laborable, o { motivo, esDomingo } si está cerrado.
 */
export function isTodayClosed() {
  if (getArgDayOfWeek() === 0) {
    return { motivo: null, esDomingo: true };
  }
  const hoy = getArgToday();
  if (fechasCerradas.has(hoy)) {
    return { motivo: motivosMap.get(hoy) ?? 'Feriado', esDomingo: false };
  }
  return null;
}
