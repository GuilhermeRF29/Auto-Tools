
$ErrorActionPreference = 'Stop'
Write-Host "Aguardando resposta do servidor..."
Start-Sleep -Seconds 2
Write-Host "Encerrando Auto Tools..."
Stop-Process -Name "Auto Tools" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "electron" -Force -ErrorAction SilentlyContinue
Stop-Process -Name "node" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$repo = "GuilhermeRF29/Auto-Tools"
$zipUrl = "https://github.com/GuilhermeRF29/Auto-Tools/archive/refs/heads/main.zip"
$destDir = "C:\Users\guilherme.felix\Documents\Temporário VS\Project_Automation3"
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
# Usando xcopy para evitar bugs do Copy-Item do PowerShell com merge de pastas
cmd.exe /c "xcopy /E /Y /I /Q ""$sourceFolder\*"" ""$destDir\"""

Write-Host "Limpando arquivos temporários..."
Remove-Item $tempZip
Remove-Item -Recurse $tempExtract

Write-Host "Reiniciando Auto Tools..."
$exePath = Join-Path $destDir "Auto Tools.exe"
if (Test-Path $exePath) {
    Start-Process -FilePath $exePath
} else {
    Start-Process -FilePath "explorer.exe" -ArgumentList $destDir
}
Write-Host "Atualização concluída!"
