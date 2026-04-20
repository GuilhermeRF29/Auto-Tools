/**
 * @module dashboard/rioShareDashboard
 * @description Módulo do Dashboard Rio x São Paulo (Market Share).
 * 
 * Responsável por:
 *   - Coleta de dados de empresas operando na rota Rio-SP
 *   - Normalização de locais, horários e empresas
 *   - Cálculos de share (pax, viagens, IPV) por empresa
 *   - Agregação por mês, semana, modalidade e grupo
 *   - Cache com TTL
 */

import { Router } from 'express';
import {
    fs, path, XLSX,
    parseBrDate, toStartOfDay, toNumber, toISOStringDate,
    normalizeText, stripAccents, getRowValue,
    readTabularRows, createCacheAccessors,
    RIO_SHARE_COLUMN_ALIASES
} from './dashboardUtils.js';

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_RIO_SHARE_BASE_DIR = 'Z:\\Dash RIO';
const RIO_SHARE_FALLBACK_BASE_DIR = 'C:\\Users\\guilherme.felix\\Documents\\Relatórios RIO x SP';
const RIO_SHARE_FILE_REGEX = /\.(xlsx|xls|xlsm|csv|db|sqlite|sqlite3|duckdb|parquet)$/i;
const RIO_SHARE_HINT_REGEX = /(rio\s*x\s*sao|base\s*rio|share\s*-?\s*mercado\s*rio|base\s*relatorio)/i;
const RIO_SHARE_CACHE_TTL_MS = 5 * 60 * 1000;

/** Regras de mapeamento empresa → grupo/modalidade */
const RIO_SHARE_COMPANY_RULES = {
    '1001': { grupo: 'JCA', modalidade: 'RODOVIARIO' },
    'AGUIA BRANCA': { grupo: 'AGUIA BRANCA', modalidade: 'RODOVIARIO' },
    'EXPRESSO DO SUL': { grupo: 'JCA', modalidade: 'RODOVIARIO' },
    CATARINENSE: { grupo: 'JCA', modalidade: 'RODOVIARIO' },
    PENHA: { grupo: 'COMPORTE', modalidade: 'RODOVIARIO' },
    'AGUIA FLEX': { grupo: 'AGUIA BRANCA', modalidade: 'DIGITAL' },
    KAISSARA: { grupo: 'SUZANTUR', modalidade: 'RODOVIARIO' },
    WEMOBI: { grupo: 'JCA', modalidade: 'DIGITAL' },
    ADAMANTINA: { grupo: 'ADAMANTINA', modalidade: 'RODOVIARIO' },
    FLIXBUS: { grupo: 'FLIXBUS', modalidade: 'DIGITAL' },
    'RIO DOCE': { grupo: 'RIO DOCE', modalidade: 'RODOVIARIO' },
    NOTAVEL: { grupo: 'NOTAVEL', modalidade: 'RODOVIARIO' }
};

const RIO_SHARE_MONTH_LABELS = { 1: '01-JANEIRO', 2: '02-FEVEREIRO', 3: '03-MARCO', 4: '04-ABRIL', 5: '05-MAIO', 6: '06-JUNHO', 7: '07-JULHO', 8: '08-AGOSTO', 9: '09-SETEMBRO', 10: '10-OUTUBRO', 11: '11-NOVEMBRO', 12: '12-DEZEMBRO' };

// ============================================================
// CACHE
// ============================================================

const rioShareDashboardCache = new Map();
const { get: getRioShareDashboardCache, set: setRioShareDashboardCache } =
    createCacheAccessors(rioShareDashboardCache, RIO_SHARE_CACHE_TTL_MS);
const buildRioShareDashboardCacheKey = (sourcePath) => String(sourcePath || '').trim().toLowerCase();

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/** Normaliza nome de empresa (token upper, sem acentos) */
const normalizeDemandToken = (value) => stripAccents(String(value || '')).toUpperCase().replace(/\([^)]*\)/g, ' ').replace(/\s+-\s+[A-Z]{2}\b/g, ' ').replace(/\s+/g, ' ').trim();

const normalizeRioCategory = (value, fallback) => { const n = stripAccents(String(value || '')).toUpperCase().replace(/\s+/g, ' ').trim(); return n || fallback; };

/** Normaliza nomes de localidades (SP, RJ) para formato canônico */
const normalizeRioLocation = (value, fallback) => {
    const n = stripAccents(String(value || '')).toUpperCase().replace(/\s+/g, ' ').trim();
    if (!n) return fallback;
    if (n.includes('BARRA FUNDA')) return 'SAO PAULO (BARRA FUNDA)';
    if (n === 'SP' || n.includes('SAO PAULO') || n.includes('SÃO PAULO')) return 'SAO PAULO';
    if (n === 'RJ' || n === 'RIO' || n.includes('RIO DE JANEIRO') || n.includes('RIO JANEIRO') || n.includes('RIO DE JANERIO')) return 'RIO DE JANEIRO';
    return n;
};

/** Normaliza horários para formato HH:MM:SS */
const normalizeRioTime = (value, fallback = 'SEM HORARIO') => {
    if (value === null || value === undefined) return fallback;
    const toHms = (h, m, s = 0) => `${String(Math.min(23, Math.max(0, Number(h || 0)))).padStart(2, '0')}:${String(Math.min(59, Math.max(0, Number(m || 0)))).padStart(2, '0')}:${String(Math.min(59, Math.max(0, Number(s || 0)))).padStart(2, '0')}`;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return toHms(value.getHours(), value.getMinutes(), value.getSeconds());
    if (typeof value === 'number' && Number.isFinite(value)) { const frac = value % 1; const total = Math.round((frac < 0 ? 0 : frac) * 24 * 60 * 60); return toHms(Math.floor(total / 3600) % 24, Math.floor((total % 3600) / 60), total % 60); }
    const raw = String(value).trim();
    if (!raw) return fallback;
    const match = raw.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) return toHms(match[1], match[2], match[3] || '0');
    return raw;
};

/** Calcula semana ISO do ano */
const inferIsoWeek = (date) => {
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = utcDate.getUTCDay() || 7;
    utcDate.setUTCDate(utcDate.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1));
    return Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7);
};

const resolveRioShareSourcePath = (requestedDir) => {
    const requested = String(requestedDir || '').trim();
    const preferred = requested || DEFAULT_RIO_SHARE_BASE_DIR;
    if (requested) return { preferredPath: preferred, effectivePath: preferred };
    if (fs.existsSync(preferred)) return { preferredPath: preferred, effectivePath: preferred };
    if (fs.existsSync(RIO_SHARE_FALLBACK_BASE_DIR)) return { preferredPath: preferred, effectivePath: RIO_SHARE_FALLBACK_BASE_DIR };
    return { preferredPath: preferred, effectivePath: preferred };
};

const collectRioShareFiles = (sourcePath) => {
    if (!fs.existsSync(sourcePath)) return [];
    const stats = fs.statSync(sourcePath);
    if (stats.isFile()) {
        if (!RIO_SHARE_FILE_REGEX.test(path.extname(sourcePath).toLowerCase())) return [];
        return [{ filePath: sourcePath, fileName: path.basename(sourcePath), mtimeMs: stats.mtimeMs, mtime: stats.mtime }];
    }
    if (!stats.isDirectory()) return [];
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
    const tabularFiles = entries
        .filter((e) => e.isFile() && !e.name.startsWith('~$') && RIO_SHARE_FILE_REGEX.test(e.name))
        .map((e) => { const fp = path.join(sourcePath, e.name); const fs2 = fs.statSync(fp); return { filePath: fp, fileName: e.name, mtimeMs: fs2.mtimeMs, mtime: fs2.mtime }; });
    const preferred = tabularFiles.filter((item) => RIO_SHARE_HINT_REGEX.test(item.fileName));
    return (preferred.length ? preferred : tabularFiles).sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const pickRioShareSheet = (workbook) => {
    const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    if (!names.length) return null;
    return names.find((n) => /base\s*relatorio\s*rio\s*x\s*sao/i.test(n))
        || names.find((n) => /(rio\s*x\s*sao|base\s*rio|share)/i.test(n)) || names[0];
};

// ============================================================
// CONSTRUÇÃO DO DATASET
// ============================================================

const buildRioShareDataset = async (sourcePath) => {
    const files = collectRioShareFiles(sourcePath);
    const warnings = [], rows = [];
    const stats = { totalRead: 0, processed: 0, skippedDate: 0, skippedEmpresa: 0, skippedPax: 0 };

    for (const file of files) {
        try {
            const rawRows = await readTabularRows(file.filePath, { sheetResolver: pickRioShareSheet, columnAliases: RIO_SHARE_COLUMN_ALIASES });
            for (const row of rawRows) {
                stats.totalRead += 1;
                const dateRaw = getRowValue(row, ['DATA', 'Data', 'DATA SP', 'DATA_VIAGEM']);
                const parsedDate = parseBrDate(dateRaw);
                if (!parsedDate) { stats.skippedDate++; continue; }
                const travelDate = toStartOfDay(parsedDate);
                const empresa = normalizeDemandToken(getRowValue(row, ['EMPRESA', 'Empresa', 'CIA', 'OPERADOR']) || '');
                if (!empresa) { stats.skippedEmpresa++; continue; }
                const paxValue = toNumber(getRowValue(row, ['PAX', 'PASSAGEIRO', 'PASSAGEIROS', 'QTD PAX', 'QTD_PAX']));
                if (!Number.isFinite(paxValue) || paxValue <= 0) { stats.skippedPax++; continue; }

                const viagensRaw = toNumber(getRowValue(row, ['VIAGENS', 'VIAGEM', 'QTD VIAGENS', 'QTD_VIAGENS', 'TOTAL VIAGENS', 'SERVIÇO', 'SERVICO', 'SERVICO TOTAL']));
                let viagens = 0;
                if (Number.isFinite(viagensRaw) && viagensRaw > 0) viagens = viagensRaw <= 100 ? viagensRaw : 1;

                const origem = normalizeRioLocation(getRowValue(row, ['ORIGEM', 'Origem']), 'SEM ORIGEM');
                const destino = normalizeRioLocation(getRowValue(row, ['DESTINO', 'Destino']), 'SEM DESTINO');
                const monthNumberRaw = toNumber(getRowValue(row, ['Nº Mês', 'N MES', 'MES NUMERO', 'MES_N']));
                const monthNumber = Number.isFinite(monthNumberRaw) && monthNumberRaw >= 1 && monthNumberRaw <= 12 ? Math.round(monthNumberRaw) : (travelDate.getMonth() + 1);
                const monthLabelRaw = getRowValue(row, ['MÊS', 'MES', 'Mês', 'NOME MES']);
                const monthLabel = String(monthLabelRaw || RIO_SHARE_MONTH_LABELS[monthNumber] || '').trim() || RIO_SHARE_MONTH_LABELS[monthNumber];
                const weekRaw = toNumber(getRowValue(row, ['SEMANA', 'Semana', 'SEMANA ANO']));
                const week = Number.isFinite(weekRaw) && weekRaw > 0 ? Math.round(weekRaw) : inferIsoWeek(travelDate);
                const yearRaw = toNumber(getRowValue(row, ['Ano', 'ANO', 'YEAR']));
                const year = Number.isFinite(yearRaw) && yearRaw > 0 ? Math.round(yearRaw) : travelDate.getFullYear();

                const grupoRaw = getRowValue(row, ['GRUPO', 'Grupo']);
                const modalidadeRaw = getRowValue(row, ['MODALIDADE', 'Modalidade', 'CANAL']);
                const horarioRaw = getRowValue(row, ['HORARIO', 'HORÁRIO', 'HORA', 'HORA PARTIDA', 'PARTIDA']);
                const horario = normalizeRioTime(horarioRaw, 'SEM HORARIO');
                const mappedRule = RIO_SHARE_COMPANY_RULES[empresa] || null;
                const grupo = normalizeRioCategory(grupoRaw || mappedRule?.grupo, 'OUTROS');
                const modalidade = normalizeRioCategory(modalidadeRaw || mappedRule?.modalidade, 'OUTROS');

                rows.push({ date: toISOStringDate(travelDate), dia: travelDate.getDate(), semana: week, mes: monthLabel, mesNumero: monthNumber, ano: year, empresa, origem, destino, horario, grupo, modalidade, pax: Number(paxValue.toFixed(4)), viagens: Number(viagens.toFixed(4)) });
                stats.processed++;
            }
        } catch (error) { warnings.push(`Falha ao ler ${file.fileName}: ${error.message || error}`); }
    }
    return { basePath: sourcePath, filesRead: files.length, warnings, records: rows.length, stats, rows };
};

// ============================================================
// ROTAS Express
// ============================================================

const router = Router();

router.get('/rio-share-dashboard', async (req, res) => {
    try {
        const bypassCache = ['1', 'true'].includes(String(req.query.noCache || '').toLowerCase());
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const { preferredPath, effectivePath } = resolveRioShareSourcePath(requestedDir);
        if (!fs.existsSync(effectivePath)) return res.status(400).json({ error: 'Diretorio/base da dashboard Rio x SP nao encontrado.', details: { requestedDir: preferredPath } });

        const cacheKey = buildRioShareDashboardCacheKey(effectivePath);
        const dataset = (!bypassCache ? getRioShareDashboardCache(cacheKey) : null) || await buildRioShareDataset(effectivePath);
        if (!getRioShareDashboardCache(cacheKey)) setRioShareDashboardCache(cacheKey, dataset);

        const rows = Array.isArray(dataset.rows) ? dataset.rows : [];
        const companyAggMap = new Map(), originsSet = new Set(), destinationsSet = new Set();
        const modalitySet = new Set(), groupSet = new Set(), hourSet = new Set(), monthMap = new Map(), weekSet = new Set(), yearSet = new Set();

        for (const row of rows) {
            originsSet.add(row.origem); destinationsSet.add(row.destino); modalitySet.add(row.modalidade);
            groupSet.add(row.grupo); hourSet.add(row.horario); weekSet.add(Number(row.semana || 0)); yearSet.add(Number(row.ano || 0));
            if (row.mes) monthMap.set(row.mes, { label: row.mes, number: Number(row.mesNumero || 0) });
            const current = companyAggMap.get(row.empresa) || { empresa: row.empresa, pax: 0, viagens: 0 };
            current.pax += Number(row.pax || 0); current.viagens += Number(row.viagens || 0);
            companyAggMap.set(row.empresa, current);
        }

        const companyStats = Array.from(companyAggMap.values())
            .map((item) => ({ empresa: item.empresa, pax: Number(item.pax.toFixed(4)), viagens: Number(item.viagens.toFixed(4)), ipv: item.viagens > 0 ? Number((item.pax / item.viagens).toFixed(4)) : 0 }))
            .sort((a, b) => b.pax - a.pax || a.empresa.localeCompare(b.empresa));

        return res.json({
            meta: { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: Number(dataset.filesRead || 0), records: Number(dataset.records || 0), warnings: Array.isArray(dataset.warnings) ? dataset.warnings : [], stats: dataset.stats || null },
            rows, companyStats,
            filters: {
                companies: companyStats.map((item) => item.empresa),
                origins: Array.from(originsSet).sort(), destinations: Array.from(destinationsSet).sort(),
                modalities: Array.from(modalitySet).sort(), groups: Array.from(groupSet).sort(),
                horarios: Array.from(hourSet).sort(), months: Array.from(monthMap.values()).sort((a, b) => a.number - b.number),
                weeks: Array.from(weekSet).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b),
                years: Array.from(yearSet).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => b - a)
            },
            defaultSelection: { companies: companyStats.map((i) => i.empresa), dayStart: 1, dayEnd: 31, modalities: Array.from(modalitySet).sort() }
        });
    } catch (error) {
        console.error('[RIO_SHARE_DASH_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao gerar dashboard Rio x SP.', details: String(error?.message || error) });
    }
});

export default router;
export { DEFAULT_RIO_SHARE_BASE_DIR };
