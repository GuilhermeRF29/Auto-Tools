import sys
import os
from pathlib import Path

# Add project root to sys.path
sys.path.append(os.getcwd())

from core.banco import cadastrar_usuario_principal, login_principal, listar_credenciais, adicionar_credencial_site

def test_firebase():
    print("--- Teste de Integração Firebase ---")
    
    # 1. Teste de Cadastro
    username = "test_user_cloud"
    password = "password123"
    print(f"Cadastrando {username}...")
    res = cadastrar_usuario_principal("Usuário Teste Nuvem", username, password)
    print(f"Resultado Cadastro: {res}")
    
    # 2. Teste de Login
    print(f"Logando {username}...")
    user_id, name = login_principal(username, password)
    print(f"Resultado Login: ID={user_id}, Nome={name}")
    
    if user_id:
        # 3. Teste de Cofre
        print("Adicionando credencial ao cofre...")
        adicionar_credencial_site(user_id, "SERVICO_TESTE", "login_nuvem", "senha_secreta")
        
        print("Listando credenciais...")
        creds = listar_credenciais(user_id)
        print(f"Credenciais encontradas: {len(creds)}")
        for c in creds:
            print(f" - {c['site']}: {c['user']}")

if __name__ == "__main__":
    test_firebase()
