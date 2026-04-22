/**
 * @module server
 * @description Ponto de entrada principal do backend Auto Tools.
 * 
 * Fluxo de inicialização:
 *   1. Configura Express com JSON body parser
 *   2. Inicializa banco SQLite e limpa histórico antigo (>30 dias)
 *   3. Monta rotas modulares sob /api
 *   4. Escuta na porta 3001
 * 
 * Em desenvolvimento, o Vite (porta 3000) faz proxy das chamadas /api
 * para este servidor (porta 3001) via vite.config.ts.
 * 
 * Para produção/Electron: servir o build estático do frontend
 * diretamente pelo Express com express.static('dist').
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPythonCmd } from './src_backend/utils/pythonProxy.js';
import { PYTHON_PATH } from './src_backend/config.js';

// Route imports
import authRoutes from './src_backend/routes/authRoutes.js';
import vaultRoutes from './src_backend/routes/vaultRoutes.js';
import systemRoutes from './src_backend/routes/systemRoutes.js';
import automationRoutes from './src_backend/routes/automationRoutes.js';
import dashboardRoutes from './src_backend/routes/dashboardRoutes.js';
import webauthnRoutes from './src_backend/routes/webauthnRoutes.js';
import settingsRoutes from './src_backend/routes/settingsRoutes.js';
import deviceAccessRoutes, { deviceAccessGuard } from './src_backend/routes/deviceAccessRoutes.js';

const app = express();
const port = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const canServeFrontend = fs.existsSync(distIndexPath);

process.env.AUTOTOOLS_SERVER_PORT = String(port);

app.use(express.json());

// Inicializar banco de dados e limpar histórico
const initDbCmd = `import os; from core import banco; banco.configurar_banco(); l = banco.excluir_historico_antigo(dias=30); [os.remove(p) for p in l if os.path.exists(p)]; print('ok')`;
runPythonCmd(initDbCmd).then(() => {
    console.log(`[SYSTEM] Banco de dados verificado/inicializado.`);
}).catch((e) => {
    console.error(`[SYSTEM] Erro ao inicializar banco: ${e.message}`);
});

app.get('/api/status', async (req, res) => {
    try {
        const dbCheckCmd = `import json, sqlite3; from core.banco import DB_PATH\nstatus='ok'\nmessage='Conexao validada'\ntry:\n    conn=sqlite3.connect(DB_PATH)\n    conn.execute('SELECT 1')\n    conn.close()\nexcept Exception as e:\n    status='error'\n    message=str(e)\nprint(json.dumps({'dbStatus': status, 'dbMessage': message}))`;
        const dbResult = await runPythonCmd(dbCheckCmd);
        const dbStatus = dbResult?.dbStatus === 'ok' ? 'ok' : 'error';

        return res.json({
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            version: 'AutoTools API v3.0 (Modular)',
            python: PYTHON_PATH,
            dbStatus,
            dbMessage: dbResult?.dbMessage || 'Sem resposta da checagem de banco.',
            checkedAt: new Date().toISOString(),
        });
    } catch (e) {
        return res.status(503).json({
            status: 'offline',
            version: 'AutoTools API v3.0 (Modular)',
            python: PYTHON_PATH,
            dbStatus: 'offline',
            dbMessage: e?.message || 'Falha ao verificar conexão do banco.',
            checkedAt: new Date().toISOString(),
        });
    }
});

// Protecao central para acesso remoto/dispositivos.
app.use('/api', deviceAccessGuard);
app.use('/api', deviceAccessRoutes);

// APIs modulares
app.use('/api', authRoutes);
app.use('/api/credentials', vaultRoutes);
app.use('/api', systemRoutes);
app.use('/api', automationRoutes);
app.use('/api', webauthnRoutes);
app.use('/api', settingsRoutes);

// Dashboards e relatorios (demanda, revenue, market share)
app.use('/api', dashboardRoutes);

// Fallback exclusivo da API
app.use('/api', (req, res) => {
    console.warn(`[SYSTEM] Rota API não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Rota API não encontrada no backend modular.', path: req.url });
});

if (canServeFrontend) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api).*/, (req, res) => {
        res.sendFile(distIndexPath);
    });
}

// Fallback geral para rotas não encontradas fora da API
app.use((req, res) => {
    console.warn(`[SYSTEM] Rota não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Rota não encontrada.', path: req.url });
});

// Tratamento de erros globais
app.use((err, req, res, next) => {
    console.error(`[SYSTEM] Erro interno:`, err);
    res.status(500).json({ error: 'Erro interno no backend Express.', details: err.message });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[SYSTEM] Backend Express rodando em http://127.0.0.1:${port}`);
    console.log(`[SYSTEM] Python Path: ${PYTHON_PATH}`);
    if (canServeFrontend) {
        console.log(`[SYSTEM] Frontend estático habilitado em: ${distDir}`);
    } else {
        console.log(`[SYSTEM] Frontend estático não encontrado (dist/index.html ausente).`);
    }
});
