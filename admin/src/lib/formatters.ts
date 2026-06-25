export function formatDate(value?: string | null, options: Intl.DateTimeFormatOptions = {}) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...options
  }).format(date);
}

export function formatCurrency(cents?: number | null, currency = "BRL") {
  if (typeof cents !== "number") {
    return "Valor não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    currency,
    style: "currency"
  }).format(cents / 100);
}

export function formatLimit(value?: number | null) {
  return typeof value === "number" ? String(value) : "Sem limite";
}
