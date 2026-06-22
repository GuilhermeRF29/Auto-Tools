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
import { runPythonCmd } from '../../utils/pythonProxy.js';
import { BACKUP_DIR, getRootDir } from '../../config.js';

// ============================================================
// CONSTANTES
// ============================================================

const DEFAULT_CHANNEL_SHARE_BASE_DIR = 'G:\\Drives compartilhados\\Cometa   Comercial\\COM_Comercial\\05 - RM\\Share Canais\\Performance de Canais - Atualização';
const CHANNEL_SHARE_FALLBACK_BASE_DIR = 'Z:\\Forecast\\Forecast2';
const CHANNEL_SHARE_FILE_REGEX = /\.(xlsx|xls|xlsm)$/i;
const CHANNEL_SHARE_HINT_REGEX = /(performance\s*de\s*canais|comparativo|yoy)/i;
const CHANNEL_SHARE_CACHE_TTL_MS = 5 * 60 * 1000;
const CHANNEL_SHARE_PRESENTATION_TEMPLATE = path.join(getRootDir(), 'automacoes', 'assets', 'Template_Participacao_Canais.pptx');

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
const findChannelShareMonths = (value = '') => {
    const normalized = stripAccents(String(value || '')).toUpperCase();
    const matches = [];

    for (const entry of CHANNEL_SHARE_MONTH_TOKENS) {
        const tokenRegex = new RegExp(`(?:^|[^A-Z0-9])(${entry.tokens.join('|')})(?=$|[^A-Z0-9])`, 'ig');
        let match;
        while ((match = tokenRegex.exec(normalized)) !== null) {
            matches.push({ month: entry.month, index: match.index });
        }
    }

    matches.sort((a, b) => a.index - b.index);
    return matches.filter((item, index) => index === 0 || item.month !== matches[index - 1].month);
};

const CHANNEL_SHARE_CELL_REF_REGEX = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i;
const CHANNEL_SHARE_CELL_REF_GLOBAL_REGEX = /\$?([A-Z]{1,3})\$?(\d{1,7})/gi;

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

const inferChannelShareMonthFromSheet = (sheetName) => {
    const original = String(sheetName || '').trim();
    if (!original) return null;
    const normalized = stripAccents(original).toUpperCase();

    let year = 0;
    const yearMatch = normalized.match(/(?:20)?(\d{2})X(?:20)?(\d{2})/);
    if (yearMatch) {
        year = Number(yearMatch[2]) + 2000;
    } else {
        const yearMatch2 = normalized.match(/(20\d{2})/);
        if (yearMatch2) year = Number(yearMatch2[1]);
    }

    const months = findChannelShareMonths(normalized);
    if (!months.length) return null;

    const month = months[0].month;
    const endMonth = months[months.length - 1].month;
    const startLabel = CHANNEL_SHARE_MONTH_LABELS[month] || original;
    const endLabel = CHANNEL_SHARE_MONTH_LABELS[endMonth] || startLabel;
    const startShort = CHANNEL_SHARE_MONTH_SHORT[month] || '';
    const endShort = CHANNEL_SHARE_MONTH_SHORT[endMonth] || startShort;
    const periodLabel = month === endMonth ? startLabel : `${startLabel} a ${endLabel}`;
    const periodShort = month === endMonth ? startShort : `${startShort} ${endShort}`;

    return {
        month,
        endMonth,
        year,
        monthLabel: year ? `${periodLabel}/${year}` : periodLabel,
        monthShort: year ? `${periodShort}/${String(year).slice(-2)}` : periodShort,
        sheetName: original,
    };
};
const buildChannelShareMonthSheets = (sheetNames = []) => {
    const mapped = sheetNames.map((s) => inferChannelShareMonthFromSheet(s)).filter(Boolean)
        .sort((a, b) => (b.year - a.year)
        || (b.endMonth - a.endMonth)
        || ((b.endMonth - b.month) - (a.endMonth - a.month))
        || (b.month - a.month)
        || a.sheetName.localeCompare(b.sheetName));
    const unique = new Map();
    for (const item of mapped) { if (!unique.has(item.sheetName)) unique.set(item.sheetName, item); }
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
const isChannelShareDateFormat = (formatCode = '') =>
    /(^|[^a-z])(d|dd|m|mm|mmm|mmmm|yy|yyyy)([^a-z]|$)/i.test(String(formatCode || ''));

const getChannelShareDisplayFractionDigits = (value = '') => {
    const text = String(value ?? '')
        .replace(/R\$/gi, '')
        .replace(/%/g, '')
        .replace(/[()]/g, '')
        .replace(/[+\-\u2212]/g, '')
        .replace(/\s+/g, '')
        .trim();

    const comma = text.lastIndexOf(',');
    const dot = text.lastIndexOf('.');
    const sep = comma >= 0 && dot >= 0 ? (comma > dot ? ',' : '.') : (comma >= 0 ? ',' : (dot >= 0 ? '.' : ''));
    if (!sep) return 0;

    const after = text.slice(text.lastIndexOf(sep) + 1).replace(/\D/g, '');
    const before = text.slice(0, text.lastIndexOf(sep)).replace(/\D/g, '');
    const hasMultipleSameSeparators = (text.match(new RegExp(`\\${sep}`, 'g')) || []).length > 1;

    if (!after) return 0;
    if (after.length === 3 && before.length <= 3 && !String(value).includes('%') && !hasMultipleSameSeparators) {
        return 0;
    }
    return Math.min(after.length, 6);
};

const normalizeChannelShareFormattedText = (value = '') => {
    const text = String(value ?? '').trim();
    if (!text || !/[0-9]/.test(text)) return text;
    const numericCandidate = text
        .replace(/R\$/gi, '')
        .replace(/[+\-\u2212()%.,\s]/g, '')
        .trim();
    if (/[A-Za-z\u00C0-\u017F]/.test(numericCandidate)) return text;
    const isAccountingNegative = /^\(.*\)$/.test(text);
    if (!/[.,%]/.test(text) && !isAccountingNegative) return text;

    const parsed = parseChannelShareDisplayNumber(text);
    if (!Number.isFinite(parsed)) return text;

    const isPercent = text.includes('%');
    const digits = getChannelShareDisplayFractionDigits(text);
    const valueToFormat = isPercent ? parsed * 100 : parsed;
    return `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(valueToFormat)}${isPercent ? '%' : ''}`;
};

const formatChannelShareCellValue = (cell) => {
    if (!cell) return '';
    const raw = cell.v;
    const formatted = cell.w !== null && cell.w !== undefined ? String(cell.w).trim() : '';
    if (typeof raw === 'number' && Number.isFinite(raw) && !isChannelShareDateFormat(cell.z)) {
        return formatChannelShareComputedNumber(raw, cell.z, formatted);
    }
    if (formatted) return normalizeChannelShareFormattedText(formatted);
    // XLSX with sheetStubs marks formula/blank-only cells with type "z".
    // Treat them as empty here and let formula backfill handle computed values.
    if (cell.t === 'z') return '';
    if (raw === null || raw === undefined) return '';
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw.toLocaleDateString('pt-BR');
    return normalizeChannelShareFormattedText(String(raw));
};

const channelShareColumnLettersToNumber = (letters) => {
    let total = 0;
    for (const ch of String(letters || '').toUpperCase()) {
        const code = ch.charCodeAt(0);
        if (code < 65 || code > 90) return 0;
        total = (total * 26) + (code - 64);
    }
    return total;
};

const channelShareColumnNumberToLetters = (value) => {
    let num = Number(value || 0);
    if (!Number.isInteger(num) || num <= 0) return '';
    let out = '';
    while (num > 0) {
        const rem = (num - 1) % 26;
        out = String.fromCharCode(65 + rem) + out;
        num = Math.floor((num - 1) / 26);
    }
    return out;
};

const parseChannelShareDisplayNumber = (value) => {
    const text = String(value ?? '').trim();
    if (!text || text === '-') return null;

    const isPercent = text.includes('%');
    const isAccountingNegative = /^\(.*\)$/.test(text);

    let normalized = text
        .replace(/R\$/gi, '')
        .replace(/%/g, '')
        .replace(/\s+/g, '');

    if (isAccountingNegative) normalized = normalized.slice(1, -1);

    const hasComma = normalized.includes(',');
    const hasDot = normalized.includes('.');
    if (hasComma && hasDot) {
        const lastComma = normalized.lastIndexOf(',');
        const lastDot = normalized.lastIndexOf('.');
        const decimalSeparator = lastComma > lastDot ? ',' : '.';
        const groupSeparator = decimalSeparator === ',' ? '.' : ',';
        normalized = normalized
            .replace(new RegExp(`\\${groupSeparator}`, 'g'), '')
            .replace(decimalSeparator, '.');
    } else if (hasComma) {
        normalized = normalized.replace(/,/g, '.');
    } else if (hasDot) {
        const parts = normalized.split('.');
        const looksLikeGroupedInteger = parts.length > 1
            && parts.slice(1).every((part) => /^\d{3}$/.test(part))
            && /^\d{1,3}$/.test(parts[0]);
        if (looksLikeGroupedInteger) normalized = parts.join('');
    }

    normalized = normalized.replace(/[^0-9+\-.]/g, '');
    if (!normalized || normalized === '-' || normalized === '+') return null;

    let parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return null;
    if (isAccountingNegative && parsed > 0) parsed *= -1;
    if (isPercent) parsed /= 100;
    return parsed;
};

const getChannelShareCellNumericValue = (cell) => {
    if (!cell) return null;
    if (typeof cell.__computedNumeric === 'number' && Number.isFinite(cell.__computedNumeric)) return cell.__computedNumeric;

    const hasFormula = typeof cell.formula === 'string' && cell.formula.trim() !== '';
    const display = String(cell.value || '').trim();

    if (typeof cell.rawValue === 'number' && Number.isFinite(cell.rawValue)) {
        // Fórmula sem valor cacheado vem como stub "z" com v=0.
        if (cell.rawType === 'z' && hasFormula) {
            const parsedDisplay = parseChannelShareDisplayNumber(display);
            return Number.isFinite(parsedDisplay) ? parsedDisplay : null;
        }
        return cell.rawValue;
    }

    return parseChannelShareDisplayNumber(display);
};

const getChannelShareFormatFractionDigits = (formatCode, fallback = 2) => {
    const firstSection = String(formatCode || '').split(';')[0] || '';
    if (!firstSection.trim()) return fallback;
    if (!/[0#]/.test(firstSection)) return fallback;
    const dot = firstSection.lastIndexOf('.');
    const comma = firstSection.lastIndexOf(',');
    const decimalSeparator = dot >= 0 && comma >= 0 ? (dot > comma ? '.' : ',') : (dot >= 0 ? '.' : (comma >= 0 ? ',' : ''));
    if (!decimalSeparator) return 0;
    const decimalPart = firstSection.slice(firstSection.lastIndexOf(decimalSeparator) + 1);
    if (!/[0#]/.test(decimalPart)) return 0;
    if (/^#+0$/.test(decimalPart) && decimalPart.length === 3) return 0;
    const digits = (decimalPart.match(/[0#]/g) || []).length;
    return Number.isInteger(digits) ? digits : fallback;
};

const formatChannelShareComputedNumber = (numericValue, formatCode = '', displayFallback = '') => {
    const safeValue = Number.isFinite(numericValue)
        ? (Math.abs(numericValue) < 1e-12 ? 0 : numericValue)
        : 0;
    const isPercent = String(formatCode || '').includes('%');
    const displayDigits = getChannelShareDisplayFractionDigits(displayFallback);
    const fractionDigits = displayFallback && displayDigits > 0
        ? displayDigits
        : getChannelShareFormatFractionDigits(formatCode, 2);
    const valueToFormat = isPercent ? (safeValue * 100) : safeValue;

    return `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(valueToFormat)}${isPercent ? '%' : ''}`;
};

const shouldFormatChannelShareAsInteger = (formatCode = '') => {
    const code = String(formatCode || '');
    if (!code.trim() || code.includes('%')) return false;
    const firstSection = code.split(';')[0] || '';
    if (!/[0#]/.test(firstSection)) return false;
    const dot = firstSection.lastIndexOf('.');
    const comma = firstSection.lastIndexOf(',');
    const decimalSeparator = dot >= 0 && comma >= 0 ? (dot > comma ? '.' : ',') : (dot >= 0 ? '.' : (comma >= 0 ? ',' : ''));
    if (!decimalSeparator) return true;
    const after = firstSection.slice(firstSection.lastIndexOf(decimalSeparator) + 1);
    return !/[0#]/.test(after);
};

const splitChannelShareFormulaArgs = (argsText = '') => {
    const parts = [];
    let current = '';
    let depth = 0;

    for (const ch of String(argsText || '')) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth = Math.max(0, depth - 1);

        if ((ch === ',' || ch === ';') && depth === 0) {
            if (current.trim()) parts.push(current.trim());
            current = '';
            continue;
        }

        current += ch;
    }

    if (current.trim()) parts.push(current.trim());
    return parts;
};

const expandChannelShareFormulaRange = (rangeText = '') => {
    const [startRaw, endRaw] = String(rangeText || '').trim().split(':');
    if (!startRaw || !endRaw) return [];

    const startMatch = startRaw.match(CHANNEL_SHARE_CELL_REF_REGEX);
    const endMatch = endRaw.match(CHANNEL_SHARE_CELL_REF_REGEX);
    if (!startMatch || !endMatch) return [];

    const startCol = channelShareColumnLettersToNumber(startMatch[1]);
    const endCol = channelShareColumnLettersToNumber(endMatch[1]);
    const startRow = Number(startMatch[2]);
    const endRow = Number(endMatch[2]);
    if (!startCol || !endCol || !startRow || !endRow) return [];

    const refs = [];
    const colMin = Math.min(startCol, endCol);
    const colMax = Math.max(startCol, endCol);
    const rowMin = Math.min(startRow, endRow);
    const rowMax = Math.max(startRow, endRow);

    for (let r = rowMin; r <= rowMax; r++) {
        for (let c = colMin; c <= colMax; c++) {
            refs.push(`${channelShareColumnNumberToLetters(c)}${r}`);
        }
    }
    return refs;
};

const evaluateChannelShareFormula = (formula, resolveCellRef) => {
    if (!formula) return null;

    let expression = String(formula || '').trim();
    if (!expression) return null;
    if (expression.startsWith('=')) expression = expression.slice(1);
    expression = expression.replace(/\$/g, '').toUpperCase();

    const ifErrorRegex = /(?:IFERROR|SEERRO)\s*\(([^,;()]+)[,;]([^()]*)\)/i;
    let ifErrorGuard = 0;
    while (ifErrorRegex.test(expression) && ifErrorGuard < 100) {
        expression = expression.replace(ifErrorRegex, (_full, successExpr) => `(${successExpr})`);
        ifErrorGuard += 1;
    }

    let hasMissingReference = false;
    const resolveNumber = (ref) => {
        const value = resolveCellRef(ref);
        if (!Number.isFinite(value)) {
            hasMissingReference = true;
            return 0;
        }
        return value;
    };

    const sumRegex = /(?:SUM|SOMA)\s*\(([^()]*)\)/i;
    let guard = 0;
    while (sumRegex.test(expression) && guard < 100) {
        expression = expression.replace(sumRegex, (_full, argsText) => {
            const args = splitChannelShareFormulaArgs(argsText);
            let total = 0;

            for (const argRaw of args) {
                const arg = String(argRaw || '').trim().toUpperCase();
                if (!arg) continue;

                if (arg.includes(':')) {
                    for (const ref of expandChannelShareFormulaRange(arg)) {
                        total += resolveNumber(ref);
                    }
                    continue;
                }

                if (CHANNEL_SHARE_CELL_REF_REGEX.test(arg)) {
                    total += resolveNumber(arg);
                    continue;
                }

                const n = Number(arg.replace(/,/g, '.'));
                total += Number.isFinite(n) ? n : 0;
            }

            return String(Number.isFinite(total) ? total : 0);
        });
        guard += 1;
    }

    expression = expression.replace(CHANNEL_SHARE_CELL_REF_GLOBAL_REGEX, (_full, letters, rowText) => {
        const ref = `${String(letters || '').toUpperCase()}${String(rowText || '').trim()}`;
        return String(resolveNumber(ref));
    });

    if (hasMissingReference) return null;
    expression = expression.replace(/,/g, '.');
    if (!/^[0-9+\-*/().\s]+$/.test(expression)) return null;

    try {
        const result = Function(`"use strict"; return (${expression});`)();
        if (!Number.isFinite(result)) return 0;
        return result;
    } catch {
        return null;
    }
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
            cells.push({
                value,
                isNegative,
                rawType: cell?.t || null,
                rawValue: cell?.v,
                formula: typeof cell?.f === 'string' ? String(cell.f).trim() : '',
                numberFormat: typeof cell?.z === 'string' ? String(cell.z) : '',
                ref,
            });
        }
        rows.push({ rowNumber: r + 1, cells });
    }
    return { range: rangeAddress, rowCount: decoded.e.r - decoded.s.r + 1, colCount: decoded.e.c - decoded.s.c + 1, nonEmptyCount, rows };
};

const buildChannelShareCellSnapshot = (ref, cell) => {
    const value = formatChannelShareCellValue(cell);
    return {
        value,
        isNegative: isChannelShareNegativeValue(cell, value),
        rawType: cell?.t || null,
        rawValue: cell?.v,
        formula: typeof cell?.f === 'string' ? String(cell.f).trim() : '',
        numberFormat: typeof cell?.z === 'string' ? String(cell.z) : '',
        ref,
    };
};

const isChannelShareHeaderYear = (value) => {
    const text = String(value || '').trim();
    if (!/^[\d.,]+$/.test(text)) return false;
    const n = parseChannelShareDisplayNumber(text);
    return Number.isInteger(Math.round(n || 0)) && Math.round(n) >= 1900 && Math.round(n) <= 2100;
};

const normalizeChannelShareHeaderText = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';
    if (isChannelShareHeaderYear(text)) return String(Math.round(parseChannelShareDisplayNumber(text)));
    return text;
};

const isChannelShareTitleRow = (row) => {
    const label = stripAccents(String(row?.cells?.[0]?.value || '')).trim().toUpperCase();
    return label === 'CANAL' || label === 'CANAIS';
};

const isChannelShareCurrencyColumn = (type, colIdx) => {
    if (type === 'financeiro') return [1, 2, 3, 8, 9].includes(colIdx);
    if (type === 'ticketMedio') return [1, 2, 5].includes(colIdx);
    return false;
};

const formatChannelShareCurrency = (value) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(value);

const applyChannelShareFormulaBackfill = (table, sheet = null) => {
    if (!table || !Array.isArray(table.rows)) return table;

    const cellsByRef = new Map();
    for (const row of table.rows) {
        if (!row || !Array.isArray(row.cells)) continue;
        for (const cell of row.cells) {
            const ref = String(cell?.ref || '').trim().toUpperCase();
            if (!ref) continue;
            cellsByRef.set(ref, cell);
        }
    }

    const resolveCellRef = (ref, stack = new Set()) => {
        const key = String(ref || '').trim().toUpperCase();
        if (!key) return null;

        let target = cellsByRef.get(key);
        if (!target && sheet?.[key]) {
            target = buildChannelShareCellSnapshot(key, sheet[key]);
            cellsByRef.set(key, target);
        }
        if (!target) return null;

        const hasFormula = typeof target.formula === 'string' && target.formula.trim() !== '';
        const display = String(target.value || '').trim();

        if (!hasFormula) {
            const n = getChannelShareCellNumericValue(target);
            const safe = Number.isFinite(n) ? n : 0;
            target.__computedNumeric = safe;
            target.isNegative = safe < 0;
            return safe;
        }

        const cachedNumeric = getChannelShareCellNumericValue(target);
        if (stack.has(key)) return null;

        stack.add(key);
        const evaluated = evaluateChannelShareFormula(target.formula, (innerRef) => resolveCellRef(innerRef, stack));
        stack.delete(key);

        const safe = Number.isFinite(evaluated)
            ? evaluated
            : (Number.isFinite(cachedNumeric) ? cachedNumeric : null);

        if (!Number.isFinite(safe)) return null;
        target.__computedNumeric = safe;
        target.isNegative = safe < 0;
        if (!display || (Number.isFinite(evaluated) && (!Number.isFinite(cachedNumeric) || Math.abs(evaluated - cachedNumeric) > 1e-9))) {
            target.value = formatChannelShareComputedNumber(safe, target.numberFormat);
        }
        return safe;
    };

    for (const cell of cellsByRef.values()) {
        if (!cell || !cell.formula) continue;
        resolveCellRef(cell.ref, new Set());
    }

    return table;
};

const extractChannelShareUpdateInfo = (sheet) => {
    // Verificar múltiplas posições para a informação de atualização
    const b1 = formatChannelShareCellValue(sheet?.B1);
    const b2 = formatChannelShareCellValue(sheet?.B2);
    const c1 = formatChannelShareCellValue(sheet?.C1);
    const c2 = formatChannelShareCellValue(sheet?.C2);
    const left = b2 || b1;
    const right = c2 || c1;
    return { left, right, text: [left, right].filter(Boolean).join(' ').trim() || '-' };
};

/** Calcula o range usado na aba (ref) para metadata */
const getSheetUsedRange = (sheet) => {
    if (!sheet || !sheet['!ref']) return null;
    return sheet['!ref'];
};

/** Identifica dinamicamente as linhas de início e fim das tabelas na aba */
const findChannelShareTablesRanges = (sheet) => {
    let finStart = null;
    let tmStart = null;
    let paxStart = null;

    for (let r = 1; r <= 150; r++) {
        const bRef = XLSX.utils.encode_cell({ r: r - 1, c: 1 }); // Coluna B
        const cRef = XLSX.utils.encode_cell({ r: r - 1, c: 2 }); // Coluna C
        const dRef = XLSX.utils.encode_cell({ r: r - 1, c: 3 }); // Coluna D

        const bVal = formatChannelShareCellValue(sheet[bRef]).toUpperCase();
        if (bVal === 'CANAIS') {
            const cVal = formatChannelShareCellValue(sheet[cRef]).toUpperCase();
            const dVal = formatChannelShareCellValue(sheet[dRef]).toUpperCase();
            const headerRowContent = `${cVal} ${dVal}`;

            if (headerRowContent.includes('TM') && tmStart === null) {
                tmStart = r;
            } else if (headerRowContent.includes('PAX') && paxStart === null) {
                paxStart = r;
            } else if (!headerRowContent.includes('TM') && !headerRowContent.includes('PAX') && finStart === null) {
                finStart = r;
            }
        }
    }

    // Valores padrão caso não encontre
    finStart = finStart || 4;
    tmStart = tmStart || 24;
    paxStart = paxStart || 43;

    // Calcula os finais baseados no início da próxima tabela
    let finEnd = (tmStart > finStart) ? tmStart - 2 : finStart + 18;
    let tmEnd = (paxStart > tmStart) ? paxStart - 2 : tmStart + 17;
    let paxEnd = paxStart + 18;

    return {
        financeiroRange: `B${finStart}:Q${finEnd}`,
        ticketMedioRange: `B${tmStart}:G${tmEnd}`,
        passageirosRange: `B${paxStart}:G${paxEnd}`
    };
};

/** Substitui valores vazios em colunas de fórmulas realizando o cálculo matemático manualmente. */
const applyMissingChannelShareFormulas = (table, type) => {
    if (!table || !Array.isArray(table.rows)) return table;

    const getNum = (cells, colIndex) => {
        if (!cells || !cells[colIndex]) return 0;
        const val = cells[colIndex].value;
        if (val === undefined || val === null || typeof val !== 'string') return 0;
        if (val.trim() === '-' || val.trim() === '') return 0;
        // Se já for uma porcentagem formatada por nós (ex: "26,58%"), o getNum retornaria 26.58, o que causaria erro de escala.
        // A nova lógica evita re-processar strings geradas por nós para cálculos subsequentes.
        const parsed = Number(val.replace(/\./g, '').replace(',', '.').replace(/[^0-9\.-]/g, ''));
        return Number.isFinite(parsed) ? parsed : 0;
    };

    const hasNum = (cells, colIndex) => Number.isFinite(getChannelShareCellNumericValue(cells?.[colIndex]));

    const fmtPct = (val) => {
        if (!Number.isFinite(val)) return '0,00%';
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val * 100) + '%';
    };

    const fmtNum = (val) => {
        if (!Number.isFinite(val)) return '0,00';
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    };

    const setVal = (cells, colIndex, value, isPct) => {
        if (!cells[colIndex]) cells[colIndex] = { value: '', isNegative: false, rawType: 'n' };
        const current = String(cells[colIndex].value || '').trim();
        if (current !== '' && current !== '-') return;
        
        cells[colIndex].isNegative = value < 0;
        cells[colIndex].value = isPct ? fmtPct(value) : fmtNum(value);
    };

    let sumC = 0, sumD = 0, sumE = 0;
    
    if (type === 'financeiro') {
        let firstTotalRow = null;
        for (const row of table.rows) {
            const label = String(row.cells[0]?.value || '').toUpperCase();
            if (label === 'TOTAL' && !firstTotalRow) { firstTotalRow = row; break; }
            if (label && label !== 'CANAIS' && label !== 'OFFLINE' && label !== 'ONLINE' && label !== 'TOTAL') {
                sumC += getNum(row.cells, 1); sumD += getNum(row.cells, 2); sumE += getNum(row.cells, 3);
            }
        }
        
        let totC = firstTotalRow ? getNum(firstTotalRow.cells, 1) : sumC;
        let totD = firstTotalRow ? getNum(firstTotalRow.cells, 2) : sumD;
        let totE = firstTotalRow ? getNum(firstTotalRow.cells, 3) : sumE;

        if (firstTotalRow) {
            if (!firstTotalRow.cells[1] || !firstTotalRow.cells[1].value || firstTotalRow.cells[1].value.trim() === '') setVal(firstTotalRow.cells, 1, sumC, false);
            if (!firstTotalRow.cells[2] || !firstTotalRow.cells[2].value || firstTotalRow.cells[2].value.trim() === '') setVal(firstTotalRow.cells, 2, sumD, false);
            if (!firstTotalRow.cells[3] || !firstTotalRow.cells[3].value || firstTotalRow.cells[3].value.trim() === '') setVal(firstTotalRow.cells, 3, sumE, false);
            if (!totC) totC = sumC; if (!totD) totD = sumD; if (!totE) totE = sumE;
        }

        for (const row of table.rows) {
            const label = String(row.cells[0]?.value || '').toUpperCase();
            if (!label || label === 'CANAIS') continue;

            const c = getNum(row.cells, 1); const d = getNum(row.cells, 2); const e = getNum(row.cells, 3);
            if (!hasNum(row.cells, 1) && !hasNum(row.cells, 2) && !hasNum(row.cells, 3)) continue;

            // Cálculos diretos para evitar re-parse de strings e erros de escala no p.p
            const pct26vsOrc = d ? (e / d) - 1 : 0;
            const pct25vs26 = c ? (e / c) - 1 : 0;
            const part25 = totC ? c / totC : 0;
            const part26Orc = totD ? d / totD : 0;
            const part26 = totE ? e / totE : 0;

            setVal(row.cells, 5, pct26vsOrc, true); // G
            setVal(row.cells, 6, pct25vs26, true);  // H
            setVal(row.cells, 8, e - d, false);     // J
            setVal(row.cells, 9, e - c, false);     // K
            
            setVal(row.cells, 11, part25, true);    // M
            setVal(row.cells, 12, part26Orc, true); // N
            setVal(row.cells, 13, part26, true);    // O

            setVal(row.cells, 14, part26 - part26Orc, true); // P
            setVal(row.cells, 15, part26 - part25, true);    // Q
        }
    } else {
        // TM e PAX
        let totalRow = null;
        for (const row of table.rows) {
            const label = String(row.cells[0]?.value || '').toUpperCase();
            if (label === 'TOTAL') { totalRow = row; break; }
            if (label && label !== 'CANAIS' && label !== 'OFFLINE' && label !== 'ONLINE') {
                sumC += getNum(row.cells, 1); sumD += getNum(row.cells, 2);
            }
        }

        // Se for PAX, a soma simples funciona. Se for TM, soma não faz muito sentido, mas preenchemos com soma se vazio apenas para ter um total provisório.
        // O ideal é a planilha Excel prover isso.
        if (totalRow) {
            if (!totalRow.cells[1] || !totalRow.cells[1].value || totalRow.cells[1].value.trim() === '') setVal(totalRow.cells, 1, sumC, false);
            if (!totalRow.cells[2] || !totalRow.cells[2].value || totalRow.cells[2].value.trim() === '') setVal(totalRow.cells, 2, sumD, false);
        }

        for (const row of table.rows) {
            const label = String(row.cells[0]?.value || '').toUpperCase();
            if (!label || label === 'CANAIS' || label === 'OFFLINE' || label === 'ONLINE') continue;

            const c = getNum(row.cells, 1); const d = getNum(row.cells, 2);
            if (!hasNum(row.cells, 1) && !hasNum(row.cells, 2)) continue;
            setVal(row.cells, 3, c ? (d / c) - 1 : 0, true); // E (3)
            setVal(row.cells, 5, d - c, false);              // G (5)
        }
    }

    return table;
};

// ============================================================
// CONSTRUÇÃO DO PAYLOAD
// ============================================================

const normalizeChannelShareTableDisplay = (table, type) => {
    if (!table || !Array.isArray(table.rows)) return table;
    table.nonEmptyCount = 0;

    for (const [rowIdx, row] of table.rows.entries()) {
        if (!row || !Array.isArray(row.cells)) continue;
        const isTitleRow = isChannelShareTitleRow(row);

        row.cells.forEach((cell, colIdx) => {
            if (!cell) return;
            const current = String(cell.value || '').trim();

            if (isTitleRow) {
                cell.value = normalizeChannelShareHeaderText(current);
                cell.isNegative = false;
            } else if (rowIdx > 0 && type === 'passageiros' && colIdx > 0 && current && !current.includes('%')) {
                const parsed = getChannelShareCellNumericValue(cell);
                if (Number.isFinite(parsed)) {
                    cell.value = new Intl.NumberFormat('pt-BR', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                    }).format(parsed);
                    cell.isNegative = parsed < 0;
                }
            } else if (current) {
                const parsed = parseChannelShareDisplayNumber(current);
                if (Number.isFinite(parsed)) {
                    cell.isNegative = parsed < 0;
                    if (rowIdx > 0 && isChannelShareCurrencyColumn(type, colIdx) && !current.includes('%')) {
                        cell.value = formatChannelShareCurrency(parsed);
                        if (Math.abs(parsed) < 1e-12) cell.isNegative = false;
                        if (String(cell.value || '').trim()) table.nonEmptyCount += 1;
                        return;
                    }
                    const isAccounting = /^\(.*\)$/.test(current);
                    const isIntegerNumber = !current.includes('%') && shouldFormatChannelShareAsInteger(cell.numberFormat);
                    if (isAccounting || isIntegerNumber) {
                        const digits = isIntegerNumber ? 0 : getChannelShareDisplayFractionDigits(current);
                        cell.value = `${new Intl.NumberFormat('pt-BR', {
                            minimumFractionDigits: digits,
                            maximumFractionDigits: digits,
                        }).format(parsed)}${current.includes('%') ? '%' : ''}`;
                    }
                }
            }

            if (String(cell.value || '').trim()) table.nonEmptyCount += 1;
        });
    }

    return table;
};

const getChannelShareReportMonth = (monthLabel = '') => {
    const raw = String(monthLabel || '').trim();
    const now = new Date();
    const months = findChannelShareMonths(raw);
    const month = months[0]?.month || now.getMonth() + 1;
    const endMonth = months[months.length - 1]?.month || month;
    let year = now.getFullYear();

    const yearMatch = raw.match(/\b(20\d{2})\b/);
    if (yearMatch) year = Number(yearMatch[1]);

    const startName = CHANNEL_SHARE_MONTH_LABELS[month] || CHANNEL_SHARE_MONTH_LABELS[now.getMonth() + 1];
    const endName = CHANNEL_SHARE_MONTH_LABELS[endMonth] || startName;

    return {
        month,
        endMonth,
        year,
        monthName: month === endMonth ? startName : `${startName} a ${endName}`,
    };
};
const buildChannelSharePresentationFileName = (monthLabel = '') => {
    const reportMonth = getChannelShareReportMonth(monthLabel);
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    const baseName = `Participação de canais ${reportMonth.monthName} ${reportMonth.year} (${day}.${month}.${year}).pptx`;
    return baseName.replace(/[<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
};

const buildChannelShareDashboardPayload = ({ effectivePath, preferredPath, selectedFileName, selectedSheetName, selectedFilePath }) => {
    const files = collectChannelShareFiles(effectivePath);
    const emptyTables = { financeiro: extractChannelShareTable({}, 'B4:Q21'), passageiros: extractChannelShareTable({}, 'B43:G60'), ticketMedio: extractChannelShareTable({}, 'B24:G40') };

    if (!files.length) return { meta: { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: 0, records: 0, warnings: ['Nenhuma planilha Excel encontrada no caminho informado.'] }, files: [], selectedFilePath: '', sheets: [], monthSheets: [], selectedFileName: '', selectedSheetName: '', selectedMonthLabel: '', selectedMonthShort: '', selectedFileMtimeMs: 0, updateInfo: { left: '', right: '', text: '-' }, tables: emptyTables };

    const normalizedRequestedFilePath = String(selectedFilePath || '').trim().toLowerCase();
    const selectedFile = files.find((item) => String(item.filePath || '').trim().toLowerCase() === normalizedRequestedFilePath) || files.find((item) => item.fileName === selectedFileName) || files[0];

    let workbook;
    try {
        workbook = XLSX.readFile(selectedFile.filePath, {
            cellDates: true,
            sheetStubs: true,
            cellNF: true,
        });
    } catch (readError) {
        console.error(`[CHANNEL_SHARE] Falha ao ler planilha ${selectedFile.filePath}:`, readError?.message || readError);
        return { meta: { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: files.length, records: 0, warnings: [`Erro ao abrir planilha: ${readError?.message || readError}`] }, files: files.map((item) => ({ fileName: item.fileName, monthLabel: inferChannelShareMonthLabel(item.fileName), mtimeMs: Number(item.mtimeMs || 0) })), selectedFilePath: selectedFile.filePath, sheets: [], monthSheets: [], selectedFileName: selectedFile.fileName, selectedSheetName: '', selectedMonthLabel: '', selectedMonthShort: '', selectedFileMtimeMs: Number(selectedFile.mtimeMs || 0), updateInfo: { left: '', right: '', text: '-' }, tables: emptyTables };
    }

    const sheetNames = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
    const monthSheets = buildChannelShareMonthSheets(sheetNames);
    const defaultSheetName = monthSheets[0]?.sheetName || sheetNames[0] || '';
    const activeSheetName = sheetNames.includes(selectedSheetName) ? selectedSheetName : defaultSheetName;
    const activeMonthSheet = monthSheets.find((item) => item.sheetName === activeSheetName) || null;
    const selectedMonthLabel = activeMonthSheet?.monthLabel || inferChannelShareMonthLabel(activeSheetName || selectedFile.fileName);
    const selectedMonthShort = activeMonthSheet?.monthShort || '';

    const filesMeta = files.map((item) => ({ fileName: item.fileName, filePath: item.filePath, monthLabel: inferChannelShareMonthLabel(item.fileName), mtimeMs: Number(item.mtimeMs || 0) }));
    const baseMeta = { baseDir: effectivePath, requestedBaseDir: preferredPath, filesRead: files.length };

    if (!activeSheetName || !workbook.Sheets[activeSheetName]) {
        return { meta: { ...baseMeta, records: 0, warnings: [`Falha ao localizar uma aba valida na planilha ${selectedFile.fileName}. Abas disponíveis: ${sheetNames.join(', ')}`] }, files: filesMeta, selectedFilePath: selectedFile.filePath, sheets: sheetNames, monthSheets, selectedFileName: selectedFile.fileName, selectedSheetName: activeSheetName, selectedMonthLabel, selectedMonthShort, selectedFileMtimeMs: Number(selectedFile.mtimeMs || 0), updateInfo: { left: '', right: '', text: '-' }, tables: emptyTables };
    }

    const activeSheet = workbook.Sheets[activeSheetName];
    const { financeiroRange, ticketMedioRange, passageirosRange } = findChannelShareTablesRanges(activeSheet);
    
    let financeiro = extractChannelShareTable(activeSheet, financeiroRange);
    let passageiros = extractChannelShareTable(activeSheet, passageirosRange);
    let ticketMedio = extractChannelShareTable(activeSheet, ticketMedioRange);

    financeiro = applyChannelShareFormulaBackfill(financeiro, activeSheet);
    passageiros = applyChannelShareFormulaBackfill(passageiros, activeSheet);
    ticketMedio = applyChannelShareFormulaBackfill(ticketMedio, activeSheet);
    
    financeiro = normalizeChannelShareTableDisplay(applyMissingChannelShareFormulas(financeiro, 'financeiro'), 'financeiro');
    passageiros = normalizeChannelShareTableDisplay(applyMissingChannelShareFormulas(passageiros, 'passageiros'), 'passageiros');
    ticketMedio = normalizeChannelShareTableDisplay(applyMissingChannelShareFormulas(ticketMedio, 'ticketMedio'), 'ticketMedio');

    const updateInfo = extractChannelShareUpdateInfo(activeSheet);

    // Metadata da aba ativa para debugging
    const sheetMeta = {
        usedRange: getSheetUsedRange(activeSheet) || 'desconhecido',
        allSheets: sheetNames,
    };

    return {
        meta: { ...baseMeta, records: financeiro.nonEmptyCount + passageiros.nonEmptyCount + ticketMedio.nonEmptyCount, warnings: [], sheetMeta },
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

const writeChannelShareDataUrl = (dataUrl, filePath) => {
    const raw = String(dataUrl || '');
    const match = raw.match(/^data:image\/png;base64,(.+)$/);
    if (!match) throw new Error('Imagem invalida para gerar apresentacao.');
    fs.writeFileSync(filePath, Buffer.from(match[1], 'base64'));
};

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

router.post('/channel-share-dashboard/presentation', async (req, res) => {
    const tempDir = path.join(BACKUP_DIR, `channel_share_ppt_${Date.now()}`);

    try {
        const { images = {}, updateInfo = '', monthLabel = '', monthShort = '' } = req.body || {};
        if (!fs.existsSync(CHANNEL_SHARE_PRESENTATION_TEMPLATE)) {
            return res.status(500).json({ error: 'Template de Participacao de Canais nao encontrado.' });
        }

        fs.mkdirSync(tempDir, { recursive: true });
        const imagePaths = {
            receita: path.join(tempDir, 'receita.png'),
            pax: path.join(tempDir, 'pax.png'),
            tm: path.join(tempDir, 'tm.png'),
        };

        writeChannelShareDataUrl(images.receita, imagePaths.receita);
        writeChannelShareDataUrl(images.pax, imagePaths.pax);
        writeChannelShareDataUrl(images.tm, imagePaths.tm);

        const outputFileName = buildChannelSharePresentationFileName(monthLabel || monthShort);
        const outputPath = path.join(BACKUP_DIR, outputFileName);

        const params = {
            template_path: CHANNEL_SHARE_PRESENTATION_TEMPLATE,
            output_path: outputPath,
            images: imagePaths,
            update_info: updateInfo,
            month_label: monthLabel || monthShort,
        };
        const encoded = Buffer.from(JSON.stringify(params)).toString('base64');
        const pyCmd = `import sys, runpy; sys.argv=['participacao_canais_ppt.py', sys.argv[1]]; runpy.run_path(r'${path.join(getRootDir(), 'automacoes', 'participacao_canais_ppt.py')}', run_name='__main__')`;
        const result = await runPythonCmd(pyCmd, [encoded]);

        return res.json({
            success: true,
            result,
            path: outputPath,
            fileName: path.basename(outputPath),
        });
    } catch (error) {
        console.error('[CHANNEL_SHARE_PRESENTATION_ERROR]', error);
        return res.status(500).json({ error: 'Erro ao gerar apresentacao Share de Canais.', details: String(error?.message || error) });
    } finally {
        try {
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
    }
});

export default router;
export { DEFAULT_CHANNEL_SHARE_BASE_DIR, inferChannelShareMonthFromSheet, buildChannelShareMonthSheets };
