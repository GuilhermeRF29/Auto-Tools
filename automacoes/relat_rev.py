import os
import sys
import pandas as pd
from selenium.webdriver.edge.options import Options
from openpyxl import load_workbook
from openpyxl.utils import get_column_letter
from selenium import webdriver
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from selenium_helper import get_driver_path
except ImportError:
    def get_driver_path():
        return None
import io # <-- Importante para corrigir o aviso de descontinuação
import time
import math
import numpy as np # Precisamos do numpy para usar o valor np.nan real

def extrair_tabela_exata_para_excel(url, nome_arquivo="meu_relatorio.xlsx"):
    options = Options()
    # options.add_argument("--headless")
    options.add_argument("--window-size=1600,850")
    driver_path = get_driver_path()
    if driver_path:
        from selenium.webdriver.edge.service import Service
        driver = webdriver.Edge(service=Service(driver_path), options=options)
    else:
        driver = webdriver.Edge(options=options)
    driver.get(url)
    wait = WebDriverWait(driver, 60)
    
    username = "JCA347144"
    senha_user = "29J.02ca"

    tabelas_extraidas = []

    login = wait.until(EC.presence_of_element_located((By.XPATH, "//input[contains (@id, 'input-usuario')]")))
    login.send_keys(username)
    senha = driver.find_element(By.XPATH, "//input[contains (@id, 'input-senha')]")
    senha.send_keys(senha_user)
    wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Login')]"))).click()
    wait.until(EC.element_to_be_clickable((By.XPATH, "//a[contains(@class, 'ng-tns-c129-33 ng-star-inserted')]"))).click()
    wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'Aprovação de Preços')]"))).click()

    data_inicio = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Início Viagem')]")))
    data_inicio.send_keys("06/03/2026")
    data_fim = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Data Fim Viagem')]")))
    data_fim.send_keys("06/06/2026")

    botao_empresa = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(@class, 'select-button placeholder')]")))
    botao_empresa.click()
    empresa = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'VIACAO COMETA S A')]")))
    empresa.click()
    
    botao_origem = wait.until(EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Origem')]/parent::div//input")))
    botao_origem.send_keys("BELO HORIZONTE (RODOVIARIA) - MG")
    botao_origem = wait.until(EC.presence_of_element_located((By.XPATH, "//span[contains(text(), 'BELO HORIZONTE (RODOVIARIA) - MG')]"))).click()
            
    botao_destino = wait.until(EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Destino')]/parent::div//input")))
    botao_destino.send_keys("CUBATAO (RODOVIARIA) - SP")
    botao_destino = wait.until(EC.presence_of_element_located((By.XPATH, "//span[contains(text(), 'CUBATAO (RODOVIARIA) - SP')]"))).click()

    botao_servico = wait.until(EC.element_to_be_clickable((By.XPATH, "//input[contains(@placeholder, 'Selecione uma Classe')]"))).click()
    botao_servico = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'CAMA')]"))).click()

    botao_servico = wait.until(EC.element_to_be_clickable((By.XPATH, "//label[contains(text(), 'Canal de Venda')]/parent::div//input"))).click()
    botao_servico = wait.until(EC.element_to_be_clickable((By.XPATH, "//span[contains(text(), 'PROPRIA')]"))).click()

    pesquisar = wait.until(EC.presence_of_element_located((By.XPATH, "//nb-icon[contains(@class, 'action-icon')]"))).click()
    
    try: wait.until(EC.presence_of_element_located((By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")))
    except: pass

    def spinner_disappeared(driver):
        spinners = driver.find_elements(By.XPATH, "//nb-card[contains(@class, 'nb-spinner-container')]")
        for s in spinners:
            if s.get_attribute("ng-reflect-nb-spinner") == 'true': return False
        return True
    wait.until(spinner_disappeared)
    try:
        while True:
            # 1. Usamos o Selenium para encontrar a tabela ESPECÍFICA que queremos
            # DICA: Tente usar o ID ou uma Classe específica da tabela em vez de só "//table"
            # Exemplo: "//table[@id='tabela-de-dados']" ou "//table[contains(@class, 'table-striped')]"
            tabela_elemento = wait.until(EC.presence_of_element_located((By.XPATH, "//table[.//thead[contains(@class, 'ng-star-inserted')]]")))
            
            # 2. Em vez de pegar o HTML da página toda, pegamos SÓ o HTML dessa tabela exata
            html_da_tabela = tabela_elemento.get_attribute('outerHTML')
            
            # 3. Resolvemos o aviso de descontinuação usando io.StringIO
            # O Pandas agora vai ler apenas o HTML da tabela certa, então o [0] funcionará perfeitamente!
            df_atual = pd.read_html(io.StringIO(html_da_tabela))[0] 
            
            tabelas_extraidas.append(df_atual)
            print(f"Página extraída com sucesso! Linhas: {len(df_atual)}")
            
            # 4. Paginação (A mesma lógica de antes)
            try:
                # Substitua pelo seletor correto do botão de "Próximo"
                botao_proximo = driver.find_element((By.XPATH, "//a[contains(@aria-label, 'Next')]")) 
                
                if "disabled" in botao_proximo.get_attribute("class") or not botao_proximo.is_enabled():
                    print("Chegamos na última página.")
                    break
                
                driver.execute_script("arguments[0].scrollIntoView(true);", botao_proximo)
                botao_proximo.click()
                time.sleep(1.5) # Pausa para o JavaScript carregar a nova tabela
                
            except Exception as e:
                print("Botão de próximo não encontrado ou fim da paginação.")
                break
                
    finally:
        driver.quit()

# ... (todo o código do Selenium fica igual até a parte de juntar as tabelas)

    # 5. Junta tudo, Limpa e Salva no Excel Profissional!
    if tabelas_extraidas:
        tabela_final = pd.concat(tabelas_extraidas, ignore_index=True)
       
       # --- 1. RESOLVENDO O ERRO DE MÚLTIPLOS INDEX ---
       # Se a tabela tiver cabeçalhos duplos, nós "achatamos" eles
        if isinstance(tabela_final.columns, pd.MultiIndex):
            print("Cabeçalho duplo detectado! Achatando colunas...")
            # Junta os nomes dos níveis com um espaço e remove espaços extras
            tabela_final.columns = [' '.join(col).strip() for col in tabela_final.columns.values]

        # --- 2. ARRANCANDO O ÍNDICE DO SITE ---
        # Usamos o iloc para pegar [todas_as_linhas, da_coluna_1_em_diante]
        # Isso mata a primeira coluna impiedosamente, seja qual for o nome dela.
        # tabela_final = tabela_final.iloc[:, 1:]

        # --- 3. LIMPANDO QUEBRAS DE LINHA E ESPAÇOS (O FIM DAS CÉLULAS GIGANTES) ---
        # Fazemos isso PRIMEIRO para o Pandas não se confundir
        tabela_final = tabela_final.replace(r'^\s*$', np.nan, regex=True)
        tabela_final = tabela_final.dropna(how='all').dropna(axis=1, how='all')
        
        colunas_texto = tabela_final.select_dtypes(['object']).columns
        for col in colunas_texto:
            tabela_final[col] = tabela_final[col].astype(str).str.replace('\n', ' ', regex=False).str.strip()

        # Achatando cabeçalho duplo (caso exista)
        if isinstance(tabela_final.columns, pd.MultiIndex):
            tabela_final.columns = [' '.join(col).strip() for col in tabela_final.columns.values]

        # --- 2. A EXCLUSÃO CIRÚRGICA DO ÍNDICE ---
        print("\n--- DIAGNÓSTICO DE COLUNAS ---")
        print("Colunas atuais:", tabela_final.columns.tolist())
        
        # Coloque aqui dentro da lista o nome exato do índice intruso que apareceu no print acima
        # Pode ser '#', 'Unnamed: 0', 'ID', etc.
        nomes_intrusos = ['Unnamed: 0', '#'] 
        
        for intruso in nomes_intrusos:
            if intruso in tabela_final.columns:
                tabela_final = tabela_final.drop(columns=[intruso])
                print(f"-> Coluna intrusa '{intruso}' encontrada e removida com sucesso!")

        tabela_final = tabela_final.reset_index(drop=True)

        # =====================================================================
        # --- O EXTERMINADOR DE CABEÇALHOS FANTASMAS ---
        # =====================================================================
        print("Limpando cabeçalhos repetidos da paginação...")
        
        # Pegamos o nome da primeira coluna da sua tabela
        nome_primeira_coluna = tabela_final.columns[0]
        
        # Filtramos a tabela: Mantenha apenas as linhas onde o valor NÃO É igual ao nome da coluna
        tabela_final = tabela_final[tabela_final[nome_primeira_coluna] != nome_primeira_coluna]
        
        # Resetamos o index mais uma vez só para garantir a ordem perfeita
        tabela_final = tabela_final.reset_index(drop=True)

        # --- 3. EXPORTAÇÃO COM RASTREADOR DE LARGURA ---
        # =====================================================================
        # --- EXPORTAÇÃO "ESTADO DA ARTE" (BORDAS LIMITADAS E COLORIDAS) ---
        # =====================================================================
        print("\n--- APLICANDO FORMATAÇÃO VISUAL FINA ---")
        
        with pd.ExcelWriter(nome_arquivo, engine='xlsxwriter') as writer:
            tabela_final.to_excel(writer, index=False, sheet_name='Dados_Limpos')
            workbook = writer.book
            worksheet = writer.sheets['Dados_Limpos']
            
            # 1. DEFINIÇÃO DE CORES E FORMATOS
            # Cor da borda: Use códigos Hex (ex: '#000000' para preto, '#FF0000' para vermelho)
            cor_da_borda = '#3d3d3d'  # Um azul suave e profissional
            
            # Formato BASE das células (Alinhamento e Quebra de texto)
            # NOTA: Tiramos o 'border': 1 daqui para não pintar a coluna inteira até o infinito!
            formato_dados = workbook.add_format({
                'text_wrap': True, 
                'valign': 'top'
            })
            
            # Formato EXCLUSIVO para as bordas (será aplicado só na área de dados)
            formato_borda_colorida = workbook.add_format({
                'border': 1,                # Ativa a borda fina
                'border_color': cor_da_borda # <--- AQUI MUDA A COR DA BORDA
            })
            
            # Formato do Cabeçalho (Negrito, Centralizado, Fundo cinza claro opcional)
            formato_cabecalho = workbook.add_format({
                'text_wrap': True, 
                'valign': 'vcenter', 
                'align': 'center', 
                'bold': True,
                'border': 1,
                'border_color': cor_da_borda, # Mesma cor para combinar
                'bg_color': '#F2F2F2',        # Um cinza bem clarinho no fundo do cabeçalho
                'bottom': 2                   # Borda inferior mais grossa
            })
            
            maior_qtd_linhas_cabecalho = 1 

            # --- 2. LOOP PARA LARGURA DAS COLUNAS ---
            for i, col in enumerate(tabela_final.columns):
                dados_validos = tabela_final[col].dropna()
                
                # Lógica de tamanho (Mínimo 15, Máximo 50)
                if dados_validos.empty:
                    tamanho_max_dado = 15 
                else:
                    tamanho_max_dado = dados_validos.astype(str).map(len).max()
                
                largura_calculada = tamanho_max_dado + 2 
                largura_final = max(15, min(largura_calculada, 50))
                
                # Aplica a largura e o formato de texto (SEM borda por enquanto)
                worksheet.set_column(i, i, largura_final, formato_dados)
                
                # Reescreve o cabeçalho com o formato bonitão
                worksheet.write(0, i, col, formato_cabecalho)
                
                # Cálculo da altura do cabeçalho
                tamanho_titulo = len(str(col))
                qtd_linhas_necessarias = math.ceil(tamanho_titulo / largura_final)
                if qtd_linhas_necessarias > maior_qtd_linhas_cabecalho:
                    maior_qtd_linhas_cabecalho = qtd_linhas_necessarias

            # --- 3. APLICANDO AS BORDAS APENAS ONDE TEM DADOS ---
            # Pegamos o número da última linha e última coluna com dados
            ultima_linha = len(tabela_final)     # Ex: 100 linhas de dados
            ultima_coluna = len(tabela_final.columns) - 1 # Ex: Coluna índice 5
            
            # O conditional_format permite aplicar estilo numa região específica (Range)
            # Sintaxe: (linha_inicial, col_inicial, linha_final, col_final)
            # Usamos type: 'no_blanks' ou 'formula' para garantir que pegue tudo
            # Aqui usamos uma fórmula que é sempre VERDADEIRA para pintar toda a tabela
            worksheet.conditional_format(1, 0, ultima_linha, ultima_coluna, {
                'type': 'formula',
                'criteria': '=TRUE', 
                'format': formato_borda_colorida
            })

            # --- 4. AJUSTES FINAIS DE ALTURA ---
            # Altura do cabeçalho
            altura_ideal_cabecalho = 15 * maior_qtd_linhas_cabecalho
            worksheet.set_row(0, altura_ideal_cabecalho)

            # Altura das linhas de dados (Aumentando para 25 para ficar bem visível)
            altura_linhas_dados = 20
            for linha_index in range(1, ultima_linha + 1):
                worksheet.set_row(linha_index, altura_linhas_dados)

        print(f"\nRelatório Visual Gerado! Bordas na cor {cor_da_borda} aplicadas apenas na área de dados.")
    else:
        print("\nNenhum dado foi extraído.")

# Como usar:
extrair_tabela_exata_para_excel("http://10.61.65.84/ebus/dashboard", "dados_brutos.xlsx")