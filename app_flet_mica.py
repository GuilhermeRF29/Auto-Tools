# app_flet_mica.py

import flet as ft # type: ignore
import calendar
import threading
from datetime import datetime, timedelta
import time

from core.banco import (inicializar_env, configurar_banco, 
                        login_principal, cadastrar_usuario_principal, 
                        adicionar_credencial_site, buscar_credencial_site, 
                        verificar_senha_mestra) # type: ignore 
from automacoes.adm_new import executar_adm
from automacoes.ebus_new import executar_ebus # type: ignore
from automacoes.sr_new import executar_sr
from automacoes.paxcalc import calculadora_elasticidade_pax, get_capacidade

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

    page.title = "Sistema de Automações - Flet Premium Glass"
    page.window.width = 1200
    page.window.height = 800
    page.window.min_width = 450
    page.window.min_height = 600
    page.theme_mode = ft.ThemeMode.DARK
    page.padding = 0

    # Carregando fonte moderna
    page.fonts = {
        "Lexend": "https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;600;700&display=swap"
    }
    page.theme = ft.Theme(font_family="Lexend")
    
    # Centralizar nativamente (Tratamento para versão)
    try:
        import asyncio
        asyncio.create_task(page.window.center())
    except:
        pass

    luz_azul = ft.Container(
        gradient=ft.RadialGradient(
            center=ft.Alignment(-0.7, -0.7),
            radius=1.5,
            colors=[ft.Colors.with_opacity(0.4, ft.Colors.BLUE_700), ft.Colors.TRANSPARENT],
            stops=[0.2, 1.0]
        ),
        left=0, top=0, right=0, bottom=0,
        animate=ft.Animation(4000, ft.AnimationCurve.EASE_IN_OUT)
    )
    luz_verde = ft.Container(
        gradient=ft.RadialGradient(
            center=ft.Alignment(0.7, 0.7),
            radius=1.5,
            colors=[ft.Colors.with_opacity(0.3, ft.Colors.GREEN_700), ft.Colors.TRANSPARENT],
            stops=[0.2, 1.0]
        ),
        left=0, top=0, right=0, bottom=0,
        animate=ft.Animation(4000, ft.AnimationCurve.EASE_IN_OUT)
    )

    # Camada 1: O Fundo Animado (Stack de Luzes)
    camada_fundo = ft.Stack([
        ft.Container(bgcolor="#020202", expand=True),
        luz_azul,
        luz_verde
    ], left=0, right=0, top=0, bottom=0)

    # Camada 2: Aqui vai o login ou o dashboard
    camada_conteudo = ft.Container(
        alignment=ft.Alignment.CENTER, 
        expand=True,
        animate_opacity=400,
        animate_scale=ft.Animation(400, ft.AnimationCurve.DECELERATE)
    )

    # Pilha principal que une as camadas
    layout_principal = ft.Stack(
        controls=[camada_fundo, camada_conteudo], 
        expand=True
    )
    
    def animar_fundo():
        posicoes = [
            ((-0.7, -0.7), (0.7, 0.7)),
            ((-0.5, -0.8), (0.5, 0.8)),
            ((-0.8, -0.5), (0.8, 0.5)),
        ]
        idx = 0
        while True:
            try:
                p1, p2 = posicoes[idx]
                luz_azul.gradient.center = ft.Alignment(p1[0], p1[1])
                luz_verde.gradient.center = ft.Alignment(p2[0], p2[1])
                luz_azul.update()
                luz_verde.update()
                
                time.sleep(4)
                idx = (idx + 1) % len(posicoes)
            except:
                break

    page.theme = ft.Theme(
        scrollbar_theme=ft.ScrollbarTheme(
            track_color={ft.ControlState.DEFAULT: ft.Colors.TRANSPARENT},
            thumb_color={ft.ControlState.DEFAULT: ft.Colors.WHITE24},
            thickness={ft.ControlState.DEFAULT: 8},
            radius=10, interactive=True,
        )
    )

    def mostrar_aviso(mensagem, cor="red900"):
        snack = ft.SnackBar(
            content=ft.Text(
                mensagem, 
                color=ft.Colors.WHITE, 
                weight=ft.FontWeight.BOLD
            ), 
            bgcolor=cor
        )
        page.overlay.append(snack)
        snack.open = True
        page.update()

    glass_style = {
        "bgcolor": ft.Colors.with_opacity(0.4, ft.Colors.BLACK),
        "blur": ft.Blur(20, 20),
        "border": ft.Border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.WHITE)),
        "border_radius": 30,
        "padding": 40,
        "shadow": ft.BoxShadow(
            spread_radius=2, 
            blur_radius=25, 
            color=ft.Colors.with_opacity(0.5, ft.Colors.BLACK)
        )
    }

    # --- TELAS DE LOGIN ---
    campo_usuario_login = ft.TextField(
        label="Usuário", 
        prefix_icon=ft.Icons.PERSON, 
        border_radius=15, 
        width=320, 
        bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK),
        border_color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE), 
        focused_border_color=ft.Colors.BLUE_300
    )
    campo_senha_login = ft.TextField(
        label="Senha", 
        prefix_icon=ft.Icons.LOCK, 
        password=True, 
        can_reveal_password=True, 
        border_radius=15,
        width=320, 
        bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK),
        border_color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE), 
        focused_border_color=ft.Colors.BLUE_300
    )
    btn_entrar = ft.FilledButton(
        content=ft.Text("ENTRAR", weight=ft.FontWeight.BOLD), 
        width=320, 
        height=50, 
        style=ft.ButtonStyle(
            shape=ft.RoundedRectangleBorder(radius=30), 
            bgcolor=ft.Colors.BLUE_700, 
            color=ft.Colors.WHITE, 
            elevation=10
        ), 
    )
    
    caixa_login = ft.Container(
        content=ft.Column([
            ft.Icon(
                ft.Icons.ROCKET_LAUNCH_ROUNDED, 
                size=70, 
                color=ft.Colors.BLUE_300
            ), 
            ft.Text(
                "JCA Automações", 
                size=26, 
                weight=ft.FontWeight.BOLD, 
                color=ft.Colors.WHITE,
                text_align=ft.TextAlign.CENTER
            ), 
            ft.Container(height=20), 
            campo_usuario_login, 
            campo_senha_login, 
            ft.Container(height=10), 
            btn_entrar, 
            ft.TextButton(
                content=ft.Text("Criar conta", color=ft.Colors.BLUE_200)
            )
        ], 
        horizontal_alignment=ft.CrossAxisAlignment.CENTER
        ), 
        **glass_style,
        margin=20,
        width=450,
        animate=ft.Animation(500, ft.AnimationCurve.DECELERATE),
        scale=1.0
    )
    
    campo_nome_cad = ft.TextField(
        label="Nome Completo", 
        border_radius=15, 
        width=320, 
        bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK)
    )
    campo_usuario_cad = ft.TextField(
        label="Usuário", 
        border_radius=15, 
        width=320, 
        bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK)
    )
    campo_senha_cad = ft.TextField(
        label="Senha", 
        password=True, 
        border_radius=15, 
        width=320, 
        bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.BLACK)
    )
    btn_salvar_cad = ft.FilledButton(
        content=ft.Text("CADASTRAR", weight=ft.FontWeight.BOLD), 
        width=320, 
        height=50, 
        style=ft.ButtonStyle(
            shape=ft.RoundedRectangleBorder(radius=30), 
            bgcolor=ft.Colors.GREEN_700, 
            color=ft.Colors.WHITE
        )
    )
    caixa_cadastro = ft.Container(
        content=ft.Column([
            ft.Icon(
                ft.Icons.PERSON_ADD_ROUNDED, 
                size=60, 
                color=ft.Colors.GREEN_300
            ), 
            ft.Text(
                "Novo Operador", 
                size=24, 
                weight=ft.FontWeight.BOLD, 
                color=ft.Colors.WHITE
            ), 
            ft.Container(height=10), 
            campo_nome_cad, 
            campo_usuario_cad, 
            campo_senha_cad, 
            ft.Container(height=10), 
            btn_salvar_cad, 
            ft.TextButton(
                content=ft.Text("Voltar", color=ft.Colors.GREY_300)
            )
        ], 
        horizontal_alignment=ft.CrossAxisAlignment.CENTER
        ), 
        **glass_style,
        margin=20,
        width=450,
        animate=ft.Animation(500, ft.AnimationCurve.DECELERATE),
        scale=1.0
    )

    def tentar_login(e):
        caixa_login.scale = 0.95
        caixa_login.update()
        time.sleep(0.1)
        caixa_login.scale = 1.0
        caixa_login.update()
        
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
        
        camada_conteudo.content = ft.Column(
            [caixa_cadastro], 
            alignment=ft.MainAxisAlignment.CENTER, 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
            expand=True
        )
        camada_conteudo.opacity = 1
        camada_conteudo.scale = 1.0
        camada_conteudo.update()

    def ir_para_login(e=None):
        camada_conteudo.opacity = 0
        camada_conteudo.scale = 0.95
        camada_conteudo.update()

        camada_conteudo.content = ft.Column(
            [caixa_login], 
            alignment=ft.MainAxisAlignment.CENTER, 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
            expand=True
        )
        camada_conteudo.opacity = 1
        camada_conteudo.scale = 1.0
        camada_conteudo.update()

    btn_entrar.on_click = tentar_login
    campo_usuario_login.on_submit = tentar_login
    campo_senha_login.on_submit = tentar_login
    caixa_login.content.controls[-1].on_click = ir_para_cadastro
    btn_salvar_cad.on_click = tentar_cadastro
    caixa_cadastro.content.controls[-1].on_click = ir_para_login

    # =======================================================
    # DASHBOARD
    # =======================================================
    def mostrar_dashboard(id_logado, nome_usuario):
        camada_conteudo.content = None
        
        glass_card_style = {
            "bgcolor": ft.Colors.with_opacity(0.35, ft.Colors.BLACK),
            "blur": ft.Blur(15, 15),
            "border": ft.Border.all(1, ft.Colors.with_opacity(0.15, ft.Colors.WHITE)),
            "border_radius": 28,
            "shadow": ft.BoxShadow(
                spread_radius=1, 
                blur_radius=20, 
                color=ft.Colors.with_opacity(0.4, ft.Colors.BLACK)
            ),
            "animate": ft.Animation(400, ft.AnimationCurve.DECELERATE),
        }

        def criar_card_robo(titulo, icone, descricao, cor_icone, func_robo, config_datas):
            elementos_data = []
            modo_selecionado = "padrao" # Estado interno do card

            def extrair_dia_mes(d):
                try: 
                    partes = d.split("/")
                    return f"{partes[0]}/{partes[1]}"
                except: return d

            # --- INPUTS CUSTOMIZADOS ---
            coluna_datas_custom = ft.Column(
                visible=False, 
                spacing=8, 
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                animate_opacity=400
            )

            for config in config_datas:
                label = config['label']
                p_ini = config['ini']
                p_fim = config['fim']

                c_ini = ft.TextField(
                    label=f"Ini {label}", 
                    width=135, height=45, text_size=12, 
                    read_only=True, prefix_icon=ft.Icons.CALENDAR_MONTH, 
                    focused_border_color=cor_icone, value=p_ini
                )
                c_fim = ft.TextField(
                    label=f"Fim {label}", 
                    width=135, height=45, text_size=12, 
                    read_only=True, prefix_icon=ft.Icons.CALENDAR_MONTH, 
                    focused_border_color=cor_icone, value=p_fim
                )

                dp_i = ft.DatePicker(on_change=lambda e, campo=c_ini: atualizar_campo_data(e, campo))
                dp_f = ft.DatePicker(on_change=lambda e, campo=c_fim: atualizar_campo_data(e, campo))
                page.overlay.extend([dp_i, dp_f])

                c_ini.on_click = lambda e, dp=dp_i: _abrir_calendario(dp)
                c_fim.on_click = lambda e, dp=dp_f: _abrir_calendario(dp)

                linha = ft.Row([c_ini, c_fim], alignment=ft.MainAxisAlignment.CENTER, spacing=10)
                coluna_datas_custom.controls.append(linha)
                elementos_data.append({'ini': c_ini, 'fim': c_fim, 'p_ini': p_ini, 'p_fim': p_fim})

            def atualizar_campo_data(e, campo):
                if e.control.value:
                    campo.value = e.control.value.strftime("%d/%m/%Y")
                    campo.update()

            def _abrir_calendario(dp):
                dp.open = True
                page.update()

            # --- COMPONENTE SEGMENTED CONTROL ---
            pill = ft.Container(
                bgcolor=ft.Colors.WHITE,
                border_radius=25,
                width=122,
                height=34,
                left=4,
                top=4,
                animate_position=ft.Animation(400, ft.AnimationCurve.DECELERATE)
            )

            txt_padrao_btn = ft.Text("Data Padrão", size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.BLACK)
            txt_custom_btn = ft.Text("Personalizada", size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE70)

            def set_modo(modo):
                nonlocal modo_selecionado
                modo_selecionado = modo
                is_custom = (modo == "custom")
                
                pill.left = 4 if modo == "padrao" else 130
                txt_padrao_btn.color = ft.Colors.BLACK if modo == "padrao" else ft.Colors.WHITE70
                txt_custom_btn.color = ft.Colors.BLACK if modo == "custom" else ft.Colors.WHITE70
                
                display_padrao.visible = not is_custom
                coluna_datas_custom.visible = is_custom
                card.update()

            segmented_control = ft.Container(
                bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE),
                border_radius=30,
                width=260,
                height=42,
                content=ft.Stack([
                    pill,
                    ft.Row([
                        ft.Container(
                            content=txt_padrao_btn, expand=True, alignment=ft.Alignment.CENTER, 
                            on_click=lambda _: set_modo("padrao"), border_radius=30
                        ),
                        ft.Container(
                            content=txt_custom_btn, expand=True, alignment=ft.Alignment.CENTER, 
                            on_click=lambda _: set_modo("custom"), border_radius=30
                        ),
                    ], spacing=0)
                ])
            )

            # --- DISPLAY DATA PADRÃO ---
            badges_preview = ft.Column(spacing=5, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
            for c in config_datas:
                prefix_label = f"{c['label']}: " if c['label'] else ""
                display_txt = f"{prefix_label}{extrair_dia_mes(c['ini'])} a {extrair_dia_mes(c['fim'])}" if c['ini'] != c['fim'] else f"{prefix_label}{extrair_dia_mes(c['ini'])}"
                
                badges_preview.controls.append(
                    ft.Container(
                        content=ft.Text(display_txt, size=11, weight=ft.FontWeight.BOLD, color=cor_icone),
                        bgcolor=ft.Colors.with_opacity(0.12, cor_icone),
                        padding=ft.Padding(15, 3, 15, 3),
                        border_radius=10,
                        border=ft.Border.all(1, ft.Colors.with_opacity(0.2, cor_icone))
                    )
                )

            display_padrao = ft.Column([
                ft.Text("Utiliza o cronograma oficial da operação:", size=11, color=ft.Colors.WHITE38),
                badges_preview
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=10, animate_opacity=400)

            area_config_inputs = ft.Column([
                segmented_control,
                display_padrao,
                coluna_datas_custom,
            ], spacing=15, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

            badges_datas = ft.Column(
                spacing=8, 
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                visible=False
            )

            # --- BOTÃO RODAR E PROGRESSO ---
            btn_text = ft.Text("RODAR ROBÔ", weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
            bg_progress = ft.ProgressBar(
                value=None, visible=False, 
                color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE), 
                bgcolor="transparent", height=50, border_radius=18
            )
            
            controle_robo = {"cancelar": False, "rodando": False}
            
            def disparar_cancelamento(e):
                controle_robo["cancelar"] = True
                btn_text.value = "PARANDO..."
                btn_infinite.disabled = True
                card.update()

            def disparar_automacao(e):
                argumentos_finais = []
                badges_datas.controls.clear()
                
                for el in elementos_data:
                    v_ini = el['p_ini'] if modo_selecionado == "padrao" else el['ini'].value
                    v_fim = el['p_fim'] if modo_selecionado == "padrao" else el['fim'].value
                    argumentos_finais.extend([v_ini, v_fim])
                    
                    lbl = el['ini'].label.replace("Ini ", "")
                    lbl_txt = f"{lbl}: " if lbl else ""
                    display_txt = f"{lbl_txt}{extrair_dia_mes(v_ini)} a {extrair_dia_mes(v_fim)}" if v_ini != v_fim else f"{lbl_txt}{extrair_dia_mes(v_ini)}"
                    
                    badges_datas.controls.append(
                        ft.Container(
                            content=ft.Text(display_txt, size=13, weight=ft.FontWeight.BOLD, color=cor_icone),
                            bgcolor=ft.Colors.with_opacity(0.1, cor_icone),
                            padding=ft.Padding(15, 5, 15, 5),
                            border_radius=12,
                            border=ft.Border.all(1, ft.Colors.with_opacity(0.3, cor_icone))
                        )
                    )

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
                
                threading.Thread(target=executar_em_background, args=(argumentos_finais,), daemon=True).start()

            btn_infinite = ft.Container(
                content=ft.Stack([
                    bg_progress,
                    ft.Container(content=btn_text, alignment=ft.Alignment.CENTER, expand=True),
                ]),
                bgcolor=cor_icone,
                width=280, height=50, border_radius=18,
                on_click=lambda e: disparar_automacao(e) if not controle_robo["rodando"] else disparar_cancelamento(e),
                on_hover=lambda e: setattr(btn_infinite, 'scale', 1.05 if e.data == "true" and not controle_robo["rodando"] else 1.0) or (setattr(btn_text, 'color', ft.Colors.RED_300 if e.data == "true" and controle_robo["rodando"] else ft.Colors.WHITE) or btn_infinite.update()),
                animate=ft.Animation(300, "decelerate"),
                clip_behavior=ft.ClipBehavior.HARD_EDGE
            )

            texto_progresso = ft.Text("Preparando robô...", size=12, color=ft.Colors.WHITE54, visible=False)

            def on_progress(valor, mensagem):
                texto_progresso.value = mensagem
                try: texto_progresso.update()
                except: pass

            def executar_em_background(args_datas):
                try:
                    func_robo(id_logado, *args_datas, callback_progresso=on_progress, hook_cancelamento=lambda: controle_robo["cancelar"])
                    on_progress(1.0, "Sucesso! 🎉")
                    mostrar_aviso(f"{titulo} finalizado!", "green800")
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
                    except: pass
                    
                    time.sleep(8)
                    if not controle_robo["rodando"]:
                        texto_progresso.visible = False
                        area_config_inputs.visible = True
                        badges_datas.visible = False
                        try: card.update()
                        except: pass

            header_config = ft.Row([
                ft.IconButton(
                    ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, on_click=lambda e: alternar_tamanho(e), 
                    icon_size=18, icon_color=cor_icone
                ),
                ft.Container(content=ft.Text("Configurações", weight=ft.FontWeight.BOLD, size=16), expand=True, padding=ft.Padding(0, 0, 35, 0)),
            ], alignment=ft.MainAxisAlignment.CENTER)

            conteudo_extra = ft.Container(
                content=ft.Column([
                    header_config,
                    ft.Column([area_config_inputs, badges_datas], expand=True, scroll=ft.ScrollMode.HIDDEN, spacing=10),
                    ft.Column([
                        ft.Container(content=texto_progresso, alignment=ft.Alignment.CENTER),
                        btn_infinite,
                    ], spacing=5, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                ], spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER), 
                key="config", expand=True
            )

            cabecalho = ft.Container(
                content=ft.Column([
                    ft.Row([
                        ft.Icon(icone, color=cor_icone, size=40), 
                        ft.Text(titulo, size=20, weight=ft.FontWeight.BOLD), 
                        ft.Container(expand=True), 
                        ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER), 
                    ft.Container(height=10), 
                    ft.Text(descricao, size=15, color=ft.Colors.WHITE54)
                ]), 
                on_click=lambda e: alternar_tamanho(e), ink=True, border_radius=10, padding=10, key="front"
            )

            animador = ft.AnimatedSwitcher(content=cabecalho, transition=ft.AnimatedSwitcherTransition.FADE, duration=400)

            def alternar_tamanho(e):
                animador.content = conteudo_extra if animador.content.key == "front" else cabecalho
                card.update()
                
            card = ft.Container(
                content=animador, padding=15, **glass_card_style, 
                on_hover=lambda e: setattr(card, 'scale', 1.05 if e.data == "true" else 1.0) or card.update(),
                col={"xs": 12, "md": 6, "xl": 4}, height=320 
            )
            return card

        def criar_card_cofre():
            # Estilo dos inputs com fundo mais opaco para os dropdowns não ficarem transparentes
            estilo_input = {
                "border_radius": 15, 
                "expand": True,
                "height": 55, 
                "bgcolor": "#1a1a2e", 
                "focused_border_color": ft.Colors.ORANGE_400,
                "text_size": 15
            }
            
            btn_ir_cadastrar = ft.Container(
                content=ft.Column([
                    ft.Icon(
                        ft.Icons.ADD_MODERATOR_ROUNDED, 
                        size=34, 
                        color=ft.Colors.ORANGE_300
                    ), 
                    ft.Text("NOVO", weight=ft.FontWeight.BOLD, size=12)], 
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                padding=15, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE), border_radius=20, on_click=lambda _: mudar_view("cadastro"), ink=True, expand=True
            )
            btn_ir_consultar = ft.Container(
                content=ft.Column([
                    ft.Icon(ft.Icons.KEY_ROUNDED, size=34, color=ft.Colors.BLUE_300), 
                    ft.Text("CONSULTAR", weight=ft.FontWeight.BOLD, size=12)], 
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                padding=15, 
                bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE), 
                border_radius=20, 
                on_click=lambda _: mudar_view("consulta"), 
                ink=True, 
                expand=True
            )

            view_home = ft.Stack([
                ft.Column([
                    ft.Text(
                        "O que deseja fazer?", 
                        size=16, 
                        weight=ft.FontWeight.W_500
                    ), 
                    ft.Row([
                        btn_ir_cadastrar, 
                        btn_ir_consultar
                    ], 
                    alignment=ft.MainAxisAlignment.CENTER, 
                    spacing=10
                )], 
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
                    spacing=20, 
                    visible=True,
                ),
                ft.IconButton(
                    ft.Icons.CLOSE_ROUNDED,
                    on_click=lambda _: setattr(dialog_cofre, 'open', False) or page.update(),
                    top=-10,
                    right=-10,
                    icon_color=ft.Colors.WHITE24,
                    icon_size=20,
                    tooltip="Fechar"
                )
            ], key="home")

            dropdown_cad = ft.Dropdown(
                label="Site", 
                options=[ft.dropdown.Option("ADM de Vendas"), ft.dropdown.Option("EBUS")], 
                **estilo_input
            )
            campo_user = ft.TextField(
                label="Login", 
                **estilo_input
            )
            campo_pass = ft.TextField(
                label="Senha", 
                password=True, 
                can_reveal_password=True, 
                **estilo_input
            )
            
            def salvar_clique(e):
                adicionar_credencial_site(id_logado, dropdown_cad.value, campo_user.value, campo_pass.value)
                mostrar_aviso("Salvo!", "green800")
                mudar_view("home")

            btn_salvar = ft.FilledButton(
                "SALVAR CREDENCIAL", 
                bgcolor=ft.Colors.ORANGE_700, 
                color=ft.Colors.WHITE, 
                expand=True,
                height=50, 
                on_click=salvar_clique, 
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15))
            )
            
            view_cadastro = ft.Column([
                ft.Stack([
                    ft.Container(
                        content=ft.Text("Novo Cadastro", size=22, weight=ft.FontWeight.BOLD), 
                        alignment=ft.Alignment.CENTER
                    ),
                    ft.IconButton(
                        ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, 
                        on_click=lambda _: mudar_view("home"), 
                        icon_size=18, 
                        left=0, 
                        top=5, 
                        tooltip="Voltar"
                    ),
                ], height=50),
                
                # Scroll Interno para os campos
                ft.Column([
                    dropdown_cad, 
                    campo_user, 
                    campo_pass, 
                ], 
                expand=True, 
                scroll=ft.ScrollMode.HIDDEN, 
                spacing=10, 
                horizontal_alignment=ft.CrossAxisAlignment.CENTER
                ),
                
                # Rodapé Fixo
                ft.Container(
                    content=btn_salvar, 
                    padding=ft.Padding(0, 10, 0, 0)
                )
            ], 
            spacing=0, 
            key="cadastro", 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
            expand=True
            )

            # --- View de Consulta (Revele com Senha Mestra) ---
            dropdown_cons = ft.Dropdown(
                label="Site", 
                options=[
                    ft.dropdown.Option("ADM de Vendas"), 
                    ft.dropdown.Option("EBUS")
                ], 
                **estilo_input
            )
            campo_mestra = ft.TextField(
                label="Sua Senha Mestra", 
                password=True, 
                **estilo_input, 
                on_submit=lambda _: consultar_clique(None)
            )
            
            # Referências diretas para evitar erros de índice
            txt_user_val = ft.Text(
                "", 
                size=20, 
                weight=ft.FontWeight.BOLD, 
                color=ft.Colors.WHITE, 
                selectable=True
            )
            txt_pass_val = ft.Text(
                "", 
                size=20, 
                weight=ft.FontWeight.BOLD, 
                color=ft.Colors.GREEN_400, 
                selectable=True
            )

            cont_resultado_cons = ft.Container(
                content=ft.Column([
                    ft.Text("Dados de Acesso", 
                    size=14, 
                    color=ft.Colors.CYAN_300, 
                    weight=ft.FontWeight.W_600
                    ),
                    ft.Divider(height=1, color=ft.Colors.WHITE10),
                    ft.Column([
                        ft.Text("USUÁRIO", 
                        size=10, 
                        color=ft.Colors.WHITE54, 
                        weight=ft.FontWeight.BOLD
                        ),
                        txt_user_val,
                        ft.Container(height=5),
                        ft.Text("SENHA", 
                        size=10, 
                        color=ft.Colors.WHITE54, 
                        weight=ft.FontWeight.BOLD
                        ),
                        txt_pass_val,
                    ], spacing=2),
                ], spacing=12),
                padding=20, 
                bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.BLACK), 
                border_radius=20, 
                visible=False,
                expand=True,
                border=ft.Border.all(1, ft.Colors.WHITE10)
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

            btn_revelar = ft.FilledButton(
                "REVELAR ACESSO", 
                bgcolor=ft.Colors.BLUE_700, 
                color=ft.Colors.WHITE, 
                expand=True,
                height=50, 
                on_click=consultar_clique, 
                style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15))
            )
            
            view_consulta = ft.Column([
                ft.Stack([
                    ft.Container(
                        content=ft.Text("Consulta Segura", size=22, weight=ft.FontWeight.BOLD), 
                        alignment=ft.Alignment.CENTER
                    ),
                    ft.IconButton(
                        ft.Icons.ARROW_BACK_IOS_NEW_ROUNDED, 
                        on_click=lambda _: mudar_view("home"), 
                        icon_size=18, 
                        left=0, 
                        top=5, 
                        tooltip="Voltar"
                    ),
                ], height=50),
                
                # Scroll Interno para os campos e resultados
                ft.Column([
                    dropdown_cons, 
                    campo_mestra, 
                    msg_erro_cons,
                    cont_resultado_cons
                ], expand=True, 
                scroll=ft.ScrollMode.HIDDEN, 
                spacing=10, 
                horizontal_alignment=ft.CrossAxisAlignment.CENTER
                ),
                
                # Rodapé Fixo
                ft.Container(
                    content=btn_revelar, 
                    padding=ft.Padding(0, 10, 0, 0)
                )
            ], 
            spacing=0, 
            key="consulta", 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER, 
            expand=True
            )

            dialog_cofre = ft.AlertDialog(
                content=ft.Container(
                    padding=25, 
                    width=500, 
                    height=200,
                    alignment=ft.Alignment.CENTER, 
                    key="dialog_cont",
                    animate=ft.Animation(450, ft.AnimationCurve.DECELERATE)
                ), 
                bgcolor=ft.Colors.with_opacity(0.9, "#1a1a2e")
            )
            
            def abrir_dialog_cofre(e):
                # Primeiro garantimos que o diálogo está no overlay
                if dialog_cofre not in page.overlay:
                    page.overlay.append(dialog_cofre)
                
                # Configuramos o estado inicial sem forçar update individual
                mudar_view("home", force_update=False)
                
                # Abrimos o diálogo
                dialog_cofre.open = True
                
                # Update ÚNICO na página processa tudo (overlay + conteúdo do dialog)
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
                
                # Se for uma mudança com o diálogo já aberto, usamos page.update() que é mais seguro
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
                on_click=abrir_dialog_cofre, 
                ink=True, 
                border_radius=10, 
                padding=10
            )
            card = ft.Container(
                content=cabecalho, 
                padding=15, 
                **glass_card_style, 
                on_hover=lambda e: setattr(card, 'scale', 1.05 if e.data == "true" else 1.0) or card.update(),
                col={"xs": 12, "md": 6, "xl": 4}, 
                height=320
            )
            return card

        def criar_card_pax_calc():
            estilo_input = {
                "border_radius": 15, 
                "expand": True,
                "height": 55, 
                "bgcolor": "#1a1a2e", 
                "text_size": 15,
                "focused_border_color": ft.Colors.CYAN_400
            }
            
            # Controle de modo do preço (Direto ou Redução)
            modo_venda = ft.Text("PREÇO FINAL", size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300)
            exibir_porcentagem = ft.Text("False", visible=False) # Helper invisível para estado
            last_res = {"val": None} # Cache para recalculagem visual rápida
            
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
            
            tipo_onibus = ft.Dropdown(
                label="Tipo de Ônibus", expand=True, height=55, border_radius=15,
                bgcolor="#1a1a2e",
                options=[ft.dropdown.Option(x) for x in ["CONV", "CAMA EXECUTIVO", "EXECUTIVO", "EXECUTIVO CONVENCIONAL", "CAMA CONVENCIONAL", "CAMA SEMILEITO", "SEMILEITO EXECUTIVO", "CONVENCIONAL DD"]],
                value="CONV"
            )

            col_resultado = ft.Column(spacing=20, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

            def mostrar_resultados(res):
                last_res["val"] = res
                def fmt_br(v):
                    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

                def sec_titulo(texto):
                    return ft.Container(
                        content=ft.Text(texto.upper(), size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300, opacity=0.8),
                        margin=ft.Padding(0, 15, 0, 5)
                    )

                def mini_indicator(label, valor, cor=ft.Colors.WHITE, sub=""):
                    return ft.Column([
                        ft.Text(label, size=9, color=ft.Colors.WHITE38, weight=ft.FontWeight.BOLD),
                        ft.Text(valor, size=18, weight=ft.FontWeight.BOLD, color=cor),
                        ft.Text(sub, size=10, color=ft.Colors.CYAN_300 if "Diferença" in sub else ft.Colors.WHITE24) if sub else ft.Container()
                    ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER)

                def card_triplo(titulo, v_atual, v_floor, v_ceil, is_currency=True, label_piso="PISO", label_teto="TETO", is_int=False, font_size_val=16):
                    def get_metric(val, is_curr):
                        if val is None: return ""
                        if isinstance(val, str): return val
                        if is_int: return f"{int(val)}"
                        return fmt_br(val) if is_curr else f"{val:.1f}"

                    def get_dif_view(atual, final):
                        if atual is None or not isinstance(atual, (int, float)) or not isinstance(final, (int, float)): 
                            return ft.Text("", height=15)
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
                    # Coluna Atual (Opcional)
                    if v_atual is not None:
                        cols.append(ft.Column([
                            ft.Text("ATUAL", size=8, color=ft.Colors.WHITE24),
                            ft.Text(get_metric(v_atual, is_currency), size=14, weight=ft.FontWeight.W_500),
                            ft.Text("", height=15)
                        ], spacing=2, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    # Coluna Piso / Novo
                    if v_floor is not None:
                        if len(cols) > 0:
                            cols.append(ft.Container(content=ft.VerticalDivider(width=1, color=ft.Colors.WHITE10), height=35))
                        
                        label_p = "VALOR NOVO" if v_floor == v_ceil else label_piso
                        cols.append(ft.Column([
                            ft.Text(label_p, size=8, color=ft.Colors.GREEN_900),
                            ft.Text(get_metric(v_floor, is_currency), size=font_size_val, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_300),
                            get_dif_view(v_atual, v_floor)
                        ], spacing=1, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    # Coluna Teto (Opcional - só mostra se for diferente do Piso)
                    if v_ceil is not None and v_ceil != v_floor:
                        if len(cols) > 0:
                            cols.append(ft.Container(content=ft.VerticalDivider(width=1, color=ft.Colors.WHITE10), height=35))
                        
                        cols.append(ft.Column([
                            ft.Text(label_teto, size=8, color=ft.Colors.CYAN_900),
                            ft.Text(get_metric(v_ceil, is_currency), size=font_size_val, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_300),
                            get_dif_view(v_atual, v_ceil)
                        ], spacing=1, horizontal_alignment=ft.CrossAxisAlignment.CENTER))

                    return ft.Container(
                        padding=15, border_radius=25, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.BLACK),
                        border=ft.Border.all(1, ft.Colors.WHITE10),
                        content=ft.Column([
                            ft.Text(titulo, size=9, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE38, text_align=ft.TextAlign.CENTER),
                            ft.Row(cols, alignment=ft.MainAxisAlignment.SPACE_AROUND, vertical_alignment=ft.CrossAxisAlignment.CENTER)
                        ], spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                    )

                banner = ft.Container(
                    padding=15, border_radius=22, bgcolor=ft.Colors.with_opacity(0.12, ft.Colors.CYAN_900),
                    border=ft.Border.all(1, ft.Colors.CYAN_800),
                    margin=ft.Padding(10, 0, 10, 0),
                    content=ft.ResponsiveRow([
                        ft.Column([ft.Icon(ft.Icons.AUTO_GRAPH_ROUNDED, color=ft.Colors.CYAN_300, size=32)], col={"xs": 2, "sm": 1}),
                        ft.Column([
                            ft.Text("CONCLUSÃO ESTRATÉGICA", size=12, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_200),
                            ft.Text(
                                f"Redução bruta de {fmt_br(res['reducao_valor'])} exige um aumento de volume p/ viagem de +{int(res['pax_extra_floor'])} a +{int(res['pax_extra_ceil'])} passageiros. "
                                f"O ponto de equilíbrio técnico é atingido com {res['pax_extra_vlr']} novos pax.",
                                size=12, color=ft.Colors.WHITE70
                            )
                        ], spacing=3, col={"xs": 10, "sm": 11})
                    ], vertical_alignment=ft.CrossAxisAlignment.CENTER)
                )

                grid = ft.ResponsiveRow([
                    # Linha 1: Foco em Operação 
                    ft.Container(col={"xs": 12, "sm": 6, "md": 4}, content=card_triplo("PASSAGEIROS EXTRA NECESSÁRIOS", None, res['pax_extra_floor'], res['pax_extra_ceil'], is_currency=False, label_piso="+ PISO", label_teto="+ TETO", is_int=True)),
                    ft.Container(col={"xs": 12, "sm": 6, "md": 4}, content=card_triplo("VOLUME TOTAL DE PAX", None, res['floor']['pax_total'], res['ceil']['pax_total'], is_currency=False, is_int=True)),
                    ft.Container(col={"xs": 12, "sm": 12, "md": 4}, content=card_triplo("TARIFA LÍQUIDA (NET)", res['tarifa_liq_atual'], res['tarifa_liq_nova'], res['tarifa_liq_nova'])),
                    
                    # Linha 2: Volume Bruto e Rentabilidade
                    ft.Container(col={"xs": 12, "md": 6}, content=card_triplo("FATURAMENTO BRUTO ESTIMADO", res['rec_bruta_atual'], res['floor']['rec_bruta'], res['ceil']['rec_bruta'])),
                    ft.Container(col={"xs": 12, "md": 6}, content=card_triplo("RENTABILIDADE DA OPERAÇÃO (R$ / KM)", res['rec_km_atual'], res['floor']['rec_km'], res['ceil']['rec_km'])),

                    # Linha 3: Receita Líquida (Destaque Principal)
                    ft.Container(col={"xs": 12}, content=card_triplo("RECEITA LÍQUIDA TOTAL (PROFIT)", res['rec_liq_atual'], res['floor']['rec_liq'], res['ceil']['rec_liq'], font_size_val=22)),
                ], spacing=15, run_spacing=15)

                rodape = ft.Container(
                    padding=20, border_radius=25, bgcolor=ft.Colors.with_opacity(0.04, ft.Colors.WHITE),
                    margin=ft.Padding(10, 0, 10, 0),
                    content=ft.ResponsiveRow([
                        ft.Column([mini_indicator("PREÇO FINAL (BRUTO)", fmt_br(res['p_nv_internal']), ft.Colors.CYAN_200, f"Dif: {fmt_br(res['reducao_valor'])}")], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([mini_indicator("OCUPAÇÃO", f"{res['ocupacao_atual']:.1f}% ➜ {res['ocupacao_meta']:.1f}%", ft.Colors.CYAN_100)], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Column([mini_indicator("META UNITÁRIA", f"{res['floor']['pax_total']} a {res['ceil']['pax_total']}", ft.Colors.AMBER_400, "Pax p/ Viagem")], col={"xs": 12, "sm": 4}, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                    ], spacing=10, run_spacing=20)
                )

                col_resultado.controls = [
                    sec_titulo("Dashboard de Performance"),
                    banner,
                    ft.Container(content=grid, padding=ft.Padding(10, 0, 10, 0)),
                    sec_titulo("Indicadores Técnicos"),
                    rodape,
                    ft.Container(height=20)
                ]
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
                    
                    # Trata o modo de preço (Direto ou Desconto)
                    p_nv = p_at - val_novo_input if modo_venda.value == "VALOR REDUÇÃO" else val_novo_input
                    
                    px_at = parse_vlr(campo_pax_atual.value)
                    vgs = parse_vlr(campo_viagens.value)
                    km = parse_vlr(campo_km.value)
                    ped = parse_vlr(campo_pedagio.value)
                    tax = parse_vlr(campo_taxa.value)

                    if km <= 0: km = 1
                    if vgs <= 0: vgs = 1
                    if p_nv <= 0: p_nv = 0.01

                    res = calculadora_elasticidade_pax(p_at, p_nv, px_at, vgs, get_capacidade(tipo_onibus.value or "CONV"), km, ped, tax)
                    
                    # Injetar valores originais para o card_triplo
                    res['pax_atual_internal'] = px_at
                    res['p_at_internal'] = p_at
                    res['p_nv_internal'] = p_nv
                    
                    mostrar_resultados(res)
                except Exception as ex:
                    import traceback
                    traceback.print_exc()
                    mostrar_aviso(f"Erro no processamento: {str(ex)}")

            btn_calc = ft.FilledButton("ANALISAR ESTRATÉGIA", bgcolor=ft.Colors.CYAN_700, color=ft.Colors.WHITE, height=55, on_click=calcular, style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15)))
            btn_recalc = ft.IconButton(ft.Icons.REPLAY_ROUNDED, visible=False, on_click=lambda _: mudar_view_pax("inputs"), icon_color=ft.Colors.CYAN_300, tooltip="Novo Cálculo", icon_size=28)

            view_inputs = ft.Column([
                ft.Text("Configure os parâmetros de preço e custos da operação.", size=14, color=ft.Colors.WHITE54),
                ft.Container(height=10),
                ft.Row([modo_venda, btn_modo], alignment=ft.MainAxisAlignment.CENTER, spacing=5),
                ft.ResponsiveRow([
                    ft.Column([campo_preco_atual], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_preco_novo], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_pax_atual], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_viagens], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_km], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_pedagio], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([campo_taxa], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                    ft.Column([tipo_onibus], col={"xs": 12, "sm": 6}, horizontal_alignment=ft.CrossAxisAlignment.STRETCH),
                ], spacing=15, run_spacing=10),
                ft.Container(height=15),
                ft.Row([btn_calc], alignment=ft.MainAxisAlignment.CENTER, expand=True)
            ], spacing=0, horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="inputs")

            view_results = ft.Column([col_resultado], horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="results", scroll=ft.ScrollMode.HIDDEN, expand=True)

            dialog_pax = ft.AlertDialog(
                content=ft.Container(
                    width=980, height=550, padding=15,
                    content=ft.Column([
                        ft.Row([
                            ft.IconButton(ft.Icons.CLOSE_ROUNDED, on_click=lambda _: setattr(dialog_pax, 'open', False) or page.update(), icon_color=ft.Colors.WHITE54),
                            ft.Text("Simulador de Elasticidade", size=20, weight=ft.FontWeight.BOLD),
                            ft.Container(expand=True),
                            btn_metrica,
                            btn_recalc
                        ]),
                        ft.Divider(height=1, color=ft.Colors.WHITE10),
                        ft.Container(height=15),
                        ft.Column([view_inputs, view_results], scroll=ft.ScrollMode.HIDDEN, expand=True, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
                    ]),
                    animate=ft.Animation(500, ft.AnimationCurve.DECELERATE)
                ), bgcolor=ft.Colors.with_opacity(0.98, "#0a0a12")
            )

            def mudar_view_pax(qual):
                view_inputs.visible = (qual == "inputs")
                view_results.visible = (qual == "results")
                btn_recalc.visible = (qual == "results")
                btn_metrica.visible = (qual == "results")
                dialog_pax.content.height = 550 if qual == "inputs" else 850
                page.update()

            def abrir_calculadora(e):
                if dialog_pax not in page.overlay: page.overlay.append(dialog_pax)
                mudar_view_pax("inputs")
                dialog_pax.open = True
                page.update()

            card = ft.Container(
                content=ft.Container(
                    content=ft.Column([
                        ft.Row([
                            ft.Icon(ft.Icons.CALCULATE_ROUNDED, color=ft.Colors.CYAN_300, size=40), 
                            ft.Text("Pax Calc", size=20, weight=ft.FontWeight.BOLD), 
                            ft.Container(expand=True), 
                            ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)
                        ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                        ft.Container(height=10), 
                        ft.Text("Análise de elasticidade e KM.", size=15, color=ft.Colors.WHITE54)
                    ]),
                    padding=10,
                    on_click=abrir_calculadora,
                    ink=True,
                    border_radius=10
                ), 
                padding=15, 
                **glass_card_style, 
                on_hover=lambda e: setattr(card, 'scale', 1.05 if e.data == "true" else 1.0) or card.update(),
                col={"xs": 12, "md": 6, "xl": 4}, 
                height=320 
            )
            return card

        header = ft.Container(
            content=ft.ResponsiveRow([
                ft.Column([
                    ft.Text(f"Olá, {nome_usuario} 👋", size=28, weight=ft.FontWeight.BOLD, no_wrap=False)
                ], col={"xs": 9, "sm": 10}), 
                ft.Column([
                    ft.IconButton(
                        ft.Icons.LOGOUT, 
                        icon_color=ft.Colors.RED_400, 
                        on_click=ir_para_login,
                        tooltip="Sair"
                    )
                ], col={"xs": 3, "sm": 2}, horizontal_alignment=ft.CrossAxisAlignment.END)
            ], vertical_alignment=ft.CrossAxisAlignment.CENTER), 
            margin=ft.Padding(30, 25, 30, 10), 
            padding=25, 
            bgcolor=ft.Colors.with_opacity(0.15, ft.Colors.BLACK), 
            blur=ft.Blur(15, 15), 
            border_radius=25
        )

        grade_cards = ft.ResponsiveRow(
            spacing=30, run_spacing=30,
            controls=[
                criar_card_robo(
                    "ADM de Vendas", 
                    ft.Icons.BAR_CHART_ROUNDED, 
                    "Extração de Demandas.", 
                    ft.Colors.BLUE_300, 
                    executar_adm, 
                    [{'label': '', 'ini': ADM_INICIO, 'fim': ADM_FIM}]
                ),
                criar_card_robo(
                    "EBUS Revenue", 
                    ft.Icons.ATTACH_MONEY_ROUNDED, 
                    "Relatório Financeiro.", 
                    ft.Colors.GREEN_300, 
                    executar_ebus, 
                    [{'label': '', 'ini': EBUS_INICIO, 'fim': EBUS_FIM}]
                ),
                criar_card_robo(
                    "Relatório Rio x SP", 
                    ft.Icons.EMAIL_ROUNDED, 
                    "E-mail e Base Rio.", 
                    ft.Colors.ORANGE_300, 
                    executar_sr, [
                    {'label': 'Email', 'ini': SR_FIM, 'fim': SR_FIM},
                    {'label': 'Base', 'ini': SR_INI, 'fim': SR_INI}
                ]),
                criar_card_pax_calc(),
                criar_card_cofre()
            ]
        )

        dashboard = ft.Column([
            header, 
            ft.Container(
                content=ft.Column([grade_cards], scroll=ft.ScrollMode.HIDDEN), 
                padding=ft.Padding(40, 30, 40, 40), 
                expand=True
            )], 
            expand=True
        )
        camada_conteudo.content = dashboard
        camada_conteudo.update()

    page.add(layout_principal)
    ir_para_login()
    
    # Inicia a thread de animação do background de forma independente da Interface
    threading.Thread(target=animar_fundo, daemon=True).start()

if __name__ == "__main__":
    ft.run(main)
