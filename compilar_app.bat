@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   BUILDER AUTO UTILS - COMPILADOR FLET
echo ====================================================
echo.

:: Verifica instalacoes
python -m pip show flet >nul 2>&1
if %errorlevel% neq 0 (
    echo [! ] Instalando dependencias...
    python -m pip install flet pyinstaller
)

echo [1/2] Limpando pastas temporarias...
if exist build rd /s /q build
if exist dist rd /s /q dist

echo [2/2] Compilando arquivo EXE...
echo.

:: Tentando uma sintaxe mais robusta para passar os argumentos
flet pack app_flet_mica.py --name "Auto Utils" --icon "logo_app.png" --pyinstaller-build-args="-F" --pyinstaller-build-args="--exclude-module=app_gui"

echo.
echo ====================================================
echo   PROCESSO FINALIZADO!
echo ====================================================
echo.
if exist "dist\Auto Utils.exe" (
    echo [OK] O arquivo foi gerado com sucesso!
    echo Local: "%cd%\dist\Auto Utils.exe"
) else (
    echo [X] Erro: O arquivo nao foi encontrado na pasta dist.
    echo Se o erro persistir, precisaremos rodar o PyInstaller diretamente.
)
echo.
pause
