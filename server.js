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
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPythonCmd } from './src_backend/utils/pythonProxy.js';
import { PYTHON_PATH, getRootDir } from './src_backend/config.js';
import { requireAuth, setupAuthRoutes } from './src_backend/middleware/authMiddleware.js';

import { getDb } from './src_backend/db/sqliteNative.js';

// Route imports
import vaultRoutes from './src_backend/routes/vaultRoutes.js';
import systemRoutes from './src_backend/routes/systemRoutes.js';
import automationRoutes from './src_backend/routes/automationRoutes.js';
import dashboardRoutes from './src_backend/routes/dashboardRoutes.js';
import webauthnRoutes from './src_backend/routes/webauthnRoutes.js';
import settingsRoutes from './src_backend/routes/settingsRoutes.js';
import deviceAccessRoutes, { deviceAccessGuard } from './src_backend/routes/deviceAccessRoutes.js';
import tunnelRoutes, { initTunnel, shutdownTunnel } from './src_backend/routes/tunnelRoutes.js';
import updateRoutes from './src_backend/routes/updateRoutes.js';

const app = express();
const port = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const distIndexPath = path.join(distDir, 'index.html');
const canServeFrontend = fs.existsSync(distIndexPath);

process.env.AUTOTOOLS_SERVER_PORT = String(port);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://*", "wss://*"]
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true }
}));

app.use(cors({
  origin: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json({ limit: '80mb' }));
app.use(cookieParser());

// Setup auth routes (login/logout/me) antes do middleware de proteção
setupAuthRoutes(app);

// Inicializar banco de dados e limpar histórico
const initDbCmd = `import os; from core import banco; banco.configurar_banco(); banco.sincronizar_usuarios_firebase_para_local(); l = banco.excluir_historico_antigo(dias=30); [os.remove(p) for p in l if os.path.exists(p)]; print('ok')`;
runPythonCmd(initDbCmd).then(() => {
    console.log(`[SYSTEM] Banco de dados verificado/inicializado.`);
}).catch((e) => {
    console.error(`[SYSTEM] ERRO CRÍTICO ao inicializar banco: ${e.message}`);
    console.error(`[SYSTEM] Verifique se o Python Path (${PYTHON_PATH}) é válido.`);
});

app.get('/api/status', async (req, res) => {
    try {
        const native = getDb();
        const dbResult = native.healthCheck();
        const dbStatus = dbResult?.status === 'ok' ? 'ok' : 'error';

        const localVersionPath = path.join(getRootDir(), 'version.json');
        let localVersion = { version: '1.5.0' };
        try {
            if (fs.existsSync(localVersionPath)) {
                localVersion = JSON.parse(fs.readFileSync(localVersionPath, 'utf8'));
            }
        } catch (e) {
            console.error('[SYSTEM] Erro ao ler version.json:', e.message);
        }

        return res.json({
            status: dbStatus === 'ok' ? 'ok' : 'degraded',
            version: `v${localVersion.version}`,
            python: PYTHON_PATH,
            dbStatus,
            dbMessage: dbResult?.message || 'Sem resposta da checagem de banco.',
            checkedAt: new Date().toISOString(),
        });
    } catch (e) {
        return res.status(503).json({
            status: 'offline',
            version: 'v1.5.0 (Offline)',
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
// WebAuthn precisa ser público para o login funcionar
app.use('/api', webauthnRoutes);

// Rotas públicas (não exigem token JWT)
app.use('/api/system', updateRoutes);

// Rotas protegidas
app.use('/api', requireAuth, systemRoutes);
app.use('/api', requireAuth, settingsRoutes);
app.use('/api', requireAuth, tunnelRoutes);

// APIs protegidas por autenticação
app.use('/api/credentials', requireAuth, vaultRoutes);
app.use('/api', requireAuth, automationRoutes);
app.use('/api', requireAuth, dashboardRoutes);

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

const server = app.listen(port, '0.0.0.0', () => {
    console.log(`[SYSTEM] Backend Express rodando em http://127.0.0.1:${port}`);
    console.log(`[SYSTEM] Python Path: ${PYTHON_PATH}`);
    // Inicia o túnel se estava ativado
    initTunnel();
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`[SYSTEM] PORTA ${port} JÁ EM USO. Tentando limpar processos anteriores...`);
        // O Electron matará este processo em seguida, mas avisamos o motivo no log
    } else {
        console.error(`[SYSTEM] Erro ao iniciar servidor Express:`, err);
    }
});

// Tratamento para fechar o túnel ao encerrar o servidor (evita processos zumbis)
const gracefulShutdown = () => {
    console.log('[SYSTEM] Encerrando servidor e limpando túneis...');
    try {
        shutdownTunnel();
    } catch (e) {
        console.error('[SYSTEM] Erro ao fechar túneis:', e.message);
    }
    setTimeout(() => process.exit(0), 500);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
