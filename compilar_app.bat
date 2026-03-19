@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   BUILDER AUTO UTILS - VERSAO ROBUSTA
echo ====================================================
echo.

:: 1. Sincronizando bibliotecas
echo [1/4] Sincronizando bibliotecas (requirements.txt)...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
if %errorlevel% neq 0 (
    echo.
    echo [X] Erro ao instalar dependencias.
    pause
    exit /b
)

:: 2. Limpeza
echo [2/4] Limpando pastas temporarias...
if exist build rd /s /q build
if exist dist rd /s /q dist

:: 3. Compilacao
echo [3/4] Iniciando empacotamento (PyInstaller)...
echo.

flet pack app_flet_mica.py ^
    --name "Auto Utils" ^
    --icon "logo_app.png" ^
    --pyinstaller-build-args="--add-data=logo_app.png;." ^
    --pyinstaller-build-args="--add-data=credentials.json;." ^
    --pyinstaller-build-args="--exclude-module=app_gui" ^
    --pyinstaller-build-args="--onefile"

echo.
echo ====================================================
echo   PROCESSO DE COMPILACAO FINALIZADO!
echo ====================================================
echo.

if exist "dist\Auto Utils.exe" (
    echo [OK] O executavel foi gerado com sucesso!
    echo Local: "%cd%\dist\Auto Utils.exe"
    
    echo.
    echo [4/4] Copiando arquivos de suporte...
    
    if exist "Userbank.db" (
        copy "Userbank.db" "dist" >nul
        echo [OK] Banco de Dados copiado para dist
    )
    
    if exist ".env" (
        copy ".env" "dist" >nul
        echo [OK] Arquivo .env copiado para dist
    )

    if exist "credentials.json" (
        copy "credentials.json" "dist" >nul
        echo [OK] Arquivo credentials.json copiado para dist
    )
    
    echo.
    echo DICA: Leve o .exe, o .db, o .env e o credentials.json juntos na mesma pasta.
) else (
    echo [X] Erro: O arquivo nao foi encontrado na pasta dist.
)

echo.
echo Pressione qualquer tecla para sair...
pause >nul
exit /b
