# automacoes/ebus_new.py
import os
import time
import shutil
import calendar
import pandas as pd # type: ignore
from pathlib import Path
from datetime import datetime, timedelta
from selenium import webdriver # type: ignore
from selenium.webdriver.common.by import By # type: ignore
from selenium.webdriver.edge.options import Options # type: ignore
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from selenium_helper import get_driver_path
except ImportError:
    def get_driver_path():
        return None
from selenium.webdriver.support.ui import WebDriverWait # type: ignore
from selenium.webdriver.support import expected_conditions as EC # type: ignore
from openpyxl import load_workbook # type: ignore
from openpyxl.utils import get_column_letter # type: ignore
from openpyxl.styles import PatternFill, Alignment # type: ignore
from core.banco import buscar_credencial_site # type: ignore

class CanceladoPeloUsuario(Exception):
    pass

MESES_PT = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 
            6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 
            11: 'Novembro', 12: 'Dezembro'}

def gerar_intervalos_mensais_ebus(data_str_inicio, data_str_fim):
    meses_pt = {1: 'Janeiro', 2: 'Fevereiro', 3: 'Março', 4: 'Abril', 5: 'Maio', 
    6: 'Junho', 7: 'Julho', 8: 'Agosto', 9: 'Setembro', 10: 'Outubro', 
    11: 'Novembro', 12: 'Dezembro'}
    inicio = datetime.strptime(data_str_inicio, "%d/%m/%Y")
    fim_global = datetime.strptime(data_str_fim, "%d/%m/%Y")
    atual = inicio
    intervalos = []
    while atual <= fim_global:
        ultimo_dia_mes = calendar.monthrange(atual.year, atual.month)[1]
        data_ultimo_dia = datetime(atual.year, atual.month, ultimo_dia_mes)
        fim_trecho = min(data_ultimo_dia, fim_global)
        intervalos.append((atual.strftime("%d/%m/%Y"), fim_trecho.strftime("%d/%m/%Y"), meses_pt[atual.month], atual.year))
        atual = data_ultimo_dia + timedelta(days=1)
    return intervalos

# ==========================================
# FUNÇÃO AUXILIAR DE FORMATAÇÃO VISUAL
# ==========================================
def aplicar_formatacao_excel(caminho_arquivo, nome_aba):
    """
    Abre um arquivo Excel existente, aplica cores de fundo no cabeçalho,
    ajusta larguras das colunas e centraliza os textos.
    É fundamental usar wb.close() no final para liberar o arquivo no Windows.
    """
    wb = load_workbook(caminho_arquivo)
    ws = wb[nome_aba]
    
    # Define a cor de fundo Cinza para o cabeçalho
    fundo_cabeçalho = PatternFill(start_color="BFBFBF", fill_type="solid")
    alinhamento = Alignment(horizontal="center", vertical="center", wrap_text=True)

    # Aumenta a altura da primeira linha (Cabeçalho)
    ws.row_dimensions[1].height = 25
    
    # Nomes das colunas para formatação específica (em letras minúsculas e sem espaços nas pontas)
    colunas_moeda_limpas = [
        'tarifa', 'embarque', 'pedágio', 'pedagio', 
        'sugestão', 'sugestao', 'sugestão revenue', 'sugestao revenue',
        'revenue aplicado'
    ]
    colunas_porcentagem_limpas = [
        'market share', 'perc. de diferença', 'perc. de diferenca', 'aproveitamento'
    ]

    indices_moeda = []
    indices_porcentagem = []

    # Aplica o estilo para cada coluna no cabeçalho e identifica os índices das colunas especiais
    for col in range(1, ws.max_column + 1):
        letra = get_column_letter(col)
        celula = ws.cell(row=1, column=col)
        celula.fill = fundo_cabeçalho
        celula.alignment = alinhamento
        
        # Guarda o índice para formatar o resto da coluna depois
        nome_cabecalho = str(celula.value).strip().lower() if celula.value else ""
        
        if nome_cabecalho in colunas_moeda_limpas:
            indices_moeda.append(col)
        elif nome_cabecalho in colunas_porcentagem_limpas:
            indices_porcentagem.append(col)
        
        # A coluna 'S' (Justificativa no relatorio base) recebe uma largura maior, o resto recebe 20
        ws.column_dimensions[letra].width = 75.6 if letra == 'S' else 20
        
    # Centraliza todas as células das linhas normais e aplica formatos numéricos
    for linha in ws.iter_rows(min_row=2):
        for celula in linha: 
            celula.alignment = Alignment(vertical="center", wrap_text=True)
            
            # Formata apenas se a célula contiver um número (ignora células vazias ou texto)
            if celula.column in indices_moeda:
                if isinstance(celula.value, (int, float)):
                    celula.number_format = 'R$ #,##0.00_-'
            elif celula.column in indices_porcentagem:
                if isinstance(celula.value, (int, float)):
                    celula.number_format = '0.00 %'
            
    # Salva e FECHA o arquivo para evitar erros de permissão ao mover
    wb.save(caminho_arquivo)
    wb.close() 

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



# ==========================================
# MOTOR DE CONCILIAÇÃO DOS ARQUIVOS EBUS
# ==========================================
def processar_arquivos_relatorios(arquivo_original, destino, nome_mes=None, ano_atual=None, callback_progresso=None):
    """
    Função coração da regra de negócio EBUS.
    1. Lê a planilha web crua.
    2. Valida se veio vazia.
    3. Concatena colunas de Origem + Destino e aplica Justificativa.
    4. Processa a "Base Nova" (Histórico de Novo, Excluido, Presente).
    5. Processa a "Base Normal" (Mercado vazio, regra de volume).
    """
    if callback_progresso: callback_progresso(0.40, f"Lendo planilha Excel bruta...")
    
    df_novo = pd.read_excel(arquivo_original, engine='xlrd')

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
        return

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
    
    pasta_base = destino / "BASE"
    pasta_backup = destino / "BACKUP"
    pasta_base_nova = destino / "BASE NOVA"
    pasta_backup_base_nova = destino / "BACKUP NOVO"
    
    # Criando todas as pastas de uma vez de forma limpa
    for pasta in [pasta_base, pasta_backup, pasta_base_nova, pasta_backup_base_nova]:
        pasta.mkdir(parents=True, exist_ok=True)

    caminho_base = pasta_base / nome_oficial
    caminho_backup = pasta_backup / nome_oficial
    caminho_base_nova = pasta_base_nova / nome_oficial
    caminho_backup_base_nova = pasta_backup_base_nova / nome_oficial

    # =========================================================
    # PARTE 1: BASE NOVA (Mapeamento de Novo / Excluido / Presente)
    # =========================================================
    if callback_progresso: callback_progresso(0.50, f"{nome_mes} - Preparando comparação histórica de Base Nova...")
    houve_alteracao_estado = True

    if caminho_base_nova.exists():
        df_base_estado_antiga = pd.read_excel(caminho_base_nova)
        
        if 'Estado' in df_base_estado_antiga.columns:
            df_old_active = df_base_estado_antiga[df_base_estado_antiga['Estado'] != 'Excluido'].copy()
            df_previously_excluded = df_base_estado_antiga[df_base_estado_antiga['Estado'] == 'Excluido'].copy()
        else:
            df_old_active = df_base_estado_antiga.copy()
            df_previously_excluded = pd.DataFrame()
            
        df_old_comp = df_old_active.drop(columns=['Estado'], errors='ignore')
        
        df_new_comp = df_novo.copy()
        
        df_old_comp = padronizar_justificativa(df_old_comp)
        
        df_old_comp_filled = df_old_comp.fillna('')
        df_new_comp_filled = df_new_comp.fillna('')
        
        # Garantindo que as colunas comuns tenham o mesmo tipo para o merge (evita object vs float64)
        for col in df_old_comp_filled.columns.intersection(df_new_comp_filled.columns):
            if df_old_comp_filled[col].dtype != df_new_comp_filled[col].dtype:
                df_old_comp_filled[col] = df_old_comp_filled[col].astype(str)
                df_new_comp_filled[col] = df_new_comp_filled[col].astype(str)
        
        df_comparado = pd.merge(df_old_comp_filled, df_new_comp_filled, how='outer', indicator=True)
        
        novas_mudancas = len(df_comparado[df_comparado['_merge'] == 'right_only']) + len(df_comparado[df_comparado['_merge'] == 'left_only'])
        
        mapa_estado = {'left_only': 'Excluido', 'right_only': 'Novo', 'both': 'Presente'}
        
        df_comparado['Estado'] = df_comparado['_merge'].map(mapa_estado)
        df_comparado = df_comparado.drop(columns=['_merge'])
        
        if not df_previously_excluded.empty:
            df_comparado = pd.concat([df_comparado, df_previously_excluded], ignore_index=True)
            
        if novas_mudancas == 0:
            houve_alteracao_estado = False
            
    else:
        df_comparado = df_novo.copy()
        df_comparado['Estado'] = 'Novo'
        houve_alteracao_estado = True

    if houve_alteracao_estado:
        arquivo_temp_estado = destino / f"temp_estado_{nome_oficial}"
        aba_estado = "Relatorio Comparado"
        
        # Garante que a coluna Mercado não vai sujar a base nova
        if 'Mercado' in df_comparado.columns:
            df_comparado = df_comparado.drop(columns=['Mercado'])

        df_comparado.to_excel(arquivo_temp_estado, index=False, sheet_name=aba_estado)
        if callback_progresso: callback_progresso(0.55, f"{nome_mes} - Aplicando estilos na Base Nova...")
        aplicar_formatacao_excel(arquivo_temp_estado, aba_estado)
        
        if caminho_base_nova.exists():
            if callback_progresso: callback_progresso(0.75, "Fazendo backup da Base Nova...")
            shutil.copy2(str(caminho_base_nova), str(caminho_backup_base_nova))
            caminho_base_nova.unlink()
            
        shutil.move(str(arquivo_temp_estado), str(caminho_base_nova))
        
        # =========================================================================
        # CRIAÇÃO OU ATUALIZAÇÃO DO ARQUIVO CONSOLIDADO CSV (BASE NOVA)
        # =========================================================================
        csv_consol = pasta_base_nova / 'base_nova_consolidada.csv'
        df_csv_novo = df_comparado.copy()
        
        if csv_consol.exists():
            df_csv_existente = pd.read_csv(csv_consol, sep=';', encoding='utf-8-sig')
            df_final_csv = pd.concat([df_csv_existente, df_csv_novo], ignore_index=True)
            
            # Removemos duplicatas reais baseadas nas colunas chaves
            colunas_unicas = [
                'Origem', 'Destino', 'Data Viagem', 
                'Sugestão Revenue', 'Revenue Aplicado'
            ]
            subset_existente = [c for c in colunas_unicas if c in df_final_csv.columns]
            
            if subset_existente:
                df_final_csv = df_final_csv.drop_duplicates(subset=subset_existente, keep='last')
            else:
                df_final_csv = df_final_csv.drop_duplicates()
        else:
            df_final_csv = df_csv_novo
        
        df_final_csv.to_csv(csv_consol, sep=';', index=False, encoding='utf-8-sig')
        # =========================================================================

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
    if caminho_base.exists():
        df_base_antiga = pd.read_excel(caminho_base)
        if len(df_novo_base) <= len(df_base_antiga):
            substituir_base = False

    if substituir_base:
        arquivo_temp_base = destino / f"temp_base_{nome_oficial}"
        aba_normal = "Relatorio Revenue Sistema"
        
        df_novo_base.to_excel(arquivo_temp_base, index=False, sheet_name=aba_normal)
        if callback_progresso: callback_progresso(0.65, f"{nome_mes} - Salvando Base Normal formatada...")
        aplicar_formatacao_excel(arquivo_temp_base, aba_normal)
        
        if caminho_base.exists():
            if callback_progresso: callback_progresso(0.85, "Fazendo backup da Base...")
            shutil.copy2(str(caminho_base), str(caminho_backup))
            caminho_base.unlink()
            
        shutil.move(str(arquivo_temp_base), str(caminho_base))

    # =========================================================
    # LIMPEZA FINAL
    # =========================================================
    if os.path.exists(arquivo_original):
        os.remove(arquivo_original)
    
    if callback_progresso: callback_progresso(0.9, "Arquivos processados com sucesso!")

# ==========================================
# GESTOR DE NAVEGAÇÃO WEB EBUS (Selenium)
# ==========================================
def executar_ebus(id_usuario_logado, data_inicio, data_final, callback_progresso=None, hook_cancelamento=None):
    def checar_parada():
        if hook_cancelamento and hook_cancelamento():
            raise CanceladoPeloUsuario("Processo cancelado pelo usuário.")

    username, senha_user = buscar_credencial_site(id_usuario_logado, "EBUS")
    if not username or not senha_user:
        if callback_progresso: callback_progresso(0.0, "ERRO: Credenciais do EBUS não encontradas no Cofre!")
        return
    
    if callback_progresso: callback_progresso(0.1, "Abrindo Navegador Invisível...")
    resultado = gerar_intervalos_mensais_ebus(data_inicio, data_final)
    opcoes = Options()
    opcoes.add_argument("--window-size=1920,1080")
    opcoes.add_argument("--headless")

    driver_path = get_driver_path()
    if driver_path:
        from selenium.webdriver.edge.service import Service
        driver = webdriver.Edge(service=Service(driver_path), options=opcoes)
    else:
        driver = webdriver.Edge(options=opcoes)
    
    try:
        checar_parada()
        driver.get("http://10.61.65.84/auth/login")
        wait = WebDriverWait(driver, 60)

        if callback_progresso: callback_progresso(0.2, "Fazendo login no EBUS...")
        login = wait.until(EC.presence_of_element_located((By.XPATH, "//input[contains (@id, 'input-usuario')]")))
        login.send_keys(username)
        senha = driver.find_element(By.XPATH, "//input[contains (@id, 'input-senha')]")
        senha.send_keys(senha_user)
        wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Login')]"))).click()

        if callback_progresso: callback_progresso(0.3, "Navegando até aba de Revenue...")
        wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(@class, 'menu-title ng-tns-c129-33')]"))).click()
        wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(@class, 'menu-title ng-tns-c129-37')]"))).click()

        origem = Path.home() / "Downloads"
        destino = Path.home() / "Documents"/ "Relatórios Revenue"
        destino.mkdir(parents=True, exist_ok=True)

        total_meses = len(resultado)
        for idx, (inicial_data, final_data, nome_mes, ano_atual) in enumerate(resultado):
            checar_parada()
            porcentagem = 0.3 + (0.5 * (idx/total_meses)) # Ajustei escala para integrar com pandas
            if callback_progresso: callback_progresso(porcentagem, f"Mês {idx+1}/{total_meses} - Inserindo filtro: {nome_mes}...")
            
            data_relatorio = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Início Viagem')]")))
            data_relatorio.clear()
            data_relatorio.send_keys(inicial_data)
            data_relatorio = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Fim Viagem')]")))
            data_relatorio.clear()
            data_relatorio.send_keys(final_data)
            
            if callback_progresso: callback_progresso(porcentagem + 0.02, f"Pesquisando {nome_mes}... Aguardando tabela.")
            wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), ' Pesquisar ')]"))).click()

            try: wait.until(EC.presence_of_element_located((By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")))
            except: pass

            def spinner_disappeared(driver):
                spinners = driver.find_elements(By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")
                for s in spinners:
                    if s.get_attribute("ng-reflect-nb-spinner") == 'true': return False
                return True

            wait.until(spinner_disappeared)
            checar_parada()
            if callback_progresso: callback_progresso(porcentagem + 0.04, f"Tabela de {nome_mes} carregada. Emitindo gatilho de Download...")
            wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Gerar EXCEL')]"))).click()
            
            if callback_progresso: callback_progresso(porcentagem + 0.05, f"Aguardando download de {nome_mes}...")
            
            # --- ALTERAÇÃO: Aumentando o tempo de espera pelo download ---
            time.sleep(10) # Antes era 3, mudei para 10 para dar tempo de baixar
            checar_parada()

            arquivos_encontrados = list(origem.rglob("*RelatorioRevenue*.xls"))
            if arquivos_encontrados:
                arquivos_encontrados.sort(key=os.path.getmtime, reverse=True)
                novo_nome = destino / f"RelatorioRevenue - {datetime.now().strftime('%d.%m.%Y_%H%M%S')}.xls"
                shutil.move(str(arquivos_encontrados[0]), str(novo_nome))
                # O processamento descobre o mês e ano sozinhos agora
                processar_arquivos_relatorios(novo_nome, destino, callback_progresso=callback_progresso)
            else:
                # --- ALTERAÇÃO: Adicionando log caso o arquivo não seja encontrado ---
                 if callback_progresso: callback_progresso(porcentagem + 0.1, f"AVISO: Arquivo não encontrado para {nome_mes}")
                 print(f"Arquivo não encontrado na pasta de downloads para o mês de {nome_mes}")

        if callback_progresso: callback_progresso(0.95, "Finalizando...")

    except CanceladoPeloUsuario as erro_cancel:
        if callback_progresso: callback_progresso(0, str(erro_cancel))
        raise # Sobe o erro pra ser tratado na GUI

    finally:
        try:
            driver.quit()
        except:
            pass