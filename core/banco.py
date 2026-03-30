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
    
    # NOVA TABELA PARA SENHAS PERSONALIZADAS - Adicionada coluna url_site
    cursor.execute('''CREATE TABLE IF NOT EXISTS acessos_personalizados (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        nome_site TEXT, url_site TEXT, login_acesso TEXT, senha_acesso TEXT, 
                        user_id INTEGER, FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
    
    # Migração segura: Tenta adicionar a coluna url_site caso a tabela já exista sem ela
    try:
        cursor.execute("ALTER TABLE acessos_personalizados ADD COLUMN url_site TEXT")
    except sqlite3.OperationalError:
        pass # Coluna já existe
    
    cursor.execute('''CREATE TABLE IF NOT EXISTS onibus (
                        id INTEGER PRIMARY KEY AUTOINCREMENT, 
                        nome TEXT UNIQUE, 
                        capacidade INTEGER)''')

    # NOVA TABELA: HISTÓRICO DE RELATÓRIOS E BACKUPS
    cursor.execute('''CREATE TABLE IF NOT EXISTS relatorios_history (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id INTEGER,
                        nome_automacao TEXT,
                        data_execucao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        parametros_json TEXT, -- Salva o JSON dos filtros usados
                        arquivo_nome TEXT,
                        arquivo_path_backup TEXT,
                        status TEXT,
                        job_id TEXT UNIQUE,
                        FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
    
    # Migração segura: Adiciona job_id se não existir
    try:
        cursor.execute("ALTER TABLE relatorios_history ADD COLUMN job_id TEXT")
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_job_id ON relatorios_history(job_id)")
    except sqlite3.OperationalError:
        pass

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

def adicionar_credencial_site(user_id, servico, login_site, senha_site, eh_personalizado=False, url_site=None):
    fernet = obter_fernet()
    senha_cripto = fernet.encrypt(senha_site.encode('utf-8')).decode('utf-8')
    
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    
    if eh_personalizado:
        # Tabela personalizada usa nome_site e url_site separadamente
        cursor.execute("DELETE FROM acessos_personalizados WHERE user_id = ? AND nome_site = ?", (user_id, servico))
        cursor.execute('''INSERT INTO acessos_personalizados (nome_site, url_site, login_acesso, senha_acesso, user_id)
                          VALUES (?, ?, ?, ?, ?)''', (servico, url_site, login_site, senha_cripto, user_id))
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
    cursor.execute("SELECT id, nome_site, url_site, login_acesso, senha_acesso FROM acessos_personalizados WHERE user_id = ?", (user_id,))
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
        lista.append({"id": d[0], "site": d[1], "user": d[2], "pass": senha, "type": "system", "url": None})

    # Processar Personalizados
    for d in dados_pers:
        try:
            token = d[4]
            if isinstance(token, str): token = token.encode('utf-8')
            senha = fernet.decrypt(token).decode('utf-8')
        except:
            senha = "Erro decript"
        lista.append({"id": d[0], "site": d[1], "url_custom": d[2], "user": d[3], "pass": senha, "type": "custom"})

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

def buscar_credencial_site(user_id, servico):
    """
    Busca credenciais (login/senha) de um sistema (acessos) 
    ou site personalizado (acessos_personalizados)
    """
    try:
        conexao = sqlite3.connect(DB_PATH)
        cursor = conexao.cursor()
        
        # 1. Tentar na tabela de sistemas
        cursor.execute("SELECT login_acesso, senha_acesso FROM acessos WHERE user_id = ? AND servico = ?", (user_id, servico))
        res = cursor.fetchone()
        
        # 2. Se não achar, tentar na tabela personalizada (site name)
        if not res:
            cursor.execute("SELECT login_acesso, senha_acesso FROM acessos_personalizados WHERE user_id = ? AND nome_site = ?", (user_id, servico))
            res = cursor.fetchone()
            
        conexao.close()
        
        if res:
            fernet = obter_fernet()
            token = res[1]
            if isinstance(token, str): token = token.encode('utf-8')
            senha_dec = fernet.decrypt(token).decode('utf-8')
            return (res[0], senha_dec)  # Retornar tupla para facilitar desempacotamento
    except Exception as e:
        print(f"[DB_ERROR] {e}")
    return None, None  # Retornar dois valores nulos se falhar


# --- FUNÇÕES DE HISTÓRICO DE RELATÓRIOS ---

def salvar_historico_relatorio(user_id, nome_automacao, parametros, arquivo_nome, path_backup, status="completed", job_id=None):
    """Salva ou atualiza um registro no histórico de relatórios."""
    import json
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    params_str = parametros if isinstance(parametros, str) else json.dumps(parametros)
    
    # Se houver job_id, tenta atualizar primeiro
    if job_id and job_id.strip() != "":
        cursor.execute("SELECT id FROM relatorios_history WHERE job_id = ?", (job_id,))
        exists = cursor.fetchone()
        if exists:
            cursor.execute('''UPDATE relatorios_history 
                              SET status = ?, arquivo_nome = ?, arquivo_path_backup = ?, nome_automacao = ?, data_execucao = datetime('now', 'localtime')
                              WHERE job_id = ?''', (status, arquivo_nome, path_backup, nome_automacao, job_id))
            conexao.commit()
            conexao.close()
            return

    cursor.execute('''INSERT INTO relatorios_history 
                      (user_id, nome_automacao, parametros_json, arquivo_nome, arquivo_path_backup, status, job_id, data_execucao)
                      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))''', 
                   (user_id, nome_automacao, params_str, arquivo_nome, path_backup, status, job_id if job_id and job_id.strip() != "" else None))
    conexao.commit()
    conexao.close()

def listar_historico_relatorios(limit=None, user_id=None):
    """Lista os últimos relatórios do histórico, opcionalmente filtrando por usuário."""
    import json
    import sqlite3
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    
    query = "SELECT id, nome_automacao, data_execucao, parametros_json, arquivo_nome, arquivo_path_backup, status FROM relatorios_history"
    params_query = []
    
    if user_id:
        query += " WHERE user_id = ?"
        params_query.append(user_id)
        
    query += " ORDER BY data_execucao DESC"
    
    if limit:
        query += " LIMIT ?"
        params_query.append(limit)
        
    cursor.execute(query, params_query)
    rows = cursor.fetchall()
    conexao.close()
    
    resultado = []
    for r in rows:
        try:
            params = json.loads(r[3]) if r[3] else {}
        except:
            params = {}
            
        resultado.append({
            "id": r[0],
            "nome_automacao": r[1],
            "data": r[2],
            "params": params,
            "arquivo_nome": r[4],
            "path_backup": r[5],
            "status": r[6]
        })
    return resultado

def excluir_historico_antigo(dias=30):
    """Remove registros e prepara para deleção de arquivos físicos com mais de X dias."""
    import sqlite3
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    # Busca arquivos que devem ser deletados fisicamente
    cursor.execute(f"SELECT arquivo_path_backup FROM relatorios_history WHERE data_execucao < date('now', '-{dias} days')")
    arquivos_para_remover = [r[0] for r in cursor.fetchall() if r[0]]
    
    # Remove do banco
    cursor.execute(f"DELETE FROM relatorios_history WHERE data_execucao < date('now', '-{dias} days')")
    conexao.commit()
    conexao.close()
    return arquivos_para_remover

def excluir_historico_id(record_id):
    """Remove um registro específico do histórico pelo ID."""
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("DELETE FROM relatorios_history WHERE id = ?", (record_id,))
    conexao.commit()
    conexao.close()
    return True

