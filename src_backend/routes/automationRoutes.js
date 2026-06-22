/**
 * @module automationRoutes
 * @description Rotas para execução e gerenciamento de automações Python.
 * Gerencia jobs em background, progresso via SSE (Server-Sent Events),
 * backups de arquivos gerados e histórico de execuções.
 */
import { Router } from 'express';
import { runPythonCmd, spawnPythonScript } from '../utils/pythonProxy.js';
import { BACKUP_DIR, getRootDir } from '../config.js';
import { isPathSafe } from '../utils/pathValidator.js';
import { getDb } from '../db/sqliteNative.js';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';

const router = Router();

/** Mapa em memória de jobs ativos/recentes — limpo automaticamente após 10min */
const jobs = new Map();

/** Diretório de logs por sessão de automação */
const LOGS_DIR = path.join(getRootDir(), 'logs');
if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
}

/**
 * Retorna o caminho do arquivo de log para um job específico.
 * @param {string} jobId - ID do job.
 * @returns {string} Caminho completo do arquivo de log.
 */
const getJobLogPath = (jobId) => path.join(LOGS_DIR, `${jobId}.log`);

/**
 * Append texto ao arquivo de log do job (cria se não existir).
 * @param {string} jobId - ID do job.
 * @param {string} text - Texto a ser escrito.
 */
const appendToJobLog = (jobId, text) => {
    if (!jobId || !text) return;
    try {
        fs.appendFileSync(getJobLogPath(jobId), text, 'utf-8');
    } catch (e) {
        console.error(`[LOG_WRITE_ERROR] Falha ao escrever log para job ${jobId}:`, e.message);
    }
};



const resolveAutomationLabel = (job) => {
    if (!job || !job.script) return 'AUTO';
    if (job.script.endsWith('sr_new.py')) return 'SR Gmail/Base';
    if (job.script.endsWith('adm_new.py')) return 'ADM Demandas';
    if (job.script.endsWith('ebus_new.py')) return 'EBUS Revenue';
    if (job.script.endsWith('busca_dados.py')) return 'BI Performance';
    if (job.script.endsWith('paxcalc.py')) return 'PAX Calc';
    if (job.script.endsWith('new_wow.py')) return 'WoW Presentation';
    return 'AUTO';
};

const formatJobMessage = (job, message) => {
    const raw = typeof message === 'string' ? message.trim() : '';
    if (!raw) return raw;
    if (/^(SR|ADM|EBUS|PAX|AUTO)\s*[|:•-]/i.test(raw)) return raw;
    return `${resolveAutomationLabel(job)} | ${raw}`;
};

// Funcao centralizada do ORM local
const persistHistory = (uid, n, p, f, pathB, s, jid, log) => {
    const safeUid = (uid === 'undefined' || !uid) ? 'None' : uid;
    const pStr = JSON.stringify(p || {});
    const safeJid = (!jid || jid === '') ? 'None' : jid;
    const logB64 = (log && typeof log === 'string' && log.length > 0)
        ? Buffer.from(log).toString('base64')
        : 'None';

    const pyCmd = `import sys, base64; from core.banco import salvar_historico_relatorio; salvar_historico_relatorio(int(sys.argv[1]) if sys.argv[1] != 'None' else None, sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7] if sys.argv[7] != 'None' else None, base64.b64decode(sys.argv[8]).decode('utf-8') if sys.argv[8] != 'None' else '')`;
    
    // Spawn detached fire-and-forget for db histories to not block event loops
    runPythonCmd(pyCmd, [safeUid.toString(), n, pStr, f || '', pathB || '', s, safeJid, logB64])
        .catch(e => console.error(`[DB_EXEC_ERROR]`, e));
};


router.post('/run-automation', async (req, res) => {
    const { name, user_id, ...params } = req.body;
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let scriptPath = '';
    const rootDir = getRootDir();

    if (name.includes('RIO X SP')) scriptPath = path.join(rootDir, 'automacoes', 'sr_new.py');
    else if (name.includes('Revenue')) scriptPath = path.join(rootDir, 'automacoes', 'ebus_new.py');
    else if (name.includes('Demandas')) scriptPath = path.join(rootDir, 'automacoes', 'adm_new.py');
    else if (name.includes('Performance de Canais')) scriptPath = path.join(rootDir, 'automacoes', 'busca_dados.py');
    else if (name.includes('Cotação')) scriptPath = path.join(rootDir, 'automacoes', 'paxcalc.py');
    else if (name.includes('WoW')) scriptPath = path.join(rootDir, 'automacoes', 'new_wow.py');

    if (!scriptPath) {
        return res.status(400).json({ error: 'Nenhuma automação mapeada para este nome.' });
    }

    const job = {
        id: jobId,
        name,
        script: scriptPath,
        status: 'running',
        progress: 0,
        message: 'Iniciando...',
        output: '',
        process: null,
        events: [],
        params: params,
        user_id: user_id
    };
    jobs.set(jobId, job);

    const paramsBase64 = Buffer.from(JSON.stringify({ ...params, user_id: user_id || 1 })).toString('base64');
    const child = spawnPythonScript(scriptPath, [paramsBase64]);
    job.process = child;

    persistHistory(user_id, name, params, "", "", "running", jobId);

    child.stdout.on('data', (data) => {
        const text = data.toString();
        appendToJobLog(jobId, `[STDOUT ${jobId}] ${text}`);
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (!line.trim()) return;
            job.output += line + '\n';
            
            const match = line.match(/PROGRESS:\s*({.*})/);
            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    job.progress = parsed.p;
                    job.message = formatJobMessage(job, parsed.m);
                    job.events.forEach(client => {
                        client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
                    });
                } catch (e) {}
            } else {
                // Progresso automático assintótico para prints normais
                // Ignora ruídos comuns de bibliotecas
                if (line.match(/\[WDM\]|DevTools listening|DeprecationWarning|UserWarning/i)) return;
                if (line.trim().length < 2) return; // Ignora prints minúsculos
                
                // Matemática assintótica: avança 15% do restante até chegar em 95%
                const targetMax = 95;
                if (job.progress < targetMax) {
                    const delta = targetMax - job.progress;
                    job.progress = Number(Math.min(targetMax, job.progress + (delta * 0.15)).toFixed(2));
                }
                
                job.message = formatJobMessage(job, line.trim().substring(0, 100));
                job.events.forEach(client => {
                    client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
                });
            }
        });
    });

    child.stderr.on('data', (data) => {
        const err = data.toString();
        appendToJobLog(jobId, `[STDERR ${jobId}] ${err}`);
        console.error(`[PY-STDERR] ${err}`);
        job.output += `[ERRO] ${err}\n`;
        job.events.forEach(client => {
            client.write(`data: ${JSON.stringify({ progress: job.progress, message: formatJobMessage(job, err.substring(0, 80)), status: 'running' })}\n\n`);
        });
    });

    child.on('close', (code) => {
        if (job.status === 'cancelled') return;

        job.status = code === 0 ? 'completed' : 'failed';
        console.log(`[BACKEND] Job ${jobId} finalizado com status: ${job.status}`);
        
        let pathBackupSalvar = "";
        let nomeArquivoSalvar = "Nenhum arquivo gerado";
        let jaPersitiuHistorico = false;

        if (job.status === 'failed') {
            job.message = job.message || "Erro na execução da automação.";
        } else {
            job.progress = 100;
            job.message = "Concluído com sucesso!";
            
            try {
                const lines = job.output.split('\n');
                let resultObj = null;
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    const jsonMatch = line.match(/{.*"arquivo_principal".*}/);
                    if (jsonMatch) {
                        try { resultObj = JSON.parse(jsonMatch[0]); break; } catch (e) {}
                    }
                }

                if (resultObj) {
                    const arquivosParaBackup = Array.isArray(resultObj.arquivos_saida) && resultObj.arquivos_saida.length > 0
                        ? resultObj.arquivos_saida
                        : [resultObj.arquivo_principal].filter(Boolean);
                    const totalArquivosBackup = Math.max(arquivosParaBackup.length, 1);
                    let arquivosPersistidos = 0;

                    for (let i = 0; i < arquivosParaBackup.length; i++) {
                        const arquivoOriginal = arquivosParaBackup[i];
                        if (fs.existsSync(arquivoOriginal)) {
                            const nomeBase = path.basename(arquivoOriginal);
                            const timestamp = Date.now();
                            const nomeSeguro = `${i + 1}_${nomeBase}`;
                            const nomeBackup = `${timestamp}_${nomeSeguro}`;
                            const caminhoBackup = path.join(BACKUP_DIR, nomeBackup);

                            fs.copyFileSync(arquivoOriginal, caminhoBackup);
                            job.progress = Math.min(99, 95 + Math.round((4 * (i + 1)) / totalArquivosBackup));
                            job.message = formatJobMessage(job, `Arquivo renomeado para backup: ${nomeBase} -> ${nomeBackup}`);
                            job.events.forEach(client => {
                                client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
                            });

                            const pathSalvar = caminhoBackup.replace(/\\/g, '/');
                            const nomeAtividade = `${job.name} (${nomeBase})`;

                            const idPersistencia = (i === 0) ? jobId : null;
                            persistHistory(job.user_id, nomeAtividade, job.params, nomeBase, pathSalvar, 'completed', idPersistencia);
                            arquivosPersistidos += 1;
                            console.log(`[BACKUP] Registro ${i+1} persistido: ${nomeBase}`);
                        }
                    }
                    jaPersitiuHistorico = arquivosPersistidos > 0;
                }
            } catch (err) {
                console.error(`[BACKEND] Erro no backup: ${err.message}`);
            }
        }

        if (!jaPersitiuHistorico) {
            persistHistory(job.user_id, job.name, job.params, nomeArquivoSalvar, pathBackupSalvar, job.status, jobId, job.output);
        }

        // Persistir log completo no banco (SQLite) e Firebase para análise remota
        const logOutput = (job.output || '').trim().slice(-500000);
        if (logOutput.length > 0 && jobId) {
            const logB64 = Buffer.from(logOutput).toString('base64');
            const logPyCmd = `import sys, base64; from core.banco import atualizar_log_historico; atualizar_log_historico(sys.argv[1], base64.b64decode(sys.argv[2]).decode('utf-8'))`;
            runPythonCmd(logPyCmd, [jobId, logB64])
                .catch(e => console.warn(`[LOG_PERSIST_WARN] Falha ao persistir log para ${jobId}:`, e.message));
        }

        const lastLine = job.output.trim().split('\n').pop() || "";
        job.events.forEach(client => {
            client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status, result: lastLine })}\n\n`);
            client.end();
        });
        
        setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
    });

    res.json({ success: true, jobId });
});

router.get('/automation-progress/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) return res.status(404).json({ error: 'Job não encontrado.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);

    if (job.status === 'running') {
        job.events.push(res);
        req.on('close', () => {
            job.events = job.events.filter(r => r !== res);
        });
    } else {
        res.end();
    }
});

router.post('/cancel-automation/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (job && job.process && job.status === 'running') {
        job.status = 'cancelled';
        job.message = "Cancelado pelo usuário.";

        const pid = job.process.pid;
        if (pid) {
            // No Windows, SIGINT não funciona para processos child.
            // Usa taskkill /T para matar toda a árvore de processos.
            if (process.platform === 'win32') {
                try {
                    spawn('taskkill', ['/PID', pid.toString(), '/F'], {
                        shell: false,
                        windowsHide: true,
                        stdio: 'ignore'
                    });
                } catch (e) {
                    console.warn(`[CANCEL] taskkill falhou para PID ${pid}:`, e.message);
                }
            } else {
                // Unix: SIGINT + fallback SIGKILL
                job.process.kill('SIGINT');
                setTimeout(() => { try { job.process.kill('SIGKILL'); } catch (e) {} }, 2000);
            }
        }
        
        job.events.forEach(client => {
            client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
            client.end();
        });
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Job não encontrado ou já finalizado.' });
});

router.get('/relatorios-history', async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const { user_id } = req.query;
    const safeUserId = (user_id === 'undefined' || !user_id) ? null : parseInt(user_id);

    try {
        const native = getDb();
        const result = native.getRelatoriosHistory(limit, safeUserId);
        res.json(result);
    } catch (e) {
        console.error(`[HISTORY_FETCH_ERROR]`, e);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
});

// HISTORY DELETE: Excluir registro do histórico (e opcionalmente o arquivo de backup)
router.delete('/relatorios-history/:id', async (req, res) => {
    const { id } = req.params;
    const { deleteFile, path: filePath } = req.query;

    // Proteção contra path traversal: só permite deletar arquivos dentro do diretório de backups
    if (deleteFile === 'true' && filePath && isPathSafe(filePath, BACKUP_DIR) && fs.existsSync(filePath)) {
        try {
            fs.unlinkSync(filePath);
        } catch (e) {
            console.warn(`[FILE_DELETE_ERROR] Não foi possível deletar arquivo: ${e.message}`);
        }
    }

    try {
        const native = getDb();
        const resDb = native.deleteRelatorioHistory(id);
        res.json({ success: resDb });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao excluir do banco' });
    }
});

// LOGS: Retornar conteúdo do log de uma automação pelo jobId
router.get('/logs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const logPath = getJobLogPath(jobId);

    if (!fs.existsSync(logPath)) {
        // Fallback: buscar do banco SQLite
        const pyCmd = `import sys, json; from core.banco import obter_log_por_job_id; log = obter_log_por_job_id(sys.argv[1]); print(json.dumps(log))`;
        runPythonCmd(pyCmd, [jobId])
            .then(logText => res.json({ jobId, log: logText || '', source: 'database' }))
            .catch(() => res.status(404).json({ error: 'Log não encontrado para este job.' }));
        return;
    }

    try {
        const log = fs.readFileSync(logPath, 'utf-8');
        res.json({ jobId, log, source: 'file' });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao ler arquivo de log.' });
    }
});

// DOWNLOAD: Baixar arquivo de backup — protegido contra path traversal
router.get('/download', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !isPathSafe(filePath, BACKUP_DIR)) {
        return res.status(403).json({ error: 'Acesso negado: caminho fora do diretório de backups.' });
    }
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado para download.' });
    }
    res.download(filePath);
});

export default router;
