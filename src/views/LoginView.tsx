import React, { useCallback, useEffect, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import { CheckCircle, Fingerprint, Loader2, RefreshCw, ShieldAlert, ShieldCheck, Smartphone } from 'lucide-react';
import logoApp from '../assets/logo_app.png';

import { useAuth } from '../context/AuthContext';
import BackgroundAnimation from '../components/BackgroundAnimation';
import Button from '../components/Button';
import { cn } from '../utils/cn';
import { useDialog } from '../context/DialogContext';
import {
  authenticateWithWindowsHello,
  clearWindowsHelloHint,
  getWindowsHelloHint,
  isWindowsHelloAvailable,
} from '../utils/windowsHello';
import {
  clearStoredPendingDeviceRequest,
  getStoredPendingDeviceRequest,
  setStoredDeviceToken,
  setStoredPendingDeviceRequest,
  type PendingDeviceAccessRequest,
} from '../utils/deviceAccess';

interface LoginViewProps {
  serverStatus: 'checking' | 'online' | 'offline';
  serverInfo: { version?: string; dbStatus?: string; dbMessage?: string } | null;
  animationsEnabled: boolean;
}

type DeviceSessionReason = 'LOCAL_DESKTOP' | 'APPROVAL_NOT_REQUIRED' | 'TOKEN_VALID' | 'REMOTE_DISABLED' | 'TOKEN_REQUIRED' | 'IP_MISMATCH' | 'UNKNOWN';

const createDeviceFingerprint = () => {
  const payload = [
    navigator.userAgent || '',
    navigator.platform || '',
    navigator.language || '',
    `${window.screen?.width || 0}x${window.screen?.height || 0}`,
    Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  ].join('|');

  let hash = 0;
  for (let i = 0; i < payload.length; i += 1) {
    hash = ((hash << 5) - hash) + payload.charCodeAt(i);
    hash |= 0;
  }

  return `fp-${Math.abs(hash)}`;
};

export default function LoginView({ serverStatus, serverInfo, animationsEnabled }: LoginViewProps) {
  const { setUser, isLoggingIn } = useAuth(); // using global auth context
  const { showAlert } = useDialog();
  const [internalIsLoggingIn, setInternalIsLoggingIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authData, setAuthData] = useState({ user: '', pass: '', name: '' });
  const [isWindowsHelloLoading, setIsWindowsHelloLoading] = useState(false);
  const [windowsHelloAvailable, setWindowsHelloAvailable] = useState(false);
  const [deviceAccessState, setDeviceAccessState] = useState<'checking' | 'approved' | 'blocked' | 'pending' | 'rejected'>('checking');
  const [deviceAccessReason, setDeviceAccessReason] = useState<DeviceSessionReason>('UNKNOWN');
  const [deviceAccessMessage, setDeviceAccessMessage] = useState('');
  const [pendingRequest, setPendingRequest] = useState<PendingDeviceAccessRequest | null>(() => getStoredPendingDeviceRequest());
  const [isRequestingDeviceAccess, setIsRequestingDeviceAccess] = useState(false);

  const loadingState = isLoggingIn || internalIsLoggingIn || isWindowsHelloLoading || isRequestingDeviceAccess;
  const canUseAuthForms = deviceAccessState === 'approved';
  const isPendingApproval = deviceAccessState === 'pending';

  useEffect(() => {
    const hint = getWindowsHelloHint();
    setWindowsHelloAvailable(Boolean(hint?.biometricToken) && isWindowsHelloAvailable());
  }, []);

  const loadDeviceAccessSession = useCallback(async () => {
    setDeviceAccessState('checking');
    setDeviceAccessMessage('');

    try {
      const response = await fetch('/api/device-access/session', { cache: 'no-store' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao consultar sessão de dispositivo.');
      }

      const reason = `${data?.session?.reason || 'UNKNOWN'}`.trim().toUpperCase() as DeviceSessionReason;
      setDeviceAccessReason(reason);

      if (data?.session?.isApproved === true) {
        setDeviceAccessState('approved');
        setDeviceAccessMessage('');
        return;
      }

      if (reason === 'REMOTE_DISABLED') {
        setDeviceAccessState('blocked');
        setDeviceAccessMessage('O acesso remoto está desativado no desktop principal.');
        return;
      }

      if (pendingRequest?.requestId && pendingRequest?.requestKey) {
        setDeviceAccessState('pending');
        setDeviceAccessMessage('Solicitação enviada. Aguarde aprovação no desktop.');
        return;
      }

      if (reason === 'IP_MISMATCH') {
        setDeviceAccessState('blocked');
        setDeviceAccessMessage('O token salvo não corresponde ao IP aprovado. Solicite nova autorização.');
        return;
      }

      setDeviceAccessState('blocked');
      setDeviceAccessMessage('Este dispositivo ainda não foi autorizado pelo desktop.');
    } catch (error: any) {
      setDeviceAccessState('blocked');
      setDeviceAccessReason('UNKNOWN');
      setDeviceAccessMessage(error?.message || 'Não foi possível verificar o acesso do dispositivo.');
    }
  }, [pendingRequest]);

  useEffect(() => {
    loadDeviceAccessSession();
  }, [loadDeviceAccessSession]);

  const pollPendingRequest = useCallback(async () => {
    if (!pendingRequest?.requestId || !pendingRequest?.requestKey) return;

    try {
      const query = new URLSearchParams({ requestKey: pendingRequest.requestKey });
      const response = await fetch(`/api/device-access/request/${encodeURIComponent(pendingRequest.requestId)}/status?${query.toString()}`, {
        cache: 'no-store',
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        if (response.status === 404) {
          clearStoredPendingDeviceRequest();
          setPendingRequest(null);
          setDeviceAccessState('blocked');
          setDeviceAccessMessage('Solicitação expirada. Gere uma nova solicitação de acesso.');
        }
        return;
      }

      const status = `${data?.status || ''}`.trim().toLowerCase();
      if (status === 'approved') {
        if (data?.deviceToken) {
          setStoredDeviceToken(String(data.deviceToken));
        }
        clearStoredPendingDeviceRequest();
        setPendingRequest(null);
        setDeviceAccessReason('TOKEN_VALID');
        setDeviceAccessState('approved');
        setDeviceAccessMessage('');
        return;
      }

      if (status === 'rejected') {
        clearStoredPendingDeviceRequest();
        setPendingRequest(null);
        setDeviceAccessState('rejected');
        setDeviceAccessMessage('Solicitação rejeitada pelo operador no desktop.');
      }
    } catch {
      // Falha de polling não interrompe o estado atual; próximo ciclo tenta novamente.
    }
  }, [pendingRequest]);

  useEffect(() => {
    if (!isPendingApproval || !pendingRequest?.requestId || !pendingRequest?.requestKey) return;

    pollPendingRequest();
    const intervalId = window.setInterval(() => {
      pollPendingRequest();
    }, 3000);

    return () => window.clearInterval(intervalId);
  }, [isPendingApproval, pendingRequest, pollPendingRequest]);

  const handleRequestDeviceAccess = async () => {
    setIsRequestingDeviceAccess(true);
    try {
      const response = await fetch('/api/device-access/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceName: `Cliente ${navigator.platform || 'Web'}`,
          deviceFingerprint: createDeviceFingerprint(),
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Falha ao solicitar autorização para este dispositivo.');
      }

      if (data?.isLocalClient || data?.status === 'approved') {
        if (data?.deviceToken) {
          setStoredDeviceToken(String(data.deviceToken));
        }
        clearStoredPendingDeviceRequest();
        setPendingRequest(null);
        setDeviceAccessReason(data?.isLocalClient ? 'LOCAL_DESKTOP' : 'TOKEN_VALID');
        setDeviceAccessState('approved');
        setDeviceAccessMessage('');
        return;
      }

      if (data?.status === 'pending' && data?.requestId && data?.requestKey) {
        const nextPending: PendingDeviceAccessRequest = {
          requestId: String(data.requestId),
          requestKey: String(data.requestKey),
          createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
        };
        setStoredPendingDeviceRequest(nextPending);
        setPendingRequest(nextPending);
        setDeviceAccessReason('TOKEN_REQUIRED');
        setDeviceAccessState('pending');
        setDeviceAccessMessage('Solicitação enviada. Aguarde aprovação no desktop.');
        return;
      }

      throw new Error('Resposta inesperada ao solicitar acesso do dispositivo.');
    } catch (error: any) {
      setDeviceAccessState('blocked');
      setDeviceAccessMessage(error?.message || 'Não foi possível solicitar autorização de dispositivo.');
      await showAlert({
        title: 'Falha na Solicitação',
        message: error?.message || 'Não foi possível solicitar autorização de dispositivo.',
        tone: 'danger',
      });
    } finally {
      setIsRequestingDeviceAccess(false);
    }
  };

  const handleCancelPendingRequest = () => {
    clearStoredPendingDeviceRequest();
    setPendingRequest(null);
    setDeviceAccessState('blocked');
    setDeviceAccessMessage('Solicitação local removida. Gere uma nova solicitação para continuar.');
  };

  const handleWindowsHelloLogin = async () => {
    const hint = getWindowsHelloHint();
    if (!hint?.biometricToken) {
      setWindowsHelloAvailable(false);
      return;
    }

    setIsWindowsHelloLoading(true);
    try {
      const user = await authenticateWithWindowsHello(hint.biometricToken);
      setUser(user);
    } catch (error: any) {
      const message = error?.message || 'Falha na autenticação biométrica.';
      if (/token biométrico inválido|expirado|não encontrada|não encontrado|reative/i.test(message)) {
        clearWindowsHelloHint();
        setWindowsHelloAvailable(false);
      }
      await showAlert({
        title: 'Falha na Autenticação',
        message: 'Não foi possível autenticar com Windows Hello: ' + message,
        tone: 'danger',
      });
    } finally {
      setIsWindowsHelloLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseAuthForms) {
      await showAlert({
        title: 'Acesso Bloqueado',
        message: 'Este dispositivo precisa ser autorizado no desktop antes de efetuar login.',
        tone: 'warning',
      });
      return;
    }
    setInternalIsLoggingIn(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Servidor respondeu com erro ${response.status}. Conteúdo: ${errText.substring(0, 50)}...`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const badText = await response.text();
        throw new Error(`O servidor não retornou JSON corretamente. Ele retornou: ${badText.substring(0, 30)}...`);
      }

      const data = await response.json();
      if (data && data.success === true) {
        setUser(data.user);
      } else {
        const msg = data?.error || 'Erro desconhecido ao autenticar.';
        await showAlert({
          title: 'Falha no Login',
          message: msg + (data?.details ? "\n\nDetalhes:\n" + data.details : ""),
          tone: 'danger',
        });
      }
    } catch (error: any) {
      await showAlert({
        title: 'Erro de Conexão',
        message: 'Erro ao conectar com o servidor: ' + (error.message || error),
        tone: 'danger',
      });
    } finally {
      setInternalIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseAuthForms) {
      await showAlert({
        title: 'Acesso Bloqueado',
        message: 'Este dispositivo precisa ser autorizado no desktop antes de criar usuário.',
        tone: 'warning',
      });
      return;
    }
    setInternalIsLoggingIn(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass, nome: authData.name })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha no registro: Status ${response.status}. Detalhes: ${errText.substring(0, 50)}...`);
      }

      const data = await response.json();
      if (data.success) {
        await showAlert({
          title: 'Cadastro Concluído',
          message: 'Usuário criado! Agora faça login.',
          tone: 'success',
        });
        setIsRegistering(false);
      } else {
        await showAlert({
          title: 'Falha no Cadastro',
          message: data.error + (data.details ? "\n\nDetalhes:\n" + data.details : ""),
          tone: 'danger',
        });
      }
    } catch (error: any) {
      await showAlert({
        title: 'Erro de Conexão',
        message: 'Erro ao criar usuário / Conexão falhou: ' + (error.message || error),
        tone: 'danger',
      });
    } finally {
      setInternalIsLoggingIn(false);
    }
  };

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      <motion.div className={cn("flex min-h-screen w-full items-center justify-center font-sans p-4 sm:p-10 overflow-y-auto overflow-x-hidden relative bg-slate-50", !animationsEnabled && "animations-disabled")}>
        <BackgroundAnimation />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.6 }}
          className="flex w-full max-w-4xl h-auto min-h-[520px] my-auto overflow-hidden rounded-[2rem] shadow-2xl bg-white border border-slate-200 relative"
        >

        {/* Lado Esquerdo - Branding */}
        <div className="hidden md:flex w-1/3 bg-slate-900 relative p-8 text-white flex-col justify-between overflow-hidden">
          <div className="relative z-10">
            <div className="flex items-center gap-4 mb-10">
              <div className="w-12 h-12 flex items-center justify-center">
                <img src={logoApp} alt="AutoBot Logo" className="w-full h-full object-contain filter drop-shadow-lg" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-white">AUTO <span className="text-blue-500">TOOLS</span></h1>
            </div>
            <h2 className="text-2xl font-bold leading-tight mb-4">Automação Inteligente</h2>
            <p className="text-slate-400 text-sm">Acesse sua plataforma segura de relatórios.</p>
          </div>

          <div className="relative z-10 space-y-3">
            <div className="flex items-center gap-2 opacity-80 transition-all">
              {serverStatus === 'online' ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
              )}
              <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                {serverStatus === 'online'
                  ? (serverInfo?.dbStatus === 'ok' ? 'Banco de Dados: Conectado' : 'Banco de Dados: Instável')
                  : 'Banco: Sistema Fora de Linha'}
              </span>
            </div>
            <div className="flex items-center gap-2 opacity-80 transition-all">
              {serverStatus === 'online' ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
              )}
              <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                Servidor: {serverStatus === 'online' ? (serverInfo?.version || 'Rodando (v1.5.0)') : 'Servidor Desconectado'}
              </span>
            </div>
          </div>

          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
        </div>

        {/* Lado Direito - Formulário */}
        <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center overflow-y-auto custom-scrollbar">
          <div className="max-w-xs mx-auto w-full">
            {/* Logo Mobile */}
            <div className="flex flex-col items-center mb-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 mb-6 shadow-sm overflow-hidden">
                <div className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[150px]">
                  {serverStatus === 'online' ? 'Infra Ativa: ' + (serverInfo?.version || 'V1.5.0') : 'Offline - Verifique Conexão'}
                </span>
              </div>
              <div className="w-16 h-16 mb-3">
                <img src={logoApp} alt="Logo" className="w-full h-full object-contain drop-shadow-sm" />
              </div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">AUTO <span className="text-blue-500">TOOLS</span></h1>
              <div className="relative mt-2">
                <div className="h-1.5 w-16 bg-blue-600 rounded-full relative z-10"></div>
                <div className="absolute inset-0 bg-blue-600 blur-xl opacity-40 -top-4 scale-x-150"></div>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>{canUseAuthForms ? (isRegistering ? 'Nova Conta' : 'Acessar') : 'Acesso do Dispositivo'}</span>
            </h3>
            <p className="text-slate-500 text-sm mb-6">
              {canUseAuthForms
                ? (isRegistering ? 'Preencha os dados abaixo' : 'Insira suas credenciais ou use Windows Hello')
                : 'Para continuar no celular, este dispositivo precisa de autorização do desktop.'}
            </p>

            {deviceAccessState === 'checking' && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex items-center gap-2 text-blue-700 text-sm font-bold">
                  <Loader2 size={16} className="animate-spin" />
                  Validando autorização do dispositivo...
                </div>
              </div>
            )}

            {!canUseAuthForms && deviceAccessState !== 'checking' && (
              <div className="space-y-3">
                <div className={cn(
                  'rounded-2xl border p-4',
                  isPendingApproval ? 'border-amber-200 bg-amber-50/70' : 'border-rose-200 bg-rose-50/70'
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center',
                      isPendingApproval ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                    )}>
                      {isPendingApproval ? <Smartphone size={17} /> : <ShieldAlert size={17} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-700 uppercase tracking-wide">
                        {isPendingApproval ? 'Aguardando aprovação' : 'Dispositivo não autorizado'}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {deviceAccessMessage || 'Solicite autorização para este dispositivo no app desktop.'}
                      </p>
                      {pendingRequest?.requestId && (
                        <p className="text-[10px] text-slate-500 mt-2 font-mono">
                          Solicitação: {pendingRequest.requestId.slice(0, 12)}...
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!isPendingApproval && (
                    <Button
                      type="button"
                      onClick={handleRequestDeviceAccess}
                      disabled={loadingState || deviceAccessReason === 'REMOTE_DISABLED'}
                      className="flex-1 py-3 text-xs font-black uppercase tracking-[0.12em] rounded-2xl"
                    >
                      {isRequestingDeviceAccess ? (
                        <><Loader2 size={15} className="animate-spin mr-2" /> SOLICITANDO...</>
                      ) : (
                        <><ShieldCheck size={15} className="mr-2" /> SOLICITAR ACESSO</>
                      )}
                    </Button>
                  )}

                  {isPendingApproval && (
                    <>
                      <Button
                        type="button"
                        onClick={() => pollPendingRequest()}
                        disabled={loadingState}
                        className="flex-1 py-3 text-xs font-black uppercase tracking-[0.12em] rounded-2xl"
                      >
                        <RefreshCw size={15} className="mr-2" /> ATUALIZAR STATUS
                      </Button>
                      <button
                        type="button"
                        onClick={handleCancelPendingRequest}
                        className="px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest text-slate-500 border border-slate-200 hover:bg-slate-50"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {canUseAuthForms && (
              <>
                <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
                  {isRegistering && (
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Seu Nome</label>
                      <input
                        required
                        type="text"
                        value={authData.name}
                        onChange={e => setAuthData({ ...authData, name: e.target.value })}
                        className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                        placeholder="João Silva"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Usuário / ID</label>
                    <input
                      required
                      type="text"
                      value={authData.user}
                      onChange={e => setAuthData({ ...authData, user: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                      placeholder="ex: admin"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 px-1 uppercase tracking-widest opacity-80">Senha</label>
                    <input
                      required
                      type="password"
                      value={authData.pass}
                      onChange={e => setAuthData({ ...authData, pass: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium font-mono"
                      placeholder="••••••••"
                    />
                  </div>

                  <Button type="submit" disabled={loadingState} className="w-full py-4 text-sm font-black uppercase tracking-[0.15em] shadow-xl shadow-blue-500/30 mt-4 rounded-2xl hover:scale-[1.02] transition-all duration-300">
                    {loadingState ? (
                      <><Loader2 size={18} className="animate-spin mr-2" /> Carregando...</>
                    ) : (
                      isRegistering ? 'CADASTRAR CONTA' : 'ACESSAR AGORA'
                    )}
                  </Button>

                  {!isRegistering && windowsHelloAvailable && (
                    <Button
                      type="button"
                      disabled={loadingState}
                      onClick={handleWindowsHelloLogin}
                      className="w-full py-3 text-xs font-black uppercase tracking-[0.15em] mt-2 rounded-2xl border-2 !border-emerald-800 !bg-emerald-700 !text-white hover:!bg-emerald-800 transition-all"
                    >
                      {isWindowsHelloLoading ? (
                        <><Loader2 size={16} className="animate-spin mr-2" /> VALIDANDO BIOMETRIA...</>
                      ) : (
                        <><Fingerprint size={16} className="mr-2" /> ENTRAR COM WINDOWS HELLO</>
                      )}
                    </Button>
                  )}
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => setIsRegistering(!isRegistering)}
                    className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                    type="button"
                  >
                    {isRegistering ? 'Voltar ao Login' : 'Criar nova conta corporativa'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
        </motion.div>
      </motion.div>
    </MotionConfig>
  );
}
