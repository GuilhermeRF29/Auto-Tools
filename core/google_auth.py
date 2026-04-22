import os
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from .banco import BASE_DIR, ASSETS_DIR, DATA_DIR

# ==========================================
# CONFIGURAÇÕES GMAIL & GOOGLE
# ==========================================
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
]


def _normalizar_caminhos(candidatos):
    caminhos = []
    vistos = set()

    for item in candidatos:
        if not item:
            continue

        caminho = Path(item).expanduser()
        chave = str(caminho.resolve()) if caminho.exists() else str(caminho)
        if chave in vistos:
            continue
        vistos.add(chave)
        caminhos.append(caminho)

    return caminhos


def _resolver_caminhos_auth():
    token_env = os.getenv("GMAIL_TOKEN_PATH", "").strip()
    creds_env = os.getenv("GMAIL_CREDENTIALS_PATH", "").strip()

    token_path = Path(token_env).expanduser() if token_env else (DATA_DIR / "token.json")

    creds_candidatos = _normalizar_caminhos([
        Path(creds_env).expanduser() if creds_env else None,
        ASSETS_DIR / "credentials.json",
        ASSETS_DIR / "core" / "credentials.json",
        BASE_DIR / "credentials.json",
        BASE_DIR / "core" / "credentials.json",
        Path.cwd() / "credentials.json",
        Path.cwd() / "core" / "credentials.json",
    ])
    creds_path = next((p for p in creds_candidatos if p.exists()), None)

    return token_path, creds_path, creds_candidatos

def obter_servico_gmail():
    """Realiza a autenticação e retorna o serviço da API do Gmail."""
    # Permite fallback robusto para dev (.py), exe e execução via terminal/backend.
    TOKEN_PATH, CREDS_PATH, CREDS_CANDIDATOS = _resolver_caminhos_auth()

    creds = None
    if TOKEN_PATH.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
        except Exception as e:
            print(f"[AVISO] token.json inválido em {TOKEN_PATH}: {e}. Será solicitada nova autenticação.")
            creds = None

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except Exception as e:
                print(f"[AVISO] Falha ao renovar token em {TOKEN_PATH}: {e}. Reautenticando...")
                creds = None

        if not creds or not creds.valid:
            if not CREDS_PATH or not CREDS_PATH.exists():
                tentativas = " | ".join(str(p) for p in CREDS_CANDIDATOS)
                raise FileNotFoundError(
                    "Arquivo credentials.json não encontrado. Caminhos testados: "
                    f"{tentativas}"
                )

            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            try:
                creds = flow.run_local_server(
                    port=0,
                    success_message='Autenticação OK! Pode fechar esta aba e voltar ao Python.'
                )
            except Exception as e:
                print(f"[AVISO] Não foi possível iniciar o servidor local de autenticação: {e}. Usando fluxo manual no console.")
                run_console = getattr(flow, "run_console", None)
                if callable(run_console):
                    creds = run_console()
                else:
                    raise RuntimeError(
                        "Fluxo manual não disponível nesta versão do google-auth-oauthlib. "
                        "Atualize a biblioteca ou habilite navegador local para autenticação."
                    )

        TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
        to_json = getattr(creds, "to_json", None)
        if not callable(to_json):
            raise RuntimeError("Credenciais OAuth inválidas: objeto de credencial sem serialização to_json().")
        with open(TOKEN_PATH, 'w', encoding='utf-8') as token:
            token.write(str(to_json()))

    service = build('gmail', 'v1', credentials=creds)
    info_service = build('oauth2', 'v2', credentials=creds)
    user_info = info_service.userinfo().get().execute()
    
    return service, user_info.get('email')
