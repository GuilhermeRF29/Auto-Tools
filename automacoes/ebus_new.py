import sys
import os
# Feedback imediato para o dashboard!
print("PROGRESS:{\"p\": 1, \"m\": \"Carregando módulos eBus...\"}", flush=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import shutil
import calendar
import unicodedata
import sqlite3
import pandas as pd # type: ignore
from pathlib import Path
from datetime import datetime, timedelta
from selenium import webdriver # type: ignore
from selenium.webdriver.common.by import By # type: ignore
from selenium.webdriver.chrome.options import Options # type: ignore

try:
    import polars as pl # type: ignore
except Exception:
    pl = None

try:
    import duckdb # type: ignore
except Exception:
    duckdb = None

try:
    from selenium_helper import get_driver_path
except ImportError:
    def get_driver_path():
        return None
from selenium.webdriver.support.ui import WebDriverWait # type: ignore
from selenium.webdriver.support import expected_conditions as EC # type: ignore
from core.banco import buscar_credencial_site # type: ignore

class CanceladoPeloUsuario(Exception):
    pass

MESES_PT = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 
            6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 
            11: 'Novembro', 12: 'Dezembro'}

DESTINO_APP_Z = Path(r"Z:\DASH REVENUE APPLICATION")
DESTINO_APP_UNC = Path(r"\\172.16.98.12\Relatórios Power BI\DASH REVENUE APPLICATION")

EXTENSOES_REVENUE_FINAIS = {".xls", ".xlsx", ".xlsm"}

def sanitizar_nome_arquivo(nome):
    """Remove caracteres inválidos para nome de arquivo no Windows."""
    invalidos = '<>:"/\\|?*'
    for ch in invalidos:
        nome = nome.replace(ch, "-")
    return nome


def arquivo_download_revenue_finalizado(caminho: Path) -> bool:
    """Retorna True apenas para arquivos finais (não temporários do navegador)."""
    sufixo = caminho.suffix.lower()
    nome = caminho.name.lower()
    if sufixo not in EXTENSOES_REVENUE_FINAIS:
        return False
    if nome.endswith('.crdownload') or nome.endswith('.part'):
        return False
    return True


def resolver_destino_padrao_revenue():
    """Resolve o destino padrão da aplicação Revenue com fallback local e UNC."""
    if DESTINO_APP_Z.exists():
        return DESTINO_APP_Z
    return DESTINO_APP_UNC


def normalizar_caminho_base(caminho_raw):
    """Normaliza um caminho de base aceitando diretório ou arquivo."""
    if caminho_raw is None:
        return None

    texto = str(caminho_raw).strip().strip('"')
    if not texto:
        return None

    caminho = Path(texto)
    return caminho if caminho.suffix == "" else caminho.parent


def resolver_destino_revenue(base_automacao=None, pasta_personalizada=None):
    """Resolve base do Revenue respeitando tokens da UI e caminho personalizado."""
    base_raw = str(base_automacao).strip() if base_automacao is not None else ""
    base_lower = base_raw.lower()

    if not base_raw or base_lower in {"padrao", "none", "null"}:
        return resolver_destino_padrao_revenue()

    if base_lower == "sem_base":
        return None

    if base_lower == "personalizada":
        caminho_custom = normalizar_caminho_base(pasta_personalizada)
        return caminho_custom if caminho_custom else resolver_destino_padrao_revenue()

    caminho_explicito = normalizar_caminho_base(base_raw)
    return caminho_explicito if caminho_explicito else resolver_destino_padrao_revenue()


def parse_data_parametro(data_valor):
    """Aceita ISO (YYYY-mm-dd), dd-mm-YYYY e dd/mm/YYYY."""
    if data_valor is None:
        return None
    if isinstance(data_valor, datetime):
        return data_valor

    texto = str(data_valor).strip()
    if not texto:
        return None

    if 'T' in texto:
        try:
            return datetime.fromisoformat(texto.replace('Z', ''))
        except ValueError:
            pass

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(texto, fmt)
        except ValueError:
            continue

    raise ValueError(
        f"Formato de data inválido: {data_valor}. Use YYYY-mm-dd, dd-mm-YYYY ou dd/mm/YYYY."
    )


def formatar_data_filtro_portal(data_valor):
    data_dt = parse_data_parametro(data_valor)
    return data_dt.strftime("%d/%m/%Y") if data_dt else None

def gerar_intervalos_mensais_ebus(data_str_inicio, data_str_fim):
    meses_pt = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 
    6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 
    11: 'Novembro', 12: 'Dezembro'}
    inicio = parse_data_parametro(data_str_inicio)
    fim_global = parse_data_parametro(data_str_fim)
    if not inicio or not fim_global:
        raise ValueError("As datas de início e fim são obrigatórias para gerar intervalos do EBUS.")
    atual = inicio
    intervalos = []
    while atual <= fim_global:
        ultimo_dia_mes = calendar.monthrange(atual.year, atual.month)[1]
        data_ultimo_dia = datetime(atual.year, atual.month, ultimo_dia_mes)
        fim_trecho = min(data_ultimo_dia, fim_global)
        intervalos.append((atual.strftime("%d/%m/%Y"), fim_trecho.strftime("%d/%m/%Y"), meses_pt[atual.month], atual.year))
        atual = data_ultimo_dia + timedelta(days=1)
    return intervalos


def ler_planilha_relatorio(caminho_arquivo):
    """Lê planilhas .xls/.xlsx do EBUS usando o engine compatível com a extensão."""
    caminho = Path(caminho_arquivo)
    sufixo = caminho.suffix.lower()

    if sufixo == '.xls':
        return pd.read_excel(caminho, engine='xlrd')

    if sufixo in {'.xlsx', '.xlsm'}:
        return pd.read_excel(caminho, engine='openpyxl')

    # Fallback para extensões não previstas.
    try:
        return pd.read_excel(caminho)
    except Exception:
        return pd.read_excel(caminho, engine='openpyxl')


def encontrar_coluna_data_viagem(df: pd.DataFrame):
    """Localiza a coluna de Data Viagem mesmo com variações de grafia."""
    for col in df.columns:
        normalizado = normalizar_nome_coluna(col)
        if normalizado == 'dataviagem' or ('data' in normalizado and 'viagem' in normalizado):
            return col
    return None


def separar_arquivo_por_mes_data_viagem(arquivo_original, pasta_destino, callback_progresso=None):
    """
    Separa um relatório único em múltiplos arquivos por mês de Data Viagem.
    Mantém o arquivo original caso não seja possível separar com segurança.
    """
    arquivo_original = Path(arquivo_original)
    pasta_destino = Path(pasta_destino)
    df = ler_planilha_relatorio(arquivo_original)
    df = df.dropna(how='all')

    coluna_data = encontrar_coluna_data_viagem(df)
    if not coluna_data:
        if callback_progresso:
            callback_progresso(0.54, "Data Viagem não encontrada; arquivo seguirá sem separação mensal.")
        return [{"arquivo": arquivo_original, "nome_mes": None, "ano": None}]

    df_aux = df.copy()
    df_aux['__data_parse'] = pd.to_datetime(df_aux[coluna_data], errors='coerce', dayfirst=True)
    mascara_validas = df_aux['__data_parse'].notna()
    if not mascara_validas.any():
        if callback_progresso:
            callback_progresso(0.54, "Nenhuma Data Viagem válida; arquivo seguirá sem separação mensal.")
        return [{"arquivo": arquivo_original, "nome_mes": None, "ano": None}]

    df_validas = df_aux.loc[mascara_validas].copy()
    df_validas['__mes'] = df_validas['__data_parse'].apply(lambda dt: int(dt.month))
    df_validas['__ano'] = df_validas['__data_parse'].apply(lambda dt: int(dt.year))
    df_validas = df_validas.drop(columns=['__data_parse'])

    arquivos_saida = []
    chaves_ordenadas = sorted({(int(ano), int(mes)) for ano, mes in zip(df_validas['__ano'], df_validas['__mes'])})
    total_grupos = len(chaves_ordenadas)

    for idx, (ano, mes) in enumerate(chaves_ordenadas, 1):
        grupo = df_validas[(df_validas['__ano'] == ano) & (df_validas['__mes'] == mes)].copy()
        nome_mes = MESES_PT.get(int(mes), f"Mes {mes}")
        nome_arquivo = sanitizar_nome_arquivo(
            f"RelatorioRevenue - {nome_mes} {int(ano)} - origem_unica.xlsx"
        )
        caminho_mes = pasta_destino / nome_arquivo

        grupo_saida = grupo.drop(columns=['__mes', '__ano'])
        grupo_saida.to_excel(caminho_mes, index=False)

        arquivos_saida.append({"arquivo": caminho_mes, "nome_mes": nome_mes, "ano": int(ano)})

        if callback_progresso:
            callback_progresso(
                0.54 + (0.06 * (idx / max(total_grupos, 1))),
                f"Separação mensal: {nome_mes}/{ano} preparado ({idx}/{total_grupos}).",
            )

    linhas_sem_data = int((~mascara_validas).sum())
    if linhas_sem_data > 0 and callback_progresso:
        callback_progresso(
            0.60,
            f"Aviso: {linhas_sem_data} linhas ficaram fora da separação por mês por não terem Data Viagem válida.",
        )

    try:
        os.remove(arquivo_original)
    except OSError:
        pass

    return arquivos_saida


def limpar_cookies_ebus(driver, callback_progresso=None):
    """
    Sequência de higienização pedida para o EBUS:
    acessa > apaga tudo > recarrega > segue para login.
    """
    url_login = "http://10.61.65.84/auth/login"
    origem_ebus = "http://10.61.65.84"

    def ler_estado_storage():
        try:
            estado = driver.execute_script(
                "return {"
                "localCount: window.localStorage ? window.localStorage.length : -1,"
                "sessionCount: window.sessionStorage ? window.sessionStorage.length : -1"
                "};"
            ) or {}
            return int(estado.get("localCount", -1)), int(estado.get("sessionCount", -1))
        except Exception:
            return -1, -1

    driver.get(url_login)
    time.sleep(1)

    limpo_total = False
    for tentativa in range(1, 4):
        try:
            driver.delete_all_cookies()
        except Exception:
            pass

        # Apaga armazenamento web do domínio atual de forma resiliente.
        try:
            driver.execute_script("window.localStorage.clear();")
            driver.execute_script("window.sessionStorage.clear();")
        except Exception:
            pass

        # Em navegadores Chromium, limpa também cookies/cache/dados do site.
        try:
            driver.execute_cdp_cmd("Network.enable", {})
            driver.execute_cdp_cmd("Network.clearBrowserCookies", {})
            driver.execute_cdp_cmd("Network.clearBrowserCache", {})
            driver.execute_cdp_cmd("Storage.clearDataForOrigin", {
                "origin": origem_ebus,
                "storageTypes": "local_storage,session_storage,indexeddb,websql,cache_storage,service_workers",
            })
        except Exception:
            pass

        local_count, session_count = ler_estado_storage()
        try:
            cookies_count = len(driver.get_cookies())
        except Exception:
            cookies_count = -1

        limpo_total = cookies_count == 0 and local_count == 0 and session_count == 0
        if callback_progresso:
            callback_progresso(
                0.14,
                f"Validação de limpeza ({tentativa}/3): cookies={cookies_count}, localStorage={local_count}, sessionStorage={session_count}",
            )

        if limpo_total:
            break

        time.sleep(0.8)

    # Recarrega conforme processo validado manualmente.
    try:
        driver.refresh()
    except Exception:
        driver.get(url_login)

    time.sleep(1)
    return limpo_total

# ==========================================
# FUNÇÃO AUXILIAR DE FORMATAÇÃO VISUAL
# ==========================================
def salvar_excel_formatado(df: pd.DataFrame, caminho_arquivo: Path, nome_aba: str):
    """Escreve e formata o Excel usando XlsxWriter (sem depender de openpyxl)."""
    with pd.ExcelWriter(
        caminho_arquivo,
        engine="xlsxwriter",
        datetime_format="dd/mm/yyyy",
        date_format="dd/mm/yyyy",
    ) as writer:
        df.to_excel(writer, index=False, sheet_name=nome_aba)
        workbook = writer.book
        worksheet = writer.sheets[nome_aba]

        fmt_header = workbook.add_format({
            "bold": True,
            "bg_color": "#BFBFBF",
            "align": "center",
            "valign": "vcenter",
            "text_wrap": True,
            "border": 1,
        })
        fmt_texto = workbook.add_format({"valign": "vcenter", "text_wrap": True})
        fmt_moeda = workbook.add_format({"num_format": "R$ #,##0.00", "valign": "vcenter", "text_wrap": True})
        fmt_percent = workbook.add_format({"num_format": "0.00%", "valign": "vcenter", "text_wrap": True})

        colunas_moeda_limpas = {
            'tarifa', 'embarque', 'pedágio', 'pedagio',
            'sugestão', 'sugestao', 'sugestão revenue', 'sugestao revenue',
            'revenue aplicado'
        }
        colunas_porcentagem_limpas = {
            'market share', 'perc. de diferença', 'perc. de diferenca', 'aproveitamento'
        }

        worksheet.set_row(0, 25, fmt_header)

        for idx, coluna in enumerate(df.columns):
            nome_cabecalho = str(coluna).strip().lower()
            largura = 75.6 if idx == 18 else 20
            formato_coluna = fmt_texto

            if nome_cabecalho in colunas_moeda_limpas:
                formato_coluna = fmt_moeda
            elif nome_cabecalho in colunas_porcentagem_limpas:
                formato_coluna = fmt_percent

            worksheet.set_column(idx, idx, largura, formato_coluna)


def exportar_base_nova_consolidada(df: pd.DataFrame, pasta_base_nova: Path, callback_progresso=None):
    """Gera artefatos consolidados em parquet, sqlite e duckdb."""
    pasta_base_nova.mkdir(parents=True, exist_ok=True)

    csv_path = pasta_base_nova / "base_nova_consolidada.csv"
    parquet_path = pasta_base_nova / "base_nova_consolidada.parquet"
    sqlite_path = pasta_base_nova / "base_nova_consolidada.db"
    duckdb_path = pasta_base_nova / "base_nova_consolidada.duckdb"

    # Compatibilidade com fluxo legado (CSV consolidado).
    df.to_csv(csv_path, sep=';', index=False, encoding='utf-8-sig')

    parquet_ok = False
    if pl is not None:
        try:
            # Evita dependência rígida de pyarrow em dtypes estendidos do pandas.
            pl.DataFrame(df.to_dict(orient='list')).write_parquet(parquet_path)
            parquet_ok = True
        except Exception:
            parquet_ok = False

    if not parquet_ok:
        try:
            # Fallback de compatibilidade quando polars não estiver disponível no ambiente.
            df.to_parquet(parquet_path, index=False)
            parquet_ok = True
        except Exception:
            parquet_ok = False

    if not parquet_ok and callback_progresso:
        callback_progresso(0.89, "Aviso: export .parquet não foi gerado (dependências ausentes no ambiente).")

    conn_sqlite = sqlite3.connect(str(sqlite_path))
    try:
        df.to_sql("base_nova_consolidada", conn_sqlite, if_exists="replace", index=False)
    finally:
        conn_sqlite.close()

    if duckdb is not None and parquet_path.exists():
        conn_duck = duckdb.connect(str(duckdb_path))
        try:
            conn_duck.execute(
                "CREATE OR REPLACE TABLE base_nova_consolidada AS SELECT * FROM read_parquet(?)",
                [str(parquet_path)],
            )
        finally:
            conn_duck.close()
    elif callback_progresso:
        callback_progresso(0.89, "Aviso: pacote duckdb indisponível ou parquet ausente; export .duckdb não foi gerado.")

# ==========================================
# FUNÇÃO AUXILIAR DA JUSTIFICATIVA
# ==========================================
def padronizar_justificativa(df: pd.DataFrame) -> pd.DataFrame:
    if 'Status Revenue' not in df.columns:
        return df

    if 'Justificativa' not in df.columns:
        df['Justificativa'] = ''
    
    novos_valores = []
    for just, status in zip(df['Justificativa'], df['Status Revenue']):
        # Limpeza segura de valores nulos ou vazios
        just_str = '' if pd.isna(just) else str(just).strip().upper()
        status_str = '' if pd.isna(status) else str(status).strip().upper()
        
        eh_vazio = just_str in ('', 'NAN', 'NONE', 'NULL', 'NAT')
        
        if eh_vazio and status_str == 'APROVADO':
            novos_valores.append('Aprovado')
        elif eh_vazio and status_str in ('REPROVADO', 'RECUSADO'):
            novos_valores.append('Concorrência')
        else:
            novos_valores.append(str(just) if not pd.isna(just) else '')
            
    df['Justificativa'] = novos_valores
    return df


def normalizar_nome_coluna(nome_coluna: str) -> str:
    """Normaliza nome de coluna para comparação sem acentos/espaços/caracteres especiais."""
    nome = unicodedata.normalize('NFKD', str(nome_coluna)).encode('ascii', 'ignore').decode('ascii')
    return ''.join(ch.lower() for ch in nome if ch.isalnum())


def encontrar_coluna_data_aplicacao(df: pd.DataFrame):
    """Localiza a coluna de Data Aplicação mesmo com variações de grafia."""
    for col in df.columns:
        normalizado = normalizar_nome_coluna(col)
        if normalizado == 'dataaplicacao' or ('data' in normalizado and 'aplic' in normalizado):
            return col
    return None


def data_aplicacao_parece_timestamp_download(df: pd.DataFrame, nome_coluna: str) -> bool:
    """
    Detecta o padrão problemático em que Data Aplicação vem praticamente igual para todo o arquivo
    (ou com variação mínima de segundos), típico de timestamp de download.
    """
    if nome_coluna not in df.columns or df.empty:
        return False

    serie = pd.to_datetime(df[nome_coluna], errors='coerce', dayfirst=True)
    serie_valida = serie.dropna()
    if serie_valida.empty:
        return False

    cobertura = len(serie_valida) / max(len(df), 1)
    if cobertura < 0.85:
        # Se a coluna quase não converte para data, não tratamos como padrão de timestamp.
        return False

    serie_segundos = serie_valida.dt.floor('s').astype('int64') // 10**9
    total = len(serie_segundos)
    unicos = int(serie_segundos.nunique())
    span_segundos = int(serie_segundos.max() - serie_segundos.min()) if total > 1 else 0

    # Permite pequena variação de segundos mantendo o comportamento de "carimbo quase único".
    if total < 200:
        limite_unicos = max(3, int(total * 0.03))
    else:
        limite_unicos = max(3, int(total * 0.01))

    return unicos <= limite_unicos and span_segundos <= 180


def data_aplicacao_top10_iguais(arquivo_excel) -> bool:
    """
    Valida as 10 primeiras linhas de Data Aplicação.
    Retorna True quando todos os valores válidos são exatamente iguais.
    """
    try:
        df = ler_planilha_relatorio(arquivo_excel)
    except Exception:
        return False

    coluna_data = encontrar_coluna_data_aplicacao(df)
    if not coluna_data or coluna_data not in df.columns:
        return False

    serie = df[coluna_data].head(10)
    if serie.empty:
        return False

    valores = []
    for valor in serie:
        if pd.isna(valor):
            continue

        convertido = pd.to_datetime(valor, errors='coerce', dayfirst=True)
        if isinstance(convertido, pd.Timestamp) and not pd.isna(convertido):
            valores.append(convertido.floor('s').strftime('%Y-%m-%d %H:%M:%S'))
        else:
            valores.append(str(valor).strip())

    if len(valores) < 2:
        return False

    return len(set(valores)) == 1


def valor_para_chave_comparacao(valor):
    """Padroniza valores para composição de chave de comparação de estado."""
    if pd.isna(valor):
        return ''
    if isinstance(valor, pd.Timestamp):
        return valor.floor('s').strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(valor, datetime):
        return valor.strftime('%Y-%m-%d %H:%M:%S')
    return str(valor).strip()


def montar_chaves_estado(df: pd.DataFrame, colunas_comparacao):
    """Cria chaves estáveis para casar linhas repetidas sem cruzamento cartesiano."""
    resultado = df.copy()

    if not colunas_comparacao:
        resultado['__cmp_key'] = ''
    else:
        resultado['__cmp_key'] = resultado[colunas_comparacao].apply(
            lambda row: '|'.join(valor_para_chave_comparacao(v) for v in row.values),
            axis=1,
        )

    resultado['__cmp_idx'] = resultado.groupby('__cmp_key', dropna=False).cumcount()
    return resultado



# ==========================================
# MOTOR DE CONCILIAÇÃO DOS ARQUIVOS EBUS
# ==========================================
def processar_arquivos_relatorios(
    arquivo_original,
    destino,
    nome_mes=None,
    ano_atual=None,
    callback_progresso=None,
    destino_base=None,
    destino_saida=None,
    comparar_base=True,
):
    """
    Função coração da regra de negócio EBUS.
    1. Lê a planilha web crua.
    2. Valida se veio vazia.
    3. Concatena colunas de Origem + Destino e aplica Justificativa.
    4. Processa a "Base Nova" (Histórico de Novo, Excluido, Presente).
    5. Processa a "Base Normal" (Mercado vazio, regra de volume).
    """
    nome_arquivo_origem = Path(arquivo_original).name
    if callback_progresso: callback_progresso(0.40, f"Lendo planilha Excel bruta: {nome_arquivo_origem}")
    
    df_novo = ler_planilha_relatorio(arquivo_original)

    if callback_progresso: callback_progresso(0.42, f"Removendo linhas fantasmas ou inválidas...")
    df_novo = df_novo.dropna(how='all')
    
    # =========================================================
    # DETECÇÃO AUTOMÁTICA DE MÊS E ANO (Via Data Viagem)
    # =========================================================
    if nome_mes is None or ano_atual is None:
        if 'Data Viagem' in df_novo.columns:
            # Tenta converter a primeira data válida para datetime com formato brasileiro (dayfirst=True)
            datas_validas = pd.to_datetime(df_novo['Data Viagem'], format='%d/%m/%Y', errors='coerce')
            if datas_validas.isna().all():
                # Plano B: se tiver formato de hora junto ou outro separador
                datas_validas = pd.to_datetime(df_novo['Data Viagem'], dayfirst=True, errors='coerce')
            
            datas_validas = datas_validas.dropna()
            if not datas_validas.empty:
                primeira_data = datas_validas.iloc[0]
                nome_mes = MESES_PT[primeira_data.month]
                ano_atual = primeira_data.year
            else:
                nome_mes = nome_mes or "Desconhecido"
                ano_atual = ano_atual or datetime.now().year
        else:
            nome_mes = nome_mes or "Desconhecido"
            ano_atual = ano_atual or datetime.now().year

    # Verifica se o relatório veio vazio direto da mensagem do site
    mensagem_vazio = 'Não foi possivel obter dados com os parâmetros informados.'
    # Procura a mensagem tanto nas colunas (se o Pandas a leu como cabeçalho) quanto dentro dos dados
    if df_novo.empty or mensagem_vazio in df_novo.columns or df_novo.apply(lambda col: col.astype(str).str.contains(mensagem_vazio, regex=False)).any().any():
        if callback_progresso: callback_progresso(0.45, f"Relatório de {nome_mes} está sem dados no sistema. Descartando e ignorando...")
        try:
            os.remove(arquivo_original)
        except OSError:
            pass
        return {
            "arquivo_principal": None,
            "arquivos_saida": [],
            "pasta_final": None,
            "mensagem": f"Relatório de {nome_mes} sem dados no sistema.",
        }

    # =========================================================
    # TRATAMENTOS UNIVERSAIS (Aplicados a todas as bases)
    # =========================================================
    if 'Origem' in df_novo.columns and 'Destino' in df_novo.columns:
        df_novo['Concatenar Origem e Destino'] = df_novo['Origem'].astype(str) + " X " + df_novo['Destino'].astype(str)

    if callback_progresso: callback_progresso(0.45, f"{nome_mes} - Executando motor de Justificativas e Status do Revenue...")
    # Aplica as regras da Justificativa antes de começar as comparações
    df_novo = padronizar_justificativa(df_novo)

    # =========================================================
    # ESTRUTURA DE PASTAS E ARQUIVOS
    # =========================================================
    nome_oficial = f"Relatorio Revenue Completo - {nome_mes.capitalize()} {ano_atual}.xlsx"

    destino_referencia = Path(destino_base) if destino_base and str(destino_base).strip() else None
    destino_saida_final = Path(destino_saida) if destino_saida else (destino_referencia or resolver_destino_padrao_revenue())

    pasta_base_ref = (destino_referencia / "BASE") if destino_referencia else None
    pasta_base_nova_ref = (destino_referencia / "BASE NOVA") if destino_referencia else None

    # Pasta de trabalho temporária para preparar arquivos antes da publicação final.
    pasta_trabalho_proc = Path(destino) if destino else Path(arquivo_original).parent

    pasta_base_temp = pasta_trabalho_proc / "BASE"
    pasta_base_nova_temp = pasta_trabalho_proc / "BASE NOVA"
    pasta_backup_temp = pasta_trabalho_proc / "BACKUP"
    pasta_backup_nova_temp = pasta_trabalho_proc / "BACKUP NOVO"

    pasta_base = destino_saida_final / "BASE"
    pasta_backup = destino_saida_final / "BACKUP"
    pasta_base_nova = destino_saida_final / "BASE NOVA"
    pasta_backup_base_nova = destino_saida_final / "BACKUP NOVO"

    # Criando todas as pastas de saída de forma limpa
    for pasta in [
        pasta_base_temp,
        pasta_base_nova_temp,
        pasta_backup_temp,
        pasta_backup_nova_temp,
        pasta_base,
        pasta_backup,
        pasta_base_nova,
        pasta_backup_base_nova,
    ]:
        pasta.mkdir(parents=True, exist_ok=True)

    caminho_base_ref = (pasta_base_ref / nome_oficial) if pasta_base_ref else None
    caminho_base_nova_ref = (pasta_base_nova_ref / nome_oficial) if pasta_base_nova_ref else None
    caminho_base = pasta_base / nome_oficial
    caminho_base_nova = pasta_base_nova / nome_oficial
    caminho_base_temp = pasta_base_temp / nome_oficial
    caminho_base_nova_temp = pasta_base_nova_temp / nome_oficial

    resumo_validacao = {
        "base_normal": {
            "linhas_atual": 0,
            "linhas_anterior": 0,
            "linhas_novas": 0,
            "linhas_manteve": 0,
            "linhas_excluidas": 0,
            "substituiu_base": False,
        },
        "base_nova": {
            "linhas_total": 0,
            "novo": 0,
            "manteve": 0,
            "excluido": 0,
            "publicada": False,
        },
    }

    # =========================================================
    # PARTE 1: BASE NOVA (Mapeamento de Novo / Excluido / Presente)
    # =========================================================
    if callback_progresso: callback_progresso(0.50, f"{nome_mes} - Preparando comparação histórica de Base Nova...")
    deve_publicar_base_nova = True
    df_base_estado_antiga = pd.DataFrame()

    if comparar_base and caminho_base_nova_ref and caminho_base_nova_ref.exists():
        df_base_estado_antiga = ler_planilha_relatorio(caminho_base_nova_ref).dropna(how='all')
        
        if 'Estado' in df_base_estado_antiga.columns:
            df_old_active = df_base_estado_antiga[df_base_estado_antiga['Estado'] != 'Excluido'].copy()
            df_previously_excluded = df_base_estado_antiga[df_base_estado_antiga['Estado'] == 'Excluido'].copy()
        else:
            df_old_active = df_base_estado_antiga.copy()
            df_previously_excluded = pd.DataFrame()
            
        df_old_comp = df_old_active.drop(columns=['Estado'], errors='ignore')
        
        df_new_comp = df_novo.copy()
        
        df_old_comp = padronizar_justificativa(df_old_comp)

        colunas_comuns = [c for c in df_new_comp.columns if c in df_old_comp.columns]

        # Harmoniza tipos das colunas comuns para evitar divergências artificiais na chave.
        for col in colunas_comuns:
            if df_old_comp[col].dtype != df_new_comp[col].dtype:
                df_old_comp[col] = df_old_comp[col].astype(str)
                df_new_comp[col] = df_new_comp[col].astype(str)

        coluna_data_old = encontrar_coluna_data_aplicacao(df_old_comp)
        coluna_data_new = encontrar_coluna_data_aplicacao(df_new_comp)

        ignorar_data_aplicacao = False
        coluna_data_validacao = None

        if coluna_data_new and coluna_data_new in colunas_comuns:
            coluna_data_validacao = coluna_data_new
        elif coluna_data_old and coluna_data_old in colunas_comuns:
            coluna_data_validacao = coluna_data_old

        if coluna_data_validacao:
            flag_old = coluna_data_old and data_aplicacao_parece_timestamp_download(df_old_comp, coluna_data_old)
            flag_new = coluna_data_new and data_aplicacao_parece_timestamp_download(df_new_comp, coluna_data_new)
            ignorar_data_aplicacao = bool(flag_old or flag_new)

        if ignorar_data_aplicacao and coluna_data_validacao:
            colunas_comparacao = [c for c in colunas_comuns if c != coluna_data_validacao]
            print(f"[INFO] Modo adaptativo: '{coluna_data_validacao}' ignorada na validação de estado (padrão de timestamp de download detectado).")
            if callback_progresso:
                callback_progresso(0.52, f"{nome_mes} - Ajuste inteligente: Data Aplicação ignorada na validação de estado.")
        else:
            colunas_comparacao = colunas_comuns
            if coluna_data_validacao and callback_progresso:
                callback_progresso(0.52, f"{nome_mes} - Data Aplicação mantida na validação de estado.")

        df_old_comp_keyed = montar_chaves_estado(df_old_comp, colunas_comparacao)
        df_new_comp_keyed = montar_chaves_estado(df_new_comp, colunas_comparacao)

        df_merge_estado = pd.merge(
            df_old_comp_keyed,
            df_new_comp_keyed,
            on=['__cmp_key', '__cmp_idx'],
            how='outer',
            indicator=True,
            suffixes=('_old', '_new'),
        )

        todas_colunas = list(df_new_comp.columns)
        for col in df_old_comp.columns:
            if col not in todas_colunas:
                todas_colunas.append(col)

        df_comparado = pd.DataFrame()
        for col in todas_colunas:
            col_new = f"{col}_new"
            col_old = f"{col}_old"

            if col_new in df_merge_estado.columns and col_old in df_merge_estado.columns:
                df_comparado[col] = df_merge_estado[col_new].combine_first(df_merge_estado[col_old])
            elif col_new in df_merge_estado.columns:
                df_comparado[col] = df_merge_estado[col_new]
            elif col_old in df_merge_estado.columns:
                df_comparado[col] = df_merge_estado[col_old]
        
        mapa_estado = {'left_only': 'Excluido', 'right_only': 'Novo', 'both': 'Manteve'}
        
        df_comparado['Estado'] = df_merge_estado['_merge'].map(mapa_estado)
        
        if not df_previously_excluded.empty:
            df_comparado = pd.concat([df_comparado, df_previously_excluded], ignore_index=True)
            
    else:
        df_comparado = df_novo.copy()
        df_comparado['Estado'] = 'Novo'

    # Garante que a coluna Mercado não vai sujar a base nova
    if 'Mercado' in df_comparado.columns:
        df_comparado = df_comparado.drop(columns=['Mercado'])

    # Publica sempre que houver diferença efetiva, inclusive transição Novo -> Manteve.
    if not df_base_estado_antiga.empty:
        colunas_estado = [c for c in df_comparado.columns if c in df_base_estado_antiga.columns]
        if colunas_estado:
            antigo_norm = (
                df_base_estado_antiga[colunas_estado]
                .fillna('')
                .astype(str)
                .sort_values(by=colunas_estado)
                .reset_index(drop=True)
            )
            novo_norm = (
                df_comparado[colunas_estado]
                .fillna('')
                .astype(str)
                .sort_values(by=colunas_estado)
                .reset_index(drop=True)
            )
            deve_publicar_base_nova = not novo_norm.equals(antigo_norm)

    if 'Estado' in df_comparado.columns:
        contagem_estados = df_comparado['Estado'].fillna('').astype(str).str.upper().value_counts()
        resumo_validacao['base_nova']['linhas_total'] = int(len(df_comparado))
        resumo_validacao['base_nova']['novo'] = int(contagem_estados.get('NOVO', 0))
        resumo_validacao['base_nova']['manteve'] = int(contagem_estados.get('MANTEVE', 0))
        resumo_validacao['base_nova']['excluido'] = int(contagem_estados.get('EXCLUIDO', 0))

        if callback_progresso:
            callback_progresso(
                0.54,
                (
                    f"{nome_mes} - Estado Base Nova | "
                    f"Novo: {resumo_validacao['base_nova']['novo']} | "
                    f"Manteve: {resumo_validacao['base_nova']['manteve']} | "
                    f"Excluído: {resumo_validacao['base_nova']['excluido']}"
                ),
            )

    if deve_publicar_base_nova:
        if callback_progresso: callback_progresso(0.55, f"{nome_mes} - Salvando Base Nova formatada...")

        if caminho_base_nova.exists():
            if callback_progresso:
                callback_progresso(0.75, f"Fazendo backup da Base Nova: {caminho_base_nova.name}")

            mtime_nova = os.path.getmtime(caminho_base_nova)
            data_mod_nova = datetime.fromtimestamp(mtime_nova).strftime('%d.%m.%Y_%H-%M-%S')
            nome_backup_nova_com_data = sanitizar_nome_arquivo(
                f"{caminho_base_nova.stem} - Backup ({data_mod_nova}){caminho_base_nova.suffix}"
            )

            shutil.copy2(str(caminho_base_nova), str(pasta_backup_base_nova / nome_backup_nova_com_data))

        salvar_excel_formatado(df_comparado, caminho_base_nova_temp, "Relatorio Comparado")
        shutil.copy2(str(caminho_base_nova_temp), str(caminho_base_nova))
        resumo_validacao['base_nova']['publicada'] = True

        if callback_progresso:
            callback_progresso(0.78, f"Base Nova atualizada: {caminho_base_nova.name}")
    else:
        # Mantém rastreabilidade temporária mesmo quando não houver publicação.
        if caminho_base_nova_ref and caminho_base_nova_ref.exists():
            shutil.copy2(str(caminho_base_nova_ref), str(caminho_base_nova_temp))
        if callback_progresso:
            callback_progresso(0.78, f"Base Nova sem alterações: {caminho_base_nova.name}")

    # Consolidação cumulativa da Base Nova (csv/parquet/sqlite/duckdb)
    if callback_progresso:
        callback_progresso(0.80, f"{nome_mes} - Atualizando consolidados da Base Nova...")

    parquet_consol = pasta_base_nova / 'base_nova_consolidada.parquet'
    csv_consol = pasta_base_nova / 'base_nova_consolidada.csv'

    if parquet_consol.exists():
        try:
            if pl is not None:
                df_existente = pl.read_parquet(parquet_consol).to_pandas()
            else:
                df_existente = pd.read_parquet(parquet_consol)
            df_consolidado = pd.concat([df_existente, df_comparado], ignore_index=True)
        except Exception:
            df_consolidado = df_comparado.copy()
    elif csv_consol.exists():
        try:
            df_existente = pd.read_csv(csv_consol, sep=';', encoding='utf-8-sig').dropna(how='all')
            df_consolidado = pd.concat([df_existente, df_comparado], ignore_index=True)
        except Exception:
            df_consolidado = df_comparado.copy()
    else:
        df_consolidado = df_comparado.copy()

    colunas_unicas = [
        'Origem', 'Destino', 'Data Viagem',
        'Sugestão Revenue', 'Revenue Aplicado'
    ]
    subset_existente = [c for c in colunas_unicas if c in df_consolidado.columns]
    if subset_existente:
        df_consolidado = df_consolidado.drop_duplicates(subset=subset_existente, keep='last')
    else:
        df_consolidado = df_consolidado.drop_duplicates()

    exportar_base_nova_consolidada(df_consolidado, pasta_base_nova_temp, callback_progresso=callback_progresso)

    # Publica os consolidados para a pasta final da aplicação.
    for nome_artefato in [
        'base_nova_consolidada.csv',
        'base_nova_consolidada.parquet',
        'base_nova_consolidada.db',
        'base_nova_consolidada.duckdb',
    ]:
        src = pasta_base_nova_temp / nome_artefato
        dst = pasta_base_nova / nome_artefato
        if src.exists():
            shutil.copy2(str(src), str(dst))

    # =========================================================
    # PARTE 2: BASE NORMAL (Com "Mercado" em branco)
    # =========================================================
    if callback_progresso: callback_progresso(0.60, f"{nome_mes} - Avaliando regras de proteção de volume para Base Normal...")
    
    
    df_novo_base = df_novo.copy()
    
    # Prevenção: Garante que a coluna Estado não vaze para a base normal
    if 'Estado' in df_novo_base.columns:
        df_novo_base = df_novo_base.drop(columns=['Estado'])
        
    df_novo_base['Mercado'] = ""

    substituir_base = True
    linhas_manteve_base = 0
    linhas_novas_base = 0
    linhas_excluidas_base = 0
    linhas_anterior_base = 0

    if comparar_base and caminho_base_ref and caminho_base_ref.exists():
        df_base_antiga = ler_planilha_relatorio(caminho_base_ref).dropna(how='all')
        linhas_anterior_base = int(len(df_base_antiga))

        df_old_comp = padronizar_justificativa(df_base_antiga.copy())
        df_new_comp = padronizar_justificativa(df_novo_base.copy())

        colunas_comuns_base = [c for c in df_new_comp.columns if c in df_old_comp.columns]

        for col in colunas_comuns_base:
            if df_old_comp[col].dtype != df_new_comp[col].dtype:
                df_old_comp[col] = df_old_comp[col].astype(str)
                df_new_comp[col] = df_new_comp[col].astype(str)

        coluna_data_old_base = encontrar_coluna_data_aplicacao(df_old_comp)
        coluna_data_new_base = encontrar_coluna_data_aplicacao(df_new_comp)
        coluna_data_validacao_base = None

        if coluna_data_new_base and coluna_data_new_base in colunas_comuns_base:
            coluna_data_validacao_base = coluna_data_new_base
        elif coluna_data_old_base and coluna_data_old_base in colunas_comuns_base:
            coluna_data_validacao_base = coluna_data_old_base

        ignorar_data_aplicacao_base = False
        if coluna_data_validacao_base:
            flag_old_base = coluna_data_old_base and data_aplicacao_parece_timestamp_download(df_old_comp, coluna_data_old_base)
            flag_new_base = coluna_data_new_base and data_aplicacao_parece_timestamp_download(df_new_comp, coluna_data_new_base)
            ignorar_data_aplicacao_base = bool(flag_old_base or flag_new_base)

        if ignorar_data_aplicacao_base and coluna_data_validacao_base:
            colunas_comparacao_base = [c for c in colunas_comuns_base if c != coluna_data_validacao_base]
        else:
            colunas_comparacao_base = colunas_comuns_base

        df_old_comp_keyed = montar_chaves_estado(df_old_comp, colunas_comparacao_base)
        df_new_comp_keyed = montar_chaves_estado(df_new_comp, colunas_comparacao_base)

        df_merge_base = pd.merge(
            df_old_comp_keyed[['__cmp_key', '__cmp_idx']],
            df_new_comp_keyed[['__cmp_key', '__cmp_idx']],
            on=['__cmp_key', '__cmp_idx'],
            how='outer',
            indicator=True,
        )

        linhas_manteve_base = int((df_merge_base['_merge'] == 'both').sum())
        linhas_novas_base = int((df_merge_base['_merge'] == 'right_only').sum())
        linhas_excluidas_base = int((df_merge_base['_merge'] == 'left_only').sum())

        # Só mantém a base atual quando realmente não houve mudança relevante.
        if linhas_novas_base == 0 and linhas_excluidas_base == 0 and len(df_novo_base) <= len(df_base_antiga):
            substituir_base = False

    resumo_validacao['base_normal']['linhas_atual'] = int(len(df_novo_base))
    resumo_validacao['base_normal']['linhas_anterior'] = int(linhas_anterior_base)
    resumo_validacao['base_normal']['linhas_novas'] = int(linhas_novas_base)
    resumo_validacao['base_normal']['linhas_manteve'] = int(linhas_manteve_base)
    resumo_validacao['base_normal']['linhas_excluidas'] = int(linhas_excluidas_base)
    resumo_validacao['base_normal']['substituiu_base'] = bool(substituir_base)

    if callback_progresso:
        callback_progresso(
            0.63,
            (
                f"{nome_mes} - Base Normal | Atual: {resumo_validacao['base_normal']['linhas_atual']} | "
                f"Anterior: {resumo_validacao['base_normal']['linhas_anterior']} | "
                f"Novo: {resumo_validacao['base_normal']['linhas_novas']} | "
                f"Manteve: {resumo_validacao['base_normal']['linhas_manteve']} | "
                f"Excluído: {resumo_validacao['base_normal']['linhas_excluidas']}"
            ),
        )

    if substituir_base:
        if callback_progresso: callback_progresso(0.65, f"{nome_mes} - Salvando Base Normal formatada...")
        
        if caminho_base.exists():
            if callback_progresso:
                callback_progresso(0.85, f"Fazendo backup da Base: {caminho_base.name}")
            
            # Obtém a data de modificação do arquivo atual para compor o nome do backup
            mtime = os.path.getmtime(caminho_base)
            data_mod = datetime.fromtimestamp(mtime).strftime('%d.%m.%Y_%H-%M-%S')
            nome_backup_com_data = sanitizar_nome_arquivo(
                f"{caminho_base.stem} - Backup ({data_mod}){caminho_base.suffix}"
            )
            
            shutil.copy2(str(caminho_base), str(pasta_backup / nome_backup_com_data))

        salvar_excel_formatado(df_novo_base, caminho_base_temp, "Relatorio Revenue Sistema")
        shutil.copy2(str(caminho_base_temp), str(caminho_base))
        if callback_progresso:
            callback_progresso(0.88, f"Base principal atualizada: {caminho_base.name}")
    else:
        # Mantém rastreabilidade temporária mesmo sem atualização da base final.
        if caminho_base_ref and caminho_base_ref.exists():
            shutil.copy2(str(caminho_base_ref), str(caminho_base_temp))
        if callback_progresso:
            nome_ref = caminho_base_ref.name if caminho_base_ref else caminho_base.name
            callback_progresso(0.88, f"Base principal mantida (volume não superior ao arquivo atual): {nome_ref}")

    # =========================================================
    # LIMPEZA FINAL
    # =========================================================
    if os.path.exists(arquivo_original):
        os.remove(arquivo_original)
    
    if callback_progresso: callback_progresso(0.9, f"Arquivo processado com sucesso: {nome_arquivo_origem}")

    return {
        "arquivo_principal": str(caminho_base),
        "arquivos_saida": [str(caminho_base), str(caminho_base_nova)],
        "arquivos_temporarios": [str(caminho_base_temp), str(caminho_base_nova_temp)],
        "resumo_validacao": resumo_validacao,
        "pasta_final": str(destino_saida_final),
        "pasta_temporaria": str(pasta_trabalho_proc),
        "mensagem": "Processamento EBUS concluído com sucesso.",
    }

# ==========================================
# GESTOR DE NAVEGAÇÃO WEB EBUS (Selenium)
# ==========================================
def executar_ebus(
    id_usuario_logado,
    data_inicio,
    data_final,
    callback_progresso=None,
    hook_cancelamento=None,
    modo_execucao="completo",
    pasta_destino=None,
    arquivo_entrada=None,
    base_automacao=None,
    saida="padrao",
):
    def checar_parada():
        if hook_cancelamento and hook_cancelamento():
            raise CanceladoPeloUsuario("Processo cancelado pelo usuário.")

    modos_validos = {
        "download",
        "download_tratamento",
        "tratamento",
        "tratamento_envio",
        "completo",
        "arquivo_tratamento",
        "arquivo_envio",
        "arquivo_tratamento_envio",
    }
    if modo_execucao not in modos_validos:
        raise ValueError(f"Modo de execução inválido para EBUS: {modo_execucao}")

    usar_saida_personalizada = str(saida).strip().lower() == "personalizada"
    destino_envio = Path(pasta_destino).expanduser() if (usar_saida_personalizada and pasta_destino) else None

    base_referencia = resolver_destino_revenue(
        base_automacao=base_automacao,
        pasta_personalizada=arquivo_entrada,
    )

    # Quando saída não é personalizada, ignora qualquer pasta enviada por engano no payload.
    comparar_com_base = base_referencia is not None
    destino_final = destino_envio or base_referencia or resolver_destino_padrao_revenue()
    origem_download = Path.home() / "Downloads"
    pasta_execucao = datetime.now().strftime("%Y%m%d_%H%M%S")
    pasta_trabalho = origem_download / f"_EBUS_Revenue_Temp_{pasta_execucao}"
    pasta_trabalho.mkdir(parents=True, exist_ok=True)
    limpar_pasta_trabalho_ao_final = modo_execucao != "download"

    precisa_download = modo_execucao in {"download", "download_tratamento", "completo"}
    precisa_tratamento = modo_execucao in {
        "download_tratamento",
        "tratamento",
        "tratamento_envio",
        "completo",
        "arquivo_tratamento",
        "arquivo_tratamento_envio",
    }

    if modo_execucao.startswith("arquivo_") and not arquivo_entrada:
        raise ValueError("Selecione um arquivo de entrada para este modo.")

    if precisa_download:
        data_inicio_dt = parse_data_parametro(data_inicio)
        data_final_dt = parse_data_parametro(data_final)
        if not data_inicio_dt or not data_final_dt:
            raise ValueError("As datas de início e fim são obrigatórias para download no EBUS.")
        if data_inicio_dt > data_final_dt:
            raise ValueError("Data inicial não pode ser maior que a data final no EBUS.")
        data_inicio = data_inicio_dt.strftime("%d/%m/%Y")
        data_final = data_final_dt.strftime("%d/%m/%Y")

    if not precisa_download and precisa_tratamento and not arquivo_entrada:
        raise ValueError("Tratamento sem download exige um arquivo já baixado.")

    if modo_execucao == "arquivo_envio":
        origem_arquivo = Path(arquivo_entrada)
        if not origem_arquivo.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {origem_arquivo}")
        pasta_final = destino_envio or pasta_trabalho
        pasta_final.mkdir(parents=True, exist_ok=True)
        destino_final = pasta_final / origem_arquivo.name
        shutil.copy2(str(origem_arquivo), str(destino_final))
        if callback_progresso:
            callback_progresso(1.0, f"Arquivo enviado: {destino_final.name}")
        return {
            "arquivo_principal": str(destino_final),
            "arquivos_saida": [str(destino_final)],
            "pasta_final": str(pasta_final),
            "mensagem": "Arquivo enviado com sucesso.",
        }

    arquivos_baixados = []
    resultados_processamento = []
    driver = None

    try:
        if precisa_download:
            username, senha_user = buscar_credencial_site(id_usuario_logado, "EBUS")
            if not username or not senha_user:
                if callback_progresso:
                    callback_progresso(0.0, "ERRO: Credenciais do EBUS não encontradas no Cofre!")
                return {
                    "arquivo_principal": None,
                    "arquivos_saida": [],
                    "pasta_final": None,
                    "mensagem": "Credenciais do EBUS não encontradas no Cofre.",
                }

            if callback_progresso:
                callback_progresso(0.1, "Abrindo Navegador Invisível...")

            opcoes = Options()
            opcoes.add_argument("--window-size=1920,1080")
            opcoes.add_argument("--headless")

            driver_path = get_driver_path()
            if driver_path and "chrome" in Path(driver_path).name.lower():
                from selenium.webdriver.chrome.service import Service
                driver = webdriver.Chrome(service=Service(driver_path), options=opcoes)
            else:
                driver = webdriver.Chrome(options=opcoes)

            max_tentativas_download = 2
            baixou_arquivo_valido = False

            for tentativa_download in range(1, max_tentativas_download + 1):
                checar_parada()
                if callback_progresso:
                    callback_progresso(
                        0.12,
                        f"Tentativa {tentativa_download}/{max_tentativas_download}: acessando e higienizando sessão EBUS...",
                    )

                limpar_cookies_ebus(driver, callback_progresso=callback_progresso)
                wait = WebDriverWait(driver, 400)

                if callback_progresso:
                    callback_progresso(0.2, "Fazendo login no EBUS...")

                login = wait.until(EC.presence_of_element_located((By.XPATH, "//input[contains (@id, 'input-usuario')]")))
                login.send_keys(username)
                senha = driver.find_element(By.XPATH, "//input[contains (@id, 'input-senha')]")
                senha.send_keys(senha_user)
                wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Login')]"))).click()

                if callback_progresso:
                    callback_progresso(0.3, "Navegando até aba de Revenue...")

                wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(@class, 'menu-title ng-tns-c129-33')]"))).click()
                wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(@class, 'menu-title ng-tns-c129-37')]"))).click()

                checar_parada()
                if callback_progresso:
                    callback_progresso(0.32, f"Aplicando filtro único no período: {data_inicio} até {data_final}...")

                data_relatorio = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Início Viagem')]")))
                data_relatorio.clear()
                data_relatorio.send_keys(data_inicio)
                data_relatorio = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Fim Viagem')]")))
                data_relatorio.clear()
                data_relatorio.send_keys(data_final)

                if callback_progresso:
                    callback_progresso(0.35, "Pesquisando período completo... Aguardando tabela.")
                wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), ' Pesquisar ')]"))).click()

                try:
                    wait.until(EC.presence_of_element_located((By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")))
                except Exception:
                    pass

                def spinner_disappeared(driver_ref):
                    spinners = driver_ref.find_elements(By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")
                    for spinner in spinners:
                        if spinner.get_attribute("ng-reflect-nb-spinner") == "true":
                            return False
                    return True

                wait.until(spinner_disappeared)
                checar_parada()

                arquivos_antes = {str(p.resolve()) for p in origem_download.rglob("*RelatorioRevenue*.xls*")}

                if callback_progresso:
                    callback_progresso(0.40, "Tabela carregada. Disparando download único do período...")
                wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Gerar EXCEL')]"))).click()

                if callback_progresso:
                    callback_progresso(0.45, "Aguardando arquivo do período completo...")

                arquivo_encontrado = None
                ultimo_temp_reportado = None
                limite_espera = time.time() + 240
                while time.time() < limite_espera:
                    checar_parada()
                    candidatos = [
                        p for p in origem_download.rglob("*RelatorioRevenue*.xls*")
                        if str(p.resolve()) not in arquivos_antes
                    ]
                    candidatos_finais = [p for p in candidatos if arquivo_download_revenue_finalizado(p)]
                    candidatos_temporarios = [
                        p for p in candidatos
                        if str(p).lower().endswith('.crdownload') or str(p).lower().endswith('.part')
                    ]

                    if candidatos_finais:
                        candidatos_finais.sort(key=os.path.getmtime, reverse=True)
                        arquivo_encontrado = candidatos_finais[0]
                        break

                    if candidatos_temporarios and callback_progresso:
                        candidatos_temporarios.sort(key=os.path.getmtime, reverse=True)
                        nome_temp = candidatos_temporarios[0].name
                        if nome_temp != ultimo_temp_reportado:
                            callback_progresso(0.48, f"Download em andamento, aguardando conclusão: {nome_temp}")
                            ultimo_temp_reportado = nome_temp

                    time.sleep(1)

                if arquivo_encontrado is None:
                    if callback_progresso:
                        callback_progresso(0.52, "AVISO: arquivo do período completo não foi encontrado.")
                    continue

                if callback_progresso:
                    callback_progresso(0.50, f"Arquivo encontrado: {arquivo_encontrado.name}")

                novo_nome = pasta_trabalho / f"RelatorioRevenue - {datetime.now().strftime('%d.%m.%Y_%H%M%S')}{arquivo_encontrado.suffix}"
                shutil.move(str(arquivo_encontrado), str(novo_nome))

                if data_aplicacao_top10_iguais(novo_nome):
                    if callback_progresso:
                        callback_progresso(
                            0.53,
                            "Validação detectou Data Aplicação repetida nas 10 primeiras linhas. Excluindo e refazendo download com nova limpeza.",
                        )
                    try:
                        os.remove(novo_nome)
                    except OSError:
                        pass
                    continue

                arquivos_baixados.append(novo_nome)
                baixou_arquivo_valido = True
                if callback_progresso:
                    callback_progresso(0.55, f"Arquivo renomeado: {arquivo_encontrado.name} -> {novo_nome.name}")
                break

            if not baixou_arquivo_valido and callback_progresso:
                callback_progresso(0.56, "Nenhum arquivo válido foi obtido após as tentativas automáticas de limpeza e novo download.")

            if modo_execucao == "download":
                arquivos_saida = [str(p) for p in arquivos_baixados]
                pasta_final = pasta_trabalho
                if destino_envio:
                    destino_envio.mkdir(parents=True, exist_ok=True)
                    arquivos_saida = []
                    total_baixados = len(arquivos_baixados)
                    for idx_item, item in enumerate(arquivos_baixados, 1):
                        destino_item = destino_envio / item.name
                        shutil.copy2(str(item), str(destino_item))
                        arquivos_saida.append(str(destino_item))
                        if callback_progresso:
                            callback_progresso(
                                0.9 + (0.09 * (idx_item / max(total_baixados, 1))),
                                f"Arquivo copiado para saída ({idx_item}/{total_baixados}): {destino_item.name}",
                            )
                    pasta_final = destino_envio

                if callback_progresso:
                    callback_progresso(1.0, "Download EBUS concluído com sucesso!")
                return {
                    "arquivo_principal": arquivos_saida[0] if arquivos_saida else None,
                    "arquivos_saida": arquivos_saida,
                    "pasta_final": str(pasta_final),
                    "mensagem": "Download EBUS concluído com sucesso.",
                }

        if not precisa_download and arquivo_entrada:
            origem_manual = Path(arquivo_entrada)
            if not origem_manual.exists():
                raise FileNotFoundError(f"Arquivo de entrada não encontrado: {origem_manual}")
            copia_manual = pasta_trabalho / f"manual_{datetime.now().strftime('%Y%m%d_%H%M%S')}{origem_manual.suffix}"
            shutil.copy2(str(origem_manual), str(copia_manual))
            arquivos_baixados = [copia_manual]
            if callback_progresso:
                callback_progresso(0.5, f"Arquivo manual localizado para tratamento: {origem_manual.name}")

        if precisa_tratamento:
            arquivos_para_processamento = []
            for idx, arquivo in enumerate(arquivos_baixados, 1):
                checar_parada()
                if callback_progresso:
                    callback_progresso(0.55, f"Separando por mês o arquivo {idx}/{len(arquivos_baixados)}: {Path(arquivo).name}")

                arquivos_mes = separar_arquivo_por_mes_data_viagem(
                    arquivo,
                    pasta_trabalho,
                    callback_progresso=callback_progresso,
                )
                arquivos_para_processamento.extend(arquivos_mes)

            for idx, item in enumerate(arquivos_para_processamento, 1):
                checar_parada()
                caminho_arquivo = item["arquivo"]
                nome_mes_item = item.get("nome_mes")
                ano_item = item.get("ano")

                if callback_progresso:
                    callback_progresso(
                        0.62,
                        f"Processando recorte mensal {idx}/{len(arquivos_para_processamento)}: {Path(caminho_arquivo).name}",
                    )

                resultado_proc = processar_arquivos_relatorios(
                    caminho_arquivo,
                    pasta_trabalho,
                    nome_mes=nome_mes_item,
                    ano_atual=ano_item,
                    callback_progresso=callback_progresso,
                    destino_base=str(base_referencia) if base_referencia else None,
                    destino_saida=str(destino_final),
                    comparar_base=comparar_com_base,
                )
                if resultado_proc:
                    resultados_processamento.append(resultado_proc)

            if not resultados_processamento:
                return {
                    "arquivo_principal": None,
                    "arquivos_saida": [],
                    "pasta_final": str(destino_final),
                    "mensagem": "Nenhum arquivo válido foi processado no EBUS.",
                }

            arquivos_saida = []
            for resultado_proc in resultados_processamento:
                arquivos_saida.extend(resultado_proc.get("arquivos_saida", []))

            # Evita retorno duplicado de paths quando múltiplas etapas tocam no mesmo arquivo final.
            arquivos_saida = list(dict.fromkeys(arquivos_saida))

            arquivo_principal = resultados_processamento[-1].get("arquivo_principal")
            pasta_final = resultados_processamento[-1].get("pasta_final")

            if callback_progresso:
                callback_progresso(1.0, "Processo EBUS concluído com sucesso!")

            return {
                "arquivo_principal": arquivo_principal,
                "arquivos_saida": arquivos_saida,
                "pasta_final": pasta_final,
                "mensagem": "Processo EBUS concluído com sucesso.",
            }

        if callback_progresso:
            callback_progresso(1.0, "Nenhuma ação executada.")
        return {
            "arquivo_principal": None,
            "arquivos_saida": [],
            "pasta_final": None,
            "mensagem": "Nada para executar com a combinação selecionada.",
        }

    except CanceladoPeloUsuario as erro_cancel:
        if callback_progresso:
            callback_progresso(0, str(erro_cancel))
        raise

    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        if limpar_pasta_trabalho_ao_final and pasta_trabalho.exists():
            try:
                shutil.rmtree(str(pasta_trabalho), ignore_errors=True)
            except Exception:
                pass

# ==========================================
# EXECUÇÃO VIA CLI/BACKEND
# ==========================================
if __name__ == '__main__':
    import json
    import sys
    import base64

    # Ler parâmetros de CLI (Base64 via argv) ou fallback para STDIN
    try:
        if len(sys.argv) > 1:
            params = json.loads(base64.b64decode(sys.argv[1]))
        else:
            line = sys.stdin.readline()
            params = json.loads(line) if line else {}
    except:
        params = {}

    user_id = params.get('user_id', 1)
    
    def fix_date(d):
        return formatar_data_filtro_portal(d)

    data_ini = fix_date(params.get('data_ini')) or (datetime.now().strftime('%d/%m/%Y'))
    data_fim = fix_date(params.get('data_fim')) or data_ini

    def progress_callback(p, m):
        print(f'PROGRESS:{{"p": {int(p*100)}, "m": "{m}"}}', flush=True)

    try:
        resultado = executar_ebus(
            id_usuario_logado=user_id,
            data_inicio=data_ini,
            data_final=data_fim,
            callback_progresso=progress_callback,
            modo_execucao=params.get('acao', 'completo'),
            pasta_destino=params.get('pasta_saida'),
            arquivo_entrada=params.get('pasta_personalizada'),
            base_automacao=params.get('base'),
            saida=params.get('saida', 'padrao')
        )
        print(json.dumps(resultado))
    except Exception as e:
        print(f"ERRO: {str(e)}", file=sys.stderr)
        sys.exit(1)
