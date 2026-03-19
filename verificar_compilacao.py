#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script de Verificação Pré-Compilação
Garante que tudo está pronto antes de compilar
"""

import os
import sys
from pathlib import Path

def check_python_version():
    """Verifica versão do Python"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 9):
        print(f"❌ Python {version.major}.{version.minor} < 3.9 requerido")
        return False
    print(f"✅ Python {version.major}.{version.minor}.{version.micro}")
    return True

def check_requirements():
    """Verifica se requirements.txt existe"""
    if not Path("requirements.txt").exists():
        print("❌ Arquivo requirements.txt não encontrado")
        return False
    print("✅ requirements.txt encontrado")
    
    # Ler e validar conteúdo
    with open("requirements.txt", "r") as f:
        reqs = f.read().lower()
    
    required = ["flet", "selenium", "pyinstaller", "pandas"]
    missing = [r for r in required if r not in reqs]
    
    if missing:
        print(f"⚠️  Pacotes ausentes em requirements.txt: {missing}")
        return False
    
    print("✅ requirements.txt contém pacotes necessários")
    return True

def check_spec_file():
    """Verifica se arquivo .spec existe"""
    if not Path("Auto_Utils.spec").exists():
        print("❌ Arquivo Auto_Utils.spec não encontrado")
        return False
    print("✅ Auto_Utils.spec encontrado")
    return True

def check_main_file():
    """Verifica se main app existe"""
    if not Path("app_flet_mica.py").exists():
        print("❌ Arquivo app_flet_mica.py não encontrado")
        return False
    print("✅ app_flet_mica.py encontrado")
    return True

def check_selenium_helper():
    """Verifica se selenium_helper.py existe"""
    if not Path("selenium_helper.py").exists():
        print("⚠️  selenium_helper.py não encontrado (será criado automaticamente)")
        return True  # Não é crítico, será criado por prepare_drivers.py
    print("✅ selenium_helper.py encontrado")
    return True

def check_prepare_drivers():
    """Verifica se prepare_drivers.py existe"""
    if not Path("prepare_drivers.py").exists():
        print("❌ Arquivo prepare_drivers.py não encontrado")
        return False
    print("✅ prepare_drivers.py encontrado")
    return True

def check_automacao_imports():
    """Verifica se imports foram atualizados em arquivos de automação"""
    files = [
        "automacoes/adm_new.py",
        "automacoes/ebus_new.py",
        "automacoes/relat_rev.py"
    ]
    
    for file in files:
        if not Path(file).exists():
            print(f"❌ {file} não encontrado")
            return False
        
        # Try opening with UTF-8
        try:
            with open(file, "r", encoding="utf-8") as f:
                content = f.read()
        except UnicodeDecodeError:
            print("UTF-8 decoding failed. Trying another encoding.")

        # If UTF-8 fails, try Latin-1 (which maps all single bytes 0-255)
        try:
            with open(file, "r", encoding="latin-1") as f:
                content = f.read()
        except UnicodeDecodeError:
            print("Latin-1 decoding failed.")
        
        if "selenium_helper" not in content and "get_driver_path" not in content:
            print(f"⚠️  {file} ainda não foi atualizado com suporte a drivers")
            return False
    
    print("✅ Automações atualizadas com suporte a drivers")
    return True

def check_disk_space():
    """Verifica espaço em disco"""
    import shutil
    total, used, free = shutil.disk_usage("/")
    free_gb = free / (1024**3)
    
    if free_gb < 2:
        print(f"❌ Espaço insuficiente em disco: {free_gb:.1f}GB (mínimo 2GB)")
        return False
    
    print(f"✅ Espaço em disco: {free_gb:.1f}GB disponível")
    return True

def check_pyinstaller_installed():
    """Verifica se PyInstaller está instalado"""
    try:
        import PyInstaller
        import PyInstaller.__main__
        print(f"✅ PyInstaller instalado")
        return True
    except ImportError:
        print("❌ PyInstaller não está instalado")
        print("   Execute: pip install pyinstaller")
        return False

def main():
    print("=" * 60)
    print("  VERIFICAÇÃO PRÉ-COMPILAÇÃO")
    print("=" * 60)
    print()
    
    checks = [
        ("Python Version", check_python_version),
        ("Requirements.txt", check_requirements),
        ("Spec File", check_spec_file),
        ("Main App", check_main_file),
        ("Prepare Drivers Script", check_prepare_drivers),
        ("Selenium Helper", check_selenium_helper),
        ("Automações", check_automacao_imports),
        ("PyInstaller", check_pyinstaller_installed),
        ("Disk Space", check_disk_space),
    ]
    
    results = []
    for name, check_func in checks:
        try:
            result = check_func()
            results.append(result)
        except Exception as e:
            print(f"❌ Erro ao verificar {name}: {e}")
            results.append(False)
        print()
    
    print("=" * 60)
    if all(results):
        print("✅ TUDO OK! Pronto para compilar")
        print()
        print("Próximos passos:")
        print("1. Execute: compilar_app_novo.bat")
        print()
        print("=" * 60)
        return 0
    else:
        print(f"❌ {results.count(False)} verificação(ões) falharam")
        print()
        print("Corrija os erros acima e tente novamente")
        print("=" * 60)
        return 1

if __name__ == "__main__":
    sys.exit(main())
