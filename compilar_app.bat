@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   BUILDER AUTO UTILS - VERSÃO ROBUSTA
echo ====================================================
echo.

:: 1. Verifica e instala dependências do requirements.txt
echo [1/3] Sincronizando bibliotecas (requirements.txt)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [X] Erro ao instalar dependências. Verifique sua conexão.
    pause
    exit /b
)

:: 2. Limpeza de builds anteriores
echo [2/3] Limpando pastas temporárias...
if exist build rd /s /q build
if exist dist rd /s /q dist

:: 3. Compilação do executável com arquivos de dados embutidos
echo [3/3] Iniciando empacotamento (PyInstaller)...
echo.

:: --add-data coloca arquivos dentro do .exe (formato: arquivo;destino_interno)
:: O ponto (.) significa a raiz da pasta onde o .exe será executado
flet pack app_flet_mica.py ^
    --name "Auto Utils" ^
    --icon "logo_app.png" ^
    --pyinstaller-build-args="--add-data=logo_app.png;." ^
    --pyinstaller-build-args="--add-data=credentials.json;." ^
    --pyinstaller-build-args="--exclude-module=app_gui" ^
    --pyinstaller-build-args="--onefile"

echo.
echo ====================================================
echo   PROCESSO FINALIZADO!
echo ====================================================
echo.
if exist "dist\Auto Utils.exe" (
    echo [OK] O executável foi gerado com sucesso!
    echo Local: "%cd%\dist\Auto Utils.exe"
    
    :: Copia arquivos de dados persistentes para a pasta dist (opcional para transporte)
    echo.
    echo [4/4] Preparando pacote de dados...
    if exist "Userbank.db" (
        copy "Userbank.db" "dist\" >nul
        echo [OK] Banco de Dados copiado para dist\
    )
    if exist ".env" (
        copy ".env" "dist\" >nul
        echo [OK] Arquivo .env (chaves) copiado para dist\
    )
    echo.
    echo DICA: Para levar para outro PC e manter seus dados, 
    echo       leve o .exe, o .db e o .env juntos na mesma pasta.
) else (
    echo [X] Erro: O arquivo não foi encontrado na pasta dist.
)
echo.
pause


