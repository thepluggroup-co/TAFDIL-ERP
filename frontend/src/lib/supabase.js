import { createClient } from '@supabase/supabase-js';

export const STORAGE_KEY = 'tafdil-erp-session';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, storageKey: STORAGE_KEY } }
);

export default supabase;
