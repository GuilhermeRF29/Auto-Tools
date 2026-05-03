"""
core/banco.py — Módulo de acesso ao banco de dados SQLite.

Responsável por todas as operações de persistência do Auto Tools:
  - Gerenciamento de usuários (cadastro, login com bcrypt)
  - Cofre de senhas (credenciais criptografadas com Fernet)
  - Cadastro de ônibus (veículos e capacidades)
  - Histórico de relatórios e backups de automações
  - Inicialização e migração segura do schema

Segurança:
  - Senhas de usuário são hasheadas com bcrypt (salt automático)
  - Credenciais do cofre são criptografadas com Fernet (AES-128-CBC)
  - Chave mestra armazenada no .env (nunca versionada)
  - Todas as queries usam parâmetros (sem f-strings/SQL injection)
"""

import os
import json
import sqlite3
import shutil
import bcrypt
import sys
from pathlib import Path
from cryptography.fernet import Fernet
from dotenv import load_dotenv
from datetime import datetime

# Firebase Integration
try:
    import firebase_admin
    from firebase_admin import credentials, firestore, auth
    HAS_FIREBASE = True
except ImportError:
    HAS_FIREBASE = False


# ============================================================
# CONFIGURAÇÃO DE CAMINHOS
# Compatível com modo desenvolvimento (.py) e compilado (.exe)
# ============================================================

if getattr(sys, 'frozen', False):
    # Modo compilado (PyInstaller/Electron): BASE_DIR = pasta do .exe
    BASE_DIR = Path(sys.executable).resolve().parent
    # ASSETS_DIR = pasta temporária interna do PyInstaller (recursos embutidos)
    ASSETS_DIR = Path(getattr(sys, '_MEIPASS', BASE_DIR))
else:
    # Modo desenvolvimento: BASE_DIR = raiz do projeto (um nível acima de /core)
    BASE_DIR = Path(__file__).resolve().parent.parent
    ASSETS_DIR = BASE_DIR

# Caminhos do banco de dados e arquivo de variáveis de ambiente
DATA_DIR_ENV = os.getenv("AUTOTOOLS_DATA_DIR", "").strip()
if DATA_DIR_ENV:
    DATA_DIR = Path(DATA_DIR_ENV).expanduser().resolve()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
else:
    DATA_DIR = BASE_DIR

DB_PATH = DATA_DIR / "Userbank.db"
ENV_PATH = DATA_DIR / ".env"
FIREBASE_CREDS_PATH = BASE_DIR / "firebase-credentials.json"
DB_MIGRATION_BACKUP_DIR = DATA_DIR / "db_backups"
APP_DB_SCHEMA_VERSION = 2

# Global Firebase app instance
_firebase_app = None
FIRESTORE_TIMEOUT_SECONDS = float(os.getenv("AUTOTOOLS_FIREBASE_TIMEOUT_SECONDS", "5"))

def inicializar_firebase():
    """Inicializa o SDK do Firebase se as credenciais existirem."""
    global _firebase_app
    print(f"[FIREBASE_DEBUG] HAS_FIREBASE={HAS_FIREBASE}, already_app={_firebase_app is not None}")
    
    if not HAS_FIREBASE:
        print("[FIREBASE_DEBUG] firebase_admin não instalado, retornando None")
        return None
    if _firebase_app:
        print("[FIREBASE_DEBUG] Firebase já inicializado anteriormente")
        return _firebase_app
    
    # Procurar credenciais em múltiplos locais
    paths = [
        FIREBASE_CREDS_PATH,
        DATA_DIR / "firebase-credentials.json",
        Path.cwd() / "firebase-credentials.json"
    ]
    print(f"[FIREBASE_DEBUG] Procurando credenciais em: {paths}")
    
    creds_file = next((p for p in paths if p.exists()), None)
    if not creds_file:
        print(f"[FIREBASE_DEBUG] Nenhum arquivo de credenciais encontrado")
        return None
    
    print(f"[FIREBASE_DEBUG] Credenciais encontradas em: {creds_file}")
    try:
        cred = credentials.Certificate(str(creds_file))
        print(f"[FIREBASE_DEBUG] Certificado carregado com sucesso")
        _firebase_app = firebase_admin.initialize_app(cred)
        print(f"[FIREBASE_DEBUG] Firebase app inicializado com sucesso")
        return _firebase_app
    except Exception as e:
        print(f"[FIREBASE_ERROR] Erro ao inicializar Firebase: {type(e).__name__}: {e}")
        import traceback
        print(f"[FIREBASE_ERROR] Traceback completo:\n{traceback.format_exc()}")
        return None

def get_firestore():
    """Retorna cliente do Firestore se disponível."""
    if not inicializar_firebase():
        return None
    try:
        return firestore.client()
    except Exception:
        return None


def _looks_like_legacy_seed_db(db_path):
    """Detecta bancos legados que ainda carregam dados de teste embarcados."""
    if not db_path.exists():
        return False

    try:
        with sqlite3.connect(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0] for row in cursor.fetchall()}

            if "app_meta" in tables:
                return False

            if "usuarios" not in tables:
                return False

            cursor.execute("SELECT COUNT(*) FROM usuarios")
            user_count = int(cursor.fetchone()[0] or 0)

            history_count = 0
            if "relatorios_history" in tables:
                cursor.execute("SELECT COUNT(*) FROM relatorios_history")
                history_count = int(cursor.fetchone()[0] or 0)

            return user_count > 1 and history_count > 50
    except Exception as e:
        print(f"[DB_DEBUG] Falha ao inspecionar DB legado: {type(e).__name__}: {e}")
        return False


def _backup_legacy_db(db_path):
    """Move o banco legado para backup antes de recriar um banco limpo."""
    try:
        DB_MIGRATION_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        backup_name = f"Userbank.legacy.{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
        backup_path = DB_MIGRATION_BACKUP_DIR / backup_name
        shutil.move(str(db_path), str(backup_path))
        print(f"[DB_DEBUG] Banco legado movido para backup: {backup_path}")
        return backup_path
    except Exception as e:
        print(f"[DB_ERROR] Não foi possível fazer backup do banco legado: {type(e).__name__}: {e}")
        return None


# ============================================================
# INICIALIZAÇÃO DO AMBIENTE (.env e chave mestra)
# ============================================================

def inicializar_env():
    """
    Cria o arquivo .env com uma chave Fernet aleatória se não existir.
    Essa chave é usada para criptografar/descriptografar as senhas do cofre.
    Deve ser chamada apenas uma vez, na instalação do sistema.
    """
    if not ENV_PATH.exists():
        chave = Fernet.generate_key().decode()
        with open(ENV_PATH, 'w', encoding='utf-8') as f:
            f.write("# CHAVE DE LOGIN DO SISTEMA - GERADA AUTOMATICAMENTE\n")
            f.write(f"CHAVE_LOGIN={chave}\n")
            f.write("DATABASE_NAME=Userbank.db\n")
        print("Arquivo .env e chave mestra criados com sucesso!")


def obter_fernet():
    """
    Carrega a chave Fernet do .env e retorna uma instância pronta para uso.
    
    Returns:
        Fernet: Instância de criptografia inicializada.
    
    Raises:
        ValueError: Se CHAVE_LOGIN não foi encontrada no .env.
    """
    load_dotenv(ENV_PATH)
    chave = os.getenv("CHAVE_LOGIN")
    if chave is None:
        raise ValueError(
            "CHAVE_LOGIN não encontrada no .env. "
            "Execute inicializar_env() primeiro."
        )
    return Fernet(chave.encode())


# ============================================================
# CONFIGURAÇÃO E MIGRAÇÃO DO BANCO DE DADOS
# ============================================================

def configurar_banco():
    """
    Cria todas as tabelas e aplica migrações de schema.
    Seguro para chamar múltiplas vezes (usa IF NOT EXISTS).
    
    Tabelas criadas:
      - usuarios: Cadastro de usuários com senha bcrypt
      - acessos: Credenciais de sistemas pré-definidos (EBUS, ADM, etc.)
      - acessos_personalizados: Credenciais de sites personalizados
      - onibus: Cadastro de tipos de ônibus com capacidade
      - relatorios_history: Histórico de execuções de automações
    """
    print(f"[DB_DEBUG] Iniciando configuração do banco: DB_PATH={DB_PATH}")
    
    try:
        if _looks_like_legacy_seed_db(DB_PATH):
            print(f"[DB_DEBUG] Banco legado com dados de teste detectado; criando backup e iniciando banco limpo")
            _backup_legacy_db(DB_PATH)

        conexao = sqlite3.connect(DB_PATH)
        print(f"[DB_DEBUG] Conexão SQLite estabelecida")
        cursor = conexao.cursor()
        cursor.execute("PRAGMA foreign_keys = ON")
        print(f"[DB_DEBUG] PRAGMA foreign_keys ativado")

        cursor.execute('''CREATE TABLE IF NOT EXISTS app_meta (
                            chave TEXT PRIMARY KEY,
                            valor TEXT NOT NULL)''')
        cursor.execute(
            "INSERT OR REPLACE INTO app_meta (chave, valor) VALUES (?, ?)",
            ("schema_version", str(APP_DB_SCHEMA_VERSION))
        )
        cursor.execute(
            "INSERT OR REPLACE INTO app_meta (chave, valor) VALUES (?, ?)",
            ("last_initialized_at", datetime.now().isoformat())
        )
        print(f"[DB_DEBUG] Tabela 'app_meta' criada/verificada com schema_version={APP_DB_SCHEMA_VERSION}")

        # Tabela de usuários do sistema
        cursor.execute('''CREATE TABLE IF NOT EXISTS usuarios (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nome TEXT,
                            usuario TEXT UNIQUE,
                            senha TEXT)''')
        print(f"[DB_DEBUG] Tabela 'usuarios' criada/verificada")

        # Tabela de credenciais de sistemas pré-definidos (EBUS, ADM, BI)
        cursor.execute('''CREATE TABLE IF NOT EXISTS acessos (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            servico TEXT, login_acesso TEXT, senha_acesso TEXT,
                            user_id INTEGER,
                            FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
        print(f"[DB_DEBUG] Tabela 'acessos' criada/verificada")

        # Tabela de credenciais personalizadas (sites adicionados pelo usuário)
        cursor.execute('''CREATE TABLE IF NOT EXISTS acessos_personalizados (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nome_site TEXT, url_site TEXT,
                            login_acesso TEXT, senha_acesso TEXT,
                            user_id INTEGER,
                            FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
        print(f"[DB_DEBUG] Tabela 'acessos_personalizados' criada/verificada")

        # Migração segura: adiciona url_site caso tabela já exista sem a coluna
        try:
            cursor.execute("ALTER TABLE acessos_personalizados ADD COLUMN url_site TEXT")
            print(f"[DB_DEBUG] Coluna 'url_site' adicionada a 'acessos_personalizados'")
        except sqlite3.OperationalError:
            print(f"[DB_DEBUG] Coluna 'url_site' já existe")

        # Tabela de tipos de ônibus com capacidade
        cursor.execute('''CREATE TABLE IF NOT EXISTS onibus (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            nome TEXT UNIQUE,
                            capacidade INTEGER)''')
        print(f"[DB_DEBUG] Tabela 'onibus' criada/verificada")

        # Tabela de histórico de execuções de automações e backups
        cursor.execute('''CREATE TABLE IF NOT EXISTS relatorios_history (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            user_id INTEGER,
                            nome_automacao TEXT,
                            data_execucao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            parametros_json TEXT,
                            arquivo_nome TEXT,
                            arquivo_path_backup TEXT,
                            status TEXT,
                            job_id TEXT UNIQUE,
                            FOREIGN KEY (user_id) REFERENCES usuarios(id))''')
        print(f"[DB_DEBUG] Tabela 'relatorios_history' criada/verificada")

        # Migração segura: adiciona job_id caso já exista sem a coluna
        try:
            cursor.execute("ALTER TABLE relatorios_history ADD COLUMN job_id TEXT")
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_job_id "
                "ON relatorios_history(job_id)"
            )
            print(f"[DB_DEBUG] Coluna 'job_id' adicionada a 'relatorios_history'")
        except sqlite3.OperationalError:
            print(f"[DB_DEBUG] Coluna 'job_id' já existe")

        conexao.commit()
        conexao.close()
        print(f"[DB_DEBUG] Banco de dados configurado com sucesso")
        return True
    except Exception as e:
        print(f"[DB_ERROR] Erro ao configurar banco: {type(e).__name__}: {e}")
        import traceback
        print(f"[DB_ERROR] Traceback: {traceback.format_exc()}")
        return False


# ============================================================
# AUTENTICAÇÃO DE USUÁRIOS
# ============================================================

def cadastrar_usuario_principal(nome, usuario, senha):
    """
    Cadastra um novo usuário no sistema com senha hasheada via bcrypt.
    
    Args:
        nome: Nome de exibição do usuário.
        usuario: Login único do usuário.
        senha: Senha em texto plano (será hasheada com bcrypt).
    
    Returns:
        bool: True se cadastrado com sucesso, False se o usuário já existe.
    """
    print(f"[AUTH_DEBUG] Iniciando cadastro: usuario={usuario}")
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    hash_senha = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    print(f"[AUTH_DEBUG] Senha hasheada com bcrypt, tentando INSERT no banco local")
    
    try:
        cursor.execute(
            "INSERT INTO usuarios (nome, usuario, senha) VALUES (?, ?, ?)",
            (nome, usuario, hash_senha)
        )
        conexao.commit()
        print(f"[AUTH_DEBUG] Usuário {usuario} inserido no SQLite com sucesso")
        
        # --- Sincronização Nuvem (Firebase) ---
        db = get_firestore()
        if db:
            try:
                print(f"[AUTH_DEBUG] Firebase disponível, tentando sincronizar usuário {usuario}")
                db.collection("usuarios").document(usuario).set({
                    "nome": nome,
                    "usuario": usuario,
                    "senha": hash_senha, # Hash espelhado para fallback offline
                    "criado_em": firestore.SERVER_TIMESTAMP
                }, timeout=FIRESTORE_TIMEOUT_SECONDS)
                print(f"[AUTH_DEBUG] Usuário {usuario} sincronizado no Firebase com sucesso")
            except Exception as e:
                print(f"[FIREBASE] Erro ao sincronizar usuário {usuario}: {e}")
        else:
            print(f"[AUTH_DEBUG] Firebase não disponível, apenas local persistido")
        
        return True
    except sqlite3.IntegrityError as e:
        print(f"[AUTH_ERROR] IntegrityError ao cadastrar {usuario}: {e} (provavelmente já existe)")
        return False  # Usuário já existe
    except Exception as e:
        print(f"[AUTH_ERROR] Erro inesperado ao cadastrar {usuario}: {type(e).__name__}: {e}")
        import traceback
        print(f"[AUTH_ERROR] Traceback: {traceback.format_exc()}")
        return False
    finally:
        conexao.close()


def _validar_senha_usuario(user, senha_digitada):
    """Valida senha bcrypt e também suporte legado em texto puro (com migração)."""
    if not user:
        return False

    user_id = user[0]
    senha_armazenada = user[2]

    # Normaliza valor vindo do SQLite (TEXT/bytes)
    if isinstance(senha_armazenada, bytes):
        senha_armazenada = senha_armazenada.decode('utf-8', errors='ignore')
    else:
        senha_armazenada = str(senha_armazenada or '')

    # Caminho padrão: hash bcrypt
    if senha_armazenada.startswith('$2'):
        try:
            return bcrypt.checkpw(senha_digitada.encode('utf-8'), senha_armazenada.encode('utf-8'))
        except Exception as e:
            print(f"[AUTH_ERROR] Falha ao validar bcrypt: {type(e).__name__}: {e}")
            return False

    # Compat legado: senha em texto puro
    if senha_armazenada == senha_digitada:
        try:
            novo_hash = bcrypt.hashpw(senha_digitada.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("UPDATE usuarios SET senha = ? WHERE id = ?", (novo_hash, user_id))
            print(f"[AUTH_DEBUG] Senha legada migrada para bcrypt: user_id={user_id}")
        except Exception as e:
            print(f"[AUTH_ERROR] Falha ao migrar senha legada: {type(e).__name__}: {e}")
        return True

    return False


def login_principal(usuario, senha):
    """
    Autentica um usuário verificando a senha com bcrypt.
    
    Args:
        usuario: Login do usuário.
        senha: Senha em texto plano para verificação.
    
    Returns:
        tuple: (id, nome) se autenticado, (None, None) se inválido.
    """
    print(f"[AUTH_DEBUG] Iniciando login: usuario={usuario}")
    
    # 1. Verificação Local primeiro para não bloquear login em máquinas sem rede.
    try:
        conexao = sqlite3.connect(DB_PATH)
        print(f"[AUTH_DEBUG] Conectado ao SQLite em {DB_PATH}")
        cursor = conexao.cursor()
        cursor.execute(
            "SELECT id, nome, senha FROM usuarios WHERE usuario = ?",
            (usuario,)
        )
        user = cursor.fetchone()
        conexao.close()
        print(f"[AUTH_DEBUG] Consulta local: usuario encontrado={user is not None}")

        if _validar_senha_usuario(user, senha):
            print(f"[AUTH_DEBUG] Login local bem-sucedido: usuario={usuario}, id={user[0]}")
            return user[0], user[1]  # (ID, Nome)
        else:
            print(f"[AUTH_DEBUG] Senha local inválida ou usuário não encontrado")
    except Exception as e:
        print(f"[AUTH_ERROR] Erro ao verificar local: {type(e).__name__}: {e}")
        import traceback
        print(f"[AUTH_ERROR] Traceback: {traceback.format_exc()}")

    # 2. Tentar Sincronizar da Nuvem para o Local (se online)
    print(f"[AUTH_DEBUG] Tentando sync do Firebase")
    db = get_firestore()
    if db:
        try:
            print(f"[AUTH_DEBUG] Firebase disponível, buscando usuário {usuario} no Firestore")
            doc = db.collection("usuarios").document(usuario).get(timeout=FIRESTORE_TIMEOUT_SECONDS)
            if doc.exists:
                data = doc.to_dict()
                print(f"[AUTH_DEBUG] Usuário encontrado no Firestore, atualizando local")
                # Atualizar/Inserir no banco local para permitir login offline futuro
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute(
                        "INSERT OR REPLACE INTO usuarios (nome, usuario, senha) VALUES (?, ?, ?)",
                        (data['nome'], data['usuario'], str(data.get('senha', '')))
                    )
                print(f"[AUTH_DEBUG] Usuário sincronizado do Firestore para local")
                
                # Agora tentar login localmente com a senha sincronizada
                try:
                    conexao = sqlite3.connect(DB_PATH)
                    cursor = conexao.cursor()
                    cursor.execute(
                        "SELECT id, nome, senha FROM usuarios WHERE usuario = ?",
                        (usuario,)
                    )
                    user = cursor.fetchone()
                    conexao.close()
                    if _validar_senha_usuario(user, senha):
                        print(f"[AUTH_DEBUG] Login bem-sucedido após sync do Firebase: usuario={usuario}, id={user[0]}")
                        return user[0], user[1]
                    else:
                        print(f"[AUTH_DEBUG] Senha inválida mesmo após sync do Firebase")
                except Exception as e:
                    print(f"[AUTH_ERROR] Erro ao fazer login após sync: {type(e).__name__}: {e}")
            else:
                print(f"[AUTH_DEBUG] Usuário {usuario} não encontrado no Firestore")
        except Exception as e:
            print(f"[FIREBASE] Erro ao sincronizar login: {type(e).__name__}: {e}")
            import traceback
            print(f"[FIREBASE] Traceback: {traceback.format_exc()}")
    else:
        print(f"[AUTH_DEBUG] Firebase não disponível, skipping sync")

    print(f"[AUTH_DEBUG] Login falhou para usuario={usuario}")
    return None, None


def verificar_senha_mestra(user_id, senha_digitada):
    """
    Verifica a senha mestra de um usuário (usada antes de exibir o cofre).
    
    Args:
        user_id: ID do usuário no banco.
        senha_digitada: Senha fornecida pelo usuário para verificação.
    
    Returns:
        bool: True se a senha confere, False caso contrário.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT senha FROM usuarios WHERE id = ?", (user_id,))
    resultado = cursor.fetchone()
    conexao.close()

    if resultado and bcrypt.checkpw(senha_digitada.encode('utf-8'), resultado[0]):
        return True
    return False


# ============================================================
# COFRE DE SENHAS (Credenciais Criptografadas)
# ============================================================

def adicionar_credencial_site(user_id, servico, login_site, senha_site,
                               eh_personalizado=False, url_site=None):
    """
    Salva ou atualiza uma credencial no cofre (criptografada com Fernet).
    
    Se já existe uma credencial para o mesmo serviço/site, ela é substituída
    (DELETE + INSERT) para evitar duplicatas.
    
    Args:
        user_id: ID do usuário dono da credencial.
        servico: Nome do serviço/site (ex: 'EBUS', 'Google').
        login_site: Login/e-mail de acesso.
        senha_site: Senha em texto plano (será criptografada).
        eh_personalizado: True para sites personalizados, False para sistemas.
        url_site: URL do site (apenas para personalizados).
    """
    fernet = obter_fernet()
    senha_cripto = fernet.encrypt(senha_site.encode('utf-8')).decode('utf-8')

    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()

    if eh_personalizado:
        # Sites personalizados usam tabela separada com nome_site e url_site
        cursor.execute(
            "DELETE FROM acessos_personalizados WHERE user_id = ? AND nome_site = ?",
            (user_id, servico)
        )
        cursor.execute(
            '''INSERT INTO acessos_personalizados 
               (nome_site, url_site, login_acesso, senha_acesso, user_id)
               VALUES (?, ?, ?, ?, ?)''',
            (servico, url_site, login_site, senha_cripto, user_id)
        )
    else:
        # Sistemas pré-definidos (EBUS, ADM, BI)
        cursor.execute(
            "DELETE FROM acessos WHERE user_id = ? AND servico = ?",
            (user_id, servico)
        )
        cursor.execute(
            '''INSERT INTO acessos (servico, login_acesso, senha_acesso, user_id)
               VALUES (?, ?, ?, ?)''',
            (servico, login_site, senha_cripto, user_id)
        )

    conexao.commit()
    conexao.close()

    # --- Sincronização Nuvem (Firebase) ---
    db = get_firestore()
    if db:
        try:
            # Pegar o nome de usuário para usar como ID na nuvem (IDs numéricos mudam entre máquinas)
            username = None
            with sqlite3.connect(DB_PATH) as conn:
                res = conn.execute("SELECT usuario FROM usuarios WHERE id = ?", (user_id,)).fetchone()
                if res: username = res[0]
            
            if username:
                payload = {
                    "servico": servico,
                    "login": login_site,
                    "senha": senha_cripto,
                    "type": "custom" if eh_personalizado else "system",
                    "url": url_site,
                    "updated_at": firestore.SERVER_TIMESTAMP
                }
                # Salvar em vault/{username}/items/{servico}
                db.collection("vault").document(username).collection("items").document(servico).set(
                    payload,
                    timeout=FIRESTORE_TIMEOUT_SECONDS
                )
        except Exception as e:
            print(f"[FIREBASE] Erro ao sincronizar credencial: {e}")


def listar_credenciais(user_id):
    """
    Lista todas as credenciais do cofre para um usuário, descriptografando as senhas.
    
    Args:
        user_id: ID do usuário.
    
    Returns:
        list[dict]: Lista de credenciais com campos id, site, user, pass, type, url.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()

    # Buscar credenciais de sistemas pré-definidos
    cursor.execute(
        "SELECT id, servico, login_acesso, senha_acesso FROM acessos WHERE user_id = ?",
        (user_id,)
    )
    dados_sist = cursor.fetchall()

    # Buscar credenciais personalizadas
    cursor.execute(
        "SELECT id, nome_site, url_site, login_acesso, senha_acesso "
        "FROM acessos_personalizados WHERE user_id = ?",
        (user_id,)
    )
    dados_pers = cursor.fetchall()
    conexao.close()

    lista = []
    fernet = obter_fernet()

    # --- Sincronização Nuvem -> Local ---
    db = get_firestore()
    if db:
        try:
            username = None
            with sqlite3.connect(DB_PATH) as conn:
                res = conn.execute("SELECT usuario FROM usuarios WHERE id = ?", (user_id,)).fetchone()
                if res: username = res[0]
            
            if username:
                docs = db.collection("vault").document(username).collection("items").stream(
                    timeout=FIRESTORE_TIMEOUT_SECONDS
                )
                with sqlite3.connect(DB_PATH) as conn:
                    for doc in docs:
                        d = doc.to_dict()
                        if d.get("type") == "custom":
                            conn.execute(
                                "INSERT OR REPLACE INTO acessos_personalizados (nome_site, url_site, login_acesso, senha_acesso, user_id) VALUES (?, ?, ?, ?, ?)",
                                (d['servico'], d['url'], d['login'], d['senha'], user_id)
                            )
                        else:
                            conn.execute(
                                "INSERT OR REPLACE INTO acessos (servico, login_acesso, senha_acesso, user_id) VALUES (?, ?, ?, ?)",
                                (d['servico'], d['login'], d['senha'], user_id)
                            )
        except Exception as e:
            print(f"[FIREBASE] Erro ao sincronizar cofre: {e}")

    # Buscar credenciais de sistemas pré-definidos
    for d in dados_sist:
        try:
            token = d[3]
            if isinstance(token, str):
                token = token.encode('utf-8')
            senha = fernet.decrypt(token).decode('utf-8')
        except Exception:
            senha = "Erro ao descriptografar"
        lista.append({
            "id": d[0], "site": d[1], "user": d[2],
            "pass": senha, "type": "system", "url": None
        })

    # Processar credenciais personalizadas
    for d in dados_pers:
        try:
            token = d[4]
            if isinstance(token, str):
                token = token.encode('utf-8')
            senha = fernet.decrypt(token).decode('utf-8')
        except Exception:
            senha = "Erro ao descriptografar"
        lista.append({
            "id": d[0], "site": d[1], "url_custom": d[2],
            "user": d[3], "pass": senha, "type": "custom"
        })

    return lista


def excluir_credencial(credential_id, eh_personalizado=False):
    """
    Remove uma credencial do cofre pelo ID.
    
    Args:
        credential_id: ID da credencial no banco.
        eh_personalizado: True para credencial personalizada, False para sistema.
    
    Returns:
        bool: Sempre True (operação concluída).
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    if eh_personalizado:
        cursor.execute("DELETE FROM acessos_personalizados WHERE id = ?", (credential_id,))
    else:
        cursor.execute("DELETE FROM acessos WHERE id = ?", (credential_id,))
    conexao.commit()
    conexao.close()
    return True


def buscar_credencial_site(user_id, servico):
    """
    Busca login e senha de um serviço específico para uso nas automações.
    Procura primeiro nos sistemas pré-definidos, depois nos personalizados.
    
    Args:
        user_id: ID do usuário.
        servico: Nome do serviço/site a buscar.
    
    Returns:
        tuple: (login, senha_descriptografada) ou (None, None) se não encontrada.
    """
    try:
        conexao = sqlite3.connect(DB_PATH)
        cursor = conexao.cursor()

        # 1. Buscar na tabela de sistemas pré-definidos
        cursor.execute(
            "SELECT login_acesso, senha_acesso FROM acessos "
            "WHERE user_id = ? AND servico = ?",
            (user_id, servico)
        )
        res = cursor.fetchone()

        # 2. Se não encontrou, buscar nos personalizados
        if not res:
            cursor.execute(
                "SELECT login_acesso, senha_acesso FROM acessos_personalizados "
                "WHERE user_id = ? AND nome_site = ?",
                (user_id, servico)
            )
            res = cursor.fetchone()

        conexao.close()

        if res:
            fernet = obter_fernet()
            token = res[1]
            if isinstance(token, str):
                token = token.encode('utf-8')
            senha_dec = fernet.decrypt(token).decode('utf-8')
            return (res[0], senha_dec)
    except Exception as e:
        print(f"[DB_ERROR] Erro ao buscar credencial: {e}")
    return None, None


# ============================================================
# GERENCIAMENTO DE ÔNIBUS (Veículos)
# ============================================================

def inicializar_onibus_padrao():
    """
    Insere os tipos padrão de ônibus no banco (se ainda não existirem).
    Usa INSERT OR IGNORE para evitar duplicatas na reinicialização.
    """
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
        cursor.execute(
            "INSERT OR IGNORE INTO onibus (nome, capacidade) VALUES (?, ?)",
            (nome, cap)
        )
    conexao.commit()
    conexao.close()


def listar_onibus():
    """
    Lista todos os tipos de ônibus cadastrados, ordenados por nome.
    
    Returns:
        list[tuple]: Lista de (nome, capacidade).
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("SELECT nome, capacidade FROM onibus ORDER BY nome ASC")
    res = cursor.fetchall()
    conexao.close()
    return res


def salvar_onibus(nome, capacidade):
    """
    Cadastra ou atualiza um tipo de ônibus.
    Usa INSERT OR REPLACE para atualizar se o nome já existir.
    
    Args:
        nome: Nome do tipo de ônibus (ex: 'EXECUTIVO').
        capacidade: Capacidade de passageiros.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO onibus (nome, capacidade) VALUES (?, ?)",
        (nome, capacidade)
    )
    conexao.commit()
    conexao.close()


# ============================================================
# HISTÓRICO DE RELATÓRIOS E BACKUPS
# ============================================================

def salvar_historico_relatorio(user_id, nome_automacao, parametros,
                                arquivo_nome, path_backup,
                                status="completed", job_id=None):
    """
    Salva ou atualiza um registro no histórico de relatórios.
    Se job_id já existe, atualiza o registro existente (upsert por job_id).
    
    Args:
        user_id: ID do usuário que executou (pode ser None para sistema).
        nome_automacao: Nome descritivo da automação executada.
        parametros: Dicionário ou string JSON com filtros/configurações usadas.
        arquivo_nome: Nome do arquivo gerado (ou 'Nenhum arquivo gerado').
        path_backup: Caminho completo do backup salvo.
        status: Estado final ('running', 'completed', 'failed', 'cancelled').
        job_id: Identificador único do job (para atualização posterior).
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    params_str = parametros if isinstance(parametros, str) else json.dumps(parametros)

    # Se há job_id, tenta atualizar registro existente primeiro
    if job_id and str(job_id).strip():
        cursor.execute(
            "SELECT id FROM relatorios_history WHERE job_id = ?",
            (job_id,)
        )
        exists = cursor.fetchone()
        if exists:
            cursor.execute(
                '''UPDATE relatorios_history 
                   SET status = ?, arquivo_nome = ?, arquivo_path_backup = ?,
                       nome_automacao = ?, data_execucao = datetime('now', 'localtime')
                   WHERE job_id = ?''',
                (status, arquivo_nome, path_backup, nome_automacao, job_id)
            )
            conexao.commit()
            conexao.close()
            return

    # Inserir novo registro
    safe_job_id = job_id if (job_id and str(job_id).strip()) else None
    cursor.execute(
        '''INSERT INTO relatorios_history 
           (user_id, nome_automacao, parametros_json, arquivo_nome,
            arquivo_path_backup, status, job_id, data_execucao)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))''',
        (user_id, nome_automacao, params_str, arquivo_nome,
         path_backup, status, safe_job_id)
    )
    conexao.commit()
    conexao.close()

    # --- Sincronização Nuvem (Firebase) ---
    db = get_firestore()
    if db:
        try:
            username = "sistema"
            if user_id:
                with sqlite3.connect(DB_PATH) as conn:
                    res = conn.execute("SELECT usuario FROM usuarios WHERE id = ?", (user_id,)).fetchone()
                    if res: username = res[0]
            
            doc_id = str(job_id) if job_id else f"hist_{int(datetime.now().timestamp())}"
            db.collection("history").document(doc_id).set({
                "username": username,
                "automacao": nome_automacao,
                "parametros": params_str,
                "arquivo": arquivo_nome,
                "status": status,
                "timestamp": firestore.SERVER_TIMESTAMP
            }, timeout=FIRESTORE_TIMEOUT_SECONDS)
        except Exception as e:
            print(f"[FIREBASE] Erro ao sincronizar histórico: {e}")


def listar_historico_relatorios(limit=None, user_id=None):
    """
    Lista os últimos relatórios do histórico, opcionalmente filtrando por usuário.
    
    Args:
        limit: Número máximo de registros (None = sem limite).
        user_id: Filtrar por ID do usuário (None = todos os usuários).
    
    Returns:
        list[dict]: Lista de registros com dados da execução e backup.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()

    query = (
        "SELECT id, nome_automacao, data_execucao, parametros_json, "
        "arquivo_nome, arquivo_path_backup, status "
        "FROM relatorios_history"
    )
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
        except (json.JSONDecodeError, TypeError):
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
    """
    Remove registros do histórico com mais de X dias e retorna
    os caminhos dos arquivos de backup para deleção física.
    
    SEGURANÇA: Usa query parametrizada (sem f-strings) para evitar SQL injection.
    
    Args:
        dias: Número de dias de retenção (padrão: 30).
    
    Returns:
        list[str]: Caminhos dos arquivos de backup que devem ser deletados.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()

    # Buscar arquivos que serão deletados fisicamente
    cursor.execute(
        "SELECT arquivo_path_backup FROM relatorios_history "
        "WHERE data_execucao < date('now', '-' || ? || ' days')",
        (dias,)
    )
    arquivos_para_remover = [r[0] for r in cursor.fetchall() if r[0]]

    # Remover registros antigos do banco
    cursor.execute(
        "DELETE FROM relatorios_history "
        "WHERE data_execucao < date('now', '-' || ? || ' days')",
        (dias,)
    )
    conexao.commit()
    conexao.close()
    return arquivos_para_remover


def excluir_historico_id(record_id):
    """
    Remove um registro específico do histórico pelo ID.
    
    Args:
        record_id: ID do registro a ser removido.
    
    Returns:
        bool: Sempre True (operação concluída).
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("DELETE FROM relatorios_history WHERE id = ?", (record_id,))
    conexao.commit()
    conexao.close()
    return True