import express from 'express';
import { exec, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Caminho para o executável do Python no venv (que movi para backup_pyside)
const PYTHON_PATH = path.join(__dirname, 'backup_pyside', 'venv', 'Scripts', 'python.exe');
const BACKUP_DIR = path.join(__dirname, 'backups_sistema');

// Criar pasta de backup se não existir
if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

app.use(express.json());

// Inicializar banco de dados e limpar histórico antigo (30 dias) ao subir o servidor
const initDbCmd = `import os; from core import banco; banco.configurar_banco(); l = banco.excluir_historico_antigo(dias=30); [os.remove(p) for p in l if os.path.exists(p)]; print('DB OK')`;
exec(`"${PYTHON_PATH}" -c "${initDbCmd}"`, (error) => {
    if (error) console.error(`[SYSTEM] Erro ao inicializar banco: ${error.message}`);
    else console.log(`[SYSTEM] Banco de dados verificado/inicializado.`);
});

// Rota de status
app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', version: 'Versão de desenvolvimento 2.3', python: PYTHON_PATH });
});

// ROUTE: Abrir explorador do Windows nativo
app.get('/api/abrir-explorador-pastas', (req, res) => {
    // Definimos o script Python separadamente para evitar conflitos de aspas
    const script = `import tkinter as tk; from tkinter import filedialog; import json, os; root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); p=filedialog.askdirectory(title='Selecione a Pasta'); root.destroy(); print(json.dumps({'caminho': os.path.normpath(p).replace('\\\\', '\\\\\\\\') if p else ''}))`;

    // No Windows, usar aspas duplas envolta do comando -c de python Ã© mais seguro com exec
    const fullCmd = `"${PYTHON_PATH}" -c "${script.replace(/"/g, '\\"')}"`;

    exec(fullCmd, { 
        cwd: __dirname, 
        encoding: 'utf8',
        windowsHide: true
    }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[EXPLORER_ERROR] ${error.message}`);
            return res.json({ caminho: '' });
        }
        try {
            const out = stdout.trim().split('\n').pop();
            res.json(JSON.parse(out));
        } catch (e) {
            res.json({ caminho: '' });
        }
    });
});


const jobs = new Map();

app.post('/api/run-automation', async (req, res) => {
    const { name, user_id, ...params } = req.body;
    const jobId = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;


    let scriptPath = '';
    
    // Mapeamento exato com os nomes que aparecem na interface (App.tsx)
    if (name.includes('RIO X SP')) scriptPath = path.join(__dirname, 'automacoes', 'sr_new.py');
    else if (name.includes('Revenue')) scriptPath = path.join(__dirname, 'automacoes', 'ebus_new.py');
    else if (name.includes('Demandas')) scriptPath = path.join(__dirname, 'automacoes', 'adm_new.py');
    else if (name.includes('Cotação')) scriptPath = path.join(__dirname, 'automacoes', 'paxcalc.py');




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
        params: params, // Parâmetros de configuração (acao, base, saida, etc.)
        user_id: user_id // ID do usuário que disparou a automação
    };
    jobs.set(jobId, job);

    // Passamos os parâmetros em Base64 via CLI para evitar problemas com caracteres e stdin
    const paramsBase64 = Buffer.from(JSON.stringify({ ...params, user_id: user_id || 1 })).toString('base64');

    const child = spawn(`"${PYTHON_PATH}"`, [`"${scriptPath}"`, paramsBase64], { 
        shell: true,
        cwd: __dirname 
    });
    job.process = child;

    // Registro Imediato no Banco (Histórico de 'Em andamento')
    const paramsStr = JSON.stringify(params || {}).replace(/"/g, '\\"');
    const safeUid = (user_id === 'undefined' || !user_id) ? 'None' : user_id;
    const startCmd = `import sys, json; from core import banco; banco.salvar_historico_relatorio(${safeUid}, "${name}", "${paramsStr}", "", "", "running")`;
    exec(`"${PYTHON_PATH}" -c "${startCmd}"`, { cwd: __dirname });

    child.stdout.on('data', (data) => {
        const text = data.toString();
        fs.appendFileSync(path.join(__dirname, 'server_debug.log'), `[STDOUT ${jobId}] ${text}`);
        const lines = text.split('\n');
        
        lines.forEach(line => {
            if (!line.trim()) return;
            job.output += line + '\n';
            
            const match = line.match(/PROGRESS:({.*})/);
            if (match) {
                try {
                    const data = JSON.parse(match[1]);
                    job.progress = data.p;
                    job.message = data.m;
                    job.events.forEach(res => {
                        res.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
                    });
                } catch (e) {}
            }
        });
    });

    child.stderr.on('data', (data) => {
        const err = data.toString();
        fs.appendFileSync(path.join(__dirname, 'server_debug.log'), `[STDERR ${jobId}] ${err}`);
        console.error(`[PY-STDERR] ${err}`);
        job.output += `[ERRO] ${err}\n`;
        // Enviar erro parcial se possível
        job.events.forEach(res => {
            res.write(`data: ${JSON.stringify({ progress: job.progress, message: err.substring(0, 50), status: 'running' })}\n\n`);
        });
    });

    child.on('close', (code) => {
        if (job.status === 'cancelled') return;

        job.status = code === 0 ? 'completed' : 'failed';
        console.log(`[BACKEND] Job ${jobId} finalizado com status: ${job.status}`);
        
        let pathBackupSalvar = "";
        let nomeArquivoSalvar = "Nenhum arquivo gerado";

        if (job.status === 'failed') {
            job.message = job.message || "Erro na execução da automação.";
        } else {
            job.progress = 100;
            job.message = "Concluído com sucesso!";
            
            // Tenta capturar arquivo de backup se existir
            try {
                const lines = job.output.split('\n');
                let resultObj = null;
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.startsWith('{') && line.includes('arquivo_principal')) {
                        try { resultObj = JSON.parse(line); break; } catch (e) {}
                    }
                }

                if (resultObj && resultObj.arquivo_principal && fs.existsSync(resultObj.arquivo_principal)) {
                    const arquivoOriginal = resultObj.arquivo_principal;
                    nomeArquivoSalvar = path.basename(arquivoOriginal);
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const nomeBackup = `${timestamp}_${nomeArquivoSalvar}`;
                    const caminhoBackup = path.join(BACKUP_DIR, nomeBackup);

                    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
                    fs.copyFileSync(arquivoOriginal, caminhoBackup);
                    pathBackupSalvar = caminhoBackup.replace(/\\/g, '/');
                    console.log(`[BACKUP] Arquivo salvo: ${nomeBackup}`);
                }
            } catch (err) {
                console.error(`[BACKEND] Erro no backup: ${err.message}`);
            }
        }

        // REGISTRO OBRIGATÓRIO NO HISTÓRICO (BD) - Independente de sucesso/falha
        try {
            const paramsStr = JSON.stringify(job.params || {}).replace(/"/g, '\\"');
            const safeUid = (job.user_id === 'undefined' || !job.user_id) ? 'None' : job.user_id;
            const cmd = `import sys, json; from core import banco; banco.salvar_historico_relatorio(${safeUid}, "${job.name}", "${paramsStr}", "${nomeArquivoSalvar}", "${pathBackupSalvar}", "${job.status}")`;
            exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname });
            console.log(`[HISTORY] Registro persistido no banco de dados para o job ${jobId}`);
        } catch (e) {
            console.error(`[HISTORY_ERROR] Falha ao persistir no BD: ${e.message}`);
        }

        job.events.forEach(res => {
            const lastLine = job.output.trim().split('\n').pop() || "";
            res.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status, result: lastLine })}\n\n`);
            res.end();
        });
        
        setTimeout(() => jobs.delete(jobId), 10 * 60 * 1000);
    });

    res.json({ success: true, jobId });
});

app.get('/api/automation-progress/:jobId', (req, res) => {
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

app.post('/api/cancel-automation/:jobId', (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (job && job.process && job.status === 'running') {
        job.status = 'cancelled';
        job.message = "Cancelado pelo usuário.";
        job.process.kill('SIGINT'); // Tentativa de fechar gracefully
        setTimeout(() => { if (job.process) job.process.kill('SIGKILL'); }, 2000);
        
        job.events.forEach(res => {
            res.write(`data: ${JSON.stringify({ progress: job.progress, message: job.message, status: job.status })}\n\n`);
            res.end();
        });
        return res.json({ success: true });
    }
    res.status(404).json({ error: 'Job não encontrado ou já finalizado.' });
});


// LIMPEZA AUTOMÁTICA (Pode ser chamada pelo front ou via cron interno)
app.post('/api/clean-backups', (req, res) => {
    const cmd = `import sys, json, os; from core import banco; files = banco.excluir_historico_antigo(30); [os.remove(f) for f in files if os.path.exists(f)]; print('ok')`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname }, (error) => {
        if (error) return res.status(500).json({ success: false });
        res.json({ success: true });
    });
});


// Funções de Banco de Dados (Via chamadas curtas de Python para reaproveitar banco.py)
// LOGIN: Autenticar usuário
app.post('/api/login', (req, res) => {
    const { usuario, senha } = req.body;
    const safeUser = usuario.replace(/'/g, "\\'");
    const safePass = senha.replace(/'/g, "\\'");

    // Usar json.dumps para evitar erro de aspas no parse do JS
    const cmd = `import sys, json; from core import banco; print(json.dumps(banco.login_principal('${safeUser}', '${safePass}')))`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[AUTH] Login error: ${error.message} \nStderr: ${stderr}`);
            return res.status(500).json({
                error: 'Erro no servidor Python',
                details: error.message,
                stderr: stderr
            });
        }
        const result = stdout.trim();
        try {
            const userArray = JSON.parse(result); // Agora vem como [id, nome]
            const [id, nome] = userArray;

            if (id !== null) {
                res.json({ success: true, user: { id, nome, usuario: usuario } });
            } else {
                res.json({ success: false, error: 'Usuário ou senha inválidos' });
            }
        } catch (e) {
            res.status(500).json({ success: false, error: 'Erro ao processar dados de login' });
        }
    });
});

// LOGIN: Criar novo usuário
app.post('/api/register', (req, res) => {
    const { usuario, senha, nome } = req.body;
    const safeUser = usuario.replace(/'/g, "\\'");
    const safePass = senha.replace(/'/g, "\\'");
    const safeName = (nome || '').replace(/'/g, "\\'");

    const cmd = `import sys, json; from core import banco; print(json.dumps(banco.cadastrar_usuario_principal('${safeName}', '${safeUser}', '${safePass}')))`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[AUTH] Register error: ${error.message} \nStderr: ${stderr}`);
            return res.status(500).json({
                error: 'Erro ao cadastrar via Python',
                details: error.message,
                stderr: stderr
            });
        }
        const result = stdout.trim();
        if (result === 'true') { // json.dumps(True) é 'true' em minúsculo
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Usuário já existe ou erro interno no banco' });
        }
    });
});

app.get('/api/onibus', (req, res) => {
    const cmd = `import sys; from core import banco; print(banco.listar_onibus())`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao listar' });
        try {
            const raw = stdout.trim().replace(/\(/g, '[').replace(/\)/g, ']').replace(/'/g, '"');
            res.json(JSON.parse(raw));
        } catch (e) {
            res.json([]);
        }
    });
});

app.post('/api/onibus', (req, res) => {
    const { nome, capacidade } = req.body;
    const cmd = `from core.banco import salvar_onibus; salvar_onibus('${nome}', ${capacidade}); print('ok')`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao salvar ônibus' });
        res.json({ success: true });
    });
});

// VAULT: Listar credenciais
app.get('/api/credentials/:user_id', (req, res) => {
    const { user_id } = req.params;
    const cmd = `import sys, json; from core import banco; print(json.dumps(banco.listar_credenciais(${user_id})))`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao buscar credenciais' });
        res.json(JSON.parse(stdout.trim()));
    });
});

// VAULT: Salvar credencial
app.post('/api/credentials', (req, res) => {
    const { user_id, servico, login, senha, eh_personalizado, url } = req.body;
    const isCustom = eh_personalizado ? 'True' : 'False';
    const safeUrl = (url || '').replace(/'/g, "\\'");
    const cmd = `import sys; from core import banco; banco.adicionar_credencial_site(${user_id}, '${servico}', '${login}', '${senha}', ${isCustom}, '${safeUrl}'); print('ok')`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao salvar credencial' });
        res.json({ success: true });
    });
});

// VAULT: Excluir credencial
app.delete('/api/credentials/:id', (req, res) => {
    const { id } = req.params;
    const { type } = req.query;
    const isCustom = type === 'custom' ? 'True' : 'False';
    const cmd = `from core import banco; banco.excluir_credencial(${id}, ${isCustom}); print('ok')`;
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao excluir' });
        res.json({ success: true });
    });
});

// HISTORY: Buscar histórico completo de relatórios (via Python banco.py)
app.get('/api/relatorios-history', (req, res) => {
    const limit = req.query.limit || 50;
    const { user_id } = req.query;
    // IMPORTANTE: Trata as strings vazias ou o literal "undefined" como None no Python
    const safeUserId = (user_id === 'undefined' || !user_id) ? 'None' : user_id;
    const cmd = `import sys, json; from core import banco; res = banco.listar_historico_relatorios(limit=${limit}, user_id=${safeUserId}); print(json.dumps(res))`;
    
    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) return res.status(500).json({ error: 'Erro ao buscar histórico' });
        try {
            const data = JSON.parse(stdout.trim());
            res.json(data);
        } catch (e) {
            res.status(500).json({ error: 'Erro no parse do histórico', details: stdout });
        }
    });
});

// DOWNLOAD: Servir arquivo de backup
app.get('/api/download', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado para download.' });
    }
    res.download(filePath);
});

// REVEAL: Abrir pasta do arquivo no explorer
app.get('/api/revelar-arquivo', (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
    // No Windows, explorer /select,path_do_arquivo abre a pasta com ele selecionado
    const cmd = `explorer /select,"${path.normalize(filePath)}"`;
    exec(cmd, (error) => {
        if (error) return res.status(500).json({ error: 'Erro ao abrir explorer' });
        res.json({ success: true });
    });
});

// CALCULATOR: Calcular elasticidade pax
app.post('/api/calculate-pax', (req, res) => {
    const { preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque } = req.body;

    // Comando Python chamando a função do paxcalc.py
    const cmd = `import sys, json; from automacoes.paxcalc import calculadora_elasticidade_pax; res = calculadora_elasticidade_pax(${preco_atual}, ${preco_novo}, ${pax_atual}, ${qtd_viagens}, ${capacidade}, ${km_rodado}, ${pedagio}, ${taxa_embarque}); print(json.dumps(res))`;

    exec(`"${PYTHON_PATH}" -c "${cmd}"`, { cwd: __dirname, encoding: 'utf8' }, (error, stdout, stderr) => {
        if (error) {
            console.error(`[CALC] Error: ${error.message} \nStderr: ${stderr}`);
            return res.status(500).json({ error: 'Erro no cálculo via Python', details: error.message });
        }
        try {
            const result = JSON.parse(stdout.trim());
            res.json({ success: true, result });
        } catch (e) {
            res.status(500).json({ error: 'Erro ao processar resultado do cálculo', details: stdout });
        }
    });
});

// Fallback para rotas não encontradas (Garante que nunca retorne HTML/404)
app.use((req, res) => {
    console.warn(`[SYSTEM] Rota não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Rota API não encontrada no backend.', path: req.url });
});

// Tratamento de erros globais (Garante que erros fatais retornem JSON)
app.use((err, req, res, next) => {
    console.error(`[SYSTEM] Erro interno:`, err);
    res.status(500).json({ error: 'Erro interno no backend Express.', details: err.message });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[SYSTEM] Backend Express rodando em http://127.0.0.1:${port}`);
    console.log(`[SYSTEM] Python Path: ${PYTHON_PATH}`);
});
