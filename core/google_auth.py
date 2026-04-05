import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from .banco import BASE_DIR, ASSETS_DIR

# ==========================================
# CONFIGURAÇÕES GMAIL & GOOGLE
# ==========================================
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
]

def obter_servico_gmail():
    """Realiza a autenticação e retorna o serviço da API do Gmail."""
    # O token.json fica na pasta do executável (para persistir entre as execuções)
    TOKEN_PATH = BASE_DIR / "token.json"
    # O credentials.json foi embutido, então buscamos nos ASSETS
    CREDS_PATH = ASSETS_DIR / "credentials.json"

    creds = None
    if TOKEN_PATH.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDS_PATH.exists():
                raise FileNotFoundError(f"Arquivo credentials.json não encontrado em: {CREDS_PATH}")
            
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_PATH), SCOPES)
            creds = flow.run_local_server(
                port=0, 
                success_message='Autenticação OK! Pode fechar esta aba e voltar ao Python.'
            )
        with open(TOKEN_PATH, 'w') as token:
            token.write(creds.to_json())

    service = build('gmail', 'v1', credentials=creds)
    info_service = build('oauth2', 'v2', credentials=creds)
    user_info = info_service.userinfo().get().execute()
    
    return service, user_info.get('email')
