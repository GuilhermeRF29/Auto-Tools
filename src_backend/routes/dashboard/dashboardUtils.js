/**
 * @module dashboard/dashboardUtils
 * @description Funções utilitárias compartilhadas entre todos os módulos de dashboard.
 * 
 * Inclui:
 *   - Parsing de datas (BR, ISO, Excel serial)
 *   - Conversão numérica com suporte a formatos BR (vírgula/ponto)
 *   - Normalização de textos e acentos
 *   - Leitura de dados tabulares (Excel, CSV, SQLite, DuckDB, Parquet)
 *   - Mapeamento "De Para" de linhas para mercados
 *   - Utilitários de cache com TTL (Time To Live)
 *   - Constantes compartilhadas (extensões, regex, aliases de colunas)
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import XLSX from 'xlsx';
import initSqlJs from 'sql.js';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { runPythonCmd } from '../../utils/pythonProxy.js';

// ============================================================
// RESOLUÇÃO DE CAMINHOS (ESM __dirname polyfill)
// ============================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Referência ao diretório raiz do projeto (dois níveis acima de /routes/dashboard/) */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

// ============================================================
// CONSTANTES DE EXTENSÕES E FORMATOS DE ARQUIVO
// ============================================================
export const EXCEL_LIKE_EXTENSIONS = new Set(['.xlsx', '.xls', '.xlsm', '.csv']);
export const SQLITE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3']);
export const DUCKDB_EXTENSIONS = new Set(['.duckdb']);
export const PARQUET_EXTENSIONS = new Set(['.parquet']);

/** Limite máximo de linhas ao ler DuckDB (configurável via env) */
const DUCKDB_MAX_ROWS_DEFAULT = 1500000;
const DUCKDB_MAX_ROWS_ENV = Number(process.env.DASH_DUCKDB_MAX_ROWS || DUCKDB_MAX_ROWS_DEFAULT);
export const DUCKDB_MAX_ROWS = Number.isFinite(DUCKDB_MAX_ROWS_ENV)
    ? Math.max(0, Math.trunc(DUCKDB_MAX_ROWS_ENV))
    : DUCKDB_MAX_ROWS_DEFAULT;

/** Tamanho do batch de leitura do DuckDB */
export const DUCKDB_FETCH_BATCH = Number.isFinite(Number(process.env.DASH_DUCKDB_FETCH_BATCH))
    ? Math.max(500, Math.trunc(Number(process.env.DASH_DUCKDB_FETCH_BATCH)))
    : 5000;

// ============================================================
// ALIASES DE COLUNAS — usados como chave para busca flexível
// ============================================================
export const DEPARA_COLUMN_ALIASES = [
    'Cod Linha', 'COD LINHA', 'Cod_Linha', 'Linha', 'LINHA', 'SERVICO', 'Serviço', 'Cod. Linha', 'COD. LINHA',
    'Mercado', 'MERCADO', 'NOME MERCADO', 'DESC MERCADO',
    'Empresa', 'EMPRESA', 'NOME EMPRESA'
];

export const REVENUE_COLUMN_ALIASES = [
    'Data Aplicação', 'Data Aplicacao', 'DATA APLICACAO',
    'Data Viagem', 'Data viagem', 'DATA VIAGEM',
    'Revenue Aplicado', 'REVENUE APLICADO',
    'Status Revenue', 'STATUS REVENUE',
    'Indicador', 'INDICADOR',
    'Canal Venda', 'CANAL VENDA',
    'Justificativa', 'JUSTIFICATIVA',
    'Analista', 'ANALISTA',
    'Origem', 'ORIGEM',
    'Destino', 'DESTINO',
    'Num. Serviço', 'Num. Servico', 'Numero Servico', 'NUM SERVICO',
    'Concatenar Origem e Destino', 'Rota', 'ROTA'
];

export const RIO_SHARE_COLUMN_ALIASES = [
    'DATA', 'Data', 'DATA SP', 'DATA_VIAGEM',
    'EMPRESA', 'Empresa', 'CIA', 'OPERADOR',
    'PAX', 'PASSAGEIRO', 'PASSAGEIROS', 'QTD PAX', 'QTD_PAX',
    'VIAGENS', 'VIAGEM', 'QTD VIAGENS', 'QTD_VIAGENS', 'TOTAL VIAGENS', 'SERVIÇO', 'SERVICO', 'SERVICO TOTAL',
    'ORIGEM', 'Origem', 'DESTINO', 'Destino',
    'Nº Mês', 'N MES', 'MES NUMERO', 'MES_N',
    'MÊS', 'MES', 'Mês', 'NOME MES',
    'SEMANA', 'Semana', 'SEMANA ANO',
    'Ano', 'ANO', 'YEAR',
    'GRUPO', 'Grupo',
    'MODALIDADE', 'Modalidade', 'CANAL',
    'HORARIO', 'HORÁRIO', 'HORA', 'HORA PARTIDA', 'PARTIDA'
];

export const DEMAND_COLUMN_ALIASES = [
    'Data Observação', 'Data Observacao', 'DATA OBSERVACAO', 'Data Observacao Arquivo',
    'Data Referencia', 'Data Referência', 'DATA REFERENCIA',
    'Data Base', 'DATA BASE', 'Snapshot Date', 'Data_Observacao',
    'Data Viagem', 'DATA VIAGEM', 'DATA', 'Data',
    'LINHA', 'Linha', 'Cod Linha', 'Cod_Linha', 'SERVIÇO', 'SERVICO', 'Num. Serviço', 'Num. Servico',
    'EMPRESA', 'Empresa',
    'PAX', 'Passageiro', 'PASSAGEIROS', 'Ocupação', 'OCUPAÇÃO', 'Ocupacao', 'Pax Total', 'TRANSITADO', 'Pax_Total', 'Ocup',
    'Capacidade', 'CAPACIDADE', 'Oferta', 'OFERTA', 'Vagas', 'VAGAS', 'Cap', 'Cap_Total',
    '%Ocupação', '% Ocupação', 'APV', 'IPV', 'IPV 3', 'IPV3', '% APV', 'Aproveitamento', 'APROVEITAMENTO'
];

export const DEMAND_OBSERVATION_ALIASES = [
    'Data Observação', 'Data Observacao', 'DATA OBSERVACAO', 'Data Observacao Arquivo',
    'Data Referencia', 'Data Referência', 'DATA REFERENCIA',
    'Data Base', 'DATA BASE', 'Snapshot Date', 'Data_Observacao'
];

// ============================================================
// FUNÇÕES DE DATA E HORA
// ============================================================

/** Retorna um Date com horário zerado (00:00:00.000) */
export const toStartOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);

/** Retorna um Date com horário no fim do dia (23:59:59.999) */
export const toEndOfDay = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/**
 * Constrói uma Date validando se o dia/mês são coerentes.
 * Retorna null para datas inválidas (ex: 31/02/2025).
 */
export const buildSafeDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
    const dt = new Date(year, month - 1, day, hour, minute, second);
    if (Number.isNaN(dt.getTime())) return null;
    if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
    return dt;
};

/**
 * Faz parse de uma data em formato brasileiro (DD/MM/YYYY), ISO (YYYY-MM-DD),
 * serial Excel, ou objeto Date. Suporta múltiplos formatos com fallback.
 * @param {any} value - Valor a converter em Date.
 * @returns {Date|null}
 */
export const parseBrDate = (value) => {
    if (value === null || value === undefined || value === '') return null;

    // Object Date nativo
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        const utcDate = buildSafeDate(
            value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate(),
            value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(),
        );
        return utcDate || new Date(value.getTime());
    }

    // Serial numérico Excel (ex: 45392)
    if (typeof value === 'number' && Number.isFinite(value)) {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed && parsed.y && parsed.m && parsed.d) {
            return new Date(parsed.y, parsed.m - 1, parsed.d, parsed.H || 0, parsed.M || 0, Math.round(parsed.S || 0));
        }
    }

    const raw = String(value).trim();
    if (!raw) return null;

    // String que parece serial Excel (ex: "45392.5")
    const excelSerialMatch = raw.match(/^\d+(?:\.\d+)?$/);
    if (excelSerialMatch) {
        const parsed = XLSX.SSF.parse_date_code(Number(raw));
        if (parsed && parsed.y && parsed.m && parsed.d) {
            return buildSafeDate(parsed.y, parsed.m, parsed.d, parsed.H || 0, parsed.M || 0, Math.round(parsed.S || 0));
        }
    }

    // Formato ISO-like: 2025-03-15 ou 2025-03-15T10:30:00Z
    const isoLikeMatch = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2})(?::(\d{1,2}))?)?(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/i);
    if (isoLikeMatch) {
        const [, y, m, d, hh = '00', mm = '00', ss = '00'] = isoLikeMatch;
        return buildSafeDate(Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss));
    }

    // Formato BR: 15/03/2025 ou 15-03-25
    const brMatch = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
        const [, d, m, yRaw, hh = '00', mm = '00', ss = '00'] = brMatch;
        const y = Number(yRaw.length === 2 ? `20${yRaw}` : yRaw);
        return buildSafeDate(y, Number(m), Number(d), Number(hh), Number(mm), Number(ss));
    }

    // Fallback: Date.parse nativo
    const fallback = new Date(raw);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
};

/**
 * Converte valor (string, número, Date) para número, tratando formatação BR.
 * Suporta pontos como separador de milhar e vírgula como decimal.
 */
export const toNumber = (value) => {
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

// ============================================================
// FUNÇÕES DE NORMALIZAÇÃO DE TEXTO
// ============================================================

/** Normaliza texto para comparação (trim, fallback) */
export const normalizeText = (value, fallback = 'Sem Informacao') => {
    if (value === null || value === undefined) return fallback;
    const cleaned = String(value).trim();
    return cleaned || fallback;
};

/** Remove acentos/diacríticos para comparação de strings */
export const stripAccents = (value) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Normaliza para chave de busca: remove acentos e caracteres não-alfanuméricos */
export const normalizeKeyToken = (value) =>
    stripAccents(String(value || '')).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Formata uma rota normalizada: ORIGEM X DESTINO */
export const normalizeRouteLabel = (origem, destino, concatenado) => {
    const origemNormalizada = normalizeText(origem, 'Sem Origem');
    const destinoNormalizado = normalizeText(destino, 'Sem Destino');
    if (origemNormalizada !== 'Sem Origem' && destinoNormalizado !== 'Sem Destino') {
        return `${origemNormalizada} X ${destinoNormalizado}`;
    }
    return normalizeText(concatenado, `${origemNormalizada} X ${destinoNormalizado}`);
};

/** Formata um dia como DD/MM */
export const formatDayKey = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${day}/${month}`;
};

/** Converte Date para string ISO (YYYY-MM-DD) */
export const toISOStringDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/** Soma de um array de números */
export const sum = (values) => values.reduce((acc, v) => acc + v, 0);

/** Média de um array de números (retorna 0 se vazio) */
export const avg = (values) => (values.length ? sum(values) / values.length : 0);

// ============================================================
// FUNÇÕES DE BUSCA DE VALORES EM LINHAS (MULTI-ALIAS)
// ============================================================

/**
 * Busca o valor de uma coluna em uma linha usando múltiplos aliases.
 * Primeiro tenta correspondência exata, depois normalizada (sem acentos).
 * @param {object} row - Objeto representando a linha de dados.
 * @param {string[]} aliases - Lista de possíveis nomes para a coluna.
 * @returns {any} Valor encontrado ou null.
 */
export const getRowValue = (row, aliases = []) => {
    if (!row || typeof row !== 'object') return null;

    // Tentativa direta por nome exato
    for (const alias of aliases) {
        if (Object.prototype.hasOwnProperty.call(row, alias) && row[alias] !== null && row[alias] !== undefined && row[alias] !== '') {
            return row[alias];
        }
    }

    // Fallback: busca normalizada (sem acentos, sem caracteres especiais)
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

// ============================================================
// LEITORES DE DADOS TABULARES
// ============================================================

/** Instância lazy de sql.js (SQLite em WASM) */
let sqlJsRuntimePromise = null;

/** Obtém instância singleton do sql.js */
const getSqlJsRuntime = async () => {
    if (!sqlJsRuntimePromise) {
        sqlJsRuntimePromise = initSqlJs({
            locateFile: (file) => path.join(PROJECT_ROOT, 'node_modules', 'sql.js', 'dist', file)
        });
    }
    return sqlJsRuntimePromise;
};

/** Escapa identificadores SQL para prevenir injeção em SQLite */
const quoteSqlIdentifier = (value) => `"${String(value || '').replace(/"/g, '""')}"`;

/**
 * Lê linhas de arquivo Excel/CSV usando xlsx.
 * @param {string} filePath - Caminho do arquivo.
 * @param {function} [sheetResolver] - Função para selecionar aba (workbook => string).
 * @returns {object[]} Array de objetos (uma linha = um objeto).
 */
export const readRowsFromExcelOrCsv = (filePath, sheetResolver) => {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheet = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames[0] : null;
    const selectedSheet = typeof sheetResolver === 'function' ? sheetResolver(workbook) : firstSheet;
    if (!selectedSheet) return [];
    const sheet = workbook.Sheets[selectedSheet];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
};

/**
 * Lê todas as linhas de um banco SQLite usando sql.js (WASM).
 * @param {string} filePath - Caminho do arquivo .db/.sqlite.
 * @returns {Promise<object[]>} Array de objetos com _tableName.
 */
export const readRowsFromSqlite = async (filePath) => {
    const SQL = await getSqlJsRuntime();
    const dbBuffer = fs.readFileSync(filePath);
    const db = new SQL.Database(new Uint8Array(dbBuffer));

    try {
        const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        const tableNames = Array.isArray(result?.[0]?.values) ? result[0].values.map((row) => String(row[0])) : [];
        const rows = [];
        for (const tableName of tableNames) {
            const escapedTable = quoteSqlIdentifier(tableName);
            const tableData = db.exec(`SELECT * FROM ${escapedTable}`);
            const columns = Array.isArray(tableData?.[0]?.columns) ? tableData[0].columns : [];
            const values = Array.isArray(tableData?.[0]?.values) ? tableData[0].values : [];
            for (const valueRow of values) {
                const row = { _tableName: String(tableName) };
                columns.forEach((column, index) => { row[column] = valueRow[index]; });
                rows.push(row);
            }
        }
        return rows;
    } finally {
        db.close();
    }
};

/**
 * Lê linhas de arquivo DuckDB executando o script Python externo.
 * @param {string} filePath - Caminho do arquivo .duckdb.
 * @param {string[]} columnAliases - Aliases de colunas a selecionar.
 * @param {object} duckdbOptions - Opções adicionais (observação, allowlist).
 * @returns {Promise<object[]>} Array de objetos.
 */
export const readRowsFromDuckDb = async (filePath, columnAliases = [], duckdbOptions = {}) => {
    const aliases = Array.isArray(columnAliases)
        ? Array.from(new Set(columnAliases.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];
    const observationAliases = Array.isArray(duckdbOptions?.observationColumnAliases)
        ? Array.from(new Set(duckdbOptions.observationColumnAliases.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];
    const observationDateAllowlist = Array.isArray(duckdbOptions?.observationDateAllowlist)
        ? Array.from(new Set(duckdbOptions.observationDateAllowlist.map((item) => String(item || '').trim()).filter(Boolean)))
        : [];

    const scriptPath = path.join(PROJECT_ROOT, 'src_backend', 'scripts', 'duckdb_reader.py');
    const pyCmd = `import sys; exec(open(sys.argv[1], encoding='utf-8').read())`;
    const args = [
        scriptPath,
        filePath,
        String(DUCKDB_MAX_ROWS),
        String(DUCKDB_FETCH_BATCH),
        JSON.stringify(aliases),
        JSON.stringify(observationAliases),
        JSON.stringify(observationDateAllowlist)
    ];

    const rawOutput = await runPythonCmd(pyCmd, args);
    const parsed = JSON.parse(rawOutput);

    if (parsed?.ok === false) {
        if (parsed?.error === 'duckdb_too_many_rows') {
            console.warn(`[DUCKDB] Arquivo excede limite: ${parsed.rowsRead} linhas.`);
        }
        throw new Error(parsed?.details || parsed?.error || 'Erro ao ler DuckDB.');
    }

    return Array.isArray(parsed?.rows) ? parsed.rows : [];
};

/**
 * Lista datas de observação únicas em um arquivo DuckDB sem carregar todos os dados.
 * @param {string} filePath - Caminho do arquivo .duckdb.
 * @param {string[]} observationAliases - Aliases para a coluna de data de observação.
 * @returns {Promise<{observationDates: string[], totalRows: number}>}
 */
export const listObservationDatesFromDuckDb = async (filePath, observationAliases = []) => {
    const scriptPath = path.join(PROJECT_ROOT, 'src_backend', 'scripts', 'duckdb_observations.py');
    const pyCmd = `import sys; exec(open(sys.argv[1], encoding='utf-8').read())`;
    const args = [
        scriptPath,
        filePath,
        String(DUCKDB_FETCH_BATCH),
        JSON.stringify(observationAliases)
    ];

    const rawOutput = await runPythonCmd(pyCmd, args);
    const parsed = JSON.parse(rawOutput);

    if (parsed?.ok === false) {
        throw new Error(parsed?.details || parsed?.error || 'Erro ao listar datas DuckDB.');
    }

    return {
        observationDates: Array.isArray(parsed?.observationDates) ? parsed.observationDates : [],
        totalRows: Number(parsed?.totalRows || 0)
    };
};

/**
 * Lê linhas de arquivo Parquet usando hyparquet.
 * @param {string} filePath - Caminho do arquivo .parquet.
 * @returns {Promise<object[]>} Array de objetos.
 */
export const readRowsFromParquet = async (filePath) => {
    const buffer = await asyncBufferFromFile(filePath);
    const rows = [];
    await parquetReadObjects({ file: buffer, onComplete: (data) => { rows.push(...data); } });
    return rows;
};

/**
 * Lê dados tabulares de qualquer formato suportado, unificando a interface.
 * Detecta o formato pela extensão e delega para o leitor correto.
 * 
 * @param {string} filePath - Caminho do arquivo.
 * @param {object} options - Opções de leitura.
 * @param {function} options.sheetResolver - Seletor de aba para Excel.
 * @param {string[]} options.columnAliases - Aliases de colunas para DuckDB.
 * @param {object} options.duckdbOptions - Config extra para DuckDB.
 * @returns {Promise<object[]>} Array de objetos com dados tabulares.
 */
export const readTabularRows = async (filePath, { sheetResolver, columnAliases, duckdbOptions } = {}) => {
    const ext = path.extname(filePath).toLowerCase();

    if (EXCEL_LIKE_EXTENSIONS.has(ext)) {
        return readRowsFromExcelOrCsv(filePath, sheetResolver);
    }
    if (SQLITE_EXTENSIONS.has(ext)) {
        return readRowsFromSqlite(filePath);
    }
    if (DUCKDB_EXTENSIONS.has(ext)) {
        return readRowsFromDuckDb(filePath, columnAliases, duckdbOptions);
    }
    if (PARQUET_EXTENSIONS.has(ext)) {
        return readRowsFromParquet(filePath);
    }

    console.warn(`[DASH_UTILS] Extensão não suportada: ${ext} (${filePath})`);
    return [];
};

// ============================================================
// MAPA "DE PARA" — Resolução de linhas para mercados
// ============================================================

const DEPARA_FILE_REGEX = /de\s*para/i;
const DEPARA_SHEET_REGEX = /de\s*para/i;

/**
 * Carrega o mapeamento "De Para" de linhas → mercado/empresa.
 * Busca automaticamente o arquivo e aba corretos no diretório pai.
 * @param {string} effectiveDir - Diretório onde estão os dados de demanda.
 * @returns {Promise<Map<string, object>>} Mapa com chaves RAW: e NORM:.
 */
export const loadDeParaMap = async (effectiveDir) => {
    const deParaMap = new Map();

    // Buscar arquivo "De Para" no diretório pai
    const lookupDir = path.resolve(effectiveDir, '..');
    let deParaFilePath = null;

    const searchDirs = [lookupDir, effectiveDir];
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const match = entries.find(
            (entry) => entry.isFile() && DEPARA_FILE_REGEX.test(entry.name)
                && EXCEL_LIKE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
        );
        if (match) {
            deParaFilePath = path.join(dir, match.name);
            break;
        }
    }

    if (!deParaFilePath) return deParaMap;

    try {
        const workbook = XLSX.readFile(deParaFilePath, { cellDates: true });
        const names = Array.isArray(workbook?.SheetNames) ? workbook.SheetNames : [];
        const targetSheet = names.find((name) => DEPARA_SHEET_REGEX.test(name)) || names[0];
        if (!targetSheet) return deParaMap;

        const sheet = workbook.Sheets[targetSheet];
        if (!sheet) return deParaMap;
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

        for (const row of rows) {
            const codLinha = getRowValue(row, ['Cod Linha', 'COD LINHA', 'Cod_Linha', 'Cod. Linha', 'COD. LINHA']);
            const mercado = getRowValue(row, ['Mercado', 'MERCADO', 'NOME MERCADO', 'DESC MERCADO']);
            const empresa = getRowValue(row, ['Empresa', 'EMPRESA', 'NOME EMPRESA']);

            if (codLinha === null || codLinha === undefined) continue;
            const rawKey = String(codLinha).trim();
            const normKey = rawKey.replace(/^0+/, '') || '0';

            const entry = { mercado: mercado || null, empresa: empresa || null };
            deParaMap.set(`RAW:${rawKey}`, entry);
            deParaMap.set(`NORM:${normKey}`, entry);
        }
    } catch (error) {
        console.warn(`[DEPARA] Falha ao carregar De Para: ${error.message || error}`);
    }

    return deParaMap;
};

// ============================================================
// UTILITÁRIOS DE CACHE COM TTL
// ============================================================

/**
 * Cria um par de funções get/set para cache em memória com TTL.
 * @param {Map} cacheMap - Map a usar como armazenamento.
 * @param {number} ttlMs - Tempo de vida em milissegundos.
 * @returns {{get: function, set: function}} Funções de acesso ao cache.
 */
export const createCacheAccessors = (cacheMap, ttlMs) => ({
    get: (key) => {
        const entry = cacheMap.get(key);
        if (!entry) return null;
        if (entry.expiresAt <= Date.now()) {
            cacheMap.delete(key);
            return null;
        }
        return entry.payload;
    },
    set: (key, payload) => {
        cacheMap.set(key, { payload, expiresAt: Date.now() + ttlMs });
    }
});

// Re-exportar referências usadas em múltiplos módulos
export { XLSX, fs, path, __dirname, PROJECT_ROOT };
