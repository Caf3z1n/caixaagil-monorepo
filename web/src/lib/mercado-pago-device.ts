const MERCADO_PAGO_SECURITY_SCRIPT_ID = "mercado-pago-security-js";
const MERCADO_PAGO_SECURITY_SCRIPT_SRC = "https://www.mercadopago.com/v2/security.js";
const DEFAULT_DEVICE_TIMEOUT_MS = 2500;
const DEVICE_CHECK_INTERVAL_MS = 100;

type MercadoPagoWindow = Window &
  typeof globalThis & {
    MP_DEVICE_SESSION_ID?: string;
  };

function getCurrentDeviceSessionId() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = (window as MercadoPagoWindow).MP_DEVICE_SESSION_ID;

  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ensureMercadoPagoSecurityScript() {
  if (typeof document === "undefined") {
    return;
  }

  if (document.getElementById(MERCADO_PAGO_SECURITY_SCRIPT_ID)) {
    return;
  }

  const script = document.createElement("script");
  script.id = MERCADO_PAGO_SECURITY_SCRIPT_ID;
  script.src = MERCADO_PAGO_SECURITY_SCRIPT_SRC;
  script.async = true;
  script.setAttribute("view", "checkout");
  document.head.appendChild(script);
}

export async function getMercadoPagoDeviceSessionId(timeoutMs = DEFAULT_DEVICE_TIMEOUT_MS) {
  const currentDeviceSessionId = getCurrentDeviceSessionId();

  if (currentDeviceSessionId) {
    return currentDeviceSessionId;
  }

  if (typeof window === "undefined") {
    return null;
  }

  ensureMercadoPagoSecurityScript();

  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise(resolve => window.setTimeout(resolve, DEVICE_CHECK_INTERVAL_MS));

    const deviceSessionId = getCurrentDeviceSessionId();

    if (deviceSessionId) {
      return deviceSessionId;
    }
  }

  return getCurrentDeviceSessionId();
}
