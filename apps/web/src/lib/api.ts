import { useAuthStore } from '@/stores/auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      // CSRF proof for the API's Origin-checked guard (req 3).
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let code = 'INTERNAL';
    let message = res.statusText;
    let details: unknown;
    try {
      const body = (await res.json()) as { error?: { code: string; message: string; details?: unknown } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
      details = body.error?.details;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, code, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

/** Fetch an auth-gated file endpoint with the Bearer header. Plain <a href>
 * links 401 because requireAuth always demands the header, so file endpoints
 * (exports, document HTML) are fetched and handed over as Blobs instead. */
async function fetchAuthedFile(path: string): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      // CSRF proof for the API's Origin-checked guard.
      'X-Requested-With': 'XMLHttpRequest',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, 'DOWNLOAD_FAILED', message);
  }
  return res;
}

/** Content-Disposition filename (RFC 5987 first), else the path's last segment. */
function filenameOf(res: Response, path: string): string {
  const cd = res.headers.get('content-disposition') ?? '';
  const starName = /filename\*=UTF-8''([^;]+)/i.exec(cd)?.[1];
  if (starName) return decodeURIComponent(starName);
  const plainName = /filename="?([^";]+)"?/i.exec(cd)?.[1];
  if (plainName) return plainName;
  return path.split('/').filter(Boolean).pop() ?? 'download';
}

/** Download an auth-gated file (CSV/Excel/PDF/HTML/TXT) to the user's disk. */
export async function downloadFile(path: string): Promise<void> {
  const res = await fetchAuthedFile(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filenameOf(res, path);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Open an auth-gated file (print views / PDFs) in a new tab via a Blob URL. */
export async function openFileInTab(path: string): Promise<void> {
  const res = await fetchAuthedFile(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
  // Keep the Blob URL alive long enough for the new tab to load it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
