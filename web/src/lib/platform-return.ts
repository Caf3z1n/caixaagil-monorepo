export const PLATFORM_RETURN_PARAM = "voltar";

const safeReturnPrefixes = ["/meu-sistema", "/conta", "/home"];
const localReturnBase = "https://caixaagil.local";

export function getSafePlatformReturnPath(value: string | null | undefined, fallbackHref = "/meu-sistema") {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallbackHref;
  }

  try {
    const url = new URL(value, localReturnBase);

    if (url.origin !== localReturnBase) {
      return fallbackHref;
    }

    const path = `${url.pathname}${url.search}${url.hash}`;

    return safeReturnPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
      ? path
      : fallbackHref;
  } catch {
    return fallbackHref;
  }
}

export function buildPlatformReturnHref(href: string, returnTo: string) {
  const url = new URL(href, localReturnBase);
  const safeReturnTo = getSafePlatformReturnPath(returnTo);

  url.searchParams.set(PLATFORM_RETURN_PARAM, safeReturnTo);

  return `${url.pathname}${url.search}${url.hash}`;
}
