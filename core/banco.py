# core/banco.py
import os
import sqlite3
import bcrypt
import sys
from pathlib import Path
from cryptography.fernet import Fernet
from dotenv import load_dotenv

# Detecta se o aplicativo está rodando como um executável compilado (.exe)
if getattr(sys, 'frozen', False):
    # Se estiver no modo compilado, o BASE_DIR é a pasta onde o .exe está localizado
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    # Se estiver em desenvolvimento, o BASE_DIR é a raiz do projeto (duas pastas acima deste arquivo)
    BASE_DIR = Path(__file__).resolve().parent.parent

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

def adicionar_credencial_site(user_id, servico, login_site, senha_site):
    fernet = obter_fernet()
    senha_cripto = fernet.encrypt(senha_site.encode('utf-8'))
    
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    # Limpa antes de gravar para evitar duplicação
    cursor.execute("DELETE FROM acessos WHERE user_id = ? AND servico = ?", (user_id, servico))
    cursor.execute('''INSERT INTO acessos (servico, login_acesso, senha_acesso, user_id)
                      VALUES (?, ?, ?, ?)''', (servico, login_site, senha_cripto, user_id))
    conexao.commit()
    conexao.close()

def buscar_credencial_site(user_id, servico):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT login_acesso, senha_acesso FROM acessos WHERE user_id = ? AND servico = ?", (user_id, servico))
    dados = cursor.fetchone()
    conexao.close()
    
    if dados:
        fernet = obter_fernet()
        login = dados[0]
        senha = fernet.decrypt(dados[1]).decode('utf-8')
        return login, senha
    return None, None

def verificar_senha_mestra(user_id, senha_digitada):
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT senha FROM usuarios WHERE id = ?", (user_id,))
    hashed_senha = cursor.fetchone()
    conexao.close()
    
    if hashed_senha and bcrypt.checkpw(senha_digitada.encode('utf-8'), hashed_senha[0]):
         return True
    return False