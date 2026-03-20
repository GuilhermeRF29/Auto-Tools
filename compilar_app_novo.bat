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
    --workpath=build ^
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

set "APP_DIR=dist\Auto Utils"
set "APP_EXE=Auto Utils.exe"
set /a COPIAS_OK=0
set /a COPIAS_FALHA=0
set /a COPIAS_PULADAS=0

REM O .spec atual gera onefile (dist\Auto Utils.exe).
REM Garantimos a pasta de distribuicao e movemos o executavel para dentro dela.
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

if exist "dist\%APP_EXE%" (
    move /Y "dist\%APP_EXE%" "%APP_DIR%\%APP_EXE%" >nul
)

if exist "%APP_DIR%" (
    REM Copia drivers se existirem
    if exist drivers\msedgedriver.exe (
        if not exist "%APP_DIR%\drivers" mkdir "%APP_DIR%\drivers"
        if exist "%APP_DIR%\drivers" (
            copy "drivers\msedgedriver.exe" "%APP_DIR%\drivers\" >nul
            if errorlevel 1 (
                echo [X] Falha ao copiar WebDriver
                set /a COPIAS_FALHA+=1
            ) else (
                echo [OK] WebDriver copiado para dist
                set /a COPIAS_OK+=1
            )
        ) else (
            echo [X] Falha ao criar pasta de drivers
            set /a COPIAS_FALHA+=1
        )
    ) else (
        echo [!] WebDriver nao encontrado; copia ignorada
        set /a COPIAS_PULADAS+=1
    )
    
    REM Copia banco de dados
    if exist "Userbank.db" (
        copy "Userbank.db" "%APP_DIR%\" >nul
        if errorlevel 1 (
            echo [X] Falha ao copiar Banco de Dados
            set /a COPIAS_FALHA+=1
        ) else (
            echo [OK] Banco de Dados copiado
            set /a COPIAS_OK+=1
        )
    ) else (
        echo [!] Userbank.db nao encontrado; copia ignorada
        set /a COPIAS_PULADAS+=1
    )
    
    REM Copia arquivo .env
    if exist ".env" (
        copy ".env" "%APP_DIR%\" >nul
        if errorlevel 1 (
            echo [X] Falha ao copiar arquivo .env
            set /a COPIAS_FALHA+=1
        ) else (
            echo [OK] Arquivo .env copiado
            set /a COPIAS_OK+=1
        )
    ) else (
        echo [!] Arquivo .env nao encontrado; copia ignorada
        set /a COPIAS_PULADAS+=1
    )
    
    REM Copia credentials.json
    if exist "credentials.json" (
        copy "credentials.json" "%APP_DIR%\" >nul
        if errorlevel 1 (
            echo [X] Falha ao copiar credentials.json
            set /a COPIAS_FALHA+=1
        ) else (
            echo [OK] Arquivo credentials.json copiado
            set /a COPIAS_OK+=1
        )
    ) else (
        echo [!] credentials.json nao encontrado; copia ignorada
        set /a COPIAS_PULADAS+=1
    )
    
    REM Copia logo_app.png
    if exist "logo_app.png" (
        copy "logo_app.png" "%APP_DIR%\" >nul
        if errorlevel 1 (
            echo [X] Falha ao copiar logo_app.png
            set /a COPIAS_FALHA+=1
        ) else (
            echo [OK] Logo copiado
            set /a COPIAS_OK+=1
        )
    ) else (
        echo [!] logo_app.png nao encontrado; copia ignorada
        set /a COPIAS_PULADAS+=1
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
    ) > "%APP_DIR%\LEIA_ME.txt"
    
    if exist "%APP_DIR%\LEIA_ME.txt" (
        echo [OK] Arquivo LEIA_ME.txt criado
        set /a COPIAS_OK+=1
    ) else (
        echo [X] Falha ao criar arquivo LEIA_ME.txt
        set /a COPIAS_FALHA+=1
    )
)

echo.
echo [RESUMO COPIAS] OK: !COPIAS_OK!  Falhas: !COPIAS_FALHA!  Ignoradas: !COPIAS_PULADAS!

echo.
echo ====================================================
echo   COMPILACAO FINALIZADA COM SUCESSO!
echo ====================================================
echo.

REM Verifica se conseguiu compilar
if exist "%APP_DIR%\%APP_EXE%" (
    echo [OK] Executavel criado!
    echo Local: "%cd%\%APP_DIR%\%APP_EXE%"
    echo.
    echo [*] Pasta pronta para distribuicao: "%cd%\%APP_DIR%"
) else (
    echo [X] Erro: O executavel nao foi encontrado!
)

echo.
pause
exit /b
