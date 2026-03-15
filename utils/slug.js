function baseSlug(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function slugify(value, maxLength = 50) {
  const normalized = baseSlug(value).slice(0, maxLength).replace(/-+$/g, '');
  return normalized || 'agency';
}

function slugifyAgency(value) {
  return slugify(value, 50);
}

function slugifyProject(value) {
  return slugify(value, 50);
}

module.exports = {
  slugify,
  slugifyAgency,
  slugifyProject
};
