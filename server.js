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

app.use(express.json());

// Inicializar banco de dados ao subir o servidor
const initDbCmd = `from core import banco; banco.configurar_banco(); print('DB OK')`;
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
    const { name, ...params } = req.body;
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
        events: []
    };
    jobs.set(jobId, job);

    const logMsg = `[BACKEND] Job ${jobId} iniciado: ${scriptPath}\n`;
    fs.appendFileSync(path.join(__dirname, 'server_debug.log'), logMsg);

    // Passamos os parâmetros em Base64 via CLI para evitar problemas com caracteres e stdin
    const paramsBase64 = Buffer.from(JSON.stringify({ ...params, user_id: 1 })).toString('base64');

    const child = spawn(PYTHON_PATH, ['-u', scriptPath, paramsBase64], {
        cwd: __dirname,
        env: { 
            ...process.env, 
            PYTHONIOENCODING: 'utf8', 
            PYTHONUNBUFFERED: '1',
            PYTHONPATH: __dirname
        }
    });
    job.process = child;


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
        
        if (job.status === 'failed') {
            job.message = "Erro na execução da automação.";
        } else {
            job.progress = 100;
            job.message = "Concluído com sucesso!";
        }

        const lastLine = job.output.trim().split('\n').pop();
        job.events.forEach(res => {
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


// Rota para baixar arquivos (Segurança mínima: apenas permitir da pasta Downloads ou subpastas seguras)
app.get('/api/download', (req, res) => {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send('Caminho não fornecido');
    
    // Validar se o arquivo existe e está em local permitido
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Arquivo não encontrado no servidor: ' + filePath);
    }

    res.download(filePath);
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
