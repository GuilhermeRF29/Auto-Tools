@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   BUILDER AUTO UTILS - VERSAO MELHORADA
echo   Compilacao com suporte a distribuicao
echo ====================================================
echo.

REM ============================================
REM 1. PREPARAR DRIVERS
REM ============================================
echo [1/5] Preparando WebDrivers...
python prepare_drivers.py
if %errorlevel% neq 0 (
    echo.
    echo [X] Erro ao preparar drivers.
    pause
    exit /b
)

REM ============================================
REM 2. SINCRONIZAR DEPENDENCIAS
REM ============================================
echo.
echo [2/5] Sincronizando bibliotecas...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [X] Erro ao instalar dependencias.
    pause
    exit /b
)

REM ============================================
REM 3. LIMPEZA
REM ============================================
echo.
echo [3/5] Limpando pastas temporarias...
if exist build rd /s /q build >nul 2>&1
if exist dist rd /s /q dist >nul 2>&1
if exist "__pycache__" rd /s /q "__pycache__" >nul 2>&1

REM ============================================
REM 4. COMPILACAO COM PYINSTALLER
REM ============================================
echo.
echo [4/5] Compilando com PyInstaller...
echo.

pyinstaller Auto_Utils.spec ^
    --distpath=dist ^
    --buildpath=build ^
    --specpath=. ^
    --clean

if %errorlevel% neq 0 (
    echo.
    echo [X] Erro na compilacao PyInstaller.
    pause
    exit /b
)

REM ============================================
REM 5. COPIAR ARQUIVOS SUPORTE
REM ============================================
echo.
echo [5/5] Copiando arquivos de suporte...

if exist dist\Auto Utils (
    REM Copia drivers se existirem
    if exist drivers\msedgedriver.exe (
        if not exist "dist\Auto Utils\drivers" mkdir "dist\Auto Utils\drivers"
        copy "drivers\msedgedriver.exe" "dist\Auto Utils\drivers\" >nul
        echo [OK] WebDriver copiado para dist
    )
    
    REM Copia banco de dados
    if exist "Userbank.db" (
        copy "Userbank.db" "dist\Auto Utils\" >nul
        echo [OK] Banco de Dados copiado
    )
    
    REM Copia arquivo .env
    if exist ".env" (
        copy ".env" "dist\Auto Utils\" >nul
        echo [OK] Arquivo .env copiado
    )
    
    REM Copia credentials.json
    if exist "credentials.json" (
        copy "credentials.json" "dist\Auto Utils\" >nul
        echo [OK] Arquivo credentials.json copiado
    )
    
    REM Copia logo_app.png
    if exist "logo_app.png" (
        copy "logo_app.png" "dist\Auto Utils\" >nul
        echo [OK] Logo copiado
    )
    
    REM Cria arquivo README com instrucoes
    (
        echo ====================================================
        echo          AUTO UTILS - INSTRUCOES DE DISTRIBUTE
        echo ====================================================
        echo.
        echo REQUISITOS MINIMOS:
        echo - Windows 7 ou superior
        echo - 500 MB de espaco livre em disco
        echo - Microsoft Edge instalado (para executar automacoes^)
        echo.
        echo COMO USAR:
        echo 1. Copie a pasta "Auto Utils" para a maquina alvo
        echo 2. Execute "Auto Utils.exe"
        echo.
        echo ARQUIVOS IMPORTANTES:
        echo - Auto Utils.exe       : Executavel principal
        echo - Userbank.db          : Banco de dados com credenciais
        echo - .env                 : Arquivo de configuracao
        echo - credentials.json     : Credenciais Google Sheets
        echo - drivers/             : WebDrivers para Selenium
        echo.
        echo TROUBLESHOOTING:
        echo.
        echo [PROBLEMA] O navegador nao abre 
        echo [SOLUCAO] Verifique se Microsoft Edge esta instalado
        echo.
        echo [PROBLEMA] "msedgedriver.exe not found"
        echo [SOLUCAO] Certifique-se que a pasta "drivers" existe
        echo            e contem "msedgedriver.exe"
        echo.
        echo [PROBLEMA] Erro "WebDriver incompativel"
        echo [SOLUCAO] Seu Edge pode ser mais novo que o driver.
        echo            Baixe compativel em:
        echo            https://learn.microsoft.com/en-us/microsoft-edge/webdriver-chromium/
        echo.
        echo ====================================================
    ) > "dist\Auto Utils\LEIA_ME.txt"
    
    echo [OK] Arquivo LEIA_ME.txt criado
)

echo.
echo ====================================================
echo   COMPILACAO FINALIZADA COM SUCESSO!
echo ====================================================
echo.

REM Verifica se conseguiu compilar
if exist "dist\Auto Utils\Auto Utils.exe" (
    echo [OK] Executavel criado!
    echo Local: "%cd%\dist\Auto Utils\Auto Utils.exe"
    echo.
    echo [*] Pasta pronta para distribuicao: "%cd%\dist\Auto Utils"
) else (
    echo [X] Erro: O executavel nao foi encontrado!
)

echo.
pause
exit /b
