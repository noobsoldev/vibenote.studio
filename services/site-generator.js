const Anthropic = require('@anthropic-ai/sdk');
const { db } = require('../db/database');
const { decorateGeneratedHtml } = require('./seo-generator');

const INDUSTRY_INTELLIGENCE = {
  restaurant: 'Highlight menu presentation, food imagery, reservations, location trust, and a strong dine or enquire call to action.',
  gym: 'Highlight programs, trainers, memberships, schedules, results, and strong join-now or book-trial calls to action.',
  salon: 'Highlight services, pricing, gallery imagery, style credibility, and booking-focused calls to action.',
  'real estate': 'Highlight listings or property categories, location credibility, trust, lead capture, and strong enquiry forms.',
  lawyer: 'Highlight trust, credentials, experience, practice areas, and consultation-focused calls to action.',
  clinic: 'Highlight services, doctors or medical expertise, patient trust, and appointment-booking calls to action.'
};

const APPROVED_SECTION_LIBRARY = [
  'hero',
  'about',
  'services',
  'gallery',
  'testimonials',
  'team',
  'pricing',
  'faq',
  'contact',
  'cta'
];

function arr(value) {
  return Array.isArray(value) ? value.join(', ') : (value || '');
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  if (!value) return [];
  return String(value)
    .split(/\r?\n|,/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeSections(value) {
  const raw = normalizeList(value);
  const normalized = raw
    .map(section => section.toLowerCase().replace(/[^a-z\s]/g, '').trim())
    .map(section => section === 'contact form' ? 'contact' : section)
    .map(section => section === 'call to action' ? 'cta' : section)
    .filter(section => APPROVED_SECTION_LIBRARY.includes(section));

  return normalized.length ? normalized : ['hero', 'about', 'services', 'contact'];
}

function getIndustryInstruction(industry = '') {
  const normalized = String(industry || '').toLowerCase();
  const match = Object.entries(INDUSTRY_INTELLIGENCE).find(([key]) => normalized.includes(key));
  return match ? match[1] : 'Structure the page around what builds trust, clarity, and enquiries for this type of business.';
}

function getAssetInstruction(fd = {}) {
  const hasLogo = Boolean(fd.logo_base64);
  const hasImages = Array.isArray(fd.asset_images) && fd.asset_images.length > 0;

  if (hasLogo || hasImages) {
    return 'Use the provided logo and images across hero, gallery, and about sections where appropriate.';
  }

  return 'Create placeholder sections that can easily be replaced later if final images are not available yet.';
}

function buildGenerationPrompt(formData = {}) {
  const sections = normalizeSections(formData.sections);
  const services = normalizeList(formData.services);
  const usps = normalizeList(formData.usps);
  const keywords = normalizeList(formData.seo_keywords);
  const primaryCta = formData.primary_cta || 'Contact Us';

  return `ROLE
You are a senior web designer and conversion-focused copywriter working at a professional web agency.

Generate a modern, responsive static website using clean HTML, CSS and minimal JavaScript.

The site must feel like a custom agency-built website, not a generic AI template.

INDUSTRY
- Business industry: ${formData.industry || 'General business'}
- Industry-specific guidance: ${getIndustryInstruction(formData.industry)}

BUSINESS CONTEXT
- Business name: ${formData.client_name || 'Business'}
- Tagline: ${formData.tagline || 'Not provided'}
- Description: ${formData.description || 'Not provided'}
- Location: ${formData.location || 'Not provided'}
- Target audience: ${formData.target_audience || 'Not provided'}
- Unique selling points: ${usps.length ? usps.join(', ') : 'Not provided'}
- Services: ${services.length ? services.join(', ') : 'Not provided'}
- Service descriptions: ${formData.service_descriptions || 'Not provided'}
- Pricing context: ${formData.price_range || 'Not provided'}

SECTIONS
First internally plan the page structure.

Decide:
- section order
- section purpose
- where CTAs should appear
- what visual hierarchy the page should use

Then generate the final HTML.

Prioritize the following sections selected by the client: ${sections.join(', ')}

Only generate sections from this approved section library: ${APPROVED_SECTION_LIBRARY.join(', ')}
Do not invent random sections outside this library.

BRAND STYLE
The design must follow the provided brand tone, color palette and design style.
- Brand tone: ${formData.tone || 'Professional'}
- Primary color: ${formData.color_primary || '#1a1a2e'}
- Accent color: ${formData.color_accent || '#c9a84c'}
- Background color: ${formData.color_bg || '#0a0a0a'}
- Text color: ${formData.color_text || '#e8e8e8'}
- Font preference: ${formData.font_preference || 'Poppins'}
- Design style: ${formData.design_style || 'Modern Minimal'}

ASSETS
- ${getAssetInstruction(formData)}
- Asset notes: ${formData.asset_notes || 'Not provided'}

CONVERSION GOAL
- Primary CTA: ${primaryCta}
- Design the layout to maximize conversions and place clear call-to-action buttons throughout the page.
- Generate three hero headline options internally and use the strongest one in the final output.

SEO
Generate:
- an optimized <title>
- a meta description
- semantic HTML structure
- schema markup for the business type
- proper heading hierarchy (H1 -> H2 -> H3)

SEO inputs:
- SEO title: ${formData.seo_title || 'Not provided'}
- SEO description: ${formData.seo_description || 'Not provided'}
- Keywords: ${keywords.length ? keywords.join(', ') : 'Not provided'}
- Language: ${formData.language || 'en'}
- Google Analytics ID: ${formData.ga_id || 'Not provided'}
- Schema type: ${formData.schema_type || 'LocalBusiness'}

Additional contact and trust data:
- Phone: ${formData.phone || 'Not provided'}
- WhatsApp: ${formData.whatsapp || 'Not provided'}
- Email: ${formData.email || 'Not provided'}
- Address: ${formData.address || 'Not provided'}
- Maps link: ${formData.maps_link || 'Not provided'}
- Business hours: ${formData.business_hours || 'Not provided'}
- Domain: ${formData.domain || 'Not provided'}
- Instagram: ${formData.instagram || 'Not provided'}
- Facebook: ${formData.facebook || 'Not provided'}
- YouTube: ${formData.youtube || 'Not provided'}
- LinkedIn: ${formData.linkedin || 'Not provided'}
- Twitter/X: ${formData.twitter || 'Not provided'}
- Pinterest: ${formData.pinterest || 'Not provided'}
- Testimonials: ${formData.testimonials || 'Not provided'}
- FAQ: ${formData.faq || 'Not provided'}
- Additional notes: ${formData.ai_notes || 'Not provided'}

OUTPUT RULES
- Return a complete production-ready static website
- The current generation pipeline accepts a single response, so return the full contents of index.html
- Organize CSS clearly inside the HTML so it is easy to extract into style.css later if needed
- Use semantic HTML
- Use a mobile responsive layout
- Use minimal JavaScript only when needed
- Use CSS variables for colors
- Use accessible markup
- Keep the code clean and readable
- Avoid generic template-looking layouts
- No heavy frameworks
- Return ONLY the final HTML document with no explanation`;
}

function buildPrompt(formData = {}) {
  return buildGenerationPrompt(formData);
}

function getAnthropicClient() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

async function generateHtmlFromBrief(formData) {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [{ role: 'user', content: buildGenerationPrompt(formData) }]
  });

  const rawHtml = message.content?.[0]?.text || '';
  return decorateGeneratedHtml(rawHtml, formData || {});
}

async function generateProjectWebsite({ agency, project }) {
  if (!agency || agency.site_credits <= 0) {
    throw new Error('No site credits remaining. Please upgrade your plan.');
  }

  const html = await generateHtmlFromBrief(project.form_data || {});
  if (!html) {
    throw new Error('The AI did not return any website output.');
  }

  await db().from('agencies').update({
    site_credits: agency.site_credits - 1
  }).eq('id', agency.id);

  await db().from('projects').update({
    generated_html: html,
    status: 'generated'
  }).eq('id', project.id);

  await db().from('chat_history').insert({
    project_id: project.id,
    role: 'assistant',
    message: 'Client website generated from the structured brief.'
  });

  return html;
}

module.exports = {
  buildGenerationPrompt,
  buildPrompt,
  generateHtmlFromBrief,
  generateProjectWebsite
};


