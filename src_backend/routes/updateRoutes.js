import express from 'express';
import fs from 'fs';
import path from 'path';
import got from 'got';
import { getRootDir } from '../config.js';
import { spawn } from 'child_process';

const router = express.Router();
const GITHUB_REPO = 'GuilhermeRF29/Auto-Tools'; // Ajustar conforme necessário
const VERSION_URL = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/version.json`;
const ZIP_URL = `https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip`;

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

router.post('/update/apply', (req, res) => {
  const rootDir = getRootDir();
  const updaterScriptPath = path.join(rootDir, 'apply_update.ps1');
  const configPath = path.join(rootDir, 'update_config.json');
  const exePathStr = process.execPath;

  const configData = {
    repo: GITHUB_REPO,
    zipUrl: ZIP_URL,
    destDir: rootDir,
    exePath: exePathStr
  };
  fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');

  const psScript = `
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$logPath = Join-Path $env:TEMP "autotools_update_log.txt"
Start-Transcript -Path $logPath -Force

$configPath = "${configPath}"
$config = Get-Content -Raw -Path $configPath | ConvertFrom-Json

$repo = $config.repo
$zipUrl = $config.zipUrl
$destDir = $config.destDir
$exePath = $config.exePath

Write-Host "Aguardando resposta do servidor..."
Start-Sleep -Seconds 2
Write-Host "Encerrando Auto Tools..."
Stop-Process -Name "Auto Tools" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$tempZip = Join-Path $env:TEMP "autotools_update.zip"
$tempExtract = Join-Path $env:TEMP "autotools_extracted"

Write-Host "Baixando atualizacao de $zipUrl..."
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

Write-Host "Extraindo arquivos..."
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
Expand-Archive -Path $tempZip -DestinationPath $tempExtract

$extractedFolder = Get-ChildItem -Path $tempExtract | Select-Object -First 1
$sourceFolder = $extractedFolder.FullName

Write-Host "Aplicando atualizacao em $destDir..."
cmd.exe /c "xcopy /E /Y /I /Q ""$sourceFolder\\*"" ""$destDir\\"""

Write-Host "Limpando arquivos temporarios..."
Remove-Item $tempZip
Remove-Item -Recurse $tempExtract

Write-Host "Reiniciando Auto Tools..."
if ($exePath -match "electron\\.exe$") {
    Start-Process -FilePath "explorer.exe" -ArgumentList $destDir
} elseif (Test-Path $exePath) {
    Start-Process -FilePath $exePath
} else {
    Start-Process -FilePath "explorer.exe" -ArgumentList $destDir
}
Write-Host "Atualizacao concluida!"
Stop-Transcript
\`;

  // Salvamos como UTF-8 normal. Apenas o caminho do config vai no corpo e não é problemático se tratado assim
  // Porém, adicionaremos UTF-8 BOM para garantir!
  fs.writeFileSync(updaterScriptPath, '\\ufeff' + psScript, 'utf8');

  res.json({ success: true, message: 'Reiniciando para aplicar atualização...' });

  console.log('[UPDATE] Disparando script de atualização via exec start independente...');
  // A chamada do PowerShell é pura, sem argumentos com caminhos, evitando que o cmd.exe quebre o Unicode.
  exec(\`start "" /B powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File "\${updaterScriptPath}"\`);
});

export default router;
