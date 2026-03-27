# core/banco.py
import os
import sqlite3
import bcrypt
import sys
from pathlib import Path
from cryptography.fernet import Fernet
from dotenv import load_dotenv

# Configuração de Caminhos para Executável (.exe) e Desenvolvimento
if getattr(sys, 'frozen', False):
    # Se estiver no modo compilado, o BASE_DIR é a pasta onde o .exe está localizado
    # Usado para arquivos que o usuário pode ver ou que persistam (DB, .env, Logs)
    BASE_DIR = Path(sys.executable).resolve().parent
    # ASSETS_DIR aponta para a pasta temporária interna do PyInstaller (onde embutimos arquivos)
    ASSETS_DIR = Path(getattr(sys, '_MEIPASS', BASE_DIR))
else:
    # Se estiver em desenvolvimento, o BASE_DIR é a raiz do projeto
    BASE_DIR = Path(__file__).resolve().parent.parent
    ASSETS_DIR = BASE_DIR

DB_PATH = BASE_DIR / "Userbank.db"
ENV_PATH = BASE_DIR / ".env"

def inicializar_env():
    if not ENV_PATH.exists():
        chave = Fernet.generate_key().decode()
        with open(ENV_PATH, 'w') as f:
            f.write("# CHAVE DE LOGIN DO SISTEMA - GERADA AUTOMATICAMENTE\n")
            f.write(f"CHAVE_LOGIN={chave}\n")
            f.write("DATABASE_NAME=Userbank.db\n")
        print("Arquivo .env e chave mestra criados com sucesso!")

def obter_fernet():
    load_dotenv(ENV_PATH)
    chave = os.getenv("CHAVE_LOGIN")
    if chave is None:
        raise ValueError("CHAVE_LOGIN not found in .env file. Please run inicializar_env() first.")
    return Fernet(chave.encode())

def configurar_banco():
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")
    
    # ADICIONADO O CAMPO 'nome' AQUI NA TABELA DE USUÁRIOS
    cursor.execute('''CREATE TABLE IF NOT EXISTS usuarios (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        nome TEXT,
                        usuario TEXT UNIQUE, 
                        senha TEXT)''')
                        
    cursor.execute('''CREATE TABLE IF NOT EXISTS acessos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        servico TEXT, login_acesso TEXT, senha_acesso TEXT, 
                        user_id INTEGER, FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
    
    # NOVA TABELA PARA SENHAS PERSONALIZADAS
    cursor.execute('''CREATE TABLE IF NOT EXISTS acessos_personalizados (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        nome_site TEXT, login_acesso TEXT, senha_acesso TEXT, 
                        user_id INTEGER, FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS onibus (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        nome TEXT UNIQUE, 
                        capacidade INTEGER)''')
    conexao.commit()
    conexao.close()


# ADICIONADO O PARÂMETRO 'nome' NA FUNÇÃO DE CADASTRO
def cadastrar_usuario_principal(nome, usuario, senha):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    hash_senha = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt())
    try:
        cursor.execute("INSERT INTO usuarios (nome, usuario, senha) VALUES (?, ?, ?)", (nome, usuario, hash_senha))
        conexao.commit()
        return True # Retorna True se deu certo
    except sqlite3.IntegrityError:
        return False # Retorna False se o usuário já existir
    finally:
        conexao.close()

def login_principal(usuario, senha):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    # AGORA BUSCAMOS O NOME TAMBÉM
    cursor.execute("SELECT id, nome, senha FROM usuarios WHERE usuario = ?", (usuario,))
    user = cursor.fetchone()
    conexao.close()
    
    if user and bcrypt.checkpw(senha.encode('utf-8'), user[2]):
        return user[0], user[1] # Retorna (ID, NOME)
    return None, None

def adicionar_credencial_site(user_id, servico, login_site, senha_site, eh_personalizado=False):
    fernet = obter_fernet()
    senha_cripto = fernet.encrypt(senha_site.encode('utf-8')).decode('utf-8')
    
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    
    if eh_personalizado:
        # Tabela personalizada não precisa limpar por serviço (pode ter vários com o mesmo nome se quiser, ou limpamos por nome_site)
        cursor.execute("DELETE FROM acessos_personalizados WHERE user_id = ? AND nome_site = ?", (user_id, servico))
        cursor.execute('''INSERT INTO acessos_personalizados (nome_site, login_acesso, senha_acesso, user_id)
                          VALUES (?, ?, ?, ?)''', (servico, login_site, senha_cripto, user_id))
    else:
        cursor.execute("DELETE FROM acessos WHERE user_id = ? AND servico = ?", (user_id, servico))
        cursor.execute('''INSERT INTO acessos (servico, login_acesso, senha_acesso, user_id)
                          VALUES (?, ?, ?, ?)''', (servico, login_site, senha_cripto, user_id))
    
    conexao.commit()
    conexao.close()

def listar_credenciais(user_id):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    
    # Buscar dos sistemas
    cursor.execute("SELECT id, servico, login_acesso, senha_acesso FROM acessos WHERE user_id = ?", (user_id,))
    dados_sist = cursor.fetchall()
    
    # Buscar personalizados
    cursor.execute("SELECT id, nome_site, login_acesso, senha_acesso FROM acessos_personalizados WHERE user_id = ?", (user_id,))
    dados_pers = cursor.fetchall()
    
    conexao.close()
    
    lista = []
    fernet = obter_fernet()

    # Processar Sistemas
    for d in dados_sist:
        try:
            token = d[3]
            if isinstance(token, str): token = token.encode('utf-8')
            senha = fernet.decrypt(token).decode('utf-8')
        except:
            senha = "Erro decript"
        lista.append({"id": d[0], "site": d[1], "user": d[2], "pass": senha, "type": "system"})

    # Processar Personalizados
    for d in dados_pers:
        try:
            token = d[3]
            if isinstance(token, str): token = token.encode('utf-8')
            senha = fernet.decrypt(token).decode('utf-8')
        except:
            senha = "Erro decript"
        lista.append({"id": d[0], "site": d[1], "user": d[2], "pass": senha, "type": "custom"})

    return lista

def excluir_credencial(credential_id, eh_personalizado=False):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    if eh_personalizado:
        cursor.execute("DELETE FROM acessos_personalizados WHERE id = ?", (credential_id,))
    else:
        cursor.execute("DELETE FROM acessos WHERE id = ?", (credential_id,))
    conexao.commit()
    conexao.close()
    return True

def verificar_senha_mestra(user_id, senha_digitada):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT senha FROM usuarios WHERE id = ?", (user_id,))
    hashed_senha = cursor.fetchone()
    conexao.close()
    
    if hashed_senha and bcrypt.checkpw(senha_digitada.encode('utf-8'), hashed_senha[0]):
         return True
    return False

def inicializar_onibus_padrao():
    onibus_padrao = [
        ("CONVENCIONAL", 46),
        ("CAMA EXECUTIVO", 54),
        ("EXECUTIVO", 46),
        ("EXECUTIVO CONVENCIONAL", 68),
        ("CAMA CONVENCIONAL", 54),
        ("CAMA SEMILEITO", 54),
        ("SEMILEITO EXECUTIVO", 54),
        ("CONVENCIONAL DD", 68)
    ]
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    for nome, cap in onibus_padrao:
        cursor.execute("INSERT OR IGNORE INTO onibus (nome, capacidade) VALUES (?, ?)", (nome, cap))
    conexao.commit()
    conexao.close()

def listar_onibus():
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT nome, capacidade FROM onibus ORDER BY nome ASC")
    res = cursor.fetchall()
    conexao.close()
    return res

def salvar_onibus(nome, capacidade):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("INSERT OR REPLACE INTO onibus (nome, capacidade) VALUES (?, ?)", (nome, capacidade))
    conexao.commit()
    conexao.close()