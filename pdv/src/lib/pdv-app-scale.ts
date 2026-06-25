export const defaultPdvAppScale = 100;
export const pdvAppScaleValues = [70, 80, 90, 100, 110, 120, 130] as const;

export type PdvAppScaleValue = (typeof pdvAppScaleValues)[number];

const pdvAppScaleStorageKey = "caixaagil:pdv:app-scale";

export const pdvAppScaleOptions = pdvAppScaleValues.map(value => ({
  value: String(value),
  label: `${value}%`
}));

export function normalizePdvAppScale(value: unknown): PdvAppScaleValue {
  const numericValue = typeof value === "number" ? value : Number(value);
  const exactValue = pdvAppScaleValues.find(scale => scale === numericValue);

  if (exactValue) {
    return exactValue;
  }

  return defaultPdvAppScale;
}

export function readStoredPdvAppScale(): PdvAppScaleValue {
  if (typeof window === "undefined") {
    return defaultPdvAppScale;
  }

  try {
    return normalizePdvAppScale(window.localStorage.getItem(pdvAppScaleStorageKey));
  } catch {
    return defaultPdvAppScale;
  }
}

export function saveStoredPdvAppScale(scale: PdvAppScaleValue) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(pdvAppScaleStorageKey, String(normalizePdvAppScale(scale)));
  } catch {
    // localStorage pode estar indisponivel em alguns contextos do Electron.
  }
}

function setCssScaleFallback(scaleFactor: number) {
  document.documentElement.style.setProperty("--pdv-app-scale", String(scaleFactor));
  document.documentElement.style.setProperty("--pdv-app-scale-inverse", String(1 / scaleFactor));
}

function notifyPdvAppScaleChanged(scale: PdvAppScaleValue) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(new CustomEvent("caixaagil:pdv-app-scale-changed", { detail: { scale } }));
}

function resetLegacyElectronZoom() {
  if (typeof window === "undefined") {
    return;
  }

  const legacyBridge = window.caixaAgilPdv as
    | { setAppZoomFactor?: (payload: { factor: number }) => Promise<unknown> }
    | undefined;

  void legacyBridge?.setAppZoomFactor?.({ factor: 1 }).catch(() => undefined);
}

export function applyPdvAppScale(scale: PdvAppScaleValue) {
  if (typeof document === "undefined") {
    return;
  }

  const normalizedScale = normalizePdvAppScale(scale);
  const scaleFactor = normalizedScale / 100;

  document.documentElement.style.removeProperty("zoom");
  document.documentElement.dataset.pdvAppScale = String(normalizedScale);
  resetLegacyElectronZoom();
  setCssScaleFallback(scaleFactor);
  notifyPdvAppScaleChanged(normalizedScale);
}

export function applyStoredPdvAppScale() {
  applyPdvAppScale(readStoredPdvAppScale());
}
