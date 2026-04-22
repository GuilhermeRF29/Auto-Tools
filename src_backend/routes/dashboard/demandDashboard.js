/**
 * @module dashboard/demandDashboard
 * @description Módulo do Dashboard de Demanda (Forecast).
 * 
 * Responsável por:
 *   - Coleta e leitura de arquivos de demanda (Excel, DuckDB, Parquet)
 *   - Processamento de múltiplas datas de observação
 *   - Mapeamento "De Para" de linhas para mercados
 *   - Cálculos de ocupação, capacidade e APV por mercado
 *   - Comparação com histórico (ano anterior)
 *   - Cache com TTL para performance
 */

import { Router } from 'express';
import {
    fs, path, XLSX,
    parseBrDate, toStartOfDay, toNumber, toISOStringDate,
    normalizeText, normalizeKeyToken, stripAccents, getRowValue,
    readTabularRows, loadDeParaMap, listObservationDatesFromDuckDb,
    createCacheAccessors, buildSafeDate,
    DEMAND_COLUMN_ALIASES, DEMAND_OBSERVATION_ALIASES, DUCKDB_EXTENSIONS
} from './dashboardUtils.js';

// ============================================================
// CONSTANTES DA DEMANDA
// ============================================================

const DEFAULT_DEMAND_BASE_DIR = 'Z:\\Forecast\\Forecast2';
const DEMAND_FILE_REGEX = /\.(xlsx|xls|xlsm|csv|db|sqlite|sqlite3|duckdb|parquet)$/i;
const DEMAND_EXCLUDED_FILE_REGEX = /de\s*para/i;
const DEMAND_CACHE_TTL_MS = 5 * 60 * 1000;

/** Mercados padrão selecionados ao abrir o dashboard */
const DEMAND_DEFAULT_MARKETS = [
    'BELO HORIZONTE - RIO DE JANEIRO', 'CURITIBA - LITORAL SC', 'RAPIDO R. PRETO',
    'SAO PAULO - BELO HORIZONTE', 'SAO PAULO - CURITIBA', 'SAO PAULO - FRANCA',
    'SAO PAULO - RIBEIRAO PRETO', 'SAO PAULO - RIO DE JANEIRO',
    'SAO PAULO - SAO JOSE DO RIO PRETO', 'SP - LITORAL SC'
];

// ============================================================
// CACHE
// ============================================================

const demandDashboardCache = new Map();
const demandDashboardRowsCache = new Map();
const { get: getDemandDashboardCache, set: setDemandDashboardCache } =
    createCacheAccessors(demandDashboardCache, DEMAND_CACHE_TTL_MS);
const { get: getDemandRowsCache, set: setDemandRowsCache } =
    createCacheAccessors(demandDashboardRowsCache, DEMAND_CACHE_TTL_MS);

const buildDemandDashboardCacheKey = (baseDir, suffix = '') =>
    `${String(baseDir || '').trim().toLowerCase()}|${String(suffix || '')}`;

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

const normalizeDemandToken = (value) => stripAccents(String(value || ''))
    .toUpperCase().replace(/\([^)]*\)/g, ' ').replace(/\s+-\s+[A-Z]{2}\b/g, ' ')
    .replace(/\s+/g, ' ').trim();

const isDuckDbFilePath = (filePath) => DUCKDB_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());

const collectDemandFiles = (baseDir) => {
    if (!fs.existsSync(baseDir)) return [];
    return fs.readdirSync(baseDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && DEMAND_FILE_REGEX.test(entry.name)
            && !entry.name.startsWith('~$') && !DEMAND_EXCLUDED_FILE_REGEX.test(entry.name))
        .map((entry) => {
            const fullPath = path.join(baseDir, entry.name);
            const stat = fs.statSync(fullPath);
            return { filePath: fullPath, fileName: entry.name, mtime: stat.mtime, mtimeMs: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const buildDemandFilesSignature = (files = []) => files
    .map((file) => `${file.filePath}|${Number(file.mtimeMs || 0)}|${Number(file.size || 0)}`).join('||');

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
        if (keys.some((key) => key === 'DATA' || key === 'DATA VIAGEM')
            && keys.some((key) => key === 'ORIGEM' || key === 'MERCADO')
            && keys.some((key) => key === 'PAX' || key === 'OCUPACAO' || key === 'PASSAGEIRO')) return name;
    }
    return names[0];
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
    if (msEpochMatch) { const dt = new Date(Number(msEpochMatch[2])); if (!Number.isNaN(dt.getTime())) return toStartOfDay(dt); }
    const ymdMatch = cleanName.match(/(^|[^\d])(20\d{2})[-_.\s](\d{1,2})[-_.\s](\d{1,2})(?!\d)/);
    if (ymdMatch) { const dt = buildSafeDate(Number(ymdMatch[2]), Number(ymdMatch[3]), Number(ymdMatch[4])); if (dt) return toStartOfDay(dt); }
    const dmyMatch = cleanName.match(/(^|[^\d])(\d{1,2})[-_.\s](\d{1,2})[-_.\s](\d{4}|\d{2})(?!\d)/);
    if (dmyMatch) { const y = Number(dmyMatch[4].length === 2 ? `20${dmyMatch[4]}` : dmyMatch[4]); const dt = buildSafeDate(y, Number(dmyMatch[3]), Number(dmyMatch[2])); if (dt) return toStartOfDay(dt); }
    const ymMatch = cleanName.match(/(20\d{2})[-_.\s](\d{1,2})/);
    if (ymMatch) { const dt = buildSafeDate(Number(ymMatch[1]), Number(ymMatch[2]), 1); if (dt) return toStartOfDay(dt); }
    if (fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())) return toStartOfDay(fallbackDate);
    return null;
};

const buildDemandMarket = (row) => {
    const origem = getRowValue(row, ['ORIGEM', 'Origem']);
    const destino = getRowValue(row, ['DESTINO', 'Destino']);
    const mercadoRaw = getRowValue(row, ['MERCADO', 'Mercado', 'Concatenar Origem e Destino']);
    if (origem || destino) {
        return `${normalizeDemandToken(origem || 'SEM ORIGEM')} - ${normalizeDemandToken(destino || 'SEM DESTINO')}`;
    }
    if (mercadoRaw) return normalizeDemandToken(mercadoRaw).replace(/\s+X\s+/g, ' - ').replace(/\s*\/\s*/g, ' - ');
    return 'SEM MERCADO';
};

const resolveHistoryObservationDate = (observationDates, selectedObservationDate) => {
    const selectedDateObj = parseBrDate(selectedObservationDate);
    if (!selectedDateObj) return null;
    const targetHistoryDate = toISOStringDate(new Date(selectedDateObj.getFullYear() - 1, selectedDateObj.getMonth(), selectedDateObj.getDate()));
    if (targetHistoryDate && observationDates.includes(targetHistoryDate)) return targetHistoryDate;
    const targetTime = parseBrDate(targetHistoryDate)?.getTime();
    const candidates = observationDates.filter((iso) => { const dt = parseBrDate(iso); return dt ? dt.getFullYear() === selectedDateObj.getFullYear() - 1 : false; });
    if (candidates.length && Number.isFinite(targetTime)) {
        return [...candidates].sort((a, b) => Math.abs((parseBrDate(a)?.getTime() || 0) - targetTime) - Math.abs((parseBrDate(b)?.getTime() || 0) - targetTime))[0];
    }
    return null;
};

// ============================================================
// CONSTRUÇÃO DO DATASET
// ============================================================

const buildDemandDataset = async (effectiveDir, { sourceFiles = null, observationDateAllowlist = null, onlyObservationDates = false } = {}) => {
    const files = Array.isArray(sourceFiles) ? sourceFiles : collectDemandFiles(effectiveDir);
    const allowlistSet = Array.isArray(observationDateAllowlist) && observationDateAllowlist.length
        ? new Set(observationDateAllowlist.map((item) => String(item || '').trim()).filter(Boolean)) : null;
    const deParaMap = await loadDeParaMap(effectiveDir);
    const knownMarkets = new Set(Array.from(deParaMap.values()).map((item) => normalizeDemandToken(item?.mercado || '')).filter(Boolean));
    const warnings = [];
    const groupedByObservation = new Map();
    const seenRowsByObservation = new Map();
    let totalRows = 0;
    const stats = { totalRead: 0, processed: 0, skippedDate: 0, skippedEmpty: 0, skippedNoValues: 0, skippedAdvp: 0, skippedDuplicated: 0 };

    for (const file of files) {
        try {
            const rawRows = await readTabularRows(file.filePath, {
                sheetResolver: pickDemandSheet, columnAliases: DEMAND_COLUMN_ALIASES,
                duckdbOptions: { observationColumnAliases: DEMAND_OBSERVATION_ALIASES, observationDateAllowlist: allowlistSet ? Array.from(allowlistSet) : [] }
            });
            const fallbackObsDate = parseObservationDateFromName(file.fileName, file.mtime);

            for (const row of rawRows) {
                stats.totalRead++;
                const observationRaw = getRowValue(row, DEMAND_OBSERVATION_ALIASES);
                let observationDate = parseBrDate(observationRaw);
                if (observationDate) { observationDate = toStartOfDay(observationDate); }
                else if (row._tableName) { const extracted = parseObservationDateFromName(row._tableName, null); observationDate = extracted || fallbackObsDate; }
                else { observationDate = fallbackObsDate; }

                if (!(observationDate instanceof Date) || Number.isNaN(observationDate.getTime())) { stats.skippedDate++; continue; }
                const obsIso = toISOStringDate(observationDate);
                if (allowlistSet && !allowlistSet.has(obsIso)) continue;
                const bucket = groupedByObservation.get(obsIso) || [];

                if (onlyObservationDates) { if (!groupedByObservation.has(obsIso)) groupedByObservation.set(obsIso, []); continue; }

                const travelDateRaw = getRowValue(row, ['Data Viagem', 'DATA VIAGEM', 'DATA', 'Data', 'DT_VIAGEM', 'data_viagem', 'dt_viagem', 'DATA DA VIAGEM']);
                const travelDate = parseBrDate(travelDateRaw);
                if (!travelDate) { stats.skippedDate++; continue; }

                const linhaRaw = getRowValue(row, ['LINHA', 'Linha', 'Cod Linha', 'Cod_Linha', 'SERVIÇO', 'SERVICO', 'Num. Serviço', 'Num. Servico', 'servico', 'id_linha']);
                const linhaRawValue = linhaRaw !== null && linhaRaw !== undefined ? String(linhaRaw).trim() : '';
                const normLinha = linhaRawValue ? (linhaRawValue.replace(/^0+/, '') || '0') : 'SEM LINHA';
                const deParaEntry = (linhaRawValue ? deParaMap.get(`RAW:${linhaRawValue}`) : null) || deParaMap.get(`NORM:${normLinha}`);

                const empresaRaw = getRowValue(row, ['EMPRESA', 'Empresa', 'empresa', 'EMPRESA EXECUTANTE', 'Cia']);
                const empresa = normalizeDemandToken(deParaEntry?.empresa || empresaRaw || 'SEM EMPRESA');
                const mercado = normalizeDemandToken(deParaEntry?.mercado || '') || 'OUTROS MERCADOS';

                const ocupacaoRaw = getRowValue(row, ['PAX', 'Passageiro', 'PASSAGEIROS', 'Ocupação', 'OCUPAÇÃO', 'Ocupacao', 'Pax Total', 'TRANSITADO', 'Pax_Total', 'pax']);
                const capacidadeRaw = getRowValue(row, ['Capacidade', 'CAPACIDADE', 'Oferta', 'OFERTA', 'Vagas', 'VAGAS', 'Cap', 'Cap_Total', 'oferta']);
                const apvRaw = getRowValue(row, ['%Ocupação', '% Ocupação', 'APV', 'IPV', 'IPV 3', 'IPV3', '% APV', 'Aproveitamento', 'APROVEITAMENTO', 'apv']);

                let ocupacao = toNumber(ocupacaoRaw);
                let capacidade = toNumber(capacidadeRaw);
                const apvRatio = parseRatio(apvRaw);
                if (!Number.isFinite(capacidade) && Number.isFinite(ocupacao) && Number.isFinite(apvRatio) && apvRatio > 0) capacidade = ocupacao / apvRatio;
                if (!Number.isFinite(ocupacao) && Number.isFinite(capacidade) && Number.isFinite(apvRatio)) ocupacao = capacidade * apvRatio;

                if ((!Number.isFinite(ocupacao) || ocupacao <= 0) && (!Number.isFinite(capacidade) || capacidade <= 0)) { stats.skippedEmpty++; continue; }
                if (!Number.isFinite(ocupacao) && !Number.isFinite(capacidade)) { stats.skippedNoValues++; continue; }

                const finalCapacidade = Number.isFinite(capacidade) && capacidade > 0 ? capacidade : 0;
                const finalOcupacao = Number.isFinite(ocupacao) && ocupacao >= 0 ? ocupacao : 0;
                if (finalCapacidade <= 0 && finalOcupacao <= 0) { stats.skippedNoValues++; continue; }

                const travelDay = toStartOfDay(travelDate);
                const advp = Math.round((travelDay.getTime() - observationDate.getTime()) / 86400000);
                if (advp < -1) stats.skippedAdvp++;

                const dedupeSet = seenRowsByObservation.get(obsIso) || new Set();
                const rowSignature = JSON.stringify(Object.keys(row).sort().reduce((acc, key) => { acc[key] = row[key]; return acc; }, {}));
                const dedupeKey = [obsIso, rowSignature].join('|');
                if (dedupeSet.has(dedupeKey)) { stats.skippedDuplicated++; continue; }
                dedupeSet.add(dedupeKey);
                seenRowsByObservation.set(obsIso, dedupeSet);

                bucket.push({
                    observationDate: obsIso, travelDate: toISOStringDate(travelDay), mercado, empresa,
                    linha: normLinha, ocupacao: Number(finalOcupacao.toFixed(4)), capacidade: Number(finalCapacidade.toFixed(4)),
                    apv: finalCapacidade > 0 ? Number((finalOcupacao / finalCapacidade).toFixed(6)) : 0, advp, faixaAdvp: buildDemandFaixa(advp)
                });
                groupedByObservation.set(obsIso, bucket);
                stats.processed++;
            }
        } catch (error) { warnings.push(`Falha ao ler ${file.fileName}: ${error.message || error}`); }
    }

    for (const rows of groupedByObservation.values()) totalRows += rows.length;
    return {
        baseDir: effectiveDir, filesRead: files.length, records: totalRows, stats, warnings,
        observationDates: Array.from(groupedByObservation.keys()).sort((a, b) => b.localeCompare(a)),
        groupedByObservation, knownMarkets: Array.from(knownMarkets).sort((a, b) => a.localeCompare(b))
    };
};

// ============================================================
// ROTAS Express
// ============================================================

const router = Router();

/** GET /demand-dashboard — Retorna payload do dashboard de Demanda */
router.get('/demand-dashboard', async (req, res) => {
    try {
        const bypassCache = ['1', 'true'].includes(String(req.query.noCache || '').toLowerCase());
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_DEMAND_BASE_DIR;
        const fallbackDir = path.join(path.resolve('.'), 'backups_sistema');

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) effectiveDir = fallbackDir;
        if (!fs.existsSync(effectiveDir)) return res.status(400).json({ error: 'Diretorio de base Demanda nao encontrado.', details: { requestedDir: preferredDir } });

        const requestedObservationDate = typeof req.query.observationDate === 'string' ? req.query.observationDate : '';
        const demandFiles = collectDemandFiles(effectiveDir);
        const filesSignature = buildDemandFilesSignature(demandFiles);
        const hasSingleDuckDbSource = demandFiles.length === 1 && isDuckDbFilePath(demandFiles[0]?.filePath);

        let dataset = null, observationDates = [], selectedObservationDate = null, historyObservationDate = null;

        if (hasSingleDuckDbSource) {
            const summaryCacheKey = buildDemandDashboardCacheKey(effectiveDir, `${filesSignature}|duckdb-summary`);
            let summaryDataset = !bypassCache ? getDemandDashboardCache(summaryCacheKey) : null;

            if (!summaryDataset) {
                const observationSummary = await listObservationDatesFromDuckDb(demandFiles[0].filePath, DEMAND_OBSERVATION_ALIASES);
                const deParaMap = await loadDeParaMap(effectiveDir);
                const knownMarkets = Array.from(new Set(Array.from(deParaMap.values()).map((item) => normalizeDemandToken(item?.mercado || '')).filter(Boolean))).sort((a, b) => a.localeCompare(b));
                summaryDataset = {
                    baseDir: effectiveDir, filesRead: demandFiles.length, records: Number(observationSummary?.totalRows || 0),
                    stats: { totalRead: Number(observationSummary?.totalRows || 0), processed: 0, skippedDate: 0, skippedEmpty: 0, skippedNoValues: 0, skippedAdvp: 0, skippedDuplicated: 0, mode: 'duckdb-summary' },
                    warnings: [], observationDates: Array.isArray(observationSummary?.observationDates) ? observationSummary.observationDates : [],
                    groupedByObservation: new Map(), knownMarkets
                };
                setDemandDashboardCache(summaryCacheKey, summaryDataset);
            }

            observationDates = Array.isArray(summaryDataset.observationDates) ? summaryDataset.observationDates : [];
            selectedObservationDate = observationDates.includes(requestedObservationDate) ? requestedObservationDate : (observationDates[0] || null);

            if (!selectedObservationDate) { dataset = summaryDataset; }
            else {
                historyObservationDate = resolveHistoryObservationDate(observationDates, selectedObservationDate);
                const dateAllowlist = [selectedObservationDate, historyObservationDate].filter(Boolean);
                const rowsCacheKey = buildDemandDashboardCacheKey(effectiveDir, `${filesSignature}|duckdb-rows|${dateAllowlist.join('|')}`);
                const rowsDataset = (!bypassCache ? getDemandRowsCache(rowsCacheKey) : null) || await buildDemandDataset(effectiveDir, { sourceFiles: demandFiles, observationDateAllowlist: dateAllowlist });
                if (!getDemandRowsCache(rowsCacheKey)) setDemandRowsCache(rowsCacheKey, rowsDataset);
                dataset = { ...summaryDataset, groupedByObservation: rowsDataset.groupedByObservation, warnings: [...(summaryDataset.warnings || []), ...(rowsDataset.warnings || [])], stats: rowsDataset.stats || summaryDataset.stats };
            }
        } else {
            const cacheKey = buildDemandDashboardCacheKey(effectiveDir, filesSignature);
            dataset = (!bypassCache ? getDemandDashboardCache(cacheKey) : null) || await buildDemandDataset(effectiveDir, { sourceFiles: demandFiles });
            if (!getDemandDashboardCache(cacheKey)) setDemandDashboardCache(cacheKey, dataset);
            observationDates = Array.isArray(dataset.observationDates) ? dataset.observationDates : [];
            selectedObservationDate = observationDates.includes(requestedObservationDate) ? requestedObservationDate : (observationDates[0] || null);
            if (selectedObservationDate) historyObservationDate = resolveHistoryObservationDate(observationDates, selectedObservationDate);
        }

        if (!selectedObservationDate) {
            return res.json({
                meta: { baseDir: effectiveDir, requestedBaseDir: preferredDir, filesRead: dataset.filesRead || 0, records: 0, warnings: [...(dataset.warnings || []), 'Nenhuma data de observacao identificada nos arquivos.'], observationDates: [], selectedObservationDate: null, historyObservationDate: null, defaultMarkets: DEMAND_DEFAULT_MARKETS, marketCoverage: { found: 0, known: Array.isArray(dataset.knownMarkets) ? dataset.knownMarkets.length : DEMAND_DEFAULT_MARKETS.length } },
                travelDateOptions: [], defaultTravelDateSelection: [], rows: [], historyRows: [], markets: [], defaultSelectedMarkets: [], companiesByMarket: {}
            });
        }

        const rows = Array.isArray(dataset.groupedByObservation.get(selectedObservationDate)) ? dataset.groupedByObservation.get(selectedObservationDate) : [];
        const historyRows = historyObservationDate && Array.isArray(dataset.groupedByObservation.get(historyObservationDate)) ? dataset.groupedByObservation.get(historyObservationDate) : [];

        const companiesByMarket = {};
        const marketCounts = new Map();
        for (const row of rows) {
            if (!companiesByMarket[row.mercado]) companiesByMarket[row.mercado] = new Set();
            companiesByMarket[row.mercado].add(row.empresa);
            marketCounts.set(row.mercado, Number(marketCounts.get(row.mercado) || 0) + 1);
        }

        const markets = Array.from(marketCounts.keys()).sort((a, b) => {
            const ai = DEMAND_DEFAULT_MARKETS.indexOf(a), bi = DEMAND_DEFAULT_MARKETS.indexOf(b);
            if (ai !== -1 && bi !== -1) return ai - bi;
            if (ai !== -1) return -1;
            if (bi !== -1) return 1;
            const byCount = Number(marketCounts.get(b) || 0) - Number(marketCounts.get(a) || 0);
            return byCount !== 0 ? byCount : a.localeCompare(b);
        });

        const knownMarkets = Array.isArray(dataset.knownMarkets) ? dataset.knownMarkets : [];
        const knownMarketSet = new Set(knownMarkets);
        const autoSelectedMarkets = markets.filter((m) => DEMAND_DEFAULT_MARKETS.includes(m));

        const selectedDateBase = parseBrDate(selectedObservationDate) || new Date();
        const travelDateOptions = [];
        for (let offset = -1; offset <= 60; offset += 1) {
            const dt = new Date(selectedDateBase.getFullYear(), selectedDateBase.getMonth(), selectedDateBase.getDate() + offset);
            travelDateOptions.push({ offset, date: toISOStringDate(dt) });
        }

        return res.json({
            meta: {
                baseDir: effectiveDir, requestedBaseDir: preferredDir, filesRead: dataset.filesRead, records: dataset.records,
                warnings: dataset.warnings, observationDates, selectedObservationDate, historyObservationDate,
                defaultMarkets: DEMAND_DEFAULT_MARKETS,
                marketCoverage: { found: markets.length, known: knownMarkets.length || Math.max(DEMAND_DEFAULT_MARKETS.length, markets.length), foundKnown: markets.filter((m) => knownMarketSet.has(m)).length, unknown: Math.max(0, markets.length - markets.filter((m) => knownMarketSet.has(m)).length) },
                stats: dataset.stats
            },
            travelDateOptions, defaultTravelDateSelection: travelDateOptions.map((item) => item.date),
            rows, historyRows, markets, defaultSelectedMarkets: autoSelectedMarkets.length ? autoSelectedMarkets : markets.slice(0, 10),
            companiesByMarket: Object.fromEntries(Object.entries(companiesByMarket).map(([market, set]) => [market, Array.from(set).sort()]))
        });
    } catch (error) {
        console.error('[DEMAND_DASH_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao gerar dashboard de Demanda.', details: String(error?.message || error) });
    }
});

export default router;
export { DEFAULT_DEMAND_BASE_DIR };
