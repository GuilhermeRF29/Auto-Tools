const DEVICE_TOKEN_STORAGE_KEY = 'autotools:deviceAccess:token';
const PENDING_REQUEST_STORAGE_KEY = 'autotools:deviceAccess:pendingRequest';
const FETCH_HOOK_FLAG = '__autotools_device_access_fetch_hook__';

type DeviceAccessErrorCode = 'DEVICE_TOKEN_INVALID' | 'DEVICE_IP_MISMATCH' | 'DEVICE_NOT_APPROVED';

export type PendingDeviceAccessRequest = {
  requestId: string;
  requestKey: string;
  createdAt?: string;
};

const INVALID_TOKEN_CODES: DeviceAccessErrorCode[] = [
  'DEVICE_TOKEN_INVALID',
  'DEVICE_IP_MISMATCH',
  'DEVICE_NOT_APPROVED',
];

export const getStoredDeviceToken = (): string => {
  try {
    return (localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
};

export const setStoredDeviceToken = (token: string) => {
  try {
    const normalized = `${token || ''}`.trim();
    if (!normalized) {
      localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
      return;
    }
    localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, normalized);
  } catch {
    // Ignore local storage failures.
  }
};

export const clearStoredDeviceToken = () => {
  try {
    localStorage.removeItem(DEVICE_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
};

export const getStoredPendingDeviceRequest = (): PendingDeviceAccessRequest | null => {
  try {
    const raw = localStorage.getItem(PENDING_REQUEST_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingDeviceAccessRequest;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.requestId || !parsed.requestKey) return null;
    return {
      requestId: `${parsed.requestId}`,
      requestKey: `${parsed.requestKey}`,
      createdAt: parsed.createdAt ? `${parsed.createdAt}` : undefined,
    };
  } catch {
    return null;
  }
};

export const setStoredPendingDeviceRequest = (value: PendingDeviceAccessRequest | null) => {
  try {
    if (!value || !value.requestId || !value.requestKey) {
      localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
      return;
    }

    localStorage.setItem(PENDING_REQUEST_STORAGE_KEY, JSON.stringify({
      requestId: `${value.requestId}`,
      requestKey: `${value.requestKey}`,
      createdAt: value.createdAt || undefined,
    }));
  } catch {
    // Ignore local storage failures.
  }
};

export const clearStoredPendingDeviceRequest = () => {
  try {
    localStorage.removeItem(PENDING_REQUEST_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
};

const resolveUrlPathname = (input: RequestInfo | URL): string => {
  try {
    if (typeof input === 'string') {
      if (input.startsWith('/')) return input;
      return new URL(input, window.location.origin).pathname;
    }

    if (input instanceof URL) {
      return input.pathname;
    }

    if (typeof Request !== 'undefined' && input instanceof Request) {
      return new URL(input.url, window.location.origin).pathname;
    }
  } catch {
    return '';
  }

  return '';
};

const isApiRequest = (input: RequestInfo | URL): boolean => {
  const pathname = resolveUrlPathname(input);
  return pathname.startsWith('/api/');
};

const shouldAttachDeviceToken = (input: RequestInfo | URL): boolean => {
  if (!isApiRequest(input)) return false;

  const pathname = resolveUrlPathname(input);
  if (pathname.startsWith('/api/device-access/request')) return false;
  if (pathname.startsWith('/api/device-access/public-state')) return false;
  return true;
};

const shouldClearTokenByResponse = async (response: Response): Promise<boolean> => {
  if (response.status !== 403) return false;

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return false;

  try {
    const payload = await response.clone().json();
    const code = `${payload?.code || ''}`.trim().toUpperCase();
    return INVALID_TOKEN_CODES.includes(code as DeviceAccessErrorCode);
  } catch {
    return false;
  }
};

export const installDeviceAccessFetchInterceptor = () => {
  const fetchFn = window.fetch as any;
  if (fetchFn?.[FETCH_HOOK_FLAG]) return;

  const originalFetch = window.fetch.bind(window);

  const hookedFetch: typeof window.fetch = async (input, init) => {
    let requestInit = init;

    if (shouldAttachDeviceToken(input)) {
      const token = getStoredDeviceToken();
      if (token) {
        const headers = new Headers(init?.headers || undefined);
        if (!headers.has('x-autotools-device-token')) {
          headers.set('x-autotools-device-token', token);
        }
        requestInit = { ...(init || {}), headers };
      }
    }

    const response = await originalFetch(input, requestInit);
    if (await shouldClearTokenByResponse(response)) {
      clearStoredDeviceToken();
    }
    return response;
  };

  (hookedFetch as any)[FETCH_HOOK_FLAG] = true;
  window.fetch = hookedFetch;
};
