const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getDb } = require('../db/database');
const db = { prepare: (...a) => getDb().prepare(...a), exec: (...a) => getDb().exec(...a), transaction: (...a) => getDb().transaction(...a) };
const { requireAuth } = require('../middleware/auth');

let Razorpay;
try {
  Razorpay = require('razorpay');
} catch (e) {
  console.warn('Razorpay not available');
}

function getRazorpay() {
  if (!Razorpay) return null;
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
  });
}

const planCredits = { starter: 1, growth: 10, agency: 50 };

// GET /plans
router.get('/', requireAuth, (req, res) => {
  const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);
  res.render('plans', {
    agency,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    reason: req.query.reason || null,
    plans: {
      starter: { name: 'Starter', price: 5000, display: '₹5,000', sites: 1, planId: process.env.PLAN_STARTER_ID },
      growth: { name: 'Growth', price: 40000, display: '₹40,000', sites: 10, planId: process.env.PLAN_GROWTH_ID },
      agency: { name: 'Agency', price: 250000, display: '₹2,50,000', sites: 50, planId: process.env.PLAN_AGENCY_ID }
    }
  });
});

// POST /plans/subscribe - create Razorpay subscription
router.post('/subscribe', requireAuth, async (req, res) => {
  const { plan_key } = req.body;
  const planIds = {
    starter: process.env.PLAN_STARTER_ID,
    growth: process.env.PLAN_GROWTH_ID,
    agency: process.env.PLAN_AGENCY_ID
  };

  if (!planIds[plan_key]) return res.status(400).json({ error: 'Invalid plan.' });

  try {
    const razorpay = getRazorpay();
    if (!razorpay) return res.status(500).json({ error: 'Payment system not configured.' });

    const agency = db.prepare('SELECT * FROM agencies WHERE id = ?').get(req.session.agencyId);

    const subscription = await razorpay.subscriptions.create({
      plan_id: planIds[plan_key],
      customer_notify: 1,
      total_count: 12,
      notes: { agency_id: String(agency.id), plan_key }
    });

    res.json({ success: true, subscriptionId: subscription.id, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error('Subscription create error:', err);
    res.status(500).json({ error: 'Failed to create subscription: ' + (err.error?.description || err.message) });
  }
});

// POST /plans/webhook - Razorpay webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;
    const secret = process.env.RAZORPAY_KEY_SECRET;

    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (expectedSig !== signature) {
      console.warn('Razorpay webhook signature mismatch');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body.toString());
    const { event: eventType, payload } = event;

    if (eventType === 'subscription.activated') {
      const sub = payload.subscription.entity;
      const agencyId = sub.notes?.agency_id;
      const planKey = sub.notes?.plan_key;

      if (agencyId && planKey) {
        const credits = planCredits[planKey] || 1;
        db.prepare(`
          UPDATE agencies SET plan = ?, site_credits = ?, razorpay_subscription_id = ?
          WHERE id = ?
        `).run(planKey, credits, sub.id, Number(agencyId));

        // Award referral credit
        const referral = db.prepare('SELECT * FROM referrals WHERE referred_id = ? AND credit_awarded = 0').get(Number(agencyId));
        if (referral) {
          db.prepare('UPDATE agencies SET site_credits = site_credits + 1 WHERE id = ?').run(referral.referrer_id);
          db.prepare('UPDATE referrals SET converted = 1, credit_awarded = 1 WHERE id = ?').run(referral.id);
        }
      }
    }

    if (eventType === 'subscription.charged') {
      const sub = payload.subscription.entity;
      const agencyId = sub.notes?.agency_id;
      const planKey = sub.notes?.plan_key;
      if (agencyId && planKey) {
        const credits = planCredits[planKey] || 1;
        db.prepare('UPDATE agencies SET site_credits = ? WHERE id = ?').run(credits, Number(agencyId));
      }
    }

    if (eventType === 'subscription.cancelled' || eventType === 'subscription.halted') {
      const sub = payload.subscription.entity;
      const agencyId = sub.notes?.agency_id;
      if (agencyId) {
        db.prepare("UPDATE agencies SET plan = 'free', site_credits = 0 WHERE id = ?").run(Number(agencyId));
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// POST /plans/verify - verify payment on client side
router.post('/verify', requireAuth, (req, res) => {
  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature, plan_key } = req.body;
  try {
    const text = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expectedSig = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(text).digest('hex');
    if (expectedSig !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed.' });
    }
    // Update agency immediately (webhook may be delayed)
    const credits = planCredits[plan_key] || 1;
    db.prepare('UPDATE agencies SET plan = ?, site_credits = ?, razorpay_subscription_id = ? WHERE id = ?')
      .run(plan_key, credits, razorpay_subscription_id, req.session.agencyId);
    res.json({ success: true });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

module.exports = router;
