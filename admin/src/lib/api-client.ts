const fallbackApiUrl = "http://localhost:3333";

export class ApiError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export function getApiBaseUrl() {
  return (process.env.NEXT_PUBLIC_API_URL ?? fallbackApiUrl).replace(/\/+$/, "");
}

export function getApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

function parseJsonResponse<TResponse>(text: string) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as (TResponse & { code?: string; message?: string }) | null;
  } catch {
    return null;
  }
}

type ApiRequestOptions = {
  body?: unknown;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string | null;
};

export async function apiRequest<TResponse>(path: string, options: ApiRequestOptions = {}) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(getApiUrl(path), {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method
  });
  const text = await response.text().catch(() => "");
  const result = parseJsonResponse<TResponse>(text);

  if (!response.ok) {
    throw new ApiError(
      result?.message ?? "Não foi possível concluir a operação.",
      response.status,
      result?.code
    );
  }

  return result as TResponse;
}

export async function apiGet<TResponse>(path: string, options: Pick<ApiRequestOptions, "token"> = {}) {
  return apiRequest<TResponse>(path, {
    method: "GET",
    token: options.token
  });
}

export async function apiPost<TResponse>(path: string, body: unknown, options: Pick<ApiRequestOptions, "token"> = {}) {
  return apiRequest<TResponse>(path, {
    body,
    method: "POST",
    token: options.token
  });
}

export async function apiPut<TResponse>(path: string, body: unknown, options: Pick<ApiRequestOptions, "token"> = {}) {
  return apiRequest<TResponse>(path, {
    body,
    method: "PUT",
    token: options.token
  });
}
