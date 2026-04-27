# Script de Setup para Python Portátil (Auto Tools)
# Este script configura o pip e instala as dependências na pasta python-runtime

$PYTHON_EXE = ".\python-runtime\python.exe"

if (!(Test-Path $PYTHON_EXE)) {
    Write-Error "Arquivo $PYTHON_EXE não encontrado. Certifique-se de que extraiu o Python portátil corretamente na pasta python-runtime."
    exit
}

Write-Host "--- Iniciando configuração do Python Portátil ---" -ForegroundColor Cyan

# 1. Baixar get-pip.py se não existir
if (!(Test-Path "get-pip.py")) {
    Write-Host "[1/4] Baixando instalador do pip..."
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile "get-pip.py"
}

# 2. Instalar pip
Write-Host "[2/4] Instalando pip no ambiente portátil..."
& $PYTHON_EXE get-pip.py --no-warn-script-location

# 3. Instalar Requirements
Write-Host "[3/4] Instalando dependências do requirements.txt..."
& $PYTHON_EXE -m pip install -r requirements.txt --no-warn-script-location

# 4. Instalar Playwright Browsers
Write-Host "[4/4] Instalando navegadores do Playwright..."
& $PYTHON_EXE -m playwright install chromium

Write-Host "--- Configuração concluída com sucesso! ---" -ForegroundColor Green
Write-Host "Você já pode deletar o arquivo 'get-pip.py' se desejar."
