require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const cron = require('node-cron');
const { supabaseAdmin } = require('./lib/supabase');

const app = express();
const baseUrl = (process.env.BASE_URL || process.env.APP_URL || 'https://vibenote.studio').replace(/\/$/, '');

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax'
  }
}));

const authRouter = require('./routes/auth');
const dashRouter = require('./routes/dashboard');
const projectsRouter = require('./routes/projects');
const generateRouter = require('./routes/generate');
const briefsRouter = require('./routes/briefs');
const deployRouter = require('./routes/deploy');
const paymentsRouter = require('./routes/payments');
const adminRouter = require('./routes/admin');
const agencyRouter = require('./routes/agency');
const publicBriefRouter = require('./routes/public-brief');
const pagesRouter = require('./routes/pages');

app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('landing', {
    baseUrl,
    seo: {
      title: 'VibeNote – AI Website Generator for Agencies',
      description: 'VibeNote helps agencies generate, edit and deploy client websites instantly using AI.',
      ogDescription: 'Generate and deploy client websites instantly.',
      path: '/',
      canonical: baseUrl,
      ogUrl: baseUrl,
      schema: {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'VibeNote',
        url: baseUrl,
        logo: `${baseUrl}/logo.png`
      }
    }
  });
});

app.use('/', pagesRouter);
app.use('/', authRouter);
app.use('/brief', publicBriefRouter);
app.use('/dashboard', dashRouter);
app.use('/agency', agencyRouter);
app.use('/projects', projectsRouter);
app.use('/generate', generateRouter);
app.use('/briefs', briefsRouter);
app.use('/deploy', deployRouter);
app.use('/plans', paymentsRouter);
app.use('/admin', adminRouter);

app.get('/settings', (req, res) => {
  if (!req.session.userId) return res.redirect('/login?next=' + encodeURIComponent('/settings'));
  res.redirect('/dashboard#settings');
});

app.get('/preview/:id', async (req, res) => {
  try {
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('generated_html')
      .eq('id', req.params.id)
      .single();

    if (!project?.generated_html) return res.status(404).send('Not found');
    res.setHeader('Content-Type', 'text/html');
    res.send(project.generated_html);
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).send('Error');
  }
});

app.post('/settings', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { data: agency } = await supabaseAdmin
    .from('agencies')
    .select('id')
    .eq('auth_user_id', req.session.userId)
    .maybeSingle();

  if (!agency) {
    return res.status(404).json({ error: 'Agency not found.' });
  }

  const { sftp_host, sftp_user, sftp_pass, sftp_base_path, country, currency } = req.body;
  await supabaseAdmin.from('agencies').update({
    sftp_host,
    sftp_user,
    sftp_pass,
    sftp_base_path,
    country,
    currency
  }).eq('id', agency.id);

  res.json({ success: true });
});

cron.schedule('0 0 1 * *', async () => {
  console.log('[cron] Resetting monthly credits...');
  const planCredits = { free: 1, starter: 1, growth: 10, agency: 50 };
  for (const [plan, credits] of Object.entries(planCredits)) {
    await supabaseAdmin.from('agencies').update({ site_credits: credits }).eq('plan', plan).eq('status', 'active');
  }
  console.log('[cron] Credits reset done.');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', { message: err.message || 'Something went wrong.' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Vibenote running on port ${PORT}`));
