function sanitizeText(value, maxLength = 5000) {
  return String(value || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function sanitizeEmail(value) {
  return sanitizeText(value, 320).toLowerCase();
}

function sanitizeUrl(value) {
  const sanitized = sanitizeText(value, 500);
  if (!sanitized) return '';
  if (/^https?:\/\//i.test(sanitized)) return sanitized;
  return `https://${sanitized}`;
}

function sanitizeList(value, maxItems = 20) {
  if (Array.isArray(value)) {
    return value.map(item => sanitizeText(item, 200)).filter(Boolean).slice(0, maxItems);
  }

  return String(value || '')
    .split(/\r?\n|,/)
    .map(item => sanitizeText(item, 200))
    .filter(Boolean)
    .slice(0, maxItems);
}

module.exports = {
  sanitizeEmail,
  sanitizeList,
  sanitizeText,
  sanitizeUrl
};
