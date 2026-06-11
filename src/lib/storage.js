import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase credentials. Create a .env file with:\n' +
    '  VITE_SUPABASE_URL=your-project-url\n' +
    '  VITE_SUPABASE_ANON_KEY=your-anon-key'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

/**
 * Storage adapter that matches the window.storage API used by the
 * Claude artifact version of this app, but persists to Supabase
 * so data is shared across all devices using the same backend.
 */
export const storage = {
  async get(key /*, shared */) {
    try {
      const { data, error } = await supabase
        .from('kv_storage')
        .select('key, value')
        .eq('key', key)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { key: data.key, value: data.value, shared: true };
    } catch (err) {
      throw err;
    }
  },

  async set(key, value /*, shared */) {
    const { error } = await supabase
      .from('kv_storage')
      .upsert(
        { key, value, updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );
    if (error) throw error;
    return { key, value, shared: true };
  },

  async delete(key /*, shared */) {
    const { error } = await supabase
      .from('kv_storage')
      .delete()
      .eq('key', key);
    if (error) throw error;
    return { key, deleted: true, shared: true };
  },

  async list(prefix /*, shared */) {
    const safePrefix = String(prefix || '').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const { data, error } = await supabase
      .from('kv_storage')
      .select('key')
      .like('key', `${safePrefix}%`);
    if (error) throw error;
    return {
      keys: (data || []).map(d => d.key),
      prefix,
      shared: true
    };
  }
};
