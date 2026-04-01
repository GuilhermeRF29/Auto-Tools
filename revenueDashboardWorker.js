import { parentPort, workerData } from 'worker_threads';
import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const REVENUE_FILE_REGEX = /revenue.*\.xlsx$/i;

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
        return new Date(value.getTime());
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
        const dt = buildSafeDate(Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss));
        return dt;
    }

    const brMatch = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (brMatch) {
        const [, d, m, y, hh = '00', mm = '00', ss = '00'] = brMatch;
        return buildSafeDate(Number(y), Number(m), Number(d), Number(hh), Number(mm), Number(ss));
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

    // ADVP2: Data Viagem - Data Aplicacao (mesma regra do dashboard original).
    const advp2 = Math.round((toStartOfDay(dataViagem).getTime() - toStartOfDay(dataAplicacao).getTime()) / 86400000);
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

const buildEmptyRevenuePayload = (effectiveDir, preferredDir, rangeStart, rangeEnd, warnings = []) => ({
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
    }
});

const buildRevenueDashboardPayload = ({ effectiveDir, preferredDir, rangeStart, rangeEnd }) => {
    const files = collectRevenueFiles(effectiveDir);
    if (!files.length) {
        return buildEmptyRevenuePayload(
            effectiveDir,
            preferredDir,
            rangeStart,
            rangeEnd,
            ['Nenhum arquivo Revenue encontrado no diretorio selecionado.']
        );
    }

    const dedupe = new Set();
    const rows = [];
    const parseWarnings = [];

    for (const filePath of files) {
        try {
            const workbook = XLSX.readFile(filePath, { cellDates: true });
            const sheetName = pickRevenueSheet(workbook);
            if (!sheetName) continue;

            const sheet = workbook.Sheets[sheetName];
            const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });

            for (const row of rawRows) {
                const dataAplicacao = parseBrDate(row['Data Aplicação']);
                if (!dataAplicacao) continue;
                if (dataAplicacao < rangeStart || dataAplicacao > rangeEnd) continue;

                const dataViagem = parseBrDate(row['Data Viagem']);
                const revenueAplicado = toNumber(row['Revenue Aplicado']);
                const statusRevenue = normalizeText(row['Status Revenue'], 'Sem Status');
                const indicador = normalizeText(row['Indicador'], 'Sem Indicador');
                const canalVenda = normalizeText(row['Canal Venda'], 'Sem Canal');
                const justificativa = normalizeText(row['Justificativa'], 'Sem Justificativa');
                const analista = normalizeText(row['Analista'], 'Sem Analista');
                const origem = normalizeText(row['Origem'], 'Sem Origem');
                const destino = normalizeText(row['Destino'], 'Sem Destino');
                const numServico = normalizeText(row['Num. Serviço'] ?? row['Num. Servico'], 'Sem Servico');
                const rota = normalizeRouteLabel(origem, destino, row['Concatenar Origem e Destino']);

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

    return {
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
};

const main = () => {
    try {
        const effectiveDir = String(workerData?.effectiveDir || '');
        const preferredDir = String(workerData?.preferredDir || effectiveDir);
        const rangeStartMs = Number(workerData?.rangeStartMs);
        const rangeEndMs = Number(workerData?.rangeEndMs);

        if (!effectiveDir) {
            throw new Error('Diretorio de base nao informado para o worker.');
        }

        if (!Number.isFinite(rangeStartMs) || !Number.isFinite(rangeEndMs)) {
            throw new Error('Periodo invalido no worker de Revenue.');
        }

        const rangeStart = toStartOfDay(new Date(rangeStartMs));
        const rangeEnd = toEndOfDay(new Date(rangeEndMs));

        const payload = buildRevenueDashboardPayload({
            effectiveDir,
            preferredDir,
            rangeStart,
            rangeEnd
        });

        parentPort?.postMessage({ payload });
    } catch (error) {
        parentPort?.postMessage({ error: String(error?.message || error) });
    }
};

main();
