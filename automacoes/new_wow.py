import sys
import os
_this_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _this_dir)
sys.path.insert(0, os.path.dirname(_this_dir))

import asyncio
import re
import math
import json
import base64
import tempfile
import shutil
from pptx import Presentation
from datetime import datetime
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from core.banco import buscar_credencial_site
from playwright.async_api import Playwright, async_playwright, expect

def log_progress(p, m):
    print(f"PROGRESS:{json.dumps({'p': int(p), 'm': str(m)}, ensure_ascii=False)}", flush=True)

def resultado_automacao(arquivo_principal=None, arquivos_saida=None, pasta_final=None, mensagem=None):
    arquivos = [arquivo for arquivo in (arquivos_saida or []) if arquivo]
    if arquivo_principal and arquivo_principal not in arquivos:
        arquivos.insert(0, arquivo_principal)
    return {
        "arquivo_principal": arquivo_principal or (arquivos[0] if arquivos else None),
        "arquivos_saida": arquivos,
        "pasta_final": pasta_final,
        "mensagem": mensagem or "Automação concluída com sucesso."
    }

def publicar_resultado(resultado):
    if resultado:
        print(json.dumps(resultado, ensure_ascii=False), flush=True)

def get_params():
    try:
        if len(sys.argv) > 1:
            decoded = base64.b64decode(sys.argv[1]).decode('utf-8')
            return json.loads(decoded)
    except Exception as e:
        print(f"Erro ao parsear argumentos: {e}")
    return {}

login_lock = asyncio.Lock()
_session_renewed = False
URL_POWERBI = "https://app.powerbi.com/singleSignOn?experience=power-bi&ru=https%3A%2F%2Fapp.powerbi.com%2Fgroups%2Fme%2Freports%2F6a910f57-fbf5-45f2-8064-bf2463667097%2Fbfd774259b1360b0e2a0%3Fexperience%3Dpower-bi%26noSignUpCheck%3D1"

def encontrar_slide_por_texto(prs, mercado, indicador):
    """Encontra o slide cujo texto contenha o mercado e o indicador."""
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame and shape.text_frame.text:
                texto = shape.text_frame.text
                if mercado in texto and indicador in texto:
                    return slide
    return None

def detectar_barra_cinza(slide, slide_height):
    """Retorna o topo (EMU) da barra cinza se existir, None caso contrário."""
    for shape in slide.shapes:
        if (shape.has_text_frame
            and shape.top > slide_height * 0.5
            and "Google Shape" in shape.name):
            return shape.top
    return None

def remover_slides_share(prs, incluir_share: bool):
    """Remove slides que contêm 'Share Canais Acumulado' no texto."""
    if incluir_share:
        return
    slides_remover = []
    for i, slide in enumerate(prs.slides):
        for shape in slide.shapes:
            if shape.has_text_frame and "Share Canais Acumulado" in shape.text_frame.text:
                slides_remover.append(i)
                break
    for i in reversed(slides_remover):
        rId = prs.slides._sldIdLst[i].get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')
        prs.part.drop_rel(rId)
        sldIdLst = prs.slides._sldIdLst
        sldIdLst.remove(sldIdLst[i])
    if slides_remover:
        print(f"  -> {len(slides_remover)} slides Share Canais removidos.")

def gerar_apresentacao(lista_imagens: list, arquivo_saida: str, incluir_share: bool = True) -> None:
    """
    Carrega o template base, encontra cada slide pelo texto do título
    e insere a screenshot com redimensionamento inteligente.
    Slides sem imagem correspondente (legendas, Load Factor, etc.) são preservados.
    """

    log_progress(85, f"Iniciando a criação do PowerPoint...")
    template_path = os.path.join(os.path.dirname(__file__), "assets", "Template_WoW.pptx")
    prs = Presentation(template_path)
    remover_slides_share(prs, incluir_share)

    slide_width = prs.slide_width
    slide_height = prs.slide_height

    MARGEM_LATERAL = Inches(0.1)
    TOPO_UTIL = Inches(0.7)
    MARGEM_ANTES_BARRA = Inches(0.15)
    MARGEM_INFERIOR_PADRAO = Inches(0.15)

    for img_path in lista_imagens:
        pasta, arquivo = os.path.split(img_path)
        indicador = arquivo.replace(".png", "").replace("_", " ").replace(",", "/")

        slide = encontrar_slide_por_texto(prs, pasta, indicador)
        if slide is None:
            print(f"  -> Aviso: slide para {pasta}/{indicador} não encontrado. Pulando.")
            continue

        # Detecta barra cinza no rodapé do slide
        barra_top = detectar_barra_cinza(slide, slide_height)

        # Área útil: com barra → até antes dela; sem barra → até o fundo
        max_width = int(slide_width - (MARGEM_LATERAL * 2))
        if barra_top:
            altura_util = barra_top - TOPO_UTIL - MARGEM_ANTES_BARRA
        else:
            altura_util = slide_height - TOPO_UTIL - MARGEM_INFERIOR_PADRAO

        # Adiciona a imagem e redimensiona
        pic = slide.shapes.add_picture(img_path, MARGEM_LATERAL, TOPO_UTIL)
        largura_orig = pic.width
        altura_orig = pic.height

        proporcao = max_width / largura_orig
        pic.width = int(max_width)
        altura_proporcional = altura_orig * proporcao

        if altura_proporcional > altura_util:
            pic.height = int(altura_util)
        else:
            pic.height = int(altura_proporcional)

        # Centraliza verticalmente na área útil
        espaco_sobrando = altura_util - pic.height
        pic.top = int(TOPO_UTIL + (espaco_sobrando / 2))
        pic.left = int(MARGEM_LATERAL)

        print(f"  -> {pasta}/{indicador}: imagem inserida (barra={'sim' if barra_top else 'não'})")

    prs.save(arquivo_saida)
    print(f"\n[SUCESSO] Apresentação salva como: {arquivo_saida}")

async def localizar_relatorio(page):
    """Localiza a região do relatório (PT-BR ou EN)"""
    return page.get_by_role("region", name=re.compile(
        "(Relatório do Power BI|Power BI report)", re.IGNORECASE
    ))

async def capturar_aba(page, nome_aba: str, nome_arquivo: str, pasta_saida: str) -> str:
    """
    Cria a pasta (se não existir), aguarda os gráficos e salva a print lá dentro.
    Retorna o caminho completo do arquivo salvo para mandarmos pro PowerPoint.
    """
    print(f"  -> Acessando a aba '{nome_aba}'...")
    
    # Cria a pasta no seu computador (o exist_ok=True evita erro se a pasta já existir)
    os.makedirs(pasta_saida, exist_ok=True)
    
    # Monta o caminho completo. Exemplo: "WEMOBI\01_rskm.png"
    caminho_completo = os.path.join(pasta_saida, f"{nome_arquivo}.png")

    await page.get_by_role("tab", name=nome_aba).click()
    
    spinners = page.locator("[data-testid='spinner']:visible")
    await page.wait_for_timeout(500)
    await expect(spinners).to_have_count(0, timeout=60000)
    await page.wait_for_timeout(1000)
    
    area_relatorio = await localizar_relatorio(page)
    
    # Salva usando o caminho completo que criamos!
    await area_relatorio.screenshot(path=caminho_completo)
    print(f"     [OK] Print salvo em: {caminho_completo}")
    
    # Devolvemos o caminho para o código principal guardar na lista do PowerPoint
    return caminho_completo

async def selecionar_semana(page, semana: str) -> None:
    """
    Função auxiliar para selecionar uma semana específica usando regex.
    """
    # O f"^{semana}$" garante que ele vai buscar EXATAMENTE "15", e não "215" ou "150".
    target_semana = page.get_by_role(
        "option", name=re.compile(f"^{semana}$", re.IGNORECASE)
    )

    # 1. Busca e seleciona a semana desejada
    tentativas_semana = 0
    while tentativas_semana < 60:
        if await target_semana.is_visible():
            await target_semana.click(modifiers=["ControlOrMeta"])
            print(f"  -> Semana '{semana}' selecionada com sucesso!")
            break
            
        await page.keyboard.press("ArrowDown")
        await page.wait_for_timeout(30) 
        tentativas_semana += 1

async def selecionar_mercado(page, nome_pai: str, regex_filhos: list[str] | str | None = None, primeiro_clique: bool = False) -> None:
    """
    Encontra um mercado pai e, opcionalmente, seleciona um ou mais filhos.
    Usa a tecla 'Home' para resetar a rolagem e nunca se perder.
    """
    print(f"Buscando mercado pai: '{nome_pai}'...")

    # Truque de Mestre: Se você passar apenas 1 filho como texto, 
    # transformamos em uma lista de 1 item. Assim o código abaixo serve para 1 ou 10 filhos!
    if isinstance(regex_filhos, str):
        regex_filhos = [regex_filhos]

    # 1. Reseta o scroll para o TOPO da lista logo de cara.
    await page.keyboard.press("Home")
    await page.wait_for_timeout(300)

    mercado_root = page.locator(".slicerItemContainer").filter(has_text=nome_pai)

    # 2. Busca e lida com o MERCADO PAI
    tentativas_pai = 0
    while tentativas_pai < 100:
        if await mercado_root.is_visible():
            if regex_filhos:
                # Se tem filhos, precisamos EXPANDIR a pasta
                botao_expandir = mercado_root.locator(".expandButton")
                if await botao_expandir.is_visible():
                    await botao_expandir.click()
                    print(f"  -> Mercado pai '{nome_pai}' expandido.")
            else:
                # Se NÃO tem filhos, selecionamos o pai
                if primeiro_clique:
                    await mercado_root.click() # Clique normal (desmarca tudo e foca nele)
                else:
                    await mercado_root.click(modifiers=["ControlOrMeta"]) # CTRL+Click (adiciona à seleção)
                print(f"  -> Mercado pai '{nome_pai}' selecionado.")
            break # Achou o pai, sai do loop!

        await page.keyboard.press("ArrowDown")
        await page.wait_for_timeout(30)
        tentativas_pai += 1

    # 3. Busca e seleciona os MERCADOS FILHOS (Se existirem)
    if regex_filhos:
        await page.wait_for_timeout(500) # Pausa para a pastinha do Power BI abrir

        for filho in regex_filhos:
            # O Segredo: Voltar pro TOPO antes de procurar cada novo filho!
            # Isso garante que ache o item, esteja ele acima ou abaixo do anterior.
            await page.keyboard.press("Home")
            await page.wait_for_timeout(300)

            target_mercado = page.get_by_role("treeitem", name=re.compile(filho, re.IGNORECASE))
            tentativas_filho = 0

            while tentativas_filho < 100:
                if await target_mercado.is_visible():
                    if primeiro_clique:
                        await target_mercado.click()
                    else:
                        await target_mercado.click(modifiers=["ControlOrMeta"])
                    print(f"  -> Filho '{filho}' selecionado com sucesso!")
                    break

                await page.keyboard.press("ArrowDown")
                await page.wait_for_timeout(30)
                tentativas_filho += 1

# ----------------------------- Execução Principal -----------------------------

# Mantenha os seus imports normais (os, asyncio, re, playwright, pptx...)

# Mantenha suas funções auxiliares INTACTAS (capturar_aba, selecionar_mercado, selecionar_semana...)
# A sua arquitetura foi tão bem feita que as funções já aceitam a 'page' de qualquer worker!

# ---------------------------------------------------------
# 1. A FUNÇÃO DO TRABALHADOR (Worker)
# ---------------------------------------------------------

async def verificar_login(page) -> bool:
    """Retorna True se a página tiver um formulário de login real, False se o Power BI carregou."""
    await page.wait_for_timeout(5000)
    try:
        await page.wait_for_selector('.explore-canvas', state='visible', timeout=85000)
        return False
    except Exception:
        pass
    login_input = page.locator('input[name="loginfmt"], input[type="email"], #loginForm')
    try:
        if await login_input.first.is_visible(timeout=5000):
            return True
    except Exception:
        pass
    url = page.url.lower()
    return "login.microsoft" in url or "signin" in url

async def primeiro_visivel(page, locators, timeout_ms=30000):
    """Retorna o primeiro locator visível dentro do timeout."""
    deadline = asyncio.get_running_loop().time() + (timeout_ms / 1000)
    while asyncio.get_running_loop().time() < deadline:
        for locator in locators:
            try:
                candidate = locator.first
                if await candidate.is_visible(timeout=700):
                    return candidate
            except Exception:
                continue
        await page.wait_for_timeout(400)
    return None

async def clicar_primeiro_visivel(page, locators, descricao, timeout_ms=15000):
    alvo = await primeiro_visivel(page, locators, timeout_ms)
    if not alvo:
        raise TimeoutError(f"Nao encontrei {descricao}.")
    await alvo.click()
    return alvo

async def dashboard_powerbi_visivel(page, timeout_ms=5000):
    try:
        await page.wait_for_selector('.explore-canvas', state='visible', timeout=timeout_ms)
        return True
    except Exception:
        return False

async def salvar_debug_login(page, nome):
    try:
        debug_path = os.path.join(os.path.dirname(__file__), nome)
        await page.screenshot(path=debug_path, full_page=True)
        log_progress(20, f"Screenshot de debug salvo: {debug_path}")
    except Exception:
        pass

async def efetuar_login_microsoft(page, email, senha):
    if not email or not senha:
        raise ValueError("Credenciais vazias para login automatico.")

    log_progress(20, "Iniciando login automatico na Microsoft...")
    await page.wait_for_load_state("domcontentloaded", timeout=60000)
    await page.wait_for_timeout(1500)

    if await dashboard_powerbi_visivel(page, timeout_ms=5000):
        log_progress(20, "Power BI ja estava autenticado.")
        return

    conta_salva = await primeiro_visivel(page, [
        page.locator(f'[data-test-id="{email}"]'),
        page.get_by_text(email, exact=True),
        page.locator(f'div:has-text("{email}")'),
    ], timeout_ms=7000)
    if conta_salva:
        log_progress(20, "Conta salva encontrada. Selecionando conta...")
        await conta_salva.click()
        await page.wait_for_timeout(2500)

    input_email = await primeiro_visivel(page, [
        page.locator('#i0116'),
        page.locator('input[name="loginfmt"]'),
        page.locator('input[type="email"]'),
    ], timeout_ms=25000)
    if input_email:
        log_progress(20, "Preenchendo e-mail...")
        await input_email.fill(email)
        await page.keyboard.press("Enter")
        await page.wait_for_timeout(2500)
    else:
        log_progress(20, "Campo de e-mail nao apareceu; seguindo para senha/validacao.")

    input_senha = await primeiro_visivel(page, [
        page.locator('#i0118'),
        page.locator('input[name="passwd"]'),
        page.locator('input[type="password"]'),
    ], timeout_ms=30000)
    if not input_senha:
        if await dashboard_powerbi_visivel(page, timeout_ms=5000):
            log_progress(20, "Login validado sem etapa de senha.")
            return
        await salvar_debug_login(page, "debug_wow_login_sem_senha.png")
        raise TimeoutError("Campo de senha da Microsoft nao apareceu.")

    log_progress(20, "Preenchendo senha...")
    await input_senha.fill(senha)
    await page.keyboard.press("Enter")
    await page.wait_for_timeout(3000)

    try:
        erro_login = await primeiro_visivel(page, [
            page.locator('#passwordError'),
            page.locator('#usernameError'),
            page.locator('[role="alert"]'),
        ], timeout_ms=3000)
        if erro_login:
            texto_erro = (await erro_login.inner_text()).strip()
            if texto_erro:
                raise RuntimeError(f"Microsoft recusou o login: {texto_erro[:180]}")
    except RuntimeError:
        raise
    except Exception:
        pass

    btn_sim = await primeiro_visivel(page, [
        page.locator('input[type="submit"][value="Yes"]'),
        page.locator('input[type="submit"][value="Sim"]'),
        page.get_by_role("button", name=re.compile("^(Sim|Yes|Continuar|Continue)$", re.IGNORECASE)),
        page.locator('#idSIButton9'),
    ], timeout_ms=12000)
    if btn_sim:
        log_progress(20, "Confirmando permanencia conectada...")
        await btn_sim.click()
        await page.wait_for_timeout(3000)

    log_progress(20, "Aguardando carregamento do Power BI...")
    try:
        await page.wait_for_selector('.explore-canvas', state='visible', timeout=90000)
    except Exception:
        await salvar_debug_login(page, "debug_wow_login_sem_powerbi.png")
        raise
    log_progress(20, "Login automatico concluido com sucesso!")

async def configurar_sessao(worker_id: int, browser, playwright):
    """Cria context + page. Se detectar tela de login, abre navegador VISÍVEL para login manual."""
    global _session_renewed
    auth_path = os.path.join(os.path.dirname(__file__), "auth.json")
    for tentativa in range(3):
        context_args = {
            "locale": "pt-BR",
            "viewport": {"width": 1920, "height": 1080},
            "device_scale_factor": 2,
        }
        if os.path.exists(auth_path):
            context_args["storage_state"] = auth_path

        context = await browser.new_context(**context_args)
        await context.add_init_script('''
            Object.defineProperty(navigator, "language", { get: () => "pt-BR" });
            Object.defineProperty(navigator, "languages", { get: () => ["pt-BR", "pt"] });
        ''')
        page = await context.new_page()
        await page.goto(URL_POWERBI, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(10000)

        if await verificar_login(page):
            if _session_renewed:
                log_progress(20, f"[Worker {worker_id}] Sessão já renovada por outro worker. Aguardando...")
                await context.close()
                await asyncio.sleep(25)
                continue

            log_progress(20, f"[Worker {worker_id}] Sessão expirada. Tentando login automático...")
            await context.close()
            async with login_lock:
                if not _session_renewed:
                    manual_browser = await playwright.chromium.launch(
                        headless=False,
                        args=["--window-size=1280,800"]
                    )
                    manual_context = await manual_browser.new_context(locale="pt-BR")
                    manual_page = await manual_context.new_page()
                    await manual_page.goto(URL_POWERBI, wait_until="domcontentloaded", timeout=60000)
                    
                    email_global = GLOBAL_PARAMS.get('email', '')
                    senha_global = GLOBAL_PARAMS.get('senha', '')
                    
                    if not email_global or not senha_global:
                        log_progress(20, "Credenciais vazias! Faça o login manualmente na janela aberta.")
                        try:
                            await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=120000)
                        except Exception:
                            pass
                    else:
                        try:
                            await efetuar_login_microsoft(manual_page, email_global, senha_global)
                        except Exception as e:
                            log_progress(20, f"Erro no login automático: {e}. Faça o login manualmente.")
                            try:
                                await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=60000)
                            except Exception:
                                pass

                    sessao_salva = False
                    try:
                        await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=10000)
                        await manual_context.storage_state(path=auth_path)
                        log_progress(20, "Login concluído! Sessão salva.")
                        sessao_salva = True
                    except Exception as e:
                        log_progress(20, f"Falha ao validar ou salvar a sessão: {e}")
                    
                    await manual_context.close()
                    await manual_browser.close()
                    if not sessao_salva:
                        raise Exception("Login nao foi validado; auth.json nao foi salvo.")
                    _session_renewed = True
            continue

        return context, page

    raise Exception(f"[Worker {worker_id}] -> Falha ao renovar login após 3 tentativas.")

async def worker_extracao(worker_id: int, browser, playwright, cenarios_do_worker: list,
                          shared_progress: dict = None, total_cenarios: int = 1,
                          temp_dir: str = None) -> list:
    """
    Cada worker roda isolado no seu próprio contexto, processando sua fatia de cenários.
    """
    # ---------------------------------------------------------
    # EFEITO CASCATA: Atrasa a largada para não congestionar a rede
    # Worker 1 espera 0s | Worker 2 espera 7s | Worker 3 espera 14s...
    # ---------------------------------------------------------
    tempo_espera = (worker_id - 1) * 7.5 
    print(f"[Worker {worker_id}] No aguardo... Começando em {tempo_espera} segundos.")
    await asyncio.sleep(tempo_espera)

    print(f"[Worker {worker_id}] Iniciando missão com {len(cenarios_do_worker)} cenários...")
    
    context, page = await configurar_sessao(worker_id, browser, playwright)
    
    imagens_deste_worker = []

    try:
        await page.wait_for_selector('.explore-canvas', state='visible', timeout=15000)
        print("Dashboard do Power BI carregado com sucesso!")
    except Exception as e:
        print(f"ERRO: Dashboard do Power BI não carregou. Salvando screenshot...")
        await page.screenshot(path=os.path.join(os.path.dirname(__file__), "debug_dashboard_erro.png"))
        raise Exception(f"Dashboard do Power BI não carregou: {e}")

    # --------- Reset de filtros ---------
    print(f"[Worker {worker_id}] Verificando se há filtros para resetar...")
    botao_reset = page.get_by_test_id("reset-to-default-btn")
    
    try:
        # Proteção: tenta verificar por 3 segundos no máximo. Se não achar, pula direto.
        if await botao_reset.is_enabled(timeout=3000):
            await botao_reset.click()
            await page.wait_for_timeout(500) 
            await page.get_by_test_id("dailog-ok-btn").click() 
            print(f"[Worker {worker_id}] -> Filtros resetados.")
        else:
            print(f"[Worker {worker_id}] -> O relatório já está limpo.")
    except Exception:
        print(f"[Worker {worker_id}] -> Botão de reset não encontrado a tempo. Assumindo que já está limpo.")

    # ---------------------------------------------------------
    # ESPERA INTELIGENTE DO CARREGAMENTO GERAL
    # ---------------------------------------------------------
    # PRIMEIRO esperamos o Power BI respirar e carregar os gráficos!
    # Como são 5 workers simultâneos, isso pode levar mais de 30 segundos tranquilamente.
    print(f"[Worker {worker_id}] Aguardando Power BI renderizar (pode demorar com 5 workers)...")
    spinners = page.locator("[data-testid='spinner']:visible")
    await expect(spinners).to_have_count(0, timeout=480000) # Até 8 minutos de tolerância
    await page.wait_for_timeout(1000) # Pausa dramática para a interface estabilizar

    # ---------------------------------------------------------
    # SELEÇÃO DE DIAS DA SEMANA (Blindada + Fallback EN)
    # ---------------------------------------------------------
    combo_semana = page.get_by_role("combobox", name=re.compile(
        "(Semana do Ano|Week of Year|Week)", re.IGNORECASE
    ))
    
    # Verifica se a caixa da Semana já está visível na tela (se o painel já veio aberto)
    if not await combo_semana.is_visible():
        print(f"[Worker {worker_id}] Painel oculto. Tentando abrir...")
        botao_painel = page.get_by_role("button", name=re.compile(
            "Mostrar/ocultar painel de|Show/Hide|Expand", re.IGNORECASE
        ))
        
        try:
            await botao_painel.click(timeout=10000)
            await page.wait_for_timeout(1500)
        except Exception:
            print(f"[Worker {worker_id}] -> Botão do painel não encontrado. Tentando fallback...")
            await page.keyboard.press("Tab")
            await page.wait_for_timeout(500)
            await page.keyboard.press("Tab")
            await page.wait_for_timeout(500)
            await page.keyboard.press("Enter")
            await page.wait_for_timeout(1000)

    # Re-tenta encontrar o combobox após abrir o painel
    if not await combo_semana.is_visible():
        combo_semana = page.get_by_role("combobox", name=re.compile(
            "Week|Semana", re.IGNORECASE
        ))

    # Agora clica com segurança ou salva screenshot para debug
    try:
        await combo_semana.click(timeout=15000)
        await page.wait_for_timeout(200)
    except Exception:
        print(f"[Worker {worker_id}] -> ERRO: Combobox de semanas não encontrado. Salvando screenshot...")
        await page.screenshot(path=os.path.join(os.path.dirname(__file__), "debug_semana_erro.png"))
        raise

    # Seleciona as semanas dinamicamente...
    semanas = GLOBAL_PARAMS.get('semanas', ['1', '2', '3', '4'])
    for sem in semanas:
        await selecionar_semana(page, str(sem))

    # --------- Seleção de data (Versão Blindada Final) ---------
    print(f"[Worker {worker_id}] Definindo data de término...")
    
    # Em headless o aria-label vem em inglês: "End date. Available input range..."
    campo_data = page.locator("input[aria-label*='End date' i]")
    
    # Fallback: português (headed)
    if await campo_data.count() == 0:
        campo_data = page.locator("input[aria-label*='Data de término' i]")
    
    data_definida = False
    if await campo_data.count() > 0:
        el = campo_data.first
        # Usa el.value + dispatchEvent (evita Illegal invocation do nativeSetter)
        data_definida = await el.evaluate('''(el) => {
            if (!el) return false;
            el.value = "31/07/2026";
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.blur();
            return true;
        }''')
    
    if not data_definida:
        print(f"[Worker {worker_id}] -> JS falhou, tentando fill manual...")
        try:
            todos_inputs = page.locator("input")
            count = await todos_inputs.count()
            for i in range(count):
                el = todos_inputs.nth(i)
                label = (await el.get_attribute("aria-label") or "").lower()
                if "end date" in label or "data de término" in label:
                    await el.click(force=True)
                    await el.fill("31/07/2026")
                    await page.keyboard.press("Tab")
                    data_definida = True
                    break
        except Exception as e:
            print(f"[Worker {worker_id}] -> Fallback falhou: {e}")
    
    if data_definida:
        print(f"[Worker {worker_id}] -> Data definida para 31/07/2026 com sucesso.")
    else:
        print(f"[Worker {worker_id}] -> ⚠️ Não foi possível definir a data.")
    
    # Espera os gráficos reagirem à nova data
    await expect(spinners).to_have_count(0, timeout=60000)

    # ---------------------------------------------------------
    # O GRANDE LOOP DE EXTRAÇÃO (Agora com a variável certa!)
    # ---------------------------------------------------------
    for cenario in cenarios_do_worker:
        nome_pasta = cenario["nome_pasta"]
        filtros_do_cenario = cenario["filtros"]
        
        print(f"\n[Worker {worker_id}] ==================================================")
        print(f"[Worker {worker_id}] INICIANDO EXTRAÇÃO: {nome_pasta}")
        print(f"[Worker {worker_id}] ==================================================")

        # ---------------------------------------------------------
        # LIMPEZA SEGURA DO FILTRO (A "Borrachinha")
        # ---------------------------------------------------------
        
        # 1. Isolamos a "caixa" inteira que contém o filtro de Mercado
        grupo_mercado = page.get_by_role("group").filter(has_text="Mercado, Linha")
        
        # 2. Passamos o mouse na caixa para a borrachinha acender
        await grupo_mercado.hover()
        await page.wait_for_timeout(300)
        
        # 3. O Pulo do Gato: Procuramos a borracha APENAS dentro dessa caixa!
        botao_limpar = grupo_mercado.get_by_label("Limpar seleções")
        
        # 4. Só clicamos se a borracha existir (ou seja, se tiver algo filtrado)
        if await botao_limpar.is_visible():
            await botao_limpar.click()
            print(f"[Worker {worker_id}] -> Borracha acionada. Filtro limpo.")
            
            # Espera o painel atualizar os dados de volta pro padrão
            spinners = page.locator("[data-testid='spinner']:visible")
            await expect(spinners).to_have_count(0, timeout=60000)
            await page.wait_for_timeout(500)
        
        # Agora sim abrimos o menu para começar as nossas seleções do novo cenário!
        await page.get_by_role("combobox", name="Mercado, Linha").click()
        await page.wait_for_timeout(500)

        # Seleção Múltipla Inteligente
        for index, filtro in enumerate(filtros_do_cenario):
            # O primeiro filtro da lista (index 0) será o clique principal. Os outros usarão CTRL.
            é_o_primeiro_clique = (index == 0)
            await selecionar_mercado(page, nome_pai=filtro["pai"], regex_filhos=filtro["filhos"], primeiro_clique=é_o_primeiro_clique)

        # Foca no relatório e começa as fotos
        await (await localizar_relatorio(page)).click()

        pasta_saida = os.path.join(temp_dir, nome_pasta) if temp_dir else nome_pasta
        caminho_1 = await capturar_aba(page, "PAX - TM", "PAX_TM", pasta_saida=pasta_saida)
        caminho_2 = await capturar_aba(page, "R$KM", "R$,KM", pasta_saida=pasta_saida)
        
        # ---------------------------------------------------------
        # A VERIFICAÇÃO DO CRACHÁ DA RECEITA
        # ---------------------------------------------------------
        if cenario.get("capturar_receita") == True:
            print(f"[Worker {worker_id}] -> Fui o escolhido! Capturando a Receita Financeira...")
            caminho_3 = await capturar_aba(page, "Receita", "Receita_Financeira", pasta_saida=pasta_saida)
        else:
            print(f"[Worker {worker_id}] -> Ignorando aba de Receita (já capturada anteriormente).")
            caminho_3 = None # Fica vazio

        caminho_4 = await capturar_aba(page, "ASK - LF", "ASK_LF", pasta_saida=pasta_saida)
        
        await page.get_by_role("tab", name="PAX - TM").click()

        # ---------------------------------------------------------
        # EMPACOTANDO AS IMAGENS COM SEGURANÇA
        # ---------------------------------------------------------
        # Colocamos as imagens que sempre vão existir na nossa sacola
        imagens_atuais = [caminho_1, caminho_2]
        
        # Se a Receita tiver sido capturada (não é None), adicionamos ela!
        if caminho_3:
            imagens_atuais.append(caminho_3)
            
        # Por fim, adicionamos a última aba
        imagens_atuais.append(caminho_4)

        # Adiciona as imagens deste cenário na lista principal do worker
        imagens_deste_worker.extend(imagens_atuais)

        # Progresso granular: incrementa contador compartilhado
        if shared_progress is not None:
            async with shared_progress["lock"]:
                shared_progress["atual"] += 1
                pct = 20 + int((shared_progress["atual"] / total_cenarios) * 55)
                log_progress(pct, f"Extraindo {shared_progress['atual']}/{total_cenarios} cenários...")

    # O Worker fecha a própria aba, mas NÃO salva o auth.json para evitar erro
    await context.close()
    print(f"[Worker {worker_id}] Missão cumprida!")
    
    return imagens_deste_worker

# ---------------------------------------------------------
# 2. O MAESTRO (Função Principal)
# ---------------------------------------------------------
def copiar_imagens_para_destino(lista_imagens: list, temp_dir: str, pasta_destino: str) -> list:
    imagens_copiadas = []
    os.makedirs(pasta_destino, exist_ok=True)

    for imagem in lista_imagens:
        if not os.path.exists(imagem):
            continue
        caminho_relativo = os.path.relpath(imagem, temp_dir)
        destino = os.path.join(pasta_destino, caminho_relativo)
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        shutil.copy2(imagem, destino)
        imagens_copiadas.append(destino)

    return imagens_copiadas

async def run(playwright: Playwright, incluir_share: bool = True, headless: bool = True, num_workers: int = 2) -> dict:
    # ⚠️ Dica de ouro: Tentar rodar 5 Power BIs com headless=False (janela visível) 
    # pode travar sua máquina. Sugiro fortemente usar headless=True para paralelismo!
    # ---------------------------------------------------------
    # INICIALIZAÇÃO BLINDADA DO NAVEGADOR
    # ---------------------------------------------------------
    browser = await playwright.chromium.launch(
        headless=headless,
        args=[
            "--window-size=1920,1080",
            "--use-gl=angle",
            "--lang=pt-BR",
        ],
    )

    # --------- Seleção de mercado ---------
    # ---------------------------------------------------------
    # A LISTA DE MISSÕES DO ROBÔ (Cenários Evoluídos)
    # ---------------------------------------------------------
    # Imagine que temos 10 cenários aqui
    todos_cenarios = [
        {"nome_pasta": "TODOS", "filtros": [
            {"pai": "Selecionar tudo", "filhos": None}]},
        {"nome_pasta": "SAOxRIO", "filtros": [
            {"pai": "SAO PAULO - RIO DE JANEIRO", "filhos": None},
            {"pai": "WEMOBI", "filhos": None}]},
        {"nome_pasta": "SAOxBHZ", "filtros": [
            {"pai": "SAO PAULO - BELO HORIZONTE", "filhos": None}]},
        {"nome_pasta": "BHZxRIO", "filtros": [
            {"pai": "BELO HORIZONTE - RIO DE JANEIRO", "filhos": None}]},
        {"nome_pasta": "SAOxCTB", "filtros": [
            {"pai": "SAO PAULO - CURITIBA", "filhos": None}]},
        {"nome_pasta": "CTBxFLN", "filtros": [
            {"pai": "CURITIBA - LITORAL SC", "filhos": None},
            {"pai": "OUTROS MERCADOS", "filhos": [r"CURITIBA \(PR\) - FLORIANOPOLIS \(SC\) DIRETO"]}]},
        {"nome_pasta": "SAOxFLN", "filtros": [
            {"pai": "SP - FLORIANOPOLIS", "filhos": None},
            {"pai": "SP - LITORAL SC", "filhos": None}]},
        {"nome_pasta": "SAOxRAO", "filtros": [
            {"pai": "SAO PAULO - RIBEIRAO PRETO", "filhos": None},
            {"pai": "RAPIDO R. PRETO", "filhos": None}]},
        {"nome_pasta": "SAOxSRJ", "filtros": [
            {"pai": "SAO PAULO - SAO JOSE DO RIO PRETO", "filhos": None}]},
        {"nome_pasta": "SAOxFRC", "filtros": [
            {"pai": "SAO PAULO - FRANCA", "filhos": None}]},
    ]

    # ---------------------------------------------------------
    # O TRUQUE DA RECEITA ÚNICA
    # ---------------------------------------------------------
    # Por padrão, avisamos a todos os cenários para NÃO pegarem a receita
    for cenario in todos_cenarios:
        cenario["capturar_receita"] = False
        
    # Mas damos a ordem exclusiva APENAS para o primeiríssimo cenário da lista!
    todos_cenarios[0]["capturar_receita"] = True

    # ---------------------------------------------------------
    # DISTRIBUIÇÃO INTELIGENTE DE CARGA (Load Balancing)
    # ---------------------------------------------------------
    
    # ---------------------------------------------------------
    # DISTRIBUIÇÃO SEQUENCIAL (Garante a ordem do PPT!)
    # ---------------------------------------------------------
    NUMERO_DE_WORKERS = num_workers
    
    # A matemática calcula: Se tenho 10 cenários e quero 3 workers, o chunk ideal é 4.
    tamanho_chunk = math.ceil(len(todos_cenarios) / NUMERO_DE_WORKERS)
    
    # Fatiamento em blocos contínuos. Ex: [0, 1, 2], [3, 4, 5], [6, 7, 8]
    chunks = [todos_cenarios[i:i + tamanho_chunk] for i in range(0, len(todos_cenarios), tamanho_chunk)]

    # ---------------------------------------------------------
    # PROGRESSO COMPARTILHADO ENTRE WORKERS
    # ---------------------------------------------------------
    total_cenarios = len(todos_cenarios)
    shared_progress = {"atual": 0, "lock": asyncio.Lock()}
    
    log_progress(20, f"Iniciando extração de {total_cenarios} cenários com {len(chunks)} workers...")
    
    # ---------------------------------------------------------
    # PASTA TEMPORÁRIA PARA AS PRINTS
    # ---------------------------------------------------------
    temp_dir = tempfile.mkdtemp(prefix="wow_screenshots_")
    print(f"Pastas de screenshots serão criadas em: {temp_dir}")
    
    # ---------------------------------------------------------
    # LARGADA DOS WORKERS
    # ---------------------------------------------------------
    print(f"Preparando {len(chunks)} workers para trabalhar em paralelo...")
    tarefas_workers = []
    
    for i, chunk in enumerate(chunks):
        tarefa = worker_extracao(
            worker_id=i+1, browser=browser, playwright=playwright,
            cenarios_do_worker=chunk,
            shared_progress=shared_progress, total_cenarios=total_cenarios,
            temp_dir=temp_dir
        )
        tarefas_workers.append(tarefa)

    # ---------------------------------------------------------
    # A MÁGICA DA CONCORRÊNCIA ACONTECE AQUI
    # ---------------------------------------------------------
    print("Dando o tiro de largada! Aguarde...")
    
    # O asyncio.gather executa todos os workers EXACTAMENTE ao mesmo tempo.
    # O código vai parar nesta linha até que os 5 workers devolvam o 'return'.
    resultados_brutos = await asyncio.gather(*tarefas_workers)
    
    # Como cada worker retorna uma lista, 'resultados_brutos' será uma lista de listas:
    # [ [img1, img2], [img3, img4], [img5, img6]... ]
    
    # Vamos "achatar" tudo em uma lista só para mandar pro PowerPoint
    todas_imagens_final = []
    for lista_do_worker in resultados_brutos:
        todas_imagens_final.extend(lista_do_worker)

    # --------------------- Fechando o navegador ---------------------
    await browser.close()

    # --------- Geração do PPTX Final ---------
    log_progress(80, "Workers finalizaram! Montando apresentação...")
    data_hoje = datetime.now().strftime("%d.%m.%Y")
    
    pasta_destino = GLOBAL_PARAMS.get('pasta_saida', '')
    if not pasta_destino:
        pasta_destino = r"C:\Users\guilherme.felix\Downloads\01_TRABALHO_JCA\Apresentacoes\WoW"
        if not os.path.exists(r"C:\Users\guilherme.felix\Downloads\01_TRABALHO_JCA\Apresentacoes"):
            pasta_destino = os.path.join(os.path.expanduser("~"), "Documents", "WoW")
            
    os.makedirs(pasta_destino, exist_ok=True)
    arquivo_final = os.path.join(pasta_destino, f"Apresentação WoW - {data_hoje}.pptx")
    
    acao = GLOBAL_PARAMS.get('acao', 'completo')
    if acao == 'download_imagens':
        imagens_copiadas = copiar_imagens_para_destino(todas_imagens_final, temp_dir, pasta_destino)
        log_progress(100, f"{len(imagens_copiadas)} imagens baixadas na pasta {pasta_destino}.")
        shutil.rmtree(temp_dir, ignore_errors=True)
        return resultado_automacao(
            arquivo_principal=imagens_copiadas[0] if imagens_copiadas else None,
            arquivos_saida=imagens_copiadas,
            pasta_final=pasta_destino,
            mensagem=f"{len(imagens_copiadas)} imagens WoW geradas."
        )

    gerar_apresentacao(todas_imagens_final, arquivo_final, incluir_share)
    
    log_progress(95, "Limpando prints temporários...")
    shutil.rmtree(temp_dir, ignore_errors=True)
    return resultado_automacao(
        arquivo_principal=arquivo_final,
        arquivos_saida=[arquivo_final],
        pasta_final=pasta_destino,
        mensagem="Apresentação WoW criada com sucesso."
    )

# Rodar o programa
async def main() -> dict:
    params = get_params()
    
    acao = params.get('acao', 'completo')
    incluir_share = params.get('share_canais', True)
    semanas_wow = params.get('semanas_wow', ['1', '2', '3', '4'])
    headless = params.get('headless', True)
    user_id = params.get('user_id')
    servico_credencial = params.get('servico_credencial', 'Power BI WoW')
    pasta_imagens = params.get('pasta_imagens', '')
    num_workers = params.get('num_workers', 2)
    
    email, senha = '', ''
    if user_id and servico_credencial:
        email, senha = buscar_credencial_site(int(user_id), servico_credencial)
        if not email or not senha:
            log_progress(100, f"ERRO: Credenciais '{servico_credencial}' não encontradas no cofre.")
            raise Exception(f"Credenciais '{servico_credencial}' não encontradas no cofre.")
    
    global GLOBAL_PARAMS
    GLOBAL_PARAMS = {
        'semanas': semanas_wow,
        'email': email,
        'senha': senha,
        'acao': acao,
        'pasta_saida': params.get('pasta_saida', '')
    }

    if acao == 'apenas_renovar':
        log_progress(10, "Iniciando processo de renovação de login (Automático se houver credenciais).")
        auth_path = os.path.join(os.path.dirname(__file__), "auth.json")
        async with async_playwright() as playwright:
            manual_browser = await playwright.chromium.launch(
                headless=False,
                args=["--window-size=1280,800"]
            )
            manual_context = await manual_browser.new_context(locale="pt-BR")
            manual_page = await manual_context.new_page()
            await manual_page.goto(URL_POWERBI, wait_until="domcontentloaded", timeout=60000)
            
            if not email or not senha:
                log_progress(10, "Credenciais vazias! Faça o login manualmente. Aguardando até 120s...")
                try:
                    await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=120000)
                except Exception:
                    pass
            else:
                try:
                    await efetuar_login_microsoft(manual_page, email, senha)
                except Exception as e:
                    log_progress(10, f"Erro no login automático: {e}. Faça o login manualmente.")
                    try:
                        await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=60000)
                    except Exception:
                        pass
                        
            try:
                await manual_page.wait_for_selector('.explore-canvas', state='visible', timeout=10000)
                await manual_context.storage_state(path=auth_path)
                log_progress(100, "Login concluído! Sessão salva em auth.json.")
            except Exception as e:
                log_progress(100, f"Falha ao salvar sessão ({e}).")
                raise
            finally:
                await manual_context.close()
                await manual_browser.close()
        return resultado_automacao(
            pasta_final=os.path.dirname(auth_path),
            mensagem="Login concluído e sessão salva em auth.json."
        )

    if acao == 'apenas_apresentacao':
        log_progress(10, "Modo: apenas criar apresentação a partir de imagens existentes")
        if not pasta_imagens or not os.path.isdir(pasta_imagens):
            pasta_imagens = os.path.join(os.path.expanduser("~"), "Downloads", "Imagens apresentação WoW")
            if not os.path.isdir(pasta_imagens):
                raise Exception("Nenhuma pasta de imagens encontrada. Selecione uma pasta com imagens .png.")
        todas_imagens = []
        for root, dirs, files in os.walk(pasta_imagens):
            for f in sorted(files):
                if f.lower().endswith('.png'):
                    todas_imagens.append(os.path.join(root, f))
        if not todas_imagens:
            raise Exception(f"Nenhuma imagem .png encontrada em: {pasta_imagens}")
        log_progress(50, f"Encontradas {len(todas_imagens)} imagens para a apresentação.")
        data_hoje = datetime.now().strftime("%d.%m.%Y")
        pasta_destino = GLOBAL_PARAMS.get('pasta_saida', '')
        if not pasta_destino:
            pasta_destino = r"C:\Users\guilherme.felix\Downloads\01_TRABALHO_JCA\Apresentacoes\WoW"
            if not os.path.exists(r"C:\Users\guilherme.felix\Downloads\01_TRABALHO_JCA\Apresentacoes"):
                pasta_destino = os.path.join(os.path.expanduser("~"), "Documents", "WoW")
        os.makedirs(pasta_destino, exist_ok=True)
        arquivo_final = os.path.join(pasta_destino, f"Apresentação WoW - {data_hoje}.pptx")
        gerar_apresentacao(todas_imagens, arquivo_final, incluir_share)
        log_progress(100, "Apresentação criada com sucesso!")
        return resultado_automacao(
            arquivo_principal=arquivo_final,
            arquivos_saida=[arquivo_final],
            pasta_final=pasta_destino,
            mensagem="Apresentação WoW criada a partir de imagens existentes."
        )

    log_progress(10, f"Iniciando Apresentação WoW - Modo: {acao}")
    async with async_playwright() as playwright:
        resultado = await run(playwright, incluir_share, headless, num_workers)
    log_progress(100, "Processo finalizado com sucesso!")
    return resultado

if __name__ == "__main__":
    publicar_resultado(asyncio.run(main()))
