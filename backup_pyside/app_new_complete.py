# app_flet_mica_sidebar.py

import flet as ft # type: ignore
import calendar
import threading
from datetime import datetime, timedelta
import time

from core.banco import (inicializar_env, configurar_banco, 
                        login_principal, cadastrar_usuario_principal, 
                        adicionar_credencial_site, buscar_credencial_site, 
                        verificar_senha_mestra, listar_onibus,
                        salvar_onibus, inicializar_onibus_padrao) # type: ignore 
from automacoes.adm_new import executar_adm
from automacoes.ebus_new import executar_ebus # type: ignore
from automacoes.sr_new import executar_sr
from automacoes.paxcalc import calculadora_elasticidade_pax, get_capacidade
import json
import os

ADM_INICIO = "01/01/2026"
ADM_FIM = "31/12/2026"

hoje = datetime.now()
EBUS_INICIO = f"01/{hoje.month:02d}/{hoje.year}"
mes_futuro = hoje.month + 4
ano_futuro = hoje.year
if mes_futuro > 12:
    mes_futuro -= 12
    ano_futuro += 1
ultimo_dia_mes = calendar.monthrange(ano_futuro, mes_futuro)[1]
EBUS_FIM = f"{ultimo_dia_mes}/{mes_futuro:02d}/{ano_futuro}"

SR_INI = (datetime.now() - timedelta(days=1)).strftime("%d/%m/%Y")
SR_FIM = datetime.now().strftime("%d/%m/%Y")

def main(page: ft.Page):
    # Inicializa as dependências do banco antes de carregar a UI
    inicializar_env()
    configurar_banco()
    inicializar_onibus_padrao()

    page.title = "Sistema de Automações - Flet Premium Glass"
    page.window.width = 1200
    page.window.height = 800
    page.window.min_width = 450
    page.window.min_height = 600
    
    # Persistência de tema
    prefs_file = "app_prefs.json"
    def load_prefs():
        if os.path.exists(prefs_file):
            with open(prefs_file, "r") as f: return json.load(f)
        return {"theme_mode": "dark"}

    def save_pref(key, value):
        prefs = load_prefs()
        prefs[key] = value
        with open(prefs_file, "w") as f: json.dump(prefs, f)

    saved_theme = load_prefs().get("theme_mode", "dark")
    page.theme_mode = ft.ThemeMode.DARK if saved_theme == "dark" else ft.ThemeMode.LIGHT
    page.padding = 0

    page.fonts = {
        "Lexend": "https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;600;700&display=swap"
    }
    page.theme = ft.Theme(font_family="Lexend")
    
    try:
        import asyncio
        asyncio.create_task(page.window.center())
    except:
        pass

    def get_light_colors():
        if page.theme_mode == ft.ThemeMode.DARK:
            return {
                "luz1": ft.Colors.BLUE_700, "luz2": ft.Colors.GREEN_700, 
                "op1": 0.3, "op2": 0.22, "bg": "#020202"
            }
        else:
            return {
                "luz1": ft.Colors.RED_500, "luz2": ft.Colors.INDIGO_400, 
                "op1": 0.25, "op2": 0.2, "bg": "#F9FAFF"
            }

    conf_luz = get_light_colors()

    luz_azul = ft.Container(
        gradient=ft.RadialGradient(
            center=ft.Alignment(-0.7, -0.7),
            radius=1.5,
            colors=[ft.Colors.with_opacity(conf_luz["op1"], conf_luz["luz1"]), ft.Colors.TRANSPARENT],
            stops=[0.2, 1.0]
        ),
        left=0, top=0, right=0, bottom=0,
        animate=ft.Animation(5000, ft.AnimationCurve.EASE_IN_OUT)
    )
    luz_verde = ft.Container(
        gradient=ft.RadialGradient(
            center=ft.Alignment(0.7, 0.7),
            radius=1.5,
            colors=[ft.Colors.with_opacity(conf_luz["op2"], conf_luz["luz2"]), ft.Colors.TRANSPARENT],
            stops=[0.2, 1.0]
        ),
        left=0, top=0, right=0, bottom=0,
        animate=ft.Animation(5000, ft.AnimationCurve.EASE_IN_OUT)
    )

    bg_sólido = ft.Container(bgcolor=conf_luz["bg"], left=0, right=0, top=0, bottom=0, animate=ft.Animation(600, "decelerate"))

    camada_fundo = ft.Stack([
        bg_sólido,
        luz_azul,
        luz_verde
    ], left=0, right=0, top=0, bottom=0)

    camada_conteudo = ft.Container(
        left=0, right=0, top=0, bottom=0,
        animate_opacity=400,
        animate_scale=ft.Animation(400, ft.AnimationCurve.DECELERATE)
    )

    layout_principal = ft.Stack(
        controls=[camada_fundo, camada_conteudo], 
        expand=True
    )
    
    def animar_fundo():
        posicoes = [
            ((-0.7, -0.7), (0.7, 0.7), 1.6),
            ((-0.4, -0.8), (0.4, 0.8), 1.4),
            ((-0.8, -0.4), (0.8, 0.4), 1.7),
            ((-0.6, -0.6), (0.6, 0.6), 1.5),
            ((-0.5, -0.9), (0.5, 0.9), 1.7),
            ((-0.9, -0.5), (0.9, 0.5), 1.4),
        ]
        idx = 0
        while True:
            try:
                p1, p2, rad = posicoes[idx]
                luz_azul.gradient.center = ft.Alignment(p1[0], p1[1])
                luz_verde.gradient.center = ft.Alignment(p2[0], p2[1])
                luz_azul.gradient.radius = rad
                luz_verde.gradient.radius = rad
                luz_azul.update()
                luz_verde.update()
                
                time.sleep(5)
                idx = (idx + 1) % len(posicoes)
            except:
                break

    def toggle_theme(e):
        page.theme_mode = ft.ThemeMode.LIGHT if page.theme_mode == ft.ThemeMode.DARK else ft.ThemeMode.DARK
        save_pref("theme_mode", "dark" if page.theme_mode == ft.ThemeMode.DARK else "light")
        
        conf = get_light_colors()
        bg_sólido.bgcolor = conf["bg"]
        luz_azul.gradient.colors = [ft.Colors.with_opacity(conf["op1"], conf["luz1"]), ft.Colors.TRANSPARENT]
        luz_verde.gradient.colors = [ft.Colors.with_opacity(conf["op2"], conf["luz2"]), ft.Colors.TRANSPARENT]
        
        if camada_conteudo.content:
            reaplicar_estilos_recursivo(camada_conteudo.content, page.theme_mode)
        
        for ctrl in page.overlay:
            reaplicar_estilos_recursivo(ctrl, page.theme_mode)
        
        nova_icon_color = ft.Colors.AMBER_400 if page.theme_mode == ft.ThemeMode.DARK else ft.Colors.INDIGO_400
        try:
            btn_tema.icon_color = nova_icon_color
        except: pass
            
        page.update()

    def reaplicar_estilos_recursivo(control, mode):
        is_dark = mode == ft.ThemeMode.DARK
        txt_p = ft.Colors.WHITE if is_dark else "#1A1A1A"
        txt_s = ft.Colors.WHITE54 if is_dark else "#555555"
        txt_t = ft.Colors.WHITE38 if is_dark else "#888888" 
        card_bg = ft.Colors.with_opacity(0.15 if is_dark else 0.4, ft.Colors.BLACK if is_dark else ft.Colors.WHITE)
        input_bg = ft.Colors.with_opacity(0.25 if is_dark else 0.1, ft.Colors.BLACK if is_dark else ft.Colors.BLACK)
        border_c = ft.Colors.with_opacity(0.15 if is_dark else 0.12, ft.Colors.WHITE if is_dark else ft.Colors.BLACK)

        accents_dark_to_light = {
            ft.Colors.BLUE_300: ft.Colors.BLUE_700,
            ft.Colors.GREEN_300: ft.Colors.GREEN_700,
            ft.Colors.ORANGE_300: ft.Colors.ORANGE_700,
            ft.Colors.CYAN_300: ft.Colors.CYAN_700,
            ft.Colors.CYAN_200: ft.Colors.CYAN_800,
            ft.Colors.AMBER_400: ft.Colors.AMBER_800,
            ft.Colors.RED_400: ft.Colors.RED_700,
            ft.Colors.GREEN_400: ft.Colors.GREEN_700,
            ft.Colors.CYAN_100: ft.Colors.CYAN_800,
            ft.Colors.ORANGE_400: ft.Colors.ORANGE_700,
            ft.Colors.BLUE_200: ft.Colors.BLUE_700,
            ft.Colors.INDIGO_400: ft.Colors.INDIGO_700,
            ft.Colors.GREEN_900: ft.Colors.GREEN_700,
            ft.Colors.CYAN_900: ft.Colors.CYAN_700,
        }
        accents_light_to_dark = {v: k for k, v in accents_dark_to_light.items()}

        def get_accent(c):
            if is_dark:
                return accents_light_to_dark.get(c, c)
            else:
                return accents_dark_to_light.get(c, c)
        
        def _tag(ctrl, prop, valor_original):
            tag_key = f"_theme_{prop}"
            if not hasattr(ctrl, '_theme_tags'):
                ctrl._theme_tags = {}
            if tag_key not in ctrl._theme_tags:
                ctrl._theme_tags[tag_key] = valor_original
            return ctrl._theme_tags[tag_key]

        def _get_tag(ctrl, prop):
            if hasattr(ctrl, '_theme_tags'):
                return ctrl._theme_tags.get(f"_theme_{prop}")
            return None

        if isinstance(control, ft.AlertDialog):
            control.bgcolor = ft.Colors.with_opacity(0.98, "#0A0A12" if is_dark else "#F0F0F5")

        if isinstance(control, ft.Container):
            # AQUI Sincronizamos as mesmas cores que usamos na criação dos cards!
            if hasattr(control, "data") and isinstance(control.data, str) and control.data.startswith("glass_"):
                if control.data == "glass_panel_no_border":
                    control.bgcolor = ft.Colors.with_opacity(0.45 if is_dark else 0.6, ft.Colors.BLACK if is_dark else ft.Colors.WHITE)
                    control.border = None
                elif control.data == "glass_card":
                    control.bgcolor = ft.Colors.with_opacity(0.35 if is_dark else 0.4, ft.Colors.BLACK if is_dark else ft.Colors.WHITE)
                    control.border = ft.Border.all(1, ft.Colors.with_opacity(0.10 if is_dark else 0.4, ft.Colors.WHITE if is_dark else ft.Colors.BLACK))
                elif control.data == "glass_login":
                    control.bgcolor = ft.Colors.with_opacity(0.45 if is_dark else 0.6, ft.Colors.BLACK if is_dark else ft.Colors.WHITE)
                    control.border = ft.Border.all(1, ft.Colors.with_opacity(0.15 if is_dark else 0.3, ft.Colors.WHITE if is_dark else ft.Colors.BLACK))
                
                if control.shadow and isinstance(control.shadow, ft.BoxShadow):
                    control.shadow.color = ft.Colors.with_opacity(0.4 if is_dark else 0.1, ft.Colors.BLACK)
            
            elif hasattr(control, "blur") and control.blur:
                control.bgcolor = card_bg
                control.border = ft.Border.all(1, border_c)
                if control.shadow and isinstance(control.shadow, ft.BoxShadow):
                    control.shadow.color = ft.Colors.with_opacity(0.6 if is_dark else 0.08, ft.Colors.BLACK)
            
            elif control.bgcolor:
                orig_bg = _tag(control, 'bgcolor', control.bgcolor)
                orig_str = str(orig_bg).lower()
                
                if any(x in orig_str for x in ["#1a1a2e", "#0a0a12", "#10101a"]):
                    control.bgcolor = "#1a1a2e" if is_dark else "#EDEDF2"
                elif any(x in orig_str for x in ["0.9,", "0.95", "0.98"]):
                    control.bgcolor = ft.Colors.with_opacity(0.95, "#10101A" if is_dark else "#FAFAFF")
                elif any(x in orig_str for x in ["cyan_900", "cyan_800", "green_900"]):
                    if is_dark:
                        control.bgcolor = orig_bg 
                    else:
                        if "cyan" in orig_str:
                            control.bgcolor = ft.Colors.with_opacity(0.12, ft.Colors.CYAN_600)
                        elif "green" in orig_str:
                            control.bgcolor = ft.Colors.with_opacity(0.12, ft.Colors.GREEN_600)
                elif any(f"0.{x}" in orig_str for x in ["04", "05", "1,", "10", "12", "15", "2,", "20"]):
                    op_val = 0.1
                    for op in ["0.04", "0.05", "0.12", "0.15", "0.1", "0.2"]:
                        if op in orig_str:
                            op_val = float(op)
                            break
                    base_c = ft.Colors.WHITE if is_dark else ft.Colors.BLACK
                    control.bgcolor = ft.Colors.with_opacity(op_val, base_c)
                else:
                    control.bgcolor = get_accent(orig_bg)

            if control.border and not (hasattr(control, "blur") and control.blur) and not (hasattr(control, "data") and isinstance(control.data, str) and control.data.startswith("glass_")):
                orig_border = _tag(control, 'border', 'themed')
                if any(x in str(_get_tag(control, 'border') or '').lower() for x in ['cyan', 'green', 'blue', 'orange', 'amber', 'red']):
                    pass 
                else:
                    control.border = ft.Border.all(1, border_c)

        if isinstance(control, (ft.TextField, ft.Dropdown)):
            label_txt = str(getattr(control, "label", "") or "").lower()
            if isinstance(control, ft.Dropdown) and label_txt in ["tipo de ônibus", "ação", "acao", "período", "periodo", "base da automação", "base da automacao"]:
                control.bgcolor = ft.Colors.with_opacity(0.95 if is_dark else 1.0, "#111522" if is_dark else "#FFFFFF")
            else:
                control.bgcolor = input_bg
            control.border_color = border_c
            control.label_style = ft.TextStyle(color=txt_s)
            control.color = txt_p
            if hasattr(control, "prefix_icon_color"): control.prefix_icon_color = txt_s

        if isinstance(control, ft.Icon):
            orig_color = _tag(control, 'color', control.color)
            neutral_cols = [ft.Colors.WHITE, ft.Colors.WHITE54, ft.Colors.WHITE38, 
                          ft.Colors.WHITE24, ft.Colors.BLACK, ft.Colors.BLACK54, 
                          "#1A1A1A", "#0B0B0B", "#666666", "#555555", "#888888", None]
            if orig_color in neutral_cols:
                control.color = txt_p if (control.size and control.size > 30) else txt_s
            else:
                control.color = get_accent(orig_color)

        if isinstance(control, ft.Text):
            orig_color = _tag(control, 'color', control.color)
            primary_neutrals = [ft.Colors.WHITE, ft.Colors.BLACK, None]
            secondary_neutrals = [ft.Colors.WHITE54, ft.Colors.WHITE70, ft.Colors.BLACK54, 
                                  "#1A1A1A", "#0B0B0B", "#666666", "#555555"]
            tertiary_neutrals = [ft.Colors.WHITE38, ft.Colors.WHITE30, ft.Colors.WHITE24, 
                                ft.Colors.WHITE12, ft.Colors.WHITE10, "#888888", "black87"]
            
            # Se for nossa cor mágica (usada pra não deixar o flet inverter), não fazemos nada!
            if orig_color == "#000001":
                pass
            elif orig_color in primary_neutrals:
                control.color = txt_p if (control.weight == ft.FontWeight.BOLD or (control.size and control.size >= 16)) else txt_s
            elif orig_color in secondary_neutrals:
                control.color = txt_s
            elif orig_color in tertiary_neutrals:
                control.color = txt_t
            else:
                control.color = get_accent(orig_color)
        
        if isinstance(control, (ft.Divider, ft.VerticalDivider)):
            control.color = ft.Colors.with_opacity(0.1, ft.Colors.WHITE if is_dark else ft.Colors.BLACK)

        if isinstance(control, (ft.Radio, ft.Checkbox)):
            if control.label_style: control.label_style.color = txt_p
            else: control.label_style = ft.TextStyle(color=txt_p)
        
        if isinstance(control, ft.IconButton):
            orig_color = _tag(control, 'icon_color', control.icon_color)
            neutral_cols = [ft.Colors.WHITE, ft.Colors.WHITE54, ft.Colors.WHITE38,
                          ft.Colors.WHITE24, ft.Colors.BLACK, ft.Colors.BLACK54,
                          "#1A1A1A", "#666666", "#555555", "#888888", None]
            if orig_color in neutral_cols:
                control.icon_color = txt_s
            elif orig_color not in [ft.Colors.AMBER_400, ft.Colors.INDIGO_400]:
                control.icon_color = get_accent(orig_color)

        # Navegação recursiva original
        if hasattr(control, "controls"):
            for c in control.controls: reaplicar_estilos_recursivo(c, mode)
        if hasattr(control, "content") and control.content:
            reaplicar_estilos_recursivo(control.content, mode)
        if isinstance(control, ft.AnimatedSwitcher):
            if control.content:
                reaplicar_estilos_recursivo(control.content, mode)

        # 🟢 NOVO: Navegação em "Telas Fantasmas" (Escondidas) para manter a sincronia de tema
        if hasattr(control, "_hidden_views") and control._hidden_views:
            for v in control._hidden_views:
                # Checa se já não é o conteúdo ativo para não fazer o processo 2 vezes à toa
                if getattr(control, "content", None) != v:
                    reaplicar_estilos_recursivo(v, mode)

    def mostrar_aviso(mensagem, cor="red900"):
        snack = ft.SnackBar(
            content=ft.Text(mensagem, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD), 
            bgcolor=cor
        )
        page.overlay.append(snack)
        snack.open = True
        page.update()

    is_dark = page.theme_mode == ft.ThemeMode.DARK
    glass_style_login = {
        "bgcolor": ft.Colors.with_opacity(0.45 if is_dark else 0.6, ft.Colors.BLACK if is_dark else ft.Colors.WHITE),
        "blur": ft.Blur(25, 25),
        "border": ft.Border.all(1, ft.Colors.with_opacity(0.15 if is_dark else 0.3, ft.Colors.WHITE if is_dark else ft.Colors.BLACK)),
        "border_radius": 30,
        "padding": 40,
        "shadow": ft.BoxShadow(spread_radius=0, blur_radius=25, color=ft.Colors.with_opacity(0.4 if is_dark else 0.1, ft.Colors.BLACK))
    }

    # --- TELAS DE LOGIN ---
    campo_usuario_login = ft.TextField(label="Usuário", prefix_icon=ft.Icons.PERSON, border_radius=15, width=320, bgcolor=ft.Colors.with_opacity(0.2 if is_dark else 0.1, ft.Colors.BLACK), border_color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE if is_dark else ft.Colors.BLACK), focused_border_color=ft.Colors.BLUE_300, color=ft.Colors.WHITE if is_dark else "#1A1A1A")
    campo_senha_login = ft.TextField(label="Senha", prefix_icon=ft.Icons.LOCK, password=True, can_reveal_password=True, border_radius=15, width=320, bgcolor=ft.Colors.with_opacity(0.2 if is_dark else 0.1, ft.Colors.BLACK), border_color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE if is_dark else ft.Colors.BLACK), focused_border_color=ft.Colors.BLUE_300, color=ft.Colors.WHITE if is_dark else "#1A1A1A")
    
    btn_entrar = ft.FilledButton(
        content=ft.Text("ENTRAR", weight=ft.FontWeight.BOLD), 
        width=320, height=50, 
        style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=30), bgcolor=ft.Colors.BLUE_700, color=ft.Colors.WHITE, elevation=10), 
    )
    
    def _on_login_theme_click(e):
        toggle_theme(e)
        btn_tema.icon = ft.Icons.WB_SUNNY_ROUNDED if page.theme_mode == ft.ThemeMode.DARK else ft.Icons.DARK_MODE_ROUNDED
        btn_tema.icon_color = ft.Colors.AMBER_400 if page.theme_mode == ft.ThemeMode.DARK else ft.Colors.INDIGO_400
        btn_tema.update()
    
    btn_tema = ft.IconButton(
        icon=ft.Icons.WB_SUNNY_ROUNDED if page.theme_mode == ft.ThemeMode.DARK else ft.Icons.DARK_MODE_ROUNDED,
        on_click=_on_login_theme_click,
        icon_color=ft.Colors.AMBER_400 if page.theme_mode == ft.ThemeMode.DARK else ft.Colors.INDIGO_400,
        tooltip="Trocar tema"
    )

    caixa_login = ft.Container(
        content=ft.Stack([
            ft.Column([
                ft.Icon(ft.Icons.ROCKET_LAUNCH_ROUNDED, size=70, color=ft.Colors.BLUE_300), 
                ft.Text("JCA Automações", size=26, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER), 
                ft.Container(height=20), 
                campo_usuario_login, campo_senha_login, ft.Container(height=10), btn_entrar, 
                ft.TextButton(content=ft.Text("Criar conta", color=ft.Colors.BLUE_200))
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
            ft.Container(content=btn_tema, right=0, top=0)
        ]), 
        **glass_style_login, margin=20, width=450, animate=ft.Animation(500, ft.AnimationCurve.DECELERATE), scale=1.0,
        data="glass_login"
    )
    
    campo_nome_cad = ft.TextField(label="Nome Completo", border_radius=15, width=320, bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK))
    campo_usuario_cad = ft.TextField(label="Usuário", border_radius=15, width=320, bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK))
    campo_senha_cad = ft.TextField(label="Senha", password=True, border_radius=15, width=320, bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK))
    
    btn_salvar_cad = ft.FilledButton(
        content=ft.Text("CADASTRAR", weight=ft.FontWeight.BOLD), 
        width=320, height=50, 
        style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=30), bgcolor=ft.Colors.GREEN_700, color=ft.Colors.WHITE)
    )
    
    caixa_cadastro = ft.Container(
        content=ft.Column([
            ft.Icon(ft.Icons.PERSON_ADD_ROUNDED, size=60, color=ft.Colors.GREEN_300), 
            ft.Text("Novo Operador", size=24, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE), 
            ft.Container(height=10), campo_nome_cad, campo_usuario_cad, campo_senha_cad, ft.Container(height=10), btn_salvar_cad, 
            ft.TextButton(content=ft.Text("Voltar", color=ft.Colors.GREY_300))
        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER), 
        **glass_style_login, margin=20, width=450, animate=ft.Animation(500, ft.AnimationCurve.DECELERATE), scale=1.0,
        data="glass_login"
    )

    def tentar_login(e):
        caixa_login.scale = 0.97
        caixa_login.update()
        def _restaurar_scale():
            caixa_login.scale = 1.0
            try: caixa_login.update()
            except: pass
        threading.Timer(0.1, _restaurar_scale).start()
        
        id_logado, nome = login_principal(campo_usuario_login.value, campo_senha_login.value)
        if id_logado: mostrar_dashboard(id_logado, nome)
        else: mostrar_aviso("Usuário ou senha incorretos.")

    def tentar_cadastro(e):
        if cadastrar_usuario_principal(campo_nome_cad.value, campo_usuario_cad.value, campo_senha_cad.value):
            mostrar_aviso("Cadastro realizado! Faça login.", "green800")
            ir_para_login()

    def ir_para_cadastro(e):
        camada_conteudo.opacity = 0
        camada_conteudo.scale = 0.95
        camada_conteudo.update()
        camada_conteudo.content = ft.Column([caixa_cadastro], alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)
        camada_conteudo.opacity = 1
        camada_conteudo.scale = 1.0
        camada_conteudo.update()

    def ir_para_login(e=None):
        reaplicar_estilos_recursivo(caixa_login, page.theme_mode)
        reaplicar_estilos_recursivo(caixa_cadastro, page.theme_mode)
        camada_conteudo.opacity = 0
        camada_conteudo.scale = 0.95
        camada_conteudo.update()
        camada_conteudo.content = ft.Column([caixa_login], alignment=ft.MainAxisAlignment.CENTER, horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)
        camada_conteudo.opacity = 1
        camada_conteudo.scale = 1.0
        camada_conteudo.update()

    btn_entrar.on_click = tentar_login
    campo_usuario_login.on_submit = tentar_login
    campo_senha_login.on_submit = tentar_login
    caixa_login.content.controls[0].controls[-1].on_click = ir_para_cadastro
    btn_salvar_cad.on_click = tentar_cadastro
    caixa_cadastro.content.controls[-1].on_click = ir_para_login
    
    if page.theme_mode == ft.ThemeMode.LIGHT:
        reaplicar_estilos_recursivo(caixa_login, page.theme_mode)
        reaplicar_estilos_recursivo(caixa_cadastro, page.theme_mode)

    # =======================================================
    # DASHBOARD
    # =======================================================
    def mostrar_dashboard(id_logado, nome_usuario):
        page.overlay.clear()
        is_dark_dash = page.theme_mode == ft.ThemeMode.DARK

        
        # =======================================================
        # ESTILO DOS CARDS
        # =======================================================
        opacidade_bg = 0.35 if is_dark_dash else 0.4 
        cor_base = ft.Colors.BLACK if is_dark_dash else ft.Colors.WHITE
        opacidade_borda = 0.10 if is_dark_dash else 0.4
        cor_borda = ft.Colors.WHITE if is_dark_dash else ft.Colors.BLACK

        glass_card_style = {
            "bgcolor": ft.Colors.with_opacity(opacidade_bg, cor_base),
            "blur": ft.Blur(30, 30),
            "border": ft.Border.all(1, ft.Colors.with_opacity(opacidade_borda, cor_borda)),
            "border_radius": 28,
            "shadow": ft.BoxShadow(spread_radius=0, blur_radius=20, color=ft.Colors.with_opacity(0.3 if is_dark_dash else 0.1, ft.Colors.BLACK)),
            "animate": ft.Animation(400, ft.AnimationCurve.DECELERATE),
        }

        # --- COMPONENTES DOS CARDS ---
        def criar_card_robo(titulo, icone, descricao, cor_icone, func_robo, config_datas, modos_disponiveis=None):
            elementos_data = []
            modo_datas = "padrao"
            modo_periodo_personalizado = "padrao"
            info_resultado = {"arquivo": None, "pasta": None}

            modos_padrao = [
                ("Processo completo", "completo"),
                ("Apenas download", "download"),
                ("Download + tratamento", "download_tratamento"),
                ("Apenas tratamento", "tratamento"),
                ("Tratamento + envio", "tratamento_envio"),
                ("Arquivo externo: tratar", "arquivo_tratamento"),
                ("Arquivo externo: enviar", "arquivo_envio"),
                ("Arquivo externo: tratar + enviar", "arquivo_tratamento_envio"),
            ]
            if modos_disponiveis:
                mapa = {v: l for l, v in modos_padrao}
                modos = [(mapa[v], v) for v in modos_disponiveis if v in mapa]
            else:
                modos = modos_padrao

            def extrair_dia_mes(data_texto):
                try:
                    partes = data_texto.split("/")
                    return f"{partes[0]}/{partes[1]}"
                except Exception:
                    return data_texto

            coluna_datas_custom = ft.Column(visible=False, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER, animate_opacity=400)

            for config in config_datas:
                label = config["label"]
                p_ini = config["ini"]
                p_fim = config["fim"]

                c_ini = ft.TextField(label=f"Ini {label}", width=120, height=42, text_size=11, read_only=False, hint_text="dd/mm/aaaa", prefix_icon=ft.Icons.CALENDAR_MONTH, focused_border_color=cor_icone, value=p_ini)
                c_fim = ft.TextField(label=f"Fim {label}", width=120, height=42, text_size=11, read_only=False, hint_text="dd/mm/aaaa", prefix_icon=ft.Icons.CALENDAR_MONTH, focused_border_color=cor_icone, value=p_fim)

                dp_i = ft.DatePicker(on_change=lambda e, campo=c_ini: atualizar_campo_data(e, campo))
                dp_f = ft.DatePicker(on_change=lambda e, campo=c_fim: atualizar_campo_data(e, campo))
                page.overlay.extend([dp_i, dp_f])

                c_ini.on_click = lambda e, dp=dp_i: _abrir_calendario(dp)
                c_fim.on_click = lambda e, dp=dp_f: _abrir_calendario(dp)

                linha = ft.Row([c_ini, c_fim], alignment=ft.MainAxisAlignment.CENTER, spacing=8)
                coluna_datas_custom.controls.append(linha)
                elementos_data.append({"ini": c_ini, "fim": c_fim, "p_ini": p_ini, "p_fim": p_fim})

            def atualizar_campo_data(e, campo):
                if e.control.value:
                    campo.value = e.control.value.strftime("%d/%m/%Y")
                    campo.update()

            def _abrir_calendario(dp):
                dp.open = True
                page.update()

            pill = ft.Container(bgcolor=ft.Colors.WHITE, border_radius=25, width=88, height=32, left=4, top=4, animate_position=ft.Animation(400, ft.AnimationCurve.DECELERATE))
            txt_padrao_btn = ft.Text("Padrão", size=10, weight=ft.FontWeight.BOLD, color="#000001")
            txt_modificada_btn = ft.Text("Modificada", size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE70)
            txt_custom_btn = ft.Text("Personalizado", size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE70)

            segmented_control = ft.Container(
                bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE),
                border_radius=30,
                width=268,
                height=40,
                content=ft.Stack([
                    pill,
                    ft.Row([
                        ft.Container(content=txt_padrao_btn, expand=True, alignment=ft.Alignment.CENTER, on_click=lambda _: set_modo_data("padrao"), border_radius=30),
                        ft.Container(content=txt_modificada_btn, expand=True, alignment=ft.Alignment.CENTER, on_click=lambda _: set_modo_data("modificada"), border_radius=30),
                        ft.Container(content=txt_custom_btn, expand=True, alignment=ft.Alignment.CENTER, on_click=lambda _: set_modo_data("custom"), border_radius=30),
                    ], spacing=0),
                ]),
            )

            badges_preview = ft.Column(spacing=4, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
            for config in config_datas:
                prefix_label = f"{config['label']}: " if config["label"] else ""
                if config["ini"] != config["fim"]:
                    display_txt = f"{prefix_label}{extrair_dia_mes(config['ini'])} a {extrair_dia_mes(config['fim'])}"
                else:
                    display_txt = f"{prefix_label}{extrair_dia_mes(config['ini'])}"
                badges_preview.controls.append(
                    ft.Container(
                        content=ft.Text(display_txt, size=10, weight=ft.FontWeight.BOLD, color=cor_icone),
                        bgcolor=ft.Colors.with_opacity(0.12, cor_icone),
                        padding=ft.Padding(10, 2, 10, 2),
                        border_radius=10,
                        border=ft.Border.all(1, ft.Colors.with_opacity(0.2, cor_icone)),
                    )
                )

            display_padrao = ft.Column([
                ft.Text("Cronograma oficial da operação:", size=10, color=ft.Colors.WHITE38),
                badges_preview,
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8, animate_opacity=400)

            display_modificada = ft.Column([
                ft.Text("Período com datas ajustadas manualmente:", size=10, color=ft.Colors.WHITE38),
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8, animate_opacity=400, visible=False)

            dropdown_periodo_personalizado = ft.Dropdown(
                label="Período",
                options=[
                    ft.dropdown.Option("padrao", "Padrão"),
                    ft.dropdown.Option("especifico", "Específico"),
                ],
                value="padrao",
                width=260,
                height=45,
                text_size=11,
                focused_border_color=cor_icone,
                bgcolor=ft.Colors.with_opacity(0.95 if is_dark_dash else 1.0, "#111522" if is_dark_dash else "#FFFFFF"),
                on_select=lambda e: atualizar_visibilidade_personalizacao(),
            )

            dropdown_modo_execucao = ft.Dropdown(
                label="Ação",
                options=[ft.dropdown.Option(valor, texto) for texto, valor in modos],
                value=modos[0][1],
                width=260,
                height=45,
                text_size=11,
                focused_border_color=cor_icone,
                bgcolor=ft.Colors.with_opacity(0.95 if is_dark_dash else 1.0, "#111522" if is_dark_dash else "#FFFFFF"),
                on_select=lambda e: atualizar_visibilidade_personalizacao(),
            )

            dropdown_base_automacao = ft.Dropdown(
                label="Base da automação",
                options=[
                    ft.dropdown.Option("padrao", "Base padrão"),
                    ft.dropdown.Option("personalizada", "Escolher local"),
                ],
                value="padrao",
                width=260,
                height=45,
                text_size=11,
                focused_border_color=cor_icone,
                bgcolor=ft.Colors.with_opacity(0.95 if is_dark_dash else 1.0, "#111522" if is_dark_dash else "#FFFFFF"),
                on_select=lambda e: atualizar_visibilidade_personalizacao(),
            )

            linha_dropdown_periodo = ft.Row([dropdown_periodo_personalizado], alignment=ft.MainAxisAlignment.CENTER, spacing=6, visible=False)
            linha_dropdown_acao = ft.Row([dropdown_modo_execucao], alignment=ft.MainAxisAlignment.CENTER, spacing=6, visible=False)
            linha_dropdown_base = ft.Row([dropdown_base_automacao], alignment=ft.MainAxisAlignment.CENTER, spacing=6, visible=True)

            campo_pasta_destino = ft.TextField(
                label="Pasta de saída (opcional)",
                read_only=False,
                width=220,
                height=42,
                text_size=10,
                prefix_icon=ft.Icons.FOLDER_OPEN,
                hint_text="Digite ou selecione no explorador",
            )
            campo_arquivo_entrada = ft.TextField(
                label="Arquivo já baixado (opcional)",
                read_only=False,
                width=220,
                height=42,
                text_size=10,
                prefix_icon=ft.Icons.UPLOAD_FILE,
                hint_text="Digite ou selecione no explorador",
            )
            campo_base_automacao = ft.TextField(
                label="Pasta base da automação",
                read_only=False,
                width=220,
                height=42,
                text_size=10,
                prefix_icon=ft.Icons.DRIVE_FOLDER_UPLOAD,
                hint_text="Selecione onde está/ficará a base",
            )

            def selecionar_pasta_explorador(_):
                try:
                    import tkinter as tk
                    from tkinter import filedialog

                    root = tk.Tk()
                    root.withdraw()
                    root.attributes("-topmost", True)
                    caminho = filedialog.askdirectory(title="Selecionar pasta de saída")
                    root.destroy()

                    if caminho:
                        campo_pasta_destino.value = caminho
                        card.update()
                except Exception as ex:
                    mostrar_aviso(f"Falha ao abrir explorador de pasta: {str(ex)}", "red900")

            def selecionar_pasta_base_explorador(_):
                try:
                    import tkinter as tk
                    from tkinter import filedialog

                    root = tk.Tk()
                    root.withdraw()
                    root.attributes("-topmost", True)
                    caminho = filedialog.askdirectory(title="Selecionar pasta base da automação")
                    root.destroy()

                    if caminho:
                        campo_base_automacao.value = caminho
                        card.update()
                except Exception as ex:
                    mostrar_aviso(f"Falha ao abrir explorador de pasta: {str(ex)}", "red900")

            def selecionar_arquivo_explorador(_):
                try:
                    import tkinter as tk
                    from tkinter import filedialog

                    root = tk.Tk()
                    root.withdraw()
                    root.attributes("-topmost", True)
                    caminho = filedialog.askopenfilename(
                        title="Selecionar arquivo para processamento",
                        filetypes=[("Arquivos Excel", "*.xlsx;*.xls;*.xlsm"), ("Todos os arquivos", "*.*")],
                    )
                    root.destroy()

                    if caminho:
                        campo_arquivo_entrada.value = caminho
                        card.update()
                except Exception as ex:
                    mostrar_aviso(f"Falha ao abrir explorador de arquivo: {str(ex)}", "red900")

            btn_pasta = ft.IconButton(
                ft.Icons.CREATE_NEW_FOLDER,
                icon_size=18,
                icon_color=cor_icone,
                tooltip="Selecionar pasta no explorador",
                on_click=selecionar_pasta_explorador,
            )
            btn_arquivo = ft.IconButton(
                ft.Icons.ATTACH_FILE,
                icon_size=18,
                icon_color=cor_icone,
                tooltip="Selecionar arquivo no explorador",
                on_click=selecionar_arquivo_explorador,
            )
            btn_base = ft.IconButton(
                ft.Icons.FOLDER_SPECIAL,
                icon_size=18,
                icon_color=cor_icone,
                tooltip="Selecionar base da automação",
                on_click=selecionar_pasta_base_explorador,
            )
            btn_limpar_arquivo = ft.IconButton(ft.Icons.CLEAR_ROUNDED, icon_size=16, icon_color=ft.Colors.RED_300, tooltip="Limpar arquivo selecionado", on_click=lambda _: limpar_arquivo())
            btn_limpar_base = ft.IconButton(ft.Icons.CLEAR_ROUNDED, icon_size=16, icon_color=ft.Colors.RED_300, tooltip="Limpar base personalizada", on_click=lambda _: limpar_base())

            def limpar_arquivo():
                campo_arquivo_entrada.value = ""
                card.update()

            def limpar_base():
                campo_base_automacao.value = ""
                card.update()

            linha_pasta = ft.Row([campo_pasta_destino, btn_pasta], alignment=ft.MainAxisAlignment.CENTER, spacing=6, visible=False)
            linha_arquivo = ft.Row([campo_arquivo_entrada, btn_arquivo, btn_limpar_arquivo], alignment=ft.MainAxisAlignment.CENTER, spacing=4, visible=False)
            linha_base = ft.Row([campo_base_automacao, btn_base, btn_limpar_base], alignment=ft.MainAxisAlignment.CENTER, spacing=4, visible=False)

            def atualizar_cores_abas():
                is_dark_now = page.theme_mode == ft.ThemeMode.DARK
                inactive_c = ft.Colors.WHITE70 if is_dark_now else ft.Colors.BLACK54
                txt_padrao_btn.color = "#000001" if modo_datas == "padrao" else inactive_c
                txt_modificada_btn.color = "#000001" if modo_datas == "modificada" else inactive_c
                txt_custom_btn.color = "#000001" if modo_datas == "custom" else inactive_c

            def atualizar_visibilidade_personalizacao():
                nonlocal modo_periodo_personalizado

                is_padrao = modo_datas == "padrao"
                is_modificada = modo_datas == "modificada"
                is_personalizado = modo_datas == "custom"

                display_padrao.visible = is_padrao
                display_modificada.visible = is_modificada
                linha_dropdown_periodo.visible = is_personalizado
                linha_dropdown_acao.visible = is_personalizado

                if is_padrao:
                    coluna_datas_custom.visible = False
                elif is_modificada:
                    coluna_datas_custom.visible = True
                else:
                    modo_periodo_personalizado = dropdown_periodo_personalizado.value or "padrao"
                    coluna_datas_custom.visible = modo_periodo_personalizado == "especifico"

                modo_exec = "completo" if not is_personalizado else (dropdown_modo_execucao.value or "completo")
                if is_personalizado and modo_exec in {"tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_envio", "arquivo_tratamento_envio"} and (dropdown_periodo_personalizado.value or "padrao") == "padrao":
                    dropdown_periodo_personalizado.value = "especifico"
                    modo_periodo_personalizado = "especifico"
                    coluna_datas_custom.visible = True
                mostrar_arquivo = modo_exec in {"tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_envio", "arquivo_tratamento_envio"}
                mostrar_pasta = modo_exec in {"completo", "download", "download_tratamento", "tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_envio", "arquivo_tratamento_envio"}
                mostrar_base = modo_exec in {"completo", "download_tratamento", "tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_tratamento_envio"}

                linha_arquivo.visible = is_personalizado and mostrar_arquivo
                linha_pasta.visible = is_personalizado and mostrar_pasta
                linha_dropdown_base.visible = mostrar_base
                linha_base.visible = mostrar_base and (dropdown_base_automacao.value == "personalizada")

                atualizar_cores_abas()
                try:
                    card.update()
                except Exception:
                    pass

            def set_modo_data(modo):
                nonlocal modo_datas
                modo_datas = modo
                if modo == "padrao":
                    pill.left = 4
                elif modo == "modificada":
                    pill.left = 92
                else:
                    pill.left = 180
                atualizar_visibilidade_personalizacao()

            atualizar_visibilidade_personalizacao()

            area_config_inputs = ft.Column([
                segmented_control,
                display_padrao,
                display_modificada,
                coluna_datas_custom,
                linha_dropdown_periodo,
                linha_dropdown_acao,
                linha_dropdown_base,
                linha_pasta,
                linha_arquivo,
                linha_base,
            ], spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

            badges_datas = ft.Column(spacing=6, horizontal_alignment=ft.CrossAxisAlignment.CENTER, visible=False)

            texto_resultado = ft.Text("", size=10, color=ft.Colors.GREEN_300, visible=False, text_align=ft.TextAlign.CENTER)
            btn_abrir_arquivo = ft.TextButton("Abrir arquivo", visible=False)
            btn_abrir_pasta = ft.TextButton("Abrir local final", visible=False)

            def abrir_arquivo_final(_):
                caminho = info_resultado.get("arquivo")
                if caminho and os.path.exists(caminho):
                    os.startfile(caminho)
                else:
                    mostrar_aviso("Arquivo final não encontrado.", "red900")

            def abrir_pasta_final(_):
                pasta = info_resultado.get("pasta")
                if pasta and os.path.exists(pasta):
                    os.startfile(pasta)
                else:
                    mostrar_aviso("Pasta final não encontrada.", "red900")

            btn_abrir_arquivo.on_click = abrir_arquivo_final
            btn_abrir_pasta.on_click = abrir_pasta_final

            btn_text = ft.Text("RODAR ROBÔ", weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
            bg_progress = ft.ProgressBar(value=None, visible=False, color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE), bgcolor="transparent", height=50, border_radius=18)
            controle_robo = {"cancelar": False, "rodando": False}

            def disparar_cancelamento(_):
                controle_robo["cancelar"] = True
                btn_text.value = "PARANDO..."
                btn_infinite.disabled = True
                card.update()

            def limpar_saida_final():
                info_resultado["arquivo"] = None
                info_resultado["pasta"] = None
                texto_resultado.value = ""
                texto_resultado.visible = False
                btn_abrir_arquivo.visible = False
                btn_abrir_pasta.visible = False

            def disparar_automacao(_):
                modo_exec = "completo" if modo_datas in {"padrao", "modificada"} else (dropdown_modo_execucao.value or "completo")
                argumentos_finais = []
                badges_datas.controls.clear()

                for el in elementos_data:
                    if modo_datas == "padrao":
                        v_ini = el["p_ini"]
                        v_fim = el["p_fim"]
                    elif modo_datas == "modificada":
                        v_ini = el["ini"].value
                        v_fim = el["fim"].value
                    else:
                        periodo_personalizado = dropdown_periodo_personalizado.value or "padrao"
                        if periodo_personalizado == "padrao":
                            v_ini = el["p_ini"]
                            v_fim = el["p_fim"]
                        else:
                            v_ini = el["ini"].value
                            v_fim = el["fim"].value
                    argumentos_finais.extend([v_ini, v_fim])

                    lbl = el["ini"].label.replace("Ini ", "")
                    lbl_txt = f"{lbl}: " if lbl else ""
                    if v_ini != v_fim:
                        display_txt = f"{lbl_txt}{extrair_dia_mes(v_ini)} a {extrair_dia_mes(v_fim)}"
                    else:
                        display_txt = f"{lbl_txt}{extrair_dia_mes(v_ini)}"

                    badges_datas.controls.append(
                        ft.Container(
                            content=ft.Text(display_txt, size=11, weight=ft.FontWeight.BOLD, color=cor_icone),
                            bgcolor=ft.Colors.with_opacity(0.1, cor_icone),
                            padding=ft.Padding(12, 4, 12, 4),
                            border_radius=10,
                            border=ft.Border.all(1, ft.Colors.with_opacity(0.3, cor_icone)),
                        )
                    )

                modos_que_exigem_arquivo = {"tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_envio", "arquivo_tratamento_envio"}
                if modo_exec in modos_que_exigem_arquivo and not campo_arquivo_entrada.value:
                    mostrar_aviso("Selecione um arquivo para o modo escolhido.", "red900")
                    return

                modos_que_exigem_base = {"completo", "download_tratamento", "tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_tratamento_envio"}
                base_personalizada = dropdown_base_automacao.value == "personalizada"
                if modo_exec in modos_que_exigem_base and base_personalizada and not (campo_base_automacao.value or "").strip():
                    mostrar_aviso("Selecione a pasta base da automação.", "red900")
                    return

                limpar_saida_final()
                controle_robo["rodando"] = True
                controle_robo["cancelar"] = False
                btn_text.value = "CANCELAR"
                btn_infinite.bgcolor = ft.Colors.with_opacity(0.4, ft.Colors.BLACK)
                btn_infinite.border = ft.Border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.WHITE))
                bg_progress.visible = True
                texto_progresso.visible = True
                area_config_inputs.visible = False
                badges_datas.visible = True
                card.update()

                kwargs_execucao = {
                    "modo_execucao": modo_exec,
                    "pasta_destino": campo_pasta_destino.value or None,
                    "arquivo_entrada": campo_arquivo_entrada.value or None,
                    "base_automacao": (campo_base_automacao.value or None) if dropdown_base_automacao.value == "personalizada" else None,
                }
                threading.Thread(target=executar_em_background, args=(argumentos_finais, kwargs_execucao), daemon=True).start()

            btn_infinite = ft.Container(
                content=ft.Stack([bg_progress, ft.Container(content=btn_text, alignment=ft.Alignment.CENTER, expand=True)]),
                bgcolor=cor_icone,
                width=280,
                height=50,
                border_radius=18,
                on_click=lambda e: disparar_automacao(e) if not controle_robo["rodando"] else disparar_cancelamento(e),
                on_hover=lambda e: setattr(btn_infinite, "scale", 1.05 if e.data == "true" and not controle_robo["rodando"] else 1.0) or (setattr(btn_text, "color", ft.Colors.RED_300 if e.data == "true" and controle_robo["rodando"] else ft.Colors.WHITE) or btn_infinite.update()),
                animate=ft.Animation(300, "decelerate"),
                clip_behavior=ft.ClipBehavior.HARD_EDGE,
            )

            texto_progresso = ft.Text("Preparando robô...", size=11, color=ft.Colors.WHITE54, visible=False, text_align=ft.TextAlign.CENTER)

            def on_progress(_valor, mensagem):
                texto_progresso.value = mensagem
                try:
                    texto_progresso.update()
                except Exception:
                    pass

            def executar_em_background(args_datas, kwargs_execucao):
                try:
                    resultado_execucao = func_robo(
                        id_logado,
                        *args_datas,
                        callback_progresso=on_progress,
                        hook_cancelamento=lambda: controle_robo["cancelar"],
                        **kwargs_execucao,
                    )
                    resultado_execucao = resultado_execucao if isinstance(resultado_execucao, dict) else {}
                    pasta_final = resultado_execucao.get("pasta_final")
                    arquivo_final = resultado_execucao.get("arquivo_principal")

                    info_resultado["arquivo"] = arquivo_final if arquivo_final and os.path.exists(arquivo_final) else None
                    info_resultado["pasta"] = pasta_final if pasta_final and os.path.exists(pasta_final) else None

                    msg = resultado_execucao.get("mensagem", "Sucesso!")
                    on_progress(1.0, msg)
                    mostrar_aviso(f"{titulo} finalizado!", "green800")

                    if info_resultado["pasta"]:
                        texto_resultado.value = f"Destino final: {info_resultado['pasta']}"
                    elif info_resultado["arquivo"]:
                        texto_resultado.value = f"Arquivo final: {info_resultado['arquivo']}"
                    else:
                        texto_resultado.value = msg

                    texto_resultado.visible = True
                    btn_abrir_arquivo.visible = info_resultado["arquivo"] is not None
                    btn_abrir_pasta.visible = info_resultado["pasta"] is not None

                except Exception as ex:
                    on_progress(0, f"Aviso/Erro: {str(ex)}")
                    mostrar_aviso(f"Erro: {str(ex)}", "red900")
                finally:
                    controle_robo["rodando"] = False
                    btn_text.value = "RODAR ROBÔ"
                    btn_text.color = ft.Colors.WHITE
                    btn_infinite.bgcolor = cor_icone
                    btn_infinite.disabled = False
                    bg_progress.visible = False
                    try:
                        page.update()
                        card.update()
                    except Exception:
                        pass

            header_config = ft.Row([
                ft.IconButton(ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, on_click=lambda e: alternar_tamanho(e), icon_size=18, icon_color=cor_icone),
                ft.Container(content=ft.Text("Configurações", weight=ft.FontWeight.BOLD, size=16), expand=True, padding=ft.Padding(0, 0, 35, 0)),
            ], alignment=ft.MainAxisAlignment.CENTER)

            conteudo_extra = ft.Container(
                content=ft.Column([
                    header_config,
                    ft.Column([
                        area_config_inputs,
                        badges_datas,
                    ], expand=True, scroll=ft.ScrollMode.HIDDEN, spacing=8),
                    ft.Column([
                        ft.Container(content=texto_progresso, alignment=ft.Alignment.CENTER),
                        ft.Row([btn_abrir_arquivo, btn_abrir_pasta], alignment=ft.MainAxisAlignment.CENTER, spacing=8),
                        ft.Container(content=texto_resultado, alignment=ft.Alignment.CENTER),
                        btn_infinite,
                    ], spacing=4, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ], spacing=6, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                key="config",
                expand=True,
            )

            cabecalho = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Icon(icone, color=cor_icone, size=40),
                        ft.Text(titulo, size=20, weight=ft.FontWeight.BOLD),
                        ft.Container(expand=True),
                        ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54),
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    ft.Container(height=10),
                    ft.Text(descricao, size=15, color=ft.Colors.WHITE54),
                ]),
                on_click=lambda e: alternar_tamanho(e),
                ink=True,
                border_radius=10,
                padding=10,
                key="front",
            )

            animador = ft.AnimatedSwitcher(content=cabecalho, transition=ft.AnimatedSwitcherTransition.FADE, duration=400)
            animador._hidden_views = [cabecalho, conteudo_extra]

            def alternar_tamanho(_):
                indo_para_front = animador.content.key != "front"
                animador.content = conteudo_extra if animador.content.key == "front" else cabecalho
                if indo_para_front:
                    limpar_saida_final()
                    texto_progresso.visible = False
                    area_config_inputs.visible = True
                    badges_datas.visible = False
                    try:
                        area_principal.scroll = ft.ScrollMode.HIDDEN
                    except Exception:
                        pass
                card.update()

            def hover_card(e):
                card.scale = 1.05 if e.data == "true" else 1.0
                try:
                    if animador.content.key == "config":
                        area_principal.scroll = ft.ScrollMode.DISABLED if e.data == "true" else ft.ScrollMode.HIDDEN
                except Exception:
                    pass
                card.update()

            card = ft.Container(
                content=animador,
                padding=15,
                **glass_card_style,
                on_hover=hover_card,
                col={"xs": 12, "md": 6, "xl": 4},
                height=320,
                data="glass_card",
            )
            return card

        def criar_card_cofre():
            estilo_input = {
                "border_radius": 15, "expand": True, "height": 55, "focused_border_color": ft.Colors.ORANGE_400, "text_size": 15
            }
            
            btn_ir_cadastrar = ft.Container(
                content=ft.Column([ft.Icon(ft.Icons.ADD_MODERATOR_ROUNDED, size=34, color=ft.Colors.ORANGE_300), ft.Text("NOVO", weight=ft.FontWeight.BOLD, size=12)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                padding=15, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE), border_radius=20, on_click=lambda _: mudar_view("cadastro"), ink=True, expand=True
            )
            btn_ir_consultar = ft.Container(
                content=ft.Column([ft.Icon(ft.Icons.KEY_ROUNDED, size=34, color=ft.Colors.BLUE_300), ft.Text("CONSULTAR", weight=ft.FontWeight.BOLD, size=12)], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                padding=15, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE), border_radius=20, on_click=lambda _: mudar_view("consulta"), ink=True, expand=True
            )

            view_home = ft.Stack([
                ft.Column([
                    ft.Text("O que deseja fazer?", size=16, weight=ft.FontWeight.W_500), 
                    ft.Row([btn_ir_cadastrar, btn_ir_consultar], alignment=ft.MainAxisAlignment.CENTER, spacing=10)
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=20, visible=True),
                ft.IconButton(ft.Icons.CLOSE_ROUNDED, on_click=lambda _: setattr(dialog_cofre, 'open', False) or page.update(), top=0, right=0, icon_size=20, tooltip="Fechar")
            ], key="home")

            dropdown_cad = ft.Dropdown(label="Site", options=[ft.dropdown.Option("ADM de Vendas"), ft.dropdown.Option("EBUS")], **estilo_input)
            campo_user = ft.TextField(label="Login", **estilo_input)
            campo_pass = ft.TextField(label="Senha", password=True, can_reveal_password=True, **estilo_input)
            
            def salvar_clique(e):
                adicionar_credencial_site(id_logado, dropdown_cad.value, campo_user.value, campo_pass.value)
                mostrar_aviso("Salvo!", "green800")
                mudar_view("home")

            btn_salvar = ft.FilledButton("SALVAR CREDENCIAL", bgcolor=ft.Colors.ORANGE_700, color=ft.Colors.WHITE, expand=True, height=50, on_click=salvar_clique, style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15)))
            
            view_cadastro = ft.Column([
                ft.Stack([
                    ft.Container(content=ft.Text("Novo Cadastro", size=22, weight=ft.FontWeight.BOLD), alignment=ft.Alignment.CENTER),
                    ft.IconButton(ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, on_click=lambda _: mudar_view("home"), icon_size=18, left=0, top=5, tooltip="Voltar"),
                ], height=50),
                ft.Column([dropdown_cad, campo_user, campo_pass], expand=True, scroll=ft.ScrollMode.HIDDEN, spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Container(content=btn_salvar, padding=ft.Padding(0, 10, 0, 0))
            ], spacing=0, key="cadastro", horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)

            dropdown_cons = ft.Dropdown(label="Site", options=[ft.dropdown.Option("ADM de Vendas"), ft.dropdown.Option("EBUS")], **estilo_input)
            campo_mestra = ft.TextField(label="Sua Senha Mestra", password=True, **estilo_input, on_submit=lambda _: consultar_clique(None))
            
            txt_user_val = ft.Text("", size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE, selectable=True)
            txt_pass_val = ft.Text("", size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_400, selectable=True)

            cont_resultado_cons = ft.Container(
                content=ft.Column([
                    ft.Text("Dados de Acesso", size=14, color=ft.Colors.CYAN_300, weight=ft.FontWeight.W_600),
                    ft.Divider(height=1, color=ft.Colors.WHITE10),
                    ft.Column([
                        ft.Text("USUÁRIO", size=10, color=ft.Colors.WHITE54, weight=ft.FontWeight.BOLD), txt_user_val, ft.Container(height=5),
                        ft.Text("SENHA", size=10, color=ft.Colors.WHITE54, weight=ft.FontWeight.BOLD), txt_pass_val,
                    ], spacing=2),
                ], spacing=12),
                padding=20, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.BLACK), border_radius=20, visible=False, expand=True, border=ft.Border.all(1, ft.Colors.WHITE10)
            )

            msg_erro_cons = ft.Text("", size=13, color=ft.Colors.RED_400, visible=False)

            def consultar_clique(e):
                msg_erro_cons.visible = False
                cont_resultado_cons.visible = False
                
                if verificar_senha_mestra(id_logado, campo_mestra.value):
                    u, s = buscar_credencial_site(id_logado, dropdown_cons.value)
                    if u:
                        txt_user_val.value = u
                        txt_pass_val.value = s
                        cont_resultado_cons.visible = True
                    else:
                        msg_erro_cons.value = "Nenhuma credencial encontrada para este site."
                        msg_erro_cons.visible = True
                else:
                    msg_erro_cons.value = "Senha Mestra incorreta!"
                    msg_erro_cons.visible = True
                page.update()

            btn_revelar = ft.FilledButton("REVELAR ACESSO", bgcolor=ft.Colors.BLUE_700, color=ft.Colors.WHITE, expand=True, height=50, on_click=consultar_clique, style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15)))
            
            view_consulta = ft.Column([
                ft.Stack([
                    ft.Container(content=ft.Text("Consulta Segura", size=22, weight=ft.FontWeight.BOLD), alignment=ft.Alignment.CENTER),
                    ft.IconButton(ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, on_click=lambda _: mudar_view("home"), icon_size=18, left=0, top=5, tooltip="Voltar"),
                ], height=50),
                ft.Column([dropdown_cons, campo_mestra, msg_erro_cons, cont_resultado_cons], expand=True, scroll=ft.ScrollMode.HIDDEN, spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                ft.Container(content=btn_revelar, padding=ft.Padding(0, 10, 0, 0))
            ], spacing=0, key="consulta", horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)

            dialog_cofre = ft.AlertDialog(
                content=ft.Container(padding=25, width=500, height=200, alignment=ft.Alignment.CENTER, key="dialog_cont", animate=ft.Animation(450, ft.AnimationCurve.DECELERATE)), 
                bgcolor=ft.Colors.with_opacity(0.9, "#1a1a2e")
            )
            # 🟢 O SEGREDO DOS FANTASMAS (Cofre Edition)
            dialog_cofre._hidden_views = [view_home, view_cadastro, view_consulta]
            
            page.overlay.append(dialog_cofre)
            
            def abrir_dialog_cofre(e):
                mudar_view("home", force_update=False)
                dialog_cofre.open = True
                page.update()

            def mudar_view(qual, force_update=True):
                if qual == "home": 
                    dialog_cofre.content.height = 200 
                    dialog_cofre.content.content = view_home
                elif qual == "cadastro": 
                    dialog_cofre.content.height = 400 
                    dialog_cofre.content.content = view_cadastro
                elif qual == "consulta":
                    dialog_cofre.content.height = 450 
                    msg_erro_cons.visible = False
                    cont_resultado_cons.visible = False
                    campo_mestra.value = ""
                    dialog_cofre.content.content = view_consulta
                
                if force_update:
                    page.update()

            cabecalho = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Icon(ft.Icons.SECURITY_ROUNDED, color=ft.Colors.ORANGE_400, size=40), 
                        ft.Text("Cofre", size=20, weight=ft.FontWeight.BOLD), 
                        ft.Container(expand=True), 
                        ft.Icon(ft.Icons.OPEN_IN_NEW, color=ft.Colors.WHITE54)
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER), 
                    ft.Container(height=10), 
                    ft.Text("Gerencie acessos.", size=15, color=ft.Colors.WHITE54)
                ]), 
                on_click=abrir_dialog_cofre, ink=True, border_radius=10, padding=10
            )
            card = ft.Container(
                content=cabecalho, padding=15, **glass_card_style, 
                on_hover=lambda e: setattr(card, 'scale', 1.05 if e.data == "true" else 1.0) or card.update(),
                col={"xs": 12, "md": 6, "xl": 4}, height=320,
                data="glass_card"
            )
            return card

        def criar_card_pax_calc():
            is_dark_calc = page.theme_mode == ft.ThemeMode.DARK
            estilo_input = {
                "border_radius": 15, "expand": True, "height": 55, "text_size": 15, "focused_border_color": ft.Colors.CYAN_400
            }
            
            modo_venda = ft.Text("PREÇO FINAL", size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300)
            exibir_porcentagem = ft.Text("False", visible=False) 
            last_res = {"val": None} 
            
            def alternar_modo(e):
                if modo_venda.value == "PREÇO FINAL":
                    modo_venda.value = "VALOR REDUÇÃO"
                    campo_preco_novo.label = "R$ a Reduzir"
                    btn_modo.icon = ft.Icons.REMOVE_CIRCLE_OUTLINE
                else:
                    modo_venda.value = "PREÇO FINAL"
                    campo_preco_novo.label = "Preço Novo"
                    btn_modo.icon = ft.Icons.MONETIZATION_ON_OUTLINED
                page.update()

            def alternar_metricas(e):
                exibir_porcentagem.value = "True" if exibir_porcentagem.value == "False" else "False"
                btn_metrica.icon = ft.Icons.PERCENT if exibir_porcentagem.value == "True" else ft.Icons.ATTACH_MONEY
                btn_metrica.tooltip = "Mudar para Valores" if exibir_porcentagem.value == "True" else "Mudar para Porcentagem"
                if last_res["val"]: mostrar_resultados(last_res["val"])
                page.update()

            btn_modo = ft.IconButton(ft.Icons.MONETIZATION_ON_OUTLINED, icon_size=16, on_click=alternar_modo, icon_color=ft.Colors.CYAN_300, tooltip="Alternar entre Preço Novo ou Valor de Desconto")
            btn_metrica = ft.IconButton(ft.Icons.ATTACH_MONEY, icon_size=24, visible=False, on_click=alternar_metricas, icon_color=ft.Colors.CYAN_300, tooltip="Mudar para Porcentagem")
            
            campo_preco_atual = ft.TextField(label="Preço Atual", **estilo_input)
            campo_preco_novo = ft.TextField(label="Preço Novo", **estilo_input)
            campo_pax_atual = ft.TextField(label="Pax por Viagem", **estilo_input)
            campo_viagens = ft.TextField(label="Viagens Total", **estilo_input)
            campo_km = ft.TextField(label="KM p/ Viagem", **estilo_input)
            campo_pedagio = ft.TextField(label="Pedágio (Vlr)", **estilo_input)
            campo_taxa = ft.TextField(label="Taxa Emb. (Vlr)", **estilo_input)

            def carregar_onibus_dropdown():
                try:
                    lista = listar_onibus() or []
                    nomes = sorted([str(nome) for nome, _ in lista], key=lambda n: n.upper())
                    opcoes = [ft.dropdown.Option(nome) for nome in nomes]
                except:
                    opcoes = []

                if not opcoes:
                    opcoes = [ft.dropdown.Option("CONVENCIONAL")]

                if "PERSONALIZADO" not in [str(opt.key) for opt in opcoes]:
                    opcoes.append(ft.dropdown.Option("PERSONALIZADO"))

                return opcoes

            campo_nome_onibus = ft.TextField(label="Nome do Novo Tipo", visible=False, **estilo_input)
            
            campo_cap_personalizada = ft.TextField(
                label="Capacidade Manual", visible=False, **estilo_input, keyboard_type=ft.KeyboardType.NUMBER
            )

            def salvar_novo_onibus(_):
                nome = (campo_nome_onibus.value or "").strip().upper()
                try:
                    cap = float((campo_cap_personalizada.value or "").replace(",", "."))
                except:
                    cap = 0

                if nome and cap > 0:
                    salvar_onibus(nome, int(cap))
                    tipo_onibus.options = carregar_onibus_dropdown()
                    tipo_onibus.value = nome
                    campo_nome_onibus.visible = False
                    campo_cap_personalizada.visible = False
                    btn_salvar_onibus.visible = False
                    tipo_onibus.helper_text = f"Salvo: {int(cap)} pax"
                else:
                    tipo_onibus.helper_text = "Nome e capacidade obrigatórios"
                page.update()

            btn_salvar_onibus = ft.ElevatedButton(
                "Salvar Tipo",
                icon=ft.Icons.SAVE_ROUNDED,
                visible=False,
                on_click=salvar_novo_onibus,
                style=ft.ButtonStyle(color=ft.Colors.AMBER_400)
            )
            
            def atualizar_capacidade(e):
                is_custom = tipo_onibus.value == "PERSONALIZADO"
                campo_cap_personalizada.visible = is_custom
                campo_nome_onibus.visible = is_custom
                btn_salvar_onibus.visible = is_custom
                if is_custom:
                    tipo_onibus.helper_text = "Defina nome e capacidade abaixo"
                else:
                    cap = get_capacidade(tipo_onibus.value or "CONVENCIONAL")
                    try:
                        lista = listar_onibus() or []
                        cap = next((c for n, c in lista if str(n) == str(tipo_onibus.value)), cap)
                    except:
                        pass
                    tipo_onibus.helper_text = f"Capacidade estimada: {cap} pax"
                
                tipo_onibus.update()
                campo_cap_personalizada.update()

            tipo_onibus = ft.Dropdown(
                label="Tipo de Ônibus", expand=True, height=55, border_radius=15,
                on_select=atualizar_capacidade,
                options=carregar_onibus_dropdown(),
                value="CONVENCIONAL", focused_border_color=ft.Colors.CYAN_400,
                bgcolor=ft.Colors.with_opacity(0.95 if is_dark_calc else 1.0, "#111522" if is_dark_calc else "#FFFFFF"),
            )

            col_resultado = ft.Column(spacing=20, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

            def mostrar_resultados(res):
                last_res["val"] = res
                capacidade_base = float(res.get('capacidade_internal', 46) or 46)
                ocup_floor = (res['floor']['pax_total'] / capacidade_base) * 100 if capacidade_base > 0 else 0
                ocup_ceil = (res['ceil']['pax_total'] / capacidade_base) * 100 if capacidade_base > 0 else 0

                def fmt_br(v):
                    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

                def sec_titulo(texto):
                    return ft.Container(content=ft.Text(texto.upper(), size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300, opacity=0.8), margin=ft.Padding(0, 15, 0, 5))

                def mini_indicator(label, valor, cor=ft.Colors.WHITE, sub=""):
                    return ft.Column([
                        ft.Text(label, size=9, color=ft.Colors.WHITE38, weight=ft.FontWeight.BOLD),
                        ft.Text(valor, size=18, weight=ft.FontWeight.BOLD, color=cor),
                        ft.Text(sub, size=10, color=ft.Colors.CYAN_300 if "Diferença" in sub else ft.Colors.WHITE24) if sub else ft.Container()
                    ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

                def badge_param(label, valor, icone):
                    return ft.Container(
                        content=ft.Column([
                            ft.Icon(icone, size=15, color=ft.Colors.WHITE38),
                            ft.Text(label, size=10, color=ft.Colors.WHITE38, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER),
                            ft.Text(str(valor), size=12, color=ft.Colors.WHITE70, weight=ft.FontWeight.W_500, text_align=ft.TextAlign.CENTER),
                        ], spacing=4, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        alignment=ft.Alignment.CENTER, bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.WHITE), padding=ft.Padding(12, 6, 12, 6), border_radius=12, border=ft.Border.all(1, ft.Colors.with_opacity(0.08, ft.Colors.WHITE))
                    )

                def card_triplo(titulo, v_atual, v_floor, v_ceil, is_currency=True, label_piso="PISO", label_teto="TETO", is_int=False, font_size_val=16):
                    def get_metric(val, is_curr):
                        if val is None: return ""
                        if isinstance(val, str): return val
                        if is_int: return f"{int(val)}"
                        return fmt_br(val) if is_curr else f"{val:.1f}"

                    def get_dif_view(atual, final):
                        if atual is None or not isinstance(atual, (int, float)) or not isinstance(final, (int, float)): return ft.Text("", height=15)
                        dif = final - atual
                        if exibir_porcentagem.value == "True":
                            if not atual or atual == 0: return ft.Text("", height=15)
                            val_pct = ((final / atual) - 1) * 100
                            txt = f"{abs(val_pct):.1f}%"
                        else:
                            txt = fmt_br(abs(dif)) if is_currency else f"{abs(dif):.1f}"
                        cor = ft.Colors.GREEN_400 if dif >= 0 else ft.Colors.RED_400
                        seta = "▲" if dif >= 0 else "▼"
                        if titulo == "PASSAGEIROS EXTRA NECESSÁRIOS" and atual == 0: return ft.Text("", height=15)
                        return ft.Text(f"{seta} {txt}", size=10, color=cor, weight=ft.FontWeight.BOLD)

                    cols = []
                    if v_atual is not None:
                        cols.append(ft.Column([ft.Text("ATUAL", size=8, color=ft.Colors.WHITE24), ft.Text(get_metric(v_atual, is_currency), size=14, weight=ft.FontWeight.W_500), ft.Text("", height=15)], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    if v_floor is not None:
                        if len(cols) > 0: cols.append(ft.Container(content=ft.VerticalDivider(width=1, color=ft.Colors.WHITE10), height=35))
                        label_p = "VALOR NOVO" if v_floor == v_ceil else label_piso
                        cols.append(ft.Column([ft.Text(label_p, size=8, color=ft.Colors.GREEN_900), ft.Text(get_metric(v_floor, is_currency), size=font_size_val, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_300), get_dif_view(v_atual, v_floor)], spacing=1, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    if v_ceil is not None and v_ceil != v_floor:
                        if len(cols) > 0: cols.append(ft.Container(content=ft.VerticalDivider(width=1, color=ft.Colors.WHITE10), height=35))
                        cols.append(ft.Column([ft.Text(label_teto, size=8, color=ft.Colors.CYAN_900), ft.Text(get_metric(v_ceil, is_currency), size=font_size_val, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300), get_dif_view(v_atual, v_ceil)], spacing=1, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    return ft.Container(
                        padding=15, border_radius=25, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.BLACK), border=ft.Border.all(1, ft.Colors.WHITE10),
                        content=ft.Column([ft.Text(titulo, size=9, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE38, text_align=ft.TextAlign.CENTER), ft.Row(cols, alignment=ft.MainAxisAlignment.SPACE_AROUND, vertical_alignment=ft.CrossAxisAlignment.CENTER)], spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                    )

                banner = ft.Container(
                    padding=15, border_radius=22, bgcolor=ft.Colors.with_opacity(0.12, ft.Colors.CYAN_900), border=ft.Border.all(1, ft.Colors.CYAN_800), margin=ft.Padding(10, 0, 10, 0),
                    content=ft.ResponsiveRow([
                        ft.Column([ft.Icon(ft.Icons.AUTO_GRAPH_ROUNDED, color=ft.Colors.CYAN_300, size=32)], col={"xs": 2, "sm": 1}),
                        ft.Column([
                            ft.Text("CONCLUSÃO ESTRATÉGICA", size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_200),
                            ft.Text(f"Redução bruta de {fmt_br(res['reducao_valor'])} exige um aumento de volume p/ viagem de +{int(res['pax_extra_floor'])} a +{int(res['pax_extra_ceil'])} passageiros. O ponto de equilíbrio técnico é atingido com {res['pax_extra_vlr']} novos pax.", size=12, color=ft.Colors.WHITE70)
                        ], spacing=3, col={"xs": 10, "sm": 11})
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER)
                )

                grid = ft.ResponsiveRow([
                    ft.Container(col={"xs": 12, "sm": 6, "md": 4}, content=card_triplo("PASSAGEIROS EXTRA NECESSÁRIOS", None, res['pax_extra_floor'], res['pax_extra_ceil'], is_currency=False, label_piso="+ PISO", label_teto="+ TETO", is_int=True)),
                    ft.Container(col={"xs": 12, "sm": 6, "md": 4}, content=card_triplo("VOLUME TOTAL DE PAX", None, res['floor']['pax_total'], res['ceil']['pax_total'], is_currency=False, is_int=True)),
                    ft.Container(col={"xs": 12, "sm": 12, "md": 4}, content=card_triplo("TARIFA LÍQUIDA (NET)", res['tarifa_liq_atual'], res['tarifa_liq_nova'], res['tarifa_liq_nova'])),
                    ft.Container(col={"xs": 12, "md": 6}, content=card_triplo("FATURAMENTO BRUTO ESTIMADO", res['rec_bruta_atual'], res['floor']['rec_bruta'], res['ceil']['rec_bruta'])),
                    ft.Container(col={"xs": 12, "md": 6}, content=card_triplo("RENTABILIDADE DA OPERAÇÃO (R$ / KM)", res['rec_km_atual'], res['floor']['rec_km'], res['ceil']['rec_km'])),
                    ft.Container(col={"xs": 12}, content=card_triplo("RECEITA LÍQUIDA TOTAL (PROFIT)", res['rec_liq_atual'], res['floor']['rec_liq'], res['ceil']['rec_liq'], font_size_val=22)),
                ], spacing=15, run_spacing=15)

                rodape = ft.Container(
                    padding=20, border_radius=25, bgcolor=ft.Colors.with_opacity(0.04, ft.Colors.WHITE), margin=ft.Padding(10, 0, 10, 0),
                    content=ft.ResponsiveRow([
                        ft.Column([mini_indicator("PREÇO FINAL (BRUTO)", fmt_br(res['p_nv_internal']), ft.Colors.CYAN_200, f"Dif: {fmt_br(res['reducao_valor'])}")], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([
                            ft.Column([
                                ft.Text("OCUPAÇÃO", size=9, color=ft.Colors.WHITE38, weight=ft.FontWeight.BOLD),
                                ft.Row([
                                    ft.Column([ft.Text("ATUAL", size=8, color=ft.Colors.WHITE24, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER), ft.Text(f"{res['ocupacao_atual']:.2f}%", size=13, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE, text_align=ft.TextAlign.CENTER)], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                                    ft.Icon(ft.Icons.ARROW_FORWARD_ROUNDED, size=16, color=ft.Colors.WHITE38),
                                    ft.Column([ft.Text("PISO", size=8, color=ft.Colors.GREEN_900, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER), ft.Text(f"{ocup_floor:.2f}%", size=13, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_300, text_align=ft.TextAlign.CENTER)], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                                    ft.Icon(ft.Icons.ARROW_FORWARD_ROUNDED, size=16, color=ft.Colors.WHITE38),
                                    ft.Column([ft.Text("TETO", size=8, color=ft.Colors.CYAN_900, weight=ft.FontWeight.BOLD, text_align=ft.TextAlign.CENTER), ft.Text(f"{ocup_ceil:.2f}%", size=13, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300, text_align=ft.TextAlign.CENTER)], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                                ], alignment=ft.MainAxisAlignment.CENTER, vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                            ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                        ], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([mini_indicator("META UNITÁRIA", f"{res['floor']['pax_total']} a {res['ceil']['pax_total']}", ft.Colors.AMBER_400, "Pax p/ Viagem")], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ], spacing=10, run_spacing=20)
                )

                badges_params = [
                    badge_param("Modo", str(res.get('modo_venda_internal', 'PREÇO FINAL')), ft.Icons.TUNE_ROUNDED),
                    badge_param("Preço Atual", fmt_br(res.get('p_at_internal', 0.0)), ft.Icons.PRICE_CHECK_ROUNDED),
                    badge_param("Preço Final", fmt_br(res.get('p_nv_internal', 0.0)), ft.Icons.ATTACH_MONEY),
                    badge_param("Paxs Atuais", f"{int(res.get('pax_atual_internal', 0))} paxs", ft.Icons.PEOPLE_ROUNDED),
                    badge_param("Viagens", f"{int(res.get('vgs_internal', 0))} vgs", ft.Icons.CONFIRMATION_NUMBER),
                    badge_param("Distância", f"{res.get('km_internal', 0)} km", ft.Icons.ROUTE),
                    badge_param("Pedágio", fmt_br(res.get('pedagio_internal', 0.0)), ft.Icons.TOLL_ROUNDED),
                    badge_param("Taxa Emb.", fmt_br(res.get('taxa_internal', 0.0)), ft.Icons.RECEIPT_LONG_ROUNDED),
                    badge_param("Bus", str(res.get('bus_internal', 'N/A')), ft.Icons.BUS_ALERT_ROUNDED),
                    badge_param("Capacidade", f"{int(res.get('capacidade_internal', 0))} pax", ft.Icons.EVENT_SEAT_ROUNDED),
                ]
                fifth = len(badges_params) // 5
                
                area_params = ft.Container(
                    margin=ft.Padding(10, 0, 10, 0),
                    content=ft.ResponsiveRow([
                        ft.Column(badges_params[:fifth], col={"xs": 12, "md": 6, "lg": 2.4}, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column(badges_params[fifth:fifth*2], col={"xs": 12, "md": 6, "lg": 2.4}, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column(badges_params[fifth*2:fifth*3], col={"xs": 12, "md": 6, "lg": 2.4}, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column(badges_params[fifth*3:fifth*4], col={"xs": 12, "md": 6, "lg": 2.4}, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column(badges_params[fifth*4:], col={"xs": 12, "md": 6, "lg": 2.4}, spacing=8, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ], alignment=ft.MainAxisAlignment.CENTER, spacing=12, run_spacing=12)
                )

                col_resultado.controls = [
                    sec_titulo("Parâmetros Digitados"), area_params, sec_titulo("Dashboard de Performance"),
                    banner, ft.Container(content=grid, padding=ft.Padding(10, 0, 10, 0)), sec_titulo("Indicadores Técnicos"),
                    rodape, ft.Container(height=20)
                ]
                reaplicar_estilos_recursivo(col_resultado, page.theme_mode)
                mudar_view_pax("results")

            def calcular(e):
                try:
                    def parse_vlr(txt):
                        if txt is None: return 0.0
                        s = str(txt).strip().replace(",", ".")
                        try: return float(s) if s else 0.0
                        except: return 0.0

                    p_at = parse_vlr(campo_preco_atual.value)
                    val_novo_input = parse_vlr(campo_preco_novo.value)
                    
                    p_nv = p_at - val_novo_input if modo_venda.value == "VALOR REDUÇÃO" else val_novo_input
                    
                    px_at = parse_vlr(campo_pax_atual.value)
                    vgs = parse_vlr(campo_viagens.value)
                    km = parse_vlr(campo_km.value)
                    ped = parse_vlr(campo_pedagio.value)
                    tax = parse_vlr(campo_taxa.value)

                    if km <= 0: km = 1
                    if vgs <= 0: vgs = 1
                    if p_nv <= 0: p_nv = 0.01

                    if tipo_onibus.value == "PERSONALIZADO":
                        cap_final = parse_vlr(campo_cap_personalizada.value)
                        if cap_final <= 0: cap_final = 46 
                    else:
                        cap_final = get_capacidade(tipo_onibus.value or "CONVENCIONAL")
                        try:
                            lista = listar_onibus() or []
                            cap_final = next((c for n, c in lista if str(n) == str(tipo_onibus.value)), cap_final)
                        except:
                            pass

                    res = calculadora_elasticidade_pax(p_at, p_nv, px_at, vgs, cap_final, km, ped, tax)
                    
                    res['pax_atual_internal'] = px_at
                    res['p_at_internal'] = p_at
                    res['p_nv_internal'] = p_nv
                    res['valor_digitado_internal'] = val_novo_input
                    res['modo_venda_internal'] = modo_venda.value
                    res['vgs_internal'] = vgs
                    res['km_internal'] = km
                    res['pedagio_internal'] = ped
                    res['taxa_internal'] = tax
                    res['bus_internal'] = tipo_onibus.value or "CONVENCIONAL"
                    res['capacidade_internal'] = cap_final

                    mostrar_resultados(res)
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                    mostrar_aviso(f"Erro no processamento: {str(ex)}")

            btn_calc = ft.FilledButton("ANALISAR ESTRATÉGIA", bgcolor=ft.Colors.CYAN_700, color=ft.Colors.WHITE, height=55, on_click=calcular, style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15)))
            btn_recalc = ft.IconButton(ft.Icons.REPLAY_ROUNDED, visible=False, on_click=lambda _: mudar_view_pax("inputs"), icon_color=ft.Colors.CYAN_300, tooltip="Novo Cálculo", icon_size=28)

            view_inputs = ft.Column([
                ft.Text("Configure os parâmetros de preço e custos da operação.", size=14, color=ft.Colors.WHITE54), ft.Container(height=10),
                ft.Row([modo_venda, btn_modo], alignment=ft.MainAxisAlignment.CENTER, spacing=5),
                ft.ResponsiveRow([
                    ft.Column([campo_preco_atual], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_preco_novo], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_pax_atual], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_viagens], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_km], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_pedagio], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_taxa], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([tipo_onibus], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_nome_onibus], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_cap_personalizada], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([btn_salvar_onibus], col={"xs": 12, "sm": 6, "md": 4}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                ], spacing=15, run_spacing=10),
                ft.Container(height=15),
                ft.Row([btn_calc], alignment=ft.MainAxisAlignment.CENTER, expand=True)
            ], spacing=0, horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="inputs")

            view_results = ft.Column([col_resultado], horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="results", scroll=ft.ScrollMode.HIDDEN, expand=True)

            btn_fechar_pax = ft.IconButton(ft.Icons.CLOSE_ROUNDED, on_click=lambda _: setattr(dialog_pax, 'open', False) or page.update(), icon_color=ft.Colors.WHITE54, icon_size=22, tooltip="Fechar")
            
            dialog_pax = ft.AlertDialog(
                content=ft.Container(
                    width=980, height=550, padding=15,
                    content=ft.Column([
                        ft.Row([btn_fechar_pax, ft.Text("Simulador de Elasticidade", size=20, weight=ft.FontWeight.BOLD), ft.Container(expand=True), btn_metrica, btn_recalc]),
                        ft.Divider(height=1, color=ft.Colors.WHITE10), ft.Container(height=15),
                        ft.Column([view_inputs, view_results], scroll=ft.ScrollMode.HIDDEN, expand=True, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                    ]),
                    animate=ft.Animation(500, ft.AnimationCurve.DECELERATE)
                ), bgcolor=ft.Colors.with_opacity(0.98, "#0a0a12")
            )
            page.overlay.append(dialog_pax)

            def mudar_view_pax(qual):
                view_inputs.visible = (qual == "inputs")
                view_results.visible = (qual == "results")
                btn_recalc.visible = (qual == "results")
                btn_metrica.visible = (qual == "results")
                dialog_pax.content.height = 550 if qual == "inputs" else 850
                page.update()

            def abrir_calculadora(e):
                view_inputs.visible = True
                view_results.visible = False
                btn_recalc.visible = False
                btn_metrica.visible = False
                dialog_pax.content.height = 550
                dialog_pax.open = True
                page.update()

            card = ft.Container(
                content=ft.Container(
                    content=ft.Column([
                        ft.Row([ft.Icon(ft.Icons.CALCULATE_ROUNDED, color=ft.Colors.CYAN_300, size=40), ft.Text("Pax Calc", size=20, weight=ft.FontWeight.BOLD), ft.Container(expand=True), ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Container(height=10), ft.Text("Análise de elasticidade e KM.", size=15, color=ft.Colors.WHITE54)
                    ]), padding=10, on_click=abrir_calculadora, ink=True, border_radius=10
                ), 
                padding=15, **glass_card_style, 
                on_hover=lambda e: setattr(card, 'scale', 1.05 if e.data == "true" else 1.0) or card.update(),
                col={"xs": 12, "md": 6, "xl": 4}, height=320,
                data="glass_card" 
            )
            return card

        # =======================================================
        # 🟢 A NOVA ARQUITETURA EDGE-TO-EDGE
        # =======================================================

        card_adm = criar_card_robo("ADM de Vendas", ft.Icons.BAR_CHART_ROUNDED, "Extração de Demandas.", ft.Colors.BLUE_300, executar_adm, [{'label': '', 'ini': ADM_INICIO, 'fim': ADM_FIM}])
        card_ebus = criar_card_robo("EBUS Revenue", ft.Icons.ATTACH_MONEY_ROUNDED, "Relatório Financeiro.", ft.Colors.GREEN_300, executar_ebus, [{'label': '', 'ini': EBUS_INICIO, 'fim': EBUS_FIM}])
        card_sr = criar_card_robo(
            "Relatório Rio x SP",
            ft.Icons.EMAIL_ROUNDED,
            "E-mail e Base Rio.",
            ft.Colors.ORANGE_300,
            executar_sr,
            [{'label': 'Email', 'ini': SR_FIM, 'fim': SR_FIM}, {'label': 'Base', 'ini': SR_INI, 'fim': SR_INI}],
            modos_disponiveis=["completo", "download", "download_tratamento", "tratamento", "tratamento_envio", "arquivo_tratamento", "arquivo_envio", "arquivo_tratamento_envio"],
        )
        card_pax = criar_card_pax_calc()
        card_cofre = criar_card_cofre()

        def criar_grupo(titulo, cards):
            return ft.Column([
                ft.Text(titulo, size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE70),
                ft.ResponsiveRow(cards, spacing=25, run_spacing=25)
            ], spacing=15)

        grupo_automacoes = criar_grupo("Automações e Robôs", [card_adm, card_ebus, card_sr])
        grupo_ferramentas = criar_grupo("Ferramentas Analíticas", [card_pax])
        grupo_senhas = criar_grupo("Acessos e Segurança", [card_cofre])
        
        grupo_config = ft.Column([
            ft.Text("Configurações do Sistema", size=20, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE70),
            ft.Container(
                content=ft.Text("Preferências, temas e atalhos virão aqui em breve...", color=ft.Colors.WHITE54),
                padding=40, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.BLACK), border_radius=20
            )
        ], spacing=15)

        area_principal = ft.Column([
            ft.Container(height=110), 
            grupo_automacoes, ft.Container(height=30),
            grupo_ferramentas, ft.Container(height=30),
            grupo_senhas,
            ft.Container(height=50) # Respiro final
        ], scroll=ft.ScrollMode.HIDDEN, expand=True)

        def mudar_tela_menu(e):
            idx = e.control.selected_index
            area_principal.controls.clear()
            
            area_principal.controls.append(ft.Container(height=110)) 
            
            if idx == 0:   
                area_principal.controls.extend([grupo_automacoes, ft.Container(height=30), grupo_ferramentas, ft.Container(height=30), grupo_senhas])
            elif idx == 1: 
                area_principal.controls.append(grupo_automacoes)
            elif idx == 2: 
                area_principal.controls.append(grupo_ferramentas)
            elif idx == 3: 
                area_principal.controls.append(grupo_senhas)
            elif idx == 4: 
                area_principal.controls.append(grupo_config)
                
            area_principal.controls.append(ft.Container(height=50)) 
            reaplicar_estilos_recursivo(area_principal, page.theme_mode)
            area_principal.update()

        # =======================================================
        # O PAINEL DE VIDRO UNIFICADO (L-SHAPE)
        # =======================================================
        glass_forte = {
            "bgcolor": ft.Colors.with_opacity(0.45 if is_dark_dash else 0.6, ft.Colors.BLACK if is_dark_dash else ft.Colors.WHITE),
            "blur": ft.Blur(40, 40), 
        }

        menu_lateral = ft.NavigationRail(
            selected_index=0,
            label_type=ft.NavigationRailLabelType.ALL,
            min_width=90,
            bgcolor=ft.Colors.TRANSPARENT,
            on_change=mudar_tela_menu,
            destinations=[
                ft.NavigationRailDestination(icon=ft.Icons.HOME_OUTLINED, selected_icon=ft.Icons.HOME, label="Início"),
                ft.NavigationRailDestination(icon=ft.Icons.ROCKET_LAUNCH_OUTLINED, selected_icon=ft.Icons.ROCKET_LAUNCH, label="Automações"),
                ft.NavigationRailDestination(icon=ft.Icons.CONSTRUCTION_OUTLINED, selected_icon=ft.Icons.CONSTRUCTION, label="Ferramentas"),
                ft.NavigationRailDestination(icon=ft.Icons.SECURITY_OUTLINED, selected_icon=ft.Icons.SECURITY, label="Senhas"),
                ft.NavigationRailDestination(icon=ft.Icons.SETTINGS_OUTLINED, selected_icon=ft.Icons.SETTINGS, label="Config."),
            ]
        )

        container_menu_glass = ft.Container(
            content=menu_lateral, width=90, left=0, top=0, bottom=0, 
            padding=ft.Padding(0, 110, 0, 20), 
            border=None,
            **glass_forte,
            data="glass_panel_no_border" 
        )

        header = ft.Container(
            content=ft.Row([
                ft.Text(f"Olá, {nome_usuario} 👋", size=24, weight=ft.FontWeight.BOLD, no_wrap=False),
                ft.Container(expand=True),
                ft.IconButton(ft.Icons.LOGOUT, icon_color=ft.Colors.RED_400, on_click=ir_para_login, tooltip="Sair")
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER), 
            padding=ft.Padding(30, 35, 30, 20),
            left=90, right=0, top=0, height=110, 
            border=None,
            **glass_forte,
            data="glass_panel_no_border" 
        )

        # Montagem Final no Stack: Container interno com left/right/top/bottom força o preenchimento da tela
        dashboard = ft.Stack([
            ft.Container(
                content=area_principal, 
                padding=ft.Padding(120, 0, 30, 0), 
                left=0, right=0, top=0, bottom=0 
            ),
            container_menu_glass,
            header
        ], expand=True)

        reaplicar_estilos_recursivo(dashboard, page.theme_mode)
        for ctrl in page.overlay:
            reaplicar_estilos_recursivo(ctrl, page.theme_mode)

        camada_conteudo.content = dashboard
        camada_conteudo.update()

    page.add(layout_principal)
    ir_para_login()
    
    threading.Thread(target=animar_fundo, daemon=True).start()

if __name__ == "__main__":
    ft.run(main)