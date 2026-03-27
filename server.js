import express from 'express';
import { exec } from 'child_process';
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
  res.json({ status: 'ok', version: '1.5.2-FINAL-V3', python: PYTHON_PATH });
});

// Rota para rodar automações
app.post('/api/run-automation', (req, res) => {
  const { name } = req.body;
  
  let scriptPath = '';
  // Mapeamento de nomes do Frontend para scripts Python
  if (name.includes('Vendas')) scriptPath = path.join('automacoes', 'sr_new.py');
  else if (name.includes('Fechamento')) scriptPath = path.join('automacoes', 'ebus_new.py');
  else if (name.includes('Taxas')) scriptPath = path.join('automacoes', 'adm_new.py');
  else if (name.includes('Cotação')) scriptPath = path.join('automacoes', 'paxcalc.py');

  if (!scriptPath) {
    return res.status(400).json({ error: 'Nenhuma automação mapeada para este nome.' });
  }

  console.log(`[BACKEND] Iniciando execução: ${scriptPath}`);
  
  exec(`"${PYTHON_PATH}" "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[ERRO] ${error.message}`);
      return res.status(500).json({ error: 'Erro durante execução da automação.', details: stderr });
    }
    console.log(`[SUCESSO] ${scriptPath} finalizado.`);
    res.json({ success: true, message: 'Automação concluída com sucesso.', output: stdout });
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
