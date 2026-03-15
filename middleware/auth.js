const { supabaseAdmin } = require('../lib/supabase');

async function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const { data: agency, error } = await supabaseAdmin
      .from('agencies')
      .select('*')
      .eq('auth_user_id', req.session.userId)
      .maybeSingle();

    if (error) {
      return next(error);
    }

    if (agency) {
      req.agency = agency;
      req.session.agencyId = agency.id;
      req.session.agencyName = agency.agency_name || agency.name || null;
    }

    return next();
  } catch (error) {
    return next(error);
  }
}

function requireGuest(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = {
  requireAuth,
  requireGuest
};
