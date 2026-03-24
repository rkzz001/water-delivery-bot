// Caché de precios en memoria — se carga desde Supabase al arrancar
// y se actualiza automáticamente vía Realtime cuando el Dashboard edita un precio.

import { supabase } from '../database/supabaseClient.js';

// Mapa de claves de la BD → claves del objeto PRICES
const DB_KEY_MAP = {
  bidon_20l:  20,
  bidon_12l:  12,
  bidon_10l:  10,
  bidon_8l:   8,
  bidon_5l:   5,
  sifon_soda: 'sifon',
};

// Objeto mutable exportado — todos los módulos que lo importen ven siempre la versión actual.
export const PRICES = {
  20: 4000, 12: 3500, 10: 2500, 8: 2600, 5: 1800, sifon: 1000,
};

function applyRows(rows) {
  for (const row of rows) {
    const key = DB_KEY_MAP[row.clave];
    if (key !== undefined) PRICES[key] = row.valor;
  }
}

export async function initPriceCache() {
  const { data, error } = await supabase.from('configuracion').select('clave, valor');
  if (error) {
    console.warn('[PriceCache] No se pudieron cargar los precios, usando defaults.', error.message);
    return;
  }
  applyRows(data ?? []);
  console.log('[PriceCache] Precios cargados:', JSON.stringify(PRICES));

  // Actualización en tiempo real cuando el Dashboard cambia un precio
  supabase
    .channel('configuracion-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracion' }, (payload) => {
      const row = payload.new ?? payload.old;
      const key = DB_KEY_MAP[row?.clave];
      if (key !== undefined && payload.new?.valor != null) {
        PRICES[key] = payload.new.valor;
        console.log(`[PriceCache] Precio actualizado: ${row.clave} → $${payload.new.valor}`);
      }
    })
    .subscribe();
}

/** Genera el mensaje de selección de producto con precios actuales. */
export function getASK_SIZE() {
  const fmt = (n) => n.toLocaleString('es-AR');
  return [
    '¿Qué producto querés?',
    `1 Sifón de soda — $${fmt(PRICES.sifon)}`,
    `2 Bidón 5 litros — $${fmt(PRICES[5])}`,
    `3 Bidón 8 litros — $${fmt(PRICES[8])}`,
    `4 Bidón 10 litros — $${fmt(PRICES[10])}`,
    `5 Bidón 12 litros — $${fmt(PRICES[12])}`,
    `6 Bidón 20 litros — $${fmt(PRICES[20])}`,
  ].join('\n');
}
