export const PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY = "caixa-agil:account-email";
export const PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY = "caixa-agil:account-permissions";
export const PLATFORM_ACCOUNT_TYPE_STORAGE_KEY = "caixa-agil:account-type";
export const PLATFORM_ACCOUNT_CACHE_STORAGE_KEY = "caixa-agil:account-cache";
export const PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY = "caixa-agil:access-validated-at";
export const PLATFORM_AUTH_TOKEN_STORAGE_KEY = "caixa-agil:auth-token";

export const DEFAULT_PLATFORM_ACCOUNT_EMAIL = "conta@empresa.com.br";

export function getStoredPlatformAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(PLATFORM_AUTH_TOKEN_STORAGE_KEY);
}

export function clearPlatformSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY);
  window.localStorage.removeItem(PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY);
  window.localStorage.removeItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY);
  window.localStorage.removeItem(PLATFORM_ACCOUNT_CACHE_STORAGE_KEY);
  window.localStorage.removeItem(PLATFORM_ACCESS_VALIDATED_AT_STORAGE_KEY);
  window.localStorage.removeItem(PLATFORM_AUTH_TOKEN_STORAGE_KEY);
}
