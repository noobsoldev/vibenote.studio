const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

let Razorpay;
try { Razorpay = require('razorpay'); } catch(e) {}

function getRazorpay() {
  if (!Razorpay) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

const PLANS = {
  starter: { name: 'Starter', price: 5000,   display: '₹5,000',    sites: 1,  planId: process.env.PLAN_STARTER_ID },
  growth:  { name: 'Growth',  price: 40000,  display: '₹40,000',   sites: 10, planId: process.env.PLAN_GROWTH_ID  },
  agency:  { name: 'Agency',  price: 150000, display: '₹1,50,000', sites: 50, planId: process.env.PLAN_AGENCY_ID  }
};

const CURRENCY_RATES = { INR: 1, USD: 0.012, GBP: 0.0095, AED: 0.044, SGD: 0.016, EUR: 0.011 };

// GET /plans
router.get('/', requireAuth, async (req, res) => {
  const agency = req.agency;
  const currency = agency.currency || 'INR';
  const rate = CURRENCY_RATES[currency] || 1;

  const convertedPlans = {};
  for (const [key, plan] of Object.entries(PLANS)) {
    const converted = Math.round(plan.price * rate);
    const symbols = { INR: '₹', USD: '$', GBP: '£', AED: 'AED ', SGD: 'S$', EUR: '€' };
    const sym = symbols[currency] || '₹';
    convertedPlans[key] = {
      ...plan,
      display: `${sym}${converted.toLocaleString()}`,
      perSite: `${sym}${Math.round((plan.price / plan.sites) * rate).toLocaleString()}`
    };
  }

  res.render('plans', {
    agency,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    reason: req.query.reason || null,
    plans: convertedPlans,
    currency
  });
});

// POST /plans/subscribe
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { plan_key } = req.body;
    if (!PLANS[plan_key]) return res.status(400).json({ error: 'Invalid plan.' });
    const rz = getRazorpay();
    if (!rz) return res.status(500).json({ error: 'Payment not configured.' });

    const sub = await rz.subscriptions.create({
      plan_id: PLANS[plan_key].planId,
      customer_notify: 1, quantity: 1, total_count: 12
    });

    await db().from('agencies').update({ razorpay_subscription_id: sub.id }).eq('id', req.agency.id);
    res.json({
      success: true,
      subscriptionId: sub.id,
      keyId: process.env.RAZORPAY_KEY_ID || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /plans/verify
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_subscription_id,
      razorpay_signature,
      plan_key
    } = req.body;

    if (!PLANS[plan_key]) {
      return res.status(400).json({ error: 'Invalid plan.' });
    }

    const payload = `${razorpay_payment_id}|${razorpay_subscription_id}`;
    const expected = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(payload)
      .digest('hex');

    if (expected !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature.' });
    }

    await db().from('agencies').update({
      plan: plan_key,
      site_credits: PLANS[plan_key].sites,
      razorpay_subscription_id: razorpay_subscription_id
    }).eq('id', req.agency.id);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Payment verification failed.' });
  }
});

// POST /plans/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const sig = req.headers['x-razorpay-signature'];
    const body = req.body.toString();
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(body).digest('hex');
    if (sig !== expected) return res.status(400).send('Invalid signature');

    const event = JSON.parse(body);
    if (event.event === 'subscription.activated') {
      const subId = event.payload.subscription.entity.id;
      const planId = event.payload.subscription.entity.plan_id;
      let plan = 'free';
      for (const [k, v] of Object.entries(PLANS)) { if (v.planId === planId) plan = k; }
      const { data: agency } = await db().from('agencies').select('id').eq('razorpay_subscription_id', subId).single();
      if (agency) {
        await db().from('agencies').update({ plan, site_credits: PLANS[plan].sites }).eq('id', agency.id);
      }
    }
    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /plans/currency — update preferred currency
router.post('/currency', requireAuth, async (req, res) => {
  const { currency } = req.body;
  if (!CURRENCY_RATES[currency]) return res.status(400).json({ error: 'Invalid currency' });
  await db().from('agencies').update({ currency }).eq('id', req.agency.id);
  res.json({ success: true });
});

module.exports = router;
