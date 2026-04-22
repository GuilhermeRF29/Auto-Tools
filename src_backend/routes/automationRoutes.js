/**
 * @module automationRoutes
 * @description Rotas para execução e gerenciamento de automações Python.
 * Gerencia jobs em background, progresso via SSE (Server-Sent Events),
 * backups de arquivos gerados e histórico de execuções.
 */
import { Router } from 'express';
import { runPythonCmd, spawnPythonScript } from '../utils/pythonProxy.js';
import { BACKUP_DIR, getRootDir } from '../config.js';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

const router = Router();

/** Mapa em memória de jobs ativos/recentes — limpo automaticamente após 10min */
const jobs = new Map();

/**
 * Valida se um caminho de arquivo está dentro de um diretório permitido.
 * Previne ataques de path traversal (ex: ../../etc/passwd).
 * @param {string} filePath - Caminho do arquivo a validar.
 * @param {string} allowedDir - Diretório base permitido.
 * @returns {boolean} true se o caminho é seguro.
 */
const isPathSafe = (filePath, allowedDir) => {
    if (!filePath || !allowedDir) return false;
    const resolvedFile = path.resolve(filePath);
    const resolvedDir = path.resolve(allowedDir);
    return resolvedFile.startsWith(resolvedDir + path.sep) || resolvedFile === resolvedDir;
};

const resolveAutomationLabel = (job) => {
    if (!job || !job.script) return 'AUTO';
    if (job.script.endsWith('sr_new.py')) return 'SR Gmail/Base';
    if (job.script.endsWith('adm_new.py')) return 'ADM Demandas';
    if (job.script.endsWith('ebus_new.py')) return 'EBUS Revenue';
    if (job.script.endsWith('busca_dados.py')) return 'BI Performance';
    if (job.script.endsWith('paxcalc.py')) return 'PAX Calc';
    return 'AUTO';
};

const formatJobMessage = (job, message) => {
    const raw = typeof message === 'string' ? message.trim() : '';
    if (!raw) return raw;
    if (/^(SR|ADM|EBUS|PAX|AUTO)\s*[|:•-]/i.test(raw)) return raw;
    return `${resolveAutomationLabel(job)} | ${raw}`;
};

// Funcao centralizada do ORM local
const persistHistory = (uid, n, p, f, pathB, s, jid) => {
    const safeUid = (uid === 'undefined' || !uid) ? 'None' : uid;
    const pStr = JSON.stringify(p || {});
    const safeJid = (!jid || jid === '') ? 'None' : jid;

    const pyCmd = `import sys; from core.banco import salvar_historico_relatorio; salvar_historico_relatorio(int(sys.argv[1]) if sys.argv[1] != 'None' else None, sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5], sys.argv[6], sys.argv[7] if sys.argv[7] != 'None' else None)`;
    
    // Spawn detached fire-and-forget for db histories to not block event loops
    runPythonCmd(pyCmd, [safeUid.toString(), n, pStr, f || '', pathB || '', s, safeJid])
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
        fs.appendFileSync(path.join(rootDir, 'server_debug.log'), `[STDOUT ${jobId}] ${text}`);
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (!line.trim()) return;
            job.output += line + '\n';
            
            const match = line.match(/PROGRESS:({.*})/);
            if (match) {
                try {
                    const parsed = JSON.parse(match[1]);
                    job.progress = parsed.p;
                    job.message = formatJobMessage(job, parsed.m);
                    job.events.forEach(client => {
                        client.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
                    });
                } catch (e) {}
            }
        });
    });

    child.stderr.on('data', (data) => {
        const err = data.toString();
        fs.appendFileSync(path.join(rootDir, 'server_debug.log'), `[STDERR ${jobId}] ${err}`);
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
                    const arquivosParaBackup = Array.isArray(resultObj.arquivos_saida) 
                        ? resultObj.arquivos_saida 
                        : [resultObj.arquivo_principal].filter(Boolean);
                    const totalArquivosBackup = Math.max(arquivosParaBackup.length, 1);

                    for (let i = 0; i < arquivosParaBackup.length; i++) {
                        const arquivoOriginal = arquivosParaBackup[i];
                        if (fs.existsSync(arquivoOriginal)) {
                            const nomeBase = path.basename(arquivoOriginal);
                            const timestamp = Date.now();
                            const nomeBackup = `${timestamp}_${nomeBase}`;
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
                            console.log(`[BACKUP] Registro ${i+1} persistido: ${nomeBase}`);
                        }
                    }
                    jaPersitiuHistorico = true;
                }
            } catch (err) {
                console.error(`[BACKEND] Erro no backup: ${err.message}`);
            }
        }

        if (!jaPersitiuHistorico) {
            persistHistory(job.user_id, job.name, job.params, nomeArquivoSalvar, pathBackupSalvar, job.status, jobId);
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
                    execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
                } catch (e) {
                    // Processo pode já ter finalizado
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
    const limit = req.query.limit || 50;
    const { user_id } = req.query;
    const safeUserId = (user_id === 'undefined' || !user_id) ? 'None' : user_id;
    const pyCmd = `import sys, json; from core.banco import listar_historico_relatorios; res = listar_historico_relatorios(limit=int(sys.argv[1]), user_id=int(sys.argv[2]) if sys.argv[2] != 'None' else None); print(json.dumps(res))`;

    try {
        const result = await runPythonCmd(pyCmd, [limit.toString(), safeUserId.toString()]);
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

    const pyCmd = `import sys; from core.banco import excluir_historico_id; res = excluir_historico_id(int(sys.argv[1])); print('ok' if res else 'error')`;
    try {
        await runPythonCmd(pyCmd, [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao excluir do banco' });
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
