import express from 'express';
import fs from 'fs';
import path from 'path';
import got from 'got';
import { getRootDir } from '../config.js';
import { exec, spawn } from 'child_process';

const router = express.Router();
const GITHUB_REPO = 'GuilhermeRF29/Auto-Tools';
const BRANCH = 'main'; 
const VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/version.json`;
const ZIP_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/${BRANCH}.zip`;

router.get('/update/check', async (req, res) => {
  try {
    const localVersionPath = path.join(getRootDir(), 'version.json');
    let localVersion = { version: '0.0.0' };
    
    if (fs.existsSync(localVersionPath)) {
      localVersion = JSON.parse(fs.readFileSync(localVersionPath, 'utf8'));
    }

    const response = await got(VERSION_URL).json();
    const remoteVersion = response.version;

    const hasUpdate = remoteVersion !== localVersion.version;

    res.json({
      success: true,
      currentVersion: localVersion.version,
      remoteVersion,
      hasUpdate,
      description: response.description || ''
    });
  } catch (error) {
    console.error('[UPDATE] Falha ao verificar atualização:', error.message);
    res.status(500).json({ success: false, error: 'Falha ao verificar atualização no GitHub.' });
  }
});

router.post('/update/download', async (req, res) => {
  try {
    console.log('[UPDATE] Iniciando download da atualização...');
    // Aqui poderíamos baixar o zip, mas para simplificar o "Code Push", 
    // vamos apenas sinalizar que estamos prontos.
    // Em uma implementação real, baixaríamos o zip para uma pasta temporária aqui.
    
    res.json({ success: true, message: 'Preparado para atualizar.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/update/apply', async (req, res) => {
  const rootDir = getRootDir();
  const updaterScriptPath = path.join(rootDir, 'apply_update.ps1');
  const configPath = path.join(rootDir, 'update_config.json');
  const exePathStr = process.execPath;
  
  const tempZip = path.join(process.env.TEMP, 'autotools_update.zip');
  const tempExtract = path.join(process.env.TEMP, 'autotools_extracted');

  try {
    console.log(`[UPDATE] Baixando atualização de ${ZIP_URL}...`);
    const response = await got(ZIP_URL, { responseType: 'buffer' });
    fs.writeFileSync(tempZip, response.body);

    console.log('[UPDATE] Extraindo arquivos...');
    if (fs.existsSync(tempExtract)) {
      fs.rmSync(tempExtract, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtract, { recursive: true });

    // Usamos o PowerShell apenas para extrair enquanto o app ainda está vivo
    const extractArgs = ['-Command', `Expand-Archive -Path "${tempZip}" -DestinationPath "${tempExtract}" -Force`];
    await new Promise((resolve, reject) => {
      const ps = spawn('powershell.exe', extractArgs);
      ps.on('close', (code) => code === 0 ? resolve() : reject(new Error('Falha na extração')));
    });

    const configData = {
      exePath: exePathStr,
      tempExtract: tempExtract
    };
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

    const psScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$logPath = Join-Path $env:TEMP "autotools_update_log.txt"
Start-Transcript -Path $logPath -Force

$rootDir = $PSScriptRoot
$config = Get-Content -Raw -Path (Join-Path $rootDir "update_config.json") -Encoding UTF8 | ConvertFrom-Json
$exePath = $config.exePath
$tempExtract = $config.tempExtract

Write-Host "Encerrando Auto Tools..."
Stop-Process -Name "Auto Tools" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$extractedFolder = Get-ChildItem -Path $tempExtract | Select-Object -First 1
$sourceFolder = $extractedFolder.FullName

Write-Host "Aplicando atualizacao em $rootDir..."
cmd.exe /c "xcopy /E /Y /I /Q ""$sourceFolder\\*"" ""$rootDir\\"""

Write-Host "Limpando arquivos temporarios..."
Remove-Item -Path (Join-Path $rootDir "update_config.json") -Force -ErrorAction SilentlyContinue

Write-Host "Reiniciando Auto Tools..."
if ($exePath -match "electron\\.exe$") {
    Start-Process -FilePath "explorer.exe" -ArgumentList $rootDir
} else {
    # Start-Process é nativo e lida perfeitamente com Unicode
    Start-Process -FilePath $exePath -WorkingDirectory $rootDir
}

Write-Host "Atualizacao concluida!"
Stop-Transcript
`;

    fs.writeFileSync(updaterScriptPath, '\ufeff' + psScript, 'utf16le');

    res.json({ success: true, message: 'Arquivos preparados. Reiniciando agora...' });

    console.log('[UPDATE] Disparando script de aplicação final...');
    exec('start "" /B powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File apply_update.ps1', { 
      cwd: rootDir 
  });

  } catch (error) {
    console.error('[UPDATE] Erro no preparo da atualização:', error);
    res.status(500).json({ success: false, error: 'Erro ao baixar ou extrair arquivos.' });
  }
});

export default router;
