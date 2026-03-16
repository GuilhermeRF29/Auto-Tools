import os
import base64
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import sys
from core.banco import BASE_DIR, ASSETS_DIR
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Side

# ==========================================
# CONFIGURAÇÕES GMAIL
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
    # O credentials.json foi embutido no .exe, então buscamos nos ASSETS
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

def baixar_anexos_especificos(service, pasta_alvo, nomes_procurados, data_busca=None):
    """
    Busca e baixa anexos que contenham as palavras-chave no nome.
    data_busca: string no formato 'YYYY/MM/DD' ou None (hoje).
    """
    if not os.path.exists(pasta_alvo):
        os.makedirs(pasta_alvo)

    if not data_busca:
        data_busca = datetime.now().strftime('%Y/%m/%d')
    
    query = f'has:attachment after:{data_busca}'
    
    resultado = service.users().messages().list(userId='me', q=query).execute()
    mensagens = resultado.get('messages', [])

    arquivos_baixados = {}

    for m in mensagens:
        msg_completa = service.users().messages().get(userId='me', id=m['id']).execute()
        partes = msg_completa.get('payload', {}).get('parts', [])

        for parte in partes:
            nome_arquivo = parte.get('filename')
            if nome_arquivo:
                for termo in nomes_procurados:
                    if termo.lower() in nome_arquivo.lower() and termo not in arquivos_baixados:
                        if 'body' in parte and 'attachmentId' in parte['body']:
                            anexo_id = parte['body']['attachmentId']
                            anexo = service.users().messages().attachments().get(
                                userId='me', messageId=m['id'], id=anexo_id).execute()
                            
                            dados_decodificados = base64.urlsafe_b64decode(anexo['data'])
                            
                            caminho_final = os.path.join(pasta_alvo, nome_arquivo)
                            with open(caminho_final, 'wb') as f:
                                f.write(dados_decodificados)
                            
                            print(f"✅ Arquivo encontrado e salvo: {nome_arquivo}")
                            arquivos_baixados[termo] = caminho_final
                            break
        
        if len(arquivos_baixados) == len(nomes_procurados):
            break

    return arquivos_baixados

# ==========================================
# TRATAMENTO DE DADOS
# ==========================================

def tratar_e_consolidar_bases(caminho_base_rio, caminho_share, caminho_base_principal, datas_filtro=None):
    print("Iniciando leitura e tratamento dos dados...")

    # 1. EXTRAÇÃO
    df1 = pd.read_excel(caminho_base_rio, sheet_name='Planilha1')
    df1.rename(columns={'PASSAGEIRO': 'PAX'}, inplace=True)
    df1 = df1[df1['DESTINO'].str.strip().str.upper() == 'RIO DE JANEIRO'].copy()
    
    if 'ORIGEM' not in df1.columns:
        df1['ORIGEM'] = 'SÃO PAULO'
        
    df2 = pd.read_excel(caminho_share, sheet_name='Base Relatorio   RIO x SAO')
    if 'DATA SP' in df2.columns:
        df2['DATA'] = df2['DATA SP']
    
    cols_df2 = ['Nº Mês', 'MÊS', 'EMPRESA', 'ORIGEM', 'DESTINO', 'SERVIÇO', 'HORÁRIO', 'PAX', 'DATA']
    df2 = df2[[c for c in cols_df2 if c in df2.columns]]

    df_consolidado = pd.concat([df1, df2], ignore_index=True)

    # FILTRO DE DATAS
    if datas_filtro:
        df_consolidado['DATA'] = pd.to_datetime(df_consolidado['DATA'], errors='coerce')
        datas_limite = pd.to_datetime(datas_filtro)
        df_consolidado = df_consolidado[df_consolidado['DATA'].isin(datas_limite)].copy()
        
        if df_consolidado.empty:
            print("⚠️ Nenhum dado encontrado para as datas especificadas.")
            return

    # 2. LIMPEZA E REGRAS DE NEGÓCIO
    df_consolidado['EMPRESA'] = df_consolidado['EMPRESA'].astype(str)
    
    mask_tag_sp = df_consolidado['EMPRESA'].str.contains(r'\(BF\)|\(BAF\)|\(RIO\)', na=False, regex=True)
    df_consolidado.loc[mask_tag_sp & (df_consolidado['DESTINO'].str.strip().str.upper() == 'SÃO PAULO'), 'DESTINO'] = 'SÃO PAULO (BARRA FUNDA)'
    df_consolidado.loc[mask_tag_sp & (df_consolidado['ORIGEM'].str.strip().str.upper() == 'SÃO PAULO'), 'ORIGEM'] = 'SÃO PAULO (BARRA FUNDA)'
    df_consolidado.loc[(df_consolidado['EMPRESA'].str.strip().str.upper() == 'ITAPEMIRIM'), 'EMPRESA'] = 'KAISSARA'

    df_consolidado['EMPRESA'] = df_consolidado['EMPRESA'].str.replace(r'\s*\(.*?\)\s*', '', regex=True)
    df_consolidado['EMPRESA'] = df_consolidado['EMPRESA'].str.normalize('NFKD').str.encode('ascii', errors='ignore').str.decode('utf-8').str.upper().str.strip()

    mapa_regras = {
        '1001': {'GRUPO': 'JCA', 'MODALIDADE': 'RODOVIARIO'},
        'AGUIA BRANCA': {'GRUPO': 'AGUIA BRANCA', 'MODALIDADE': 'RODOVIARIO'},
        'EXPRESSO DO SUL': {'GRUPO': 'JCA', 'MODALIDADE': 'RODOVIARIO'},
        'CATARINENSE': {'GRUPO': 'JCA', 'MODALIDADE': 'RODOVIARIO'},
        'PENHA': {'GRUPO': 'COMPORTE', 'MODALIDADE': 'RODOVIARIO'},
        'AGUIA FLEX': {'GRUPO': 'AGUIA BRANCA', 'MODALIDADE': 'DIGITAL'},
        'KAISSARA': {'GRUPO': 'SUZANTUR', 'MODALIDADE': 'RODOVIARIO'},
        'WEMOBI': {'GRUPO': 'JCA', 'MODALIDADE': 'DIGITAL'},
        'ADAMANTINA': {'GRUPO': 'ADAMANTINA', 'MODALIDADE': 'RODOVIARIO'},
        'FLIXBUS': {'GRUPO': 'FLIXBUS', 'MODALIDADE': 'DIGITAL'},
        'RIO DOCE': {'GRUPO': 'RIO DOCE', 'MODALIDADE': 'RODOVIARIO'},
        'NOTAVEL': {'GRUPO': 'NOTÁVEL', 'MODALIDADE': 'RODOVIARIO'}
    }
    
    df_consolidado['GRUPO'] = df_consolidado['EMPRESA'].map(lambda x: mapa_regras.get(x, {}).get('GRUPO', 'OUTROS'))
    df_consolidado['MODALIDADE'] = df_consolidado['EMPRESA'].map(lambda x: mapa_regras.get(x, {}).get('MODALIDADE', 'OUTROS'))

    empresas_nao_mapeadas = df_consolidado[df_consolidado['GRUPO'] == 'OUTROS']['EMPRESA'].unique()
    if len(empresas_nao_mapeadas) > 0:
        raise ValueError(f"🚨 ERRO CRÍTICO: As seguintes empresas não estão no mapa: {empresas_nao_mapeadas}")

    df_consolidado = df_consolidado[df_consolidado['PAX'] <= 69].copy()
    df_consolidado.loc[df_consolidado['PAX'] == 69, 'PAX'] = 68

    df_consolidado['IPV'] = np.where(df_consolidado['PAX'] > 54, 
                                     df_consolidado['PAX'] / 68, 
                                     df_consolidado['PAX'] / 54)
    df_consolidado['IPV'] = df_consolidado['IPV'].clip(upper=1.0)

    df_consolidado['DATA'] = pd.to_datetime(df_consolidado['DATA'])
    df_consolidado['HORÁRIO'] = pd.to_datetime(df_consolidado['HORÁRIO'].astype(str), errors='coerce').apply(lambda x: x.time() if pd.notnull(x) else None)
    
    df_consolidado['Nº Mês'] = df_consolidado['DATA'].dt.month
    df_consolidado['Ano'] = df_consolidado['DATA'].dt.year
    df_consolidado['SEMANA'] = df_consolidado['DATA'].dt.isocalendar().week 
    
    meses_pt = {1:'01-JANEIRO', 2:'02-FEVEREIRO', 3:'03-MARÇO', 4:'04-ABRIL', 
                5:'05-MAIO', 6:'06-JUNHO', 7:'07-JULHO', 8:'08-AGOSTO', 
                9:'09-SETEMBRO', 10:'10-OUTUBRO', 11:'11-NOVEMBRO', 12:'12-DEZEMBRO'}
    df_consolidado['MÊS'] = df_consolidado['Nº Mês'].map(meses_pt)
    df_consolidado['DATA'] = df_consolidado['DATA'].dt.date

    # 4. EXPORTAÇÃO E FORMATAÇÃO (EVITANDO DUPLICATAS)
    print("Verificando duplicatas e preparando salvamento...")
    ordem_colunas = ['DATA', 'Nº Mês', 'MÊS', 'EMPRESA', 'ORIGEM', 'DESTINO', 'SERVIÇO', 'HORÁRIO', 'PAX', 'SEMANA', 'IPV', 'GRUPO', 'MODALIDADE', 'Ano']
    
    if 'SERVIÇO' not in df_consolidado.columns:
        df_consolidado['SERVIÇO'] = 1
    else:
        df_consolidado['SERVIÇO'] = df_consolidado['SERVIÇO'].fillna(1)

    df_final = df_consolidado[ordem_colunas]

    # --- LÓGICA DE PREVENÇÃO DE DUPLICATAS ---
    try:
        # Lemos as colunas chaves da base principal
        colunas_checar = ['DATA', 'HORÁRIO', 'PAX', 'IPV']
        df_existente = pd.read_excel(caminho_base_principal, sheet_name='Base Relatorio   RIO x SAO', usecols=colunas_checar)
        
        # Padronização para comparação:
        # 1. Converter datas para datetime e extrair apenas a data
        df_existente['DATA'] = pd.to_datetime(df_existente['DATA']).dt.date
        # 2. Garantir que HORÁRIO seja string (para evitar problemas entre time e datetime)
        df_existente['HORÁRIO'] = df_existente['HORÁRIO'].astype(str)
        # 3. Arredondar IPV para evitar erros de precisão de float
        df_existente['IPV'] = df_existente['IPV'].round(4)
        
        # Criamos uma chave composta temporária para o df_existente
        chaves_existentes = set(df_existente.apply(lambda r: f"{r['DATA']}_{r['HORÁRIO']}_{r['PAX']}_{r['IPV']}", axis=1))

        # Criamos a mesma chave para o df_final (o que queremos adicionar agora)
        # d_temp['HORÁRIO'] no df_final já é extraído como .time() ou similar, vamos garantir string
        df_final_temp = df_final.copy()
        df_final_temp['KEY'] = df_final_temp.apply(
            lambda r: f"{r['DATA']}_{str(r['HORÁRIO'])}_{r['PAX']}_{round(float(r['IPV']), 4)}", axis=1
        )
        
        # Filtramos o df_final
        df_final = df_final[~df_final_temp['KEY'].isin(chaves_existentes)].copy()
        
        if df_final.empty:
            print("ℹ️ Todos os dados processados já constam na base principal (Verificado por Data, Hora, PAX e IPV). Nada a adicionar.")
            return
        else:
            print(f"📌 Adicionando {len(df_final)} novas linhas inéditas...")
            
    except Exception as e:
        print(f"⚠️ Não foi possível verificar duplicas de forma detalhada: {e}. Prosseguindo com precaução.")

    book = load_workbook(caminho_base_principal)
    sheet = book['Base Relatorio   RIO x SAO']
    start_row = sheet.max_row + 1

    estilo_borda = Side(border_style="thin", color="000000")
    borda_fina = Border(top=estilo_borda, left=estilo_borda, right=estilo_borda, bottom=estilo_borda)
    alinhamento_centro = Alignment(horizontal='center', vertical='center')

    for row_idx, row_data in enumerate(df_final.values, start=start_row):
        for col_idx, value in enumerate(row_data, start=1):
            cell = sheet.cell(row=row_idx, column=col_idx, value=value)
            cell.alignment = alinhamento_centro
            nome_coluna_atual = ordem_colunas[col_idx-1]
            if nome_coluna_atual != 'Ano':
                cell.border = borda_fina
            if nome_coluna_atual == 'DATA':
                cell.number_format = 'dd/mmm' 
            elif nome_coluna_atual == 'HORÁRIO':
                cell.number_format = 'hh:mm'
            elif nome_coluna_atual == 'IPV':
                cell.number_format = '0%'

    book.save(caminho_base_principal)
    print(f"✅ Sucesso! O arquivo foi atualizado com novos dados em: {caminho_base_principal}")

# ==========================================
# INTEGRAÇÃO COM A UI
# ==========================================

def executar_sr(id_usuario, e_ini, e_fim, b_ini, b_fim, callback_progresso=None, hook_cancelamento=None):
    """
    Função chamada pelo Flet.
    e_ini/e_fim: datas para busca no e-mail.
    b_ini/b_fim: datas para filtro na base.
    """
    try:
        if callback_progresso: callback_progresso(0.1, "Conectando ao Gmail...")
        service, _ = obter_servico_gmail()
        
        if hook_cancelamento and hook_cancelamento(): return
        
        pasta_downloads = Path.home() / "Downloads"
        termos_esperados = ["BASE RIO", "Share - Mercado RIO"]
        arq_principal = os.path.join(pasta_downloads, "Base RIO x SAO.xlsx")
        
        # O Gmail usa 'after' para busca. Usamos a data de início do e-mail.
        data_busca_gmail = datetime.strptime(e_ini, "%d/%m/%Y").strftime("%Y/%m/%d")
        
        if callback_progresso: callback_progresso(0.3, f"Buscando anexos desde {e_ini}...")
        arquivos = baixar_anexos_especificos(service, pasta_downloads, termos_esperados, data_busca=data_busca_gmail)
        
        if hook_cancelamento and hook_cancelamento(): return
        
        if all(termo in arquivos for termo in termos_esperados):
            if callback_progresso: callback_progresso(0.6, "Arquivos baixados. Iniciando processamento da base...")
            
            # Gerar lista de datas entre b_ini e b_fim para o filtro do DataFrame
            d_ini = datetime.strptime(b_ini, "%d/%m/%Y")
            d_fim = datetime.strptime(b_fim, "%d/%m/%Y")
            delta = d_fim - d_ini
            lista_datas_base = [(d_ini + timedelta(days=i)).strftime('%Y-%m-%d') for i in range(delta.days + 1)]
            
            tratar_e_consolidar_bases(
                caminho_base_rio=arquivos["BASE RIO"],
                caminho_share=arquivos["Share - Mercado RIO"],
                caminho_base_principal=arq_principal,
                datas_filtro=lista_datas_base
            )
            
            if callback_progresso: callback_progresso(1.0, "Concluído com sucesso!")
        else:
            faltando = [t for t in termos_esperados if t not in arquivos]
            raise Exception(f"Arquivos não encontrados no e-mail: {faltando}")
            
    except Exception as e:
        raise Exception(f"Erro SR: {str(e)}")

# ==========================================
# EXECUÇÃO MANUAL (TESTE)
# ==========================================
if __name__ == '__main__':
    # No manual, usamos hoje para e-mail e ontem para base
    hoje = datetime.now().strftime('%d/%m/%Y')
    ontem = (datetime.now() - timedelta(days=1)).strftime('%d/%m/%Y')
    
    executar_sr(1, hoje, hoje, ontem, ontem)
