export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  headers.set('X-Requested-With', 'AulaPro');
  if (!(fetchOptions.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = timeoutMs ? new AbortController() : null;
  const timer =
    controller && timeoutMs
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;

  let response: Response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      headers,
      credentials: 'include',
      signal: controller ? controller.signal : fetchOptions.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado en responder. Intenta de nuevo.');
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'Ocurrió un error en la solicitud.');
    }
    return data as T;
  }

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}`);
  }
  return (await response.text()) as unknown as T;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDateCO(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(d);
}

export function formatShortDateCO(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
  }).format(d);
}
