const express = require('express');
const { supabase, supabaseAdmin, supabaseUrl, supabaseAnonKey, getUserFromToken } = require('../lib/supabase');
const { requireGuest } = require('../middleware/auth');

const router = express.Router();
const baseUrl = (process.env.BASE_URL || process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

function buildSlugPrefix(email = '') {
  return String(email)
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'agency';
}

async function generateAgencySlug(user) {
  const baseSlug = `${buildSlugPrefix(user.email)}-${String(user.id).slice(0, 6)}`;
  const { data: existing, error } = await supabaseAdmin
    .from('agencies')
    .select('id, slug, auth_user_id')
    .eq('slug', baseSlug)
    .maybeSingle();

  if (error) {
    console.error('Slug lookup failed:', error);
  }

  if (!existing || existing.auth_user_id === user.id) {
    return baseSlug;
  }

  return `${baseSlug}-${String(user.id).slice(0, 4)}`;
}

async function ensureAgencyForUser(user) {
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('agencies')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (existingError) {
    console.error('Agency lookup failed:', existingError);
    throw existingError;
  }

  if (existing) {
    return existing;
  }

  const slug = await generateAgencySlug(user);
  const displayName = user.user_metadata?.full_name || user.email || 'New Agency';
  const payload = {
    auth_user_id: user.id,
    agency_name: user.user_metadata?.full_name || null,
    name: displayName,
    email: user.email || null,
    slug,
    created_at: new Date().toISOString()
  };

  const { data: created, error: createError } = await supabaseAdmin
    .from('agencies')
    .insert(payload)
    .select('*')
    .single();

  if (createError) {
    console.error('Agency creation failed:', createError);
    throw createError;
  }

  return created;
}

function loginErrorMessage(code) {
  if (code === 'auth_failed') return 'Authentication failed. Please try again.';
  if (code === 'session_failed') return 'Session could not be stored. Please try again.';
  if (code === 'invalid_credentials') return 'Invalid email or password.';
  return null;
}

router.get('/login', requireGuest, (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }

  return res.render('login', {
    errorMessage: loginErrorMessage(req.query.error),
    supabaseUrl,
    supabaseAnonKey,
    baseUrl
  });
});

router.get('/signup', requireGuest, (req, res) => {
  return res.render('signup', {
    error: null,
    ref: req.query.ref || '',
    supabaseUrl,
    supabaseAnonKey,
    appUrl: baseUrl
  });
});

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').trim();
  const password = String(req.body.password || '');

  if (!email || !password) {
    return res.status(400).render('login', {
      errorMessage: 'Email and password are required.',
      supabaseUrl,
      supabaseAnonKey,
      baseUrl
    });
  }

  try {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signInData?.session?.access_token) {
      console.error('Email login failed:', signInError);
      return res.status(401).render('login', {
        errorMessage: 'Invalid email or password.',
        supabaseUrl,
        supabaseAnonKey,
        baseUrl
      });
    }

    const { data, error } = await supabaseAdmin.auth.getUser(signInData.session.access_token);
    if (error || !data?.user) {
      console.error('Email login user fetch failed:', error);
      return res.redirect('/login?error=auth_failed');
    }

    const agency = await ensureAgencyForUser(data.user);
    req.session.userId = data.user.id;
    req.session.email = data.user.email || null;
    req.session.agencyId = agency.id;
    req.session.agencyName = agency.agency_name || agency.name || null;

    return req.session.save((sessionError) => {
      if (sessionError) {
        console.error('Session save failed:', sessionError);
        return res.redirect('/login?error=session_failed');
      }
      return res.redirect('/dashboard');
    });
  } catch (error) {
    console.error('Email login exception:', error);
    return res.redirect('/login?error=auth_failed');
  }
});

// OAuth callback — serve EJS page, frontend handles token exchange
router.get('/auth/callback', (req, res) => {
  res.render('auth-callback', { supabaseUrl, supabaseAnonKey });
});

// POST /auth/session — called by frontend after Supabase login
router.post('/auth/session', async (req, res) => {
  try {
    const accessToken = String(req.body.access_token || '');

    if (!accessToken) {
      return res.status(400).json({ error: 'Missing access token.' });
    }

    const user = await getUserFromToken(accessToken);
    if (!user) {
      console.error('Auth session failed: could not resolve user from token');
      return res.status(401).json({ error: 'Authentication failed.' });
    }

    const agency = await ensureAgencyForUser(user);
    req.session.userId = user.id;
    req.session.email = user.email || null;
    req.session.agencyId = agency.id;
    req.session.agencyName = agency.agency_name || agency.name || null;

    return req.session.save((sessionError) => {
      if (sessionError) {
        console.error('Session save failed:', sessionError);
        return res.status(500).json({ error: 'Session error.' });
      }

      return res.json({ success: true, redirect: '/dashboard' });
    });
  } catch (error) {
    console.error('Auth session exception:', error);
    return res.status(500).json({ error: 'Authentication failed.' });
  }
});

router.get('/auth/debug', (req, res) => {
  res.json({
    sessionExists: !!req.session,
    userId: req.session.userId || null,
    email: req.session.email || null
  });
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

module.exports = router;
