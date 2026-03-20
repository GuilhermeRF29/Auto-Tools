# -*- coding: utf-8 -*-
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
