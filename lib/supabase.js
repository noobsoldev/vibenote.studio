const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be set.');
}

// Server-side clients — no session persistence needed
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Decode JWT without network call (fallback)
function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  } catch (e) { return null; }
}

// Get user from access token — 3 method fallback chain
async function getUserFromToken(accessToken) {
  // Method 1: service role
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
    if (!error && data?.user) return data.user;
  } catch (e) {}

  // Method 2: anon client
  try {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (!error && data?.user) return data.user;
  } catch (e) {}

  // Method 3: decode JWT directly
  const payload = decodeJwt(accessToken);
  if (payload?.sub) {
    return { id: payload.sub, email: payload.email, user_metadata: payload.user_metadata || {} };
  }

  return null;
}

module.exports = { supabase, supabaseAdmin, supabaseUrl, supabaseAnonKey, getUserFromToken };
