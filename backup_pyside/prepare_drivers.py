#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script para preparar drivers do Selenium para embedding no executável
Baixa msedgedriver e garante que esteja disponível na compilação
"""

import os
import sys
import zipfile
import urllib.request
from pathlib import Path
import platform

def download_edge_driver():
    """
    Baixa o Microsoft Edge WebDriver compatível com a versão do Edge instalado
    """
    print("[*] Preparando Edge WebDriver para o executável...")
    
    # Criar diretório para drivers
    drivers_dir = Path("drivers")
    drivers_dir.mkdir(exist_ok=True)
    
    # Detectar versão do Edge usando PowerShell
    try:
        import subprocess
        result = subprocess.run(
            ['powershell', '-Command', 
             'Get-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Edge" -Name "Version" | Select-Object -ExpandProperty Version'],
            capture_output=True,
            text=True
        )
        edge_version = result.stdout.strip().split(';')[0]  # Pega primeiro número da versão
        if not edge_version:
            print("[!] Não foi possível detectar versão do Edge. Usando versão estável mais recente...")
            # Alternativamente, usar versão fixa recente
            edge_version = "133"
    except:
        print("[!] Erro ao detectar Edge. Usando versão padrão...")
        edge_version = "133"
    
    major_version = edge_version.split('.')[0] if '.' in edge_version else edge_version
    
    print(f"[*] Versão do Edge detectada: {major_version}")
    print(f"[*] Baixando msedgedriver para a versão {major_version}...")
    
    # URL para baixar o driver
    # Formato: https://edgedriver.azureedge.net/<version>/edgedriver_win64.zip
    driver_url = f"https://msedgedriver.azureedge.net/{major_version}.0.0.0/edgedriver_win64.zip"
    
    try:
        zip_path = drivers_dir / "edgedriver.zip"
        print(f"[*] Downloading from: {driver_url}")
        urllib.request.urlretrieve(driver_url, zip_path)
        
        # Extrair
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(drivers_dir)
        
        # Remover zip
        zip_path.unlink()
        
        exe_path = drivers_dir / "msedgedriver.exe"
        if exe_path.exists():
            print(f"[OK] msedgedriver.exe baixado e extraído em: {exe_path}")
            return str(exe_path)
        else:
            print("[!] Arquivo msedgedriver.exe não encontrado no zip")
            return None
            
    except Exception as e:
        print(f"[ERROR] Falha ao baixar driver: {e}")
        print("[*] AVISO: O executável compilado não incluirá o WebDriver!")
        print("[*] Você precisará adicionar manualmente msedgedriver.exe na pasta do .exe")
        return None

def create_driver_helper():
    """
    Cria um módulo helper que busca o driver dinamicamente
    """
    helper_code = '''# -*- coding: utf-8 -*-
"""
Helper para localizar WebDriver do Selenium em ambiente empacotado
"""
import os
import sys
from pathlib import Path

def get_driver_path():
    """
    Localiza o msedgedriver.exe em ambiente empacotado ou desenvolvimento
    """
    # Cenário 1: Ambiente embarcado pelo PyInstaller
    if getattr(sys, 'frozen', False):
        base_path = Path(sys._MEIPASS)
        driver_path = base_path / 'drivers' / 'msedgedriver.exe'
        if driver_path.exists():
            return str(driver_path)
    
    # Cenário 2: Pasta local ao executável
    exe_dir = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path.cwd()
    driver_path = exe_dir / 'msedgedriver.exe'
    if driver_path.exists():
        return str(driver_path)
    
    # Cenário 3: Pasta drivers no diretório do executável
    driver_path = exe_dir / 'drivers' / 'msedgedriver.exe'
    if driver_path.exists():
        return str(driver_path)
    
    # Cenário 4: Sistema PATH
    # Selenium tenta automaticamente se não especificar caminho
    return None

def get_edge_options():
    """
    Retorna opções do Edge WebDriver configuradas corretamente
    """
    from selenium.webdriver.edge.options import Options
    options = Options()
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option('useAutomationExtension', False)
    return options
'''
    
    with open('selenium_helper.py', 'w', encoding='utf-8') as f:
        f.write(helper_code)
    
    print("[OK] Criado: selenium_helper.py")

if __name__ == "__main__":
    print("=" * 60)
    print("  PREPARADOR DE DRIVERS - Auto Utils")
    print("=" * 60)
    print()
    
    driver_path = download_edge_driver()
    create_driver_helper()
    
    print()
    print("=" * 60)
    print("  PRÓXIMOS PASSOS:")
    print("=" * 60)
    if driver_path:
        print("[OK] Driver baixado com sucesso!")
        print(f"    Localização: {driver_path}")
        print()
        print("[*] Próximo passo:")
        print("    1. Execute: compilar_app_novo.bat")
    else:
        print("[!] Driver não foi baixado automaticamente")
        print()
        print("[*] Alternativas:")
        print("    1. Baixe manualmente de: https://learn.microsoft.com/en-us/microsoft-edge/webdriver-chromium/")
        print("    2. Coloque msedgedriver.exe na pasta: ./drivers/")
        print("    3. Execute: compilar_app_novo.bat")
    print()
