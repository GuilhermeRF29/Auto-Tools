import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import type { User } from '../types';

export interface WindowsHelloHint {
  userId: number;
  usuario: string;
  nome?: string;
  biometricToken: string;
  tokenExpiresAt?: string;
}

const WINDOWS_HELLO_HINT_KEY = 'autotools:windows-hello:hint';

const parseError = async (response: Response): Promise<string> => {
  try {
    const data = await response.json();
    return data?.error || data?.details || `Erro HTTP ${response.status}`;
  } catch {
    return `Erro HTTP ${response.status}`;
  }
};

const postJson = async (url: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return response.json();
};

export const isWindowsHelloAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
};

export const getWindowsHelloHint = (): WindowsHelloHint | null => {
  try {
    const raw = localStorage.getItem(WINDOWS_HELLO_HINT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WindowsHelloHint>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.userId !== 'number' || !parsed.usuario || !parsed.biometricToken) return null;
    return {
      userId: parsed.userId,
      usuario: parsed.usuario,
      nome: parsed.nome,
      biometricToken: parsed.biometricToken,
      tokenExpiresAt: parsed.tokenExpiresAt,
    };
  } catch {
    return null;
  }
};

export const saveWindowsHelloHint = (hint: WindowsHelloHint): void => {
  localStorage.setItem(WINDOWS_HELLO_HINT_KEY, JSON.stringify(hint));
};

export const clearWindowsHelloHint = (): void => {
  localStorage.removeItem(WINDOWS_HELLO_HINT_KEY);
};

export const registerWindowsHello = async (
  user: Pick<User, 'id' | 'nome' | 'usuario'>,
  password: string
): Promise<WindowsHelloHint> => {
  const optionsPayload = await postJson('/api/webauthn/register/options', {
    usuario: user.usuario,
    senha: password,
  });

  if (!optionsPayload?.success || !optionsPayload?.options || !optionsPayload?.transactionId) {
    throw new Error(optionsPayload?.error || 'Falha ao iniciar registro do Windows Hello.');
  }

  const registrationResponse = await startRegistration({
    optionsJSON: optionsPayload.options,
  });

  const verifyPayload = await postJson('/api/webauthn/register/verify', {
    transactionId: optionsPayload.transactionId,
    registrationResponse,
  });

  if (!verifyPayload?.success || !verifyPayload?.biometricToken) {
    throw new Error(verifyPayload?.error || 'Falha ao validar registro do Windows Hello.');
  }

  const hint: WindowsHelloHint = {
    userId: Number(user.id),
    usuario: user.usuario || '',
    nome: user.nome,
    biometricToken: verifyPayload.biometricToken,
    tokenExpiresAt: verifyPayload.tokenExpiresAt,
  };
  saveWindowsHelloHint(hint);
  return hint;
};

export const authenticateWithWindowsHello = async (biometricToken: string): Promise<User> => {
  const optionsPayload = await postJson('/api/webauthn/auth/options', { biometricToken });
  if (!optionsPayload?.success || !optionsPayload?.options || !optionsPayload?.transactionId) {
    throw new Error(optionsPayload?.error || 'Falha ao iniciar autenticação biométrica.');
  }

  const authenticationResponse = await startAuthentication({
    optionsJSON: optionsPayload.options,
  });

  const verifyPayload = await postJson('/api/webauthn/auth/verify', {
    transactionId: optionsPayload.transactionId,
    biometricToken,
    authenticationResponse,
  });

  if (!verifyPayload?.success || !verifyPayload?.user) {
    throw new Error(verifyPayload?.error || 'Falha ao validar autenticação biométrica.');
  }

  return verifyPayload.user as User;
};

export const disableWindowsHello = async (
  user: Pick<User, 'usuario'>,
  password: string
): Promise<void> => {
  const payload = await postJson('/api/webauthn/disable', {
    usuario: user.usuario,
    senha: password,
  });
  if (!payload?.success) {
    throw new Error(payload?.error || 'Falha ao desativar Windows Hello.');
  }
  clearWindowsHelloHint();
};

export const getWindowsHelloServerState = async (userId: number): Promise<boolean> => {
  const response = await fetch(`/api/webauthn/state/${userId}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const payload = await response.json();
  return Boolean(payload?.success && payload?.enabled);
};
