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
  cacheTtlMs?: number;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  token?: string | null;
};

type ApiGetCacheEntry = {
  expiresAt: number;
  promise?: Promise<unknown>;
  value?: unknown;
};

const defaultApiGetCacheTtlMs = 60_000;
const apiGetCache = new Map<string, ApiGetCacheEntry>();

export function getApiUrl(path: string) {
  return `${getApiBaseUrl()}${path}`;
}

function getApiCacheKey(path: string, token?: string | null) {
  return `${token ?? "public"}::${path}`;
}

function getCachePathFromKey(key: string) {
  const separatorIndex = key.indexOf("::");
  return separatorIndex >= 0 ? key.slice(separatorIndex + 2) : key;
}

export function clearApiCache(pathPrefix?: string) {
  if (!pathPrefix) {
    apiGetCache.clear();
    return;
  }

  for (const key of apiGetCache.keys()) {
    if (getCachePathFromKey(key).startsWith(pathPrefix)) {
      apiGetCache.delete(key);
    }
  }
}

async function requestFresh<TResponse>(path: string, options: ApiRequestOptions = {}) {
  const method = options.method ?? "GET";
  const headers: Record<string, string> = {};

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(getApiUrl(path), {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
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

  if (method !== "GET") {
    clearApiCache();
  }

  return result as TResponse;
}

export async function apiRequest<TResponse>(path: string, options: ApiRequestOptions = {}) {
  const method = options.method ?? "GET";
  const cacheTtlMs = options.cacheTtlMs ?? 0;

  if (method !== "GET" || cacheTtlMs <= 0) {
    return requestFresh<TResponse>(path, { ...options, method });
  }

  const now = Date.now();
  const key = getApiCacheKey(path, options.token);
  const cached = apiGetCache.get(key);

  if (cached && cached.expiresAt > now) {
    if (cached.promise) {
      return cached.promise as Promise<TResponse>;
    }

    return cached.value as TResponse;
  }

  const promise = requestFresh<TResponse>(path, { ...options, method }).then((value) => {
    apiGetCache.set(key, {
      expiresAt: Date.now() + cacheTtlMs,
      value
    });

    return value;
  });

  apiGetCache.set(key, {
    expiresAt: now + cacheTtlMs,
    promise
  });

  try {
    return await promise;
  } catch (error) {
    apiGetCache.delete(key);
    throw error;
  }
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

export async function apiDelete<TResponse = null>(path: string, options: Pick<ApiRequestOptions, "token"> = {}) {
  return apiRequest<TResponse>(path, {
    method: "DELETE",
    token: options.token
  });
}

export async function apiGet<TResponse>(path: string, options: Pick<ApiRequestOptions, "cacheTtlMs" | "token"> = {}) {
  return apiRequest<TResponse>(path, {
    cacheTtlMs: options.cacheTtlMs,
    method: "GET",
    token: options.token
  });
}

export function getCachedApiResponse<TResponse>(path: string, options: Pick<ApiRequestOptions, "token"> = {}) {
  const cached = apiGetCache.get(getApiCacheKey(path, options.token));

  if (!cached || cached.expiresAt <= Date.now() || cached.promise) {
    return null;
  }

  return cached.value as TResponse;
}

export function prefetchApiGet<TResponse>(
  path: string,
  options: Pick<ApiRequestOptions, "cacheTtlMs" | "token"> = {}
) {
  return apiGet<TResponse>(path, {
    cacheTtlMs: options.cacheTtlMs ?? defaultApiGetCacheTtlMs,
    token: options.token
  }).catch(() => null);
}

export async function apiPostForm<TResponse>(path: string, body: FormData, options: Pick<ApiRequestOptions, "token"> = {}) {
  const headers: Record<string, string> = {};

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(getApiUrl(path), {
    method: "POST",
    headers,
    body
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

  clearApiCache();

  return result as TResponse;
}
