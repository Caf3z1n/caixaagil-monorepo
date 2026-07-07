const fallbackApiUrl = process.env.NODE_ENV === "production" ? "https://api.caixaagil.tech" : "http://localhost:3333";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl).replace(/\/+$/, "");
}

function isLocalApiUrl(url: string) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(url);
}

function parseJsonResponse<TResponse>(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as (TResponse & { message?: string }) | null;
  } catch {
    return null;
  }
}

export async function apiPost<TResponse>(path: string, body: unknown) {
  const apiBaseUrl = getApiBaseUrl();
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  } catch {
    throw new ApiError(
      isLocalApiUrl(apiBaseUrl)
        ? "API local indisponível. Inicie o backend em localhost:3333 e sincronize novamente."
        : "Não foi possível conectar à API. Verifique a internet e tente novamente.",
      0
    );
  }

  const text = await response.text().catch(() => "");
  const result = parseJsonResponse<TResponse>(text);

  if (!response.ok) {
    throw new ApiError(result?.message ?? "Não foi possível concluir a operação.", response.status);
  }

  return result as TResponse;
}
