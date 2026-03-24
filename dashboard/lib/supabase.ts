import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente del navegador — usado en todos los componentes client-side
export const supabase = createClient(supabaseUrl, supabaseKey);
