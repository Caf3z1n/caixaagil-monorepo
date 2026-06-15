const fallbackApiUrl = "http://localhost:3333";

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
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json"
    },
    method: "POST"
  });
  const text = await response.text().catch(() => "");
  const result = parseJsonResponse<TResponse>(text);

  if (!response.ok) {
    throw new ApiError(result?.message ?? "Não foi possível concluir a operação.", response.status);
  }

  return result as TResponse;
}
