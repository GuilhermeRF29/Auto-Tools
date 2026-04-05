import { Router } from 'express';
import { runPythonCmd, execCmd } from '../utils/pythonProxy.js';
import path from 'path';
import fs from 'fs';

const router = Router();

// EXPLORER: Abrir explorador de pastas do Windows nativo
router.get('/abrir-explorador-pastas', async (req, res) => {
    const script = `import tkinter as tk; from tkinter import filedialog; import json, os; root=tk.Tk(); root.withdraw(); root.attributes('-topmost', True); p=filedialog.askdirectory(title='Selecione a Pasta'); root.destroy(); print(json.dumps({'caminho': os.path.normpath(p).replace('\\\\', '\\\\\\\\') if p else ''}))`;
    
    try {
        const result = await runPythonCmd(script, []);
        res.json(result);
    } catch (e) {
        console.error(`[EXPLORER_ERROR]`, e);
        res.json({ caminho: '' });
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
