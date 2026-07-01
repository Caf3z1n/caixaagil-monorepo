const crypto = require('crypto');
const authConfig = require('../../config/auth');

function getSecretKey() {
  return crypto
    .createHash('sha256')
    .update(String(process.env.FISCAL_CONFIG_SECRET || authConfig.secret || 'dev-secret'))
    .digest();
}

function normalizeSecret(value, maxLength = 2048) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

function encryptSecret(value) {
  const plainText = normalizeSecret(value);

  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decryptSecret(value) {
  if (typeof value !== 'string' || !value.startsWith('v1:')) {
    return '';
  }

  const [, ivRaw, tagRaw, encryptedRaw] = value.split(':');

  if (!ivRaw || !tagRaw || !encryptedRaw) {
    return '';
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), Buffer.from(ivRaw, 'base64'));

    decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));

    return Buffer.concat([
      decipher.update(Buffer.from(encryptedRaw, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return '';
  }
}

module.exports = {
  decryptSecret,
  encryptSecret,
};
