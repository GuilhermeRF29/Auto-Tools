/**
 * @module ReportsView
 * @description Tela de automação de relatórios com modal de configuração,
 * fila de processamento com SSE em tempo real, e suporte a re-execução.
 * 
 * Relatórios disponíveis:
 * - Demandas (adm_new) — Selenium scraper
 * - Revenue (ebus_new) — eBus scraper
 * - BASE RIO X SP (sr_new) — Gmail API + Pandas
 * - Performance de Canais (busca_dados) — Power BI + consolidação YoY
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Play, CheckCircle, FileSpreadsheet, Loader2,
  ChevronRight, Clock, X, PlayCircle, Bus,
  Navigation, Download, LayoutDashboard, Search
} from 'lucide-react';
import { useDialog } from '../context/DialogContext';
import type { RunningTask, SuccessAnimationStyle, AnimationIntensity } from '../types';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import PulseHighlight from '../components/PulseHighlight';
import CustomDropdown from '../components/CustomDropdown';
import CustomDatePicker from '../components/CustomDatePicker';

interface ReportsViewProps {
  highlightId?: string | null;
  reRunData?: any;
  onReRunUsed?: () => void;
  currentUser?: any;
  runningTasks: RunningTask[];
  onStartAutomation: (payload: any) => Promise<string | null>;
  onCancelTask: (id: string) => void;
  animationsEnabled: boolean;
  successAnimationStyle: SuccessAnimationStyle;
  successAnimationDurationSec: number;
  successAnimationIntensity: AnimationIntensity;
}

const ReportsView = ({
  highlightId: hId,
  reRunData: rrData,
  onReRunUsed: rrUsed,
  currentUser,
  runningTasks,
  onStartAutomation,
  onCancelTask,
  animationsEnabled,
  successAnimationStyle,
  successAnimationDurationSec,
  successAnimationIntensity,
}: ReportsViewProps) => {
  const { showAlert } = useDialog();
  const SUCCESS_ANIMATION_PRESETS = {
    premium: {
      visibleMs: 1600,
      exitMs: 620,
      ease: [0.16, 1, 0.3, 1] as const,
      enterDuration: 0.46,
      exitDuration: 0.58,
      iconDelay: 0.1,
      textDelay: 0.2,
      barDelay: 0.28,
      pulseY: -3,
      pulseScale: 1.03,
      glowOpacity: 0.55,
    },
    rapido: {
      visibleMs: 1100,
      exitMs: 460,
      ease: [0.22, 1, 0.36, 1] as const,
      enterDuration: 0.34,
      exitDuration: 0.42,
      iconDelay: 0.06,
      textDelay: 0.12,
      barDelay: 0.18,
      pulseY: -2,
      pulseScale: 1.015,
      glowOpacity: 0.38,
    }
  } as const;
  const FORM_EASE = [0.16, 1, 0.3, 1] as const;

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [isSuccessClosing, setIsSuccessClosing] = useState(false);
  const closePhaseTimeoutRef = useRef<number | null>(null);
  const closeModalTimeoutRef = useRef<number | null>(null);
  const intensityTuning = {
    suave: { amp: 0.8, speed: 1.1, glow: 0.85 },
    normal: { amp: 1, speed: 1, glow: 1 },
    intensa: { amp: 1.25, speed: 0.9, glow: 1.2 },
  } as const;
  const intensityProfile = intensityTuning[successAnimationIntensity] || intensityTuning.normal;
  const basePreset = SUCCESS_ANIMATION_PRESETS[successAnimationStyle] || SUCCESS_ANIMATION_PRESETS.premium;
  const selectedSuccessAnimation = {
    visibleMs: Math.max(800, Math.round(successAnimationDurationSec * 1000)),
    exitMs: animationsEnabled ? Math.max(280, Math.round(basePreset.exitMs * intensityProfile.speed)) : 0,
    ease: basePreset.ease,
    enterDuration: animationsEnabled ? Math.max(0.2, Number((basePreset.enterDuration * intensityProfile.speed).toFixed(2))) : 0,
    exitDuration: animationsEnabled ? Math.max(0.2, Number((basePreset.exitDuration * intensityProfile.speed).toFixed(2))) : 0,
    iconDelay: animationsEnabled ? basePreset.iconDelay : 0,
    textDelay: animationsEnabled ? basePreset.textDelay : 0,
    barDelay: animationsEnabled ? basePreset.barDelay : 0,
    pulseY: animationsEnabled ? basePreset.pulseY * intensityProfile.amp : 0,
    pulseScale: animationsEnabled ? 1 + (basePreset.pulseScale - 1) * intensityProfile.amp : 1,
    glowOpacity: animationsEnabled ? Math.min(0.75, basePreset.glowOpacity * intensityProfile.glow) : 0.22,
    loopDuration: animationsEnabled ? Number((1.45 * intensityProfile.speed).toFixed(2)) : 0,
  };

  const clearSuccessTimers = () => {
    if (closePhaseTimeoutRef.current !== null) {
      window.clearTimeout(closePhaseTimeoutRef.current);
      closePhaseTimeoutRef.current = null;
    }
    if (closeModalTimeoutRef.current !== null) {
      window.clearTimeout(closeModalTimeoutRef.current);
      closeModalTimeoutRef.current = null;
    }
  };

  const handleCloseModal = () => {
    clearSuccessTimers();
    setIsModalOpen(false);
    setShowSuccess(false);
    setIsSuccessClosing(false);
  };

  // Configurações do modal
  const [configAcao, setConfigAcao] = useState('completo');
  const [configBase, setConfigBase] = useState('padrao');
  const [configSaida, setConfigSaida] = useState('padrao');
  const [configPeriodo, setConfigPeriodo] = useState('padrao');
  const [folderPath, setFolderPath] = useState('');
  const [outFolderPath, setOutFolderPath] = useState('');
  const [dataInicial, setDataInicial] = useState<Date | null>(null);
  const [dataFinal, setDataFinal] = useState<Date | null>(null);
  const [dataInicialBase, setDataInicialBase] = useState<Date | null>(null);
  const [dataFinalBase, setDataFinalBase] = useState<Date | null>(null);
  const [defaultDates, setDefaultDates] = useState<{ ini: Date, fim: Date } | null>(null);
  const isADMSelected = selectedReport === 'Relatório de Demandas';
  const isSRSelected = selectedReport === 'Relatório BASE RIO X SP';
  const isBuscaDadosSelected = selectedReport === 'Relatório Performance de Canais';
  const isBuscaDadosCustomMode = isBuscaDadosSelected && configPeriodo === 'custom';
  const isSRTreatmentWithoutDownload = isSRSelected
    && configPeriodo === 'custom'
    && (configAcao === 'tratamento' || configAcao === 'tratamento_envio');
  const showSREmailDateRange = isSRSelected && !isSRTreatmentWithoutDownload;
  const showActionPicker = configPeriodo === 'custom' && !isBuscaDadosSelected;
  const showAdvancedPaths = isBuscaDadosCustomMode || (configPeriodo === 'custom' && configAcao !== 'completo');

  /** Lista de relatórios disponíveis com metadados. */
  const reports = [
    { id: 'adm_new', name: 'Relatório de Demandas', desc: 'Extração e consolidação de demandas e passagens.', time: '~16 min', icon: <FileSpreadsheet size={18} /> },
    { id: 'ebus_new', name: 'Relatório Revenue', desc: 'Processamento de dados do eBus e receitas.', time: '~8 min', icon: <Bus size={18} /> },
    { id: 'sr_new', name: 'Relatório BASE RIO X SP', desc: 'Base consolidada das operações e ocupações.', time: '~6 min', icon: <Navigation size={18} /> },
    { id: 'busca_dados', name: 'Relatório Performance de Canais', desc: 'Extração no BI com atualização comparativa mês a mês.', time: '~12 min', icon: <LayoutDashboard size={18} /> },
  ];

  /**
   * Abre o modal de configuração para um relatório específico.
   * Calcula as datas padrão com base no tipo do relatório.
   */
  const handleOpenConfig = (name: string) => {
    clearSuccessTimers();
    setSelectedReport(name);
    setIsModalOpen(true);
    setShowSuccess(false);
    setIsSuccessClosing(false);

    // Lógica de datas padrão por tipo de relatório
    const hoje = new Date();
    const ultimoDiaFechado = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
    let ini = hoje;
    let fim = hoje;

    if (name === 'Relatório de Demandas') {
      ini = new Date(hoje.getFullYear(), 0, 1);
      fim = new Date(hoje.getFullYear(), 11, 31);
    } else if (name === 'Relatório Revenue') {
      ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 5, 0);
    } else if (name === 'Relatório Performance de Canais') {
      ini = new Date(ultimoDiaFechado.getFullYear(), ultimoDiaFechado.getMonth(), 1);
      fim = ultimoDiaFechado;
    }

    setDefaultDates({ ini, fim });
    setDataInicial(ini);
    setDataFinal(fim);
    setDataInicialBase(ini);
    setDataFinalBase(fim);

    // Reset de estados de configuração
    setConfigPeriodo('padrao');
    setConfigAcao('completo');
    setConfigBase('padrao');
    setConfigSaida('padrao');
    setFolderPath('');
    setOutFolderPath('');
  };

  const toPayloadDate = (value: Date | null) => {
    if (!value) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  /**
   * Envia o payload de execução para o App.tsx via callback.
   * O gerenciamento de SSE e estado é feito globalmente.
   */
  const handleExecute = async () => {
    const effectiveBuscaCustomMode = isBuscaDadosSelected && configPeriodo === 'custom';
    const effectiveBase = isBuscaDadosSelected
      ? (effectiveBuscaCustomMode ? configBase : 'padrao')
      : configBase;
    const effectiveSaida = isBuscaDadosSelected
      ? (effectiveBuscaCustomMode ? configSaida : 'padrao')
      : configSaida;
    const effectiveBasePath = (isBuscaDadosSelected && !effectiveBuscaCustomMode) ? '' : folderPath;
    const effectiveOutFolderPath = (isBuscaDadosSelected && !effectiveBuscaCustomMode) ? '' : outFolderPath;

    const acaoExigeOrigem = ['tratamento', 'tratamento_envio', 'arquivo_envio'].includes(configAcao);
    if (acaoExigeOrigem && !effectiveBasePath.trim()) {
      await showAlert({
        title: 'Origem Não Informada',
        message: 'Informe a localização dos arquivos de demanda para continuar.',
        tone: 'warning',
      });
      return;
    }

    if (effectiveSaida === 'personalizada' && !effectiveOutFolderPath.trim()) {
      await showAlert({
        title: 'Saída Não Informada',
        message: 'Selecione uma pasta de saída para continuar.',
        tone: 'warning',
      });
      return;
    }

    if (isBuscaDadosSelected && effectiveBase === 'personalizada' && !effectiveBasePath.trim()) {
      await showAlert({
        title: 'Base Não Informada',
        message: 'Selecione a pasta base onde está o arquivo comparativo do BI.',
        tone: 'warning',
      });
      return;
    }

    setIsExecuting(true);

    const dataBaseIni = dataInicialBase || dataInicial;
    const dataBaseFim = dataFinalBase || dataFinal;

    const payload = {
      name: selectedReport,
      user_id: currentUser?.id,
      acao: isBuscaDadosSelected ? 'completo' : configAcao,
      base: effectiveBase,
      saida: effectiveSaida,
      pasta_personalizada: effectiveBasePath,
      pasta_saida: effectiveOutFolderPath,
      periodo: configPeriodo,
      data_ini: isSRTreatmentWithoutDownload ? null : toPayloadDate(dataInicial),
      data_fim: isSRTreatmentWithoutDownload ? null : toPayloadDate(dataFinal),
      data_ini_base: isSRSelected ? toPayloadDate(dataBaseIni) : null,
      data_fim_base: isSRSelected ? toPayloadDate(dataBaseFim) : null,
      servico_credencial: isBuscaDadosSelected ? 'Busca Dados BI' : null,
    };

    const jobId = await onStartAutomation(payload);

    if (jobId) {
      clearSuccessTimers();
      setShowSuccess(true);
      setIsSuccessClosing(false);

      if (animationsEnabled) {
        // Mantém o card visível por um instante, depois dispara animação de saída.
        closePhaseTimeoutRef.current = window.setTimeout(() => {
          setIsSuccessClosing(true);
        }, selectedSuccessAnimation.visibleMs);
      }

      // Fecha a modal somente após a animação de saída terminar.
      closeModalTimeoutRef.current = window.setTimeout(() => {
        handleCloseModal();
      }, selectedSuccessAnimation.visibleMs + selectedSuccessAnimation.exitMs);
    } else {
      await showAlert({ title: 'Erro de Conexão', message: 'Erro ao conectar com o servidor.', tone: 'danger' });
    }

    setIsExecuting(false);
  };

  /** Cancela uma tarefa em execução via callback global. */
  const handleCancelTask = async (id: string) => {
    onCancelTask(id);
  };

  const parseDateParam = (value: any): Date | null => {
    if (!value || typeof value !== 'string') return null;

    const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      const [, y, m, d] = dateOnlyMatch;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    const dateTimeMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
    if (dateTimeMatch) {
      const [, y, m, d] = dateTimeMatch;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    if (value.includes('/')) {
      const [d, m, y] = value.split('/');
      if (d && m && y) {
        const parsed = new Date(`${y}-${m}-${d}T00:00:00`);
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  // Lógica de re-execução (quando vem do Dashboard ou Histórico via "Play")
  useEffect(() => {
    if (rrData && rrData.reportName && rrUsed) {
      const { reportName, params } = rrData;
      
      handleOpenConfig(reportName);
      
      if (params) {
        const rrDataIni = parseDateParam(params.data_ini);
        const rrDataFim = parseDateParam(params.data_fim);
        const rrBaseIni = parseDateParam(params.data_ini_base);
        const rrBaseFim = parseDateParam(params.data_fim_base);

        if (rrDataIni) setDataInicial(rrDataIni);
        if (rrDataFim) setDataFinal(rrDataFim);
        if (rrBaseIni) setDataInicialBase(rrBaseIni);
        if (rrBaseFim) setDataFinalBase(rrBaseFim);
        if (params.acao) setConfigAcao(params.acao);
        if (params.base) setConfigBase(params.base);
        if (params.saida) setConfigSaida(params.saida);
        if (typeof params.pasta_personalizada === 'string') setFolderPath(params.pasta_personalizada);
        if (typeof params.pasta_saida === 'string') setOutFolderPath(params.pasta_saida);
        if (params.data_ini || params.data_fim) setConfigPeriodo('custom');
      }

      rrUsed();
    }
  }, [rrData]);

  useEffect(() => {
    return () => clearSuccessTimers();
  }, []);

  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const toMillis = (value: Date | string | undefined) => {
    if (!value) return Date.now();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : Date.now();
  };

  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const parseTaskStage = (message?: string) => {
    if (!message) return 'Aguardando instruções do backend...';
    const parts = message.split('|').map(p => p.trim()).filter(Boolean);
    return parts.length > 1 ? parts[parts.length - 1] : message;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <style>{`
        @keyframes report-progress-shimmer {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(220%); }
        }

        .report-progress-shimmer {
          background: linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0) 100%);
          animation: report-progress-shimmer 1.35s linear infinite;
        }
      `}</style>

      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Automação de Relatórios</h2>
      </div>

      {/* Fila de Processamento (Tarefas em andamento/concluídas) */}
      {runningTasks.length > 0 && (
        <Card className="p-5 border-blue-100 bg-blue-50/50">
          <h3 className="text-sm font-bold text-slate-800 mb-1 flex items-center gap-2">
            <Loader2 size={16} className="text-blue-600 animate-spin" />
            Fila de Processamento ({runningTasks.filter(t => t.status === 'running').length})
          </h3>
          <p className="text-[10px] uppercase tracking-wider text-slate-400 font-black mb-4">
            Atualização dinâmica em tempo real
          </p>
          <div className="space-y-4">
            {runningTasks.map(task => (
              <div key={task.id} className={`bg-white rounded-2xl p-4 border shadow-sm relative overflow-hidden group transition-all duration-500 
                ${task.status === 'completed' ? 'border-green-100' : (task.status === 'failed' || task.status === 'cancelled') ? 'border-red-100' : 'border-blue-100'}`}>
                {(() => {
                  const startedAt = toMillis(task.startTime as Date | string);
                  const lastUpdate = toMillis(task.lastUpdateTime as Date | string | undefined);
                  const elapsed = formatElapsed(nowTick - startedAt);
                  const staleSeconds = Math.max(0, Math.floor((nowTick - lastUpdate) / 1000));
                  const freshness = staleSeconds <= 20
                    ? { label: 'AO VIVO', cls: 'text-emerald-600 bg-emerald-50 border-emerald-100' }
                    : staleSeconds <= 90
                      ? { label: `AGUARDANDO (${staleSeconds}s)`, cls: 'text-amber-600 bg-amber-50 border-amber-100' }
                      : { label: `SEM NOVO EVENTO (${Math.floor(staleSeconds / 60)} min)`, cls: 'text-rose-600 bg-rose-50 border-rose-100' };

                  return (
                    <>
                {/* Fundo de progresso */}
                <div className="absolute top-0 left-0 bottom-0 bg-slate-50/50 w-full z-0"></div>
                <div
                  className={`absolute top-0 left-0 bottom-0 z-0 transition-[width] duration-200 ease-linear opacity-25 overflow-hidden
                    ${task.status === 'completed' ? 'bg-green-500' : (task.status === 'failed' || task.status === 'cancelled') ? 'bg-red-500' : 'bg-blue-500'}
                  `}
                  style={{ width: `${task.progress}%` }}
                >
                  {task.status === 'running' && (
                    <div className="absolute inset-0 report-progress-shimmer" />
                  )}
                </div>

                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl text-white shadow-sm flex-shrink-0 transition-colors
                      ${task.status === 'completed' ? 'bg-green-500 shadow-green-200' :
                        (task.status === 'failed' || task.status === 'cancelled') ? 'bg-red-500 shadow-red-200' : 'bg-blue-600 shadow-blue-200'}`}
                    >
                      {task.status === 'completed' ? <CheckCircle size={16} /> :
                        (task.status === 'failed' || task.status === 'cancelled') ? <X size={16} /> : <Loader2 size={16} className="animate-spin" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 text-sm">{task.name}</h4>
                        {task.status === 'completed' && <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Concluído</span>}
                        {(task.status === 'failed' || task.status === 'cancelled') && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-widest">{task.status === 'failed' ? 'Falha' : 'Cancelado'}</span>}
                        {task.status === 'running' && (
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider border ${freshness.cls}`}>
                            {freshness.label}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                        {parseTaskStage(task.message) || (task.status === 'running' ? 'Processando...' :
                          task.status === 'completed' ? 'Relatório gerado com sucesso!' : 'Operação interrompida')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                      Tempo: {elapsed}
                    </span>
                    {task.status === 'running' && (
                      <button
                        onClick={() => handleCancelTask(task.id)}
                        className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                        title="Cancelar"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                </div>
                    </>
                  );
                })()}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lista de Relatórios Disponíveis */}
      <div className="flex flex-col gap-4">
        {reports.map((rep) => (
          <PulseHighlight key={rep.id} isHighlighted={hId === rep.id} variant="outer">
            <Card 
              className={`p-4 sm:p-5 flex flex-col md:flex-row items-center gap-6 transition-all duration-300 border-2 cursor-pointer group 
                ${hId === rep.id 
                  ? 'border-blue-500 shadow-xl shadow-blue-500/10 scale-[1.01] bg-blue-50/20' 
                  : 'border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200'}`}
              onClick={() => handleOpenConfig(rep.name)}
            >
              {/* Ícone e Identificação */}
              <div className="flex items-center gap-5 flex-1 min-w-0">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 
                  ${hId === rep.id ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-blue-50 text-blue-600 shadow-blue-50 group-hover:bg-blue-600 group-hover:text-white'}`}>
                  {rep.icon}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-base font-black text-slate-800 tracking-tight uppercase group-hover:text-blue-600 transition-colors truncate">
                    {rep.name}
                  </h3>
                  <p className="text-sm font-medium text-slate-400 mt-1 line-clamp-1 group-hover:text-slate-500 transition-colors">
                    {rep.desc}
                  </p>
                </div>
              </div>

              {/* Informação Técnica Central */}
              <div className="hidden sm:flex items-center gap-8 px-6 border-l border-slate-100">
                <div className="flex flex-col items-start min-w-[100px]">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1.5">Estimativa</span>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{rep.time}</span>
                  </div>
                </div>
                <div className="flex flex-col items-start min-w-[80px]">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1.5">Sistema</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-slate-600">Online</span>
                  </div>
                </div>
              </div>

              {/* Ação Lateral */}
              <div className="flex items-center gap-4 pl-6 md:border-l border-slate-100">
                <Button 
                  onClick={(e: any) => { e.stopPropagation(); handleOpenConfig(rep.name); }} 
                  variant="secondary" 
                  className="py-2.5 px-6 text-xs font-black uppercase tracking-widest group-hover:!bg-blue-600 group-hover:!text-white group-hover:!border-blue-600 transition-all shadow-sm"
                >
                  Configurar <ChevronRight size={14} className="ml-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                </Button>
              </div>
            </Card>
          </PulseHighlight>
        ))}
      </div>

      {/* Modal de Configuração do Relatório */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={`Configurar: ${selectedReport}`}
        footer={!showSuccess && (
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={handleCloseModal}>Cancelar</Button>
            <Button onClick={handleExecute} className="min-w-[140px] rounded-2xl">
              <Play size={16} className="mr-2" /> Iniciar
            </Button>
          </div>
        )}
      >
        <AnimatePresence mode="wait" initial={false}>
          {showSuccess ? (
            <motion.div
              key="success-card"
              initial={{ opacity: 0, scale: 0.9, y: 20, filter: 'blur(4px)' }}
              animate={isSuccessClosing
                ? { opacity: 0, scale: 0.96, y: -14, filter: 'blur(4px)' }
                : { opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }
              }
              exit={{ opacity: 0, scale: 0.95, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: isSuccessClosing ? selectedSuccessAnimation.exitDuration : selectedSuccessAnimation.enterDuration, ease: selectedSuccessAnimation.ease }}
              className="py-12 flex flex-col items-center justify-center text-center space-y-4"
              style={{ transformOrigin: '50% 8%' }}
            >
              <motion.div
                initial={{ scale: 0.82, rotate: -14, opacity: 0 }}
                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                transition={{ delay: selectedSuccessAnimation.iconDelay, type: 'spring', stiffness: 210, damping: 18 }}
                className="relative w-20 h-20 bg-gradient-to-br from-green-100 to-green-50 rounded-full flex items-center justify-center mb-2 shadow-lg shadow-green-200"
              >
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: selectedSuccessAnimation.glowOpacity, scale: 1.15 }}
                  transition={{ delay: selectedSuccessAnimation.iconDelay + 0.02, duration: 0.45, ease: selectedSuccessAnimation.ease }}
                  className="absolute inset-0 rounded-full bg-green-300/25"
                />
                <motion.div
                  animate={{ y: [0, selectedSuccessAnimation.pulseY, 0], scale: [1, selectedSuccessAnimation.pulseScale, 1] }}
                  transition={animationsEnabled
                    ? { duration: selectedSuccessAnimation.loopDuration, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }
                    : { duration: 0 }
                  }
                >
                  <CheckCircle size={40} className="text-green-600" />
                </motion.div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: selectedSuccessAnimation.textDelay, duration: 0.34, ease: selectedSuccessAnimation.ease }}
              >
                <h3 className="text-2xl font-black text-slate-800">Confirmado!</h3>
                <p className="text-slate-500 text-sm font-medium mt-2">Relatório será processado</p>
              </motion.div>

              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: isSuccessClosing ? 0 : 1 }}
                transition={{ delay: selectedSuccessAnimation.barDelay, duration: 0.6, ease: selectedSuccessAnimation.ease }}
                className="w-12 h-1 bg-gradient-to-r from-green-400 to-blue-500 rounded-full"
              />
            </motion.div>
          ) : (
            <motion.div
              key="config-form"
              initial={{ opacity: 0, y: 10, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, filter: 'blur(1px)' }}
              transition={{ duration: 0.3, ease: FORM_EASE }}
              className="space-y-4"
            >
            {/* Período / Cronograma */}
            <div className="space-y-1.5 mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cronograma de Retirada</label>
              <div className="flex items-center gap-1 p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl w-full">
                {[{ id: 'padrao', label: 'Padrão' }, { id: 'modificada', label: 'Modificado' }, { id: 'custom', label: 'Personalizado' }].map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setConfigPeriodo(p.id);
                      if (p.id !== 'custom') setConfigAcao('completo');
                      if (isBuscaDadosSelected && p.id !== 'custom') {
                        setConfigBase('padrao');
                        setConfigSaida('padrao');
                        setFolderPath('');
                        setOutFolderPath('');
                      }
                      if (p.id === 'padrao' && defaultDates) {
                        setDataInicial(defaultDates.ini);
                        setDataFinal(defaultDates.fim);
                        setDataInicialBase(defaultDates.ini);
                        setDataFinalBase(defaultDates.fim);
                      } else {
                        setDataInicial(null);
                        setDataFinal(null);
                        setDataInicialBase(null);
                        setDataFinalBase(null);
                      }
                    }}
                    className={`flex-1 text-center py-2.5 rounded-xl text-xs font-bold transition-all ${configPeriodo === p.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Seletores de data */}
            {isSRSelected ? (
              <div className="space-y-4 animate-in fade-in duration-300">
                {showSREmailDateRange ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Período de Busca no E-mail</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <CustomDatePicker label="Data Inicial (E-mail)" value={dataInicial} onChange={setDataInicial} disabled={configPeriodo === 'padrao'} />
                      <CustomDatePicker label="Data Final (E-mail)" value={dataFinal} onChange={setDataFinal} align="right" disabled={configPeriodo === 'padrao'} />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                    <p className="text-xs font-bold text-blue-700">Modo sem download de e-mail: esta etapa será pulada.</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Período de Filtro dos Dados</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <CustomDatePicker label="Data Inicial (Filtro)" value={dataInicialBase} onChange={setDataInicialBase} disabled={configPeriodo === 'padrao'} />
                    <CustomDatePicker label="Data Final (Filtro)" value={dataFinalBase} onChange={setDataFinalBase} align="right" disabled={configPeriodo === 'padrao'} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
                <CustomDatePicker label="Data Inicial" value={dataInicial} onChange={setDataInicial} disabled={configPeriodo === 'padrao'} />
                <CustomDatePicker label="Data Final" value={dataFinal} onChange={setDataFinal} align="right" disabled={configPeriodo === 'padrao'} />
              </div>
            )}

            {isBuscaDadosSelected && (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <p className="text-xs font-bold text-blue-700">O período selecionado será dividido automaticamente por mês para extração no BI.</p>
              </div>
            )}

            {isBuscaDadosCustomMode && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
                <p className="text-xs font-bold text-amber-700">
                  Modo personalizado ativo: escolha base e saída manualmente. Nos modos Padrão e Modificado, o diretório padrão é usado automaticamente.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4">
              {/* Ação personalizada */}
              {showActionPicker && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  {(() => {
                    const actionOptions = isADMSelected
                      ? [
                          { value: 'completo', label: 'Processo completo' },
                          { value: 'download', label: 'Apenas download' },
                          { value: 'download_tratamento', label: 'Download + tratamento' },
                          { value: 'tratamento', label: 'Apenas tratamento' },
                          { value: 'tratamento_envio', label: 'Tratamento + envio' },
                          { value: 'arquivo_envio', label: 'Só envio' },
                        ]
                      : [
                          { value: 'completo', label: 'Processo completo' },
                          { value: 'download', label: 'Apenas download' },
                          { value: 'download_tratamento', label: 'Download + tratamento' },
                          { value: 'tratamento', label: 'Apenas tratamento' },
                          { value: 'tratamento_envio', label: 'Tratamento + envio' },
                        ];

                    return (
                  <CustomDropdown
                    label="Ação do Processo"
                    value={configAcao}
                    onChange={setConfigAcao}
                    icon={PlayCircle}
                    options={actionOptions}
                  />
                    );
                  })()}

                  {isADMSelected && configAcao === 'arquivo_envio' && (
                    <p className="mt-2 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Modo só envio: organiza histórico, envia o arquivo atual e copia o par do ano anterior.
                    </p>
                  )}
                </div>
              )}

              {/* Base e Saída (apenas para custom e não completo) */}
              {showAdvancedPaths && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {(isBuscaDadosSelected || configAcao !== 'download') && (
                    <div className="space-y-3">
                      <CustomDropdown
                        label="Base da Automação"
                        value={configBase}
                        onChange={setConfigBase}
                        icon={LayoutDashboard}
                        options={isBuscaDadosSelected
                          ? [
                              { value: 'padrao', label: 'Base padrão' },
                              { value: 'personalizada', label: 'Escolher local (Personalizado)' },
                            ]
                          : [
                              { value: 'padrao', label: 'Base padrão' },
                              { value: 'sem_base', label: 'Sem base (Pular comparação)' },
                              { value: 'personalizada', label: 'Escolher local (Personalizado)' },
                            ]}
                      />
                      {configBase === 'personalizada' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <input
                            type="text"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            placeholder="C:\\Caminho\\Ate\\a\\Base..."
                            className="flex-1 min-w-0 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/abrir-explorador-pastas');
                                const data = await res.json();
                                if (data.caminho) setFolderPath(data.caminho);
                              } catch (e) {
                                await showAlert({
                                  title: 'Falha ao Abrir Explorador',
                                  message: 'Servidor py local não rodando ou mockado. Cole o caminho na caixa de texto na web.',
                                  tone: 'warning',
                                });
                              }
                            }}
                            className="p-3.5 flex-shrink-0 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-colors"
                            title="Selecionar Pasta"
                          >
                            <Search size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {(!isBuscaDadosSelected || isBuscaDadosCustomMode) && (
                  <div className={`space-y-3 ${configAcao !== 'download' ? 'pt-3 border-t border-slate-100' : ''}`}>
                    <CustomDropdown
                      label="Local de Saída"
                      value={configSaida}
                      onChange={setConfigSaida}
                      icon={Download}
                      options={[
                        { value: 'padrao', label: 'Pasta padrão' },
                        { value: 'personalizada', label: 'Escolher pasta de saída...' },
                      ]}
                    />
                    {configSaida === 'personalizada' && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <input
                          type="text"
                          value={outFolderPath}
                          onChange={(e) => setOutFolderPath(e.target.value)}
                          placeholder="C:\\Caminho\\Para\\Saida..."
                          className="flex-1 min-w-0 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/abrir-explorador-pastas');
                              const data = await res.json();
                              if (data.caminho) setOutFolderPath(data.caminho);
                            } catch (e) {
                               await showAlert({
                                 title: 'Falha ao Abrir Explorador',
                                 message: 'Servidor py local não rodando. Cole o caminho na caixa de texto.',
                                 tone: 'warning',
                               });
                            }
                          }}
                          className="p-3.5 flex-shrink-0 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-colors"
                          title="Selecionar Pasta"
                        >
                          <Search size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}
            </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Modal>

    </div>
  );
};

export default ReportsView;
