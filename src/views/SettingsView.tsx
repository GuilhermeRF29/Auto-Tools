/**
 * @module SettingsView
 * @description Tela de configurações do sistema.
 * 
 * Seções colapsáveis:
 *   - Caminhos Base dos Dashboards (persistidos no banco por usuário)
 *   - Animações e preferências visuais
 */
import { useEffect, useState, useCallback } from 'react';
import { FolderOpen, Loader2, ScanFace, SlidersHorizontal, Sparkles, Zap, Save, CheckCircle, Database, ChevronDown } from 'lucide-react';
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
  windowsHelloBusy = false,
  currentUserId = null,
}: SettingsViewProps) => {

  // ======== Estado dos caminhos base ========
  const [basePaths, setBasePaths] = useState<BasePaths>({ ...DEFAULT_BASE_PATHS });
  const [pathsLoading, setPathsLoading] = useState(false);
  const [pathsSaving, setPathsSaving] = useState(false);
  const [pathsSaved, setPathsSaved] = useState(false);
  const [pathsError, setPathsError] = useState('');

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

      {/* ======== SEÇÃO 2: Animações e Visual ======== */}
      <CollapsibleSection
        title="Animações e Visual"
        subtitle="Configurações de animação, biometria e tempo"
        icon={<Sparkles size={18} />}
        iconBg="bg-blue-50"
        iconColor="text-blue-600"
        defaultOpen={true}
      >
        {/* Toggle Animações */}
        <div className="mb-5 pb-5 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Ativar Animações</h3>
              <p className="text-xs text-slate-500 mt-2">
                Quando desativado, todas as animações do sistema são reduzidas para melhorar desempenho em máquinas antigas.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onAnimationsEnabledChange(!animationsEnabled)}
              className={cn(
                'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border',
                animationsEnabled
                  ? 'bg-blue-600 border-blue-500 shadow-lg shadow-blue-200'
                  : 'bg-slate-200 border-slate-300'
              )}
              aria-pressed={animationsEnabled}
              aria-label="Ativar ou desativar animações"
            >
              <span
                className={cn(
                  'absolute top-1 left-1 w-7 h-7 rounded-full bg-white shadow-md transition-all duration-300 ease-out flex items-center justify-center',
                  animationsEnabled ? 'translate-x-7' : 'translate-x-0'
                )}
              >
                <span className={cn('w-1.5 h-1.5 rounded-full transition-colors', animationsEnabled ? 'bg-blue-600' : 'bg-slate-300')} />
              </span>
            </button>
          </div>
        </div>

        {/* Toggle Windows Hello */}
        <div className="mb-5 pb-5 border-b border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Windows Hello / Biometria</h3>
              <p className="text-xs text-slate-500 mt-2">
                Ativa login com PIN, reconhecimento facial ou digital. Ao desativar, a credencial e o token local
                são removidos e será necessário validar novamente para reativar.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onWindowsHelloEnabledChange(!windowsHelloEnabled)}
              disabled={windowsHelloBusy}
              className={cn(
                'relative w-16 h-9 rounded-full transition-all duration-300 ease-out shrink-0 border disabled:opacity-60 disabled:cursor-not-allowed',
                windowsHelloEnabled
                  ? 'bg-emerald-600 border-emerald-500 shadow-lg shadow-emerald-200'
                  : 'bg-slate-200 border-slate-300'
              )}
              aria-pressed={windowsHelloEnabled}
              aria-label="Ativar ou desativar Windows Hello"
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
                  <ScanFace size={12} className={cn(windowsHelloEnabled ? 'text-emerald-600' : 'text-slate-400')} />
                )}
              </span>
            </button>
          </div>
        </div>

        {/* Estilo de confirmação */}
        <div className="mb-4">
          <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest">Animação de Confirmação</h3>
          <p className="text-xs text-slate-500 mt-2">
            Escolha como o card de confirmação deve aparecer ao iniciar um relatório.
          </p>
        </div>

        <div className={cn('space-y-5', !animationsEnabled && 'opacity-50')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {animationOptions.map(option => {
            const isActive = successAnimationStyle === option.id;
            return (
              <button
                key={option.id}
                type="button"
                disabled={!animationsEnabled}
                onClick={() => onSuccessAnimationStyleChange(option.id)}
                className={cn(
                  'w-full text-left p-4 rounded-2xl border-2 transition-all duration-300',
                  isActive
                    ? 'border-blue-500 bg-blue-50/60 shadow-md shadow-blue-100'
                    : 'border-slate-100 bg-white hover:border-blue-200 hover:bg-blue-50/30',
                  !animationsEnabled && 'cursor-not-allowed'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center transition-colors',
                      isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                    )}
                  >
                    {option.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-black text-slate-800">{option.title}</p>
                      {isActive && (
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-white px-2 py-0.5 rounded-full border border-blue-100">
                          Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{option.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
          </div>

          {/* Duração */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Duração da Confirmação</label>
            <div className="rounded-2xl border-2 border-slate-100 p-4 bg-slate-50/60">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-600">Tempo de permanência do card</span>
                <span className="text-xs font-black text-blue-600">{successAnimationDurationSec.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={0.8}
                max={4}
                step={0.1}
                disabled={!animationsEnabled}
                value={successAnimationDurationSec}
                onChange={(e) => onSuccessAnimationDurationSecChange(Number(e.target.value))}
                className="w-full accent-blue-600 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Intensidade */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Intensidade da Animação</label>
            <div className="flex items-center gap-1 p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl w-full">
              {[
                { id: 'suave', label: 'Suave' },
                { id: 'normal', label: 'Normal' },
                { id: 'intensa', label: 'Intensa' },
              ].map(option => (
                <button
                  key={option.id}
                  type="button"
                  disabled={!animationsEnabled}
                  onClick={() => onSuccessAnimationIntensityChange(option.id as AnimationIntensity)}
                  className={cn(
                    'flex-1 text-center py-2.5 rounded-xl text-xs font-bold transition-all',
                    successAnimationIntensity === option.id
                      ? 'bg-white shadow-sm text-blue-600'
                      : 'text-slate-500 hover:text-slate-700',
                    !animationsEnabled && 'cursor-not-allowed'
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
};

export default SettingsView;
