/**
 * @module SettingsView
 * @description Tela de configurações do sistema.
 * 
 * Seções colapsáveis:
 *   - Caminhos Base dos Dashboards (persistidos no banco por usuário)
 *   - Animações e preferências visuais
 */
import { useEffect, useState, useCallback } from 'react';
import {
  FolderOpen,
  Loader2,
  ScanFace,
  SlidersHorizontal,
  Sparkles,
  Zap,
  Save,
  CheckCircle,
  Database,
  ChevronDown,
  Shield,
  RefreshCw,
  Ban,
  Trash2,
  Smartphone,
  Wifi,
  Globe,
  Lock,
  ExternalLink,
  Copy,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';
import Card from '../components/Card';
import type { SuccessAnimationStyle, AnimationIntensity } from '../types';

/** Definição dos caminhos configuráveis para cada dashboard */
interface BasePaths {
  revenuePath: string;
  demandPath: string;
  rioSharePath: string;
  channelSharePath: string;
}

/** Valores padrão do sistema (mantidos como fallback) */
const DEFAULT_BASE_PATHS: BasePaths = {
  revenuePath: 'Z:\\DASH REVENUE APPLICATION\\BASE',
  demandPath: 'Z:\\Forecast\\Forecast2',
  rioSharePath: 'Z:\\Dash RIO',
  channelSharePath: 'Z:\\Forecast\\Forecast2',
};

interface DeviceAccessConfig {
  remoteAccessEnabled: boolean;
  approvalRequired: boolean;
  enforceIpMatch: boolean;
  tokenTtlDays: number;
  updatedAt?: string | null;
}

interface DeviceAccessNetworkHints {
  loopbackUrl: string;
  lanUrls: string[];
}

interface DevicePendingRequest {
  id: string;
  status: string;
  ip: string;
  name: string;
  fingerprint: string;
  userAgent: string;
  createdAt: string;
  updatedAt: string;
}

interface DeviceApproved {
  id: string;
  name: string;
  firstApprovedIp: string;
  lastIp: string;
  fingerprint: string;
  userAgent: string;
  createdAt: string;
  approvedAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
}

interface SettingsViewProps {
  animationsEnabled: boolean;
  onAnimationsEnabledChange: (enabled: boolean) => void;
  successAnimationStyle: SuccessAnimationStyle;
  onSuccessAnimationStyleChange: (style: SuccessAnimationStyle) => void;
  successAnimationDurationSec: number;
  onSuccessAnimationDurationSecChange: (seconds: number) => void;
  successAnimationIntensity: AnimationIntensity;
  onSuccessAnimationIntensityChange: (intensity: AnimationIntensity) => void;
  windowsHelloEnabled: boolean;
  onWindowsHelloEnabledChange: (enabled: boolean) => void | Promise<void>;
  onWindowsHelloReset: () => void;
  windowsHelloBusy?: boolean;
  currentUserId?: number | null;
}

/** Header clicável e colapsável para seções de configuração */
const CollapsibleSection = ({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
  iconColor: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden">
      {/* Header clicável */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-5 sm:p-6 text-left hover:bg-slate-50/50 transition-colors group"
      >
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', iconBg, iconColor)}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5 truncate">{subtitle}</p>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="shrink-0 text-slate-300 group-hover:text-slate-500 transition-colors"
        >
          <ChevronDown size={20} />
        </motion.div>
      </button>

      {/* Conteúdo colapsável */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 sm:px-6 pb-5 sm:pb-6 pt-0 border-t border-slate-100">
              <div className="pt-5">
                {children}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
};

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
};

const clampTokenTtlDays = (value: number) => {
  if (!Number.isFinite(value)) return 30;
  return Math.min(365, Math.max(1, Math.round(value)));
};

const SettingsView = ({
  animationsEnabled,
  onAnimationsEnabledChange,
  successAnimationStyle,
  onSuccessAnimationStyleChange,
  successAnimationDurationSec,
  onSuccessAnimationDurationSecChange,
  successAnimationIntensity,
  onSuccessAnimationIntensityChange,
  windowsHelloEnabled,
  onWindowsHelloEnabledChange,
  onWindowsHelloReset,
  windowsHelloBusy = false,
  currentUserId = null,
}: SettingsViewProps) => {

  // ======== Estado dos caminhos base ========
  const [basePaths, setBasePaths] = useState<BasePaths>({ ...DEFAULT_BASE_PATHS });
  const [pathsLoading, setPathsLoading] = useState(false);
  const [pathsSaving, setPathsSaving] = useState(false);
  const [pathsSaved, setPathsSaved] = useState(false);
  const [pathsError, setPathsError] = useState('');

  // ======== Estado de acesso remoto/dispositivos ========
  const [deviceConfig, setDeviceConfig] = useState<DeviceAccessConfig | null>(null);
  const [networkHints, setNetworkHints] = useState<DeviceAccessNetworkHints | null>(null);
  const [pendingDevices, setPendingDevices] = useState<DevicePendingRequest[]>([]);
  const [approvedDevices, setApprovedDevices] = useState<DeviceApproved[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [deviceSaving, setDeviceSaving] = useState(false);
  const [deviceError, setDeviceError] = useState('');
  const [deviceSuccess, setDeviceSuccess] = useState('');
  const [deviceDesktopOnly, setDeviceDesktopOnly] = useState(false);
  const [tokenTtlDraft, setTokenTtlDraft] = useState('30');

  // ======== Estado do Túnel (Acesso Global) ========
  const [tunnelActive, setTunnelActive] = useState(false);
  const [tunnelUrl, setTunnelUrl] = useState('');
  const [tunnelStarting, setTunnelStarting] = useState(false);
  const [authtoken, setAuthtoken] = useState('');
  const [hasAuthtoken, setHasAuthtoken] = useState(false);

  const parseApiError = useCallback(async (response: Response) => {
    try {
      const payload = await response.json();
      return payload?.error || payload?.message || `Erro HTTP ${response.status}`;
    } catch {
      return `Erro HTTP ${response.status}`;
    }
  }, []);

  const loadDeviceAccess = useCallback(async () => {
    setDeviceLoading(true);
    setDeviceError('');

    try {
      const publicResp = await fetch('/api/device-access/public-state', { cache: 'no-store' });
      const publicData = await publicResp.json();

      if (publicData?.config) {
        setDeviceConfig(publicData.config as DeviceAccessConfig);
        setTokenTtlDraft(String((publicData.config as DeviceAccessConfig).tokenTtlDays || 30));
      }
      if (publicData?.networkHints) {
        setNetworkHints(publicData.networkHints as DeviceAccessNetworkHints);
      }

      const [configResp, pendingResp, approvedResp] = await Promise.all([
        fetch('/api/device-access/config', { cache: 'no-store' }),
        fetch('/api/device-access/pending', { cache: 'no-store' }),
        fetch('/api/device-access/devices', { cache: 'no-store' }),
      ]);

      if (configResp.status === 403 || pendingResp.status === 403 || approvedResp.status === 403) {
        setDeviceDesktopOnly(true);
        setPendingDevices([]);
        setApprovedDevices([]);
        return;
      }

      if (!configResp.ok) {
        throw new Error(await parseApiError(configResp));
      }

      const configData = await configResp.json();
      const pendingData = pendingResp.ok ? await pendingResp.json() : { pending: [] };
      const approvedData = approvedResp.ok ? await approvedResp.json() : { devices: [] };

      if (configData?.config) {
        const cfg = configData.config as DeviceAccessConfig;
        setDeviceConfig(cfg);
        setTokenTtlDraft(String(cfg.tokenTtlDays || 30));
      }
      if (configData?.networkHints) {
        setNetworkHints(configData.networkHints as DeviceAccessNetworkHints);
      }

      setPendingDevices(Array.isArray(pendingData?.pending) ? pendingData.pending as DevicePendingRequest[] : []);
      setApprovedDevices(Array.isArray(approvedData?.devices) ? approvedData.devices as DeviceApproved[] : []);
      setDeviceDesktopOnly(false);
    } catch (error: any) {
      setDeviceError(error?.message || 'Falha ao carregar configurações de acesso remoto.');
    } finally {
      setDeviceLoading(false);
    }
  }, [parseApiError]);

  const updateDeviceConfig = useCallback(async (patch: Partial<DeviceAccessConfig>) => {
    if (!deviceConfig) return;

    setDeviceSaving(true);
    setDeviceError('');
    setDeviceSuccess('');
    try {
      const response = await fetch('/api/device-access/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          remoteAccessEnabled: patch.remoteAccessEnabled ?? deviceConfig.remoteAccessEnabled,
          approvalRequired: patch.approvalRequired ?? deviceConfig.approvalRequired,
          enforceIpMatch: patch.enforceIpMatch ?? deviceConfig.enforceIpMatch,
          tokenTtlDays: clampTokenTtlDays(patch.tokenTtlDays ?? deviceConfig.tokenTtlDays),
        }),
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const data = await response.json();
      if (data?.config) {
        const cfg = data.config as DeviceAccessConfig;
        setDeviceConfig(cfg);
        setTokenTtlDraft(String(cfg.tokenTtlDays || 30));
      }
      if (data?.networkHints) {
        setNetworkHints(data.networkHints as DeviceAccessNetworkHints);
      }

      setDeviceSuccess('Configurações de acesso remoto atualizadas.');
    } catch (error: any) {
      setDeviceError(error?.message || 'Falha ao atualizar configurações de acesso remoto.');
    } finally {
      setDeviceSaving(false);
    }
  }, [deviceConfig, parseApiError]);

  const approvePendingDevice = useCallback(async (requestId: string) => {
    setDeviceSaving(true);
    setDeviceError('');
    setDeviceSuccess('');
    try {
      const response = await fetch('/api/device-access/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      await loadDeviceAccess();
      setDeviceSuccess('Dispositivo aprovado com sucesso.');
    } catch (error: any) {
      setDeviceError(error?.message || 'Falha ao aprovar dispositivo.');
    } finally {
      setDeviceSaving(false);
    }
  }, [loadDeviceAccess, parseApiError]);

  const rejectPendingDevice = useCallback(async (requestId: string) => {
    setDeviceSaving(true);
    setDeviceError('');
    setDeviceSuccess('');
    try {
      const response = await fetch('/api/device-access/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      await loadDeviceAccess();
      setDeviceSuccess('Solicitação rejeitada.');
    } catch (error: any) {
      setDeviceError(error?.message || 'Falha ao rejeitar solicitação.');
    } finally {
      setDeviceSaving(false);
    }
  }, [loadDeviceAccess, parseApiError]);

  const revokeApprovedDevice = useCallback(async (deviceId: string) => {
    setDeviceSaving(true);
    setDeviceError('');
    setDeviceSuccess('');
    try {
      const response = await fetch('/api/device-access/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      await loadDeviceAccess();
      setDeviceSuccess('Dispositivo revogado com sucesso.');
    } catch (error: any) {
      setDeviceError(error?.message || 'Falha ao revogar dispositivo.');
    } finally {
      setDeviceSaving(false);
    }
  }, [loadDeviceAccess, parseApiError]);

  const loadTunnelStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/tunnel/status');
      const data = await resp.json();
      setTunnelActive(data.isActive);
      setTunnelUrl(data.url || '');
      setTunnelStarting(data.isStarting);
      setHasAuthtoken(data.hasAuthtoken);
    } catch (e) {
      console.warn('Erro ao carregar status do túnel:', e);
    }
  }, []);

  const handleStartTunnel = async () => {
    setTunnelStarting(true);
    setDeviceError('');
    try {
      const resp = await fetch('/api/tunnel/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authtoken })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Falha ao iniciar túnel');
      
      setTunnelActive(true);
      setTunnelUrl(data.url);
      setDeviceSuccess('Túnel Ngrok iniciado com sucesso!');
      await loadDeviceAccess(); // Refresh network hints
    } catch (e: any) {
      setDeviceError(e.message);
    } finally {
      setTunnelStarting(false);
    }
  };

  const handleStopTunnel = async () => {
    setDeviceError('');
    try {
      const resp = await fetch('/api/tunnel/stop', { method: 'POST' });
      if (!resp.ok) throw new Error('Falha ao parar túnel');
      setTunnelActive(false);
      setTunnelUrl('');
      setDeviceSuccess('Túnel parado.');
      await loadDeviceAccess();
    } catch (e: any) {
      setDeviceError(e.message);
    }
  };

  /** Carrega configurações salvas do backend (ao montar) */
  const loadSettings = useCallback(async () => {
    if (!currentUserId) return;
    setPathsLoading(true);
    try {
      const resp = await fetch(`/api/settings/${currentUserId}`);
      const data = await resp.json();
      if (data?.settings?.basePaths) {
        setBasePaths((prev) => ({
          ...prev,
          ...data.settings.basePaths,
        }));
      }
    } catch (e) {
      console.warn('[SETTINGS] Falha ao carregar configurações:', e);
    } finally {
      setPathsLoading(false);
    }
  }, [currentUserId]);

  useEffect(() => { loadSettings(); }, [loadSettings]);
  useEffect(() => { 
    loadDeviceAccess(); 
    loadTunnelStatus();
  }, [loadDeviceAccess, loadTunnelStatus]);

  /** Salva os caminhos no banco de dados */
  const handleSavePaths = async () => {
    if (!currentUserId) return;
    setPathsSaving(true);
    setPathsError('');
    setPathsSaved(false);
    try {
      const resp = await fetch(`/api/settings/${currentUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'basePaths', value: basePaths }),
      });
      const data = await resp.json();
      if (data?.success) {
        setPathsSaved(true);
        setTimeout(() => setPathsSaved(false), 3000);
      } else {
        setPathsError('Falha ao salvar. Tente novamente.');
      }
    } catch (e) {
      setPathsError('Erro de conexão ao salvar configurações.');
    } finally {
      setPathsSaving(false);
    }
  };

  /** Restaura os valores padrão do sistema */
  const handleResetPaths = () => {
    setBasePaths({ ...DEFAULT_BASE_PATHS });
    setPathsSaved(false);
    setPathsError('');
  };

  /** Atualiza um campo de caminho */
  const updatePath = (key: keyof BasePaths, value: string) => {
    setBasePaths((prev) => ({ ...prev, [key]: value }));
    setPathsSaved(false);
  };

  // Definição dos campos de caminho para renderização dinâmica
  const pathFields: Array<{ key: keyof BasePaths; label: string; description: string; placeholder: string }> = [
    { key: 'revenuePath', label: 'Revenue Dashboard', description: 'Pasta onde estão os arquivos de Revenue (Excel, DuckDB, Parquet)', placeholder: DEFAULT_BASE_PATHS.revenuePath },
    { key: 'demandPath', label: 'Demand Dashboard', description: 'Pasta dos arquivos de demanda/forecast', placeholder: DEFAULT_BASE_PATHS.demandPath },
    { key: 'rioSharePath', label: 'Rio x SP Market Share', description: 'Pasta dos relatórios Rio x São Paulo', placeholder: DEFAULT_BASE_PATHS.rioSharePath },
    { key: 'channelSharePath', label: 'Channel Share (YoY)', description: 'Pasta das planilhas de performance de canais', placeholder: DEFAULT_BASE_PATHS.channelSharePath },
  ];

  const animationOptions: Array<{
    id: SuccessAnimationStyle;
    title: string;
    description: string;
    icon: ReactNode;
  }> = [
    {
      id: 'premium',
      title: 'Sofisticado',
      description: 'Movimento mais fluido e elegante, com transições suaves.',
      icon: <Sparkles size={18} />,
    },
    {
      id: 'rapido',
      title: 'Rápido',
      description: 'Confirmação mais direta, com menos permanência na tela.',
      icon: <Zap size={18} />,
    },
  ];

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
          <SlidersHorizontal size={20} />
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Configurações</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Clique em cada seção para expandir</p>
        </div>
      </div>

      {/* ======== SEÇÃO 1: Caminhos Base dos Dashboards ======== */}
      <CollapsibleSection
        title="Caminhos Base dos Dashboards"
        subtitle="Diretórios onde cada dashboard busca os dados"
        icon={<Database size={18} />}
        iconBg="bg-violet-50"
        iconColor="text-violet-600"
        defaultOpen={false}
      >
        {pathsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
            <span className="text-sm text-slate-500">Carregando configurações...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {pathFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{field.label}</label>
                <p className="text-[11px] text-slate-400 px-1 -mt-0.5">{field.description}</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative">
                    <FolderOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={basePaths[field.key]}
                      onChange={(e) => updatePath(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full pl-9 pr-3 py-2.5 text-sm font-mono text-slate-700 bg-slate-50 border-2 border-slate-100 rounded-xl focus:border-violet-300 focus:ring-2 focus:ring-violet-100 focus:outline-none transition-all placeholder:text-slate-300"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Botões de ação */}
            <div className="flex items-center gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSavePaths}
                disabled={pathsSaving}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300',
                  pathsSaved
                    ? 'bg-emerald-100 text-emerald-700 border-2 border-emerald-200'
                    : 'bg-violet-600 text-white hover:bg-violet-700 border-2 border-violet-500 shadow-md shadow-violet-200',
                  pathsSaving && 'opacity-60 cursor-not-allowed'
                )}
              >
                {pathsSaving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : pathsSaved ? (
                  <CheckCircle size={14} />
                ) : (
                  <Save size={14} />
                )}
                {pathsSaved ? 'Salvo!' : 'Salvar Caminhos'}
              </button>

              <button
                type="button"
                onClick={handleResetPaths}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 border-2 border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-all"
              >
                Restaurar Padrão
              </button>

              {pathsError && (
                <span className="text-xs text-red-500 font-medium">{pathsError}</span>
              )}
            </div>
          </div>
        )}
      </CollapsibleSection>

      {/* ======== SEÇÃO 2: Acesso Remoto e Dispositivos ======== */}
      <CollapsibleSection
        title="Acesso Remoto e Dispositivos"
        subtitle="Autorizações de celular/rede para acessar este desktop"
        icon={<Shield size={18} />}
        iconBg="bg-emerald-50"
        iconColor="text-emerald-600"
        defaultOpen={false}
      >
        {deviceLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-slate-400 mr-2" />
            <span className="text-sm text-slate-500">Carregando dados de acesso remoto...</span>
          </div>
        ) : (
          <div className="space-y-4">
            {deviceConfig && (
              <>
                {/* Seção de IPs e QR Code (Integrada com Acesso Externo) */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Wifi size={12} className="text-slate-400" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Endereços de Acesso</p>
                    </div>
                    
                    {tunnelActive ? (
                      <div className="flex items-center gap-2">
                         <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                         <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Acesso Externo Ativo</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conexão em Rede Local</span>
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row items-start gap-6">
                    <div className="flex-1 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Desktop local</p>
                          <code className="block text-xs font-bold text-slate-800 bg-white px-2.5 py-2 rounded-xl border border-slate-200 shadow-sm">{networkHints?.loopbackUrl || '-'}</code>
                        </div>

                        {networkHints?.lanUrls?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">IP de Rede</p>
                            <div className="relative group">
                              <code className="block text-xs font-bold text-slate-800 bg-white px-2.5 py-2 rounded-xl border border-slate-200 shadow-sm">{networkHints.lanUrls[0]}</code>
                              <a 
                                href={networkHints.lanUrls[0]} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="absolute right-1.5 top-1.5 p-1 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Abrir no navegador"
                              >
                                <ExternalLink size={12} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Botão de Acesso Externo e Link */}
                      <div className="pt-4 border-t border-slate-200 mt-2 space-y-4">
                        {tunnelActive && tunnelUrl && (
                          <div className="bg-emerald-600 text-white p-3.5 rounded-2xl shadow-xl shadow-emerald-100 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[9px] font-black uppercase tracking-widest opacity-80 flex items-center gap-1">
                                <Globe size={10} /> Link Externo Seguro (HTTPS)
                              </p>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(tunnelUrl);
                                }}
                                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                              >
                                <Copy size={14} />
                              </button>
                            </div>
                            <code className="text-xs font-black break-all select-all">{tunnelUrl}</code>
                          </div>
                        )}

                        <div className="flex flex-col gap-2.5">
                          {tunnelActive ? (
                            <button
                              onClick={handleStopTunnel}
                              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-rose-600 text-white hover:bg-rose-700 shadow-lg shadow-rose-100 transition-all flex items-center justify-center gap-2 group"
                            >
                              <Ban size={14} className="group-hover:scale-110 transition-transform" /> 
                              Desativar Acesso Externo
                            </button>
                          ) : (
                            <button
                              onClick={handleStartTunnel}
                              disabled={tunnelStarting}
                              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-100 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group"
                            >
                              {tunnelStarting ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Globe size={14} className="group-hover:rotate-12 transition-transform" />
                              )}
                              {tunnelStarting ? 'Estabelecendo conexão...' : 'Ativar Acesso Externo'}
                            </button>
                          )}
                          
                          <p className="text-[10px] text-slate-400 font-medium px-1">
                            {tunnelActive 
                              ? 'O app está visível na internet. Use este link para acesso remoto seguro com biometria.'
                              : 'Gera um link seguro temporário para acessar via celular de qualquer lugar sem configurar o roteador.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* QR Code Lateral - Compacto e Elegante */}
                    <div className="shrink-0 flex flex-col items-center gap-3">
                      <div className="p-4 bg-white rounded-3xl border-2 border-slate-100 shadow-sm flex flex-col items-center justify-center gap-3 group min-w-[180px] min-h-[180px] relative overflow-hidden pb-10">
                        {networkHints?.lanUrls?.[0] || tunnelUrl ? (
                          <>
                            <img 
                              src={`/api/qr-code?url=${encodeURIComponent(tunnelUrl || networkHints.lanUrls[0])}&t=${Date.now()}`}
                              alt="QR Code de Acesso"
                              className="w-32 h-32 group-hover:scale-110 transition-transform duration-700 ease-out"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = 'https://placehold.co/160x160?text=Erro+QR';
                              }}
                            />
                            <div className="absolute inset-x-0 bottom-0 py-2.5 bg-slate-50/95 backdrop-blur-sm border-t border-slate-100 flex items-center justify-center">
                              <span className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Escaneie para acessar</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-col items-center gap-3 text-slate-300">
                            <div className="w-10 h-10 rounded-full border-2 border-slate-100 border-t-blue-500 animate-spin" />
                            <span className="text-[9px] font-black uppercase tracking-widest text-center px-4 text-slate-400">Detectando rede...</span>
                          </div>
                        )}
                      </div>
                      
                      <button
                        type="button"
                        onClick={() => loadDeviceAccess()}
                        disabled={deviceLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 bg-white hover:bg-slate-50 transition-all border border-slate-200 shadow-sm disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={cn(deviceLoading && 'animate-spin')} />
                        Recarregar IPs
                      </button>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-100 p-3.5">
                    <p className="text-[10px] text-amber-700 leading-relaxed font-bold flex items-start gap-2">
                      <Shield size={14} className="shrink-0 mt-0.5" />
                      <span>Nota: A biometria (Windows Hello) requer que o app seja acessado via <strong>localhost</strong> ou link <strong>HTTPS</strong> para segurança.</span>
                    </p>
                  </div>
                </div>

                {/* Configurações de Acesso Remoto */}
                <div className="rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Acesso Remoto</p>
                      <p className="text-xs text-slate-500 mt-1">Permite clientes fora do desktop local acessarem o sistema via rede.</p>
                    </div>
                    <button
                      type="button"
                      disabled={deviceSaving || deviceDesktopOnly}
                      onClick={() => updateDeviceConfig({ remoteAccessEnabled: !deviceConfig.remoteAccessEnabled })}
                      className={cn(
                        'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                        deviceConfig.remoteAccessEnabled
                          ? 'bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-200'
                          : 'bg-slate-200 border-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                          deviceConfig.remoteAccessEnabled ? 'translate-x-7' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>

                  <div className={cn('flex items-center justify-between gap-3', !deviceConfig.remoteAccessEnabled && 'opacity-50')}>
                    <div>
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Exigir Aprovação de Dispositivo</p>
                      <p className="text-xs text-slate-500 mt-1">Todo novo celular/IP entra como pendente até aprovação no desktop.</p>
                    </div>
                    <button
                      type="button"
                      disabled={deviceSaving || deviceDesktopOnly || !deviceConfig.remoteAccessEnabled}
                      onClick={() => updateDeviceConfig({ approvalRequired: !deviceConfig.approvalRequired })}
                      className={cn(
                        'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                        deviceConfig.approvalRequired
                          ? 'bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-200'
                          : 'bg-slate-200 border-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                          deviceConfig.approvalRequired ? 'translate-x-7' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>

                  <div className={cn('flex items-center justify-between gap-3', !deviceConfig.remoteAccessEnabled && 'opacity-50')}>
                    <div>
                      <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Amarrar Token ao IP</p>
                      <p className="text-xs text-slate-500 mt-1">Se ativado, o token só funciona no IP aprovado inicialmente.</p>
                    </div>
                    <button
                      type="button"
                      disabled={deviceSaving || deviceDesktopOnly || !deviceConfig.remoteAccessEnabled}
                      onClick={() => updateDeviceConfig({ enforceIpMatch: !deviceConfig.enforceIpMatch })}
                      className={cn(
                        'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                        deviceConfig.enforceIpMatch
                          ? 'bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-200'
                          : 'bg-slate-200 border-slate-300'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                          deviceConfig.enforceIpMatch ? 'translate-x-7' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>

                  <div className={cn('space-y-1.5', !deviceConfig.remoteAccessEnabled && 'opacity-50')}>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Validade do Token (dias)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        disabled={deviceSaving || deviceDesktopOnly || !deviceConfig.remoteAccessEnabled}
                        value={tokenTtlDraft}
                        onChange={(e) => setTokenTtlDraft(e.target.value)}
                        className="w-28 px-3 py-2 rounded-xl border-2 border-slate-200 bg-white text-sm font-black text-slate-700 focus:outline-none focus:border-emerald-300"
                      />
                      <button
                        type="button"
                        disabled={deviceSaving || deviceDesktopOnly || !deviceConfig.remoteAccessEnabled}
                        onClick={() => updateDeviceConfig({ tokenTtlDays: clampTokenTtlDays(Number(tokenTtlDraft || 30)) })}
                        className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Salvar
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-500">
                    Última atualização da política: <span className="font-semibold text-slate-700">{formatDateTime(deviceConfig.updatedAt || null)}</span>
                  </p>
                </div>
              </>
            )}

            {deviceDesktopOnly && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
                <p className="text-xs font-bold text-amber-700">
                  Gerenciamento avançado disponível apenas no desktop local (127.0.0.1). Em clientes remotos, esta seção fica em modo leitura.
                </p>
              </div>
            )}

            {deviceSuccess && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                {deviceSuccess}
              </div>
            )}

            {deviceError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">
                {deviceError}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadDeviceAccess}
                disabled={deviceLoading || deviceSaving}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2"
              >
                <RefreshCw size={13} className={cn(deviceLoading && 'animate-spin')} />
                Atualizar Lista
              </button>
            </div>

            {!deviceDesktopOnly && (
              <>
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-700">Solicitações Pendentes</p>
                    <span className="text-xs font-bold text-slate-500">{pendingDevices.length}</span>
                  </div>

                  {pendingDevices.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma solicitação pendente no momento.</p>
                  ) : (
                    <div className="space-y-2">
                      {pendingDevices.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                                <Smartphone size={13} /> {item.name || 'Dispositivo remoto'}
                              </p>
                              <p className="text-[11px] text-slate-500 mt-1">IP: <span className="font-mono">{item.ip || '-'}</span></p>
                              <p className="text-[11px] text-slate-500">Solicitado em: {formatDateTime(item.createdAt)}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                disabled={deviceSaving}
                                onClick={() => approvePendingDevice(item.id)}
                                className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                Aprovar
                              </button>
                              <button
                                type="button"
                                disabled={deviceSaving}
                                onClick={() => rejectPendingDevice(item.id)}
                                className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60 flex items-center gap-1"
                              >
                                <Ban size={12} /> Rejeitar
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-black uppercase tracking-widest text-slate-700">Dispositivos Autorizados</p>
                    <span className="text-xs font-bold text-slate-500">{approvedDevices.length}</span>
                  </div>

                  {approvedDevices.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum dispositivo autorizado ainda.</p>
                  ) : (
                    <div className="space-y-2">
                      {approvedDevices.map((item) => (
                        <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-black text-slate-700">{item.name || 'Dispositivo autorizado'}</p>
                              <p className="text-[11px] text-slate-500 mt-1">IP inicial: <span className="font-mono">{item.firstApprovedIp || '-'}</span></p>
                              <p className="text-[11px] text-slate-500">Último acesso: {formatDateTime(item.lastSeenAt)}</p>
                              <p className="text-[11px] text-slate-500">Expira em: {formatDateTime(item.expiresAt)}</p>
                            </div>
                            <button
                              type="button"
                              disabled={deviceSaving}
                              onClick={() => revokeApprovedDevice(item.id)}
                              className="px-3 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-60 flex items-center gap-1"
                            >
                              <Trash2 size={12} /> Revogar
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* ======== SEÇÃO 3: Segurança e Biometria ======== */}
      <CollapsibleSection
        title="Segurança e Biometria"
        subtitle="Configurações de Windows Hello e proteção de dados"
        icon={<Lock size={18} />}
        iconBg="bg-rose-50"
        iconColor="text-rose-600"
        defaultOpen={false}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Windows Hello (WebAuthn)</p>
              <p className="text-xs text-slate-500 mt-1">Exigir biometria ou PIN do Windows para logins e ações críticas.</p>
            </div>
            <button
              type="button"
              disabled={windowsHelloBusy}
              onClick={() => onWindowsHelloEnabledChange(!windowsHelloEnabled)}
              className={cn(
                'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                windowsHelloEnabled
                  ? 'bg-rose-600 border-rose-500 shadow-lg shadow-rose-200'
                  : 'bg-slate-200 border-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                  windowsHelloEnabled ? 'translate-x-7' : 'translate-x-0'
                )}
              >
                {windowsHelloBusy ? (
                  <Loader2 size={12} className="animate-spin text-slate-500" />
                ) : (
                  <ScanFace size={12} className={cn(windowsHelloEnabled ? 'text-rose-600' : 'text-slate-400')} />
                )}
              </span>
            </button>
          </div>
          
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 flex items-center justify-between gap-3">
            <p className="text-[10px] text-slate-500 leading-relaxed font-medium">
              <Shield size={10} className="inline mr-1" />
              Nota: A biometria requer que o app seja acessado via <strong>localhost</strong> ou <strong>Acesso Externo (HTTPS)</strong>.
            </p>
            <button
              type="button"
              onClick={() => onWindowsHelloReset()}
              className="px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest text-rose-600 bg-white border border-rose-100 hover:bg-rose-50 transition-all shrink-0"
              title="Use se o switch acima travar ou a biometria parar de funcionar"
            >
              Resetar Local
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ======== SEÇÃO 4: Animações e Visual ======== */}
      <CollapsibleSection
        title="Animações e Visual"
        subtitle="Configurações de animação e tempo de interface"
        icon={<Sparkles size={18} />}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        defaultOpen={false}
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-700 uppercase tracking-widest">Animações da Interface</p>
              <p className="text-xs text-slate-500 mt-1">Habilita transições suaves e efeitos visuais em toda a plataforma.</p>
            </div>
            <button
              type="button"
              onClick={() => onAnimationsEnabledChange(!animationsEnabled)}
              className={cn(
                'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                animationsEnabled
                  ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-200'
                  : 'bg-slate-200 border-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                  animationsEnabled ? 'translate-x-7' : 'translate-x-0'
                )}
              />
            </button>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Estilo de Confirmação</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {animationOptions.map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!animationsEnabled}
                  onClick={() => onSuccessAnimationStyleChange(option.id)}
                  className={cn(
                    'w-full text-left p-4 rounded-2xl border-2 transition-all duration-300',
                    successAnimationStyle === option.id
                      ? 'border-blue-500 bg-blue-50/60 shadow-md shadow-blue-100'
                      : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30',
                    !animationsEnabled && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                      successAnimationStyle === option.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    )}>
                      {option.icon}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{option.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{option.description}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Duração do Card</label>
              <span className="text-xs font-black text-blue-600">{successAnimationDurationSec}s</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              step="0.5"
              disabled={!animationsEnabled}
              value={successAnimationDurationSec}
              onChange={(e) => onSuccessAnimationDurationSecChange(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600 disabled:opacity-50"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default SettingsView;
