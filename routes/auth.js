const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireGuest } = require('../middleware/auth');

// GET /login
router.get('/login', requireGuest, (req, res) => {
  res.render('login', { error: null, next: req.query.next || '/dashboard' });
});

// POST /login
router.post('/login', requireGuest, async (req, res) => {
  const { email, password, next } = req.body;
  try {
    const agency = db.prepare('SELECT * FROM agencies WHERE email = ?').get(email);
    if (!agency) {
      return res.render('login', { error: 'Invalid email or password.', next: next || '/dashboard' });
    }
    if (agency.status === 'suspended') {
      return res.render('login', { error: 'Your account has been suspended. Contact support.', next: next || '/dashboard' });
    }
    const valid = await bcrypt.compare(password, agency.password_hash);
    if (!valid) {
      return res.render('login', { error: 'Invalid email or password.', next: next || '/dashboard' });
    }
    req.session.agencyId = agency.id;
    req.session.agencyName = agency.name;
    req.session.save(() => res.redirect(next || '/dashboard'));
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Something went wrong. Please try again.', next: next || '/dashboard' });
  }
});

// GET /signup
router.get('/signup', requireGuest, (req, res) => {
  res.render('signup', { error: null, ref: req.query.ref || '' });
});

// POST /signup
router.post('/signup', requireGuest, async (req, res) => {
  const { name, email, password, referral_code } = req.body;
  try {
    // Validate referral code
    if (!referral_code || !referral_code.trim()) {
      return res.render('signup', { error: 'A referral code is required to sign up.', ref: '' });
    }
    const referrer = db.prepare('SELECT * FROM agencies WHERE referral_code = ?').get(referral_code.trim());
    if (!referrer) {
      return res.render('signup', { error: 'Invalid referral code. Please get a valid invite link.', ref: referral_code });
    }

    // Check email uniqueness
    const existing = db.prepare('SELECT id FROM agencies WHERE email = ?').get(email);
    if (existing) {
      return res.render('signup', { error: 'An account with this email already exists.', ref: referral_code });
    }

    const hash = await bcrypt.hash(password, 12);
    const myReferralCode = uuidv4().replace(/-/g, '').substring(0, 12).toUpperCase();

    const result = db.prepare(`
      INSERT INTO agencies (name, email, password_hash, referral_code, referred_by, site_credits, plan, status)
      VALUES (?, ?, ?, ?, ?, 1, 'free', 'active')
    `).run(name, email, hash, myReferralCode, referral_code.trim());

    // Record referral
    db.prepare(`
      INSERT INTO referrals (referrer_id, referred_id, converted, credit_awarded)
      VALUES (?, ?, 0, 0)
    `).run(referrer.id, result.lastInsertRowid);

    req.session.agencyId = result.lastInsertRowid;
    req.session.agencyName = name;
    req.session.save(() => res.redirect('/dashboard'));
  } catch (err) {
    console.error('Signup error:', err);
    res.render('signup', { error: 'Something went wrong. Please try again.', ref: referral_code || '' });
  }
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
