import { getAccessToken, setAccessToken } from './authMemory';

const FETCH_AUTH_HOOK_FLAG = '__autotools_auth_fetch_hook__';

export const installAuthFetchInterceptor = () => {
  const fetchFn = window.fetch as any;
  if (fetchFn?.[FETCH_AUTH_HOOK_FLAG]) return;

  const originalFetch = window.fetch.bind(window);

  const hookedFetch: typeof window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : '');
    const isApi = url.includes('/api/') && !url.includes('/api/auth/login') && !url.includes('/api/auth/refresh') && !url.includes('/api/system/update/check');

    const requestInit = init || {};
    if (isApi) {
      const token = getAccessToken();
      if (token) {
        requestInit.headers = {
          ...requestInit.headers,
          'Authorization': `Bearer ${token}`
        };
      }
      // Sempre garantir envio de credentials para /api/ para que o HttpOnly Cookie do refresh token passe
      requestInit.credentials = 'include';
    }

    let response = await originalFetch(input, requestInit);

    // Se receber 401 e for uma requisição de API, tentar renovar o token
    if (isApi && response.status === 401) {
      try {
        const refreshResp = await originalFetch('/api/auth/refresh', { 
            method: 'POST',
            credentials: 'include' // Envia o cookie de refresh
        });
        
        if (refreshResp.ok) {
          const data = await refreshResp.json();
          if (data.success && data.token) {
            setAccessToken(data.token);
            // Refazer a requisição original com o novo token
            requestInit.headers = {
              ...requestInit.headers,
              'Authorization': `Bearer ${data.token}`
            };
            response = await originalFetch(input, requestInit);
          } else {
             window.dispatchEvent(new Event('auth-expired'));
          }
        } else {
            window.dispatchEvent(new Event('auth-expired'));
        }
      } catch (err) {
         window.dispatchEvent(new Event('auth-expired'));
      }
    }

    return response;
  };

  (hookedFetch as any)[FETCH_AUTH_HOOK_FLAG] = true;
  window.fetch = hookedFetch;
};
