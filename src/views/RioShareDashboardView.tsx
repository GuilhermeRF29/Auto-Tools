import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  BarChart3,
  BusFront,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock3,
  Database,
  FolderOpen,
  Layers3,
  PieChart as PieChartIcon,
  RefreshCw,
  Table2,
  X,
} from 'lucide-react';
import { motion } from 'motion/react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import Card from '../components/Card';
import Button from '../components/Button';
import { cn } from '../utils/cn';

const DEFAULT_RIO_SHARE_BASE_DIR = 'Z:\\Dash RIO';
const STORAGE_KEY = 'autotools:rioShareBaseDir';

const PIE_COLORS = [
  '#1d4ed8',
  '#eab308',
  '#a3a3a3',
  '#ef4444',
  '#67b7dc',
  '#0f172a',
  '#9f1239',
  '#fb923c',
  '#fdba74',
  '#4338ca',
  '#14b8a6',
  '#84cc16',
];

const MONTH_LABELS: Record<number, string> = {
  1: 'janeiro',
  2: 'fevereiro',
  3: 'marco',
  4: 'abril',
  5: 'maio',
  6: 'junho',
  7: 'julho',
  8: 'agosto',
  9: 'setembro',
  10: 'outubro',
  11: 'novembro',
  12: 'dezembro',
};

type RioShareRow = {
  date: string;
  dia: number;
  semana: number;
  mes: string;
  mesNumero: number;
  ano: number;
  empresa: string;
  origem: string;
  destino: string;
  horario: string;
  grupo: string;
  modalidade: string;
  pax: number;
  viagens: number;
};

type RioSharePayload = {
  meta: {
    baseDir: string;
    requestedBaseDir: string;
    filesRead: number;
    records: number;
    warnings: string[];
    stats?: {
      totalRead: number;
      processed: number;
      skippedDate: number;
      skippedEmpresa: number;
      skippedPax: number;
    } | null;
  };
  rows: RioShareRow[];
  filters: {
    companies: string[];
    origins: string[];
    destinations: string[];
    horarios: string[];
    modalities: string[];
    groups: string[];
    months: Array<{ label: string; number: number }>;
    weeks: number[];
    years: number[];
  };
};

type ScreenId = 'share_empresas' | 'share_grupos' | 'pax_viagens_mercado' | 'comparativo_semanal' | 'acompanhamento_diario' | 'quadro_horarios';
type SetFilterKey = 'companies' | 'groups' | 'modalities' | 'origins' | 'destinations' | 'horarios' | 'months' | 'weeks' | 'years';

type ScreenFilters = {
  dayStart: number;
  dayEnd: number;
  companies: Set<string>;
  groups: Set<string>;
  modalities: Set<string>;
  origins: Set<string>;
  destinations: Set<string>;
  horarios: Set<string>;
  months: Set<string>;
  weeks: Set<string>;
  years: Set<string>;
};

type ScreenFilterMap = Record<ScreenId, ScreenFilters>;

type ShareAggRow = {
  categoria: string;
  pax: number;
  viagens: number;
  ipv: number;
  share: number;
  color: string;
  outerRadius: number;
};

type ScreenOption = { id: ScreenId; label: string; icon: typeof PieChartIcon };

const SCREEN_OPTIONS: ScreenOption[] = [
  { id: 'share_empresas', label: 'Share Mercado Empresas', icon: PieChartIcon },
  { id: 'share_grupos', label: 'Share Mercado Grupos', icon: Layers3 },
  { id: 'pax_viagens_mercado', label: 'Pax/Viagens (Mercado)', icon: BarChart2 },
  { id: 'comparativo_semanal', label: 'Comparativo Semanal', icon: CalendarDays },
  { id: 'acompanhamento_diario', label: 'Acompanhamento Diario', icon: BarChart3 },
  { id: 'quadro_horarios', label: 'Quadro de Horarios', icon: Clock3 },
];

const SCREEN_LABELS: Record<ScreenId, string> = {
  share_empresas: 'Share Mercado Empresas',
  share_grupos: 'Share Mercado Grupos',
  pax_viagens_mercado: 'Pax/Viagens (Mercado)',
  comparativo_semanal: 'Comparativo Semanal',
  acompanhamento_diario: 'Acompanhamento Diario',
  quadro_horarios: 'Quadro de Horarios',
};

const formatInt = (value: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value || 0));
const formatDecimal = (value: number) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
const formatPercent = (value: number) => `${formatDecimal(value)}%`;
const formatPercentTick = (value: number) => `${Math.round(Number(value || 0))}%`;
const formatCompactMil = (value: number) => `${formatDecimal(value / 1000)} Mil`;
const formatCompactMi = (value: number) => `${formatDecimal(value / 1000000)} Mi`;

const computeNiceStep = (maxValue: number, targetTicks = 6) => {
  if (!Number.isFinite(maxValue) || maxValue <= 0) return 1;

  const roughStep = maxValue / Math.max(2, targetTicks);
  const power = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / power;

  if (normalized <= 1) return 1 * power;
  if (normalized <= 2) return 2 * power;
  if (normalized <= 5) return 5 * power;
  return 10 * power;
};

const buildDynamicAxisConfig = (maxValue: number, targetTicks = 6) => {
  const safeMax = Math.max(0, Number(maxValue || 0));
  if (safeMax === 0) {
    return { upperBound: 1, ticks: [0, 1] };
  }

  const step = computeNiceStep(safeMax, targetTicks);
  const upperBound = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];

  for (let value = 0; value <= upperBound + (step / 2); value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return { upperBound, ticks };
};

const buildDynamicAxisRangeConfig = (minValue: number, maxValue: number, targetTicks = 6) => {
  const safeMin = Math.max(0, Number(minValue || 0));
  const safeMax = Math.max(safeMin, Number(maxValue || 0));

  if (safeMax === 0) {
    return { lowerBound: 0, upperBound: 1, ticks: [0, 1] };
  }

  const hasSpan = safeMax > safeMin;
  const step = hasSpan
    ? computeNiceStep(safeMax - safeMin, targetTicks)
    : computeNiceStep(Math.max(1, safeMax * 0.2), targetTicks);

  const lowerBound = hasSpan
    ? Math.max(0, Math.floor(safeMin / step) * step)
    : Math.max(0, safeMin - (step * 2));

  const upperBound = hasSpan
    ? Math.max(lowerBound + step, Math.ceil(safeMax / step) * step)
    : safeMax + (step * 2);

  const ticks: number[] = [];
  for (let value = lowerBound; value <= upperBound + (step / 2); value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return { lowerBound, upperBound, ticks };
};

const toSet = (values: string[] = []) => new Set(values.filter(Boolean));

const cloneSet = (source: Set<string>) => new Set(Array.from(source));

const buildShareRows = (rows: RioShareRow[], dimension: 'empresa' | 'grupo') => {
  const map = new Map<string, { categoria: string; pax: number; viagens: number }>();

  rows.forEach((row) => {
    const categoria = String(row[dimension] || '').trim();
    if (!categoria) return;

    const current = map.get(categoria) || { categoria, pax: 0, viagens: 0 };
    current.pax += Number(row.pax || 0);
    current.viagens += Number(row.viagens || 0);
    map.set(categoria, current);
  });

  const ordered = Array.from(map.values()).sort((a, b) => b.pax - a.pax || a.categoria.localeCompare(b.categoria));
  const totalPax = ordered.reduce((acc, item) => acc + item.pax, 0);

  return ordered.map((item, index) => {
    const depthBoost = ordered.length <= 1 ? 12 : Math.round((1 - (index / (ordered.length - 1))) * 12);
    return {
      categoria: item.categoria,
      pax: item.pax,
      viagens: item.viagens,
      ipv: item.viagens > 0 ? item.pax / item.viagens : 0,
      share: totalPax > 0 ? (item.pax / totalPax) * 100 : 0,
      color: PIE_COLORS[index % PIE_COLORS.length],
      outerRadius: 152 + depthBoost,
    };
  });
};

const buildPaxViagensData = (rows: RioShareRow[]) => {
  const monthMap = new Map<string, any>();
  const companyTotals = new Map<string, number>();
  const totalPax = rows.reduce((acc, row) => acc + Number(row.pax || 0), 0);
  const totalViagens = rows.reduce((acc, row) => acc + Number(row.viagens || 0), 0);

  rows.forEach((row) => {
    const monthKey = `${row.ano}-${String(row.mesNumero || 0).padStart(2, '0')}`;
    const base = monthMap.get(monthKey) || {
      monthKey,
      mesNumero: Number(row.mesNumero || 0),
      mes: MONTH_LABELS[Number(row.mesNumero || 0)] || String(row.mes || '').toLowerCase(),
      viagens: 0,
    };

    base.viagens += Number(row.viagens || 0);
    const companyName = String(row.empresa || '').trim();
    if (companyName) {
      base[companyName] = Number(base[companyName] || 0) + Number(row.pax || 0);
      companyTotals.set(companyName, Number(companyTotals.get(companyName) || 0) + Number(row.pax || 0));
    }

    monthMap.set(monthKey, base);
  });

  const companies = Array.from(companyTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([company]) => company);

  const colorByCompany = Object.fromEntries(companies.map((company, index) => [company, PIE_COLORS[index % PIE_COLORS.length]]));

  const data = Array.from(monthMap.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  return {
    data,
    companies,
    colorByCompany,
    totals: {
      pax: totalPax,
      viagens: totalViagens,
      ipv: totalViagens > 0 ? totalPax / totalViagens : 0,
    },
  };
};

const buildDefaultScreenFilters = (payload: RioSharePayload): ScreenFilterMap => {
  const allCompanies = payload.filters?.companies || [];
  const allGroups = payload.filters?.groups || [];
  const allModalities = payload.filters?.modalities || [];
  const allOrigins = payload.filters?.origins || [];
  const allDestinations = payload.filters?.destinations || [];
  const allHorarios = payload.filters?.horarios || [];
  const allMonths = (payload.filters?.months || []).map((item) => item.label);
  const allWeeks = (payload.filters?.weeks || []).map(String);
  const allYears = (payload.filters?.years || []).map(String);

  const currentDate = new Date();
  const currentYear = String(currentDate.getFullYear());
  const previousYear = String(currentDate.getFullYear() - 1);
  const currentMonthNumber = currentDate.getMonth() + 1;
  const currentMonthLabel = payload.filters?.months?.find((month) => Number(month.number) === currentMonthNumber)?.label || '';

  const chooseYear = (preferredYear: string) => {
    if (allYears.includes(preferredYear)) return preferredYear;
    return allYears[0] || '';
  };

  const buildBase = (): ScreenFilters => ({
    dayStart: 1,
    dayEnd: 31,
    companies: toSet(allCompanies),
    groups: toSet(allGroups),
    modalities: toSet(allModalities),
    origins: toSet(allOrigins),
    destinations: toSet(allDestinations),
    horarios: toSet(allHorarios),
    months: toSet(allMonths),
    weeks: toSet(allWeeks),
    years: toSet(allYears),
  });

  const shareEmpresa = buildBase();
  shareEmpresa.years = chooseYear(currentYear) ? toSet([chooseYear(currentYear)]) : toSet(allYears);
  shareEmpresa.months = currentMonthLabel ? toSet([currentMonthLabel]) : toSet(allMonths);

  const shareGrupo = buildBase();
  shareGrupo.years = chooseYear(currentYear) ? toSet([chooseYear(currentYear)]) : toSet(allYears);
  shareGrupo.months = currentMonthLabel ? toSet([currentMonthLabel]) : toSet(allMonths);

  const paxViagens = buildBase();
  paxViagens.years = chooseYear(previousYear) ? toSet([chooseYear(previousYear)]) : toSet(allYears);
  paxViagens.months = toSet(allMonths);

  const comparativoSemanal = buildBase();
  comparativoSemanal.years = chooseYear(currentYear) ? toSet([chooseYear(currentYear)]) : toSet(allYears);
  comparativoSemanal.months = currentMonthLabel ? toSet([currentMonthLabel]) : toSet(allMonths);

  const acompanhamentoDiario = buildBase();
  acompanhamentoDiario.years = chooseYear(currentYear) ? toSet([chooseYear(currentYear)]) : toSet(allYears);
  acompanhamentoDiario.months = currentMonthLabel ? toSet([currentMonthLabel]) : toSet(allMonths);

  const quadroHorarios = buildBase();
  quadroHorarios.years = chooseYear(currentYear) ? toSet([chooseYear(currentYear)]) : toSet(allYears);
  quadroHorarios.months = currentMonthLabel ? toSet([currentMonthLabel]) : toSet(allMonths);

  return {
    share_empresas: shareEmpresa,
    share_grupos: shareGrupo,
    pax_viagens_mercado: paxViagens,
    comparativo_semanal: comparativoSemanal,
    acompanhamento_diario: acompanhamentoDiario,
    quadro_horarios: quadroHorarios,
  };
};

const isViagensSeries = (item: any) => {
  const token = String(item?.dataKey || item?.name || item?.value || '').trim().toLowerCase();
  return token === 'viagens';
};

const ChartTooltip = ({ active, payload }: { active?: boolean; payload?: any[] }) => {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{row?.categoria || '-'}</p>
      <p className="mt-1 text-xs font-bold text-slate-700">PAX: {formatInt(Number(row?.pax || 0))}</p>
      <p className="text-xs font-bold text-slate-700">Viagens: {formatInt(Number(row?.viagens || 0))}</p>
      <p className="text-xs font-bold text-slate-700">IPV: {formatDecimal(Number(row?.ipv || 0))}</p>
      <p className="text-xs font-black text-blue-700">Share: {formatPercent(Number(row?.share || 0))}</p>
    </div>
  );
};

const PaxTooltip = ({ active, payload, label, mode }: { active?: boolean; payload?: any[]; label?: string; mode: 'absoluto' | 'percentual' }) => {
  if (!active || !payload?.length) return null;

  const filtered = [...payload]
    .filter((item) => isViagensSeries(item) || Number(item?.value || 0) > 0);

  const companyItems = filtered
    .filter((item) => !isViagensSeries(item))
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));
  const viagensItem = filtered.find((item) => isViagensSeries(item));

  return (
    <div className="max-h-[320px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label || 'Mes'}</p>
      <div className="mt-2 space-y-1 overflow-y-auto custom-scrollbar pr-1">
        {companyItems.map((item, index) => (
          <p key={`${item.name}-${index}`} className="text-xs font-bold" style={{ color: item.color || '#334155' }}>
            {item.name}: {mode === 'percentual'
              ? formatPercent(Number(item.value || 0))
              : formatInt(Number(item.value || 0))}
          </p>
        ))}

        {viagensItem && companyItems.length > 0 && <div className="my-2 border-t border-slate-300" />}

        {viagensItem && (
          <p className="text-xs font-bold" style={{ color: viagensItem.color || '#ef4444' }}>
            {viagensItem.name}: {formatInt(Number(viagensItem.value || 0))}
          </p>
        )}
      </div>
    </div>
  );
};

const PaxLegend = ({ payload }: { payload?: any[] }) => {
  if (!payload?.length) return null;

  const companyItems = payload.filter((item) => !isViagensSeries(item));
  const viagensItem = payload.find((item) => isViagensSeries(item));
  const ordered = viagensItem ? [...companyItems, viagensItem] : companyItems;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-3">
      {ordered.map((item, index) => {
        const label = String(item?.value || item?.dataKey || '').trim();
        const color = String(item?.color || '#334155');
        const isLine = isViagensSeries(item);

        return (
          <div key={`${label}-${index}`} className="flex items-center gap-2 text-xs font-black text-slate-500">
            {isLine ? (
              <span className="h-0.5 w-5 rounded-full" style={{ backgroundColor: color }} />
            ) : (
              <span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: color }} />
            )}
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
};

const buildWeeklyComparisonData = (rows: RioShareRow[]) => {
  const periodMap = new Map<string, any>();
  const companyTotals = new Map<string, number>();
  let totalPax = 0;
  let totalViagens = 0;

  rows.forEach((row) => {
    const semana = Number(row.semana || 0);
    const mesNumero = Number(row.mesNumero || 0);
    const ano = Number(row.ano || 0);
    if (!Number.isFinite(semana) || semana <= 0 || !Number.isFinite(mesNumero) || mesNumero <= 0) return;

    const periodKey = `${ano}-${String(mesNumero).padStart(2, '0')}-S${String(semana).padStart(2, '0')}`;
    const periodLabel = `${String(mesNumero).padStart(2, '0')}-SEM ${semana}`;
    const base = periodMap.get(periodKey) || {
      periodKey,
      periodLabel,
      ano,
      mesNumero,
      semana,
      viagens: 0,
      paxTotal: 0,
    };

    const pax = Number(row.pax || 0);
    const viagens = Number(row.viagens || 0);
    const companyName = String(row.empresa || '').trim();

    base.viagens += viagens;
    base.paxTotal += pax;

    if (companyName) {
      base[companyName] = Number(base[companyName] || 0) + pax;
      companyTotals.set(companyName, Number(companyTotals.get(companyName) || 0) + pax);
    }

    periodMap.set(periodKey, base);
    totalPax += pax;
    totalViagens += viagens;
  });

  const companies = Array.from(companyTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([company]) => company);

  const periods = Array.from(periodMap.values())
    .sort((a, b) => a.ano - b.ano || a.mesNumero - b.mesNumero || a.semana - b.semana)
    .map((period) => ({
      key: String(period.periodKey),
      label: String(period.periodLabel),
      ano: Number(period.ano || 0),
      mesNumero: Number(period.mesNumero || 0),
      semana: Number(period.semana || 0),
      paxTotal: Number(period.paxTotal || 0),
      viagens: Number(period.viagens || 0),
    }));

  const chartData = periods.map((period) => {
    const raw = periodMap.get(period.key) || {};
    const row: Record<string, any> = {
      periodKey: period.key,
      periodLabel: period.label,
      paxTotal: period.paxTotal,
      viagens: period.viagens,
    };

    companies.forEach((company) => {
      row[company] = Number(raw?.[company] || 0);
    });

    return row;
  });

  const colorByCompany = Object.fromEntries(companies.map((company, index) => [company, PIE_COLORS[index % PIE_COLORS.length]]));

  const tableRows = companies.map((company, index) => {
    const valuesByPeriod: Record<string, number> = {};
    let companyTotal = 0;

    periods.forEach((period) => {
      const raw = periodMap.get(period.key) || {};
      const pax = Number(raw?.[company] || 0);
      companyTotal += pax;
      valuesByPeriod[period.key] = period.paxTotal > 0 ? (pax / period.paxTotal) * 100 : 0;
    });

    return {
      empresa: company,
      color: PIE_COLORS[index % PIE_COLORS.length],
      valuesByPeriod,
      totalShare: totalPax > 0 ? (companyTotal / totalPax) * 100 : 0,
    };
  });

  return {
    chartData,
    periods,
    companies,
    colorByCompany,
    tableRows,
    totals: {
      pax: totalPax,
      viagens: totalViagens,
      ipv: totalViagens > 0 ? totalPax / totalViagens : 0,
    },
  };
};

const WeeklyComparisonTooltip = ({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) => {
  if (!active || !payload?.length) return null;

  const companyItems = payload
    .filter((item) => !isViagensSeries(item))
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));
  const viagensItem = payload.find((item) => isViagensSeries(item));
  const paxTotal = companyItems.reduce((acc, item) => acc + Number(item?.value || 0), 0);
  const viagens = Number(viagensItem?.value || payload[0]?.payload?.viagens || 0);
  const ipv = viagens > 0 ? paxTotal / viagens : 0;

  return (
    <div className="max-h-[360px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">{label || '-'}</p>

      <div className="mt-2 space-y-1 overflow-y-auto custom-scrollbar pr-1">
        {companyItems.map((item, index) => (
          <p key={`${item.name}-${index}`} className="text-xs font-bold" style={{ color: item.color || '#334155' }}>
            {item.name}: {formatInt(Number(item.value || 0))}
          </p>
        ))}

        <div className="my-2 border-t border-slate-300" />
        <p className="text-xs font-black text-slate-700">Viagens: {formatInt(viagens)}</p>
        <p className="text-xs font-black text-cyan-700">IPV: {formatDecimal(ipv)}</p>
      </div>
    </div>
  );
};

const ComparativoSemanalSection = ({ rows, loading }: { rows: RioShareRow[]; loading: boolean }) => {
  const { chartData, periods, companies, colorByCompany, tableRows, totals } = useMemo(() => buildWeeklyComparisonData(rows), [rows]);

  const paxAxisConfig = useMemo(() => {
    let maxValue = 0;
    chartData.forEach((row) => {
      companies.forEach((company) => {
        maxValue = Math.max(maxValue, Number(row?.[company] || 0));
      });
    });

    return buildDynamicAxisConfig(maxValue, 6);
  }, [chartData, companies]);

  const viagensAxisConfig = useMemo(() => {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = 0;

    chartData.forEach((row) => {
      const value = Number(row?.viagens || 0);
      if (!Number.isFinite(value) || value <= 0) return;

      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    });

    return buildDynamicAxisRangeConfig(
      Number.isFinite(minValue) ? minValue : 0,
      maxValue,
      6,
    );
  }, [chartData]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-2 text-indigo-700">
            <BarChart3 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Comparativo Semanal</h3>
            <p className="text-xs font-semibold text-slate-400">Eixo X por mes/semana, colunas por empresa e linha de viagens</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">PAX</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
              {totals.pax >= 1000000 ? formatCompactMi(totals.pax) : formatInt(totals.pax)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Viagens</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
              {totals.viagens >= 1000 ? formatCompactMil(totals.viagens) : formatInt(totals.viagens)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">IPV</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">{formatInt(Math.round(totals.ipv || 0))}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-3">
        {loading ? (
          <div className="flex h-[440px] items-center justify-center text-sm font-black text-slate-400">Carregando grafico...</div>
        ) : chartData.length === 0 ? (
          <div className="flex h-[440px] items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
        ) : (
          <div className="h-[440px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2} barCategoryGap="12%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="periodLabel" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={formatInt}
                  domain={[0, paxAxisConfig.upperBound]}
                  ticks={paxAxisConfig.ticks}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                  label={{ value: 'PAX', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontWeight: 800, fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={formatInt}
                  domain={[viagensAxisConfig.lowerBound, viagensAxisConfig.upperBound]}
                  ticks={viagensAxisConfig.ticks}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                  label={{ value: 'VIAGENS', angle: 90, position: 'insideRight', style: { fill: '#64748b', fontWeight: 800, fontSize: 11 } }}
                />
                <Tooltip content={<WeeklyComparisonTooltip />} cursor={false} />
                <Legend content={<PaxLegend />} />

                {companies.map((company) => (
                  <Bar
                    key={company}
                    yAxisId="left"
                    dataKey={company}
                    name={company}
                    fill={String(colorByCompany[company] || '#1d4ed8')}
                    radius={[1, 1, 0, 0]}
                    maxBarSize={20}
                  />
                ))}

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="viagens"
                  name="VIAGENS"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  strokeDasharray="3 3"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="mt-4 overflow-auto rounded-3xl border border-slate-100">
        <table className="min-w-full text-sm">
          <thead className="sticky top-0 bg-slate-900 text-white">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Empresa</th>
              {periods.map((period) => (
                <th key={period.key} className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">{period.label}</th>
              ))}
              <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">Total</th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.empresa} className="border-b border-slate-100 text-slate-700 even:bg-slate-50/60 hover:bg-blue-50/40 transition-colors">
                <td className="px-3 py-2 text-xs font-black uppercase">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                    {row.empresa}
                  </span>
                </td>
                {periods.map((period) => (
                  <td key={`${row.empresa}-${period.key}`} className="px-3 py-2 text-right text-xs font-bold">
                    {formatPercent(Number(row.valuesByPeriod[period.key] || 0))}
                  </td>
                ))}
                <td className="px-3 py-2 text-right text-xs font-black">{formatPercent(row.totalShare)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-900 text-white">
            <tr>
              <td className="px-3 py-2 text-xs font-black uppercase">Total</td>
              {periods.map((period) => (
                <td key={`total-${period.key}`} className="px-3 py-2 text-right text-xs font-black">100,00%</td>
              ))}
              <td className="px-3 py-2 text-right text-xs font-black">100,00%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
};

const buildDailyMonitoringData = (rows: RioShareRow[]) => {
  const dayMap = new Map<number, any>();
  const companyTotals = new Map<string, number>();
  let totalPax = 0;
  let totalViagens = 0;

  rows.forEach((row) => {
    const day = Number(row.dia || 0);
    if (!Number.isFinite(day) || day <= 0 || day > 31) return;

    const base = dayMap.get(day) || {
      day,
      dayLabel: String(day),
      paxTotal: 0,
      viagensTotal: 0,
    };

    const pax = Number(row.pax || 0);
    const viagens = Number(row.viagens || 0);
    const companyName = String(row.empresa || '').trim();

    base.paxTotal += pax;
    base.viagensTotal += viagens;

    if (companyName) {
      base[`${companyName}__pax`] = Number(base[`${companyName}__pax`] || 0) + pax;
      base[`${companyName}__viagens`] = Number(base[`${companyName}__viagens`] || 0) + viagens;
      companyTotals.set(companyName, Number(companyTotals.get(companyName) || 0) + pax);
    }

    dayMap.set(day, base);
    totalPax += pax;
    totalViagens += viagens;
  });

  const companies = Array.from(companyTotals.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([company]) => company);

  const colorByCompany = Object.fromEntries(companies.map((company, index) => [company, PIE_COLORS[index % PIE_COLORS.length]]));
  const orderedDays = Array.from(dayMap.values()).sort((a, b) => a.day - b.day);

  const passageirosData = orderedDays.map((row) => {
    const item: Record<string, any> = {
      day: row.day,
      dayLabel: row.dayLabel,
      paxTotal: Number(row.paxTotal || 0),
      viagensTotal: Number(row.viagensTotal || 0),
    };

    companies.forEach((company) => {
      item[company] = Number(row?.[`${company}__pax`] || 0);
    });

    return item;
  });

  const viagensData = orderedDays.map((row) => {
    const item: Record<string, any> = {
      day: row.day,
      dayLabel: row.dayLabel,
      paxTotal: Number(row.paxTotal || 0),
      viagensTotal: Number(row.viagensTotal || 0),
    };

    companies.forEach((company) => {
      item[company] = Number(row?.[`${company}__viagens`] || 0);
      item[`${company}__viagens`] = Number(row?.[`${company}__viagens`] || 0);
      item[`${company}__pax`] = Number(row?.[`${company}__pax`] || 0);
    });

    return item;
  });

  return {
    companies,
    colorByCompany,
    passageirosData,
    viagensData,
    totals: {
      pax: totalPax,
      viagens: totalViagens,
      ipv: totalViagens > 0 ? totalPax / totalViagens : 0,
    },
  };
};

const DailyMonitoringTooltip = ({ active, payload, label, mode }: {
  active?: boolean;
  payload?: any[];
  label?: string;
  mode: 'passageiros' | 'viagens';
}) => {
  if (!active || !payload?.length) return null;

  const companyItems = payload
    .filter((item) => Number(item?.value || 0) > 0)
    .sort((a, b) => Number(b?.value || 0) - Number(a?.value || 0));

  const row = payload[0]?.payload || {};
  const paxTotal = Number(row?.paxTotal || 0);
  const viagensTotal = Number(row?.viagensTotal || 0);
  const ipv = viagensTotal > 0 ? paxTotal / viagensTotal : 0;

  const extraLabel = mode === 'passageiros' ? 'Viagens' : 'Passageiros';
  const extraValue = mode === 'passageiros' ? viagensTotal : paxTotal;

  if (mode === 'viagens') {
    return (
      <div className="relative z-[2200] w-[430px] max-w-[90vw] max-h-[420px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
        <p className="text-xs font-black uppercase tracking-widest text-slate-500">Dia {label || '-'}</p>

        <div className="mt-2 grid grid-cols-[170px_76px_66px_66px] items-center gap-x-1 px-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <span>Empresa</span>
          <span className="text-right">Viagens</span>
          <span className="text-right">%</span>
          <span className="text-right">IPV</span>
        </div>

        <div className="mt-1 max-h-[330px] overflow-y-auto custom-scrollbar space-y-0.5 pr-1">
          {companyItems.map((item, index) => {
            const company = String(item?.name || '').trim();
            const viagens = Number(row?.[`${company}__viagens`] || 0);
            const share = Number(item?.value || 0);
            const pax = Number(row?.[`${company}__pax`] || 0);
            const companyIpv = viagens > 0 ? pax / viagens : 0;

            return (
              <div key={`${company}-${index}`} className="grid grid-cols-[170px_76px_66px_66px] items-center gap-x-1 rounded-md px-1 py-0.5 text-xs font-bold text-slate-700">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || '#334155' }} />
                  <span className="truncate" style={{ color: item.color || '#334155' }}>{company}</span>
                </span>
                <span className="text-right tabular-nums">{formatInt(viagens)}</span>
                <span className="text-right tabular-nums">{formatPercent(share)}</span>
                <span className="text-right tabular-nums text-cyan-700">{formatDecimal(companyIpv)}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-[2200] min-w-[300px] max-h-[360px] rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur-sm">
      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Dia {label || '-'}</p>

      <div className="mt-2 space-y-1 overflow-y-auto custom-scrollbar pr-1">
        {companyItems.map((item, index) => (
          <p key={`${item.name}-${index}`} className="text-xs font-bold" style={{ color: item.color || '#334155' }}>
            {item.name}: {formatInt(Number(item.value || 0))}
          </p>
        ))}

        <div className="my-2 border-t border-slate-300" />
        <p className="text-xs font-black text-slate-700">{extraLabel}: {formatInt(extraValue)}</p>
        <p className="text-xs font-black text-cyan-700">IPV: {formatDecimal(ipv)}</p>
      </div>
    </div>
  );
};

const AcompanhamentoDiarioSection = ({ rows, loading }: { rows: RioShareRow[]; loading: boolean }) => {
  const { companies, colorByCompany, passageirosData, viagensData, totals } = useMemo(() => buildDailyMonitoringData(rows), [rows]);

  const passageirosAxisConfig = useMemo(() => {
    let maxValue = 0;
    passageirosData.forEach((row) => {
      companies.forEach((company) => {
        maxValue = Math.max(maxValue, Number(row?.[company] || 0));
      });
    });

    return buildDynamicAxisConfig(maxValue, 6);
  }, [passageirosData, companies]);

  const viagensPercentData = useMemo(() => {
    return viagensData.map((row) => {
      const total = companies.reduce((acc, company) => acc + Number(row?.[`${company}__viagens`] || row?.[company] || 0), 0);
      const nextRow: Record<string, any> = { ...row };

      companies.forEach((company) => {
        const raw = Number(row?.[`${company}__viagens`] || row?.[company] || 0);
        nextRow[company] = total > 0 ? (raw / total) * 100 : 0;
      });

      return nextRow;
    });
  }, [viagensData, companies]);

  const noData = passageirosData.length === 0;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-2 text-emerald-700">
              <CalendarDays size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Acompanhamento Diario</h3>
              <p className="text-xs font-semibold text-slate-400">Passageiros e viagens por dia, com leitura por empresa</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">PAX</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
                {totals.pax >= 1000000 ? formatCompactMi(totals.pax) : formatInt(totals.pax)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Viagens</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
                {totals.viagens >= 1000 ? formatCompactMil(totals.viagens) : formatInt(totals.viagens)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">IPV</p>
              <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">{formatInt(Math.round(totals.ipv || 0))}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-3">
            <p className="mb-2 text-center text-3xl font-light tracking-tight text-slate-800">Passageiros</p>
            {loading ? (
              <div className="flex h-[360px] items-center justify-center text-sm font-black text-slate-400">Carregando grafico...</div>
            ) : noData ? (
              <div className="flex h-[360px] items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={passageirosData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={formatInt}
                      domain={[0, passageirosAxisConfig.upperBound]}
                      ticks={passageirosAxisConfig.ticks}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                    />
                    <Tooltip content={<DailyMonitoringTooltip mode="passageiros" />} cursor={false} wrapperStyle={{ zIndex: 2200, pointerEvents: 'none' }} />
                    <Legend content={<PaxLegend />} />

                    {companies.map((company) => (
                      <Line
                        key={`pax-${company}`}
                        yAxisId="left"
                        type="monotone"
                        dataKey={company}
                        name={company}
                        stroke={String(colorByCompany[company] || '#1d4ed8')}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-3">
            <p className="mb-2 text-center text-3xl font-light tracking-tight text-slate-800">Viagens</p>
            {loading ? (
              <div className="flex h-[320px] items-center justify-center text-sm font-black text-slate-400">Carregando grafico...</div>
            ) : noData ? (
              <div className="flex h-[320px] items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
            ) : (
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={viagensPercentData} barGap={2} barCategoryGap="12%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                    <YAxis
                      yAxisId="left"
                      tickFormatter={formatPercentTick}
                      domain={[0, 100]}
                      ticks={[0, 20, 40, 60, 80, 100]}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                    />
                    <Tooltip content={<DailyMonitoringTooltip mode="viagens" />} cursor={false} wrapperStyle={{ zIndex: 2200, pointerEvents: 'none' }} />
                    <Legend content={<PaxLegend />} />

                    {companies.map((company) => (
                      <Bar
                        key={`viagens-${company}`}
                        yAxisId="left"
                        stackId="viagens-stack"
                        dataKey={company}
                        name={company}
                        fill={String(colorByCompany[company] || '#1d4ed8')}
                        radius={[1, 1, 0, 0]}
                        maxBarSize={16}
                      />
                    ))}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
};

const parseHorarioToMinutes = (horario: string) => {
  const match = String(horario || '').match(/^(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!match) return Number.POSITIVE_INFINITY;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const buildQuadroHorariosData = (rows: RioShareRow[], dayStart: number, dayEnd: number) => {
  const days: number[] = [];
  for (let day = dayStart; day <= dayEnd; day += 1) days.push(day);

  const hourMap = new Map<string, {
    horario: string;
    valuesByDay: Record<number, number>;
    total: number;
    companies: Map<string, { empresa: string; valuesByDay: Record<number, number>; total: number }>;
  }>();

  const dayTotals: Record<number, number> = Object.fromEntries(days.map((day) => [day, 0]));
  let totalPax = 0;
  let totalViagens = 0;

  rows.forEach((row) => {
    const dia = Number(row.dia || 0);
    if (!Number.isFinite(dia) || dia < dayStart || dia > dayEnd) return;

    const horario = String(row.horario || 'SEM HORARIO').trim() || 'SEM HORARIO';
    const empresa = String(row.empresa || '').trim() || 'SEM EMPRESA';
    const pax = Number(row.pax || 0);
    const viagens = Number(row.viagens || 0);

    if (!hourMap.has(horario)) {
      hourMap.set(horario, {
        horario,
        valuesByDay: Object.fromEntries(days.map((day) => [day, 0])),
        total: 0,
        companies: new Map(),
      });
    }

    const hourEntry = hourMap.get(horario)!;
    hourEntry.valuesByDay[dia] = Number(hourEntry.valuesByDay[dia] || 0) + pax;
    hourEntry.total += pax;

    if (!hourEntry.companies.has(empresa)) {
      hourEntry.companies.set(empresa, {
        empresa,
        valuesByDay: Object.fromEntries(days.map((day) => [day, 0])),
        total: 0,
      });
    }

    const companyEntry = hourEntry.companies.get(empresa)!;
    companyEntry.valuesByDay[dia] = Number(companyEntry.valuesByDay[dia] || 0) + pax;
    companyEntry.total += pax;

    dayTotals[dia] = Number(dayTotals[dia] || 0) + pax;
    totalPax += pax;
    totalViagens += viagens;
  });

  const tableRows: Array<{
    key: string;
    kind: 'hour' | 'company';
    label: string;
    valuesByDay: Record<number, number>;
    total: number;
  }> = [];

  const sortedHours = Array.from(hourMap.values()).sort((a, b) => {
    const aMinutes = parseHorarioToMinutes(a.horario);
    const bMinutes = parseHorarioToMinutes(b.horario);
    if (Number.isFinite(aMinutes) && Number.isFinite(bMinutes)) return aMinutes - bMinutes;
    if (Number.isFinite(aMinutes)) return -1;
    if (Number.isFinite(bMinutes)) return 1;
    return a.horario.localeCompare(b.horario);
  });

  sortedHours.forEach((hourEntry) => {
    tableRows.push({
      key: `h-${hourEntry.horario}`,
      kind: 'hour',
      label: hourEntry.horario,
      valuesByDay: hourEntry.valuesByDay,
      total: hourEntry.total,
    });

    const companies = Array.from(hourEntry.companies.values())
      .sort((a, b) => b.total - a.total || a.empresa.localeCompare(b.empresa));

    companies.forEach((companyEntry) => {
      tableRows.push({
        key: `c-${hourEntry.horario}-${companyEntry.empresa}`,
        kind: 'company',
        label: companyEntry.empresa,
        valuesByDay: companyEntry.valuesByDay,
        total: companyEntry.total,
      });
    });
  });

  return {
    days,
    tableRows,
    dayTotals,
    totals: {
      pax: totalPax,
      viagens: totalViagens,
      ipv: totalViagens > 0 ? totalPax / totalViagens : 0,
    },
  };
};

const QuadroHorariosSection = ({ rows, loading, dayStart, dayEnd }: { rows: RioShareRow[]; loading: boolean; dayStart: number; dayEnd: number }) => {
  const { days, tableRows, dayTotals, totals } = useMemo(
    () => buildQuadroHorariosData(rows, dayStart, dayEnd),
    [rows, dayStart, dayEnd],
  );

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-100 p-2 text-slate-700">
            <Table2 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Quadro de Horarios</h3>
            <p className="text-xs font-semibold text-slate-400">Linhas por horario e empresa, colunas por dia com soma de passageiros</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">IPV</p>
          <p className="mt-1 text-3xl font-black tracking-tight text-rose-500">{formatInt(Math.round(totals.ipv || 0))}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-2">
        {loading ? (
          <div className="flex h-[560px] items-center justify-center text-sm font-black text-slate-400">Carregando tabela...</div>
        ) : !tableRows.length ? (
          <div className="flex h-[560px] items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
        ) : (
          <div className="max-h-[620px] overflow-auto custom-scrollbar">
            <table className="min-w-[1460px] text-sm">
              <thead className="sticky top-0 bg-slate-900 text-white">
                <tr>
                  <th className="min-w-[170px] px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">Horario</th>
                  {days.map((day) => (
                    <th key={`day-h-${day}`} className="px-2 py-2 text-right text-[11px] font-black uppercase tracking-wider">{day}</th>
                  ))}
                  <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">Total</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr
                    key={row.key}
                    className={cn(
                      'border-b border-slate-100 text-slate-700',
                      row.kind === 'hour'
                        ? 'bg-slate-100/70 font-black'
                        : 'bg-white even:bg-slate-50/70',
                    )}
                  >
                    <td className={cn('min-w-[170px] px-3 py-1.5 text-xs', row.kind === 'hour' ? 'font-black tabular-nums text-slate-800' : 'pl-6 font-semibold text-slate-600')}>
                      {row.label}
                    </td>
                    {days.map((day) => {
                      const value = Number(row.valuesByDay[day] || 0);
                      return (
                        <td key={`${row.key}-${day}`} className="px-2 py-1.5 text-right text-xs font-bold tabular-nums text-slate-700">
                          {value > 0 ? formatInt(value) : ''}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right text-xs font-black tabular-nums text-slate-800">{formatInt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-slate-900 text-white">
                <tr>
                  <td className="px-3 py-2 text-xs font-black uppercase">Total</td>
                  {days.map((day) => (
                    <td key={`day-t-${day}`} className="px-2 py-2 text-right text-xs font-black tabular-nums">
                      {formatInt(Number(dayTotals[day] || 0))}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right text-xs font-black tabular-nums">{formatInt(totals.pax)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
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
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className={cn('relative space-y-1.5', open ? 'z-[980]' : 'z-10')} ref={ref}>
      <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            'w-full rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-left text-xs font-black uppercase tracking-wide text-slate-700 shadow-sm transition-all',
            open ? 'border-blue-600 ring-4 ring-blue-500/10' : 'hover:border-slate-300',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="truncate">{selected.size}/{options.length} selecionados</span>
            <span className={cn('text-xs font-black text-slate-400 transition-transform', open && 'rotate-180 text-blue-600')}>v</span>
          </div>
        </button>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            className="absolute z-[999] mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-2xl"
          >
            <div className="mb-2 flex items-center justify-between px-2">
              <button type="button" onClick={onSelectAll} className="text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-800">
                Marcar todos
              </button>
              <button type="button" onClick={onClear} className="text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-slate-700">
                Limpar
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
              {options.map((option) => {
                const isActive = selected.has(option);
                return (
                  <button
                    type="button"
                    key={option}
                    onClick={() => onToggle(option)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold transition-colors',
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    <span className={cn('inline-flex h-4 w-4 items-center justify-center rounded border text-[10px]', isActive ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                      {isActive ? 'x' : ''}
                    </span>
                    <span className="truncate">{option}</span>
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

const DayRangeFilter = ({
  dayStart,
  dayEnd,
  onDayStart,
  onDayEnd,
}: {
  dayStart: number;
  dayEnd: number;
  onDayStart: (value: number) => void;
  onDayEnd: (value: number) => void;
}) => {
  const safeStart = Math.min(dayStart, dayEnd);
  const safeEnd = Math.max(dayStart, dayEnd);
  const startPercent = ((safeStart - 1) / 30) * 100;
  const endPercent = ((safeEnd - 1) / 30) * 100;

  return (
    <div className="space-y-2">
      <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Intervalo de dia (1-31)</label>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          min={1}
          max={31}
          value={safeStart}
          onChange={(event) => onDayStart(Number(event.target.value))}
          className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-black text-slate-700 outline-none focus:border-blue-600"
        />
        <input
          type="number"
          min={1}
          max={31}
          value={safeEnd}
          onChange={(event) => onDayEnd(Number(event.target.value))}
          className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-black text-slate-700 outline-none focus:border-blue-600"
        />
      </div>
      <div className="relative h-8 rounded-lg bg-slate-50 px-1">
        <div className="absolute left-2 right-2 top-1/2 h-1 -translate-y-1/2 rounded-full bg-slate-200" />
        <div
          className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-blue-500"
          style={{
            left: `calc(${startPercent}% + 8px)`,
            right: `calc(${100 - endPercent}% + 8px)`,
          }}
        />
        <input
          aria-label="Dia inicial"
          type="range"
          min={1}
          max={31}
          value={safeStart}
          onChange={(event) => onDayStart(Number(event.target.value))}
          className="dual-range absolute inset-0 w-full"
        />
        <input
          aria-label="Dia final"
          type="range"
          min={1}
          max={31}
          value={safeEnd}
          onChange={(event) => onDayEnd(Number(event.target.value))}
          className="dual-range absolute inset-0 w-full"
        />
      </div>
    </div>
  );
};

const ShareSection = ({
  title,
  subtitle,
  headerLabel,
  rows,
  loading,
}: {
  title: string;
  subtitle: string;
  headerLabel: string;
  rows: ShareAggRow[];
  loading: boolean;
}) => {
  const totals = useMemo(() => {
    const pax = rows.reduce((acc, row) => acc + row.pax, 0);
    const viagens = rows.reduce((acc, row) => acc + row.viagens, 0);
    const ipv = viagens > 0 ? pax / viagens : 0;
    return { pax, viagens, ipv };
  }, [rows]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-2 text-blue-700">
            <Layers3 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">{title}</h3>
            <p className="text-xs font-semibold text-slate-400">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="h-[460px] rounded-3xl border border-slate-100 bg-slate-50/50 p-3">
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm font-black text-slate-400">Carregando grafico...</div>
          ) : rows.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="pax"
                  nameKey="categoria"
                  cx="50%"
                  cy="50%"
                  outerRadius={(entry: any) => Number(entry?.outerRadius || 160)}
                  innerRadius={58}
                  startAngle={90}
                  endAngle={-270}
                  cornerRadius={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {rows.map((entry, index) => (
                    <Cell key={`${entry.categoria}-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} cursor={false} />
                <Legend wrapperStyle={{ fontSize: 11, fontWeight: 700 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="overflow-auto rounded-3xl border border-slate-100">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 bg-slate-900 text-white">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-black uppercase tracking-wider">{headerLabel}</th>
                <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">PAX</th>
                <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">Viagens</th>
                <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">IPV</th>
                <th className="px-3 py-2 text-right text-[11px] font-black uppercase tracking-wider">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.categoria} className="border-b border-slate-100 text-slate-700 even:bg-slate-50/60 hover:bg-blue-50/40 transition-colors">
                  <td className="px-3 py-2 text-xs font-black uppercase">{row.categoria}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatInt(row.pax)}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatInt(row.viagens)}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatDecimal(row.ipv)}</td>
                  <td className="px-3 py-2 text-right text-xs font-bold">{formatPercent(row.share)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-900 text-white">
              <tr>
                <td className="px-3 py-2 text-xs font-black uppercase">Total</td>
                <td className="px-3 py-2 text-right text-xs font-black">{formatInt(totals.pax)}</td>
                <td className="px-3 py-2 text-right text-xs font-black">{formatInt(totals.viagens)}</td>
                <td className="px-3 py-2 text-right text-xs font-black">{formatDecimal(totals.ipv)}</td>
                <td className="px-3 py-2 text-right text-xs font-black">100,00%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </Card>
  );
};

const PaxViagensSection = ({ rows, loading }: { rows: RioShareRow[]; loading: boolean }) => {
  const { data, companies, colorByCompany, totals } = useMemo(() => buildPaxViagensData(rows), [rows]);
  const [displayMode, setDisplayMode] = useState<'absoluto' | 'percentual'>('absoluto');

  const chartData = useMemo(() => {
    if (displayMode === 'absoluto') return data;

    return data.map((row) => {
      const monthTotalPax = companies.reduce((acc, company) => acc + Number(row?.[company] || 0), 0);
      const nextRow: Record<string, any> = { ...row };

      companies.forEach((company) => {
        const raw = Number(row?.[company] || 0);
        nextRow[company] = monthTotalPax > 0 ? (raw / monthTotalPax) * 100 : 0;
      });

      return nextRow;
    });
  }, [data, companies, displayMode]);

  const paxAxisConfig = useMemo(() => {
    if (displayMode === 'percentual') {
      let minValue = Number.POSITIVE_INFINITY;
      let maxValue = 0;

      chartData.forEach((row) => {
        companies.forEach((company) => {
          const value = Number(row?.[company] || 0);
          if (!Number.isFinite(value) || value <= 0) return;

          minValue = Math.min(minValue, value);
          maxValue = Math.max(maxValue, value);
        });
      });

      if (!Number.isFinite(minValue) || maxValue <= 0) {
        return { lowerBound: 0, upperBound: 100, ticks: [0, 20, 40, 60, 80, 100] };
      }

      return buildDynamicAxisRangeConfig(minValue, maxValue, 6);
    }

    let maxValue = 0;
    chartData.forEach((row) => {
      companies.forEach((company) => {
        maxValue = Math.max(maxValue, Number(row?.[company] || 0));
      });
    });

    const axis = buildDynamicAxisConfig(maxValue, 6);
    return { lowerBound: 0, upperBound: axis.upperBound, ticks: axis.ticks };
  }, [chartData, companies, displayMode]);

  const viagensAxisConfig = useMemo(() => {
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = 0;

    chartData.forEach((row) => {
      const value = Number(row?.viagens || 0);
      if (!Number.isFinite(value) || value <= 0) return;

      minValue = Math.min(minValue, value);
      maxValue = Math.max(maxValue, value);
    });

    return buildDynamicAxisRangeConfig(
      Number.isFinite(minValue) ? minValue : 0,
      maxValue,
      6,
    );
  }, [chartData]);

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50 p-2 text-cyan-700">
            <BusFront size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Pax/Viagens (Mercado)</h3>
            <p className="text-xs font-semibold text-slate-400">Eixo X por mes, barras de PAX e linha de viagens</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">PAX</p>
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-[10px] font-black uppercase tracking-wider">
                <button
                  type="button"
                  onClick={() => setDisplayMode('absoluto')}
                  className={cn('rounded-md px-2 py-0.5 transition-colors', displayMode === 'absoluto' ? 'bg-cyan-100 text-cyan-700' : 'text-slate-500')}
                >
                  Absoluto
                </button>
                <button
                  type="button"
                  onClick={() => setDisplayMode('percentual')}
                  className={cn('rounded-md px-2 py-0.5 transition-colors', displayMode === 'percentual' ? 'bg-cyan-100 text-cyan-700' : 'text-slate-500')}
                >
                  %
                </button>
              </div>
            </div>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
              {totals.pax >= 1000000 ? formatCompactMi(totals.pax) : formatInt(totals.pax)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Viagens</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">
              {totals.viagens >= 1000 ? formatCompactMil(totals.viagens) : formatInt(totals.viagens)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">IPV</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-slate-800">{formatInt(Math.round(totals.ipv || 0))}</p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-slate-50/50 p-3">
        {loading ? (
          <div className="flex h-[440px] items-center justify-center text-sm font-black text-slate-400">Carregando grafico...</div>
        ) : data.length === 0 ? (
          <div className="flex h-[440px] items-center justify-center text-sm font-black text-slate-400">Sem dados para os filtros atuais.</div>
        ) : (
          <div className="h-[440px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} barGap={2} barCategoryGap="12%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={displayMode === 'percentual' ? formatPercentTick : formatInt}
                  domain={displayMode === 'percentual' ? [paxAxisConfig.lowerBound, paxAxisConfig.upperBound] : [0, paxAxisConfig.upperBound]}
                  ticks={paxAxisConfig.ticks}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                  label={{ value: displayMode === 'percentual' ? 'PAX %' : 'PAX', angle: -90, position: 'insideLeft', style: { fill: '#64748b', fontWeight: 800, fontSize: 11 } }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={formatInt}
                  domain={[viagensAxisConfig.lowerBound, viagensAxisConfig.upperBound]}
                  ticks={viagensAxisConfig.ticks}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                  label={{ value: 'VIAGENS', angle: 90, position: 'insideRight', style: { fill: '#64748b', fontWeight: 800, fontSize: 11 } }}
                />
                <Tooltip content={<PaxTooltip mode={displayMode} />} cursor={false} />
                <Legend content={<PaxLegend />} />

                {companies.map((company) => (
                  <Bar
                    key={company}
                    yAxisId="left"
                    dataKey={company}
                    name={company}
                    fill={String(colorByCompany[company] || '#1d4ed8')}
                    radius={[1, 1, 0, 0]}
                    maxBarSize={20}
                  />
                ))}

                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="viagens"
                  name="VIAGENS"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  strokeDasharray="3 3"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  );
};

const RioShareDashboardView = () => {
  const [payload, setPayload] = useState<RioSharePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [baseDir, setBaseDir] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_RIO_SHARE_BASE_DIR);
  const [baseDirDraft, setBaseDirDraft] = useState<string>(() => localStorage.getItem(STORAGE_KEY) || DEFAULT_RIO_SHARE_BASE_DIR);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const [selectedScreens, setSelectedScreens] = useState<Set<ScreenId>>(new Set<ScreenId>(['share_empresas']));
  const [screenFilters, setScreenFilters] = useState<ScreenFilterMap | null>(null);
  const [collapsedScreenFilters, setCollapsedScreenFilters] = useState<Record<ScreenId, boolean>>({
    share_empresas: true,
    share_grupos: true,
    pax_viagens_mercado: true,
    comparativo_semanal: true,
    acompanhamento_diario: true,
    quadro_horarios: true,
  });

  const loadData = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (baseDir.trim()) params.set('baseDir', baseDir.trim());
      if (force) params.set('noCache', '1');

      const response = await fetch(`/api/rio-share-dashboard?${params.toString()}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || 'Falha ao carregar dashboard Rio x SP.');
      }

      const nextPayload = json as RioSharePayload;
      setPayload(nextPayload);
      setLastRefresh(new Date());
      setScreenFilters(buildDefaultScreenFilters(nextPayload));
    } catch (err: any) {
      setError(err?.message || 'Falha desconhecida ao atualizar dashboard.');
    } finally {
      setLoading(false);
    }
  }, [baseDir]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleApplyBaseDir = () => {
    const normalized = baseDirDraft.trim() || DEFAULT_RIO_SHARE_BASE_DIR;
    setBaseDir(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
  };

  const handleChooseFolder = async () => {
    try {
      const response = await fetch('/api/abrir-explorador-pastas');
      const json = await response.json();
      if (json?.caminho) {
        setBaseDirDraft(json.caminho);
        setBaseDir(json.caminho);
        localStorage.setItem(STORAGE_KEY, json.caminho);
      }
    } catch {
      // Usuario ainda pode informar pasta manualmente.
    }
  };

  const rows = payload?.rows || [];
  const filters = payload?.filters;

  const updateScreenFilter = useCallback((screenId: ScreenId, updater: (current: ScreenFilters) => ScreenFilters) => {
    setScreenFilters((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [screenId]: updater(prev[screenId]),
      };
    });
  }, []);

  const updateScreenDayStart = (screenId: ScreenId, nextValue: number) => {
    updateScreenFilter(screenId, (current) => {
      const dayStart = Math.max(1, Math.min(31, Number(nextValue || 1)));
      const dayEnd = dayStart > current.dayEnd ? dayStart : current.dayEnd;
      return { ...current, dayStart, dayEnd };
    });
  };

  const updateScreenDayEnd = (screenId: ScreenId, nextValue: number) => {
    updateScreenFilter(screenId, (current) => {
      const dayEnd = Math.max(1, Math.min(31, Number(nextValue || 31)));
      const dayStart = dayEnd < current.dayStart ? dayEnd : current.dayStart;
      return { ...current, dayStart, dayEnd };
    });
  };

  const toggleScreenSetValue = (screenId: ScreenId, key: SetFilterKey, value: string) => {
    updateScreenFilter(screenId, (current) => {
      const nextSet = cloneSet(current[key]);
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
      return { ...current, [key]: nextSet };
    });
  };

  const selectAllScreenValues = (screenId: ScreenId, key: SetFilterKey, options: string[]) => {
    updateScreenFilter(screenId, (current) => ({
      ...current,
      [key]: toSet(options),
    }));
  };

  const clearScreenValues = (screenId: ScreenId, key: SetFilterKey) => {
    updateScreenFilter(screenId, (current) => ({
      ...current,
      [key]: new Set<string>(),
    }));
  };

  const toggleScreen = (screenId: ScreenId) => {
    setSelectedScreens((prev) => {
      const next = new Set(prev);
      if (next.has(screenId)) next.delete(screenId);
      else next.add(screenId);
      return next;
    });
  };

  const removeScreen = (screenId: ScreenId) => {
    setSelectedScreens((prev) => {
      const next = new Set(prev);
      next.delete(screenId);
      return next;
    });
  };

  const toggleScreenFilterCollapse = (screenId: ScreenId) => {
    setCollapsedScreenFilters((prev) => ({
      ...prev,
      [screenId]: !prev[screenId],
    }));
  };

  const rowsByScreen = useMemo(() => {
    const empty: Record<ScreenId, RioShareRow[]> = {
      share_empresas: [],
      share_grupos: [],
      pax_viagens_mercado: [],
      comparativo_semanal: [],
      acompanhamento_diario: [],
      quadro_horarios: [],
    };

    if (!screenFilters) return empty;

    const applyFilter = (screenId: ScreenId) => {
      const current = screenFilters[screenId];
      if (!current) return [];

      const dayStart = Math.min(current.dayStart, current.dayEnd);
      const dayEnd = Math.max(current.dayStart, current.dayEnd);
      const withDay = screenId !== 'pax_viagens_mercado' && screenId !== 'comparativo_semanal';

      return rows.filter((row) => (
        (!withDay || (row.dia >= dayStart && row.dia <= dayEnd))
        && current.companies.has(row.empresa)
        && current.groups.has(row.grupo)
        && current.modalities.has(row.modalidade)
        && current.origins.has(row.origem)
        && current.destinations.has(row.destino)
        && current.horarios.has(row.horario)
        && current.months.has(row.mes)
        && current.weeks.has(String(row.semana))
        && current.years.has(String(row.ano))
      ));
    };

    return {
      share_empresas: applyFilter('share_empresas'),
      share_grupos: applyFilter('share_grupos'),
      pax_viagens_mercado: applyFilter('pax_viagens_mercado'),
      comparativo_semanal: applyFilter('comparativo_semanal'),
      acompanhamento_diario: applyFilter('acompanhamento_diario'),
      quadro_horarios: applyFilter('quadro_horarios'),
    };
  }, [rows, screenFilters]);

  const shareRowsByCompany = useMemo(() => buildShareRows(rowsByScreen.share_empresas, 'empresa'), [rowsByScreen.share_empresas]);
  const shareRowsByGroup = useMemo(() => buildShareRows(rowsByScreen.share_grupos, 'grupo'), [rowsByScreen.share_grupos]);

  const visibleScreens = useMemo(
    () => SCREEN_OPTIONS.filter((screen) => selectedScreens.has(screen.id)),
    [selectedScreens],
  );

  const lineCountInfo = useMemo(() => {
    if (!visibleScreens.length) return 0;
    return visibleScreens.reduce((acc, screen) => acc + (rowsByScreen[screen.id]?.length || 0), 0);
  }, [visibleScreens, rowsByScreen]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <style>{`
        .dual-range {
          appearance: none;
          pointer-events: none;
          background: transparent;
        }
        .dual-range::-webkit-slider-thumb {
          appearance: none;
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid #64748b;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
        }
        .dual-range::-moz-range-thumb {
          pointer-events: auto;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          border: 2px solid #64748b;
          background: #ffffff;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.2);
        }
      `}</style>

      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-800">Dashboard RIO x SP</h2>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          Share, grupos e pax/viagens com filtros por tela
        </p>
      </div>

      <Card className="border-none bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 p-5 text-white">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-100/80">RIO x SP Dashboard</p>
            <h3 className="mt-1 text-xl font-black tracking-tight">Apresentacoes de Mercado</h3>
            <p className="mt-1 text-xs font-semibold text-blue-100/85">Status da base ativa e carga de dados</p>
          </div>
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-100/80">Arquivos lidos</p>
              <p className="mt-1 text-lg font-black">{formatInt(payload?.meta.filesRead || 0)}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-100/80">Registros parseados</p>
              <p className="mt-1 text-lg font-black">{formatInt(payload?.meta.records || 0)}</p>
            </div>
            <div className="rounded-xl bg-white/15 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-wider text-blue-100/80">Ultima atualizacao</p>
              <p className="mt-1 text-[11px] font-black">{lastRefresh ? lastRefresh.toLocaleString('pt-BR') : '-'}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs font-black text-rose-100">
            {error}
          </div>
        )}
      </Card>

      <Card className="relative z-[300] overflow-visible p-5">
        <div className="mb-4 flex items-center gap-2">
          <Table2 size={16} className="text-blue-600" />
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Janelas de apresentacao</h3>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_auto]">
          <div className="space-y-1.5">
            <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Base de dados</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={baseDirDraft}
                onChange={(event) => setBaseDirDraft(event.target.value)}
                placeholder="Caminho da base"
                className="h-10 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-black uppercase tracking-wide text-slate-700 outline-none transition-all focus:border-blue-600"
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="h-10 rounded-xl px-3 text-[11px]" onClick={handleChooseFolder}>
                  <FolderOpen size={14} className="mr-1.5" />
                  Escolher
                </Button>
                <Button className="h-10 rounded-xl px-3 text-[11px]" onClick={handleApplyBaseDir}>
                  Aplicar
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-end gap-2">
            <Button variant="secondary" className="h-10 rounded-xl px-3 text-[11px]" onClick={() => loadData({ force: true })} disabled={loading}>
              <RefreshCw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Telas ativas</label>
          <div className="flex flex-wrap gap-2">
            {SCREEN_OPTIONS.map((screen) => {
              const Icon = screen.icon;
              const active = selectedScreens.has(screen.id);
              return (
                <button
                  key={screen.id}
                  type="button"
                  onClick={() => toggleScreen(screen.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all',
                    active
                      ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                  )}
                >
                  <Icon size={13} />
                  {screen.label}
                  {active && <Check size={13} />}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {visibleScreens.map((screen) => {
        const screenId = screen.id;
        const filterState = screenFilters?.[screenId];
        if (!filterState) return null;

        const isCollapsed = !!collapsedScreenFilters[screenId];
        const showDayFilter = screenId !== 'pax_viagens_mercado' && screenId !== 'comparativo_semanal';
        const isShareCompany = screenId === 'share_empresas';
        const isShareGroup = screenId === 'share_grupos';
        const isQuadroHorarios = screenId === 'quadro_horarios';

        return (
          <div key={screenId} className="space-y-3">
            <Card className="relative z-[280] overflow-visible p-4">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => toggleScreenFilterCollapse(screenId)}
                  className="inline-flex items-center gap-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-600"
                >
                  {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  Filtros da tela: {SCREEN_LABELS[screenId]}
                </button>

                <button
                  type="button"
                  onClick={() => removeScreen(screenId)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <X size={12} />
                  Remover
                </button>
              </div>

              {!isCollapsed && (
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                  {showDayFilter && (
                    <DayRangeFilter
                      dayStart={filterState.dayStart}
                      dayEnd={filterState.dayEnd}
                      onDayStart={(value) => updateScreenDayStart(screenId, value)}
                      onDayEnd={(value) => updateScreenDayEnd(screenId, value)}
                    />
                  )}

                  <div className="space-y-2">
                    <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Modalidade</label>
                    <div className="flex flex-wrap gap-2">
                      {(filters?.modalities || []).map((item) => {
                        const active = filterState.modalities.has(item);
                        return (
                          <button
                            key={`${screenId}-${item}`}
                            type="button"
                            onClick={() => toggleScreenSetValue(screenId, 'modalities', item)}
                            className={cn(
                              'rounded-lg border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all',
                              active
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300',
                            )}
                          >
                            {item}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <MultiSelect
                    label="Origem"
                    options={filters?.origins || []}
                    selected={filterState.origins}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'origins', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'origins', filters?.origins || [])}
                    onClear={() => clearScreenValues(screenId, 'origins')}
                  />

                  <MultiSelect
                    label="Destino"
                    options={filters?.destinations || []}
                    selected={filterState.destinations}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'destinations', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'destinations', filters?.destinations || [])}
                    onClear={() => clearScreenValues(screenId, 'destinations')}
                  />

                  {isQuadroHorarios && (
                    <MultiSelect
                      label="Horario"
                      options={filters?.horarios || []}
                      selected={filterState.horarios}
                      onToggle={(value) => toggleScreenSetValue(screenId, 'horarios', value)}
                      onSelectAll={() => selectAllScreenValues(screenId, 'horarios', filters?.horarios || [])}
                      onClear={() => clearScreenValues(screenId, 'horarios')}
                    />
                  )}

                  <MultiSelect
                    label="Mes"
                    options={(filters?.months || []).map((item) => item.label)}
                    selected={filterState.months}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'months', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'months', (filters?.months || []).map((item) => item.label))}
                    onClear={() => clearScreenValues(screenId, 'months')}
                  />

                  <MultiSelect
                    label="Semana"
                    options={(filters?.weeks || []).map(String)}
                    selected={filterState.weeks}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'weeks', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'weeks', (filters?.weeks || []).map(String))}
                    onClear={() => clearScreenValues(screenId, 'weeks')}
                  />

                  <MultiSelect
                    label="Ano"
                    options={(filters?.years || []).map(String)}
                    selected={filterState.years}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'years', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'years', (filters?.years || []).map(String))}
                    onClear={() => clearScreenValues(screenId, 'years')}
                  />

                  <MultiSelect
                    label="Empresas"
                    options={filters?.companies || []}
                    selected={filterState.companies}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'companies', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'companies', filters?.companies || [])}
                    onClear={() => clearScreenValues(screenId, 'companies')}
                  />

                  <MultiSelect
                    label="Grupo"
                    options={filters?.groups || []}
                    selected={filterState.groups}
                    onToggle={(value) => toggleScreenSetValue(screenId, 'groups', value)}
                    onSelectAll={() => selectAllScreenValues(screenId, 'groups', filters?.groups || [])}
                    onClear={() => clearScreenValues(screenId, 'groups')}
                  />

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-500">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <Clock3 size={12} />
                      Linhas ativas
                    </div>
                    <p className="mt-1 text-base font-black tracking-tight text-slate-700">
                      {formatInt(rowsByScreen[screenId].length)}
                    </p>
                  </div>
                </div>
              )}
            </Card>

            {isShareCompany && (
              <ShareSection
                title="Share Mercado Empresas"
                subtitle="Distribuicao de PAX e viagens por empresa"
                headerLabel="Empresa"
                rows={shareRowsByCompany}
                loading={loading}
              />
            )}

            {isShareGroup && (
              <ShareSection
                title="Share Mercado Grupos"
                subtitle="Distribuicao de PAX e viagens por grupo"
                headerLabel="Grupo"
                rows={shareRowsByGroup}
                loading={loading}
              />
            )}

            {screenId === 'pax_viagens_mercado' && (
              <PaxViagensSection rows={rowsByScreen.pax_viagens_mercado} loading={loading} />
            )}

            {screenId === 'comparativo_semanal' && (
              <ComparativoSemanalSection rows={rowsByScreen.comparativo_semanal} loading={loading} />
            )}

            {screenId === 'acompanhamento_diario' && (
              <AcompanhamentoDiarioSection rows={rowsByScreen.acompanhamento_diario} loading={loading} />
            )}

            {screenId === 'quadro_horarios' && (
              <QuadroHorariosSection
                rows={rowsByScreen.quadro_horarios}
                loading={loading}
                dayStart={Math.min(filterState.dayStart, filterState.dayEnd)}
                dayEnd={Math.max(filterState.dayStart, filterState.dayEnd)}
              />
            )}
          </div>
        );
      })}

      {!visibleScreens.length && (
        <Card className="p-10 text-center text-sm font-bold text-slate-400">
          Nenhuma tela selecionada. Ative ao menos uma janela no painel acima.
        </Card>
      )}

      {!!payload?.meta?.warnings?.length && (
        <Card className="p-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            {payload.meta.warnings.join(' | ')}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <Database size={14} />
        {formatInt(lineCountInfo)} linhas consideradas nas telas ativas
      </div>
    </div>
  );
};

export default RioShareDashboardView;
