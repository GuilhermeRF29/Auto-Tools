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

    const pyCmd = `
import sys, json, sqlite3
from core.banco import DB_PATH

user_id = int(sys.argv[1])
conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Criar tabela se não existir (migração segura)
cursor.execute('''CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT,
    UNIQUE(user_id, chave)
)''')
conn.commit()

# Buscar todas as configurações do usuário
cursor.execute("SELECT chave, valor FROM configuracoes WHERE user_id = ?", (user_id,))
rows = cursor.fetchall()
conn.close()

result = {}
for chave, valor in rows:
    try:
        result[chave] = json.loads(valor)
    except (json.JSONDecodeError, TypeError):
        result[chave] = valor

print(json.dumps(result))
`;

    try {
        const result = await runPythonCmd(pyCmd, [userId]);
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

    const pyCmd = `
import sys, json, sqlite3
from core.banco import DB_PATH

user_id = int(sys.argv[1])
chave = sys.argv[2]
valor_json = sys.argv[3]

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Criar tabela se não existir
cursor.execute('''CREATE TABLE IF NOT EXISTS configuracoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    chave TEXT NOT NULL,
    valor TEXT,
    UNIQUE(user_id, chave)
)''')

# Upsert: INSERT OR REPLACE
cursor.execute(
    "INSERT OR REPLACE INTO configuracoes (user_id, chave, valor) VALUES (?, ?, ?)",
    (user_id, chave, valor_json)
)
conn.commit()
conn.close()
print('ok')
`;

    try {
        await runPythonCmd(pyCmd, [userId, key, JSON.stringify(value)]);
        res.json({ success: true });
    } catch (e) {
        console.error('[SETTINGS_SAVE_ERROR]', e.message);
        res.status(500).json({ error: 'Erro ao salvar configuração.' });
    }
});

export default router;
