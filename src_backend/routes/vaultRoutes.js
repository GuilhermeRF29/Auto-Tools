import { Router } from 'express';
import { runPythonCmd } from '../utils/pythonProxy.js';

const router = Router();

// VAULT: Listar credenciais
router.get('/:user_id', async (req, res) => {
    const { user_id } = req.params;
    const pyCmd = `import sys, json; from core.banco import listar_credenciais; print(json.dumps(listar_credenciais(int(sys.argv[1]))))`;
    try {
        const result = await runPythonCmd(pyCmd, [user_id]);
        res.json(result);
    } catch (e) {
        console.error(`[VAULT_ERROR] Falha ao buscar credenciais: `, e.message);
        res.status(500).json({ error: 'Erro ao buscar credenciais' });
    }
});

// VAULT: Salvar credencial
router.post('/', async (req, res) => {
    const { user_id, servico, login, senha, eh_personalizado, url } = req.body;
    const pyCmd = `import sys; from core.banco import adicionar_credencial_site; adicionar_credencial_site(int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5] == 'True', sys.argv[6]); print('ok')`;
    
    try {
        await runPythonCmd(pyCmd, [
            user_id.toString(), servico, login, senha, eh_personalizado ? 'True' : 'False', url || ''
        ]);
        res.json({ success: true });
    } catch (e) {
        console.error(`[VAULT_ERROR] Falha ao salvar: `, e.message);
        res.status(500).json({ error: 'Erro ao salvar credencial' });
    }
});

// VAULT: Excluir credencial
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const { type } = req.query;
    const pyCmd = `import sys; from core.banco import excluir_credencial; excluir_credencial(int(sys.argv[1]), sys.argv[2] == 'True'); print('ok')`;
    
    try {
        await runPythonCmd(pyCmd, [id, type === 'custom' ? 'True' : 'False']);
        res.json({ success: true });
    } catch (e) {
        console.error(`[VAULT_ERROR] Falha ao excluir: `, e.message);
        res.status(500).json({ error: 'Erro ao excluir' });
    }
});

export default router;
