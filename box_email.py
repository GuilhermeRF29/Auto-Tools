import os
import base64
from datetime import datetime, date
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# DEFINIÇÃO DE ESCOPOS: 
# Aqui dizemos ao Google exatamente o que queremos acessar.
# 'gmail.readonly' -> ler e-mails e anexos.
# 'userinfo.email' -> descobrir qual e-mail está logado.
SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'openid'
]

def obter_servico_gmail():
    """
    Realiza a autenticação, identifica o usuário e retorna o serviço da API.
    """
    creds = None
    # Verificamos se já existe um 'token.json' salvo para evitar login repetido.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # Se não houver credenciais válidas, iniciamos o processo de login.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            # Caso o token tenha expirado, ele tenta renovar automaticamente.
            creds.refresh(Request())
        else:
            # Abre o fluxo de login usando o arquivo baixado do Google Cloud.
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(
                port=0, 
                success_message='Autenticação OK! Pode fechar esta aba e voltar ao Python.'
            )
        
        # Salva o token para a próxima vez.
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    # 'build' cria o objeto de conexão com a API do Gmail.
    service = build('gmail', 'v1', credentials=creds)
    
    # Chamada extra para descobrir o e-mail do usuário logado.
    info_service = build('oauth2', 'v2', credentials=creds)
    user_info = info_service.userinfo().get().execute()
    
    return service, user_info.get('email')

def processar_anexos(service, pasta_alvo, extensoes_permitidas=None, nomes_procurados=None):
    """
    nomes_procurados: Uma lista de strings, ex: ['relatorio', 'faturamento']
    """
    if not os.path.exists(pasta_alvo):
        os.makedirs(pasta_alvo)

    hoje = datetime.now().strftime('%Y/%m/%d')
    # O filtro 'filename:' na query do Google já ajuda a reduzir o processamento
    query = f'has:attachment after:{hoje}'
    
    # Se você quiser ser ainda mais específico na busca do Google:
    # query += " filename:relatorio" 

    resultado = service.users().messages().list(userId='me', q=query).execute()
    mensagens = resultado.get('messages', [])

    contador = 0
    for m in mensagens:
        msg_completa = service.users().messages().get(userId='me', id=m['id']).execute()
        partes = msg_completa.get('payload', {}).get('parts', [])

        for parte in partes:
            nome_arquivo = parte.get('filename')
            
            if nome_arquivo:
                # 1. Filtro de Extensão (que já tínhamos)
                extensao = os.path.splitext(nome_arquivo)[1].lower()
                if extensoes_permitidas and extensao not in extensoes_permitidas:
                    continue

                # 2. NOVO: Filtro de Nome ou Parte do Nome
                # Verifica se alguma das palavras que você quer está no nome do arquivo
                if nomes_procurados:
                    # Deixamos tudo em minúsculo para a busca não falhar por causa de uma letra maiúscula
                    encontrou = any(palavra.lower() in nome_arquivo.lower() for palavra in nomes_procurados)
                    if not encontrou:
                        continue # Se não achou a palavra no nome, pula para o próximo arquivo

                # Se passou pelos filtros, faz o download...
                timestamp = datetime.now().strftime('%H-%M-%S')
                nome_unico = f"{timestamp}_{nome_arquivo}"
                
                # 1. Pegamos o horário atual formatado (Ex: 14-30-05)
                timestamp = datetime.now().strftime('%H-%M-%S')
                
                # 2. Criamos o novo nome: "14-30-05_relatorio.xlsx"
                nome_unico = f"{timestamp}_{nome_arquivo}"
                
                # 3. Montamos o caminho final com o novo nome
                caminho_final = os.path.join(pasta_alvo, nome_unico)
                
                # O restante permanece igual (decodificar e salvar)
                dados_decodificados = base64.urlsafe_b64decode(anexo_data['data'])
                
                with open(caminho_final, 'wb') as f:
                    f.write(dados_decodificados)
                
                print(f"✅ Arquivo salvo como: {nome_unico}")
                contador += 1
                if contador >= 2: return # Para após 2 arquivos, como solicitado.

# --- EXECUÇÃO PRINCIPAL ---
if __name__ == '__main__':
    # 1. Autenticação e Identificação
    servico_gmail, email_logado = obter_servico_gmail()
    print(f"Operando na conta: {email_logado}")

    # 2. Configurações e Download
    # Exemplo: Apenas Excel (.xlsx) e PDFs na pasta Documentos
    minha_pasta = Path.home() / "Downloads"
    meus_filtros_de_nome = ['vendas', 'estoque']
    formatos = ['.xlsx', '.xls', '.csv']
    
    processar_anexos(servico_gmail, minha_pasta, formatos, meus_filtros_de_nome)