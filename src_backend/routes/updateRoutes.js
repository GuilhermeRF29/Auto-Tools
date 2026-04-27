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
    const localVersion = JSON.parse(fs.readFileSync(localVersionPath, 'utf8'));

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

  // Script PowerShell que:
  // 1. Espera o processo atual fechar
  // 2. Faz o download do zip (ou usa o já baixado)
  // 3. Extrai e sobrescreve
  // 4. Reinicia o app
  const psScript = `
$ErrorActionPreference = 'Stop'
Write-Host "Aguardando encerramento do Auto Tools..."
Start-Sleep -Seconds 2

$repo = "${GITHUB_REPO}"
$zipUrl = "${ZIP_URL}"
$destDir = "${rootDir}"
$tempZip = Join-Path $env:TEMP "autotools_update.zip"
$tempExtract = Join-Path $env:TEMP "autotools_extracted"

Write-Host "Baixando atualização de $zipUrl..."
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip

Write-Host "Extraindo arquivos..."
if (Test-Path $tempExtract) { Remove-Item -Recurse -Force $tempExtract }
Expand-Archive -Path $tempZip -DestinationPath $tempExtract

$extractedFolder = Get-ChildItem -Path $tempExtract | Select-Object -First 1
$sourceFolder = $extractedFolder.FullName

Write-Host "Aplicando atualização em $destDir..."
Copy-Item -Path "$sourceFolder\\*" -Destination $destDir -Recurse -Force

Write-Host "Limpando arquivos temporários..."
Remove-Item $tempZip
Remove-Item -Recurse $tempExtract

Write-Host "Reiniciando Auto Tools..."
$exePath = Get-Process -Id $PID -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path
# Como este script roda fora, precisamos achar o executável principal ou apenas abrir a pasta
Start-Process -FilePath "explorer.exe" -ArgumentList $destDir # Fallback simples
Write-Host "Atualização concluída!"
`;

  fs.writeFileSync(updaterScriptPath, psScript);

  res.json({ success: true, message: 'Reiniciando para aplicar atualização...' });

  // Dispara o script e fecha o processo atual
  console.log('[UPDATE] Disparando script de atualização e fechando...');
  spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', updaterScriptPath], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  setTimeout(() => {
    process.exit(0);
  }, 1000);
});

export default router;
