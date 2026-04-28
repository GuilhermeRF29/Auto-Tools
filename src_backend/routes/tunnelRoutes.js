import { Router } from 'express';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { getRootDir } from '../config.js';

const router = Router();

// Estado interno do túnel
let currentTunnelUrl = null;
let isStarting = false;
let tunnelProcess = null; // Guarda o processo do cloudflared

const CONFIG_PATH = path.join(getRootDir(), 'src_backend', 'data', 'remote_access_config.json');

// Função para ler config
const readConfig = () => {
    try {
        if (!fs.existsSync(path.dirname(CONFIG_PATH))) {
            fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
        }
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        }
    } catch (e) {
        console.error('[REMOTE_CONFIG_READ_ERROR]', e);
    }
    return { autoStart: false };
};

// Função para salvar config
const saveConfig = (config) => {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (e) {
        console.error('[REMOTE_CONFIG_SAVE_ERROR]', e);
    }
};

router.get('/tunnel/status', (req, res) => {
    const config = readConfig();
    res.json({
        isActive: !!currentTunnelUrl,
        url: currentTunnelUrl,
        isStarting,
        hasAuthtoken: true,
        autoStart: config.autoStart
    });
});

const startTunnelLogic = async (port) => {
    if (isStarting) return;
    
    isStarting = true;
    if (tunnelProcess) {
        shutdownTunnel();
    }

    console.log(`[CLOUDFLARE] Iniciando túnel seguro na porta ${port}...`);
    
    // Tenta encontrar um binário local primeiro (para máquinas sem Node/npx)
    const binDir = path.join(getRootDir(), 'bin');
    const localCloudflared = path.join(binDir, 'cloudflared.exe');
    
    const isWin = process.platform === 'win32';
    let cmd, args;
    if (fs.existsSync(localCloudflared)) {
        console.log('[CLOUDFLARE] Usando binário local:', localCloudflared);
        cmd = localCloudflared;
        args = ['tunnel', '--url', `http://127.0.0.1:${port}`];
    } else {
        console.log('[CLOUDFLARE] npx cloudflared (pode falhar se Node não estiver instalado)');
        cmd = isWin ? 'npx.cmd' : 'npx';
        args = ['-y', 'cloudflared', 'tunnel', '--url', `http://127.0.0.1:${port}`];
    }

    tunnelProcess = spawn(cmd, args, {
        shell: false,
        windowsHide: true
    });

    tunnelProcess.on('error', (err) => {
        console.error('[CLOUDFLARE] Erro ao disparar processo:', err.message);
        isStarting = false;
    });

    const urlRegex = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/;
    
    const handleOutput = (data) => {
        const output = data.toString();
        const match = output.match(urlRegex);
        if (match && !currentTunnelUrl) {
            currentTunnelUrl = match[0];
            console.log('[CLOUDFLARE] Sucesso! Acesso liberado em:', currentTunnelUrl);
            isStarting = false;
        }
    };

    tunnelProcess.stdout.on('data', handleOutput);
    tunnelProcess.stderr.on('data', handleOutput);

    tunnelProcess.on('close', () => {
        currentTunnelUrl = null;
        tunnelProcess = null;
        isStarting = false;
    });

    // Garante que se o Node morrer subitamente, tentamos avisar o sistema
    tunnelProcess.unref(); 
};

router.post('/tunnel/start', async (req, res) => {
    const port = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);

    if (isStarting && !currentTunnelUrl) return res.status(409).json({ error: 'Acesso seguro já está iniciando.' });

    try {
        if (!currentTunnelUrl) {
            await startTunnelLogic(port);
            
            // Aguarda a URL ser capturada
            let checkCount = 0;
            while (isStarting && checkCount < 60) {
                await new Promise(r => setTimeout(r, 500));
                checkCount++;
            }
        }

        // Salva a preferência de autoStart
        saveConfig({ autoStart: true });

        if (currentTunnelUrl) {
            res.json({ success: true, url: currentTunnelUrl });
        } else {
            throw new Error('Timeout ao obter link da Cloudflare.');
        }

    } catch (e) {
        isStarting = false;
        res.status(500).json({ error: 'Falha ao iniciar Acesso Cloudflare', details: e.message });
    }
});

router.post('/tunnel/stop', async (req, res) => {
    try {
        shutdownTunnel();
        saveConfig({ autoStart: false });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Falha ao parar acesso', details: e.message });
    }
});

// Inicialização automática ao ligar o servidor
export const initTunnel = async () => {
    const config = readConfig();
    if (config.autoStart) {
        const port = Number(process.env.AUTOTOOLS_SERVER_PORT || 3001);
        console.log('[REMOTE] Auto-iniciando acesso remoto...');
        startTunnelLogic(port);
    }
};

// Finalização forçada para evitar zumbis (mata a árvore de processos no Windows)
export const shutdownTunnel = () => {
    if (tunnelProcess) {
        const pid = tunnelProcess.pid;
        console.log(`[REMOTE] Finalizando árvore de processos do túnel (PID ${pid})...`);
        
        try {
            if (process.platform === 'win32') {
                // Mata o processo e todos os seus filhos (/T) de forma forçada (/F)
                spawn('taskkill', ['/F', '/T', '/PID', pid.toString()], { shell: false });
            } else {
                tunnelProcess.kill('SIGKILL');
            }
        } catch (e) {
            console.error('[REMOTE] Erro ao matar processo:', e.message);
        }
        
        tunnelProcess = null;
        currentTunnelUrl = null;
        isStarting = false;
    }
};

export const getTunnelUrl = () => currentTunnelUrl;

export default router;
