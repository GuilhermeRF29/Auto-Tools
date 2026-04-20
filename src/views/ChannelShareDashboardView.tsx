import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  AlertCircle,
  BarChart3,
  Camera,
  CalendarDays,
  Database,
  FileSpreadsheet,
  FolderOpen,
  Image as ImageIcon,
  Images,
  RefreshCw,
  Table2,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toPng } from 'html-to-image';
import Card from '../components/Card';
import Button from '../components/Button';
import { cn } from '../utils/cn';

const STORAGE_KEY_FILE_PATH = 'autotools:channelShareFilePath';

type MatrixCell = {
  value: string;
  isNegative: boolean;
  rawType?: string | null;
};

type MatrixTable = {
  range: string;
  rowCount: number;
  colCount: number;
  nonEmptyCount: number;
  rows: Array<{
    rowNumber: number;
    cells: MatrixCell[];
  }>;
};

type MonthSheetOption = {
  month: number;
  monthLabel: string;
  monthShort: string;
  sheetName: string;
};

type ChannelSharePayload = {
  meta: {
    baseDir: string;
    requestedBaseDir: string;
    filesRead: number;
    records: number;
    warnings: string[];
  };
  files: Array<{
    fileName: string;
    monthLabel: string;
    mtimeMs: number;
  }>;
  selectedFilePath: string;
  selectedFileName: string;
  selectedFileMtimeMs: number;
  sheets: string[];
  monthSheets: MonthSheetOption[];
  selectedSheetName: string;
  selectedMonthLabel: string;
  selectedMonthShort: string;
  updateInfo: {
    left: string;
    right: string;
    text: string;
  };
  tables: {
    financeiro: MatrixTable;
    passageiros: MatrixTable;
    ticketMedio: MatrixTable;
  };
};

const formatInt = (value: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(Math.round(value || 0));

const formatDateOnly = (value: number | null | undefined) => {
  if (!value || !Number.isFinite(value)) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('pt-BR');
};

const slugify = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'mes';

const normalizeText = (value: string) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const isComparativeHeader = (value: string) =>
  ['var', 'variacao', 'vs', 'dif', 'delta', 'comparativo', 'share', '%', 'p.p', 'pp'].some((token) => value.includes(token));

const isNegativeTextValue = (value: string) => {
  const text = String(value || '').trim();
  if (!text || text === '-') return false;
  if (/^\(.+\)$/.test(text) && /\d/.test(text)) return true;
  return /^[-−]/.test(text) || /\s[-−]\d/.test(text) || /[-−]\d/.test(text);
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

const withExpandedCaptureLayout = async <T,>(element: HTMLElement, runCapture: () => Promise<T>) => {
  const styleSnapshots: Array<{ el: HTMLElement; cssText: string }> = [];
  const nodes = new Set<HTMLElement>([
    element,
    ...Array.from(element.querySelectorAll<HTMLElement>('.custom-scrollbar')),
    ...Array.from(element.querySelectorAll<HTMLElement>('[class*="overflow-x-auto"], [class*="overflow-y-auto"]')),
  ]);

  const maxContentWidth = Math.ceil(
    Math.max(
      element.scrollWidth,
      ...Array.from(nodes).map((node) => node.scrollWidth || 0),
    ),
  );

  nodes.forEach((node) => {
    styleSnapshots.push({ el: node, cssText: node.style.cssText });

    node.style.overflow = 'visible';
    node.style.overflowX = 'visible';
    node.style.overflowY = 'visible';
    node.style.maxHeight = 'none';
    node.style.height = 'auto';
    node.style.width = `${Math.max(maxContentWidth, node.scrollWidth || 0)}px`;
    node.style.minWidth = `${Math.max(maxContentWidth, node.scrollWidth || 0)}px`;
  });

  try {
    await nextFrame();
    await nextFrame();
    return await runCapture();
  } finally {
    styleSnapshots.forEach(({ el, cssText }) => {
      el.style.cssText = cssText;
    });
  }
};

const captureElementImage = async (element: HTMLElement) => {
  const { dataUrl, width, height } = await withExpandedCaptureLayout(element, async () => {
    const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
    const height = Math.ceil(Math.max(element.scrollHeight, element.getBoundingClientRect().height));

    const dataUrl = await toPng(element, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio: 2,
      canvasWidth: width,
      canvasHeight: height,
      width,
      height,
    });

    return { dataUrl, width, height };
  });

  const image = await loadImage(dataUrl);
  return { dataUrl, image, width, height };
};

const downloadDataUrl = (dataUrl: string, fileName: string) => {
  const link = document.createElement('a');
  link.download = fileName;
  link.href = dataUrl;
  link.click();
};

const MatrixTableCard = ({
  title,
  subtitle,
  table,
  toneClass,
  captureRef,
}: {
  title: string;
  subtitle: string;
  table: MatrixTable | null | undefined;
  toneClass: string;
  captureRef?: RefObject<HTMLTableElement | null>;
}) => {
  const rows = table?.rows || [];
  const hasRows = rows.length > 0;
  const headerCells = hasRows ? rows[0].cells : [];
  const normalizedHeaders = headerCells.map((cell) => normalizeText(cell.value));
  const comparativeColumns = normalizedHeaders.map((header, idx) => {
    if (isComparativeHeader(header)) return true;
    if (!header) {
      const leftHeader = normalizedHeaders[idx - 1] || '';
      const rightHeader = normalizedHeaders[idx + 1] || '';
      return isComparativeHeader(leftHeader) && isComparativeHeader(rightHeader);
    }
    return false;
  });
  const bodyRows = hasRows ? rows.slice(1) : [];

  return (
    <div>
      <Card className="p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className={cn('rounded-2xl border p-2 text-sm shadow-sm', toneClass)}>
            <Table2 size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">{title}</h3>
            <p className="text-xs font-semibold text-slate-400">{subtitle}</p>
          </div>
        </div>

        {!hasRows ? (
          <div className="flex h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-200 text-sm font-black text-slate-400">
            Sem dados para exibir nesta tabela.
          </div>
        ) : (
          <div className="overflow-x-auto custom-scrollbar">
            <table ref={captureRef} className="w-full min-w-max border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  {headerCells.map((cell, colIdx) => (
                    <th
                      key={`header-${colIdx}`}
                      className={cn(
                        'px-3 py-2 text-[11px] font-black uppercase tracking-wider',
                        colIdx === 0 ? 'sticky left-0 z-20 min-w-[260px] bg-slate-900 text-left' : 'text-center',
                      )}
                    >
                      {cell.value || ' '}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyRows.map((row) => {
                  const rowLabel = normalizeText(row.cells[0]?.value || '');
                  const isCanaisRow = rowLabel.includes('canais');
                  const isTotalRow = rowLabel.includes('total');

                  return (
                    <tr key={`row-${row.rowNumber}`} className="border-b border-slate-100">
                      {row.cells.map((cell, colIdx) => {
                        const columnIsComparative = comparativeColumns[colIdx] || false;
                        const isNegative = cell.isNegative || isNegativeTextValue(cell.value);

                        return (
                          <td
                            key={`cell-${row.rowNumber}-${colIdx}`}
                            className={cn(
                              'px-3 py-2 text-[13px] font-bold',
                              colIdx === 0
                                ? 'sticky left-0 z-10 min-w-[260px] text-left font-black uppercase tracking-wide'
                                : 'text-right',
                              !isCanaisRow &&
                                !isTotalRow &&
                                (colIdx === 0 ? 'bg-white text-slate-700' : 'text-slate-800'),
                              isCanaisRow && (colIdx === 0 ? 'bg-black text-white' : 'bg-black text-white'),
                              isTotalRow &&
                                colIdx === 0 &&
                                'bg-slate-900 text-white',
                              isTotalRow &&
                                colIdx > 0 &&
                                !columnIsComparative &&
                                'bg-slate-900 text-white',
                              isTotalRow &&
                                colIdx > 0 &&
                                columnIsComparative &&
                                'bg-slate-200 text-slate-700',
                              isTotalRow &&
                                colIdx > 0 &&
                                !columnIsComparative &&
                                !String(cell.value || '').trim() &&
                                (comparativeColumns[colIdx - 1] || false) &&
                                (comparativeColumns[colIdx + 1] || false) &&
                                'bg-slate-200 text-slate-700',
                            )}
                            style={isNegative && colIdx > 0 ? { color: '#dc2626' } : undefined}
                          >
                            {cell.value || ' '}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

const ChannelShareDashboardView = () => {
  const [payload, setPayload] = useState<ChannelSharePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string>(() => localStorage.getItem(STORAGE_KEY_FILE_PATH) || '');
  const [selectedFilePathDraft, setSelectedFilePathDraft] = useState<string>(() => localStorage.getItem(STORAGE_KEY_FILE_PATH) || '');
  const [selectedSheetName, setSelectedSheetName] = useState<string>('');
  const [refreshAt, setRefreshAt] = useState<Date | null>(null);
  const [exportMode, setExportMode] = useState<'combined' | 'separate'>('combined');
  const [exporting, setExporting] = useState(false);

  const financeiroCaptureRef = useRef<HTMLTableElement>(null);
  const passageirosCaptureRef = useRef<HTMLTableElement>(null);

  const loadData = useCallback(async ({ force = false, nextSheetName, nextFilePath }: { force?: boolean; nextSheetName?: string; nextFilePath?: string } = {}) => {
    const activeFilePath = (typeof nextFilePath === 'string' ? nextFilePath : selectedFilePath).trim();

    if (!activeFilePath) {
      setPayload(null);
      setLoading(false);
      setError('Selecione o arquivo Excel para carregar o Share de Canais.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('filePath', activeFilePath);

      const sheetName = (typeof nextSheetName === 'string' ? nextSheetName : selectedSheetName).trim();
      if (sheetName) params.set('sheetName', sheetName);
      if (force) params.set('noCache', '1');

      const response = await fetch(`/api/channel-share-dashboard?${params.toString()}`);
      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || 'Falha ao carregar Share de Canais.');
      }

      const nextPayload = json as ChannelSharePayload;
      setPayload(nextPayload);
      setSelectedSheetName(nextPayload.selectedSheetName || '');
      setSelectedFilePath(nextPayload.selectedFilePath || activeFilePath);
      setSelectedFilePathDraft(nextPayload.selectedFilePath || activeFilePath);
      localStorage.setItem(STORAGE_KEY_FILE_PATH, nextPayload.selectedFilePath || activeFilePath);
      setRefreshAt(new Date());
    } catch (err: any) {
      setError(err?.message || 'Falha desconhecida ao carregar Share de Canais.');
    } finally {
      setLoading(false);
    }
  }, [selectedFilePath, selectedSheetName]);

  useEffect(() => {
    if (!selectedFilePath.trim()) return;
    loadData();
  }, [loadData, selectedFilePath]);

  const handleChooseFile = async () => {
    try {
      const response = await fetch('/api/abrir-explorador-arquivos-excel');
      const json = await response.json();
      const firstPath = Array.isArray(json?.caminhos) ? String(json.caminhos[0] || '').trim() : '';
      if (!firstPath) return;

      setSelectedFilePath(firstPath);
      setSelectedFilePathDraft(firstPath);
      localStorage.setItem(STORAGE_KEY_FILE_PATH, firstPath);
      await loadData({ force: true, nextFilePath: firstPath, nextSheetName: '' });
    } catch {
      setError('Nao foi possivel abrir o seletor de arquivos Excel.');
    }
  };

  const handleApplyFilePath = async () => {
    const normalized = selectedFilePathDraft.trim();
    if (!normalized) {
      setError('Informe ou selecione um arquivo Excel valido.');
      return;
    }

    setSelectedFilePath(normalized);
    localStorage.setItem(STORAGE_KEY_FILE_PATH, normalized);
    await loadData({ force: true, nextFilePath: normalized, nextSheetName: '' });
  };

  const handleMonthChange = async (sheetName: string) => {
    setSelectedSheetName(sheetName);
    await loadData({ force: true, nextSheetName: sheetName });
  };

  const handleExportImage = async () => {
    if (exporting) return;
    if (!financeiroCaptureRef.current || !passageirosCaptureRef.current) return;

    setExporting(true);
    try {
      const monthToken = slugify(payload?.selectedMonthShort || payload?.selectedMonthLabel || 'mes');
      const [financeiroShot, passageirosShot] = await Promise.all([
        captureElementImage(financeiroCaptureRef.current),
        captureElementImage(passageirosCaptureRef.current),
      ]);

      if (exportMode === 'separate') {
        downloadDataUrl(financeiroShot.dataUrl, `share_canais_financeiro_${monthToken}.png`);
        downloadDataUrl(passageirosShot.dataUrl, `share_canais_passageiros_${monthToken}.png`);
        return;
      }

      const gap = 24;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(financeiroShot.width, passageirosShot.width);
      canvas.height = financeiroShot.height + gap + passageirosShot.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Nao foi possivel montar a imagem combinada.');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(financeiroShot.image, 0, 0, financeiroShot.width, financeiroShot.height);
      ctx.drawImage(passageirosShot.image, 0, financeiroShot.height + gap, passageirosShot.width, passageirosShot.height);

      downloadDataUrl(canvas.toDataURL('image/png'), `share_canais_tabelas_${monthToken}.png`);
    } catch {
      setError('Nao foi possivel exportar a imagem das tabelas. Tente novamente.');
    } finally {
      setExporting(false);
    }
  };

  const monthOptions = useMemo(
    () => (payload?.monthSheets || []).map((item) => ({
      value: item.sheetName,
      label: item.monthLabel,
    })),
    [payload?.monthSheets],
  );

  return (
    <div className="relative space-y-6 pb-8">
      <div className="pointer-events-none absolute -left-20 -top-10 h-48 w-48 rounded-full bg-rose-300/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-60 w-60 rounded-full bg-orange-300/20 blur-3xl" />

      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-rose-950 to-orange-900 p-6 text-white shadow-2xl"
      >
        <div className="absolute -right-20 -top-16 h-52 w-52 rounded-full bg-orange-300/20 blur-3xl" />
        <div className="relative z-10 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em]">
              <BarChart3 size={12} /> Apresentacao Busca Dados
            </div>
            <h2 className="text-3xl font-black uppercase tracking-[0.08em]">Share de Canais</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-200">
              Leitura direta da planilha com visao financeira, passageiros e ticket medio.
            </p>
          </div>

          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto xl:min-w-[560px]">
            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-100">Arquivos lidos</p>
              <p className="mt-1 text-xl font-black text-white">{formatInt(payload?.meta.filesRead || 0)}</p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-100">Celulas lidas</p>
              <p className="mt-1 text-xl font-black text-white">{formatInt(payload?.meta.records || 0)}</p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-100">Atualizacao da planilha</p>
              <p className="mt-1 text-sm font-black text-white">{payload?.updateInfo?.text || '-'}</p>
            </div>

            <div className="rounded-xl border border-white/20 bg-white/10 px-3 py-2">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-100">Data da leitura</p>
              <p className="mt-1 text-sm font-black text-white">{refreshAt ? refreshAt.toLocaleString('pt-BR') : '-'}</p>
            </div>
          </div>
        </div>
      </motion.section>

      <Card className="relative z-40 overflow-visible border-slate-200 bg-white/90 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-2 text-rose-700 shadow-sm">
              <Database size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-slate-700">Filtros de Share de Canais</h3>
              <p className="text-xs font-semibold text-slate-400">Arquivo Excel + selecao de mes por aba</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600">
              <CalendarDays size={13} />
              {payload?.updateInfo?.text || '-'}
            </div>

            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-[10px] font-black uppercase tracking-wider">
              <button
                type="button"
                title="Exportar tabelas juntas"
                aria-label="Exportar tabelas juntas"
                onClick={() => setExportMode('combined')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-colors',
                  exportMode === 'combined' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500',
                )}
              >
                <ImageIcon size={14} />
              </button>
              <button
                type="button"
                title="Exportar tabelas separadas"
                aria-label="Exportar tabelas separadas"
                onClick={() => setExportMode('separate')}
                className={cn(
                  'rounded-lg px-2.5 py-1 transition-colors',
                  exportMode === 'separate' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500',
                )}
              >
                <Images size={14} />
              </button>
            </div>

            <Button
              variant="secondary"
              className="h-10 rounded-xl border border-rose-200 px-3 text-[11px] text-rose-700 hover:bg-rose-50"
              onClick={handleExportImage}
              disabled={exporting || loading || !payload}
            >
              <Camera size={14} className={cn('mr-1.5', exporting && 'animate-pulse')} />
              Salvar foto
            </Button>

            <Button
              className="h-10 rounded-xl bg-rose-600 px-3 text-[11px] text-white hover:bg-rose-700"
              onClick={() => loadData({ force: true })}
              disabled={loading || !selectedFilePath.trim()}
            >
              <RefreshCw size={14} className={cn('mr-1.5', loading && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="xl:col-span-4">
            <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Mes</label>
            <select
              value={payload?.selectedSheetName || selectedSheetName}
              onChange={(event) => handleMonthChange(event.target.value)}
              className="mt-1.5 h-[48px] w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-3 text-sm font-black uppercase tracking-wide text-slate-700 outline-none transition-all focus:border-rose-500"
              disabled={loading || !monthOptions.length}
            >
              {monthOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </div>

          <div className="xl:col-span-8">
            <label className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Arquivo Excel</label>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                value={selectedFilePathDraft}
                onChange={(event) => setSelectedFilePathDraft(event.target.value)}
                placeholder="Selecione o arquivo de Share de Canais"
                className="h-[48px] flex-1 rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 text-sm font-bold text-slate-700 outline-none transition-all focus:border-rose-500"
              />
              <div className="flex gap-2">
                <Button variant="secondary" className="h-[48px] rounded-2xl px-4" onClick={handleChooseFile}>
                  <FolderOpen size={16} className="mr-2" /> Escolher
                </Button>
                <Button className="h-[48px] rounded-2xl bg-rose-600 px-4 hover:bg-rose-700" onClick={handleApplyFilePath}>
                  <Database size={16} className="mr-2" /> Aplicar
                </Button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            {error}
          </div>
        )}

        {!!payload?.meta?.warnings?.length && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            {payload.meta.warnings.join(' | ')}
          </div>
        )}
      </Card>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <MatrixTableCard
          title="Tabela principal financeira"
          subtitle="Receita, participacao, variacao e diferencas"
          table={payload?.tables?.financeiro}
          toneClass="border-rose-100 bg-rose-50 text-rose-700"
          captureRef={financeiroCaptureRef}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <MatrixTableCard
          title="Tabela de passageiros"
          subtitle="Comparativo de passageiros por periodo"
          table={payload?.tables?.passageiros}
          toneClass="border-orange-100 bg-orange-50 text-orange-700"
          captureRef={passageirosCaptureRef}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <MatrixTableCard
          title="Tabela de ticket medio"
          subtitle="Comparativo de ticket medio por periodo"
          table={payload?.tables?.ticketMedio}
          toneClass="border-amber-100 bg-amber-50 text-amber-700"
        />
      </motion.div>

      <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
        <FileSpreadsheet size={14} />
        {formatInt(payload?.meta.records || 0)} celulas exibidas nas tres tabelas
      </div>

      {!selectedFilePath.trim() && (
        <Card className="p-4">
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            <AlertCircle size={14} />
            Selecione um arquivo Excel para iniciar a leitura do Share de Canais.
          </div>
        </Card>
      )}

    </div>
  );
};

export default ChannelShareDashboardView;
