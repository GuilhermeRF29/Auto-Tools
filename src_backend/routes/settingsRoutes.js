/**
 * @module settingsRoutes
 * @description Rotas para gerenciamento de configurações persistentes do sistema.
 * 
 * Utiliza uma tabela `configuracoes` no SQLite para armazenar pares chave-valor.
 * As configurações são salvas por usuário (user_id) e carregadas no login.
 * 
 * Configurações suportadas:
 *   - basePaths: Caminhos base dos dashboards (Revenue, Demanda, Rio, Channel)
 */

import { Router } from 'express';
import { runPythonCmd } from '../utils/pythonProxy.js';

const router = Router();

/**
 * GET /settings/:userId — Carrega todas as configurações de um usuário.
 * Retorna um objeto com chave-valor das configurações salvas.
 */
router.get('/settings/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        const pyCmd = `import sys, json; from core.banco import listar_configuracoes; print(json.dumps(listar_configuracoes(int(sys.argv[1])), ensure_ascii=False))`;
        const result = await runPythonCmd(pyCmd, [String(userId)]);
        res.json({ success: true, settings: result || {} });
    } catch (e) {
        console.error('[SETTINGS_LOAD_ERROR]', e.message);
        res.json({ success: true, settings: {} });
    }
});

/**
 * POST /settings/:userId — Salva uma configuração para um usuário.
 * Body: { key: string, value: any }
 */
router.post('/settings/:userId', async (req, res) => {
    const { userId } = req.params;
    const { key, value } = req.body;

    if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Chave de configuração inválida.' });
    }

    try {
        const pyCmd = `import sys, json; from core.banco import salvar_configuracao; print(json.dumps(salvar_configuracao(int(sys.argv[1]), sys.argv[2], sys.argv[3])))`;
        await runPythonCmd(pyCmd, [String(userId), key, JSON.stringify(value)]);
        res.json({ success: true });
    } catch (e) {
        console.error('[SETTINGS_SAVE_ERROR]', e.message);
        res.status(500).json({ error: 'Erro ao salvar configuração.' });
    }
});

export default router;
