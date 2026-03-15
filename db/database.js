const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

let _admin;
let _anon;

// Service role client bypasses RLS. Falls back to anon if key missing.
function getAdminClient() {
  if (!_admin) {
    const key = supabaseServiceKey || supabaseAnonKey;
    if (!supabaseServiceKey) {
      console.warn('[DB] No Supabase service role key set (SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SERVICE_KEY) - using anon key, so RLS applies');
    }
    _admin = createClient(supabaseUrl, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _admin;
}

// Anon client respects RLS.
function getAnonClient() {
  if (!_anon) {
    _anon = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return _anon;
}

// Default export for routes - always admin client.
function db() {
  return getAdminClient();
}

module.exports = { db, getAdminClient, getAnonClient, supabaseUrl, supabaseAnonKey };
