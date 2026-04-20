/**
 * @module dashboard/revenueDashboard
 * @description Módulo do Dashboard de Revenue — aplicação de receita.
 * 
 * Responsável por:
 *   - Coleta e leitura de arquivos de Revenue (Excel, CSV, DB, Parquet)
 *   - Cálculo de KPIs: taxa de aprovação, ADVP médio, total de revenue aplicado
 *   - Construção de séries para gráficos: por dia, canal, faixa ADVP, etc.
 *   - Cache com TTL e de-duplicação de requisições in-flight
 *   - Exportação para Excel tratado com múltiplas abas
 */

import { Router } from 'express';
import {
    fs, path, XLSX,
    parseBrDate, toStartOfDay, toEndOfDay, toNumber, normalizeText,
    normalizeRouteLabel, formatDayKey, toISOStringDate, sum, avg,
    getRowValue, readTabularRows, createCacheAccessors,
    REVENUE_COLUMN_ALIASES, EXCEL_LIKE_EXTENSIONS
} from './dashboardUtils.js';

// ============================================================
// CONSTANTES DO REVENUE
// ============================================================

/** Diretório padrão de origem dos arquivos Revenue */
const DEFAULT_REVENUE_BASE_DIR = 'Z:\\DASH REVENUE APPLICATION\\BASE';

/** Regex para identificar arquivos de Revenue pelo nome */
const REVENUE_FILE_REGEX = /revenue.*\.(xlsx|xls|xlsm|csv|db|sqlite|sqlite3|duckdb|parquet)$/i;

/** TTL do cache de dashboards (5 minutos) */
const REVENUE_DASH_CACHE_TTL_MS = 5 * 60 * 1000;

/** Timeout para worker threads (2 minutos) */
const REVENUE_DASH_WORKER_TIMEOUT_MS = 120 * 1000;

// ============================================================
// CACHE EM MEMÓRIA
// ============================================================

const revenueDashboardCache = new Map();
const revenueDashboardInFlight = new Map();
const { get: getRevenueDashboardCache, set: setRevenueDashboardCache } =
    createCacheAccessors(revenueDashboardCache, REVENUE_DASH_CACHE_TTL_MS);

/** Gera chave de cache com base no diretório e período selecionado */
const buildRevenueDashboardCacheKey = (dir, rangeStart, rangeEnd) =>
    `${String(dir || '').trim().toLowerCase()}|${toISOStringDate(rangeStart)}|${toISOStringDate(rangeEnd)}`;

// ============================================================
// FUNÇÕES DE CLASSIFICAÇÃO
// ============================================================

/** Classifica status como aprovado/reprovado/outros */
const classifyStatusRevenue = (status) => {
    const normalized = normalizeText(status, 'Sem Status').toLowerCase();
    if (normalized.includes('aprov')) return 'aprovado';
    if (normalized.includes('reprov')) return 'reprovado';
    return 'outros';
};

/** Classifica indicador como aumentou/diminuiu/igual/outros */
const classifyIndicador = (indicador) => {
    const normalized = normalizeText(indicador, 'Sem Indicador').toLowerCase();
    if (normalized.includes('aument')) return 'aumentou';
    if (normalized.includes('dimin')) return 'diminuiu';
    if (normalized.includes('igual')) return 'igual';
    return 'outros';
};

/** Calcula ADVP (Antecedência Da Viagem em relação à Partida) */
const calculateAdvp = (dataAplicacao, dataViagem) => {
    if (!dataAplicacao || !dataViagem) return { raw: null, star: null };
    const advp2 = Math.round((dataViagem.getTime() - dataAplicacao.getTime()) / 86400000);
    return { raw: advp2, star: advp2 };
};

/** Mapeia ADVP para faixa de antecedência */
const buildFaixaAdvp = (advpStar) => {
    if (!Number.isFinite(advpStar) || advpStar <= 0) return '0';
    if (advpStar <= 7) return '01 A 07';
    if (advpStar <= 15) return '08 A 15';
    if (advpStar <= 22) return '16 A 22';
    if (advpStar <= 30) return '23 A 30';
    if (advpStar <= 60) return '31 A 60';
    return '60+';
};

// ============================================================
// COLETA DE ARQUIVOS
// ============================================================

/** Seleciona a aba mais apropriada em um workbook de Revenue */
const pickRevenueSheet = (workbook) => {
    const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if (names.length === 0) return null;
    return names.find((name) => /revenue|base|relatorio/i.test(name)) || names[0];
};

/** Coleta todos os arquivos Revenue do diretório e subpastas */
const collectRevenueFiles = (baseDir) => {
    if (!fs.existsSync(baseDir)) return [];
    const collected = [];

    const walk = (dir) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.isFile() && REVENUE_FILE_REGEX.test(entry.name) && !entry.name.startsWith('~$')) {
                collected.push(fullPath);
            }
        }
    };

    walk(baseDir);
    return collected;
};

// ============================================================
// CONSTRUÇÃO DO PAYLOAD
// ============================================================

/** Formata data para exibição no formato DD/MM/YYYY */
const formatExportDate = (value) => {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = String(value.getFullYear());
    return `${day}/${month}/${year}`;
};

/** Payload vazio retornado quando nenhum arquivo é encontrado */
const buildEmptyRevenuePayload = (effectiveDir, preferredDir, rangeStart, rangeEnd, warnings = [], includeRows = false) => ({
    meta: {
        baseDir: effectiveDir,
        requestedBaseDir: preferredDir,
        selectedPeriod: { startDate: toISOStringDate(rangeStart), endDate: toISOStringDate(rangeEnd) },
        filesRead: 0, records: 0, warnings
    },
    kpis: { totalRegistros: 0, aprovados: 0, reprovados: 0, taxaAprovacao: 0, totalRevenueAplicado: 0, mediaRevenueAplicado: 0, advpMedio: 0 },
    series: { revenueAplicadoPorDia: [], totalRevenueAplicado: [], advpStatus: [], evolucaoTmXAdvp: [], revenuePorCanal: [], faixaQtdPercentual: [], aproveitamentoAplicacao: [], justificativa: [], analistaIndicador: [], rotasAplicadas: [] },
    ...(includeRows ? { treatedRows: [] } : {})
});

/**
 * Constrói o payload completo do dashboard de Revenue.
 * Lê todos os arquivos, processa linhas, calcula KPIs e séries.
 */
const buildRevenueDashboardPayload = async ({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows = false }) => {
    const files = collectRevenueFiles(effectiveDir);
    if (!files.length) {
        return buildEmptyRevenuePayload(effectiveDir, preferredDir, rangeStart, rangeEnd,
            ['Nenhum arquivo Revenue encontrado no diretorio selecionado.'], includeRows);
    }

    const dedupe = new Set();
    const rows = [];
    const parseWarnings = [];

    // --- Leitura e parsing de todos os arquivos ---
    for (const filePath of files) {
        try {
            const rawRows = await readTabularRows(filePath, { sheetResolver: pickRevenueSheet, columnAliases: REVENUE_COLUMN_ALIASES });
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

                // Deduplicação: chave composta de campos principais
                const dedupeKey = [origem, destino, toISOStringDate(dataAplicacao), dataViagem ? toISOStringDate(dataViagem) : '', canalVenda, revenueAplicado ?? '', statusRevenue, indicador, analista, numServico, justificativa].join('|');
                if (dedupe.has(dedupeKey)) continue;
                dedupe.add(dedupeKey);

                const advp = calculateAdvp(dataAplicacao, dataViagem);
                rows.push({
                    dataAplicacao, dataAplicacaoKey: toISOStringDate(dataAplicacao), dataAplicacaoLabel: formatDayKey(dataAplicacao),
                    dataViagem, revenueAplicado, statusRevenue, statusBucket: classifyStatusRevenue(statusRevenue),
                    indicador, indicadorBucket: classifyIndicador(indicador), canalVenda, justificativa, analista,
                    origem, destino, numServico, rota, advpRaw: advp.raw, advpStar: advp.star, faixaMapa: buildFaixaAdvp(advp.star)
                });
            }
        } catch (error) {
            parseWarnings.push(`Falha ao ler ${path.basename(filePath)}: ${error.message || error}`);
        }
    }

    rows.sort((a, b) => a.dataAplicacao.getTime() - b.dataAplicacao.getTime());

    // --- Agregação por múltiplas dimensões ---
    const dayMap = new Map(), canalMap = new Map(), advpMap = new Map();
    const evolucaoMap = new Map(), faixaMap = new Map(), statusMap = new Map();
    const justificativaMap = new Map(), analistaMap = new Map(), rotaMap = new Map();

    for (const row of rows) {
        // Agregação por dia
        const dayItem = dayMap.get(row.dataAplicacaoKey) || { date: row.dataAplicacaoKey, dia: row.dataAplicacaoLabel, aprovado: 0, reprovado: 0, outros: 0, total: 0 };
        dayItem[row.statusBucket] = (dayItem[row.statusBucket] || 0) + 1;
        dayItem.total += 1;
        dayMap.set(row.dataAplicacaoKey, dayItem);

        // Agregação por canal
        const canalItem = canalMap.get(row.canalVenda) || { canal: row.canalVenda, aprovado: 0, reprovado: 0, outros: 0, total: 0 };
        canalItem[row.statusBucket] = (canalItem[row.statusBucket] || 0) + 1;
        canalItem.total += 1;
        canalMap.set(row.canalVenda, canalItem);

        // Agregação por ADVP
        if (Number.isFinite(row.advpStar)) {
            const advpBucket = String(row.advpStar);
            const advpItem = advpMap.get(advpBucket) || { advp: advpBucket, aprovado: 0, reprovado: 0, outros: 0, total: 0 };
            advpItem[row.statusBucket] = (advpItem[row.statusBucket] || 0) + 1;
            advpItem.total += 1;
            advpMap.set(advpBucket, advpItem);

            const evolucaoItem = evolucaoMap.get(advpBucket) || { advp: advpBucket, total: 0, minRevenue: Number.POSITIVE_INFINITY, sumRevenue: 0, qtdRevenue: 0, aprovado: 0, reprovado: 0 };
            evolucaoItem.total += 1;
            if (row.statusBucket === 'aprovado') evolucaoItem.aprovado += 1;
            if (row.statusBucket === 'reprovado') evolucaoItem.reprovado += 1;
            if (Number.isFinite(row.revenueAplicado)) { evolucaoItem.minRevenue = Math.min(evolucaoItem.minRevenue, row.revenueAplicado); evolucaoItem.sumRevenue += row.revenueAplicado; evolucaoItem.qtdRevenue += 1; }
            evolucaoMap.set(advpBucket, evolucaoItem);
        }

        // Agregação por faixa ADVP
        const faixaItem = faixaMap.get(row.faixaMapa) || { faixa: row.faixaMapa, qtdAdvp: 0, sumRevenue: 0, qtdRevenue: 0 };
        faixaItem.qtdAdvp += 1;
        if (Number.isFinite(row.revenueAplicado)) { faixaItem.sumRevenue += row.revenueAplicado; faixaItem.qtdRevenue += 1; }
        faixaMap.set(row.faixaMapa, faixaItem);

        // Status, justificativa, analista, rota
        const statusItem = statusMap.get(row.statusRevenue) || { status: row.statusRevenue, total: 0 };
        statusItem.total += 1;
        statusMap.set(row.statusRevenue, statusItem);

        const justItem = justificativaMap.get(row.justificativa) || { justificativa: row.justificativa, aprovado: 0, reprovado: 0, outros: 0, total: 0 };
        justItem[row.statusBucket] = (justItem[row.statusBucket] || 0) + 1;
        justItem.total += 1;
        justificativaMap.set(row.justificativa, justItem);

        const analistaItem = analistaMap.get(row.analista) || { analista: row.analista, aumentou: 0, diminuiu: 0, igual: 0, outros: 0, total: 0 };
        analistaItem[row.indicadorBucket] = (analistaItem[row.indicadorBucket] || 0) + 1;
        analistaItem.total += 1;
        analistaMap.set(row.analista, analistaItem);

        const rotaItem = rotaMap.get(row.rota) || { rota: row.rota, total: 0, sumRevenue: 0, qtdRevenue: 0 };
        rotaItem.total += 1;
        if (Number.isFinite(row.revenueAplicado)) { rotaItem.sumRevenue += row.revenueAplicado; rotaItem.qtdRevenue += 1; }
        rotaMap.set(row.rota, rotaItem);
    }

    // --- KPIs ---
    const totaisRevenue = rows.map((r) => r.revenueAplicado).filter(Number.isFinite);
    const advpRawValues = rows.map((r) => r.advpRaw).filter(Number.isFinite);
    const aprovados = rows.filter((r) => r.statusBucket === 'aprovado').length;
    const reprovados = rows.filter((r) => r.statusBucket === 'reprovado').length;

    // --- Séries ordenadas para gráficos ---
    const parseAdvpSort = (value) => Number(value);
    const faixaOrder = ['0', '01 A 07', '08 A 15', '16 A 22', '23 A 30', '31 A 60', '60+'];

    const basePayload = {
        meta: { baseDir: effectiveDir, requestedBaseDir: preferredDir, selectedPeriod: { startDate: toISOStringDate(rangeStart), endDate: toISOStringDate(rangeEnd) }, filesRead: files.length, records: rows.length, warnings: parseWarnings },
        kpis: { totalRegistros: rows.length, aprovados, reprovados, taxaAprovacao: rows.length ? Number(((aprovados / rows.length) * 100).toFixed(2)) : 0, totalRevenueAplicado: Number(sum(totaisRevenue).toFixed(2)), mediaRevenueAplicado: Number(avg(totaisRevenue).toFixed(2)), advpMedio: Number(avg(advpRawValues).toFixed(2)) },
        series: {
            revenueAplicadoPorDia: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
            totalRevenueAplicado: [{ label: 'Aprovado', value: aprovados }, { label: 'Reprovado', value: reprovados }, { label: 'Outros', value: Math.max(0, rows.length - aprovados - reprovados) }].filter((item) => item.value > 0),
            advpStatus: Array.from(advpMap.values()).sort((a, b) => parseAdvpSort(a.advp) - parseAdvpSort(b.advp)),
            evolucaoTmXAdvp: Array.from(evolucaoMap.values()).map((item) => ({ advp: item.advp, minRevenue: Number.isFinite(item.minRevenue) ? Number(item.minRevenue.toFixed(2)) : 0, tmRevenue: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0, total: item.total, aprovado: item.aprovado, reprovado: item.reprovado })).sort((a, b) => parseAdvpSort(a.advp) - parseAdvpSort(b.advp)),
            revenuePorCanal: Array.from(canalMap.values()).sort((a, b) => b.total - a.total),
            faixaQtdPercentual: Array.from(faixaMap.values()).map((item) => ({ faixa: item.faixa, qtdAdvp: item.qtdAdvp, percentualTotal: rows.length ? Number(((item.qtdAdvp / rows.length) * 100).toFixed(2)) : 0, mediaRevenueAplicado: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0 })).sort((a, b) => faixaOrder.indexOf(a.faixa) - faixaOrder.indexOf(b.faixa)),
            aproveitamentoAplicacao: Array.from(statusMap.values()).sort((a, b) => b.total - a.total),
            justificativa: Array.from(justificativaMap.values()).sort((a, b) => b.total - a.total).slice(0, 15),
            analistaIndicador: Array.from(analistaMap.values()).sort((a, b) => b.total - a.total).slice(0, 12),
            rotasAplicadas: Array.from(rotaMap.values()).map((item) => ({ rota: item.rota, total: item.total, mediaRevenueAplicado: item.qtdRevenue ? Number((item.sumRevenue / item.qtdRevenue).toFixed(2)) : 0 })).sort((a, b) => b.total - a.total)
        }
    };

    if (!includeRows) return basePayload;

    // --- Exportação de linhas tratadas ---
    const treatedRows = rows.map((row) => {
        const advpTimeDiff = row.dataViagem instanceof Date ? (row.dataViagem.getTime() - row.dataAplicacao.getTime()) / 86400000 : null;
        const advpRoundByTime = Number.isFinite(advpTimeDiff) ? Math.round(advpTimeDiff) : null;
        const advpFloorByTime = Number.isFinite(advpTimeDiff) ? Math.floor(advpTimeDiff) : null;
        const advpCeilByTime = Number.isFinite(advpTimeDiff) ? Math.ceil(advpTimeDiff) : null;
        return {
            DataAplicacao: formatExportDate(row.dataAplicacao), DataViagem: formatExportDate(row.dataViagem),
            ADVP_Bruto: Number.isFinite(row.advpRaw) ? row.advpRaw : null, ADVP_UsadoMapaFaixa: Number.isFinite(row.advpStar) ? row.advpStar : null,
            FaixaMapa: row.faixaMapa, ADVP_DiasExatoComHora: Number.isFinite(advpTimeDiff) ? Number(advpTimeDiff.toFixed(5)) : null,
            ADVP_RoundPorHora: advpRoundByTime, ADVP_FloorPorHora: advpFloorByTime, ADVP_CeilPorHora: advpCeilByTime,
            Faixa_RoundPorHora: buildFaixaAdvp(advpRoundByTime), Faixa_FloorPorHora: buildFaixaAdvp(advpFloorByTime), Faixa_CeilPorHora: buildFaixaAdvp(advpCeilByTime),
            RevenueAplicado: Number.isFinite(row.revenueAplicado) ? Number(row.revenueAplicado.toFixed(2)) : null,
            StatusRevenue: row.statusRevenue, StatusBucket: row.statusBucket, Indicador: row.indicador, IndicadorBucket: row.indicadorBucket,
            CanalVenda: row.canalVenda, Justificativa: row.justificativa, Analista: row.analista,
            Origem: row.origem, Destino: row.destino, NumeroServico: row.numServico, RotaPadronizada: row.rota, DataAplicacaoISO: row.dataAplicacaoKey
        };
    });

    return { ...basePayload, treatedRows };
};

/** Wrapper para execução com fallback (substitui Worker) */
const runRevenueDashboardWorker = async (params) => buildRevenueDashboardPayload(params);

// ============================================================
// ROTAS Express
// ============================================================

const router = Router();

/** GET /revenue-dashboard — Retorna payload do dashboard de Revenue */
router.get('/revenue-dashboard', async (req, res) => {
    try {
        const bypassCache = ['1', 'true'].includes(String(req.query.noCache || '').toLowerCase());
        const compactMode = ['1', 'true'].includes(String(req.query.compact || '').toLowerCase());
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_REVENUE_BASE_DIR;
        const fallbackDir = path.join(path.resolve('.'), 'backups_sistema');

        const buildResponse = (payload) => compactMode ? { meta: payload?.meta || null, kpis: payload?.kpis || null } : payload;

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) effectiveDir = fallbackDir;
        if (!fs.existsSync(effectiveDir)) return res.status(400).json({ error: 'Diretorio de base Revenue nao encontrado.', details: { requestedDir: preferredDir } });

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const startParam = typeof req.query.startDate === 'string' ? req.query.startDate : null;
        const endParam = typeof req.query.endDate === 'string' ? req.query.endDate : null;
        const parsedStart = startParam ? parseBrDate(startParam) : defaultStart;
        const parsedEnd = endParam ? parseBrDate(endParam) : now;
        if (!parsedStart || !parsedEnd) return res.status(400).json({ error: 'Periodo invalido.' });

        const rangeStart = toStartOfDay(parsedStart);
        const rangeEnd = toEndOfDay(parsedEnd);
        if (rangeStart.getTime() > rangeEnd.getTime()) return res.status(400).json({ error: 'Data inicial maior que data final.' });

        const cacheKey = buildRevenueDashboardCacheKey(effectiveDir, rangeStart, rangeEnd);
        if (!bypassCache) {
            const cachedPayload = getRevenueDashboardCache(cacheKey);
            if (cachedPayload) return res.json(buildResponse(cachedPayload));
            const inFlight = revenueDashboardInFlight.get(cacheKey);
            if (inFlight) return res.json(buildResponse(await inFlight));
        }

        const computePromise = runRevenueDashboardWorker({ effectiveDir, preferredDir, rangeStart, rangeEnd })
            .catch(async (err) => { console.error('[REVENUE_DASH_WORKER_ERROR]', err); return buildRevenueDashboardPayload({ effectiveDir, preferredDir, rangeStart, rangeEnd }); });

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

/** GET /revenue-dashboard-export — Exporta dados tratados em Excel */
router.get('/revenue-dashboard-export', async (req, res) => {
    try {
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const preferredDir = requestedDir || DEFAULT_REVENUE_BASE_DIR;
        const fallbackDir = path.join(path.resolve('.'), 'backups_sistema');

        let effectiveDir = preferredDir;
        if (!fs.existsSync(effectiveDir) && !requestedDir && fs.existsSync(fallbackDir)) effectiveDir = fallbackDir;
        if (!fs.existsSync(effectiveDir)) return res.status(400).json({ error: 'Diretorio de base Revenue nao encontrado.' });

        const now = new Date();
        const defaultStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const parsedStart = (typeof req.query.startDate === 'string' ? parseBrDate(req.query.startDate) : null) || defaultStart;
        const parsedEnd = (typeof req.query.endDate === 'string' ? parseBrDate(req.query.endDate) : null) || now;
        if (!parsedStart || !parsedEnd) return res.status(400).json({ error: 'Periodo invalido.' });

        const rangeStart = toStartOfDay(parsedStart);
        const rangeEnd = toEndOfDay(parsedEnd);
        if (rangeStart.getTime() > rangeEnd.getTime()) return res.status(400).json({ error: 'Data inicial maior que data final.' });

        const payloadWithRows = await runRevenueDashboardWorker({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows: true })
            .catch(async (err) => { console.error('[REVENUE_EXPORT_ERROR]', err); return buildRevenueDashboardPayload({ effectiveDir, preferredDir, rangeStart, rangeEnd, includeRows: true }); });

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
                return { Cenario: scenarioName, Faixa: bucket, Qtd: qtd, Percentual: total > 0 ? Number(((qtd / total) * 100).toFixed(2)) : 0 };
            });
        };

        const diagnosticoRows = [
            ...buildFaixaScenarioRows('Atual (ADVP bruto)', (advp) => (Number.isFinite(advp) ? advp : null)),
            ...buildFaixaScenarioRows('Inclusivo (+1 se ADVP >= 0)', (advp) => (Number.isFinite(advp) ? (advp >= 0 ? advp + 1 : advp) : null)),
            ...buildFaixaScenarioRows('Absoluto (|ADVP|)', (advp) => (Number.isFinite(advp) ? Math.abs(advp) : null)),
            ...buildFaixaScenarioRows('Ceil por hora (coluna auditoria)', () => null).map((item) => {
                const matching = treatedRows.filter((row) => row?.Faixa_CeilPorHora === item.Faixa).length;
                return { Cenario: 'Ceil por hora (coluna auditoria)', Faixa: item.Faixa, Qtd: matching, Percentual: treatedRows.length > 0 ? Number(((matching / treatedRows.length) * 100).toFixed(2)) : 0 };
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
            ? payloadWithRows.series.faixaQtdPercentual.map((item) => ({ Faixa: item.faixa, Qtd: Number(item.qtdAdvp || 0), PercentualTotal: Number(item.percentualTotal || 0), MediaRevenueAplicado: Number(item.mediaRevenueAplicado || 0) }))
            : [];

        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(resumoRows), 'Resumo');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(faixaRows), 'Mapa Faixa');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(diagnosticoRows), 'Diagnostico Faixa');
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(treatedRows), 'Dados Tratados');

        const filename = `revenue_tratado_${toISOStringDate(rangeStart)}_${toISOStringDate(rangeEnd)}.xlsx`;
        const fileBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(fileBuffer);
    } catch (error) {
        console.error('[REVENUE_EXPORT_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao exportar dados tratados de Revenue.', details: String(error?.message || error) });
    }
});

export default router;
export { DEFAULT_REVENUE_BASE_DIR, buildFaixaAdvp };
