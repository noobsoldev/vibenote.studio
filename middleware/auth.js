function requireAuth(req, res, next) {
  if (req.session && req.session.agencyId) {
    return next();
  }
  return res.redirect('/login?next=' + encodeURIComponent(req.originalUrl));
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.redirect('/admin/login');
}

function requireGuest(req, res, next) {
  if (req.session && req.session.agencyId) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = { requireAuth, requireAdmin, requireGuest };
