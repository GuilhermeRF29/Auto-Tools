
import sys
from pathlib import Path

# Add current dir to path to import core
BASE_DIR = Path(__file__).resolve().parent
sys.path.append(str(BASE_DIR))

from core import banco

if __name__ == "__main__":
    print("Inicializando banco de dados...")
    banco.configurar_banco()
    banco.inicializar_env()
    banco.inicializar_onibus_padrao()
    
    # Criar um usuário admin se não existir
    try:
        if not banco.login_principal("admin", "admin")[0]:
            print("Criando usuário admin default...")
            banco.cadastrar_usuario_principal("Administrador", "admin", "admin")
            print("Usuário 'admin' com senha 'admin' criado.")
        else:
            print("Usuário admin já existe.")
    except Exception as e:
        print(f"Erro ao criar usuário: {e}")
        # Talvez já tenha sido criado.
        pass

    print("Banco de dados pronto!")
