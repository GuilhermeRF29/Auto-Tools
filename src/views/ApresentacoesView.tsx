import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Database,
  Download,
  FolderOpen,
  Gauge,
  RefreshCw,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'motion/react';
import { pickDirectory } from '../utils/nativeDialogs';
import Card from '../components/Card';
import Button from '../components/Button';
import CustomDatePicker from '../components/CustomDatePicker';

const DEFAULT_REVENUE_BASE_DIR = 'Z:\\DASH REVENUE APPLICATION\\BASE';
const STORAGE_KEY = 'autotools:revenueBaseDir';
const REVENUE_CACHE_TTL_MS = 10 * 60 * 1000;
const REVENUE_CACHE_STALE_MS = 90 * 1000;

const CHART_COLORS = {
  aprovado: '#0f766e',
  reprovado: '#b91c1c',
  outros: '#64748b',
  linePrimary: '#1d4ed8',
  lineSecondary: '#f59e0b',
  accent: '#14b8a6',
  accentSoft: '#67e8f9',
};

type RevenuePayload = {
  meta: {
    baseDir: string;
    requestedBaseDir: string;
    selectedPeriod: { startDate: string; endDate: string };
    filesRead: number;
    records: number;
    warnings: string[];
  };
  kpis: {
    totalRegistros: number;
    aprovados: number;
    reprovados: number;
    taxaAprovacao: number;
    totalRevenueAplicado: number;
    mediaRevenueAplicado: number;
    advpMedio: number;
  };
  series: {
    revenueAplicadoPorDia: Array<{ date: string; dia: string; aprovado: number; reprovado: number; outros: number; total: number }>;
    totalRevenueAplicado: Array<{ label: string; value: number }>;
    advpStatus: Array<{ advp: string; aprovado: number; reprovado: number; outros: number; total: number }>;
    evolucaoTmXAdvp: Array<{ advp: string; minRevenue: number; tmRevenue: number; total: number; aprovado: number; reprovado: number }>;
    revenuePorCanal: Array<{ canal: string; aprovado: number; reprovado: number; outros: number; total: number }>;
    faixaQtdPercentual: Array<{ faixa: string; qtdAdvp: number; percentualTotal: number; mediaRevenueAplicado: number }>;
    aproveitamentoAplicacao: Array<{ status: string; total: number }>;
    justificativa: Array<{ justificativa: string; aprovado: number; reprovado: number; outros: number; total: number }>;
    analistaIndicador: Array<{ analista: string; aumentou: number; diminuiu: number; igual: number; outros: number; total: number }>;
    rotasAplicadas: Array<{ rota: string; total: number; mediaRevenueAplicado: number }>;
  };
};

type RevenueCacheEntry = {
  payload: RevenuePayload;
  fetchedAt: number;
};

const revenuePayloadCache = new Map<string, RevenueCacheEntry>();

type ValueFormatter = (value: number, name: string) => string;

const toIsoDate = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const buildRevenueCacheKey = (startDate: Date, endDate: Date, baseDir: string) =>
  `${toIsoDate(startDate)}|${toIsoDate(endDate)}|${(baseDir || '').trim()}`;

const getRevenueCache = (key: string) => {
  const entry = revenuePayloadCache.get(key);
  if (!entry) return null;

  const age = Date.now() - entry.fetchedAt;
  if (age > REVENUE_CACHE_TTL_MS) {
    revenuePayloadCache.delete(key);
    return null;
  }

  return entry;
};

const setRevenueCache = (key: string, payload: RevenuePayload) => {
  revenuePayloadCache.set(key, { payload, fetchedAt: Date.now() });
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(value || 0);

const formatInteger = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value || 0);

const formatPercent = (value: number) => `${(value || 0).toFixed(2)}%`;

const renderSolidActiveShape = (props: any) => {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
      fillOpacity={1}
      stroke={fill}
      strokeWidth={1}
    />
  );
};

const CustomTooltip = ({ active, payload, label, valueFormatter }: { active?: boolean; payload?: any[]; label?: string; valueFormatter?: ValueFormatter }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">{label}</p>
      {payload.map((entry: any) => {
        const value = Number(entry.value || 0);
        const display = typeof valueFormatter === 'function' ? valueFormatter(value, String(entry.name || '')) : formatInteger(value);
        return (
          <p key={`${entry.name}-${entry.dataKey}`} className="text-xs font-bold" style={{ color: entry.color || '#0f172a' }}>
            {entry.name}: {display}
          </p>
        );
      })}
    </div>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex h-[220px] items-center justify-center text-center text-sm font-bold text-slate-400">
    {text}
  </div>
);

const SectionTitle = ({ icon, title, subtitle, rightSlot }: { icon: ReactNode; title: string; subtitle?: string; rightSlot?: ReactNode }) => (
  <div className="mb-4 flex items-start justify-between gap-3">
    <div className="flex items-center gap-3">
      <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700 shadow-sm">{icon}</div>
      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">{title}</h3>
        {subtitle && <p className="text-xs font-semibold text-slate-400">{subtitle}</p>}
      </div>
    </div>
    {rightSlot}
  </div>
);

const ModeToggle = ({ mode, onChange }: { mode: 'numero' | 'percentual'; onChange: (next: 'numero' | 'percentual') => void }) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px] font-black">
    <button
      type="button"
      onClick={() => onChange('numero')}
      className={`rounded-lg px-2.5 py-1 transition-colors ${mode === 'numero' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}
    >
      Numero
    </button>
    <button
      type="button"
      onClick={() => onChange('percentual')}
      className={`rounded-lg px-2.5 py-1 transition-colors ${mode === 'percentual' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}
    >
      %
    </button>
  </div>
);

const GranularityToggle = ({ value, onChange }: { value: 'diario' | 'mensal'; onChange: (next: 'diario' | 'mensal') => void }) => (
  <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-[11px] font-black">
    <button
      type="button"
      onClick={() => onChange('diario')}
      className={`rounded-lg px-2.5 py-1 transition-colors ${value === 'diario' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}
    >
      Diario
    </button>
    <button
      type="button"
      onClick={() => onChange('mensal')}
      className={`rounded-lg px-2.5 py-1 transition-colors ${value === 'mensal' ? 'bg-white text-cyan-700 shadow-sm' : 'text-slate-500'}`}
    >
      Mensal
    </button>
  </div>
);

const FixedLegend = ({ items }: { items: Array<{ label: string; color: string; marker?: 'dot' | 'bar' | 'line' }> }) => (
  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
    {items.map((item) => (
      <div key={item.label} className="flex items-center gap-2 text-xs font-black text-slate-500">
        {item.marker === 'line' ? (
          <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
        ) : item.marker === 'bar' ? (
          <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: item.color }} />
        ) : (
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
        )}
        {item.label}
      </div>
    ))}
  </div>
);

const ApresentacoesView = () => {
  const now = new Date();
  const initialStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [startDate, setStartDate] = useState<Date>(initialStart);
  const [endDate, setEndDate] = useState<Date>(now);
  const [baseDir, setBaseDir] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_REVENUE_BASE_DIR);
  const [baseDirDraft, setBaseDirDraft] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_REVENUE_BASE_DIR);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<RevenuePayload | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [exporting, setExporting] = useState(false);
  const [revenueAppliedMode, setRevenueAppliedMode] = useState<'numero' | 'percentual'>('numero');
  const [revenueAppliedGranularity, setRevenueAppliedGranularity] = useState<'diario' | 'mensal'>('diario');
  const [totalRevenueMode, setTotalRevenueMode] = useState<'numero' | 'percentual'>('numero');

  const dayWatcherRef = useRef<string>(new Date().toDateString());
  const activeRequestRef = useRef<AbortController | null>(null);

  const refreshData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const requestKey = buildRevenueCacheKey(startDate, endDate, baseDir);
    const cached = getRevenueCache(requestKey);

    if (cached && !force) {
      setPayload(cached.payload);
      setLastRefresh(new Date(cached.fetchedAt));
      setError(null);

      const age = Date.now() - cached.fetchedAt;
      if (age <= REVENUE_CACHE_STALE_MS) {
        setLoading(false);
        return;
      }
    }

    const shouldBlockUi = force || !cached;
    if (shouldBlockUi) {
      setLoading(true);
    }
    setError(null);

    if (activeRequestRef.current) {
      activeRequestRef.current.abort();
    }
    const controller = new AbortController();
    activeRequestRef.current = controller;
    const requestStartedAt = Date.now();

    try {
      const params = new URLSearchParams({
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate),
      });

      if (baseDir.trim()) {
        params.set('baseDir', baseDir.trim());
      }
      if (force) {
        params.set('noCache', '1');
      }

      const response = await fetch(`/api/revenue-dashboard?${params.toString()}`, { signal: controller.signal });
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || 'Falha ao carregar dados de Revenue.');
      }

      const parsed = json as RevenuePayload;
      setRevenueCache(requestKey, parsed);
      setPayload(parsed);
      setLastRefresh(new Date());
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        return;
      }
      setError(err?.message || 'Falha desconhecida ao atualizar dashboard.');
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
      if (shouldBlockUi) {
        if (force) {
          const elapsed = Date.now() - requestStartedAt;
          const minSpinMs = 450;
          if (elapsed < minSpinMs) {
            await new Promise((resolve) => window.setTimeout(resolve, minSpinMs - elapsed));
          }
        }
        setLoading(false);
      }
    }
  }, [startDate, endDate, baseDir]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  useEffect(() => {
    return () => {
      if (activeRequestRef.current) {
        activeRequestRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (activeRequestRef.current) {
        return;
      }

      const currentDay = new Date().toDateString();
      if (dayWatcherRef.current !== currentDay) {
        dayWatcherRef.current = currentDay;
        refreshData();
      }
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [refreshData]);

  const handleApplyBaseDir = () => {
    const normalized = baseDirDraft.trim() || DEFAULT_REVENUE_BASE_DIR;
    setBaseDir(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
  };

  const handleChooseFolder = async () => {
    try {
      const path = await pickDirectory();
      if (path) {
        setBaseDirDraft(path);
        setBaseDir(path);
        localStorage.setItem(STORAGE_KEY, path);
      }
    } catch (error) {
      // Silencioso: usuario ainda pode informar o diretorio manualmente.
    }
  };

  const handleDownloadTreatedData = useCallback(async () => {
    if (exporting) return;

    setExporting(true);
    try {
      const params = new URLSearchParams({
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate),
        baseDir,
      });

      const response = await fetch(`/api/revenue-dashboard-export?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Falha ao gerar exportacao.');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const filename = filenameMatch?.[1] || `revenue_tratado_${toIsoDate(startDate)}_${toIsoDate(endDate)}.xlsx`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError('Nao foi possivel exportar os dados tratados em Excel.');
    } finally {
      setExporting(false);
    }
  }, [baseDir, endDate, exporting, startDate]);

  const daySeries = payload?.series.revenueAplicadoPorDia || [];
  const totalGauge = payload?.series.totalRevenueAplicado || [];
  const advpStatus = payload?.series.advpStatus || [];
  const evolucaoTm = payload?.series.evolucaoTmXAdvp || [];
  const porCanal = payload?.series.revenuePorCanal || [];
  const faixa = payload?.series.faixaQtdPercentual || [];
  const aproveitamento = payload?.series.aproveitamentoAplicacao || [];
  const justificativas = payload?.series.justificativa || [];
  const analistaIndicador = payload?.series.analistaIndicador || [];
  const rotas = payload?.series.rotasAplicadas || [];

  const pieColors = useMemo(
    () => ['#0f766e', '#b91c1c', '#0369a1', '#7c3aed', '#475569', '#ea580c', '#0f172a'],
    []
  );

  const daySeriesBase = useMemo(() => {
    if (revenueAppliedGranularity === 'mensal') {
      const monthMap = new Map<string, { date: string; dia: string; eixoX: string; aprovado: number; reprovado: number; outros: number; total: number }>();
      const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

      daySeries.forEach((item) => {
        const monthKey = String(item.date || '').slice(0, 7);
        if (!monthKey || monthKey.length < 7) return;

        const [year, month] = monthKey.split('-');
        const monthDate = new Date(Number(year), Number(month) - 1, 1);
        const monthLabel = monthFormatter.format(monthDate);

        const current = monthMap.get(monthKey) || {
          date: `${monthKey}-01`,
          dia: monthLabel,
          eixoX: monthLabel,
          aprovado: 0,
          reprovado: 0,
          outros: 0,
          total: 0,
        };

        current.aprovado += Number(item.aprovado || 0);
        current.reprovado += Number(item.reprovado || 0);
        current.outros += Number(item.outros || 0);
        current.total += Number(item.total || 0);
        monthMap.set(monthKey, current);
      });

      return Array.from(monthMap.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, value]) => value);
    }

    return daySeries.map((item) => ({ ...item, eixoX: item.dia }));
  }, [daySeries, revenueAppliedGranularity]);

  const daySeriesDisplay = useMemo(() => {
    if (revenueAppliedMode === 'numero') return daySeriesBase;

    return daySeriesBase.map((item) => {
      const total = item.total || 0;
      const calcPct = (value: number) => (total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0);
      return {
        ...item,
        aprovado: calcPct(item.aprovado),
        reprovado: calcPct(item.reprovado),
        outros: calcPct(item.outros),
      };
    });
  }, [daySeriesBase, revenueAppliedMode]);

  const totalGaugeDisplay = useMemo(() => {
    if (totalRevenueMode === 'numero') return totalGauge;
    const total = totalGauge.reduce((acc, item) => acc + item.value, 0);
    return totalGauge.map((item) => ({
      ...item,
      value: total > 0 ? Number(((item.value / total) * 100).toFixed(2)) : 0,
    }));
  }, [totalGauge, totalRevenueMode]);

  const revenueCanalTotal = useMemo(
    () => porCanal.map((item) => ({ canal: item.canal, total: item.total })),
    [porCanal]
  );

  const advpWidth = Math.max(960, advpStatus.length * 38);
  const tmWidth = Math.max(860, evolucaoTm.length * 36);

  const rotasResumo = useMemo(() => {
    const totalContagem = rotas.reduce((acc, item) => acc + Number(item.total || 0), 0);
    const mediaGlobal = Number(payload?.kpis?.mediaRevenueAplicado || 0);
    return {
      totalContagem,
      mediaGeral: totalContagem > 0 ? mediaGlobal : 0,
    };
  }, [payload?.kpis?.mediaRevenueAplicado, rotas]);

  const aprovadosPercentual = useMemo(() => {
    const total = Number(payload?.kpis.totalRegistros || 0);
    const aprovados = Number(payload?.kpis.aprovados || 0);
    return total > 0 ? (aprovados / total) * 100 : 0;
  }, [payload?.kpis.aprovados, payload?.kpis.totalRegistros]);

  const reprovadosPercentual = useMemo(() => {
    const total = Number(payload?.kpis.totalRegistros || 0);
    const reprovados = Number(payload?.kpis.reprovados || 0);
    return total > 0 ? (reprovados / total) * 100 : 0;
  }, [payload?.kpis.reprovados, payload?.kpis.totalRegistros]);

  const faixaTabela = useMemo(
    () => {
      const orderMap = new Map<string, number>([
        ['0', 0],
        ['01 A 07', 1],
        ['08 A 15', 2],
        ['16 A 22', 3],
        ['23 A 30', 4],
        ['31 A 60', 5],
        ['60+', 6],
      ]);

      return [...faixa].sort((a, b) => {
        const rankA = orderMap.get(String(a.faixa || '').trim()) ?? Number.MAX_SAFE_INTEGER;
        const rankB = orderMap.get(String(b.faixa || '').trim()) ?? Number.MAX_SAFE_INTEGER;
        if (rankA !== rankB) return rankA - rankB;
        return String(a.faixa || '').localeCompare(String(b.faixa || ''));
      });
    },
    [faixa]
  );

  const faixaResumo = useMemo(() => {
    const totalQtd = faixa.reduce((acc, item) => acc + Number(item.qtdAdvp || 0), 0);
    const totalPercentual = totalQtd > 0 ? 100 : 0;
    const mediaGlobal = Number(payload?.kpis?.mediaRevenueAplicado || 0);
    return {
      totalQtd,
      totalPercentual,
      mediaGeral: totalQtd > 0 ? mediaGlobal : 0,
    };
  }, [faixa, payload?.kpis?.mediaRevenueAplicado]);

  const percentualFormatter: ValueFormatter = (value) => `${value.toFixed(2)}%`;
  const numeroFormatter: ValueFormatter = (value) => formatInteger(value);

  return (
    <div className="relative space-y-6 pb-8">
      <div className="pointer-events-none absolute -left-24 -top-14 h-56 w-56 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-24 h-60 w-60 rounded-full bg-blue-300/25 blur-3xl" />

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white shadow-2xl"
      >
        <div className="absolute -right-20 -top-20 h-56 w-56 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="absolute -bottom-20 left-16 h-44 w-44 rounded-full bg-blue-400/20 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
              <BarChart3 size={12} /> Revenue Application
            </div>
            <h2 className="text-3xl font-black uppercase tracking-[0.08em]">Apresentacoes Revenue</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-200">
              Painel analitico com dados tratados do EBUS, atualizado por intervalo de Data Aplicacao.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Arquivos lidos</p>
              <p className="mt-1 text-2xl font-black">{formatInteger(payload?.meta.filesRead || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Registros</p>
              <p className="mt-1 text-2xl font-black">{formatInteger(payload?.kpis.totalRegistros || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Taxa aprovacao</p>
              <p className="mt-1 text-2xl font-black">{formatPercent(payload?.kpis.taxaAprovacao || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Atualizado</p>
              <p className="mt-1 text-sm font-black">{lastRefresh ? lastRefresh.toLocaleTimeString('pt-BR') : '--:--'}</p>
            </div>
          </div>
        </div>
      </motion.section>

      <Card className="relative z-40 overflow-visible border-slate-200 bg-white/90 p-4 sm:p-5">
        <SectionTitle
          icon={<CalendarDays size={16} />}
          title="Filtro de datas"
          subtitle="Unico filtro de negocio desta tela"
          rightSlot={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                className="h-[44px] border-cyan-200 px-4 text-cyan-700 hover:bg-cyan-50"
                onClick={handleDownloadTreatedData}
                disabled={loading || exporting}
              >
                <Download size={15} className={`mr-2 ${exporting ? 'animate-pulse' : ''}`} />
                {exporting ? 'Gerando...' : 'Baixar dados'}
              </Button>
              <Button className="h-[44px] bg-cyan-600 px-4 hover:bg-cyan-700" onClick={() => refreshData({ force: true })} disabled={loading || exporting}>
                <RefreshCw size={15} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          }
        />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <CustomDatePicker
              label="Data inicial"
              value={startDate}
              onChange={(next: Date) => {
                setStartDate(next);
                if (next > endDate) setEndDate(next);
              }}
            />
          </div>

          <div className="lg:col-span-3">
            <CustomDatePicker
              label="Data final"
              value={endDate}
              onChange={(next: Date) => {
                setEndDate(next);
                if (next < startDate) setStartDate(next);
              }}
            />
          </div>

          <div className="lg:col-span-6">
            <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Diretorio da base</label>
            <div className="mt-1.5 flex items-center gap-3">
              <input
                value={baseDirDraft}
                onChange={(e) => setBaseDirDraft(e.target.value)}
                placeholder={DEFAULT_REVENUE_BASE_DIR}
                className="h-[54px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-cyan-500"
              />
              <button
                onClick={handleChooseFolder}
                className="inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-500 transition-colors hover:border-cyan-200 hover:text-cyan-700"
                title="Selecionar pasta"
              >
                <FolderOpen size={18} />
              </button>
              <Button variant="secondary" className="h-[54px] min-w-[160px] border-cyan-200 px-4 text-cyan-700" onClick={handleApplyBaseDir}>
                <Database size={16} className="mr-2" />
                Aplicar pasta
              </Button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            <AlertTriangle size={14} className="mt-0.5" />
            {error}
          </div>
        )}

        {(payload?.meta.warnings || []).length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">Avisos de leitura</p>
            <div className="space-y-1">
              {(payload?.meta.warnings || []).map((warning) => (
                <p key={warning} className="text-xs font-semibold text-amber-700">
                  {warning}
                </p>
              ))}
            </div>
          </div>
        )}
      </Card>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-600">Total Revenue Aplicado</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatInteger(payload?.kpis.totalRegistros || 0)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Contagem total no periodo selecionado</p>
        </Card>

        <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Aprovado</p>
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(aprovadosPercentual)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Percentual do total de registros</p>
        </Card>

        <Card className="border-rose-100 bg-gradient-to-br from-rose-50 to-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700">Reprovado</p>
            <XCircle size={16} className="text-rose-600" />
          </div>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(reprovadosPercentual)}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Percentual do total de registros</p>
        </Card>

        <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">ADVP medio</p>
            <Gauge size={16} className="text-blue-600" />
          </div>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatInteger(Math.round(payload?.kpis.advpMedio || 0))}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Data Viagem - Data Aplicacao</p>
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8 p-5">
          <SectionTitle
            icon={<BarChart3 size={16} />}
            title="Revenue aplicado"
            subtitle={revenueAppliedGranularity === 'mensal' ? 'Visao mensal | Eixo Y: aprovado e reprovado' : 'Visao diaria | Eixo Y: aprovado e reprovado'}
            rightSlot={
              <div className="flex flex-wrap items-center gap-2">
                <GranularityToggle value={revenueAppliedGranularity} onChange={setRevenueAppliedGranularity} />
                <ModeToggle mode={revenueAppliedMode} onChange={setRevenueAppliedMode} />
              </div>
            }
          />
          {daySeriesBase.length === 0 ? (
            <EmptyState text="Sem dados para o periodo atual." />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={daySeriesDisplay}
                  margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                  barGap={revenueAppliedGranularity === 'mensal' ? -1 : 4}
                  barCategoryGap={revenueAppliedGranularity === 'mensal' ? '70%' : '20%'}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="eixoX" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis domain={revenueAppliedMode === 'percentual' ? [0, 100] : undefined} tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltip valueFormatter={revenueAppliedMode === 'percentual' ? percentualFormatter : numeroFormatter} />} />
                  <Legend />
                  <Bar
                    dataKey="aprovado"
                    name="Aprovado"
                    stackId={revenueAppliedGranularity === 'mensal' ? undefined : 'status'}
                    barSize={revenueAppliedGranularity === 'mensal' ? 44 : undefined}
                    maxBarSize={revenueAppliedGranularity === 'mensal' ? 44 : 56}
                    fill={CHART_COLORS.aprovado}
                    radius={[6, 6, 0, 0]}
                  />
                  <Bar
                    dataKey="reprovado"
                    name="Reprovado"
                    stackId={revenueAppliedGranularity === 'mensal' ? undefined : 'status'}
                    barSize={revenueAppliedGranularity === 'mensal' ? 44 : undefined}
                    maxBarSize={revenueAppliedGranularity === 'mensal' ? 44 : 56}
                    fill={CHART_COLORS.reprovado}
                    radius={[6, 6, 0, 0]}
                  />
                  {revenueAppliedGranularity !== 'mensal' && (
                    <Bar
                      dataKey="outros"
                      name="Outros"
                      stackId="status"
                      maxBarSize={56}
                      fill={CHART_COLORS.outros}
                      radius={[6, 6, 0, 0]}
                    />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4 p-5">
          <SectionTitle icon={<Gauge size={16} />} title="Faixa Qtd. % R$" subtitle="Mapa Faixa, contagem, percentual e media Revenue" />
          {faixa.length === 0 ? (
            <EmptyState text="Sem dados para mapa de faixas." />
          ) : (
            <div className="max-h-[360px] overflow-auto rounded-2xl border border-slate-100 custom-scrollbar">
              <table className="w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Faixa</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Qtd</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">% Total</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">R$ Medio</th>
                  </tr>
                </thead>
                <tbody>
                  {faixaTabela.map((item) => (
                    <tr key={item.faixa} className="odd:bg-white even:bg-slate-50/60">
                      <td className="px-3 py-2 text-xs font-black text-slate-700">{item.faixa}</td>
                      <td className="px-3 py-2 text-xs font-black text-slate-700">{formatInteger(item.qtdAdvp)}</td>
                      <td className={`px-3 py-2 text-xs font-black ${item.percentualTotal >= 30 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatPercent(item.percentualTotal)}</td>
                      <td className="px-3 py-2 text-xs font-black text-slate-700">{formatCurrency(item.mediaRevenueAplicado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-cyan-50">
                  <tr>
                    <td className="px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-700">Total</td>
                    <td className="px-3 py-2 text-xs font-black text-cyan-800">{formatInteger(faixaResumo.totalQtd)}</td>
                    <td className="px-3 py-2 text-xs font-black text-cyan-800">{formatPercent(faixaResumo.totalPercentual)}</td>
                    <td className="px-3 py-2 text-xs font-black text-cyan-800">{formatCurrency(faixaResumo.mediaGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8 p-5">
          <SectionTitle
            icon={<TrendingUp size={16} />}
            title="Evolucao TM x ADVP"
            subtitle="X: ADVP | Y: Preco minimo e TM do Revenue Aplicado"
          />
          {evolucaoTm.length === 0 ? (
            <EmptyState text="Sem pontos para evolucao TM x ADVP." />
          ) : (
            <>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div className="h-[320px]" style={{ width: `${tmWidth}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={evolucaoTm} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="advp" tick={{ fontSize: 10, fontWeight: 700 }} interval={0} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                      <Tooltip content={<CustomTooltip valueFormatter={numeroFormatter} />} />
                      <Bar dataKey="total" name="Contagem" fill={CHART_COLORS.accentSoft} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="tmRevenue" name="TM" stroke={CHART_COLORS.linePrimary} strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="minRevenue" name="Preco minimo" stroke={CHART_COLORS.lineSecondary} strokeWidth={2.5} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <FixedLegend
                items={[
                  { label: 'Contagem', color: CHART_COLORS.accentSoft, marker: 'bar' },
                  { label: 'TM', color: CHART_COLORS.linePrimary, marker: 'line' },
                  { label: 'Preco minimo', color: CHART_COLORS.lineSecondary, marker: 'line' },
                ]}
              />
            </>
          )}
        </Card>

        <Card className="xl:col-span-4 p-5">
          <SectionTitle
            icon={<TrendingUp size={16} />}
            title="Total revenue aplicado"
            subtitle="Aprovado x Reprovado"
            rightSlot={<ModeToggle mode={totalRevenueMode} onChange={setTotalRevenueMode} />}
          />
          {totalGauge.length === 0 ? (
            <EmptyState text="Sem base para o grafico." />
          ) : (
            <div className="relative h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={totalGaugeDisplay}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={78}
                    outerRadius={112}
                    paddingAngle={2}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                    activeShape={renderSolidActiveShape}
                  >
                    {totalGaugeDisplay.map((_, idx) => (
                      <Cell key={`g-${idx}`} fill={pieColors[idx % pieColors.length]} fillOpacity={1} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip valueFormatter={totalRevenueMode === 'percentual' ? percentualFormatter : numeroFormatter} />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Registros</p>
                  <p className="text-4xl font-black text-slate-800">{formatInteger(payload?.kpis.totalRegistros || 0)}</p>
                </div>
              </div>
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5">
        <Card className="p-5">
          <SectionTitle icon={<Gauge size={16} />} title="ADVP" subtitle="X: ADVP | Y: Contagem | Legenda: Status Revenue" />
          {advpStatus.length === 0 ? (
            <EmptyState text="Sem dados de ADVP no periodo." />
          ) : (
            <>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div className="h-[360px]" style={{ width: `${advpWidth}px` }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={advpStatus} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="advp" tick={{ fontSize: 10, fontWeight: 700 }} interval={0} />
                      <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="aprovado" name="Aprovado" fill={CHART_COLORS.aprovado} />
                      <Bar dataKey="reprovado" name="Reprovado" fill={CHART_COLORS.reprovado} />
                      <Bar dataKey="outros" name="Outros" fill={CHART_COLORS.outros} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <FixedLegend
                items={[
                  { label: 'Aprovado', color: CHART_COLORS.aprovado },
                  { label: 'Reprovado', color: CHART_COLORS.reprovado },
                  { label: 'Outros', color: CHART_COLORS.outros },
                ]}
              />
            </>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7 p-5">
          <SectionTitle icon={<BarChart3 size={16} />} title="Revenue por canal venda" subtitle="Participacao total por canal" />
          {revenueCanalTotal.length === 0 ? (
            <EmptyState text="Sem canais no recorte selecionado." />
          ) : (
            <div className="flex h-[320px] gap-4">
              <div className="min-w-0 flex-[1.1]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={revenueCanalTotal}
                      dataKey="total"
                      nameKey="canal"
                      innerRadius={72}
                      outerRadius={112}
                      stroke="none"
                      startAngle={90}
                      endAngle={-270}
                      activeShape={renderSolidActiveShape}
                    >
                      {revenueCanalTotal.map((_, idx) => (
                        <Cell key={`canal-${idx}`} fill={pieColors[idx % pieColors.length]} fillOpacity={1} />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip valueFormatter={numeroFormatter} />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="w-[240px] shrink-0 overflow-y-auto pr-1 custom-scrollbar">
                <div className="space-y-2">
                  {revenueCanalTotal.map((item, idx) => (
                    <div key={item.canal} className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-2.5 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: pieColors[idx % pieColors.length] }} />
                        <span className="truncate text-[11px] font-black text-slate-600" title={item.canal}>{item.canal}</span>
                      </div>
                      <span className="text-xs font-black text-slate-700">{formatInteger(item.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-5 p-5">
          <SectionTitle icon={<Gauge size={16} />} title="Aproveitamento aplicacao" subtitle="Status Revenue" />
          {aproveitamento.length === 0 ? (
            <EmptyState text="Sem distribuicao de status." />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={aproveitamento} dataKey="total" nameKey="status" innerRadius={68} outerRadius={108} stroke="none" startAngle={90} endAngle={-270}>
                    {aproveitamento.map((_, idx) => (
                      <Cell key={`s-${idx}`} fill={pieColors[idx % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8 p-5">
          <SectionTitle
            icon={<BarChart3 size={16} />}
            title="Revenue por analista x indicador"
            subtitle="X: Analista | Y: Contagem de status | Legenda: Indicador"
          />
          {analistaIndicador.length === 0 ? (
            <EmptyState text="Sem analistas para o intervalo selecionado." />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analistaIndicador} margin={{ top: 10, right: 20, left: 0, bottom: 26 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="analista" tick={{ fontSize: 10, fontWeight: 700 }} angle={-18} textAnchor="end" interval={0} height={64} />
                  <YAxis tick={{ fontSize: 11, fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="aumentou" name="Aumentou" stackId="i" fill="#15803d" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="igual" name="Igual" stackId="i" fill="#1d4ed8" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="diminuiu" name="Diminuiu" stackId="i" fill="#f97316" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="outros" name="Outros" stackId="i" fill="#64748b" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="xl:col-span-4 p-5">
          <SectionTitle icon={<BarChart3 size={16} />} title="Justificativa" subtitle="Contagem por justificativa" />
          {justificativas.length === 0 ? (
            <EmptyState text="Sem justificativas no periodo." />
          ) : (
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={justificativas} layout="vertical" margin={{ top: 10, right: 16, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fontWeight: 700 }} />
                  <YAxis type="category" dataKey="justificativa" width={96} tick={{ fontSize: 10, fontWeight: 700 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="aprovado" name="Aprovado" stackId="j" fill={CHART_COLORS.aprovado} radius={[0, 8, 8, 0]} />
                  <Bar dataKey="reprovado" name="Reprovado" stackId="j" fill={CHART_COLORS.reprovado} radius={[0, 8, 8, 0]} />
                  <Bar dataKey="outros" name="Outros" stackId="j" fill={CHART_COLORS.outros} radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-5">
        <Card className="p-5">
          <SectionTitle icon={<Database size={16} />} title="Qtd. rotas aplicadas" subtitle="Rota, contagem e media de Revenue aplicado" />
          {rotas.length === 0 ? (
            <EmptyState text="Sem rotas para exibir." />
          ) : (
            <div className="max-h-[460px] overflow-auto rounded-2xl border border-slate-100 custom-scrollbar">
              <table className="w-full border-separate border-spacing-0 text-left">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Rota</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Contagem</th>
                    <th className="px-3 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Media Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {rotas.map((item) => (
                    <tr key={item.rota} className="odd:bg-white even:bg-slate-50/50">
                      <td className="px-3 py-2 text-xs font-bold leading-snug text-slate-700 whitespace-normal break-words" title={item.rota}>{item.rota}</td>
                      <td className="px-3 py-2 text-xs font-black text-slate-700">{formatInteger(item.total)}</td>
                      <td className="px-3 py-2 text-xs font-black text-slate-700">{formatCurrency(item.mediaRevenueAplicado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 bg-cyan-50">
                  <tr>
                    <td className="px-3 py-2 text-xs font-black uppercase tracking-wider text-cyan-700">Totais</td>
                    <td className="px-3 py-2 text-xs font-black text-cyan-800">{formatInteger(rotasResumo.totalContagem)}</td>
                    <td className="px-3 py-2 text-xs font-black text-cyan-800">{formatCurrency(rotasResumo.mediaGeral)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs font-semibold text-slate-500 shadow-sm">
        <p>
          Base ativa: <span className="font-black text-slate-700">{payload?.meta.baseDir || baseDir}</span>
        </p>
        <p>
          Periodo: <span className="font-black text-slate-700">{toIsoDate(startDate)} ate {toIsoDate(endDate)}</span>
        </p>
      </div>
    </div>
  );
};

export default ApresentacoesView;
