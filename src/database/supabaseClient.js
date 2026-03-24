// Cliente de Supabase: singleton que usa las variables de entorno SUPABASE_URL y SUPABASE_KEY

import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  throw new Error('Faltan las variables de entorno SUPABASE_URL y/o SUPABASE_KEY');
}

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY,
);
