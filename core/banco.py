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
import bcrypt
import sys
from pathlib import Path
from cryptography.fernet import Fernet
from dotenv import load_dotenv


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
DB_PATH = BASE_DIR / "Userbank.db"
ENV_PATH = BASE_DIR / ".env"


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
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute("PRAGMA foreign_keys = ON")

    # Tabela de usuários do sistema
    cursor.execute('''CREATE TABLE IF NOT EXISTS usuarios (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nome TEXT,
                        usuario TEXT UNIQUE,
                        senha TEXT)''')

    # Tabela de credenciais de sistemas pré-definidos (EBUS, ADM, BI)
    cursor.execute('''CREATE TABLE IF NOT EXISTS acessos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        servico TEXT, login_acesso TEXT, senha_acesso TEXT,
                        user_id INTEGER,
                        FOREIGN KEY (user_id) REFERENCES usuarios(id))''')

    # Tabela de credenciais personalizadas (sites adicionados pelo usuário)
    cursor.execute('''CREATE TABLE IF NOT EXISTS acessos_personalizados (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nome_site TEXT, url_site TEXT,
                        login_acesso TEXT, senha_acesso TEXT,
                        user_id INTEGER,
                        FOREIGN KEY (user_id) REFERENCES usuarios(id))''')

    # Migração segura: adiciona url_site caso tabela já exista sem a coluna
    try:
        cursor.execute("ALTER TABLE acessos_personalizados ADD COLUMN url_site TEXT")
    except sqlite3.OperationalError:
        pass  # Coluna já existe — tudo certo

    # Tabela de tipos de ônibus com capacidade
    cursor.execute('''CREATE TABLE IF NOT EXISTS onibus (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        nome TEXT UNIQUE,
                        capacidade INTEGER)''')

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

    # Migração segura: adiciona job_id caso já exista sem a coluna
    try:
        cursor.execute("ALTER TABLE relatorios_history ADD COLUMN job_id TEXT")
        cursor.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_job_id "
            "ON relatorios_history(job_id)"
        )
    except sqlite3.OperationalError:
        pass  # Coluna já existe

    conexao.commit()
    conexao.close()


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
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    hash_senha = bcrypt.hashpw(senha.encode('utf-8'), bcrypt.gensalt())
    try:
        cursor.execute(
            "INSERT INTO usuarios (nome, usuario, senha) VALUES (?, ?, ?)",
            (nome, usuario, hash_senha)
        )
        conexao.commit()
        return True
    except sqlite3.IntegrityError:
        return False  # Usuário já existe
    finally:
        conexao.close()


def login_principal(usuario, senha):
    """
    Autentica um usuário verificando a senha com bcrypt.
    
    Args:
        usuario: Login do usuário.
        senha: Senha em texto plano para verificação.
    
    Returns:
        tuple: (id, nome) se autenticado, (None, None) se inválido.
    """
    conexao = sqlite3.connect(DB_PATH)
    cursor = conexao.cursor()
    cursor.execute(
        "SELECT id, nome, senha FROM usuarios WHERE usuario = ?",
        (usuario,)
    )
    user = cursor.fetchone()
    conexao.close()

    if user and bcrypt.checkpw(senha.encode('utf-8'), user[2]):
        return user[0], user[1]  # (ID, Nome)
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

    # Processar credenciais de sistemas
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