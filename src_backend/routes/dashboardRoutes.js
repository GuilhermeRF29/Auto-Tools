import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import XLSX from 'xlsx';
import initSqlJs from 'sql.js';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_REVENUE_BASE_DIR = 'Z:\\DASH REVENUE APPLICATION\\BASE';
const REVENUE_FILE_REGEX = /revenue.*\.(xlsx|xls|xlsm|csv|db|sqlite|sqlite3|parquet)$/i;
const REVENUE_DASH_CACHE_TTL_MS = 5 * 60 * 1000;
const REVENUE_DASH_WORKER_TIMEOUT_MS = 120 * 1000;
const DEFAULT_DEMAND_BASE_DIR = 'Z:\\Forecast\\Forecast2';
const DEMAND_FILE_REGEX = /\.(xlsx|xls|xlsm|csv|db|sqlite|sqlite3|parquet)$/i;
const DEMAND_EXCLUDED_FILE_REGEX = /de\s*para/i;
const DEMAND_CACHE_TTL_MS = 5 * 60 * 1000;
const DEMAND_DEFAULT_MARKETS = [
    'BELO HORIZONTE - RIO DE JANEIRO',
    'CURITIBA - LITORAL SC',
    'RAPIDO R. PRETO',
    'SAO PAULO - BELO HORIZONTE',
    'SAO PAULO - CURITIBA',
    'SAO PAULO - FRANCA',
    'SAO PAULO - RIBEIRAO PRETO',
    'SAO PAULO - RIO DE JANEIRO',
    'SAO PAULO - SAO JOSE DO RIO PRETO',
    'SP - LITORAL SC'
];

const revenueDashboardCache = new Map();
const revenueDashboardInFlight = new Map();
const demandDashboardCache = new Map();

const EXCEL_LIKE_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
const SQLITE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
const PARQUET_EXTENSIONS = new Set(['.parquet']);

let sqlJsRuntimePromise = null;

const toStartOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
const toEndOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

const buildSafeDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
    const dt = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return dt;
};

const parseBrDate = (value) => {
    if (value === null || value === undefined || value === '') return null;

    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const utcDate = buildSafeDate(
            value.getUTCFullYear(),
            value.getUTCMonth() + 1,
            value.getUTCDate(),
            value.getUTCHours(),
            value.getUTCMinutes(),
            value.getUTCSeconds(),
        );
        return utcDate || new Date(value.getTime());
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y && parsed.m && parsed.d) {
            return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.round(parsed.S || 0));
        }
    }

    const raw = String(value).trim();
    if (!raw) return null;

    const excelSerialMatch = raw.match(/^\d+(?:\.\d+)?$/);
    if (excelSerialMatch) {
        const parsed = XLSX.SSF.parse_date_code(Number(raw));
        if (parsed && parsed.y && parsed.m && parsed.d) {
            return buildSafeDate(parsed.y, parsed.m, parsed.d, parsed.H || 0, parsed.M || 0, Math.round(parsed.S || 0));
        }
    }

    const isoLikeMatch = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
    if (isoLikeMatch) {
        const [, y, m, d, hh = '00', mm = '00', ss = '00'] = isoLikeMatch;
        return buildSafeDate(Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss));
    }

    const brMatch = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
        const [, d, m, yRaw, hh = '00', mm = '00', ss = '00'] = brMatch;
        const y = Number(yRaw.length === 2 ? `20${yRaw}` : yRaw);
        return buildSafeDate(y, Number(m), Number(d), Number(hh), Number(mm), Number(ss));
    }

    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const toNumber = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value === null || value === undefined) return null;

    const str = String(value).trim().replace(/\s+/g, '');
    if (!str) return null;

    const cleaned = str.replace(/[^\d,.-]/g, '');
    if (!cleaned) return null;

    let normalized = cleaned;
    if (normalized.includes(',') && normalized.includes('.')) {
        if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
            normalized = normalized.replace(/\./g, '').replace(',', '.');
        } else {
            normalized = normalized.replace(/,/g, '');
        }
    } else if (normalized.includes(',')) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
        const pieces = normalized.split('.');
        if (pieces.length > 2) {
            const decimalPart = pieces.pop();
            normalized = `${pieces.join('')}.${decimalPart}`;
        }
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
};

const normalizeText = (value, fallback = 'Sem Informacao') => {
    if (value === null || value === undefined) return fallback;
    const cleaned = String(value).trim();
    return cleaned || fallback;
};

const normalizeRouteLabel = (origem, destino, concatenado) => {
    const origemNormalizada = normalizeText(origem, 'Sem Origem');
    const destinoNormalizado = normalizeText(destino, 'Sem Destino');

    if (origemNormalizada !== 'Sem Origem' && destinoNormalizado !== 'Sem Destino') {
        return `${origemNormalizada} X ${destinoNormalizado}`;
    }

    return normalizeText(concatenado, `${origemNormalizada} X ${destinoNormalizado}`);
};

const classifyStatusRevenue = (status) => {
    const normalized = normalizeText(status, 'Sem Status').toLowerCase();
    if (normalized.includes('aprov')) return 'aprovado';
    if (normalized.includes('reprov')) return 'reprovado';
    return 'outros';
};

const classifyIndicador = (indicador) => {
    const normalized = normalizeText(indicador, 'Sem Indicador').toLowerCase();
    if (normalized.includes('aument')) return 'aumentou';
    if (normalized.includes('dimin')) return 'diminuiu';
    if (normalized.includes('igual')) return 'igual';
    return 'outros';
};

const calculateAdvp = (dataAplicacao, dataViagem) => {
    if (!dataAplicacao || !dataViagem) return { raw: null, star: null };
    const advp2 = Math.round((dataViagem.getTime() - dataAplicacao.getTime()) / 86400000);
    return { raw: advp2, star: advp2 };
};

const buildFaixaAdvp = (advpStar) => {
    if (!Number.isFinite(advpStar) || advpStar <= 0) return '0';
    if (advpStar <= 7) return '01 A 07';
    if (advpStar <= 15) return '08 A 15';
    if (advpStar <= 22) return '16 A 22';
    if (advpStar <= 30) return '23 A 30';
    if (advpStar <= 60) return '31 A 60';
    return '60+';
};

const formatDayKey = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
};

const toISOStringDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const getSqlJsRuntime = async () => {
    if (!sqlJsRuntimePromise) {
        sqlJsRuntimePromise = initSqlJs({
            locateFile: (file) => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file)
        });
    }
    return sqlJsRuntimePromise;
};

const quoteSqlIdentifier = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

const readRowsFromExcelOrCsv = (filePath, sheetResolver) => {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheet = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames[0] : null;
    const selectedSheet = typeof sheetResolver === 'function' ? sheetResolver(workbook) : firstSheet;
    if (!selectedSheet) return [];
    const sheet = workbook.Sheets[selectedSheet];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
};

const readRowsFromSqlite = async (filePath) => {
    const SQL = await getSqlJsRuntime();
    const dbBuffer = fs.readFileSync(filePath);
    const db = new SQL.Database(new Uint8Array(dbBuffer));

    try {
        const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        const tableNames = Array.isArray(result?.[0]?.values)
            ? result[0].values.map((row) => String(row[0]))
            : [];

        const rows = [];
        for (const tableName of tableNames) {
            const escapedTable = quoteSqlIdentifier(tableName);
            const tableData = db.exec(`SELECT * FROM ${escapedTable}`);
            const columns = Array.isArray(tableData?.[0]?.columns) ? tableData[0].columns : [];
            const values = Array.isArray(tableData?.[0]?.values) ? tableData[0].values : [];

            for (const valueRow of values) {
                const row = { _tableName: String(tableName) };
                columns.forEach((column, index) => {
                    row[column] = valueRow[index];
                });
                rows.push(row);
            }
        }

        return rows;
    } finally {
        db.close();
    }
};

const normalizeParquetValue = (value) => {
    if (typeof value === 'bigint') {
        const asNumber = Number(value);
        return Number.isSafeInteger(asNumber) ? asNumber : String(value);
    }

    if (value instanceof Uint8Array) {
        return Buffer.from(value).toString('utf8');
    }

    if (Buffer.isBuffer(value)) return value.toString('utf8');
    if (Array.isArray(value)) return value.map((item) => normalizeParquetValue(item));
    if (value && typeof value === 'object' && !(value instanceof Date)) {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, normalizeParquetValue(inner)]));
    }
    return value;
};

const readRowsFromParquet = async (filePath) => {
    const file = await asyncBufferFromFile(filePath);
    const rows = await parquetReadObjects({ file });
    if (!Array.isArray(rows)) return [];

    return rows.map((row) => {
        if (!row || typeof row !== 'object') return {};
        return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, normalizeParquetValue(value)]));
    });
};

const readTabularRows = async (filePath, { sheetResolver } = {}) => {
    const extension = path.extname(filePath).toLowerCase();

    if (EXCEL_LIKE_EXTENSIONS.has(extension)) {
        return readRowsFromExcelOrCsv(filePath, sheetResolver);
    }

    if (SQLITE_EXTENSIONS.has(extension)) {
        return readRowsFromSqlite(filePath);
    }

    if (PARQUET_EXTENSIONS.has(extension)) {
        return readRowsFromParquet(filePath);
    }

    throw new Error(`Formato nao suportado: ${extension || 'desconhecido'}`);
};

let deParaMapCache = null;
let deParaCacheMtime = 0;

const loadDeParaMap = async (baseDir) => {
    try {
        const checkdirs = [baseDir, path.join(baseDir, '..')];
        let matchedFile = null;
        let matchedStat = null;

        for (const dir of checkdirs) {
            if (!fs.existsSync(dir)) continue;
            const entries = fs.readdirSync(dir);
            const found = entries.find(e => /de\s*para\s*de\s*linhas.*\.(xlsx|parquet|db|sqlite)$/i.test(e));
            if (found) {
                matchedFile = path.join(dir, found);
                matchedStat = fs.statSync(matchedFile);
                break;
            }
        }

        if (!matchedFile) return new Map();

        if (deParaMapCache && deParaCacheMtime === matchedStat.mtimeMs) {
            return deParaMapCache;
        }

        const newMap = new Map();
        try {
            const rawRows = await readTabularRows(matchedFile, {
                sheetResolver: (wb) => {
                    const deParaSheet = wb.SheetNames.find(n => /de\s*para\s*de\s*linhas/i.test(n));
                    return deParaSheet || wb.SheetNames[0];
                }
            });
            for (const row of rawRows) {
                const codLinha = getRowValue(row, ['Cod Linha', 'COD LINHA', 'Cod_Linha', 'Linha', 'LINHA', 'SERVICO', 'Serviço', 'Cod. Linha', 'COD. LINHA']);
                if (codLinha !== null && codLinha !== undefined && String(codLinha).trim()) {
                    const rawCod = String(codLinha).trim();
                    const normCod = rawCod.replace(/^0+/, '') || '0';
                    const mercado = getRowValue(row, ['Mercado', 'MERCADO', 'NOME MERCADO', 'DESC MERCADO']);
                    const empresa = getRowValue(row, ['Empresa', 'EMPRESA', 'NOME EMPRESA']);
                    const entry = {
                        mercado: mercado ? String(mercado).trim().toUpperCase() : null,
                        empresa: empresa ? String(empresa).trim().toUpperCase() : null
                    };

                    const rawKey = `RAW:${rawCod}`;
                    if (!newMap.has(rawKey)) {
                        newMap.set(rawKey, entry);
                    }

                    const normKey = `NORM:${normCod}`;
                    if (!newMap.has(normKey)) {
                        newMap.set(normKey, entry);
                    } else {
                        const existing = newMap.get(normKey);
                        const hasConflict = !!existing && (
                            normalizeDemandToken(existing.mercado || '') !== normalizeDemandToken(entry.mercado || '')
                            || normalizeDemandToken(existing.empresa || '') !== normalizeDemandToken(entry.empresa || '')
                        );
                        if (hasConflict) {
                            newMap.set(normKey, null);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Falha ao parsear De Para:', err);
        }

        deParaMapCache = newMap;
        deParaCacheMtime = matchedStat.mtimeMs;
        return newMap;
    } catch (e) {
        console.error('Falha ao carregar De Para:', e);
        return new Map();
    }
};

const pickRevenueSheet = (workbook) => {
    const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if (names.length === 0) return null;
    const preferred = names.find(name => /revenue\s*sistema/i.test(name));
    if (preferred) return preferred;
    const nonComparado = names.find(name => !/comparado/i.test(name));
    return nonComparado || names[0];
};

const collectRevenueFiles = (baseDir) => {
    if (!fs.existsSync(baseDir)) return [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && REVENUE_FILE_REGEX.test(entry.name))
        .map((entry) => path.join(baseDir, entry.name))
        .sort((a, b) => {
            const aStat = fs.statSync(a).mtimeMs;
            const bStat = fs.statSync(b).mtimeMs;
            return bStat - aStat;
        });
};

const sum = (values) => values.reduce((acc, cur) => acc + cur, 0);

const avg = (values) => {
    if (!values.length) return 0;
    return sum(values) / values.length;
};

const buildRevenueDashboardCacheKey = (effectiveDir, rangeStart, rangeEnd) => (
    `${effectiveDir}|${toISOStringDate(rangeStart)}|${toISOStringDate(rangeEnd)}`
);

const getRevenueDashboardCache = (cacheKey) => {
    const entry = revenueDashboardCache.get(cacheKey);
    if (!entry) return null;

    if (entry.expiresAt <= Date.now()) {
        revenueDashboardCache.delete(cacheKey);
        return null;
    }

    return entry.payload;
};

const setRevenueDashboardCache = (cacheKey, payload) => {
    revenueDashboardCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + REVENUE_DASH_CACHE_TTL_MS
    });
};

const runRevenueDashboardWorker = async ({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows = false }) => { return await buildRevenueDashboardPayload({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows }); };
const buildEmptyRevenuePayload = (effectiveDir, preferredDir, rangeStart, rangeEnd, warnings = [], includeRows = false) => ({
    meta: {
        baseDir: effectiveDir,
        requestedBaseDir: preferredDir,
        selectedPeriod: { startDate: toISOStringDate(rangeStart), endDate: toISOStringDate(rangeEnd) },
        filesRead: 0,
        records: 0,
        warnings
    },
    kpis: {
        totalRegistros: 0,
        aprovados: 0,
        reprovados: 0,
        taxaAprovacao: 0,
        totalRevenueAplicado: 0,
        mediaRevenueAplicado: 0,
        advpMedio: 0
    },
    series: {
        revenueAplicadoPorDia: [],
        totalRevenueAplicado: [],
        advpStatus: [],
        evolucaoTmXAdvp: [],
        revenuePorCanal: [],
        faixaQtdPercentual: [],
        aproveitamentoAplicacao: [],
        justificativa: [],
        analistaIndicador: [],
        rotasAplicadas: []
    },
    ...(includeRows ? { treatedRows: [] } : {})
});

const formatExportDate = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = String(value.getFullYear());
    return `${day}/${month}/${year}`;
};

const buildRevenueDashboardPayload = async ({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows = false }) => {
    const files = collectRevenueFiles(effectiveDir);
    if (!files.length) {
        return buildEmptyRevenuePayload(
            effectiveDir,
            preferredDir,
            rangeStart,
            rangeEnd,
            ['Nenhum arquivo Revenue encontrado no diretorio selecionado.'],
            includeRows
        );
    }

    const dedupe = new Set();
    const rows = [];
    const parseWarnings = [];

    for (const filePath of files) {
        try {
            const rawRows = await readTabularRows(filePath, { sheetResolver: pickRevenueSheet });

            for (const row of rawRows) {
                const dataAplicacao = parseBrDate(getRowValue(row, ['Data Aplicação', 'Data Aplicacao', 'DATA APLICACAO']));
                if (!dataAplicacao) continue;
                if (dataAplicacao < rangeStart || dataAplicacao > rangeEnd) continue;

                const dataViagem = parseBrDate(getRowValue(row, ['Data Viagem', 'Data viagem', 'DATA VIAGEM']));
                const revenueAplicado = toNumber(getRowValue(row, ['Revenue Aplicado', 'REVENUE APLICADO']));
                const statusRevenue = normalizeText(getRowValue(row, ['Status Revenue', 'STATUS REVENUE']), 'Sem Status');
                const indicador = normalizeText(getRowValue(row, ['Indicador', 'INDICADOR']), 'Sem Indicador');
                const canalVenda = normalizeText(getRowValue(row, ['Canal Venda', 'CANAL VENDA']), 'Sem Canal');
                const justificativa = normalizeText(getRowValue(row, ['Justificativa', 'JUSTIFICATIVA']), 'Sem Justificativa');
                const analista = normalizeText(getRowValue(row, ['Analista', 'ANALISTA']), 'Sem Analista');
                const origem = normalizeText(getRowValue(row, ['Origem', 'ORIGEM']), 'Sem Origem');
                const destino = normalizeText(getRowValue(row, ['Destino', 'DESTINO']), 'Sem Destino');
                const numServico = normalizeText(getRowValue(row, ['Num. Serviço', 'Num. Servico', 'Numero Servico', 'NUM SERVICO']), 'Sem Servico');
                const rota = normalizeRouteLabel(origem, destino, getRowValue(row, ['Concatenar Origem e Destino', 'Rota', 'ROTA']));

                const dedupeKey = [
                    origem,
                    destino,
                    toISOStringDate(dataAplicacao),
                    dataViagem ? toISOStringDate(dataViagem) : '',
                    canalVenda,
                    revenueAplicado ?? '',
                    statusRevenue,
                    indicador,
                    analista,
                    numServico,
                    justificativa
                ].join('|');

                if (dedupe.has(dedupeKey)) continue;
                dedupe.add(dedupeKey);

                const advp = calculateAdvp(dataAplicacao, dataViagem);
                rows.push({
                    dataAplicacao,
                    dataAplicacaoKey: toISOStringDate(dataAplicacao),
                    dataAplicacaoLabel: formatDayKey(dataAplicacao),
                    dataViagem,
                    revenueAplicado,
                    statusRevenue,
                    statusBucket: classifyStatusRevenue(statusRevenue),
                    indicador,
                    indicadorBucket: classifyIndicador(indicador),
                    canalVenda,
                    justificativa,
                    analista,
                    origem,
                    destino,
                    numServico,
                    rota,
                    advpRaw: advp.raw,
                    advpStar: advp.star,
                    faixaMapa: buildFaixaAdvp(advp.star)
                });
            }
        } catch (error) {
            parseWarnings.push(`Falha ao ler ${path.basename(filePath)}: ${error.message || error}`);
        }
    }

    rows.sort((a, b) => a.dataAplicacao.getTime() - b.dataAplicacao.getTime());

    const dayMap = new Map();
    const canalMap = new Map();
    const advpMap = new Map();
    const evolucaoMap = new Map();
    const faixaMap = new Map();
    const statusMap = new Map();
    const justificativaMap = new Map();
    const analistaMap = new Map();
    const rotaMap = new Map();

    for (const row of rows) {
        const dayItem = dayMap.get(row.dataAplicacaoKey) || {
            date: row.dataAplicacaoKey,
            dia: row.dataAplicacaoLabel,
            aprovado: 0,
            reprovado: 0,
            outros: 0,
            total: 0
        };
        dayItem[row.statusBucket] = (dayItem[row.statusBucket] || 0) + 1;
        dayItem.total += 1;
        dayMap.set(row.dataAplicacaoKey, dayItem);

        const canalItem = canalMap.get(row.canalVenda) || {
            canal: row.canalVenda,
            aprovado: 0,
            reprovado: 0,
            outros: 0,
            total: 0
        };
        canalItem[row.statusBucket] = (canalItem[row.statusBucket] || 0) + 1;
        canalItem.total += 1;
        canalMap.set(row.canalVenda, canalItem);

        if (Number.isFinite(row.advpStar)) {
            const advpBucket = String(row.advpStar);
            const advpItem = advpMap.get(advpBucket) || {
                advp: advpBucket,
                aprovado: 0,
                reprovado: 0,
                outros: 0,
                total: 0
            };
            advpItem[row.statusBucket] = (advpItem[row.statusBucket] || 0) + 1;
            advpItem.total += 1;
            advpMap.set(advpBucket, advpItem);

            const evolucaoItem = evolucaoMap.get(advpBucket) || {
                advp: advpBucket,
                total: 0,
                minRevenue: Number.POSITIVE_INFINITY,
                sumRevenue: 0,
                qtdRevenue: 0,
                aprovado: 0,
                reprovado: 0
            };
            evolucaoItem.total += 1;
            if (row.statusBucket === 'aprovado') evolucaoItem.aprovado += 1;
            if (row.statusBucket === 'reprovado') evolucaoItem.reprovado += 1;
            if (Number.isFinite(row.revenueAplicado)) {
                evolucaoItem.minRevenue = Math.min(evolucaoItem.minRevenue, row.revenueAplicado);
                evolucaoItem.sumRevenue += row.revenueAplicado;
                evolucaoItem.qtdRevenue += 1;
            }
            evolucaoMap.set(advpBucket, evolucaoItem);
        }

        const faixaItem = faixaMap.get(row.faixaMapa) || {
            faixa: row.faixaMapa,
            qtdAdvp: 0,
            sumRevenue: 0,
            qtdRevenue: 0
        };
        faixaItem.qtdAdvp += 1;
        if (Number.isFinite(row.revenueAplicado)) {
            faixaItem.sumRevenue += row.revenueAplicado;
            faixaItem.qtdRevenue += 1;
        }
        faixaMap.set(row.faixaMapa, faixaItem);

        const statusItem = statusMap.get(row.statusRevenue) || { status: row.statusRevenue, total: 0 };
        statusItem.total += 1;
        statusMap.set(row.statusRevenue, statusItem);

        const justItem = justificativaMap.get(row.justificativa) || {
            justificativa: row.justificativa,
            aprovado: 0,
            reprovado: 0,
            outros: 0,
            total: 0
        };
        justItem[row.statusBucket] = (justItem[row.statusBucket] || 0) + 1;
        justItem.total += 1;
        justificativaMap.set(row.justificativa, justItem);

        const analistaItem = analistaMap.get(row.analista) || {
            analista: row.analista,
            aumentou: 0,
            diminuiu: 0,
            igual: 0,
            outros: 0,
            total: 0
        };
        analistaItem[row.indicadorBucket] = (analistaItem[row.indicadorBucket] || 0) + 1;
        analistaItem.total += 1;
        analistaMap.set(row.analista, analistaItem);

        const rotaItem = rotaMap.get(row.rota) || {
            rota: row.rota,
            total: 0,
            sumRevenue: 0,
            qtdRevenue: 0
        };
        rotaItem.total += 1;
        if (Number.isFinite(row.revenueAplicado)) {
            rotaItem.sumRevenue += row.revenueAplicado;
            rotaItem.qtdRevenue += 1;
        }
        rotaMap.set(row.rota, rotaItem);
    }

    const totaisRevenue = rows.map(r => r.revenueAplicado).filter(Number.isFinite);
    const advpRawValues = rows.map(r => r.advpRaw).filter(Number.isFinite);
    const aprovados = rows.filter(r => r.statusBucket === 'aprovado').length;
    const reprovados = rows.filter(r => r.statusBucket === 'reprovado').length;

    const revenueAplicadoPorDia = Array.from(dayMap.values())
        .sort((a, b) => a.date.localeCompare(b.date));

    const totalRevenueAplicado = [
        { label: 'Aprovado', value: aprovados },
        { label: 'Reprovado', value: reprovados },
        { label: 'Outros', value: Math.max(0, rows.length - aprovados - reprovados) }
    ].filter(item => item.value > 0);

    const parseAdvpSort = (value) => Number(value);

    const advpStatus = Array.from(advpMap.values())
        .sort((a, b) => parseAdvpSort(a.advp) - parseAdvpSort(b.advp));

    const evolucaoTmXAdvp = Array.from(evolucaoMap.values())
        .map(item => ({
            advp: item.advp,
            minRevenue: Number.isFinite(item.minRevenue) ? Number(item.minRevenue.toFixed(2)) : 0,
            tmRevenue: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0,
            total: item.total,
            aprovado: item.aprovado,
            reprovado: item.reprovado
        }))
        .sort((a, b) => parseAdvpSort(a.advp) - parseAdvpSort(b.advp));

    const revenuePorCanal = Array.from(canalMap.values())
        .sort((a, b) => b.total - a.total);

    const faixaOrder = ['0', '01 A 07', '08 A 15', '16 A 22', '23 A 30', '31 A 60', '60+'];
    const faixaQtdPercentual = Array.from(faixaMap.values())
        .map(item => ({
            faixa: item.faixa,
            qtdAdvp: item.qtdAdvp,
            percentualTotal: rows.length ? Number(((item.qtdAdvp / rows.length) * 100).toFixed(2)) : 0,
            mediaRevenueAplicado: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0
        }))
        .sort((a, b) => faixaOrder.indexOf(a.faixa) - faixaOrder.indexOf(b.faixa));

    const aproveitamentoAplicacao = Array.from(statusMap.values())
        .sort((a, b) => b.total - a.total);

    const justificativa = Array.from(justificativaMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 15);

    const analistaIndicador = Array.from(analistaMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 12);

    const rotasAplicadas = Array.from(rotaMap.values())
        .map(item => ({
            rota: item.rota,
            total: item.total,
            mediaRevenueAplicado: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0
        }))
        .sort((a, b) => b.total - a.total);

    const basePayload = {
        meta: {
            baseDir: effectiveDir,
            requestedBaseDir: preferredDir,
            selectedPeriod: {
                startDate: toISOStringDate(rangeStart),
                endDate: toISOStringDate(rangeEnd)
            },
            filesRead: files.length,
            records: rows.length,
            warnings: parseWarnings
        },
        kpis: {
            totalRegistros: rows.length,
            aprovados,
            reprovados,
            taxaAprovacao: rows.length ? Number(((aprovados / rows.length) * 100).toFixed(2)) : 0,
            totalRevenueAplicado: Number(sum(totaisRevenue).toFixed(2)),
            mediaRevenueAplicado: Number(avg(totaisRevenue).toFixed(2)),
            advpMedio: Number(avg(advpRawValues).toFixed(2))
        },
        series: {
            revenueAplicadoPorDia,
            totalRevenueAplicado,
            advpStatus,
            evolucaoTmXAdvp,
            revenuePorCanal,
            faixaQtdPercentual,
            aproveitamentoAplicacao,
            justificativa,
            analistaIndicador,
            rotasAplicadas
        }
    };

    if (!includeRows) return basePayload;

    const treatedRows = rows.map((row) => {
        const advpTimeDiff = row.dataViagem instanceof Date
            ? (row.dataViagem.getTime() - row.dataAplicacao.getTime()) / 86400000
            : null;
        const advpRoundByTime = Number.isFinite(advpTimeDiff) ? Math.round(advpTimeDiff) : null;
        const advpFloorByTime = Number.isFinite(advpTimeDiff) ? Math.floor(advpTimeDiff) : null;
        const advpCeilByTime = Number.isFinite(advpTimeDiff) ? Math.ceil(advpTimeDiff) : null;

        return {
            DataAplicacao: formatExportDate(row.dataAplicacao),
            DataViagem: formatExportDate(row.dataViagem),
            ADVP_Bruto: Number.isFinite(row.advpRaw) ? row.advpRaw : null,
            ADVP_UsadoMapaFaixa: Number.isFinite(row.advpStar) ? row.advpStar : null,
            FaixaMapa: row.faixaMapa,
            ADVP_DiasExatoComHora: Number.isFinite(advpTimeDiff) ? Number(advpTimeDiff.toFixed(5)) : null,
            ADVP_RoundPorHora: Number.isFinite(advpRoundByTime) ? advpRoundByTime : null,
            ADVP_FloorPorHora: Number.isFinite(advpFloorByTime) ? advpFloorByTime : null,
            ADVP_CeilPorHora: Number.isFinite(advpCeilByTime) ? advpCeilByTime : null,
            Faixa_RoundPorHora: buildFaixaAdvp(advpRoundByTime),
            Faixa_FloorPorHora: buildFaixaAdvp(advpFloorByTime),
            Faixa_CeilPorHora: buildFaixaAdvp(advpCeilByTime),
            RevenueAplicado: Number.isFinite(row.revenueAplicado) ? Number(row.revenueAplicado.toFixed(2)) : null,
            StatusRevenue: row.statusRevenue,
            StatusBucket: row.statusBucket,
            Indicador: row.indicador,
            IndicadorBucket: row.indicadorBucket,
            CanalVenda: row.canalVenda,
            Justificativa: row.justificativa,
            Analista: row.analista,
            Origem: row.origem,
            Destino: row.destino,
            NumeroServico: row.numServico,
            RotaPadronizada: row.rota,
            DataAplicacaoISO: row.dataAplicacaoKey
        };
    });

    return {
        ...basePayload,
        treatedRows
    };
};

const stripAccents = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const normalizeKeyToken = (value) => stripAccents(String(value || ''))
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const normalizeDemandToken = (value) => stripAccents(String(value || ''))
    .toUpperCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+-\s+[A-Z]{2}\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const getRowValue = (row, aliases = []) => {
    if (!row || typeof row !== 'object') return null;

    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, alias) && row[alias] !== null && row[alias] !== undefined && row[alias] !== '') {
            return row[alias];
        }
    }

    const normalizedMap = new Map();
    for (const key of Object.keys(row)) {
        const token = normalizeKeyToken(key);
        const list = normalizedMap.get(token) || [];
        list.push(key);
        normalizedMap.set(token, list);
    }

    for (const alias of aliases) {
        const normalizedAlias = normalizeKeyToken(alias);
        const matchedKeys = normalizedMap.get(normalizedAlias);
        if (!Array.isArray(matchedKeys) || !matchedKeys.length) continue;

        for (const matchedKey of matchedKeys) {
            const value = row[matchedKey];
            if (value !== null && value !== undefined && value !== '') {
                return value;
            }
        }
    }

    return null;
};

const parseRatio = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim();
    const numeric = toNumber(raw);
    if (!Number.isFinite(numeric)) return null;
    if (raw.includes('%')) return numeric / 100;
    if (numeric > 1) return numeric / 100;
    return numeric;
};

const parseObservationDateFromName = (fileName, fallbackDate) => {
    const cleanName = String(fileName || '');

    const msEpochMatch = cleanName.match(/(^|[^\d])(1\d{12})(?!\d)/);
    if (msEpochMatch) {
        const asNumber = Number(msEpochMatch[2]);
        const dt = new Date(asNumber);
        if (!Number.isNaN(dt.getTime())) return toStartOfDay(dt);
    }

    const ymdMatch = cleanName.match(/(^|[^\d])(20\d{2})[-_.\s](\d{1,2})[-_.\s](\d{1,2})(?!\d)/);
    if (ymdMatch) {
        const year = Number(ymdMatch[2]);
        const month = Number(ymdMatch[3]);
        const day = Number(ymdMatch[4]);
        const dt = buildSafeDate(year, month, day);
        if (dt) return toStartOfDay(dt);
    }

    const dmyMatch = cleanName.match(/(^|[^\d])(\d{1,2})[-_.\s](\d{1,2})[-_.\s](\d{4}|\d{2})(?!\d)/);
    if (dmyMatch) {
        const day = Number(dmyMatch[2]);
        const month = Number(dmyMatch[3]);
        const yearRaw = dmyMatch[4];
        const year = Number(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw);
        const dt = buildSafeDate(year, month, day);
        if (dt) return toStartOfDay(dt);
    }

    const ymMatch = cleanName.match(/(20\d{2})[-_.\s](\d{1,2})/);
    if (ymMatch) {
        const year = Number(ymMatch[1]);
        const month = Number(ymMatch[2]);
        const dt = buildSafeDate(year, month, 1);
        if (dt) return toStartOfDay(dt);
    }

    if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())) {
        return toStartOfDay(fallbackDate);
    }

    return null;
};

const collectDemandFiles = (baseDir) => {
    if (!fs.existsSync(baseDir)) return [];
    const entries = fs.readdirSync(baseDir, { withFileTypes: true });

    return entries
        .filter((entry) => (
            entry.isFile()
            && DEMAND_FILE_REGEX.test(entry.name)
            && !entry.name.startsWith('~$')
            && !DEMAND_EXCLUDED_FILE_REGEX.test(entry.name)
        ))
        .map((entry) => {
            const fullPath = path.join(baseDir, entry.name);
            const stat = fs.statSync(fullPath);
            return {
                filePath: fullPath,
                fileName: entry.name,
                mtime: stat.mtime,
                mtimeMs: stat.mtimeMs
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const pickDemandSheet = (workbook) => {
    const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if (names.length === 0) return null;

    const preferredByName = names.find((name) => /base\s*relatorio|forecast|demanda|base\s*principal/i.test(name));
    if (preferredByName) return preferredByName;

    for (const name of names) {
        const sheet = workbook.Sheets[name];
        if (!sheet) continue;
        const sampleRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
        const first = sampleRows[0];
        if (!first) continue;
        const keys = Object.keys(first).map((key) => normalizeDemandToken(key));
        const hasDate = keys.some((key) => key === 'DATA' || key === 'DATA VIAGEM');
        const hasRoute = keys.some((key) => key === 'ORIGEM' || key === 'MERCADO');
        const hasDemand = keys.some((key) => key === 'PAX' || key === 'OCUPACAO' || key === 'PASSAGEIRO');
        if (hasDate && hasRoute && hasDemand) {
            return name;
        }
    }

    return names[0];
};

const buildDemandMarket = (row) => {
    const origem = getRowValue(row, ['ORIGEM', 'Origem']);
    const destino = getRowValue(row, ['DESTINO', 'Destino']);
    const mercadoRaw = getRowValue(row, ['MERCADO', 'Mercado', 'Concatenar Origem e Destino']);

    if (origem || destino) {
        const origemNorm = normalizeDemandToken(origem || 'SEM ORIGEM');
        const destinoNorm = normalizeDemandToken(destino || 'SEM DESTINO');
        return `${origemNorm} - ${destinoNorm}`;
    }

    if (mercadoRaw) {
        const clean = normalizeDemandToken(mercadoRaw)
            .replace(/\s+X\s+/g, ' - ')
            .replace(/\s*\/\s*/g, ' - ');
        return clean;
    }

    return 'SEM MERCADO';
};

const buildDemandFaixa = (advp) => {
    if (!Number.isFinite(advp)) return '0 a 07';
    if (advp < -1) return '0';
    if (advp <= 7) return '0 a 07';
    if (advp <= 14) return '08 a 14';
    if (advp <= 21) return '15 a 21';
    if (advp <= 30) return '22 a 30';
    if (advp <= 59) return '31 a 59';
    return '60+';
};

const buildDemandDashboardCacheKey = (baseDir) => String(baseDir || '').trim().toLowerCase();

const getDemandDashboardCache = (cacheKey) => {
    const entry = demandDashboardCache.get(cacheKey);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        demandDashboardCache.delete(cacheKey);
        return null;
    }
    return entry.payload;
};

const setDemandDashboardCache = (cacheKey, payload) => {
    demandDashboardCache.set(cacheKey, {
        payload,
        expiresAt: Date.now() + DEMAND_CACHE_TTL_MS
    });
};

const buildDemandDataset = async (effectiveDir) => {
    const files = collectDemandFiles(effectiveDir);
    const deParaMap = await loadDeParaMap(effectiveDir);
    const knownMarkets = new Set(
        Array.from(deParaMap.values())
            .map((item) => normalizeDemandToken(item?.mercado || ''))
            .filter(Boolean)
    );
    const warnings = [];
    const groupedByObservation = new Map();
    const seenRowsByObservation = new Map();
    let totalRows = 0;
    const stats = {
        totalRead: 0,
        processed: 0,
        skippedDate: 0,
        skippedEmpty: 0,
        skippedNoValues: 0,
        skippedAdvp: 0,
        skippedDuplicated: 0
    };

    for (const file of files) {
        try {
            const rawRows = await readTabularRows(file.filePath, { sheetResolver: pickDemandSheet });
            const fallbackObsDate = parseObservationDateFromName(file.fileName, file.mtime);

            for (const row of rawRows) {
                stats.totalRead++;
                const observationRaw = getRowValue(row, [
                    'Data Observação',
                    'Data Observacao',
                    'DATA OBSERVACAO',
                    'Data Observacao Arquivo',
                    'Data Referencia',
                    'Data Referência',
                    'DATA REFERENCIA',
                    'Data Base',
                    'DATA BASE',
                    'Snapshot Date',
                    'Data_Observacao'
                ]);

                let observationDate = parseBrDate(observationRaw);
                if (observationDate) {
                    observationDate = toStartOfDay(observationDate);
                } else if (row._tableName) {
                    const extracted = parseObservationDateFromName(row._tableName, null);
                    if (extracted) observationDate = extracted;
                    else observationDate = fallbackObsDate;
                } else {
                    observationDate = fallbackObsDate;
                }

                if (!(observationDate instanceof Date) || Number.isNaN(observationDate.getTime())) {
                    stats.skippedDate++;
                    continue;
                }

                const obsIso = toISOStringDate(observationDate);
                const bucket = groupedByObservation.get(obsIso) || [];

                const travelDateRaw = getRowValue(row, ['Data Viagem', 'DATA VIAGEM', 'DATA', 'Data']);
                const travelDate = parseBrDate(travelDateRaw);
                if (!travelDate) {
                    stats.skippedDate++;
                    continue;
                }

                const linhaRaw = getRowValue(row, ['LINHA', 'Linha', 'Cod Linha', 'Cod_Linha', 'SERVIÇO', 'SERVICO', 'Num. Serviço', 'Num. Servico']);
                const linhaRawValue = linhaRaw !== null && linhaRaw !== undefined ? String(linhaRaw).trim() : '';
                const normLinha = linhaRawValue ? (linhaRawValue.replace(/^0+/, '') || '0') : 'SEM LINHA';

                const deParaEntry = (
                    (linhaRawValue ? deParaMap.get(`RAW:${linhaRawValue}`) : null)
                    || deParaMap.get(`NORM:${normLinha}`)
                );

                const empresaRaw = getRowValue(row, ['EMPRESA', 'Empresa']);
                const empresa = normalizeDemandToken(deParaEntry?.empresa || empresaRaw || 'SEM EMPRESA');

                const mercadoDePara = normalizeDemandToken(deParaEntry?.mercado || '');
                const mercado = mercadoDePara || 'OUTROS MERCADOS';

                const ocupacaoRaw = getRowValue(row, ['PAX', 'Passageiro', 'PASSAGEIROS', 'Ocupação', 'OCUPAÇÃO', 'Ocupacao', 'Pax Total', 'TRANSITADO', 'Pax_Total', 'Ocup']);
                const capacidadeRaw = getRowValue(row, ['Capacidade', 'CAPACIDADE', 'Oferta', 'OFERTA', 'Vagas', 'VAGAS', 'Cap', 'Cap_Total']);
                const apvRaw = getRowValue(row, ['%Ocupação', '% Ocupação', 'APV', 'IPV', 'IPV 3', 'IPV3', '% APV', 'Aproveitamento', 'APROVEITAMENTO']);

                let ocupacao = toNumber(ocupacaoRaw);
                let capacidade = toNumber(capacidadeRaw);
                const apvRatio = parseRatio(apvRaw);

                if (!Number.isFinite(capacidade) && Number.isFinite(ocupacao) && Number.isFinite(apvRatio) && apvRatio > 0) {
                    capacidade = ocupacao / apvRatio;
                }
                if (!Number.isFinite(ocupacao) && Number.isFinite(capacidade) && Number.isFinite(apvRatio)) {
                    ocupacao = capacidade * apvRatio;
                }

                const isRowEmpty = (!Number.isFinite(ocupacao) || ocupacao <= 0)
                    && (!Number.isFinite(capacidade) || capacidade <= 0);
                if (isRowEmpty) {
                    stats.skippedEmpty++;
                    continue;
                }

                if (!Number.isFinite(ocupacao) && !Number.isFinite(capacidade)) {
                    stats.skippedNoValues++;
                    continue;
                }

                const finalCapacidade = Number.isFinite(capacidade) && capacidade > 0 ? capacidade : 0;
                const finalOcupacao = Number.isFinite(ocupacao) && ocupacao >= 0 ? ocupacao : 0;

                if (finalCapacidade <= 0 && finalOcupacao <= 0) {
                    stats.skippedNoValues++;
                    continue;
                }

                const travelDay = toStartOfDay(travelDate);
                const advp = Math.round((travelDay.getTime() - observationDate.getTime()) / 86400000);
                if (advp < -1) {
                    stats.skippedAdvp++;
                }

                const roundedOcupacao = Number(finalOcupacao.toFixed(4));
                const roundedCapacidade = Number(finalCapacidade.toFixed(4));
                const travelIso = toISOStringDate(travelDay);
                const dedupeSet = seenRowsByObservation.get(obsIso) || new Set();
                const rowSignature = JSON.stringify(
                    Object.keys(row)
                        .sort()
                        .reduce((acc, key) => {
                            acc[key] = row[key];
                            return acc;
                        }, {})
                );
                const dedupeKey = [obsIso, rowSignature].join('|');
                if (dedupeSet.has(dedupeKey)) {
                    stats.skippedDuplicated++;
                    continue;
                }
                dedupeSet.add(dedupeKey);
                seenRowsByObservation.set(obsIso, dedupeSet);

                bucket.push({
                    observationDate: obsIso,
                    travelDate: travelIso,
                    mercado,
                    empresa,
                    linha: normLinha,
                    ocupacao: roundedOcupacao,
                    capacidade: roundedCapacidade,
                    apv: finalCapacidade > 0 ? Number((finalOcupacao / finalCapacidade).toFixed(6)) : 0,
                    advp,
                    faixaAdvp: buildDemandFaixa(advp)
                });
                groupedByObservation.set(obsIso, bucket);
                stats.processed++;
            }
        } catch (error) {
            warnings.push(`Falha ao ler ${file.fileName}: ${error.message || error}`);
        }
    }

    for (const rows of groupedByObservation.values()) {
        totalRows += rows.length;
    }

    const observationDates = Array.from(groupedByObservation.keys()).sort((a, b) => b.localeCompare(a));

    return {
        baseDir: effectiveDir,
        filesRead: files.length,
        records: totalRows,
        stats,
        warnings,
        observationDates,
        groupedByObservation,
        knownMarkets: Array.from(knownMarkets).sort((a, b) => a.localeCompare(b))
    };
};

import { Router } from 'express';
const router = Router();
router.get('/demand-dashboard', async (req, res) => {
    try {
        const bypassCache = String(req.query.noCache || '').toLowerCase() === '1' || String(req.query.noCache || '').toLowerCase() === 'true';
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_DEMAND_BASE_DIR;
        const fallbackDir = path.join(__dirname, 'backups_sistema');

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) {
            effectiveDir = fallbackDir;
        }

        if (!fs.existsSync(effectiveDir)) {
            return res.status(400).json({
                error: 'Diretorio de base Demanda nao encontrado.',
                details: { requestedDir: preferredDir }
            });
        }

        const cacheKey = buildDemandDashboardCacheKey(effectiveDir);
        const cachedDataset = !bypassCache ? getDemandDashboardCache(cacheKey) : null;
        const dataset = cachedDataset || await buildDemandDataset(effectiveDir);

        if (!cachedDataset) {
            setDemandDashboardCache(cacheKey, dataset);
        }

        const observationDates = Array.isArray(dataset.observationDates) ? dataset.observationDates : [];
        const requestedObservationDate = typeof req.query.observationDate === 'string' ? req.query.observationDate : '';
        const selectedObservationDate = observationDates.includes(requestedObservationDate)
            ? requestedObservationDate
            : (observationDates[0] || null);

        if (!selectedObservationDate) {
            return res.json({
                meta: {
                    baseDir: effectiveDir,
                    requestedBaseDir: preferredDir,
                    filesRead: dataset.filesRead || 0,
                    records: 0,
                    warnings: [...(dataset.warnings || []), 'Nenhuma data de observacao identificada nos arquivos.'],
                    observationDates: [],
                    selectedObservationDate: null,
                    historyObservationDate: null,
                    defaultMarkets: DEMAND_DEFAULT_MARKETS,
                    marketCoverage: {
                        found: 0,
                        known: Array.isArray(dataset.knownMarkets) ? dataset.knownMarkets.length : DEMAND_DEFAULT_MARKETS.length
                    }
                },
                travelDateOptions: [],
                defaultTravelDateSelection: [],
                rows: [],
                historyRows: [],
                markets: [],
                defaultSelectedMarkets: [],
                companiesByMarket: {}
            });
        }

        const selectedDateObj = parseBrDate(selectedObservationDate);
        const targetHistoryDate = selectedDateObj
            ? toISOStringDate(new Date(selectedDateObj.getFullYear() - 1, selectedDateObj.getMonth(), selectedDateObj.getDate()))
            : null;

        let historyObservationDate = null;
        if (targetHistoryDate && observationDates.includes(targetHistoryDate)) {
            historyObservationDate = targetHistoryDate;
        } else if (targetHistoryDate) {
            const targetTime = parseBrDate(targetHistoryDate)?.getTime();
            const candidates = observationDates.filter((iso) => {
                const dt = parseBrDate(iso);
                return dt && selectedDateObj ? dt.getFullYear() === selectedDateObj.getFullYear() - 1 : false;
            });

            if (candidates.length && Number.isFinite(targetTime)) {
                historyObservationDate = [...candidates].sort((a, b) => {
                    const at = parseBrDate(a)?.getTime() || 0;
                    const bt = parseBrDate(b)?.getTime() || 0;
                    return Math.abs(at - targetTime) - Math.abs(bt - targetTime);
                })[0];
            }
        }

        const rows = Array.isArray(dataset.groupedByObservation.get(selectedObservationDate))
            ? dataset.groupedByObservation.get(selectedObservationDate)
            : [];

        const historyRows = historyObservationDate && Array.isArray(dataset.groupedByObservation.get(historyObservationDate))
            ? dataset.groupedByObservation.get(historyObservationDate)
            : [];

        const companiesByMarket = {};
        const marketCounts = new Map();

        for (const row of rows) {
            const market = row.mercado;
            const company = row.empresa;

            if (!companiesByMarket[market]) companiesByMarket[market] = new Set();
            companiesByMarket[market].add(company);
            marketCounts.set(market, Number(marketCounts.get(market) || 0) + 1);
        }

        const markets = Array.from(marketCounts.keys()).sort((a, b) => {
            const ai = DEMAND_DEFAULT_MARKETS.indexOf(a);
            const bi = DEMAND_DEFAULT_MARKETS.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            const byCount = Number(marketCounts.get(b) || 0) - Number(marketCounts.get(a) || 0);
            if (byCount !== 0) return byCount;
            return a.localeCompare(b);
        });

        const knownMarkets = Array.isArray(dataset.knownMarkets) ? dataset.knownMarkets : [];
        const knownMarketSet = new Set(knownMarkets);
        const knownMarketCount = knownMarkets.length || Math.max(DEMAND_DEFAULT_MARKETS.length, markets.length);
        const foundKnownCount = markets.filter((market) => knownMarketSet.has(market)).length;
        const autoSelectedMarkets = markets.filter((market) => DEMAND_DEFAULT_MARKETS.includes(market));

        const selectedDateBase = parseBrDate(selectedObservationDate) || new Date();
        const travelDateOptions = [];

        for (let offset = -1; offset <= 60; offset += 1) {
            const dt = new Date(selectedDateBase.getFullYear(), selectedDateBase.getMonth(), selectedDateBase.getDate() + offset);
            travelDateOptions.push({
                offset,
                date: toISOStringDate(dt)
            });
        }

        const payload = {
            meta: {
                baseDir: effectiveDir,
                requestedBaseDir: preferredDir,
                filesRead: dataset.filesRead,
                records: dataset.records,
                warnings: dataset.warnings,
                observationDates,
                selectedObservationDate,
                historyObservationDate,
                defaultMarkets: DEMAND_DEFAULT_MARKETS,
                marketCoverage: {
                    found: markets.length,
                    known: knownMarketCount,
                    foundKnown: foundKnownCount,
                    unknown: Math.max(0, markets.length - foundKnownCount)
                },
                stats: dataset.stats
            },
            travelDateOptions,
            defaultTravelDateSelection: travelDateOptions.map((item) => item.date),
            rows,
            historyRows,
            markets,
            defaultSelectedMarkets: autoSelectedMarkets.length ? autoSelectedMarkets : markets.slice(0, 10),
            companiesByMarket: Object.fromEntries(
                Object.entries(companiesByMarket).map(([market, companiesSet]) => [market, Array.from(companiesSet).sort()])
            )
        };

        return res.json(payload);
    } catch (error) {
        console.error('[DEMAND_DASH_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao gerar dashboard de Demanda.', details: String(error?.message || error) });
    }
});

router.get('/revenue-dashboard', async (req, res) => {
    try {
        const bypassCache = String(req.query.noCache || '').toLowerCase() === '1' || String(req.query.noCache || '').toLowerCase() === 'true';
        const compactMode = String(req.query.compact || '').toLowerCase() === '1' || String(req.query.compact || '').toLowerCase() === 'true';
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_REVENUE_BASE_DIR;
        const fallbackDir = path.join(__dirname, 'backups_sistema');

        const buildResponse = (payload) => {
            if (!compactMode) return payload;
            return {
                meta: payload?.meta || null,
                kpis: payload?.kpis || null
            };
        };

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) {
            effectiveDir = fallbackDir;
        }

        if (!fs.existsSync(effectiveDir)) {
            return res.status(400).json({
                error: 'Diretorio de base Revenue nao encontrado.',
                details: { requestedDir: preferredDir }
            });
        }

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

        const startParam = typeof req.query.startDate === 'string' ? req.query.startDate : null;
        const endParam = typeof req.query.endDate === 'string' ? req.query.endDate : null;

        const parsedStart = startParam ? parseBrDate(startParam) : defaultStart;
        const parsedEnd = endParam ? parseBrDate(endParam) : now;

        if (!parsedStart || !parsedEnd) {
            return res.status(400).json({ error: 'Periodo invalido. Use datas validas para inicio e fim.' });
        }

        const rangeStart = toStartOfDay(parsedStart);
        const rangeEnd = toEndOfDay(parsedEnd);

        if (rangeStart.getTime() > rangeEnd.getTime()) {
            return res.status(400).json({ error: 'Data inicial maior que data final.' });
        }

        const cacheKey = buildRevenueDashboardCacheKey(effectiveDir, rangeStart, rangeEnd);
        if (!bypassCache) {
            const cachedPayload = getRevenueDashboardCache(cacheKey);
            if (cachedPayload) {
                return res.json(buildResponse(cachedPayload));
            }

            const inFlight = revenueDashboardInFlight.get(cacheKey);
            if (inFlight) {
                const sharedPayload = await inFlight;
                return res.json(buildResponse(sharedPayload));
            }
        }

        const computePromise = runRevenueDashboardWorker({
            effectiveDir,
            preferredDir,
            rangeStart,
            rangeEnd
        }).catch(async (workerError) => {
            console.error('[REVENUE_DASH_WORKER_ERROR]', workerError);
            return buildRevenueDashboardPayload({
                effectiveDir,
                preferredDir,
                rangeStart,
                rangeEnd
            });
        });

        revenueDashboardInFlight.set(cacheKey, computePromise);

        try {
            const payload = await computePromise;
            setRevenueDashboardCache(cacheKey, payload);
            return res.json(buildResponse(payload));
        } finally {
            revenueDashboardInFlight.delete(cacheKey);
        }
    } catch (error) {
        console.error('[REVENUE_DASH_ERROR]', error);
        res.status(500).json({ error: 'Erro ao gerar dashboard de Revenue.', details: String(error?.message || error) });
    }
});

router.get('/revenue-dashboard-export', async (req, res) => {
    try {
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_REVENUE_BASE_DIR;
        const fallbackDir = path.join(__dirname, 'backups_sistema');

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) {
            effectiveDir = fallbackDir;
        }

        if (!fs.existsSync(effectiveDir)) {
            return res.status(400).json({
                error: 'Diretorio de base Revenue nao encontrado.',
                details: { requestedDir: preferredDir }
            });
        }

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);

        const startParam = typeof req.query.startDate === 'string' ? req.query.startDate : null;
        const endParam = typeof req.query.endDate === 'string' ? req.query.endDate : null;

        const parsedStart = startParam ? parseBrDate(startParam) : defaultStart;
        const parsedEnd = endParam ? parseBrDate(endParam) : now;

        if (!parsedStart || !parsedEnd) {
            return res.status(400).json({ error: 'Periodo invalido. Use datas validas para inicio e fim.' });
        }

        const rangeStart = toStartOfDay(parsedStart);
        const rangeEnd = toEndOfDay(parsedEnd);

        if (rangeStart.getTime() > rangeEnd.getTime()) {
            return res.status(400).json({ error: 'Data inicial maior que data final.' });
        }

        const payloadWithRows = await runRevenueDashboardWorker({
            effectiveDir,
            preferredDir,
            rangeStart,
            rangeEnd,
            includeRows: true
        }).catch(async (workerError) => {
            console.error('[REVENUE_DASH_EXPORT_WORKER_ERROR]', workerError);
            return buildRevenueDashboardPayload({
                effectiveDir,
                preferredDir,
                rangeStart,
                rangeEnd,
                includeRows: true
            });
        });

        const treatedRows = Array.isArray(payloadWithRows?.treatedRows) ? payloadWithRows.treatedRows : [];
        const workbook = XLSX.utils.book_new();
        const faixaOrder = ['0', '01 A 07', '08 A 15', '16 A 22', '23 A 30', '31 A 60', '60+'];

        const buildFaixaScenarioRows = (scenarioName, resolver) => {
            const counters = new Map(faixaOrder.map((bucket) => [bucket, 0]));
            let total = 0;

            for (const row of treatedRows) {
                const advpBruto = Number(row?.ADVP_Bruto);
                const advpScenario = resolver(advpBruto);
                const faixa = buildFaixaAdvp(advpScenario);
                counters.set(faixa, Number(counters.get(faixa) || 0) + 1);
                total += 1;
            }

            return faixaOrder.map((bucket) => {
                const qtd = Number(counters.get(bucket) || 0);
                return {
                    Cenario: scenarioName,
                    Faixa: bucket,
                    Qtd: qtd,
                    Percentual: total > 0 ? Number(((qtd / total) * 100).toFixed(2)) : 0
                };
            });
        };

        const diagnosticoRows = [
            ...buildFaixaScenarioRows('Atual (ADVP bruto)', (advp) => (Number.isFinite(advp) ? advp : null)),
            ...buildFaixaScenarioRows('Inclusivo (+1 se ADVP >= 0)', (advp) => (Number.isFinite(advp) ? (advp >= 0 ? advp + 1 : advp) : null)),
            ...buildFaixaScenarioRows('Absoluto (|ADVP|)', (advp) => (Number.isFinite(advp) ? Math.abs(advp) : null)),
            ...buildFaixaScenarioRows('Ceil por hora (coluna auditoria)', (_advp) => null).map((item) => {
                const matching = treatedRows.filter((row) => row?.Faixa_CeilPorHora === item.Faixa).length;
                return {
                    Cenario: 'Ceil por hora (coluna auditoria)',
                    Faixa: item.Faixa,
                    Qtd: matching,
                    Percentual: treatedRows.length > 0 ? Number(((matching / treatedRows.length) * 100).toFixed(2)) : 0
                };
            })
        ];

        const resumoRows = [
            { Campo: 'Base ativa', Valor: payloadWithRows?.meta?.baseDir || effectiveDir },
            { Campo: 'Periodo inicio', Valor: payloadWithRows?.meta?.selectedPeriod?.startDate || toISOStringDate(rangeStart) },
            { Campo: 'Periodo fim', Valor: payloadWithRows?.meta?.selectedPeriod?.endDate || toISOStringDate(rangeEnd) },
            { Campo: 'Arquivos lidos', Valor: Number(payloadWithRows?.meta?.filesRead || 0) },
            { Campo: 'Registros', Valor: Number(payloadWithRows?.kpis?.totalRegistros || 0) },
            { Campo: 'Aprovados', Valor: Number(payloadWithRows?.kpis?.aprovados || 0) },
            { Campo: 'Reprovados', Valor: Number(payloadWithRows?.kpis?.reprovados || 0) },
            { Campo: 'Taxa aprovacao (%)', Valor: Number(payloadWithRows?.kpis?.taxaAprovacao || 0) },
            { Campo: 'ADVP medio', Valor: Number(payloadWithRows?.kpis?.advpMedio || 0) },
        ];

        const faixaRows = Array.isArray(payloadWithRows?.series?.faixaQtdPercentual)
            ? payloadWithRows.series.faixaQtdPercentual.map((item) => ({
                Faixa: item.faixa,
                Qtd: Number(item.qtdAdvp || 0),
                PercentualTotal: Number(item.percentualTotal || 0),
                MediaRevenueAplicado: Number(item.mediaRevenueAplicado || 0)
            }))
            : [];

        const wsResumo = XLSX.utils.json_to_sheet(resumoRows);
        const wsFaixa = XLSX.utils.json_to_sheet(faixaRows);
        const wsDiagnostico = XLSX.utils.json_to_sheet(diagnosticoRows);
        const wsDados = XLSX.utils.json_to_sheet(treatedRows);

        wsResumo['!cols'] = [{ wch: 28 }, { wch: 40 }];
        wsFaixa['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 18 }];
        wsDiagnostico['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 10 }, { wch: 12 }];
        wsDados['!cols'] = [
            { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 10 },
            { wch: 16 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 14 },
            { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
            { wch: 14 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 },
            { wch: 16 }, { wch: 18 }, { wch: 28 }, { wch: 12 }
        ];

        XLSX.utils.book_append_sheet(workbook, wsResumo, 'Resumo');
        XLSX.utils.book_append_sheet(workbook, wsFaixa, 'Mapa Faixa');
        XLSX.utils.book_append_sheet(workbook, wsDiagnostico, 'Diagnostico Faixa');
        XLSX.utils.book_append_sheet(workbook, wsDados, 'Dados Tratados');

        const filename = `revenue_tratado_${toISOStringDate(rangeStart)}_${toISOStringDate(rangeEnd)}.xlsx`;
        const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(fileBuffer);
    } catch (error) {
        console.error('[REVENUE_DASH_EXPORT_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao exportar dados tratados de Revenue.', details: String(error?.message || error) });
    }
});
export default router;
