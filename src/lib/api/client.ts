export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
export const getApiBaseUrl = () => API_BASE_URL;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function fetchApi<T>(
  path: string,
  options: {
    method?: string;
    body?: string | FormData;
    accessToken?: string;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = 'GET', body, accessToken, headers = {} } = options;

  // Retry on 429 (throttler) with exponential backoff + jitter so bulk flows
  // (workspace upload/merge fire many requests) don't fail mid-way.
  const MAX_RETRIES = 5;
  let res: Response | null = null;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body,
      cache: 'no-store',
    });
    if (res.status !== 429 || attempt >= MAX_RETRIES) break;
    const retryAfter = Number(res.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? retryAfter * 1000
      : Math.min(8000, 2 ** attempt * 500) + Math.floor(Math.random() * 300);
    await new Promise((r) => setTimeout(r, waitMs));
  }

  if (!res.ok) {
    let message = `Request failed with status ${res.status}`;
    try {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const errorData = await res.json();
        message = Array.isArray(errorData.message)
          ? errorData.message.join(', ')
          : errorData.message || message;
      } else {
        message = (await res.text()) || message;
      }
    } catch (e) {
      // Ignore parsing errors
    }
    if (res.status === 401) {
      // Don't kick the user out while offline — a 401 here is almost always a
      // stale cached response (SW api-cache) or the absent backend connection;
      // logging them out would also wipe their local-workspace access.
      if (typeof window !== 'undefined' && (typeof navigator === 'undefined' || navigator.onLine !== false)) {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as any;
  return res.json();
}
