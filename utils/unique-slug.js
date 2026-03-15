const { db } = require('../db/database');

function buildBaseSlug(name) {
  return String(name || 'agency')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'agency';
}

async function generateUniqueSlug(name, excludeId = null) {
  const baseSlug = buildBaseSlug(name);

  let query = db()
    .from('agencies')
    .select('id, slug')
    .ilike('slug', `${baseSlug}%`);

  if (excludeId) {
    query = query.neq('id', excludeId);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Unique slug lookup failed:', error);
    return baseSlug;
  }

  const usedSlugs = new Set((data || []).map(row => row.slug).filter(Boolean));
  if (!usedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let counter = 2;
  while (usedSlugs.has(`${baseSlug}-${counter}`)) {
    counter += 1;
  }

  return `${baseSlug}-${counter}`;
}

async function generateUniqueAgencySlug(name, excludeId = null) {
  return generateUniqueSlug(name, excludeId);
}

module.exports = {
  generateUniqueSlug,
  generateUniqueAgencySlug
};
