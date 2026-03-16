# main.py
import getpass
import os
import time
import calendar
from datetime import datetime

# Importações dos seus módulos
from core.banco import (inicializar_env, configurar_banco, login_principal, 
                        cadastrar_usuario_principal, adicionar_credencial_site)
from automacoes.adm_new import executar_adm
from automacoes.ebus_new import executar_ebus

# =========================================================================
# ⚙️ PARÂMETROS PADRÕES DAS AUTOMAÇÕES
# Centralizamos todas as configurações aqui. Quando você criar um novo 
# robô no futuro, basta criar um bloco novo para ele aqui embaixo!
# =========================================================================

# --- 1. ADM DE VENDAS ---
# Usa o ano de 2026 fixo.
ADM_INICIO = "01/01/2026"
ADM_FIM = "31/12/2026"

# --- 2. EBUS ---
# MODO MANUAL: Você pode vir aqui e mudar a string direto:
# EBUS_INICIO = "01/03/2026"
# EBUS_FIM = "31/07/2026"

# MODO AUTOMÁTICO (DINÂMICO): Calcula o mês atual + 4 meses para frente!
hoje = datetime.now()
EBUS_INICIO = f"01/{hoje.month:02d}/{hoje.year}"

# Lógica para não bugar quando virar o ano (ex: Novembro + 4 meses = Março do ano seguinte)
mes_futuro = hoje.month + 4
ano_futuro = hoje.year
if mes_futuro > 12:
    mes_futuro -= 12
    ano_futuro += 1

ultimo_dia_mes = calendar.monthrange(ano_futuro, mes_futuro)[1] # Descobre se o mês tem 28, 30 ou 31 dias
EBUS_FIM = f"{ultimo_dia_mes}/{mes_futuro:02d}/{ano_futuro}"

# --- 3. ESPAÇO PARA FUTUROS RELATÓRIOS ---
# Para adicionar novos, é só seguir a receita do bolo:
# NOME_RELATORIO_PARAM_1 = "..."
# NOME_RELATORIO_PARAM_2 = "..."
# =========================================================================

def limpar_tela():
    """Limpa o terminal."""
    os.system('cls' if os.name == 'nt' else 'clear')

def escolher_parametros(nome_automacao, padrao_1, padrao_2, tipo="data"):
    """
    Função genérica e inteligente! Ela recebe o nome do robô e os valores padrões dele.
    Serve tanto para datas quanto para qualquer outro parâmetro futuro.
    """
    print(f"\n[1] Usar padrão do {nome_automacao} ({padrao_1} até {padrao_2})")
    print("[2] Digitar valores personalizados manualmente")
    escolha = input("Opção: ")

    if escolha == "1":
        return padrao_1, padrao_2
    else:
        # Deixei essa condição "tipo" caso no futuro um relatório não use data, mas sim "Códigos de Produto"
        if tipo == "data":
            v1 = input("Data Início (dd/mm/aaaa): ")
            v2 = input("Data Fim (dd/mm/aaaa): ")
        else:
            v1 = input("Valor 1: ")
            v2 = input("Valor 2: ")
        return v1, v2

def menu_principal():
    inicializar_env()
    configurar_banco()
    limpar_tela()
    
    # ... (A parte do login continua igualzinha) ...
    print("="*40)
    print(" BEM-VINDO AO SISTEMA DE AUTOMAÇÕES")
    print("="*40)
    
    usuario = input("Usuário: ")
    senha = getpass.getpass("Senha: ")
    id_logado = login_principal(usuario, senha)
    
    if not id_logado:
        print("\nUsuário não encontrado ou senha incorreta.")
        resp = input("Deseja criar um novo usuário com esses dados? (S/N): ")
        if resp.upper() == 'S':
            cadastrar_usuario_principal(usuario, senha, id_logado)
            id_logado = login_principal(usuario, senha)
        else:
            print("Encerrando...")
            return

    while True:
        limpar_tela()
        print(f"Logado com sucesso! (ID: {id_logado})\n")
        print("1 - Rodar Automação: ADM de Vendas (Relatório Demanda)")
        print("2 - Rodar Automação: EBUS (Relatório Revenue)")
        print("3 - Cadastrar senha de um Site (Cofre)")
        print("4 - Sair")
        
        opcao = input("\nEscolha: ")
        
        if opcao == "1":
            print("\n--- Configuração: ADM de Vendas ---")
            # Agora nós enviamos as variáveis específicas do ADM para a função!
            ini, fim = escolher_parametros("ADM de Vendas", ADM_INICIO, ADM_FIM, "data")
            executar_adm(id_logado, ini, fim)
            input("\nPressione ENTER para voltar ao menu...")
            
        elif opcao == "2":
            print("\n--- Configuração: EBUS ---")
            # E aqui enviamos as variáveis específicas do EBUS!
            ini, fim = escolher_parametros("EBUS", EBUS_INICIO, EBUS_FIM, "data")
            executar_ebus(id_logado, ini, fim)
            input("\nPressione ENTER para voltar ao menu...")
            
        elif opcao == "3":
            site = input("Qual serviço (Ex: 'ADM de Vendas' ou 'EBUS')? ")
            login_site = input("Login no site: ")
            senha_site = getpass.getpass("Senha no site: ")
            adicionar_credencial_site(id_logado, site, login_site, senha_site)
            time.sleep(2)
            
        elif opcao == "4":
            print("Até logo!")
            break

if __name__ == "__main__":
    menu_principal()