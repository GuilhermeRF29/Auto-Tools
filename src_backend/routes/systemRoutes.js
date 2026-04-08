import { Router } from 'express';
import { runPythonCmd, execCmd, spawnPythonScript } from '../utils/pythonProxy.js';
import { getRootDir } from '../config.js';
import path from 'path';
import fs from 'fs';

const router = Router();

const runExtensionConverter = (payloadBase64) => {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(getRootDir(), 'automacoes', 'extension_converter.py');
        const child = spawnPythonScript(scriptPath, [payloadBase64]);

        let stdoutData = '';
        let stderrData = '';

        child.stdout.on('data', (chunk) => {
            stdoutData += chunk.toString();
        });

        child.stderr.on('data', (chunk) => {
            stderrData += chunk.toString();
        });

        child.on('close', (code) => {
            const lines = stdoutData
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean);
            const lastLine = lines[lines.length - 1] || '';

            if (!lastLine) {
                return reject(new Error(stderrData || `Conversor sem resposta (exit=${code}).`));
            }

            try {
                resolve(JSON.parse(lastLine));
            } catch {
                reject(new Error(stderrData || `Resposta inválida do conversor: ${lastLine.slice(0, 240)}`));
            }
        });
    });
};

// EXPLORER: Abrir explorador de pastas do Windows nativo
router.get('/abrir-explorador-pastas', async (req, res) => {
    const script = `import tkinter as tk; from tkinter import filedialog; import json, os; root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); p=filedialog.askdirectory(title='Selecione a Pasta'); root.destroy(); print(json.dumps({'caminho': os.path.normpath(p) if p else ''}))`;
    
    try {
        const result = await runPythonCmd(script, []);
        res.json(result);
    } catch (e) {
        console.error(`[EXPLORER_ERROR]`, e);
        res.json({ caminho: '' });
    }
});

// EXPLORER: Abrir seletor nativo de arquivos Excel
router.get('/abrir-explorador-arquivos-excel', async (req, res) => {
    const script = `import tkinter as tk; from tkinter import filedialog; import json, os; root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); f=filedialog.askopenfilenames(title='Selecione os arquivos Excel', filetypes=[('Arquivos Excel', '*.xlsx *.xls *.xlsm')]); root.destroy(); paths=[os.path.normpath(p) for p in f if p]; print(json.dumps({'caminhos': paths}))`;

    try {
        const result = await runPythonCmd(script, []);
        res.json(result);
    } catch (e) {
        console.error(`[EXPLORER_FILES_ERROR]`, e);
        res.json({ caminhos: [] });
    }
});

// TOOLS: Conversor de extensoes (Excel -> Parquet/SQLite)
router.post('/tools/extension-converter', async (req, res) => {
    const {
        files = [],
        outputDir = '',
        formatType = 'parquet',
        parquetMode = 'individual',
        dbName = 'database.db'
    } = req.body || {};

    if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ success: false, messages: ['Selecione ao menos um arquivo Excel.'] });
    }

    if (typeof outputDir !== 'string' || !outputDir.trim()) {
        return res.status(400).json({ success: false, messages: ['Selecione a pasta de destino.'] });
    }

    try {
        const payload = {
            files,
            outputDir,
            formatType,
            parquetMode,
            dbName,
        };
        const payloadBase64 = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
        const result = await runExtensionConverter(payloadBase64);

        if (!result?.success) {
            return res.status(400).json(result);
        }

        return res.json(result);
    } catch (e) {
        console.error('[TOOLS_CONVERTER_ERROR]', e);
        return res.status(500).json({
            success: false,
            messages: ['Falha ao executar o conversor no backend.'],
            error: e.message,
        });
    }
});

// ONIBUS: Listar
router.get('/onibus', async (req, res) => {
    const pyCmd = `import sys; from core.banco import listar_onibus; print(listar_onibus())`;
    try {
        // O output de listar_onibus vem como string repr de lista de tuplas. Precisamos arrumar caso o python proxy nao falhe.
        // O python proxy tenta fazer parse ou devolver bruto.
        const raw = await runPythonCmd(pyCmd, []);
        if (typeof raw === 'string') {
            const formatted = raw.replace(/\(/g, '[').replace(/\)/g, ']').replace(/'/g, '"');
            res.json(JSON.parse(formatted));
        } else {
            res.json(raw);
        }
    } catch (e) {
        res.json([]);
    }
});

// ONIBUS: Salvar
router.post('/onibus', async (req, res) => {
    const { nome, capacidade } = req.body;
    const pyCmd = `import sys; from core.banco import salvar_onibus; salvar_onibus(sys.argv[1], int(sys.argv[2])); print('ok')`;
    try {
        await runPythonCmd(pyCmd, [nome, capacidade.toString()]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao salvar ônibus' });
    }
});

// REVEAL: Abrir arquivo no explorer
router.get('/revelar-arquivo', async (req, res) => {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado.' });
    }
    const cmd = `explorer /select,"${path.normalize(filePath)}"`;
    try {
        await execCmd(cmd);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao abrir explorer' });
    }
});

// CALCULATOR: Pax Elasticidade
router.post('/calculate-pax', async (req, res) => {
    const { preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque } = req.body;
    const pyCmd = `import sys, json; from automacoes.paxcalc import calculadora_elasticidade_pax; res = calculadora_elasticidade_pax(*map(float, sys.argv[1:])); print(json.dumps(res))`;
    try {
        const result = await runPythonCmd(pyCmd, [
            preco_atual, preco_novo, pax_atual, qtd_viagens, capacidade, km_rodado, pedagio, taxa_embarque
        ]);
        res.json({ success: true, result });
    } catch (e) {
        res.status(500).json({ error: 'Erro no cálculo do Pax' });
    }
});

// CLEAN: Limpeza de backups antigos
router.post('/clean-backups', async (req, res) => {
    const pyCmd = `import sys, json, os; from core import banco; files = banco.excluir_historico_antigo(30); [os.remove(f) for f in files if os.path.exists(f)]; print('ok')`;
    try {
        await runPythonCmd(pyCmd, []);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false });
    }
});

export default router;
