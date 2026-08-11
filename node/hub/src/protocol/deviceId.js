'use strict';

const crypto = require('crypto');

function slugPart(value, maxLen) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen || 40) || 'unknown';
}

function ipSlug(ip) {
  if (!ip || typeof ip !== 'string') return '0';
  return ip.replace(/\./g, '-');
}

function generateDeviceId(appId, platform, manufacturer, model, sourceIp) {
  const parts = [
    slugPart(platform, 16),
    slugPart(model, 40),
    ipSlug(sourceIp),
  ];
  const base = parts.join('-');
  const hash = crypto.createHash('sha256')
    .update(`${appId}:${platform}:${manufacturer || ''}:${model || ''}:${sourceIp || ''}`)
    .digest('hex')
    .slice(0, 8);
  const id = `${base}-${hash}`;
  return id.slice(0, 96);
}

module.exports = {
  generateDeviceId,
  slugPart,
};
