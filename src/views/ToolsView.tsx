import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Database,
  FileArchive,
  FileSpreadsheet,
  FolderOpen,
  Info,
  Loader2,
  MessageSquareText,
  Plus,
  Play,
  Sparkles,
  Trash2,
  XCircle,
  Wrench,
} from 'lucide-react';

import Card from '../components/Card';
import Button from '../components/Button';
import { cn } from '../utils/cn';

type ToolId = 'extension-converter';
type FormatType = 'parquet' | 'sqlite';
type ParquetMode = 'individual' | 'merged';
type ConverterStatus = 'idle' | 'running' | 'success' | 'error';

interface ConverterResponse {
  success: boolean;
  messages?: string[];
  outputs?: string[];
  error?: string;
}

type LogLevel = 'info' | 'success' | 'warning' | 'error';

interface ParsedLog {
  raw: string;
  timestamp: string;
  message: string;
  level: LogLevel;
}

const parseLogEntry = (entry: string): ParsedLog => {
  const match = entry.match(/^\[(.*?)\]\s*(.*)$/);
  const timestamp = match?.[1] || '--:--:--';
  const message = (match?.[2] || entry).trim();
  const lower = message.toLowerCase();

  let level: LogLevel = 'info';
  if (
    lower.includes('erro')
    || lower.includes('falha')
    || lower.includes('invalido')
    || lower.includes('inválido')
    || lower.includes('nao foi possivel')
    || lower.includes('não foi possível')
  ) {
    level = 'error';
  } else if (
    lower.includes('concluido')
    || lower.includes('concluído')
    || lower.includes('sucesso')
    || lower.includes('finalizada')
    || lower.includes('finalizado')
    || lower.includes('gerado')
  ) {
    level = 'success';
  } else if (
    lower.includes('nenhum')
    || lower.includes('cancelada')
    || lower.includes('selecione')
    || lower.includes('pendente')
  ) {
    level = 'warning';
  }

  return {
    raw: entry,
    timestamp,
    message,
    level,
  };
};

const LOG_LEVEL_META: Record<LogLevel, {
  label: string;
  containerClass: string;
  iconClass: string;
  textClass: string;
  icon: ReactNode;
}> = {
  info: {
    label: 'Info',
    containerClass: 'border-slate-200 bg-white/80',
    iconClass: 'bg-slate-100 text-slate-600',
    textClass: 'text-slate-700',
    icon: <Info size={14} />,
  },
  success: {
    label: 'Sucesso',
    containerClass: 'border-emerald-200 bg-emerald-50/80',
    iconClass: 'bg-emerald-100 text-emerald-700',
    textClass: 'text-emerald-900',
    icon: <CheckCircle2 size={14} />,
  },
  warning: {
    label: 'Atenção',
    containerClass: 'border-amber-200 bg-amber-50/80',
    iconClass: 'bg-amber-100 text-amber-700',
    textClass: 'text-amber-900',
    icon: <AlertTriangle size={14} />,
  },
  error: {
    label: 'Erro',
    containerClass: 'border-rose-200 bg-rose-50/80',
    iconClass: 'bg-rose-100 text-rose-700',
    textClass: 'text-rose-900',
    icon: <XCircle size={14} />,
  },
};

const ToolsView = () => {
  const [activeTool, setActiveTool] = useState<ToolId>('extension-converter');

  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState('');
  const [formatType, setFormatType] = useState<FormatType>('parquet');
  const [parquetMode, setParquetMode] = useState<ParquetMode>('individual');
  const [dbName, setDbName] = useState('database.db');

  const [status, setStatus] = useState<ConverterStatus>('idle');
  const [logs, setLogs] = useState<string[]>(['[Pronto] Configure os arquivos e inicie a conversao.']);
  const [outputs, setOutputs] = useState<string[]>([]);

  const [isPickingFiles, setIsPickingFiles] = useState(false);
  const [isPickingDir, setIsPickingDir] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const logViewportRef = useRef<HTMLDivElement>(null);

  const statusChip = useMemo(() => {
    if (status === 'running') {
      return {
        label: 'Executando',
        className: 'bg-blue-50 text-blue-700 border-blue-100',
        icon: <Loader2 size={12} className="animate-spin" />,
      };
    }

    if (status === 'success') {
      return {
        label: 'Concluido',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        icon: <CheckCircle2 size={12} />,
      };
    }

    if (status === 'error') {
      return {
        label: 'Erro',
        className: 'bg-rose-50 text-rose-700 border-rose-100',
        icon: <AlertTriangle size={12} />,
      };
    }

    return {
      label: 'Aguardando',
      className: 'bg-slate-100 text-slate-600 border-slate-200',
      icon: <Sparkles size={12} />,
    };
  }, [status]);

  const addLog = (message: string) => {
    const stamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLogs((prev) => [...prev, `[${stamp}] ${message}`].slice(-180));
  };

  const parsedLogs = useMemo(() => logs.map((item) => parseLogEntry(item)), [logs]);

  const logCounters = useMemo(() => {
    return parsedLogs.reduce(
      (acc, item) => {
        acc[item.level] += 1;
        return acc;
      },
      { info: 0, success: 0, warning: 0, error: 0 } as Record<LogLevel, number>
    );
  }, [parsedLogs]);

  const lastLog = parsedLogs.length ? parsedLogs[parsedLogs.length - 1] : null;

  useEffect(() => {
    if (!logViewportRef.current) return;
    logViewportRef.current.scrollTo({
      top: logViewportRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [parsedLogs.length]);

  const revealPath = async (targetPath: string) => {
    try {
      await fetch(`/api/revelar-arquivo?path=${encodeURIComponent(targetPath)}`);
      addLog(`Explorer aberto para: ${targetPath}`);
    } catch {
      addLog('Nao foi possivel abrir o Explorer para o caminho selecionado.');
    }
  };

  const handlePickFiles = async () => {
    setIsPickingFiles(true);
    try {
      const resp = await fetch('/api/abrir-explorador-arquivos-excel');
      const data = await resp.json();
      const incoming = Array.isArray(data?.caminhos)
        ? data.caminhos.filter((item: unknown) => typeof item === 'string' && item.trim()) as string[]
        : [];

      if (incoming.length === 0) {
        addLog('Nenhum arquivo selecionado.');
        return;
      }

      const merged = Array.from(new Set([...selectedFiles, ...incoming]));
      setSelectedFiles(merged);
      addLog(`${incoming.length} arquivo(s) adicionado(s). Total: ${merged.length}.`);
    } catch {
      addLog('Falha ao abrir o seletor de arquivos.');
    } finally {
      setIsPickingFiles(false);
    }
  };

  const handlePickOutputDir = async () => {
    setIsPickingDir(true);
    try {
      const resp = await fetch('/api/abrir-explorador-pastas');
      const data = await resp.json();
      if (typeof data?.caminho === 'string' && data.caminho.trim()) {
        setOutputDir(data.caminho);
        addLog(`Pasta de destino selecionada: ${data.caminho}`);
      } else {
        addLog('Selecao de pasta cancelada.');
      }
    } catch {
      addLog('Falha ao abrir o seletor de pasta.');
    } finally {
      setIsPickingDir(false);
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      setStatus('error');
      addLog('Selecione ao menos um arquivo antes de iniciar.');
      return;
    }

    if (!outputDir.trim()) {
      setStatus('error');
      addLog('Selecione a pasta de destino antes de iniciar.');
      return;
    }

    setIsConverting(true);
    setStatus('running');
    setOutputs([]);
    addLog('Iniciando conversao...');

    try {
      const resp = await fetch('/api/tools/extension-converter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: selectedFiles,
          outputDir,
          formatType,
          parquetMode,
          dbName,
        }),
      });

      const data = (await resp.json()) as ConverterResponse;
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      messages.forEach((msg) => addLog(msg));

      if (!resp.ok || !data?.success) {
        setStatus('error');
        if (data?.error) addLog(`Detalhe tecnico: ${data.error}`);
        return;
      }

      const produced = Array.isArray(data.outputs) ? data.outputs : [];
      setOutputs(produced);
      setStatus('success');
      addLog(`Conversao finalizada com sucesso. Arquivos gerados: ${produced.length}.`);
    } catch {
      setStatus('error');
      addLog('Erro inesperado ao comunicar com o backend.');
    } finally {
      setIsConverting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-800">Ferramentas</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Utilitarios internos para operacao e apoio rapido
        </p>
      </div>

      <section>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Menu de Ferramentas</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <Card
              onClick={() => setActiveTool('extension-converter')}
              className={cn(
                'p-4 min-h-[120px] border transition-all',
                activeTool === 'extension-converter'
                  ? 'border-blue-300 bg-blue-50/60 shadow-blue-200/40'
                  : 'border-slate-200 bg-white'
              )}
            >
              <div className="h-full flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-black text-slate-800 text-sm">Conversor de Extensoes</h4>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    Excel para Parquet ou SQLite
                  </p>
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-white/80 border border-slate-200 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-slate-500">
                    <Wrench size={11} />
                    Ferramenta ativa
                  </div>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg">
                  <FileSpreadsheet size={20} />
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </section>

      {activeTool === 'extension-converter' && (
        <Card className="p-5 md:p-6 bg-gradient-to-br from-white via-white to-slate-50/80">
          <div className="space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Conversor de Extensoes</h3>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Converte arquivos Excel (.xlsx/.xls/.xlsm) para Parquet ou SQLite.
                </p>
              </div>
              <div className={cn('inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-[11px] font-black uppercase tracking-widest', statusChip.className)}>
                {statusChip.icon}
                {statusChip.label}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <FileSpreadsheet size={15} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-600">Arquivos Excel</p>
                      <p className="text-[11px] font-semibold text-slate-400">Selecionados: {selectedFiles.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-9 px-3 text-[10px] rounded-xl"
                      onClick={handlePickFiles}
                      disabled={isPickingFiles || isConverting}
                    >
                      {isPickingFiles ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      <span className="ml-1">Adicionar</span>
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-9 px-3 text-[10px] rounded-xl"
                      onClick={() => {
                        setSelectedFiles([]);
                        addLog('Lista de arquivos limpa.');
                      }}
                      disabled={selectedFiles.length === 0 || isConverting}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 max-h-44 overflow-y-auto custom-scrollbar space-y-1">
                  {selectedFiles.length === 0 ? (
                    <p className="text-xs font-semibold text-slate-400">Nenhum arquivo selecionado.</p>
                  ) : (
                    selectedFiles.map((filePath, idx) => (
                      <div key={`${filePath}-${idx}`} className="text-[11px] font-semibold text-slate-600 truncate">
                        {filePath}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                      <FolderOpen size={15} />
                    </div>
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-600">Destino</p>
                      <p className="text-[11px] font-semibold text-slate-400">Pasta de saida da conversao</p>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    className="h-9 px-3 text-[10px] rounded-xl"
                    onClick={handlePickOutputDir}
                    disabled={isPickingDir || isConverting}
                  >
                    {isPickingDir ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                    <span className="ml-1">Selecionar</span>
                  </Button>
                </div>

                <input
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="Clique em selecionar para escolher a pasta"
                  className="w-full h-10 px-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                  disabled={isConverting}
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFormatType('parquet')}
                    disabled={isConverting}
                    className={cn(
                      'h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest border transition-all inline-flex items-center gap-2',
                      formatType === 'parquet'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                    )}
                  >
                    <FileArchive size={14} />
                    Parquet
                  </button>
                  <button
                    onClick={() => setFormatType('sqlite')}
                    disabled={isConverting}
                    className={cn(
                      'h-10 px-4 rounded-xl text-xs font-black uppercase tracking-widest border transition-all inline-flex items-center gap-2',
                      formatType === 'sqlite'
                        ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20'
                        : 'bg-white text-slate-500 border-slate-200 hover:border-blue-200 hover:text-blue-600'
                    )}
                  >
                    <Database size={14} />
                    SQLite
                  </button>
                </div>

                {formatType === 'parquet' ? (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Modo Parquet</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        onClick={() => setParquetMode('individual')}
                        disabled={isConverting}
                        className={cn(
                          'h-9 rounded-lg px-3 text-[11px] font-bold border transition-all',
                          parquetMode === 'individual'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        )}
                      >
                        1:1 por arquivo
                      </button>
                      <button
                        onClick={() => setParquetMode('merged')}
                        disabled={isConverting}
                        className={cn(
                          'h-9 rounded-lg px-3 text-[11px] font-bold border transition-all',
                          parquetMode === 'merged'
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
                        )}
                      >
                        Mesclar tudo (N:1)
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Nome do Banco</p>
                    <input
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      placeholder="database.db"
                      className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300"
                      disabled={isConverting}
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <Button
                onClick={handleConvert}
                disabled={isConverting}
                className="h-11 px-6 rounded-2xl text-[11px] uppercase tracking-[0.2em]"
              >
                {isConverting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                <span className="ml-2">Iniciar Conversao</span>
              </Button>

              {outputs.length > 0 && (
                <div className="text-[11px] font-bold text-slate-500">
                  {outputs.length} arquivo(s) de saida gerado(s)
                </div>
              )}
            </div>

            {outputs.length > 0 && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Saidas Geradas</p>
                {outputs.map((item, idx) => (
                  <div key={`${item}-${idx}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl bg-white/90 border border-emerald-100 px-3 py-2">
                    <span className="text-[11px] font-semibold text-emerald-800 truncate">{item}</span>
                    <button
                      onClick={() => revealPath(item)}
                      className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 hover:text-emerald-900"
                    >
                      <FolderOpen size={13} />
                      Abrir no Explorer
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-4">
              <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-slate-50 p-4">
                <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Log de Execucao</p>
                    <div className="mt-1 flex items-center gap-2 text-xs font-bold text-slate-600">
                      <Clock3 size={13} className="text-slate-400" />
                      {lastLog ? `Ultima atualizacao: ${lastLog.timestamp}` : 'Sem eventos recentes'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600">
                      {parsedLogs.length} eventos
                    </span>
                    <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-700">
                      ok {logCounters.success}
                    </span>
                    <span className="inline-flex items-center rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                      alerta {logCounters.warning}
                    </span>
                    <span className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-rose-700">
                      erro {logCounters.error}
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogs(['[Pronto] Log reiniciado.'])}
                      className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 transition-colors hover:bg-slate-50"
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-white to-transparent" />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-gradient-to-t from-white to-transparent" />

                  <div ref={logViewportRef} className="max-h-64 overflow-y-auto custom-scrollbar space-y-2 px-1 py-1">
                    {parsedLogs.map((entry, idx) => {
                      const meta = LOG_LEVEL_META[entry.level];
                      return (
                        <motion.div
                          key={`${entry.raw}-${idx}`}
                          initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                          transition={{ duration: 0.24, ease: 'easeOut', delay: Math.min(idx * 0.012, 0.18) }}
                          className={cn('rounded-xl border px-3 py-2 backdrop-blur-sm transition-all hover:shadow-sm', meta.containerClass)}
                        >
                          <div className="flex items-start gap-2.5">
                            <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', meta.iconClass)}>
                              {meta.icon}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{meta.label}</span>
                                <span className="text-[10px] font-black text-slate-400">{entry.timestamp}</span>
                              </div>

                              <p className={cn('mt-0.5 break-words text-xs font-semibold leading-relaxed', meta.textClass)}>
                                {entry.message}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2 text-[11px] font-semibold text-blue-800">
                  <div className="inline-flex items-center gap-1.5">
                    <MessageSquareText size={13} />
                    Dica: o log mostra passos em tempo real para facilitar entendimento do processo de conversao.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ToolsView;
