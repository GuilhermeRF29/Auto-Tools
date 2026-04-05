import express from 'express';
import { runPythonCmd } from './src_backend/utils/pythonProxy.js';
import { PYTHON_PATH } from './src_backend/config.js';

// Route imports
import authRoutes from './src_backend/routes/authRoutes.js';
import vaultRoutes from './src_backend/routes/vaultRoutes.js';
import systemRoutes from './src_backend/routes/systemRoutes.js';
import automationRoutes from './src_backend/routes/automationRoutes.js';
import dashboardRoutes from './src_backend/routes/dashboardRoutes.js';

const app = express();
const port = 3001;

app.use(express.json());

// Inicializar banco de dados e limpar histórico
const initDbCmd = `import os; from core import banco; banco.configurar_banco(); l = banco.excluir_historico_antigo(dias=30); [os.remove(p) for p in l if os.path.exists(p)]; print('ok')`;
runPythonCmd(initDbCmd).then(() => {
    console.log(`[SYSTEM] Banco de dados verificado/inicializado.`);
}).catch((e) => {
    console.error(`[SYSTEM] Erro ao inicializar banco: ${e.message}`);
});

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', version: 'AutoTools API v3.0 (Modular)', python: PYTHON_PATH });
});

// APIs modulares
app.use('/api', authRoutes);
app.use('/api/credentials', vaultRoutes);
app.use('/api', systemRoutes);
app.use('/api', automationRoutes);

// Dashboards e relatorios (demanda, revenue)
app.use('/api', dashboardRoutes);

// Fallback para rotas não encontradas
app.use((req, res) => {
    console.warn(`[SYSTEM] Rota não encontrada: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Rota API não encontrada no backend modular.', path: req.url });
});

// Tratamento de erros globais
app.use((err, req, res, next) => {
    console.error(`[SYSTEM] Erro interno:`, err);
    res.status(500).json({ error: 'Erro interno no backend Express.', details: err.message });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`[SYSTEM] Backend Express rodando em http://127.0.0.1:${port}`);
    console.log(`[SYSTEM] Python Path: ${PYTHON_PATH}`);
});
