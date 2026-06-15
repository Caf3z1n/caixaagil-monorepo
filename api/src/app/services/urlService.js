function normalizeAppUrl(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const cleanedUrl = String(rawUrl).trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  const withProtocol = /^https?:\/\//i.test(cleanedUrl) ? cleanedUrl : `https://${cleanedUrl}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    return null;
  }
}

function isLocalUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  } catch {
    return true;
  }
}

function getAppUrl(req) {
  const explicitAppUrl = normalizeAppUrl(process.env.APP_URL || process.env.WEB_URL);

  if (explicitAppUrl) {
    return explicitAppUrl;
  }

  const candidates = [
    process.env.MERCADO_PAGO_SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    req?.headers?.origin,
  ];
  let fallbackUrl = null;

  for (const candidate of candidates) {
    const normalizedUrl = normalizeAppUrl(candidate);

    if (!normalizedUrl) {
      continue;
    }

    fallbackUrl ??= normalizedUrl;

    if (!isLocalUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  return fallbackUrl || 'http://localhost:3000';
}

function getPublicAppUrl(req) {
  const candidates = [
    process.env.MERCADO_PAGO_SITE_URL,
    process.env.PUBLIC_APP_URL,
    process.env.APP_URL,
    process.env.WEB_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    req?.headers?.origin,
  ];
  let fallbackUrl = null;

  for (const candidate of candidates) {
    const normalizedUrl = normalizeAppUrl(candidate);

    if (!normalizedUrl) {
      continue;
    }

    fallbackUrl ??= normalizedUrl;

    if (!isLocalUrl(normalizedUrl)) {
      return normalizedUrl;
    }
  }

  return fallbackUrl || 'http://localhost:3000';
}

function getAppAssetUrl(path, req) {
  const appUrl = getAppUrl(req);
  const url = new URL(path, appUrl);

  return url.toString();
}

function getPublicAssetUrl(path, req) {
  const appUrl = getPublicAppUrl(req);
  const url = new URL(path, appUrl);

  return url.toString();
}

module.exports = {
  getAppUrl,
  getAppAssetUrl,
  getPublicAppUrl,
  getPublicAssetUrl,
  isLocalUrl,
  normalizeAppUrl,
};
