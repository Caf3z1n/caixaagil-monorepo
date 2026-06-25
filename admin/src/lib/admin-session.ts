export const ADMIN_AUTH_TOKEN_STORAGE_KEY = "caixa-agil:admin-auth-token";
export const ADMIN_EMAIL_STORAGE_KEY = "caixa-agil:admin-email";

export function getStoredAdminAuthToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ADMIN_AUTH_TOKEN_STORAGE_KEY);
}

export function storeAdminSession(token: string, email?: string | null) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ADMIN_AUTH_TOKEN_STORAGE_KEY, token);

  if (email) {
    window.localStorage.setItem(ADMIN_EMAIL_STORAGE_KEY, email);
  }
}

export function clearAdminSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ADMIN_AUTH_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(ADMIN_EMAIL_STORAGE_KEY);
}
