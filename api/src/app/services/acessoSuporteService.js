const crypto = require('crypto');

const CODIGO_ACESSO_SUPORTE_TTL_MS = 30 * 1000;
const SESSAO_ACESSO_SUPORTE_SEGUNDOS = 30 * 60;

function normalizeSupportCode(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
}

function generateSupportCode() {
  const compactCode = crypto.randomBytes(8).toString('hex').toUpperCase();

  return compactCode.match(/.{1,4}/g).join('-');
}

function hashSupportCode(value) {
  return crypto
    .createHash('sha256')
    .update(normalizeSupportCode(value))
    .digest('hex');
}

function isSupportCodeHashValid(value, expectedHash) {
  const receivedHash = Buffer.from(hashSupportCode(value), 'hex');
  const storedHash = Buffer.from(String(expectedHash || ''), 'hex');

  return (
    receivedHash.length === storedHash.length &&
    storedHash.length > 0 &&
    crypto.timingSafeEqual(receivedHash, storedHash)
  );
}

function buildSupportAccessUrl(appUrl, usuarioId, codigo) {
  const url = new URL('/acesso-suporte', appUrl);
  const fragment = new URLSearchParams({
    codigo,
    usuario: String(usuarioId),
  });

  url.hash = fragment.toString();
  return url.toString();
}

module.exports = {
  CODIGO_ACESSO_SUPORTE_TTL_MS,
  SESSAO_ACESSO_SUPORTE_SEGUNDOS,
  buildSupportAccessUrl,
  generateSupportCode,
  hashSupportCode,
  isSupportCodeHashValid,
  normalizeSupportCode,
};
