const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

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

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body,
    cache: 'no-store',
  });

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
    throw new ApiError(message, res.status);
  }

  if (res.status === 204) return undefined as any;
  return res.json();
}
