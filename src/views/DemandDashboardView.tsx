import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Database,
  Filter,
  FolderOpen,
  Minus,
  Plus,
  RefreshCw,
  Download,
  AlertCircle,
  Clock,
  RotateCcw,
  Maximize2,
  Calendar,
  X,
  Target,
  BarChart4,
  LayoutDashboard,
  Search,
  Camera,
  Image as ImageIcon,
  Images,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';
import Card from '../components/Card';
import Button from '../components/Button';
import CustomSelect from '../components/CustomSelect';
import { cn } from '../utils/cn';
import { useDialog } from '../context/DialogContext';

const DEFAULT_DEMAND_BASE_DIR = 'Z:\\DASH DEMANDA\\BASE';

const WEEK_BUCKETS = ['0 a 07', '08 a 14', '15 a 21', '22 a 30', '31 a 59', '60+'] as const;
const HYBRID_BUCKETS = ['08 a 14', '15 a 21', '22 a 30', '31 a 59', '60+'] as const;
const META_BY_BUCKET: Record<string, number> = {
  TOTAL: 0.4,
  '0 a 07': 0.5,
  '08 a 14': 0.4,
  '15 a 21': 0.3,
  '22 a 30': 0.2,
  '31 a 59': 0.15,
  '60+': 0.05,
};

type DemandRow = {
  observationDate: string;
  travelDate: string;
  mercado: string;
  empresa: string;
  linha: string;
  ocupacao: number;
  capacidade: number;
  apv: number;
  advp: number;
  faixaAdvp: string;
};

type DemandPayload = {
  meta: {
    baseDir: string;
    requestedBaseDir: string;
    filesRead: number;
    records: number;
    warnings: string[];
    observationDates: string[];
    selectedObservationDate: string | null;
    historyObservationDate: string | null;
    defaultMarkets: string[];
    stats?: {
      totalRead: number;
      processed: number;
      skippedDate: number;
      skippedEmpty: number;
      skippedNoValues?: number;
      skippedAdvp: number;
      skippedDuplicated?: number;
    };
    marketCoverage?: {
      found: number;
      known: number;
      foundKnown?: number;
    };
  };
  travelDateOptions: Array<{ date: string; offset: number }>;
  defaultTravelDateSelection: string[];
  rows: DemandRow[];
  historyRows: DemandRow[];
  markets: string[];
  defaultSelectedMarkets: string[];
  companiesByMarket: Record<string, string[]>;
};

type Agg = { ocupacao: number; capacidade: number };

const formatInt = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value || 0));
const formatPercent = (value: number | null | undefined) => `${(((value || 0) * 100)).toFixed(2).replace('.', ',')}%`;
const formatDate = (iso: string) => {
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleDateString('pt-BR');
};

const addDaysToIso = (iso: string, days: number) => {
  const [year, month, day] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

const safeRatio = (agg: Agg | null | undefined) => {
  if (!agg || agg.capacidade <= 0) return null;
  return agg.ocupacao / agg.capacidade;
};

const addAgg = (target: Agg, row: DemandRow) => {
  target.ocupacao += Number(row.ocupacao || 0);
  target.capacidade += Number(row.capacidade || 0);
};

const emptyAgg = (): Agg => ({ ocupacao: 0, capacidade: 0 });

const bucketFromAdvp = (advp: number) => {
  if (advp < -1) return null;
  if (advp <= 7) return '0 a 07';
  if (advp <= 14) return '08 a 14';
  if (advp <= 21) return '15 a 21';
  if (advp <= 30) return '22 a 30';
  if (advp <= 59) return '31 a 59';
  return '60+';
};

const aggregateRows = (rows: DemandRow[]) => {
  const agg = emptyAgg();
  rows.forEach((row) => addAgg(agg, row));
  return agg;
};

const heatColor = (ratio: number | null) => {
  if (ratio === null || !Number.isFinite(ratio)) return '#f8fafc';
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = 2 + (clamped * 118);
  const saturation = 74;
  const lightness = 75 - ((1 - clamped) * 6);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
};

const buildHeatScale = (values: Array<number | null | undefined>) => {
  const finiteValues = values.filter((value): value is number => Number.isFinite(value as number));
  if (!finiteValues.length) return null;
  return {
    min: Math.min(...finiteValues),
    max: Math.max(...finiteValues),
  };
};

const heatColorByScale = (
  value: number | null | undefined,
  scale: { min: number; max: number } | null,
) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return '#f8fafc';
  if (!scale) return heatColor(value);
  if (scale.max === scale.min) return heatColor(0.5);
  const normalized = (value - scale.min) / (scale.max - scale.min);
  return heatColor(normalized);
};

const MultiSelect = ({
  label,
  options,
  selected,
  onToggle,
  onSelectAll,
  onClear,
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-1.5" ref={ref}>
      <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 py-3 text-left text-sm font-bold text-slate-700 shadow-sm transition-all',
            open ? 'border-blue-600 ring-4 ring-blue-500/10' : 'hover:border-slate-300',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{selected.size}/{options.length} selecionados</span>
            <ChevronDown size={16} className={cn('text-slate-400 transition-transform', open && 'rotate-180 text-blue-600')} />
          </div>
        </button>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute z-[700] mt-2 w-full rounded-2xl border-2 border-slate-100 bg-white p-2 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <button type="button" onClick={onSelectAll} className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800">
                Marcar todos
              </button>
              <button type="button" onClick={onClear} className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-700">
                Limpar
              </button>
            </div>
            <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
              {options.map((option) => {
                const isActive = selected.has(option.value);
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => onToggle(option.value)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors',
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]', isActive ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                      {isActive ? 'x' : ''}
                    </span>
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

const DemandDashboardView = () => {
  const { showAlert } = useDialog();
  const [payload, setPayload] = useState<DemandPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState<string>(() => localStorage.getItem('autotools:demandBaseDir') || DEFAULT_DEMAND_BASE_DIR);
  const [baseDirDraft, setBaseDirDraft] = useState<string>(() => localStorage.getItem('autotools:demandBaseDir') || DEFAULT_DEMAND_BASE_DIR);
  const [selectedObservationDate, setSelectedObservationDate] = useState<string>('');
  const [selectedTravelDates, setSelectedTravelDates] = useState<Set<string>>(new Set());
  const [selectedMarkets, setSelectedMarkets] = useState<Set<string>>(new Set());
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [refreshAt, setRefreshAt] = useState<Date | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [showRemovedDatesTable, setShowRemovedDatesTable] = useState(false);
  const [exportImageMode, setExportImageMode] = useState<'combined' | 'separate'>('combined');
  const tableRef = useRef<HTMLTableElement>(null);
  const removedTableRef = useRef<HTMLTableElement>(null);

  const lastObservationRef = useRef<string>('');
  const stats = payload?.meta?.stats || {};

  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const captureTableImage = async (tableEl: HTMLTableElement) => {
    const width = tableEl.scrollWidth;
    const height = tableEl.scrollHeight;

    const dataUrl = await toPng(tableEl, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      canvasWidth: width,
      canvasHeight: height,
      width,
      height,
    });

    const img = await loadImage(dataUrl);
    return { img, width, height, dataUrl };
  };

  const downloadDataUrl = (dataUrl: string, fileName: string) => {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = dataUrl;
    link.click();
  };

  const handleExportImage = async () => {
    if (!tableRef.current) return;

    try {
      const hasRemovedTableVisible = showRemovedDatesTable
        && removedDailyColumns.length > 0
        && !!removedTableRef.current;

      const shouldExportSeparate = exportImageMode === 'separate';
      const selectedDate = payload?.meta?.selectedObservationDate || 'sem_data';

      if (shouldExportSeparate) {
        if (hasRemovedTableVisible && removedTableRef.current) {
          const [hybrid, removed] = await Promise.all([
            captureTableImage(tableRef.current),
            captureTableImage(removedTableRef.current),
          ]);
          downloadDataUrl(hybrid.dataUrl, `tabela_hibrida_demanda_${selectedDate}.png`);
          downloadDataUrl(removed.dataUrl, `tabela_removidos_demanda_${selectedDate}.png`);
          return;
        }

        const hybrid = await captureTableImage(tableRef.current);
        downloadDataUrl(hybrid.dataUrl, `tabela_hibrida_demanda_${selectedDate}.png`);
        return;
      }

      let dataUrl = '';

      if (hasRemovedTableVisible && removedTableRef.current) {
        const [hybrid, removed] = await Promise.all([
          captureTableImage(tableRef.current),
          captureTableImage(removedTableRef.current),
        ]);

        const gap = 20;
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(hybrid.width, removed.width);
        canvas.height = hybrid.height + gap + removed.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Nao foi possivel gerar o canvas de exportacao.');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(hybrid.img, 0, 0, hybrid.width, hybrid.height);
        ctx.drawImage(removed.img, 0, hybrid.height + gap, removed.width, removed.height);

        dataUrl = canvas.toDataURL('image/png');
      } else {
        const single = await captureTableImage(tableRef.current);
        const canvas = document.createElement('canvas');
        canvas.width = single.width;
        canvas.height = single.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Nao foi possivel gerar o canvas de exportacao.');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(single.img, 0, 0, single.width, single.height);

        dataUrl = canvas.toDataURL('image/png');
      }

      const fileName = hasRemovedTableVisible
        ? `tabelas_demanda_${payload?.meta?.selectedObservationDate}.png`
        : `tabela_demanda_${payload?.meta?.selectedObservationDate}.png`;
      downloadDataUrl(dataUrl, fileName);
    } catch (err) {
      console.error('Erro ao exportar imagem:', err);
      await showAlert({
        title: 'Falha na Exportação',
        message: 'Infelizmente não conseguimos gerar a imagem desta vez. Tente novamente.',
        tone: 'danger',
      });
    }
  };

  const loadData = useCallback(async ({ force = false, observationDate }: { force?: boolean; observationDate?: string } = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (baseDir.trim()) params.set('baseDir', baseDir.trim());
      if (force) params.set('noCache', '1');
      if (observationDate || selectedObservationDate) {
        params.set('observationDate', observationDate || selectedObservationDate);
      }

      const response = await fetch(`/api/demand-dashboard?${params.toString()}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || 'Falha ao carregar dashboard de demanda.');
      }

      const nextPayload = json as DemandPayload;
      setPayload(nextPayload);
      setRefreshAt(new Date());

      const nextObservation = String(nextPayload.meta.selectedObservationDate || '');
      setSelectedObservationDate(nextObservation);

      const observationChanged = lastObservationRef.current !== nextObservation;
      lastObservationRef.current = nextObservation;

      if (observationChanged) {
        setSelectedTravelDates(new Set<string>(nextPayload.defaultTravelDateSelection || []));
        setSelectedMarkets(new Set<string>(nextPayload.defaultSelectedMarkets || []));
        setExpandedMarkets(new Set());
      } else {
        const validTravel = new Set((nextPayload.travelDateOptions || []).map((item) => item.date));
        setSelectedTravelDates((prev: Set<string>) => {
          const kept = [...prev].filter((date: string) => validTravel.has(date));
          return kept.length ? new Set<string>(kept) : new Set<string>(nextPayload.defaultTravelDateSelection || []);
        });

        const validMarkets = new Set(nextPayload.markets || []);
        setSelectedMarkets((prev: Set<string>) => {
          const kept = [...prev].filter((market: string) => validMarkets.has(market));
          return kept.length ? new Set<string>(kept) : new Set<string>(nextPayload.defaultSelectedMarkets || []);
        });
      }
    } catch (err: any) {
      setError(err?.message || 'Erro desconhecido ao atualizar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [baseDir, selectedObservationDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleChooseFolder = async () => {
    try {
      const response = await fetch('/api/abrir-explorador-pastas');
      const json = await response.json();
      if (json?.caminho) {
        setBaseDirDraft(json.caminho);
      }
    } catch {
      // Sem erro visual, usuario pode digitar manualmente.
    }
  };

  const handleApplyFolder = () => {
    const normalized = baseDirDraft.trim() || DEFAULT_DEMAND_BASE_DIR;
    setBaseDir(normalized);
    localStorage.setItem('autotools:demandBaseDir', normalized);
    setTimeout(() => {
      loadData({ force: true });
    }, 0);
  };

  const observationOptions = useMemo(
    () => (payload?.meta.observationDates || []).map((iso) => ({ label: formatDate(iso), value: iso })),
    [payload?.meta.observationDates],
  );

  const requestSort = (key: string) => {
    setSortConfig((prev) => {
      if (prev?.key === key && prev.direction === 'asc') return { key, direction: 'desc' };
      return { key, direction: 'asc' };
    });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig?.key !== key) return <ChevronDown size={12} className="ml-1 opacity-20" />;
    return sortConfig.direction === 'asc' ? <ChevronUp size={12} className="ml-1 text-blue-400" /> : <ChevronDown size={12} className="ml-1 text-blue-400" />;
  };

  const travelOptions = payload?.travelDateOptions || [];
  const travelOptionSet = useMemo(() => new Set(travelOptions.map((item) => item.date)), [travelOptions]);

  const filteredRows = useMemo(() => {
    const rows = payload?.rows || [];

    return rows.filter((row) => {
      if (!selectedMarkets.has(row.mercado)) return false;
      if (row.advp >= -1 && row.advp <= 60) {
        return selectedTravelDates.has(row.travelDate);
      }
      return true;
    });
  }, [payload?.rows, selectedMarkets, selectedTravelDates]);

  const filteredHistoryRows = useMemo(() => {
    const rows = payload?.historyRows || [];

    return rows.filter((row) => {
      if (!selectedMarkets.has(row.mercado)) return false;

      if (row.advp >= -1 && row.advp <= 60) {
        const observed = payload?.meta.selectedObservationDate ? new Date(`${payload.meta.selectedObservationDate}T00:00:00`) : null;
        const histObserved = payload?.meta.historyObservationDate ? new Date(`${payload.meta.historyObservationDate}T00:00:00`) : null;
        if (!observed || !histObserved) return true;

        const rowDate = new Date(`${row.travelDate}T00:00:00`);
        const offset = Math.round((rowDate.getTime() - histObserved.getTime()) / 86400000);
        const mappedDate = new Date(observed.getFullYear(), observed.getMonth(), observed.getDate() + offset);
        const mappedIso = mappedDate.toISOString().slice(0, 10);
        return selectedTravelDates.has(mappedIso);
      }

      return true;
    });
  }, [payload?.historyRows, payload?.meta.selectedObservationDate, payload?.meta.historyObservationDate, selectedMarkets, selectedTravelDates]);

  const marketFilteredRows = useMemo(() => {
    const rows = payload?.rows || [];
    return rows.filter((row) => selectedMarkets.has(row.mercado));
  }, [payload?.rows, selectedMarkets]);

  const marketFilteredHistoryRows = useMemo(() => {
    const rows = payload?.historyRows || [];
    return rows.filter((row) => selectedMarkets.has(row.mercado));
  }, [payload?.historyRows, selectedMarkets]);

  const travelDatesSorted = useMemo(() => {
    const dates = Array.from(new Set(marketFilteredRows.map((r) => r.travelDate)));
    return dates.sort();
  }, [marketFilteredRows]);

  const minTravelDate = travelDatesSorted[0];
  const maxTravelDate = travelDatesSorted[travelDatesSorted.length - 1];

  const totals = useMemo(() => aggregateRows(marketFilteredRows), [marketFilteredRows]);
  const apvTotal = safeRatio(totals) || 0;

  const apv7 = useMemo(() => {
    if (!minTravelDate) return 0;
    const startIso = minTravelDate;
    const endIso = addDaysToIso(startIso, 6);
    return safeRatio(aggregateRows(marketFilteredRows.filter((r) => r.travelDate >= startIso && r.travelDate <= endIso))) || 0;
  }, [marketFilteredRows, minTravelDate]);

  const apv14 = useMemo(() => {
    if (!minTravelDate) return 0;
    const startIso = addDaysToIso(minTravelDate, 7);
    const endIso = addDaysToIso(minTravelDate, 13);
    return safeRatio(aggregateRows(marketFilteredRows.filter((r) => r.travelDate >= startIso && r.travelDate <= endIso))) || 0;
  }, [marketFilteredRows, minTravelDate]);

  const apv21 = useMemo(() => {
    if (!maxTravelDate) return 0;
    const endIso = maxTravelDate;
    const startIso = addDaysToIso(endIso, -6);
    return safeRatio(aggregateRows(marketFilteredRows.filter((r) => r.travelDate >= startIso && r.travelDate <= endIso))) || 0;
  }, [marketFilteredRows, maxTravelDate]);

  const weekTable = useMemo(() => {
    const table = new Map<string, {
      market: string;
      buckets: Record<string, Agg>;
      total: Agg;
      companies: Map<string, { company: string; buckets: Record<string, Agg>; total: Agg }>;
    }>();

    marketFilteredRows.forEach((row) => {
      const bucket = bucketFromAdvp(row.advp);
      if (!bucket) return;

      if (!table.has(row.mercado)) {
        table.set(row.mercado, {
          market: row.mercado,
          buckets: Object.fromEntries(WEEK_BUCKETS.map((item) => [item, emptyAgg()])),
          total: emptyAgg(),
          companies: new Map(),
        });
      }

      const marketEntry = table.get(row.mercado)!;
      addAgg(marketEntry.buckets[bucket], row);
      addAgg(marketEntry.total, row);

      if (!marketEntry.companies.has(row.empresa)) {
        marketEntry.companies.set(row.empresa, {
          company: row.empresa,
          buckets: Object.fromEntries(WEEK_BUCKETS.map((item) => [item, emptyAgg()])),
          total: emptyAgg(),
        });
      }

      const companyEntry = marketEntry.companies.get(row.empresa)!;
      addAgg(companyEntry.buckets[bucket], row);
      addAgg(companyEntry.total, row);
    });

    const rows = Array.from(table.values()).sort((a, b) => {
      const selectedOrder = Array.from(selectedMarkets);
      if (sortConfig?.key === 'market') {
        const cmp = a.market.localeCompare(b.market);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      if (sortConfig?.key === 'total') {
        const cmp = (safeRatio(a.total) || 0) - (safeRatio(b.total) || 0);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      if (sortConfig && WEEK_BUCKETS.includes(sortConfig.key)) {
        const cmp = (safeRatio(a.buckets[sortConfig.key]) || 0) - (safeRatio(b.buckets[sortConfig.key]) || 0);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      return selectedOrder.indexOf(a.market) - selectedOrder.indexOf(b.market);
    });

    const totalByBucket: Record<string, Agg> = Object.fromEntries(WEEK_BUCKETS.map((item) => [item, emptyAgg()]));
    const grandTotal = emptyAgg();

    rows.forEach((row) => {
      WEEK_BUCKETS.forEach((bucket) => {
        totalByBucket[bucket].ocupacao += row.buckets[bucket].ocupacao;
        totalByBucket[bucket].capacidade += row.buckets[bucket].capacidade;
      });
      grandTotal.ocupacao += row.total.ocupacao;
      grandTotal.capacidade += row.total.capacidade;
    });

    return {
      rows,
      totalByBucket,
      grandTotal,
    };
  }, [marketFilteredRows, selectedMarkets, sortConfig]);

  const weekHeatScale = useMemo(() => {
    const values: Array<number | null> = [];

    weekTable.rows.forEach((line: { buckets: Record<string, Agg>; total: Agg }) => {
      WEEK_BUCKETS.forEach((bucket) => values.push(safeRatio(line.buckets[bucket])));
      values.push(safeRatio(line.total));
    });

    WEEK_BUCKETS.forEach((bucket) => values.push(safeRatio(weekTable.totalByBucket[bucket])));
    values.push(safeRatio(weekTable.grandTotal));

    return buildHeatScale(values);
  }, [weekTable]);

  const visibleTravelOptions = useMemo(
    () => travelOptions.filter((item) => selectedTravelDates.has(item.date)),
    [travelOptions, selectedTravelDates],
  );

  const removedTravelOptions = useMemo(
    () => travelOptions.filter((item) => !selectedTravelDates.has(item.date)),
    [travelOptions, selectedTravelDates],
  );

  const dailyColumns = useMemo(() => [...visibleTravelOptions].sort((a, b) => a.offset - b.offset), [visibleTravelOptions]);

  const removedDailyColumns = useMemo(
    () => [...removedTravelOptions].sort((a, b) => a.offset - b.offset),
    [removedTravelOptions],
  );

  const removedTravelDateSet = useMemo(
    () => new Set(removedDailyColumns.map((item) => item.date)),
    [removedDailyColumns],
  );

  const dailyTable = useMemo(() => {
    const marketRows = Array.from(selectedMarkets);

    const data = marketRows.map((market) => {
      const byDate = new Map<string, Agg>();
      const total = emptyAgg();

      filteredRows.forEach((row) => {
        if (row.mercado !== market) return;
        if (!selectedTravelDates.has(row.travelDate)) return;

        if (!byDate.has(row.travelDate)) byDate.set(row.travelDate, emptyAgg());
        addAgg(byDate.get(row.travelDate)!, row);
        addAgg(total, row);
      });

      return { market, byDate, total };
    });

    const totalByDate = new Map<string, Agg>();
    const grandTotal = emptyAgg();

    data.forEach((line) => {
      line.byDate.forEach((agg, date) => {
        if (!totalByDate.has(date)) totalByDate.set(date, emptyAgg());
        totalByDate.get(date)!.ocupacao += agg.ocupacao;
        totalByDate.get(date)!.capacidade += agg.capacidade;
      });
      grandTotal.ocupacao += line.total.ocupacao;
      grandTotal.capacidade += line.total.capacidade;
    });

    return { data, totalByDate, grandTotal };
  }, [filteredRows, selectedMarkets, selectedTravelDates]);

  const dailyHeatScale = useMemo(() => {
    const values: Array<number | null> = [];

    dailyTable.data.forEach((line: { byDate: Map<string, Agg>; total: Agg }) => {
      dailyColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(line.byDate.get(column.date))));
      values.push(safeRatio(line.total));
    });

    dailyColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(dailyTable.totalByDate.get(column.date))));
    values.push(safeRatio(dailyTable.grandTotal));

    return buildHeatScale(values);
  }, [dailyColumns, dailyTable]);

  const removedDailyTable = useMemo(() => {
    const sourceRows = payload?.rows || [];
    const marketRows = Array.from(selectedMarkets);

    const data = marketRows.map((market) => {
      const byDate = new Map<string, Agg>();
      const total = emptyAgg();

      sourceRows.forEach((row) => {
        if (row.mercado !== market) return;
        if (!removedTravelDateSet.has(row.travelDate)) return;

        if (!byDate.has(row.travelDate)) byDate.set(row.travelDate, emptyAgg());
        addAgg(byDate.get(row.travelDate)!, row);
        addAgg(total, row);
      });

      return { market, byDate, total };
    });

    const totalByDate = new Map<string, Agg>();
    const grandTotal = emptyAgg();

    data.forEach((line) => {
      line.byDate.forEach((agg, date) => {
        if (!totalByDate.has(date)) totalByDate.set(date, emptyAgg());
        totalByDate.get(date)!.ocupacao += agg.ocupacao;
        totalByDate.get(date)!.capacidade += agg.capacidade;
      });
      grandTotal.ocupacao += line.total.ocupacao;
      grandTotal.capacidade += line.total.capacidade;
    });

    return { data, totalByDate, grandTotal };
  }, [payload?.rows, removedTravelDateSet, selectedMarkets]);

  const removedDailyHeatScale = useMemo(() => {
    const values: Array<number | null> = [];

    removedDailyTable.data.forEach((line: { byDate: Map<string, Agg>; total: Agg }) => {
      removedDailyColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(line.byDate.get(column.date))));
      values.push(safeRatio(line.total));
    });

    removedDailyColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(removedDailyTable.totalByDate.get(column.date))));
    values.push(safeRatio(removedDailyTable.grandTotal));

    return buildHeatScale(values);
  }, [removedDailyColumns, removedDailyTable]);

  const hybridColumns = useMemo(() => {
    const dayColumns = dailyColumns.filter((item) => item.offset >= -1 && item.offset <= 6);
    return {
      dayColumns,
      bucketColumns: HYBRID_BUCKETS,
    };
  }, [dailyColumns]);

  const hybridTable = useMemo(() => {
    const markets = Array.from(selectedMarkets);

    const rowsData = markets.map((market) => {
      const dayAgg = new Map<string, Agg>();
      // Buckets: usar WEEK_BUCKETS para garantir que 0-7 seja capturado para o rodapé
      const bucketAgg: Record<string, Agg> = Object.fromEntries(WEEK_BUCKETS.map((bucket) => [bucket, emptyAgg()]));
      const totalAgg = emptyAgg();

      marketFilteredRows.forEach((row) => {
        if (row.mercado !== market) return;

        if (row.advp >= -1 && row.advp <= 7 && selectedTravelDates.has(row.travelDate)) {
          if (!dayAgg.has(row.travelDate)) dayAgg.set(row.travelDate, emptyAgg());
          addAgg(dayAgg.get(row.travelDate)!, row);
        }

        const bucket = bucketFromAdvp(row.advp);
        if (bucket && WEEK_BUCKETS.includes(bucket as any)) {
          addAgg(bucketAgg[bucket], row);
          addAgg(totalAgg, row);
        }
      });

      return { market, dayAgg, bucketAgg, totalAgg };
    });

    const rows = rowsData.sort((a, b) => {
      if (sortConfig?.key === 'market') {
        const cmp = String(a.market).localeCompare(String(b.market));
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      if (sortConfig?.key === 'total') {
        const cmp = (safeRatio(a.totalAgg) || 0) - (safeRatio(b.totalAgg) || 0);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      if (sortConfig && HYBRID_BUCKETS.includes(sortConfig.key as any)) {
        const cmp = (safeRatio(a.bucketAgg[sortConfig.key]) || 0) - (safeRatio(b.bucketAgg[sortConfig.key]) || 0);
        return sortConfig.direction === 'asc' ? cmp : -cmp;
      }
      const selectedOrder = Array.from(selectedMarkets);
      return selectedOrder.indexOf(a.market) - selectedOrder.indexOf(b.market);
    });

    const totalDayAgg = new Map<string, Agg>();
    const totalBucketAgg: Record<string, Agg> = Object.fromEntries(WEEK_BUCKETS.map((bucket) => [bucket, emptyAgg()]));
    const totalAgg = emptyAgg();
    const total07Agg = emptyAgg();

    rows.forEach((row) => {
      row.dayAgg.forEach((agg, date) => {
        if (!totalDayAgg.has(date)) totalDayAgg.set(date, emptyAgg());
        totalDayAgg.get(date)!.ocupacao += agg.ocupacao;
        totalDayAgg.get(date)!.capacidade += agg.capacidade;
      });

      WEEK_BUCKETS.forEach((bucket) => {
        const rowBucket = row.bucketAgg?.[bucket];
        if (rowBucket) {
          totalBucketAgg[bucket].ocupacao += Number(rowBucket.ocupacao || 0);
          totalBucketAgg[bucket].capacidade += Number(rowBucket.capacidade || 0);
        }
      });

      totalAgg.ocupacao += row.totalAgg.ocupacao;
      totalAgg.capacidade += row.totalAgg.capacidade;
      total07Agg.ocupacao = totalBucketAgg['0 a 07'].ocupacao;
      total07Agg.capacidade = totalBucketAgg['0 a 07'].capacidade;
    });

    const historyBucketAgg: Record<string, Agg> = Object.fromEntries(WEEK_BUCKETS.map((bucket) => [bucket, emptyAgg()]));
    const historyDayAgg = new Map<string, Agg>();
    const historyTotal = emptyAgg();
    const history07Agg = emptyAgg();

    const selectedObserved = payload?.meta.selectedObservationDate ? new Date(`${payload.meta.selectedObservationDate}T00:00:00`) : null;
    const historyObserved = payload?.meta.historyObservationDate ? new Date(`${payload.meta.historyObservationDate}T00:00:00`) : null;

    marketFilteredHistoryRows.forEach((row) => {
      // Buckets: incluir 0-7 no histórico também
      const bucket = bucketFromAdvp(row.advp);
      if (bucket && WEEK_BUCKETS.includes(bucket as any)) {
        addAgg(historyBucketAgg[bucket], row);
        addAgg(historyTotal, row);
      }

      // Days (mapped by offset)
      if (historyObserved && selectedObserved) {
        const rowDate = new Date(`${row.travelDate}T00:00:00`);
        const offset = Math.round((rowDate.getTime() - historyObserved.getTime()) / 86400000);
        if (offset >= -1 && offset <= 6) {
          const mappedDate = new Date(selectedObserved.getFullYear(), selectedObserved.getMonth(), selectedObserved.getDate() + offset);
          const mappedIso = mappedDate.toISOString().slice(0, 10);
          if (!historyDayAgg.has(mappedIso)) historyDayAgg.set(mappedIso, emptyAgg());
          addAgg(historyDayAgg.get(mappedIso)!, row);
        }
      }
    });

    // Calcular history07Agg aqui fora para maior segurança
    const h07 = historyBucketAgg['0 a 07'];
    if (h07) {
      history07Agg.ocupacao = Number(h07.ocupacao || 0);
      history07Agg.capacidade = Number(h07.capacidade || 0);
    }

    return {
      rows,
      totalDayAgg,
      totalBucketAgg,
      totalAgg,
      total07Agg,
      history07Agg,
      historyBucketAgg,
      historyDayAgg,
      historyTotal,
    };
  }, [filteredRows, marketFilteredHistoryRows, marketFilteredRows, selectedMarkets, selectedTravelDates, payload?.meta.selectedObservationDate, payload?.meta.historyObservationDate, sortConfig]);

  const hybridHeatScale = useMemo(() => {
    const values: Array<number | null> = [];

    hybridTable.rows.forEach((line: { dayAgg: Map<string, Agg>; bucketAgg: Record<string, Agg> }) => {
      hybridColumns.dayColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(line.dayAgg.get(column.date))));
      hybridColumns.bucketColumns.forEach((bucket: string) => values.push(safeRatio(line.bucketAgg[bucket])));
    });

    hybridColumns.dayColumns.forEach((column: { date: string; offset: number }) => values.push(safeRatio(hybridTable.totalDayAgg.get(column.date))));
    hybridColumns.bucketColumns.forEach((bucket: string) => values.push(safeRatio(hybridTable.totalBucketAgg[bucket])));
    values.push(safeRatio(hybridTable.total07Agg));

    return buildHeatScale(values);
  }, [hybridColumns.bucketColumns, hybridColumns.dayColumns, hybridTable]);

  const toggleMarket = (market: string) => {
    setSelectedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(market)) {
        next.delete(market);
      } else {
        next.add(market);
      }
      return next;
    });
  };

  const toggleTravelDate = (date: string) => {
    setSelectedTravelDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const toggleExpand = (market: string) => {
    setExpandedMarkets((prev) => {
      const next = new Set(prev);
      if (next.has(market)) next.delete(market);
      else next.add(market);
      return next;
    });
  };

  return (
    <div className="relative space-y-6 pb-8">
      <div className="pointer-events-none absolute -left-20 -top-10 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-60 w-60 rounded-full bg-blue-300/20 blur-3xl" />

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-blue-950 to-cyan-900 p-6 text-white shadow-2xl"
      >
        <div className="absolute -right-20 -top-16 h-52 w-52 rounded-full bg-cyan-300/25 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
              <BarChart3 size={12} /> Dashboard de Demanda
            </div>
            <h2 className="text-3xl font-black uppercase tracking-[0.08em]">Analise APV e Mercado</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-200">
              Visao consolidada por mercado, empresa, ADVP e janela diaria de D-1 ate D60.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Arquivos lidos</p>
              <p className="mt-1 text-2xl font-black">{formatInt(payload?.meta.filesRead || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Registros</p>
              <p className="mt-1 text-2xl font-black">{formatInt(marketFilteredRows.length)}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Obs selecionada</p>
              <p className="mt-1 text-sm font-black">{selectedObservationDate ? formatDate(selectedObservationDate) : '--'}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-100">Atualizado</p>
              <p className="mt-1 text-sm font-black">{refreshAt ? refreshAt.toLocaleTimeString('pt-BR') : '--:--'}</p>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Statistics Banner */}
      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total no Arquivo</span>
              <span className="text-xl font-black text-white leading-tight">{formatInt(stats?.totalRead || 0)}</span>
          </div>
          <div className="bg-blue-950/40 border border-blue-900/50 rounded-2xl px-4 py-3 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Processados</span>
              <span className="text-xl font-black text-blue-100 leading-tight">{formatInt(stats?.processed || 0)}</span>
          </div>
          <div className="bg-amber-950/40 border border-amber-900/50 rounded-2xl px-4 py-3 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-300">Sem Data (Ignorados)</span>
              <span className="text-xl font-black text-amber-100 leading-tight">{formatInt(stats?.skippedDate || 0)}</span>
          </div>
          <div className="bg-rose-950/40 border border-rose-900/50 rounded-2xl px-4 py-3 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-300">Vazios (Cap 0)</span>
              <span className="text-xl font-black text-rose-100 leading-tight">{formatInt(stats?.skippedEmpty || 0)}</span>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">ADVP {'<'} -1</span>
              <span className="text-xl font-black text-slate-200 leading-tight">{formatInt(stats?.skippedAdvp || 0)}</span>
          </div>
          <div className="bg-emerald-950/40 border border-emerald-900/50 rounded-2xl px-4 py-3 flex flex-col justify-center group relative cursor-help" title="Mercados identificados no De Para">
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Mercados</span>
              <span className="text-xl font-black text-emerald-100 leading-tight">
                {payload?.meta?.marketCoverage?.foundKnown ?? payload?.meta?.marketCoverage?.found ?? payload?.markets?.length ?? 0} / {payload?.meta?.marketCoverage?.known ?? payload?.meta?.defaultMarkets?.length ?? payload?.markets?.length ?? 0}
              </span>
          </div>
      </div>

      <Card className="relative z-40 overflow-visible border-slate-200 bg-white/90 p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700 shadow-sm">
              <Filter size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Filtros de Demanda</h3>
              <p className="text-xs font-semibold text-slate-400">Data observacao por arquivo + viagem e mercados</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              className="h-[44px] border-cyan-200 px-4 text-cyan-700 hover:bg-cyan-50"
              onClick={() => loadData({ force: true })}
              disabled={loading}
            >
              <RefreshCw size={15} className={cn('mr-2', loading && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-2">
            <CustomSelect
              label="Data observacao"
              value={selectedObservationDate}
              onChange={(value: string) => {
                setSelectedObservationDate(value);
                loadData({ observationDate: value });
              }}
              options={observationOptions.length ? observationOptions : [{ label: 'Sem datas', value: '' }]}
              icon={CalendarDays}
              disabled={!observationOptions.length || loading}
            />
          </div>

          <div className="xl:col-span-4">
            <MultiSelect
              label="Data viagem (D-1 ate D60)"
              options={travelOptions.map((item) => ({
                label: `${item.offset >= 0 ? `D+${item.offset}` : `D${item.offset}`} | ${formatDate(item.date)}`,
                value: item.date,
              }))}
              selected={selectedTravelDates}
              onToggle={toggleTravelDate}
              onSelectAll={() => setSelectedTravelDates(new Set(travelOptions.map((item) => item.date)))}
              onClear={() => setSelectedTravelDates(new Set())}
            />
          </div>

          <div className="xl:col-span-4">
            <MultiSelect
              label="Mercados"
              options={(payload?.markets || []).map((market) => ({ label: market, value: market }))}
              selected={selectedMarkets}
              onToggle={toggleMarket}
              onSelectAll={() => setSelectedMarkets(new Set(payload?.markets || []))}
              onClear={() => setSelectedMarkets(new Set())}
            />
          </div>

          <div className="xl:col-span-2">
            <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Pasta da base</label>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={handleChooseFolder}
                className="inline-flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-500 transition-colors hover:border-cyan-200 hover:text-cyan-700"
                title="Selecionar pasta"
              >
                <FolderOpen size={18} />
              </button>
              <Button variant="secondary" className="h-[54px] min-w-[120px] border-cyan-200 px-4 text-cyan-700" onClick={handleApplyFolder}>
                <Database size={16} className="mr-2" /> Aplicar
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <input
            value={baseDirDraft}
            onChange={(event) => setBaseDirDraft(event.target.value)}
            placeholder={DEFAULT_DEMAND_BASE_DIR}
            className="h-[48px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-cyan-500"
          />

          <div className="flex min-h-[48px] items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-xs font-bold text-slate-500">
            <Building2 size={14} className="mr-2 text-slate-400" />
            {selectedMarkets.size} mercados selecionados | {selectedTravelDates.size} datas ativas
          </div>
        </div>

        {removedTravelOptions.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Datas removidas da analise</p>
              <button
                type="button"
                onClick={() => setShowRemovedDatesTable((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-slate-600 hover:border-cyan-200 hover:text-cyan-700"
              >
                <Calendar size={12} />
                {showRemovedDatesTable ? 'Ocultar Tabela' : `Tabela Removidas (${removedTravelOptions.length})`}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {removedTravelOptions.map((item) => (
                <span key={item.date} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-slate-500">
                  {item.offset >= 0 ? `D+${item.offset}` : `D${item.offset}`} | {formatDate(item.date)}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {(payload?.meta.warnings || []).length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-xs font-black uppercase tracking-widest text-amber-700">Avisos de leitura</p>
            <div className="space-y-1">
              {(payload?.meta.warnings || []).map((warning) => (
                <p key={warning} className="text-xs font-semibold text-amber-700">{warning}</p>
              ))}
            </div>
          </div>
        )}
      </Card>

      {showRemovedDatesTable && removedDailyColumns.length > 0 && (
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-2 text-amber-700 shadow-sm">
              <CalendarDays size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Tabela de datas removidas</h3>
              <p className="text-xs font-semibold text-slate-400">Mesmo formato da tabela diaria, considerando apenas datas removidas</p>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table ref={removedTableRef} className="w-full border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-20 min-w-[267px] bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Mercado</th>
                  {removedDailyColumns.map((item) => (
                    <th key={`removed-${item.date}`} className="min-w-[85px] px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider">
                      <div>{formatDate(item.date)}</div>
                      <div className="text-[9px] text-slate-300">{item.offset >= 0 ? `D+${item.offset}` : `D${item.offset}`}</div>
                    </th>
                  ))}
                  <th className="min-w-[89px] px-2 py-2 text-center text-[11px] font-black uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {removedDailyTable.data.map((line) => (
                  <tr key={`removed-daily-${line.market}`}>
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 font-black text-slate-700">{line.market}</td>
                    {removedDailyColumns.map((column) => {
                      const ratio = safeRatio(line.byDate.get(column.date));
                      return (
                        <td key={`${line.market}-${column.date}`} style={{ backgroundColor: heatColorByScale(ratio, removedDailyHeatScale) }} className="px-2 py-2 text-center text-[14px] font-bold text-slate-950">
                          {formatPercent(ratio)}
                        </td>
                      );
                    })}
                    <td style={{ backgroundColor: heatColorByScale(safeRatio(line.total), removedDailyHeatScale) }} className="px-2 py-2 text-center text-[14px] font-black text-slate-950">
                      {formatPercent(safeRatio(line.total))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-900 text-white">
                  <td className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Total</td>
                  {removedDailyColumns.map((column) => (
                    <td key={`removed-total-${column.date}`} className="px-2 py-2 text-center text-[13px] font-black">
                      {formatPercent(safeRatio(removedDailyTable.totalByDate.get(column.date)))}
                    </td>
                  ))}
                  <td className="px-2 py-2 text-center text-[13px] font-black">{formatPercent(safeRatio(removedDailyTable.grandTotal))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card className="border-cyan-100 bg-gradient-to-br from-cyan-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-600">APV Total</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(apvTotal)}</p>
        </Card>
        <Card className="border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">APV 7 dias</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(apv7)}</p>
        </Card>
        <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-700">APV 14 dias</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(apv14)}</p>
        </Card>
        <Card className="border-violet-100 bg-gradient-to-br from-violet-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">APV 21 dias</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatPercent(apv21)}</p>
        </Card>
        <Card className="border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Pax</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatInt(totals.ocupacao)}</p>
        </Card>
        <Card className="border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-700">Oferta</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatInt(totals.capacidade)}</p>
        </Card>
      </section>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700 shadow-sm">
            <BarChart3 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Mercados por faixa ADVP</h3>
            <p className="text-xs font-semibold text-slate-400">Clique no mercado para abrir as empresas</p>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[880px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="group sticky left-0 z-20 min-w-[261px] bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-800" onClick={() => requestSort('market')}>
                  <div className="flex items-center">
                    Mercado {getSortIcon('market')}
                  </div>
                </th>
                {WEEK_BUCKETS.map((bucket) => (
                  <th key={bucket} className="min-w-[99px] px-2 py-2 text-center text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-800" onClick={() => requestSort(bucket)}>
                    <div className="flex items-center justify-center">
                      {bucket} {getSortIcon(bucket)}
                    </div>
                  </th>
                ))}
                <th className="min-w-[99px] bg-slate-900/50 px-2 py-2 text-center text-[11px] font-black uppercase tracking-wider cursor-pointer hover:bg-slate-800" onClick={() => requestSort('total')}>
                  <div className="flex items-center justify-center text-blue-300">
                    Total {getSortIcon('total')}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {weekTable.rows.map((line) => {
                const isExpanded = expandedMarkets.has(line.market);
                return (
                  <Fragment key={line.market}>
                    <tr className="border-b border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-black text-slate-700">
                        <button type="button" onClick={() => toggleExpand(line.market)} className="inline-flex items-center gap-2 hover:text-blue-700">
                          {isExpanded ? <Minus size={12} /> : <Plus size={12} />} {line.market}
                        </button>
                      </td>
                      {WEEK_BUCKETS.map((bucket) => {
                        const ratio = safeRatio(line.buckets[bucket]);
                        return (
                          <td key={`${line.market}-${bucket}`} style={{ backgroundColor: heatColorByScale(ratio, weekHeatScale) }} className="px-2 py-2 text-center font-black text-slate-950">
                            {formatPercent(ratio)}
                          </td>
                        );
                      })}
                      <td style={{ backgroundColor: heatColorByScale(safeRatio(line.total), weekHeatScale) }} className="px-2 py-2 text-center font-black text-slate-950">
                        {formatPercent(safeRatio(line.total))}
                      </td>
                    </tr>

                    {isExpanded && (Array.from(line.companies.values()) as Array<{ company: string; buckets: Record<string, Agg>; total: Agg }>).sort((a, b) => b.total.ocupacao - a.total.ocupacao).map((company) => (
                      <tr key={`${line.market}-${company.company}`} className="bg-slate-50/70">
                        <td className="sticky left-0 z-10 bg-slate-50/90 px-3 py-2 pl-8 text-left font-bold text-slate-600">
                          <ChevronRight size={12} className="mr-1 inline" />{company.company}
                        </td>
                        {WEEK_BUCKETS.map((bucket) => {
                          const ratio = safeRatio(company.buckets[bucket]);
                          return (
                            <td key={`${line.market}-${company.company}-${bucket}`} style={{ backgroundColor: heatColorByScale(ratio, weekHeatScale) }} className="px-2 py-2 text-center font-bold text-slate-950">
                              {formatPercent(ratio)}
                            </td>
                          );
                        })}
                        <td style={{ backgroundColor: heatColorByScale(safeRatio(company.total), weekHeatScale) }} className="px-2 py-2 text-center font-bold text-slate-950">
                          {formatPercent(safeRatio(company.total))}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Total</td>
                {WEEK_BUCKETS.map((bucket) => (
                  <td key={`total-${bucket}`} className="px-2 py-2 text-center text-[11px] font-black">{formatPercent(safeRatio(weekTable.totalByBucket[bucket]))}</td>
                ))}
                <td className="px-2 py-2 text-center text-[11px] font-black">{formatPercent(safeRatio(weekTable.grandTotal))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700 shadow-sm">
            <CalendarDays size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Tabela diaria D-1 ate D60</h3>
            <p className="text-xs font-semibold text-slate-400">Rolagem horizontal com mercado fixo</p>
          </div>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1480px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="sticky left-0 z-20 min-w-[267px] bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Mercado</th>
                {dailyColumns.map((item) => (
                  <th key={item.date} className="min-w-[85px] px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider">
                    <div>{formatDate(item.date)}</div>
                    <div className="text-[9px] text-slate-300">{item.offset >= 0 ? `D+${item.offset}` : `D${item.offset}`}</div>
                  </th>
                ))}
                <th className="min-w-[89px] px-2 py-2 text-center text-[11px] font-black uppercase tracking-wider">Total</th>
              </tr>
            </thead>
            <tbody>
              {dailyTable.data.map((line) => (
                <tr key={`daily-${line.market}`}>
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 font-black text-slate-700">{line.market}</td>
                  {dailyColumns.map((column) => {
                    const ratio = safeRatio(line.byDate.get(column.date));
                    return (
                      <td key={`${line.market}-${column.date}`} style={{ backgroundColor: heatColorByScale(ratio, dailyHeatScale) }} className="px-2 py-2 text-center font-bold text-slate-950">
                        {formatPercent(ratio)}
                      </td>
                    );
                  })}
                  <td style={{ backgroundColor: heatColorByScale(safeRatio(line.total), dailyHeatScale) }} className="px-2 py-2 text-center font-black text-slate-950">
                    {formatPercent(safeRatio(line.total))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-900 text-white">
                <td className="sticky left-0 z-20 bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Total</td>
                {dailyColumns.map((column) => (
                  <td key={`daily-total-${column.date}`} className="px-2 py-2 text-center text-[11px] font-black">
                    {formatPercent(safeRatio(dailyTable.totalByDate.get(column.date)))}
                  </td>
                ))}
                <td className="px-2 py-2 text-center text-[11px] font-black">{formatPercent(safeRatio(dailyTable.grandTotal))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200/60 p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700 shadow-sm">
                <BarChart3 size={20} />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase tracking-[0.16em] text-slate-700">Tabela hibrida: Diario x Acumulado</h3>
                <p className="text-xs font-semibold text-slate-400">Resumo da primeira semana e total acumulado por mercado</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
                <button
                  onClick={() => setExportImageMode((prev) => (prev === 'combined' ? 'separate' : 'combined'))}
                  className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 transition-all hover:bg-cyan-100 active:scale-95"
                  title={exportImageMode === 'combined' ? 'Modo 1 imagem: salva combinado quando removidos estiver ativo.' : 'Modo 2 imagens: salva cada tabela em arquivo separado.'}
                  aria-label={exportImageMode === 'combined' ? 'Modo de exportacao atual: uma imagem combinada' : 'Modo de exportacao atual: imagens separadas'}
                >
                  {exportImageMode === 'combined' ? <ImageIcon size={16} /> : <Images size={16} />}
                </button>
                <button 
                  onClick={handleExportImage}
                  className="inline-flex h-[44px] items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-xs font-black uppercase tracking-widest text-emerald-700 transition-all hover:bg-emerald-100 active:scale-95"
                >
                  <Camera size={16} /> Salvar como Foto
                </button>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar bg-white">
          <table ref={tableRef} className="w-full min-w-[1340px] border-separate border-spacing-0 text-xs">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">
                  Mercado
                </th>
                {hybridColumns.dayColumns.map((item) => (
                  <th key={`hybrid-day-${item.date}`} className="min-w-[81px] px-2 py-2 text-center text-[10px] font-black uppercase tracking-wider">
                    <div>{formatDate(item.date)}</div>
                    <div className="text-[9px] text-slate-300">{item.offset >= 0 ? `D+${item.offset}` : `D${item.offset}`}</div>
                  </th>
                ))}
                {hybridColumns.bucketColumns.map((bucket) => (
                  <th 
                    key={`hybrid-week-${bucket}`} 
                    className="min-w-[87px] border-l-2 border-dashed border-red-600 px-2 py-2 text-center text-[11px] font-black uppercase tracking-wider"
                  >
                    {bucket}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hybridTable.rows.map((line) => (
                <tr key={line.market} className="border-b border-slate-100/50 transition-colors hover:bg-slate-50">
                  <td className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-white px-3 py-2 text-[11px] font-black text-slate-700 border-r border-slate-100 shadow-[10px_0_12px_-12px_rgba(15,23,42,0.45)]">
                    <div className="flex items-center justify-between">
                      <span className="truncate">{line.market}</span>
                    </div>
                  </td>
                  {hybridColumns.dayColumns.map((column) => {
                    const ratio = safeRatio(line.dayAgg.get(column.date));
                    return (
                      <td key={column.date} style={{ backgroundColor: heatColorByScale(ratio, hybridHeatScale) }} className="px-2 py-2 text-center text-[13px] font-bold text-slate-950">
                        {formatPercent(ratio)}
                      </td>
                    );
                  })}
                  {hybridColumns.bucketColumns.map((bucket, idx) => {
                    const ratio = safeRatio(line.bucketAgg[bucket]);
                    return (
                      <td 
                        key={`${line.market}-${bucket}`} 
                        style={{ backgroundColor: heatColorByScale(ratio, hybridHeatScale) }}
                        className="px-2 py-2 text-center text-[13px] font-black text-slate-950 border-l-2 border-dashed border-red-600"
                      >
                        {formatPercent(ratio)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200">
              <tr className="bg-slate-900 text-white">
                <td className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-slate-900 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Total</td>
                {hybridColumns.dayColumns.map((column, idx) => {
                  const isLastDay = idx === hybridColumns.dayColumns.length - 1;
                  const ratio = isLastDay ? safeRatio(hybridTable.total07Agg) : safeRatio(hybridTable.totalDayAgg.get(column.date));
                  return (
                    <td key={`hybrid-total-day-${column.date}`} className="px-2 py-2 text-center text-[13px] font-black">
                      {formatPercent(ratio)}
                    </td>
                  );
                })}
                {hybridColumns.bucketColumns.map((bucket) => (
                  <td key={`hybrid-total-bucket-${bucket}`} className="px-2 py-2 text-center text-[13px] font-black border-l-2 border-dashed border-red-600">
                    {formatPercent(safeRatio(hybridTable.totalBucketAgg[bucket]))}
                  </td>
                ))}
              </tr>

              <tr className="bg-slate-100/80 text-slate-700">
                <td className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-slate-100 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Historico</td>
                {hybridColumns.dayColumns.map((column, idx) => {
                  const item = dailyColumns.find(d => d.date === column.date);
                  const isLastDay = idx === hybridColumns.dayColumns.length - 1;
                  const isVisible = (item && item.offset >= 6) || isLastDay;
                  
                  const ratio = isLastDay ? safeRatio(hybridTable.history07Agg) : (isVisible ? safeRatio(hybridTable.historyDayAgg.get(column.date)) : 0);
                  
                  return (
                    <td key={`hist-day-${column.date}`} style={isVisible ? { backgroundColor: 'transparent' } : {}} className="px-2 py-2 text-center text-[13px] font-bold">
                      {isVisible ? formatPercent(ratio) : '-'}
                    </td>
                  );
                })}
                {hybridColumns.bucketColumns.map((bucket) => {
                  const ratio = safeRatio(hybridTable.historyBucketAgg[bucket]);
                  return (
                    <td key={`hist-bucket-${bucket}`} className="px-2 py-2 text-center text-[13px] font-black border-l-2 border-dashed border-red-600">
                      {formatPercent(ratio)}
                    </td>
                  );
                })}
              </tr>

              <tr className="bg-cyan-50/80 text-cyan-900 border-t border-cyan-100">
                <td className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-cyan-50 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Atual</td>
                {hybridColumns.dayColumns.map((column, idx) => {
                  const item = dailyColumns.find(d => d.date === column.date);
                  const isLastDay = idx === hybridColumns.dayColumns.length - 1;
                  const isVisible = (item && item.offset >= 6) || isLastDay;
                  
                  const ratio = isLastDay ? safeRatio(hybridTable.total07Agg) : (isVisible ? safeRatio(hybridTable.totalDayAgg.get(column.date)) : 0);
                  
                  return (
                    <td key={`atual-day-${column.date}`} style={isVisible ? { backgroundColor: 'transparent' } : {}} className="px-2 py-2 text-center text-[13px] font-bold">
                      {isVisible ? formatPercent(ratio) : '-'}
                    </td>
                  );
                })}
                {hybridColumns.bucketColumns.map((bucket) => {
                  const ratio = safeRatio(hybridTable.totalBucketAgg[bucket]);
                  return (
                    <td key={`atual-bucket-${bucket}`} className="px-2 py-2 text-center text-[13px] font-black border-l-2 border-dashed border-red-600">
                      {formatPercent(ratio)}
                    </td>
                  );
                })}
              </tr>

              <tr className="bg-amber-50/80 text-amber-900 border-t border-amber-100">
                <td className="sticky left-0 z-20 w-[267px] min-w-[267px] max-w-[267px] bg-amber-50 px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Meta</td>
                {hybridColumns.dayColumns.map((column, idx) => {
                  const item = dailyColumns.find(d => d.date === column.date);
                  const isLastDay = idx === hybridColumns.dayColumns.length - 1;
                  const isVisible = (item && item.offset >= 6) || isLastDay;
                  
                  return (
                    <td key={`meta-day-${column.date}`} className="px-2 py-2 text-center text-[13px] font-bold">
                      {isVisible ? formatPercent(0.5) : '-'}
                    </td>
                  );
                })}
                {hybridColumns.bucketColumns.map((bucket) => (
                  <td key={`meta-bucket-${bucket}`} className="px-2 py-2 text-center text-[13px] font-black border-l-2 border-dashed border-red-600">
                    {formatPercent(META_BY_BUCKET[bucket] || 0)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {loading && (
        <div className="fixed bottom-6 right-6 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-xs font-black text-blue-700 shadow-xl">
          <RefreshCw size={14} className="mr-2 inline animate-spin" /> Atualizando dados de demanda...
        </div>
      )}
    </div>
  );
};

export default DemandDashboardView;
