import sys
import os
import base64
import json
# Feedback SEM COMBINACAO DE CARACTERES ESPECIAIS para evitar erro de encoding no match
print("PROGRESS:{\"p\": 1, \"m\": \"Carregando Modulos Automation...\"}", flush=True)

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import time
import shutil
import calendar
import re
import pandas as pd
from pathlib import Path
from datetime import datetime, timedelta

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.edge.options import Options


try:
    from selenium_helper import get_driver_path
except ImportError:
    def get_driver_path():
        return None
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# IMPORTAMOS O BANCO PARA PUXAR A SENHA
from core.banco import buscar_credencial_site

class CanceladoPeloUsuario(Exception):
    pass


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

def gerar_intervalos_mensais(data_str_inicio, data_str_fim):
    """Divide a janela de datas informada em pedaços mensais para puxar 
    no site (pois pode existir limite de dados por pesquisa no ADM)."""
    inicio = parse_data_parametro(data_str_inicio)
    fim_global = parse_data_parametro(data_str_fim)
    if not inicio or not fim_global:
        raise ValueError("As datas de início e fim são obrigatórias para gerar intervalos do ADM.")
    atual = inicio
    intervalos = []
    while atual <= fim_global:
        ultimo_dia_mes = calendar.monthrange(atual.year, atual.month)[1]
        data_ultimo_dia = datetime(atual.year, atual.month, ultimo_dia_mes)
        fim_trecho = min(data_ultimo_dia, fim_global)
        intervalos.append((atual.strftime("%d/%m/%Y"), fim_trecho.strftime("%d/%m/%Y")))
        atual = data_ultimo_dia + timedelta(days=1)
    return intervalos

def renomear_arquivo(caminho_arquivo, caminho_destino, contador):
    """Move e renomeia o arquivo que acabou de ser baixado, adicionando um sufixo numérico."""
    extensao = caminho_arquivo.suffix 
    novo_nome = f"Temp_Relatorio_{contador}{extensao}"
    novo_caminho = caminho_destino / novo_nome
    shutil.move(str(caminho_arquivo), str(novo_caminho))
    return novo_caminho


def _is_arquivo_temporario_download(arquivo: Path):
    nome = arquivo.name.lower()
    return nome.endswith((".crdownload", ".tmp", ".part"))


def listar_arquivos_download_demanda(origem_download: Path):
    arquivos = []
    for padrao in ("RelatorioDemandaDetalhado*.xls*", "RelatorioDemanda*.xls*", "*Demanda*.xls*"):
        arquivos.extend(origem_download.rglob(padrao))

    # Remove duplicados quando o mesmo arquivo casa com mais de um padrão
    unicos = {}
    for arq in arquivos:
        try:
            unicos[str(arq.resolve())] = arq
        except Exception:
            unicos[str(arq)] = arq
    return list(unicos.values())


def separar_arquivos_download(arquivos):
    arquivos_validos = []
    arquivos_temporarios = []
    for arq in arquivos:
        nome = arq.name.lower()
        if _is_arquivo_temporario_download(arq):
            arquivos_temporarios.append(arq)
            continue
        if "_a_" in nome:
            continue
        arquivos_validos.append(arq)
    return arquivos_validos, arquivos_temporarios


def snapshot_arquivos_validos(origem_download: Path):
    todos = listar_arquivos_download_demanda(origem_download)
    validos, _ = separar_arquivos_download(todos)
    snapshot = {}
    for arq in validos:
        try:
            st = arq.stat()
            snapshot[str(arq.resolve())] = (st.st_mtime_ns, st.st_size)
        except Exception:
            snapshot[str(arq.resolve())] = None
    return snapshot


def detectar_arquivo_novo_ou_atualizado(validos, snapshot_antes):
    candidatos = []
    for arq in validos:
        try:
            caminho = str(arq.resolve())
            st = arq.stat()
            assinatura_atual = (st.st_mtime_ns, st.st_size)
            assinatura_antiga = snapshot_antes.get(caminho)
            if assinatura_antiga != assinatura_atual:
                candidatos.append(arq)
        except Exception:
            continue

    return sorted(candidatos, key=os.path.getmtime, reverse=True)


def aguardar_novo_download(
    origem_download: Path,
    arquivos_antes=None,
    timeout=300,
    callback_progresso=None,
    progresso_base=0.0,
    mensagem_base="Aguardando download",
):
    arquivos_antes = arquivos_antes or {}
    inicio = time.time()
    ultimo_ping = 0
    caminho_candidato = None
    tamanho_anterior = None
    estabilidade = 0

    while time.time() - inicio <= timeout:
        todos = listar_arquivos_download_demanda(origem_download)
        validos, temporarios = separar_arquivos_download(todos)

        if caminho_candidato is None:
            candidatos = detectar_arquivo_novo_ou_atualizado(validos, arquivos_antes)
            candidatos = [
                c for c in candidatos
                if c.exists() and c.stat().st_mtime >= (inicio - 2)
            ]
            if candidatos:
                caminho_candidato = str(candidatos[0].resolve())
                tamanho_anterior = None
                estabilidade = 0

        candidato = None
        if caminho_candidato:
            for arq in validos:
                try:
                    if str(arq.resolve()) == caminho_candidato:
                        candidato = arq
                        break
                except Exception:
                    continue

        # Fallback: se o candidato sumiu da lista, tenta o próximo alterado.
        if candidato is None:
            candidatos = detectar_arquivo_novo_ou_atualizado(validos, arquivos_antes)
            candidatos = [
                c for c in candidatos
                if c.exists() and c.stat().st_mtime >= (inicio - 2)
            ]
            if candidatos:
                caminho_candidato = str(candidatos[0].resolve())
                candidato = candidatos[0]
                tamanho_anterior = None
                estabilidade = 0

        if candidato and candidato.exists():
            try:
                tamanho_atual = candidato.stat().st_size
            except Exception:
                tamanho_atual = -1

            if tamanho_atual > 0 and tamanho_anterior is not None and tamanho_atual == tamanho_anterior:
                estabilidade += 1
            else:
                estabilidade = 0
            tamanho_anterior = tamanho_atual

            if estabilidade >= 3:
                return candidato

        agora = time.time()
        if callback_progresso and (agora - ultimo_ping >= 5):
            msg = f"{mensagem_base}... ({int(agora - inicio)}s)"
            if caminho_candidato:
                msg += f" | candidato: {Path(caminho_candidato).name}"
            if temporarios:
                msg += f" | pendentes: {len(temporarios)}"
            callback_progresso(progresso_base, msg)
            ultimo_ping = agora

        time.sleep(1)

    # Fallback: evita falso negativo quando o arquivo final já existe, mas a confirmação ficou inconsistente.
    todos = listar_arquivos_download_demanda(origem_download)
    validos, _ = separar_arquivos_download(todos)
    candidatos_recentes = []
    for arq in validos:
        try:
            st = arq.stat()
            if st.st_size > 0 and st.st_mtime >= (inicio - 2):
                candidatos_recentes.append(arq)
        except Exception:
            continue

    if candidatos_recentes:
        escolhido = max(candidatos_recentes, key=os.path.getmtime)
        if callback_progresso:
            callback_progresso(
                progresso_base,
                f"Confirmação por fallback de arquivo recente: {escolhido.name}",
            )
        return escolhido

    raise TimeoutError(f"Tempo excedido ao aguardar download ({timeout}s).")


def aguardar_downloads_pendentes(origem_download: Path, timeout=180, callback_progresso=None, progresso_base=0.0):
    inicio = time.time()
    while time.time() - inicio <= timeout:
        todos = listar_arquivos_download_demanda(origem_download)
        _, temporarios = separar_arquivos_download(todos)
        if not temporarios:
            return
        if callback_progresso:
            callback_progresso(
                progresso_base,
                f"Aguardando finalização dos downloads pendentes ({len(temporarios)} em progresso)..."
            )
        time.sleep(2)


def resolver_pasta_historico(destino_final: Path):
    caminho_txt = str(destino_final).replace("/", "\\").lower()

    if caminho_txt.startswith("\\\\172.16.98.12") and "\\forecast\\forecast2" in caminho_txt:
        return Path(r"\\172.16.98.12\Relatórios Power BI\Forecast\Forecast - Antigo")
    if caminho_txt.startswith("z:\\") and "\\forecast\\forecast2" in caminho_txt:
        return Path(r"Z:\Forecast\Forecast - Antigo")

    return destino_final.parent / f"{destino_final.name} - Antigo"


def mover_arquivos_para_historico(pasta_destino: Path, pasta_historico: Path, callback_progresso=None, progresso_base=0.0):
    pasta_historico.mkdir(parents=True, exist_ok=True)
    arquivos_movidos = []

    candidatos = [
        a for a in pasta_destino.glob("*.xls*")
        if a.is_file()
    ]

    total = len(candidatos)
    for idx, arq in enumerate(candidatos, 1):
        destino_hist = pasta_historico / arq.name
        if destino_hist.exists():
            try:
                destino_hist.unlink()
            except Exception:
                pass
        shutil.move(str(arq), str(destino_hist))
        arquivos_movidos.append(destino_hist)
        if callback_progresso:
            callback_progresso(
                progresso_base,
                f"Movendo histórico ({idx}/{total}): {arq.name}"
            )

    return arquivos_movidos


def extrair_data_do_nome_arquivo(nome_arquivo: str):
    match = re.search(r"(\d{2})-(\d{2})-(\d{4})", nome_arquivo)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(0), "%d-%m-%Y")
    except ValueError:
        return None


def calcular_data_par_ano_anterior(data_referencia: datetime):
    try:
        base = data_referencia.replace(year=data_referencia.year - 1)
    except ValueError:
        base = data_referencia.replace(year=data_referencia.year - 1, day=28)

    candidatos = []
    for delta in range(-7, 8):
        tentativa = base + timedelta(days=delta)
        if tentativa.weekday() == data_referencia.weekday():
            candidatos.append(tentativa)

    if not candidatos:
        return base

    return min(candidatos, key=lambda d: abs((d - base).days))


def buscar_arquivo_par_equivalente(diretorio_origem: Path, data_referencia: datetime):
    if not diretorio_origem.exists():
        return None

    data_alvo = calcular_data_par_ano_anterior(data_referencia)
    candidatos = []

    for arq in diretorio_origem.glob("*.xls*"):
        if not arq.is_file():
            continue
        data_no_nome = extrair_data_do_nome_arquivo(arq.name)
        if not data_no_nome:
            continue
        distancia = abs((data_no_nome - data_alvo).days)
        if distancia <= 35:
            candidatos.append((distancia, -arq.stat().st_mtime, arq))

    if not candidatos:
        return None

    candidatos.sort(key=lambda item: (item[0], item[1]))
    return candidatos[0][2]


def copiar_arquivo_par_equivalente(
    diretorio_origem: Path,
    diretorio_destino: Path,
    data_referencia: datetime,
    callback_progresso=None,
    progresso_base=0.0,
):
    arquivo_par = buscar_arquivo_par_equivalente(diretorio_origem, data_referencia)
    if not arquivo_par:
        return None

    destino_par = diretorio_destino / arquivo_par.name
    if destino_par.exists():
        try:
            destino_par.unlink()
        except Exception:
            pass
    shutil.copy2(str(arquivo_par), str(destino_par))

    if callback_progresso:
        callback_progresso(progresso_base, f"Par histórico copiado: {destino_par.name}")

    return destino_par


def preparar_arquivos_para_tratamento(caminho_entrada: Path, pasta_trabalho: Path, callback_progresso=None, progresso_base=0.78):
    if not caminho_entrada.exists():
        raise FileNotFoundError(f"Entrada para tratamento não encontrada: {caminho_entrada}")

    arquivos_candidatos = []
    if caminho_entrada.is_file():
        arquivos_candidatos = [caminho_entrada]
    else:
        for arq in caminho_entrada.glob("*.xls*"):
            nome = arq.name.lower()
            if (
                "relatoriodemanda" in nome
                or nome.startswith("temp_relatorio_")
                or re.search(r"\d{2}-\d{2}-\d{4}", arq.name)
            ):
                arquivos_candidatos.append(arq)

    if not arquivos_candidatos:
        raise ValueError("Nenhum arquivo válido de demanda encontrado para tratamento.")

    arquivos_criados = []
    total = len(arquivos_candidatos)
    for idx, arq in enumerate(sorted(arquivos_candidatos), 1):
        destino_temp = pasta_trabalho / f"Temp_Relatorio_manual_{idx}{arq.suffix}"
        shutil.copy2(str(arq), str(destino_temp))
        arquivos_criados.append(destino_temp)
        if callback_progresso:
            callback_progresso(
                progresso_base,
                f"Preparando arquivo para tratamento ({idx}/{total}): {arq.name}"
            )

    return arquivos_criados

def consolidar_varios_arquivos(
    diretorio_origem,
    arquivo_saida,
    callback_progresso=None,
    limpar_temporarios=True,
):
    """Consolida arquivos temporários em um único XLSX usando escrita otimizada."""
    if callback_progresso:
        callback_progresso(0.8, "Analisando relatórios temporários baixados...")

    caminho_origem = Path(diretorio_origem)
    caminho_saida_local = Path(arquivo_saida)
    caminho_saida_local.parent.mkdir(parents=True, exist_ok=True)

    lista_dfs = []
    colunas_padrao = None
    arquivos_excel = sorted([f for f in caminho_origem.glob("Temp_Relatorio_*")])

    if not arquivos_excel:
        return {
            "arquivo_principal": None,
            "arquivos_saida": [],
            "pasta_final": None,
            "mensagem": "Nenhum arquivo temporário encontrado para consolidar.",
        }

    total_arquivos = len(arquivos_excel)
    for index, arquivo in enumerate(arquivos_excel, 1):
        if callback_progresso:
            callback_progresso(
                0.80 + (0.05 * (index / total_arquivos)),
                f"Lendo e padronizando arquivo {index}/{total_arquivos}: {arquivo.name}",
            )
        print(f"Inspecionando: {arquivo.name}")
        xls = pd.ExcelFile(arquivo)
        for nome_aba in xls.sheet_names:
            df_aba = pd.read_excel(xls, sheet_name=nome_aba, header=None)
            if not isinstance(df_aba, pd.DataFrame):
                continue
            df_aba = df_aba.dropna(how='all').dropna(axis=1, how='all')
            if not df_aba.empty:
                primeira_celula = str(df_aba.iloc[0, 0]).strip()
                if primeira_celula.lower() == "data":
                    if colunas_padrao is None:
                        colunas_padrao = df_aba.iloc[0].tolist()
                    df_aba = df_aba.iloc[1:].copy()
                if df_aba.empty:
                    continue
                if colunas_padrao is not None and len(df_aba.columns) == len(colunas_padrao):
                    df_aba = pd.DataFrame(df_aba.values, columns=colunas_padrao)
                    lista_dfs.append(df_aba)
        xls.close()

    if not lista_dfs:
        return {
            "arquivo_principal": None,
            "arquivos_saida": [],
            "pasta_final": None,
            "mensagem": "Os arquivos temporários não continham dados válidos para consolidação.",
        }

    if callback_progresso:
        callback_progresso(0.86, "Base final montada. Concatenando e formatando dados...")

    df_final = pd.concat(lista_dfs, ignore_index=True)
    if "Data" in df_final.columns:
        df_final["Data"] = pd.to_datetime(df_final["Data"], errors='coerce').dt.strftime('%d/%m/%Y')

    df_final['Data Observação'] = datetime.now().strftime('%d/%m/%Y')

    if 'Linha' in df_final.columns:
        df_final['Linha'] = df_final['Linha'].astype(str).str.strip()
        df_final['Linha'] = pd.to_numeric(df_final['Linha'], errors='coerce').astype("Int64")

    if callback_progresso:
        callback_progresso(0.9, "Escrevendo arquivo final com engine otimizada (XlsxWriter)...")

    try:
        with pd.ExcelWriter(caminho_saida_local, engine="xlsxwriter", datetime_format="dd/mm/yyyy", date_format="dd/mm/yyyy") as writer:
            df_final.to_excel(writer, index=False, sheet_name="Planilha1")
            workbook = writer.book
            worksheet = writer.sheets["Planilha1"]
            fmt_padrao = workbook.add_format({"font_size": 8, "text_wrap": True})

            if len(df_final.columns) > 0:
                worksheet.set_column(0, len(df_final.columns) - 1, 14, fmt_padrao)

            for idx_col in [3, 5, 6]:
                if idx_col < len(df_final.columns):
                    worksheet.set_column(idx_col, idx_col, 18, fmt_padrao)
    except Exception as erro_xlsxwriter:
        print(f"[WARN] XlsxWriter indisponível ou falhou ({erro_xlsxwriter}). Usando escrita padrão.")
        df_final.to_excel(caminho_saida_local, index=False, sheet_name='Planilha1')

    if limpar_temporarios:
        for f in arquivos_excel:
            try:
                os.remove(f)
            except Exception:
                pass

    return {
        "arquivo_principal": str(caminho_saida_local),
        "arquivos_saida": [str(caminho_saida_local)],
        "pasta_final": str(Path(caminho_saida_local).parent),
        "mensagem": "Consolidação concluída com sucesso.",
    }

# =========================================================================
# A FUNÇÃO PRINCIPAL: É ELA QUE O MAIN.PY CHAMA
# =========================================================================
def executar_adm(
    id_usuario_logado,
    data_inicio,
    data_final,
    callback_progresso=None,
    hook_cancelamento=None,
    modo_execucao="completo",
    pasta_destino=None,
    arquivo_entrada=None,
    base_automacao=None,
):
    """Executa ADM em modo modular sem quebrar compatibilidade com chamadas antigas."""

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
        raise ValueError(f"Modo de execução inválido para ADM: {modo_execucao}")

    def checar_parada():
        if hook_cancelamento and hook_cancelamento():
            raise CanceladoPeloUsuario("Processo cancelado pelo usuário.")

    if callback_progresso:
        callback_progresso(0.05, "Inicializando Robô ADM...")

    playwright_status = "não avaliado"
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
        _ = sync_playwright
        playwright_status = "disponível"
    except Exception:
        playwright_status = "indisponível no ambiente atual"

    if callback_progresso:
        callback_progresso(0.06, f"Viabilidade Playwright: {playwright_status} (fluxo atual segue com Selenium).")

    home = Path.home()
    origem_download = home / "Downloads"
    pasta_execucao = datetime.now().strftime("%Y%m%d_%H%M%S")
    pasta_trabalho = origem_download / f"_ADM_Demanda_Temp_{pasta_execucao}"
    pasta_trabalho.mkdir(parents=True, exist_ok=True)

    destino_padrao_rede = Path(r"\\172.16.98.12\Relatórios Power BI\Forecast\Forecast2")

    def resolver_destino_padrao():
        base_raw = str(base_automacao).strip() if base_automacao is not None else ""
        base_lower = base_raw.lower()

        if not base_raw or base_lower in {"padrao", "sem_base", "none", "null"}:
            return destino_padrao_rede

        if base_lower == "personalizada":
            if arquivo_entrada:
                origem = Path(arquivo_entrada)
                if origem.exists():
                    return origem if origem.is_dir() else origem.parent
            return destino_padrao_rede

        caminho = Path(base_raw)
        return caminho if caminho.suffix == "" else caminho.parent

    destino_padrao = resolver_destino_padrao()
    destino_envio = Path(pasta_destino) if pasta_destino and str(pasta_destino).strip() else None

    precisa_envio = modo_execucao in {"tratamento_envio", "arquivo_tratamento_envio", "completo", "arquivo_envio"}
    limpar_pasta_trabalho_ao_final = False

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
            raise ValueError("As datas de início e fim são obrigatórias para download no ADM.")
        if data_inicio_dt > data_final_dt:
            raise ValueError("Data inicial não pode ser maior que a data final no ADM.")
        data_inicio = data_inicio_dt.strftime("%d/%m/%Y")
        data_final = data_final_dt.strftime("%d/%m/%Y")

    if not precisa_download and precisa_tratamento and not arquivo_entrada:
        arquivo_entrada = str(origem_download)

    if modo_execucao == "arquivo_envio":
        origem_entrada = Path(str(arquivo_entrada))
        if not origem_entrada.exists():
            raise FileNotFoundError(f"Arquivo de entrada não encontrado: {origem_entrada}")

        if origem_entrada.is_dir():
            candidatos = sorted(
                [a for a in origem_entrada.glob("*.xls*") if a.is_file()],
                key=os.path.getmtime,
                reverse=True,
            )
            if not candidatos:
                raise FileNotFoundError(f"Nenhum arquivo Excel encontrado em: {origem_entrada}")
            origem_arquivo = candidatos[0]
        else:
            origem_arquivo = origem_entrada

        pasta_final = destino_envio or destino_padrao
        pasta_final.mkdir(parents=True, exist_ok=True)
        pasta_historico = resolver_pasta_historico(pasta_final)

        if callback_progresso:
            callback_progresso(0.6, "Organizando pasta de destino (movendo arquivos antigos para histórico)...")
        mover_arquivos_para_historico(pasta_final, pasta_historico, callback_progresso=callback_progresso, progresso_base=0.65)

        destino_final = pasta_final / origem_arquivo.name
        if destino_final.exists():
            destino_final.unlink()
        shutil.copy2(str(origem_arquivo), str(destino_final))

        data_referencia = extrair_data_do_nome_arquivo(destino_final.name) or datetime.now()
        origem_par = pasta_historico if pasta_historico.exists() else destino_padrao
        arquivo_par = copiar_arquivo_par_equivalente(
            origem_par,
            pasta_final,
            data_referencia,
            callback_progresso=callback_progresso,
            progresso_base=0.9,
        )

        arquivos_saida = [str(destino_final)]
        if arquivo_par:
            arquivos_saida.append(str(arquivo_par))

        if pasta_trabalho.exists():
            shutil.rmtree(str(pasta_trabalho), ignore_errors=True)
        if callback_progresso:
            callback_progresso(1.0, f"Arquivo enviado: {destino_final.name}")
        return {
            "arquivo_principal": str(destino_final),
            "arquivos_saida": arquivos_saida,
            "pasta_final": str(pasta_final),
            "mensagem": "Arquivo enviado com sucesso.",
        }

    driver = None

    try:
        if precisa_download:
            user, passwd = buscar_credencial_site(id_usuario_logado, "ADM de Vendas")
            if not user:
                if callback_progresso:
                    callback_progresso(0.0, "ERRO: Credenciais do ADM não encontradas no Cofre!")
                return {
                    "arquivo_principal": None,
                    "arquivos_saida": [],
                    "pasta_final": None,
                    "mensagem": "Credenciais do ADM não encontradas no Cofre.",
                }

            resultado = gerar_intervalos_mensais(data_inicio, data_final)
            opcoes = Options()
            opcoes.add_argument("--window-size=1920,1080")
            opcoes.add_argument("--headless")

            if callback_progresso:
                callback_progresso(0.1, "Abrindo Navegador Invisível...")

            driver_path = get_driver_path()
            if driver_path:
                from selenium.webdriver.edge.service import Service
                driver = webdriver.Edge(service=Service(driver_path), options=opcoes)
            else:
                driver = webdriver.Edge(options=opcoes)

            checar_parada()
            driver.get("http://ttadm01.jcatlm.com.br:8080/ventaboletosadm/index.zul;jsessionid=xFIW8nh_t8n9-74topChhriraeW-2Y5y-MKUCIG3.gcp-pd-ttadm-01")
            wait = WebDriverWait(driver, 1000)

            if callback_progresso:
                callback_progresso(0.15, "Injetando Credenciais...")

            login_element = wait.until(EC.presence_of_element_located((By.NAME, "j_username")))
            login_element.click()
            login_element.clear()
            login_element.send_keys(user)

            senha = driver.find_element(By.NAME, "j_password")
            senha.click()
            senha.clear()
            if passwd:
                senha.send_keys(passwd)

            driver.find_element(By.NAME, "btnAcessar").click()

            if callback_progresso:
                callback_progresso(0.2, "Navegando entre MENUS de Demandas...")

            wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Relatórios')]"))).click()
            time.sleep(3)
            wait.until(EC.element_to_be_clickable((By.XPATH, "//li [contains (@id, 'c4')] | //a [contains(text(), ' Relatórios') and contains(@id, 'c4-a')]"))).click()
            time.sleep(1)
            wait.until(EC.element_to_be_clickable((By.XPATH, "//a [contains(text(), ' Relatórios Operacionais')and contains(@id, '25-a')]"))).click()
            wait.until(EC.element_to_be_clickable((By.XPATH, "//a [contains(text(), ' Demandas')and contains(@id, 'a5-a')]"))).click()

            total_blocos = len(resultado)
            arquivos_temporarios_criados = []
            for idx, (inicial_data, final_data) in enumerate(resultado):
                checar_parada()
                porc = 0.25 + (0.45 * (idx / total_blocos))
                if callback_progresso:
                    callback_progresso(porc, f"Lote {idx+1}/{total_blocos} - Inserindo filtro: {inicial_data} a {final_data}...")

                arquivos_antes = snapshot_arquivos_validos(origem_download)

                data1 = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains (@id, 'ia-real')]")))
                data1.clear()
                data1.send_keys(inicial_data)

                data2 = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@id, 'la-real')]")))
                data2.clear()
                data2.send_keys(final_data)

                wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), ' Novo Layout')and contains(@id, 'zb')]"))).click()
                wait.until(EC.element_to_be_clickable((By.XPATH, "//div[contains(@id, '4c')]"))).click()

                if callback_progresso:
                    callback_progresso(porc + 0.05, f"Lote {idx+1}/{total_blocos} - Download solicitado. Aguardando arquivo...")

                arquivo_detectado = aguardar_novo_download(
                    origem_download,
                    arquivos_antes=arquivos_antes,
                    timeout=300,
                    callback_progresso=callback_progresso,
                    progresso_base=porc + 0.06,
                    mensagem_base=f"Lote {idx+1}/{total_blocos} - aguardando finalização do download",
                )

                arquivo_renomeado = renomear_arquivo(arquivo_detectado, pasta_trabalho, idx + 1)
                arquivos_temporarios_criados.append(arquivo_renomeado)
                if callback_progresso:
                    callback_progresso(
                        porc + 0.08,
                        f"Lote {idx+1}/{total_blocos} - arquivo preparado: {arquivo_renomeado.name}",
                    )

                checar_parada()
                wait.until(EC.element_to_be_clickable((By.XPATH, "//div[contains(@id, 'c-close')]"))).click()
                time.sleep(1)

            aguardar_downloads_pendentes(
                origem_download,
                timeout=180,
                callback_progresso=callback_progresso,
                progresso_base=0.72,
            )

            checar_parada()

            if not arquivos_temporarios_criados:
                raise FileNotFoundError("Nenhum arquivo do ADM foi baixado para tratamento.")

            if len(arquivos_temporarios_criados) < total_blocos and callback_progresso:
                callback_progresso(
                    0.74,
                    f"Aviso: esperados {total_blocos} downloads, capturados {len(arquivos_temporarios_criados)}."
                )

            if callback_progresso:
                callback_progresso(0.75, "Organizando arquivos baixados...")

            if modo_execucao == "download":
                arquivos_temp = sorted(pasta_trabalho.glob("Temp_Relatorio_*"))
                arquivos_saida = [str(a) for a in arquivos_temp]
                pasta_final = pasta_trabalho

                if destino_envio:
                    destino_envio.mkdir(parents=True, exist_ok=True)
                    arquivos_saida = []
                    total_temp = len(arquivos_temp)
                    for idx_tmp, arquivo_tmp in enumerate(arquivos_temp, 1):
                        destino_tmp = destino_envio / arquivo_tmp.name
                        shutil.copy2(str(arquivo_tmp), str(destino_tmp))
                        arquivos_saida.append(str(destino_tmp))
                        if callback_progresso:
                            callback_progresso(
                                0.93 + (0.05 * (idx_tmp / max(total_temp, 1))),
                                f"Arquivo copiado para saída ({idx_tmp}/{total_temp}): {destino_tmp.name}",
                            )
                    pasta_final = destino_envio

                if callback_progresso:
                    callback_progresso(1.0, "Download concluído com sucesso!")
                return {
                    "arquivo_principal": arquivos_saida[0] if arquivos_saida else None,
                    "arquivos_saida": arquivos_saida,
                    "pasta_final": str(pasta_final),
                    "mensagem": "Download concluído com sucesso.",
                }

        if arquivo_entrada and precisa_tratamento and not precisa_download:
            origem_manual = Path(arquivo_entrada)
            preparar_arquivos_para_tratamento(
                origem_manual,
                pasta_trabalho,
                callback_progresso=callback_progresso,
                progresso_base=0.78,
            )

        if precisa_tratamento:
            data_execucao = datetime.now().strftime("%d-%m-%Y")
            arquivo_final_path = pasta_trabalho / f"{data_execucao}.xlsx"

            checar_parada()
            resultado_consolidacao = consolidar_varios_arquivos(
                pasta_trabalho,
                arquivo_final_path,
                callback_progresso=callback_progresso,
                limpar_temporarios=True,
            )

            arquivo_principal = Path(resultado_consolidacao["arquivo_principal"])
            arquivos_saida = [str(arquivo_principal)]
            pasta_final = arquivo_principal.parent

            if precisa_envio or destino_envio:
                pasta_final = destino_envio or destino_padrao
                pasta_final.mkdir(parents=True, exist_ok=True)
                pasta_historico = resolver_pasta_historico(pasta_final)

                if callback_progresso:
                    callback_progresso(0.94, "Movendo arquivos antigos da pasta final para histórico...")
                mover_arquivos_para_historico(
                    pasta_final,
                    pasta_historico,
                    callback_progresso=callback_progresso,
                    progresso_base=0.95,
                )

                destino_final_arquivo = pasta_final / arquivo_principal.name
                if destino_final_arquivo.exists():
                    destino_final_arquivo.unlink()
                shutil.move(str(arquivo_principal), str(destino_final_arquivo))

                arquivos_saida = [str(destino_final_arquivo)]

                base_raw = str(base_automacao).strip().lower() if base_automacao is not None else ""
                origem_par = pasta_historico
                if base_raw not in {"", "padrao", "sem_base", "none", "null", "personalizada"}:
                    origem_custom = Path(str(base_automacao).strip())
                    if origem_custom.exists():
                        origem_par = origem_custom if origem_custom.is_dir() else origem_custom.parent

                data_referencia = extrair_data_do_nome_arquivo(destino_final_arquivo.name) or datetime.now()
                arquivo_par = copiar_arquivo_par_equivalente(
                    origem_par,
                    pasta_final,
                    data_referencia,
                    callback_progresso=callback_progresso,
                    progresso_base=0.97,
                )
                if arquivo_par:
                    arquivos_saida.append(str(arquivo_par))

                limpar_pasta_trabalho_ao_final = True

                resultado_consolidacao = {
                    "arquivo_principal": str(destino_final_arquivo),
                    "arquivos_saida": arquivos_saida,
                    "pasta_final": str(pasta_final),
                    "mensagem": "Consolidação e envio concluídos com sucesso.",
                }
            else:
                resultado_consolidacao = {
                    "arquivo_principal": str(arquivo_principal),
                    "arquivos_saida": arquivos_saida,
                    "pasta_final": str(pasta_final),
                    "mensagem": "Consolidação concluída com sucesso.",
                }

            if callback_progresso:
                callback_progresso(1.0, "Processo ADM concluído com sucesso!")
            return resultado_consolidacao

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

    # Tentar ler de CLI (Base64) ou STDIN
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
        resultado = executar_adm(
            id_usuario_logado=user_id,
            data_inicio=data_ini,
            data_final=data_fim,
            callback_progresso=progress_callback,
            modo_execucao=params.get('acao', 'completo'),
            pasta_destino=params.get('pasta_saida'),
            arquivo_entrada=params.get('pasta_personalizada'),
            base_automacao=params.get('base')
        )
        print(json.dumps(resultado))
    except Exception as e:
        print(f"ERRO: {str(e)}", file=sys.stderr)
        sys.exit(1)
