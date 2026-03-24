// Verificación de conexión a Supabase al arrancar el bot

import { supabase } from './supabaseClient.js';

/**
 * Verifica que la conexión a Supabase funcione comprobando que la tabla 'pedidos' existe.
 * Las tablas deben crearse manualmente en el SQL Editor de Supabase usando db/schema.sql.
 */
export async function initDb() {
  const { error } = await supabase.from('pedidos').select('id').limit(0);
  if (error) {
    throw new Error(`Error conectando a Supabase: ${error.message}`);
  }
}
