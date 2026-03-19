@echo off
setlocal
chcp 65001 >nul

echo.
echo ███████████████████████████████████████████████████████
echo   QUICK START - Compilacao Auto Utils
echo ███████████████████████████████████████████████████████
echo.

REM Mudar para o diretório do script
cd /d "%~dp0"

echo [1/3] Verificando ambiente...
python verificar_compilacao.py
if %errorlevel% neq 0 (
    echo.
    echo [X] Verificacoes falharam. Corrija os erros acima.
    pause
    exit /b 1
)

echo.
echo [2/3] Compilando... (isso pode levar alguns minutos)
echo.
compilar_app_novo.bat
if %errorlevel% neq 0 (
    echo.
    echo [X] Compilacao falhou!
    pause
    exit /b 1
)

echo.
echo [3/3] Verificando resultado...
if exist "dist\Auto Utils\Auto Utils.exe" (
    echo.
    echo ███████████████████████████████████████████████████████
    echo   ✅ SUCESSO!
    echo ███████████████████████████████████████████████████████
    echo.
    echo [OK] Executavel: dist\Auto Utils\Auto Utils.exe
    echo [OK] Tamanho: (aproximadamente 180-300 MB)
    echo.
    echo PROXIMOS PASSOS:
    echo.
    echo 1. Teste para garantir que funciona:
    echo    dist\Auto Utils\Auto Utils.exe
    echo.
    echo 2. Distribua a pasta "dist\Auto Utils" para outros usuarios
    echo.
    echo 3. Eles executam o .exe, sem precisar de Python!
    echo.
    echo DOCUMENTACAO:
    echo   - GUIA_COMPILACAO.md      : Guia completo
    echo   - RESUMO_MUDANCAS.md      : O que mudou
    echo.
    echo ███████████████████████████████████████████████████████
) else (
    echo.
    echo [X] Erro: Executavel nao foi criado!
    echo.
    echo Verifique a saida acima para detalhes do erro.
)

echo.
pause
