import { Router } from 'express';
import { runPythonCmd } from '../utils/pythonProxy.js';
import { getDb } from '../db/sqliteNative.js';

const router = Router();

// LOGIN: Autenticar usuário (primeiro tenta NativeSQLite, fallback Python)
router.post('/login', async (req, res) => {
    const { usuario, senha } = req.body;
    try {
        const native = getDb();
        const user = native.validateLogin(usuario, senha);
        if (user) {
            return res.json({ success: true, user: { id: user.id, nome: user.nome, usuario } });
        }
        return res.json({ success: false, error: 'Usuário ou senha inválidos' });
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
        const checkFire = `from core import banco; print('true' if bool(banco.get_firestore()) else 'false')`;
        const fireAvailable = await runPythonCmd(checkFire);
        if (!fireAvailable) {
            return res.status(503).json({ success: false, error: 'Registro apenas disponível com conexão ativa ao servidor (requer Firebase).' });
        }

        const result = await runPythonCmd(pyCmd, [nome || '', usuario, senha]);
        if (result === true) {
            res.json({ success: true });
        } else {
            res.json({ success: false, error: 'Usuário já existe' });
        }
    } catch (e) {
        console.error(`[AUTH_ERROR] Falha no registro: `, e.message);
        res.status(500).json({ success: false, error: 'Falha grave ao cadastrar', details: e.message });
    }
});

export default router;
