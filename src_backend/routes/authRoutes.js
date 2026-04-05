import { Router } from 'express';
import { runPythonCmd } from '../utils/pythonProxy.js';

const router = Router();

// LOGIN: Autenticar usuário
router.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const pyCmd = `import sys, json; from core.banco import login_principal; print(json.dumps(login_principal(sys.argv[1], sys.argv[2])))`;
        const result = await runPythonCmd(pyCmd, [usuario, senha]);

        if (Array.isArray(result) && result[0] !== null) {
            const [id, nome] = result;
            res.json({ success: true, user: { id, nome, usuario } });
        } else {
            res.json({ success: false, error: 'Usuário ou senha inválidos' });
        }
    } catch (e) {
        console.error(`[AUTH_ERROR] Falha no login: `, e.message);
        res.status(500).json({ success: false, error: 'Erro interno no banco de dados', details: e.message });
    }
});

// LOGIN: Criar novo usuário
router.post('/register', async (req, res) => {
    const { usuario, senha, nome } = req.body;
    const pyCmd = `import sys, json; from core.banco import cadastrar_usuario_principal; print(json.dumps(cadastrar_usuario_principal(sys.argv[1], sys.argv[2], sys.argv[3])))`;
    
    try {
        const result = await runPythonCmd(pyCmd, [nome || '', usuario, senha]);
        if (result === true) {
            res.json({ success: true });
        } else {
            // Em caso do python retornar false, geralmente usuário já existe
            res.json({ success: false, error: 'Usuário já existe ou ocorreu um erro interno' });
        }
    } catch (e) {
        console.error(`[AUTH_ERROR] Falha no registro: `, e.message);
        res.status(500).json({ success: false, error: 'Falha grave ao cadastrar', details: e.message });
    }
});

export default router;
