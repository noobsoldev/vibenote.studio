# Vibenote.studio

> AI-powered website builder for web agencies. Fill a client brief → Claude AI builds a complete website → preview, edit via chat, deploy in one click.

---

## What It Does

Vibenote is a SaaS platform you sell access to. Web agencies sign up, fill an 8-step client onboarding form, and Claude AI generates a complete production-ready HTML/CSS/JS website in ~60 seconds. The agency previews it, makes changes by chatting in plain English, and deploys it to the client's server via SFTP — or downloads it as a clean HTML file.

**Key capabilities:**
- 8-step guided client onboarding form with auto-save
- AI website generation via Claude (`claude-sonnet-4-5`)
- Live iframe preview with chat-based editing
- SFTP deployment to any hosting server
- Razorpay subscription billing (3 tiers)
- Referral system with credit rewards
- Admin panel for managing all agencies and projects
- Monthly credit reset via cron job

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express |
| Templates | EJS |
| Database | SQLite (better-sqlite3) |
| AI | Anthropic Claude API |
| Payments | Razorpay Subscriptions |
| Auth | express-session + bcrypt |
| File Uploads | Multer |
| Deployment | ssh2-sftp-client |
| Scheduling | node-cron |
| Font | Poppins (Google Fonts) |

---

## File Structure

```
vibenote/
├── server.js                  # App entry point, routes, cron, bootstrap
├── package.json
├── .env.example               # Environment variable template
├── .gitignore
├── README.md
├── LICENSE
│
├── db/
│   └── database.js            # SQLite schema + connection
│
├── middleware/
│   └── auth.js                # Session guards (requireAuth, requireAdmin)
│
├── routes/
│   ├── auth.js                # Signup, login, logout
│   ├── dashboard.js           # Agency dashboard + SFTP profile
│   ├── projects.js            # Project CRUD + Multer asset uploads
│   ├── generate.js            # Claude generation + chat editor API
│   ├── deploy.js              # SFTP deploy + HTML download
│   ├── payments.js            # Razorpay subscriptions + webhook
│   └── admin.js               # Admin panel
│
├── views/
│   ├── login.ejs
│   ├── signup.ejs
│   ├── dashboard.ejs          # Project cards, referral, SFTP settings
│   ├── onboarding.ejs         # 8-step client brief wizard
│   ├── editor.ejs             # Split-panel preview + chat sidebar
│   ├── plans.ejs              # Subscription plan selection
│   ├── admin.ejs              # Admin dashboard
│   └── error.ejs
│
├── public/
│   ├── css/style.css          # Global dark theme
│   └── js/main.js             # Client-side JS
│
├── uploads/                   # Temp upload dir (auto-cleared)
└── data/                      # SQLite databases (auto-created)
```

---

## Database Schema

```sql
agencies       — id, name, email, password_hash, plan, site_credits,
                 referral_code, referred_by, razorpay_subscription_id,
                 sftp_host, sftp_user, sftp_pass, sftp_base_path,
                 status (active/suspended), created_at

projects       — id, agency_id, client_name, industry, form_data (JSON),
                 generated_html, status (draft/generated/live),
                 deployment_url, created_at, updated_at

chat_history   — id, project_id, role (user/assistant), message, created_at

referrals      — id, referrer_id, referred_id, converted, credit_awarded, created_at
```

---

## Quick Start

### 1. Install

```bash
unzip vibenote-studio.zip
cd vibenote
npm install
```

### 2. Configure

```bash
cp .env.example .env
nano .env
```

Minimum required to run:
```env
SESSION_SECRET=any_long_random_string
ANTHROPIC_API_KEY=sk-ant-...
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD=yourpassword
BASE_URL=http://localhost:3000
```

### 3. Run

```bash
npm start        # production
npm run dev      # development with auto-restart
```

Visit `http://localhost:3000`

On first run a seed account is created. Use referral code **`VIBENOTE2024`** to sign up.

---

## Deployment — Hostinger Business Plan

### Step 1 — Upload

In hPanel → File Manager, upload and extract `vibenote-studio.zip` to `public_html/vibenote/`

### Step 2 — SSH and install

```bash
cd ~/public_html/vibenote
npm install
cp .env.example .env
nano .env
```

### Step 3 — Node.js app in hPanel

Go to **hPanel → Advanced → Node.js → Create Application:**

| Field | Value |
|-------|-------|
| Node.js version | 20.x |
| Application root | `public_html/vibenote` |
| Application URL | your domain |
| Startup file | `server.js` |

### Step 4 — SSL

hPanel → SSL → Install Let's Encrypt → your domain → Install.

---

## Deployment — VPS (Recommended for Production)

### DNS Setup

```
A record:  yourdomain.com     → your.vps.ip
A record:  *.yourdomain.com   → your.vps.ip
```

### Server Setup

```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Nginx + SSL
apt install -y nginx certbot python3-certbot-nginx

# Upload project
scp -r vibenote/ root@your.vps.ip:/var/www/vibenote
cd /var/www/vibenote
npm install
cp .env.example .env && nano .env
```

### Nginx Config

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 50M;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/vibenote /etc/nginx/sites-enabled/
nginx -t && systemctl restart nginx
certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

### PM2 Process Manager

```bash
npm install -g pm2
pm2 start server.js --name vibenote
pm2 startup && pm2 save
```

---

## Razorpay Setup

1. Create account at [razorpay.com](https://razorpay.com)
2. Go to **Subscriptions → Plans**, create 3 plans:
   - Starter: ₹5,000/month
   - Growth: ₹40,000/month
   - Agency: ₹2,50,000/month
3. Copy Plan IDs to `.env`
4. Go to **Settings → Webhooks**, add:
   - URL: `https://yourdomain.com/plans/webhook`
   - Events: `subscription.activated`, `subscription.charged`, `subscription.cancelled`

---

## Anthropic API

1. Sign up at [console.anthropic.com](https://console.anthropic.com)
2. Create API Key → copy to `.env`

**Cost per site generation:** ~$0.10–0.15 USD (~₹12–15)
**Cost per chat edit:** ~$0.05–0.10 USD (~₹5–8)

---

## Plans & Pricing

| Plan | Price | Credits/Month |
|------|-------|---------------|
| Free | — | 1 (on signup) |
| Starter | ₹5,000/mo | 1 |
| Growth | ₹40,000/mo | 10 |
| Agency | ₹2,50,000/mo | 50 |

Credits reset on the 1st of every month automatically.

---

## Admin Panel

Access at `/admin` — login with `ADMIN_EMAIL` + `ADMIN_PASSWORD`

- View, suspend, delete agencies
- Add credits manually
- View all projects and referral chains
- Platform-wide stats

---

## PM2 Commands

```bash
pm2 logs vibenote       # live logs
pm2 status              # check status
pm2 restart vibenote    # after code/env changes
pm2 stop vibenote       # stop app
```

---

## Built By

**Noob{Dev} Technologies** — [noobdev.tech](https://noobdev.tech)

Powered by [Anthropic Claude](https://anthropic.com) · [Razorpay](https://razorpay.com) · [Node.js](https://nodejs.org)
