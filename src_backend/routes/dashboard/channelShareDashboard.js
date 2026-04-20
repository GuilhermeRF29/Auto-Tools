/**
 * @module dashboard/channelShareDashboard
 * @description Módulo do Dashboard de Share de Canais (Performance YoY).
 * 
 * Responsável por:
 *   - Leitura de planilhas de comparativo YoY por canal
 *   - Extração de tabelas de ranges fixos (financeiro, passageiros, ticket médio)
 *   - Detecção de valores negativos e formatação de células
 *   - Seleção automática de aba por mês
 *   - Cache com TTL
 */

import { Router } from 'express';
import {
    fs, path, XLSX,
    stripAccents, createCacheAccessors
} from './dashboardUtils.js';

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CHANNEL_SHARE_BASE_DIR = 'Z:\\Forecast\\Forecast2';
const CHANNEL_SHARE_FALLBACK_BASE_DIR = 'C:\\Users\\guilherme.felix\\Documents\\Relatorio Demanda\\DASH Forecast\\Forecast2';
const CHANNEL_SHARE_FILE_REGEX = /\.(xlsx|xls|xlsm)$/i;
const CHANNEL_SHARE_HINT_REGEX = /(performance\s*de\s*canais|comparativo|yoy)/i;
const CHANNEL_SHARE_CACHE_TTL_MS = 5 * 60 * 1000;

const CHANNEL_SHARE_MONTH_LABELS = { 1: 'Janeiro', 2: 'Fevereiro', 3: 'Marco', 4: 'Abril', 5: 'Maio', 6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 11: 'Novembro', 12: 'Dezembro' };
const CHANNEL_SHARE_MONTH_SHORT = { 1: 'JAN', 2: 'FEV', 3: 'MAR', 4: 'ABR', 5: 'MAI', 6: 'JUN', 7: 'JUL', 8: 'AGO', 9: 'SET', 10: 'OUT', 11: 'NOV', 12: 'DEZ' };
const CHANNEL_SHARE_MONTH_TOKENS = [
    { month: 1, tokens: ['JANEIRO', 'JAN'] }, { month: 2, tokens: ['FEVEREIRO', 'FEV'] },
    { month: 3, tokens: ['MARCO', 'MAR'] }, { month: 4, tokens: ['ABRIL', 'ABR'] },
    { month: 5, tokens: ['MAIO', 'MAI'] }, { month: 6, tokens: ['JUNHO', 'JUN'] },
    { month: 7, tokens: ['JULHO', 'JUL'] }, { month: 8, tokens: ['AGOSTO', 'AGO'] },
    { month: 9, tokens: ['SETEMBRO', 'SET'] }, { month: 10, tokens: ['OUTUBRO', 'OUT'] },
    { month: 11, tokens: ['NOVEMBRO', 'NOV'] }, { month: 12, tokens: ['DEZEMBRO', 'DEZ'] }
];

// ============================================================
// CACHE
// ============================================================

const channelShareDashboardCache = new Map();
const { get: getChannelShareDashboardCache, set: setChannelShareDashboardCache } =
    createCacheAccessors(channelShareDashboardCache, CHANNEL_SHARE_CACHE_TTL_MS);

const buildChannelShareDashboardCacheKey = (sourcePath, filesSignature, selectedFileName, selectedSheetName, selectedFilePath) =>
    [String(sourcePath || '').trim().toLowerCase(), String(filesSignature || ''), String(selectedFileName || '').trim().toLowerCase(), String(selectedSheetName || '').trim().toLowerCase(), String(selectedFilePath || '').trim().toLowerCase()].join('|');

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

const resolveChannelShareSourcePath = (requestedDir) => {
    const requested = String(requestedDir || '').trim();
    const preferred = requested || DEFAULT_CHANNEL_SHARE_BASE_DIR;
    if (requested) return { preferredPath: preferred, effectivePath: preferred };
    if (fs.existsSync(preferred)) return { preferredPath: preferred, effectivePath: preferred };
    if (fs.existsSync(CHANNEL_SHARE_FALLBACK_BASE_DIR)) return { preferredPath: preferred, effectivePath: CHANNEL_SHARE_FALLBACK_BASE_DIR };
    return { preferredPath: preferred, effectivePath: preferred };
};

const collectChannelShareFiles = (sourcePath) => {
    if (!fs.existsSync(sourcePath)) return [];
    const stats = fs.statSync(sourcePath);
    if (stats.isFile()) {
        if (!CHANNEL_SHARE_FILE_REGEX.test(path.extname(sourcePath).toLowerCase())) return [];
        return [{ filePath: sourcePath, fileName: path.basename(sourcePath), mtimeMs: stats.mtimeMs, mtime: stats.mtime }];
    }
    if (!stats.isDirectory()) return [];
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile() && !e.name.startsWith('~$') && CHANNEL_SHARE_FILE_REGEX.test(e.name))
        .map((e) => { const fp = path.join(sourcePath, e.name); const s = fs.statSync(fp); return { filePath: fp, fileName: e.name, mtimeMs: s.mtimeMs, mtime: s.mtime }; });
    const preferred = files.filter((item) => CHANNEL_SHARE_HINT_REGEX.test(item.fileName));
    return (preferred.length ? preferred : files).sort((a, b) => b.mtimeMs - a.mtimeMs);
};

const buildChannelShareFilesSignature = (files = []) => files.map((f) => `${f.filePath}|${Number(f.mtimeMs || 0)}`).join('||');

/** Extrai mês de uma aba pelo nome (ex: "Março" → { month: 3, ... }) */
const inferChannelShareMonthFromSheet = (sheetName) => {
    const original = String(sheetName || '').trim();
    if (!original) return null;
    const normalized = stripAccents(original).toUpperCase();
    for (const entry of CHANNEL_SHARE_MONTH_TOKENS) {
        const tokenRegex = new RegExp(`(?:^|[^A-Z0-9])(${entry.tokens.join('|')})(?:$|[^A-Z0-9])`, 'i');
        if (tokenRegex.test(normalized)) return { month: entry.month, monthLabel: CHANNEL_SHARE_MONTH_LABELS[entry.month] || original, monthShort: CHANNEL_SHARE_MONTH_SHORT[entry.month] || '', sheetName: original };
    }
    return null;
};

const buildChannelShareMonthSheets = (sheetNames = []) => {
    const mapped = sheetNames.map((s) => inferChannelShareMonthFromSheet(s)).filter(Boolean).sort((a, b) => b.month - a.month || a.sheetName.localeCompare(b.sheetName));
    const unique = new Map();
    for (const item of mapped) { if (!unique.has(item.month)) unique.set(item.month, item); }
    return Array.from(unique.values());
};

/** Infere label de mês a partir do nome do arquivo (ex: "202503" → "Marco/2025") */
const inferChannelShareMonthLabel = (fileName) => {
    const bare = path.basename(String(fileName || ''), path.extname(String(fileName || ''))).trim();
    if (!bare) return 'Planilha';
    const normalized = stripAccents(bare).toUpperCase();
    const yearMatch = normalized.match(/(20\d{2})/);
    const year = yearMatch ? yearMatch[1] : '';
    const yyyymmMatch = normalized.match(/(20\d{2})[^\d]?(0[1-9]|1[0-2])(?:[^\d]|$)/);
    if (yyyymmMatch) { const ml = CHANNEL_SHARE_MONTH_LABELS[Number(yyyymmMatch[2])] || bare; return year ? `${ml}/${year}` : ml; }
    const mmyyyyMatch = normalized.match(/(?:^|[^\d])(0[1-9]|1[0-2])[^\d](20\d{2})(?:[^\d]|$)/);
    if (mmyyyyMatch) { const ml = CHANNEL_SHARE_MONTH_LABELS[Number(mmyyyyMatch[1])] || bare; return `${ml}/${mmyyyyMatch[2]}`; }
    const byToken = CHANNEL_SHARE_MONTH_TOKENS.find((e) => e.tokens.some((t) => normalized.includes(t)));
    if (byToken) { const ml = CHANNEL_SHARE_MONTH_LABELS[byToken.month] || bare; return year ? `${ml}/${year}` : ml; }
    return bare;
};

/** Formata o valor de uma célula para exibição */
const formatChannelShareCellValue = (cell) => {
    if (!cell) return '';
    const formatted = cell.w !== null && cell.w !== undefined ? String(cell.w).trim() : '';
    if (formatted) return formatted;
    const raw = cell.v;
    if (raw === null || raw === undefined) return '';
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toLocaleDateString('pt-BR');
    return String(raw);
};

/** Detecta se um valor é negativo (numérico ou padrão contábil) */
const isChannelShareNegativeValue = (cell, displayValue) => {
    const raw = cell?.v;
    if (typeof raw === 'number' && Number.isFinite(raw) && raw < 0) return true;
    const text = String(displayValue || '').trim();
    if (!text) return false;
    if (/^\(.*\)$/.test(text) && /\d/.test(text)) return true;
    if (/^-\s*\d/.test(text) || /^-\s*R\$\s*\d/i.test(text)) return true;
    return false;
};

/** Extrai tabela de um range de células de uma aba Excel */
const extractChannelShareTable = (sheet, rangeAddress) => {
    const decoded = XLSX.utils.decode_range(rangeAddress);
    const rows = [];
    let nonEmptyCount = 0;
    for (let r = decoded.s.r; r <= decoded.e.r; r++) {
        const cells = [];
        for (let c = decoded.s.c; c <= decoded.e.c; c++) {
            const ref = XLSX.utils.encode_cell({ r, c });
            const cell = sheet[ref];
            const value = formatChannelShareCellValue(cell);
            const isNegative = isChannelShareNegativeValue(cell, value);
            if (value) nonEmptyCount++;
            cells.push({ value, isNegative, rawType: cell?.t || null });
        }
        rows.push({ rowNumber: r + 1, cells });
    }
    return { range: rangeAddress, rowCount: decoded.e.r - decoded.s.r + 1, colCount: decoded.e.c - decoded.s.c + 1, nonEmptyCount, rows };
};

const extractChannelShareUpdateInfo = (sheet) => {
    const left = formatChannelShareCellValue(sheet?.B2);
    const right = formatChannelShareCellValue(sheet?.C2);
    return { left, right, text: [left, right].filter(Boolean).join(' ').trim() || '-' };
};

// ============================================================
// CONSTRUÇÃO DO PAYLOAD
// ============================================================

const buildChannelShareDashboardPayload = ({ effectivePath, preferredPath, selectedFileName, selectedSheetName, selectedFilePath }) => {
    const files = collectChannelShareFiles(effectivePath);
    const emptyTables = { financeiro: extractChannelShareTable({}, 'B4:Q21'), passageiros: extractChannelShareTable({}, 'B43:G60'), ticketMedio: extractChannelShareTable({}, 'B24:G40') };

    if (!files.length) return { meta: { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: 0, records: 0, warnings: ['Nenhuma planilha Excel encontrada no caminho informado.'] }, files: [], selectedFilePath: '', sheets: [], monthSheets: [], selectedFileName: '', selectedSheetName: '', selectedMonthLabel: '', selectedMonthShort: '', selectedFileMtimeMs: 0, updateInfo: { left: '', right: '', text: '-' }, tables: emptyTables };

    const normalizedRequestedFilePath = String(selectedFilePath || '').trim().toLowerCase();
    const selectedFile = files.find((item) => String(item.filePath || '').trim().toLowerCase() === normalizedRequestedFilePath) || files.find((item) => item.fileName === selectedFileName) || files[0];

    const workbook = XLSX.readFile(selectedFile.filePath, { cellDates: true });
    const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    const monthSheets = buildChannelShareMonthSheets(sheetNames);
    const defaultSheetName = monthSheets[0]?.sheetName || sheetNames[0] || '';
    const activeSheetName = sheetNames.includes(selectedSheetName) ? selectedSheetName : defaultSheetName;
    const activeMonthSheet = monthSheets.find((item) => item.sheetName === activeSheetName) || null;
    const selectedMonthLabel = activeMonthSheet?.monthLabel || inferChannelShareMonthLabel(activeSheetName || selectedFile.fileName);
    const selectedMonthShort = activeMonthSheet?.monthShort || '';

    const filesMeta = files.map((item) => ({ fileName: item.fileName, monthLabel: inferChannelShareMonthLabel(item.fileName), mtimeMs: Number(item.mtimeMs || 0) }));
    const baseMeta = { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: files.length };

    if (!activeSheetName || !workbook.Sheets[activeSheetName]) {
        return { meta: { ...baseMeta, records: 0, warnings: [`Falha ao localizar uma aba valida na planilha ${selectedFile.fileName}.`] }, files: filesMeta, selectedFilePath: selectedFile.filePath, sheets: sheetNames, monthSheets, selectedFileName: selectedFile.fileName, selectedSheetName: activeSheetName, selectedMonthLabel, selectedMonthShort, selectedFileMtimeMs: Number(selectedFile.mtimeMs || 0), updateInfo: { left: '', right: '', text: '-' }, tables: emptyTables };
    }

    const activeSheet = workbook.Sheets[activeSheetName];
    const financeiro = extractChannelShareTable(activeSheet, 'B4:Q21');
    const passageiros = extractChannelShareTable(activeSheet, 'B43:G60');
    const ticketMedio = extractChannelShareTable(activeSheet, 'B24:G40');
    const updateInfo = extractChannelShareUpdateInfo(activeSheet);

    return {
        meta: { ...baseMeta, records: financeiro.nonEmptyCount + passageiros.nonEmptyCount + ticketMedio.nonEmptyCount, warnings: [] },
        files: filesMeta, selectedFilePath: selectedFile.filePath, sheets: sheetNames, monthSheets,
        selectedFileName: selectedFile.fileName, selectedSheetName: activeSheetName, selectedMonthLabel, selectedMonthShort,
        selectedFileMtimeMs: Number(selectedFile.mtimeMs || 0), updateInfo,
        tables: { financeiro, passageiros, ticketMedio }
    };
};

// ============================================================
// ROTAS Express
// ============================================================

const router = Router();

router.get('/channel-share-dashboard', async (req, res) => {
    try {
        const bypassCache = ['1', 'true'].includes(String(req.query.noCache || '').toLowerCase());
        const requestedDir = typeof req.query.baseDir === 'string' ? req.query.baseDir.trim() : '';
        const selectedFileName = typeof req.query.fileName === 'string' ? req.query.fileName.trim() : '';
        const selectedFilePath = typeof req.query.filePath === 'string' ? req.query.filePath.trim() : '';
        const selectedSheetName = typeof req.query.sheetName === 'string' ? req.query.sheetName.trim() : '';
        const resolvedRequestedDir = selectedFilePath ? path.dirname(selectedFilePath) : requestedDir;
        const { preferredPath, effectivePath } = resolveChannelShareSourcePath(resolvedRequestedDir);
        if (!fs.existsSync(effectivePath)) return res.status(400).json({ error: 'Diretorio/base do Share de Canais nao encontrado.', details: { requestedDir: preferredPath } });

        const files = collectChannelShareFiles(effectivePath);
        const filesSignature = buildChannelShareFilesSignature(files);
        const cacheKey = buildChannelShareDashboardCacheKey(effectivePath, filesSignature, selectedFileName, selectedSheetName, selectedFilePath);
        if (!bypassCache) { const cached = getChannelShareDashboardCache(cacheKey); if (cached) return res.json(cached); }

        const payload = buildChannelShareDashboardPayload({ effectivePath, preferredPath, selectedFileName, selectedSheetName, selectedFilePath });
        setChannelShareDashboardCache(cacheKey, payload);
        return res.json(payload);
    } catch (error) {
        console.error('[CHANNEL_SHARE_DASH_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao gerar dashboard Share de Canais.', details: String(error?.message || error) });
    }
});

export default router;
export { DEFAULT_CHANNEL_SHARE_BASE_DIR };
