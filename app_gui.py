# app_gui.py

import flet as ft # type: ignore
import calendar
import threading # <-- O segredo para não travar a tela
from datetime import datetime
from datetime import timedelta

from core.banco import (inicializar_env, configurar_banco, 
                        login_principal, cadastrar_usuario_principal, 
                        adicionar_credencial_site, buscar_credencial_site, verificar_senha_mestra) # type: ignore 
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


async def main(page: ft.Page):
    page.title = "Sistema de Automações - JCA"
    page.window.width = 1220
    page.window.height = 750
    await page.window.center()
    page.theme_mode = ft.ThemeMode.DARK
    page.bgcolor = "#121212"
    
    # Rolagem nativa ultra suave (ALWAYS força a física do Flutter)
    page.theme = ft.Theme(
        scrollbar_theme=ft.ScrollbarTheme(
            track_color={ft.ControlState.DEFAULT: ft.Colors.TRANSPARENT},
            thumb_color={ft.ControlState.DEFAULT: ft.Colors.WHITE24},
            thickness={ft.ControlState.DEFAULT: 8},
            radius=10, interactive=True,
        )
    )

    def mostrar_aviso(mensagem, cor="red900"):
        snack = ft.SnackBar(content=ft.Text(mensagem, color=ft.Colors.WHITE, weight=ft.FontWeight.BOLD), bgcolor=cor)
        page.overlay.append(snack)
        snack.open = True
        page.update()

    def ir_para_cadastro(e):
        page.controls.clear()
        page.add(caixa_cadastro)
        page.update()

    def ir_para_login(e=None):
        page.controls.clear()
        page.horizontal_alignment = ft.CrossAxisAlignment.CENTER
        page.vertical_alignment = ft.MainAxisAlignment.CENTER
        page.appbar = None 
        page.add(caixa_login)
        page.update()

    def tentar_login(e):
        id_logado, nome = login_principal(campo_usuario_login.value, campo_senha_login.value)
        if id_logado: mostrar_dashboard(id_logado, nome)
        else: mostrar_aviso("Usuário ou senha incorretos.")

    def tentar_cadastro(e):
        if cadastrar_usuario_principal(campo_nome_cad.value, campo_usuario_cad.value, campo_senha_cad.value):
            mostrar_aviso("Cadastro realizado! Faça login.", "green800")
            ir_para_login()

    # --- TELAS DE LOGIN ---
    campo_usuario_login = ft.TextField(
        label="Usuário", 
        prefix_icon=ft.Icons.PERSON, 
        border_radius=15, 
        width=300, 
        on_submit=tentar_login
    )
    campo_senha_login = ft.TextField(
        label="Senha", 
        prefix_icon=ft.Icons.LOCK, 
        password=True, 
        can_reveal_password=True, 
        border_radius=15, 
        width=300, 
        on_submit=tentar_login
    )
    btn_entrar = ft.ElevatedButton(
        content=ft.Text("ENTRAR", weight=ft.FontWeight.BOLD), 
        width=300, 
        height=50, 
        style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15), 
        bgcolor=ft.Colors.BLUE_700, 
        color=ft.Colors.WHITE), 
        on_click=tentar_login
    )
    caixa_login = ft.Container(
        content=ft.Column([
            ft.Icon(
                ft.Icons.ROCKET_LAUNCH_ROUNDED, 
                size=70, 
                color=ft.Colors.BLUE_500
            ), 
            ft.Text(
                "JCA Automações", 
                size=26, 
                weight=ft.FontWeight.BOLD
            ), 
            ft.Container(height=20), 
            campo_usuario_login, 
            campo_senha_login, 
            ft.Container(height=10), 
            btn_entrar, 
            ft.TextButton(content=ft.Text("Criar conta"), on_click=ir_para_cadastro)], 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER), 
            padding=40, 
            border_radius=20, 
            bgcolor="#1E1E1E", 
            shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.Colors.BLACK26))
    
    campo_nome_cad = ft.TextField(label="Nome Completo", border_radius=15, width=300)
    campo_usuario_cad = ft.TextField(label="Usuário", border_radius=15, width=300)
    campo_senha_cad = ft.TextField(label="Senha", password=True, border_radius=15, width=300)
    btn_salvar_cad = ft.ElevatedButton(
        content=ft.Text("CADASTRAR", weight=ft.FontWeight.BOLD), 
        width=300, 
        height=50, 
        style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=15), 
        bgcolor=ft.Colors.GREEN_700, 
        color=ft.Colors.WHITE), 
        on_click=tentar_cadastro
    )
    caixa_cadastro = ft.Container(
        content=ft.Column([
            ft.Icon(
                ft.Icons.PERSON_ADD_ROUNDED, 
                size=60, 
                color=ft.Colors.GREEN_500
            ), 
            ft.Text(
                "Novo Operador", 
                size=24, 
                weight=ft.FontWeight.BOLD
            ), 
            ft.Container(height=10), 
            campo_nome_cad, 
            campo_usuario_cad, 
            campo_senha_cad, 
            ft.Container(height=10), 
            btn_salvar_cad, 
            ft.TextButton(
                content=ft.Text(
                    "Voltar", 
                    color=ft.Colors.GREY_400
                ), 
                on_click=ir_para_login
            )], 
            horizontal_alignment=ft.CrossAxisAlignment.CENTER), 
            padding=40, 
            border_radius=20, 
            bgcolor="#1E1E1E", 
            shadow=ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.Colors.BLACK26))

    # =======================================================
    # 🌟 DASHBOARD
    # =======================================================
    def mostrar_dashboard(id_logado, nome_usuario):
        page.controls.clear()
        page.horizontal_alignment = ft.CrossAxisAlignment.START
        page.vertical_alignment = ft.MainAxisAlignment.START
        page.appbar = ft.AppBar(
            title=ft.Text("Painel de Automações", weight=ft.FontWeight.BOLD), 
            bgcolor="#1E1E1E", 
            actions=[ft.IconButton(ft.Icons.LOGOUT, on_click=ir_para_login)]
        )

        def criar_card_robo(titulo, icone, descricao, cor_icone, func_robo, config_datas):
            """
            config_datas: Lista de dicionários [{'label': 'E-mail', 'ini': '...', 'fim': '...'}, ...]
            """
            elementos_data = [] 
            coluna_datas_custom = ft.Column(visible=False, spacing=5)

            for config in config_datas:
                label = config['label']
                p_ini = config['ini']
                p_fim = config['fim']

                c_ini = ft.TextField(label=f"Início {label}", width=105, height=40, text_size=11, read_only=True, value=p_ini)
                c_fim = ft.TextField(label=f"Fim {label}", width=105, height=40, text_size=11, read_only=True, value=p_fim)

                dp_i = ft.DatePicker(on_change=lambda e, campo=c_ini: atualizar_campo_data(e, campo))
                dp_f = ft.DatePicker(on_change=lambda e, campo=c_fim: atualizar_campo_data(e, campo))
                page.overlay.extend([dp_i, dp_f])

                linha = ft.Row([
                    c_ini, 
                    ft.IconButton(ft.Icons.CALENDAR_MONTH, icon_color=cor_icone, icon_size=18, on_click=lambda e, dp=dp_i: _abrir_calendario(dp)),
                    c_fim,
                    ft.IconButton(ft.Icons.CALENDAR_MONTH, icon_color=cor_icone, icon_size=18, on_click=lambda e, dp=dp_f: _abrir_calendario(dp))
                ], spacing=0, alignment=ft.MainAxisAlignment.CENTER)
                
                coluna_datas_custom.controls.append(linha)
                elementos_data.append({'ini': c_ini, 'fim': c_fim, 'p_ini': p_ini, 'p_fim': p_fim})

            def atualizar_campo_data(e, campo):
                if e.control.value: 
                    campo.value = e.control.value.strftime("%d/%m/%Y")
                    campo.update()

            def _abrir_calendario(dp):
                dp.open = True
                page.update()

            def mudar_modo(e):
                is_custom = radio_datas.value == "custom"
                coluna_datas_custom.visible = is_custom
                card.update()

            txt_padrao = "Padrão (" + " | ".join([f"{c['ini'][:5]}" for c in config_datas]) + ")"

            radio_datas = ft.RadioGroup(
                content=ft.Row([
                    ft.Radio(value="padrao", label=txt_padrao), 
                    ft.Radio(value="custom", label="Personalizado")
                ], alignment=ft.MainAxisAlignment.CENTER),
                value="padrao", 
                on_change=mudar_modo
            )

            barra_progresso = ft.ProgressBar(width=280, value=0.0, visible=False, color=cor_icone, bgcolor=ft.Colors.WHITE12)
            texto_progresso = ft.Text("Preparando robô...", size=12, color=ft.Colors.WHITE54, visible=False)
            coluna_progresso = ft.Column([texto_progresso, barra_progresso], horizontal_alignment=ft.CrossAxisAlignment.CENTER)
            linha_progresso = ft.Row([coluna_progresso], alignment=ft.MainAxisAlignment.CENTER)

            controle_robo = {"cancelar": False}
            def hook_cancelamento(): return controle_robo["cancelar"]
            
            def disparar_cancelamento(e):
                controle_robo["cancelar"] = True
                btn_cancelar.disabled = True
                btn_cancelar.content.value = "CHAMANDO RÔBO..."
                card.update()

            btn_rodar = ft.ElevatedButton(content=ft.Text("RODAR ROBÔ", weight=ft.FontWeight.BOLD), bgcolor=cor_icone, color=ft.Colors.WHITE, width=280)
            btn_cancelar = ft.ElevatedButton(content=ft.Text("CANCELAR", weight=ft.FontWeight.BOLD), bgcolor=ft.Colors.RED_700, color=ft.Colors.WHITE, width=280, visible=False, on_click=disparar_cancelamento)
            linha_btn = ft.Row([btn_rodar, btn_cancelar], alignment=ft.MainAxisAlignment.CENTER)

            def on_progress(valor, mensagem):
                barra_progresso.value = float(valor)
                texto_progresso.value = mensagem
                barra_progresso.update()
                texto_progresso.update()

            def executar_em_background(args_datas):
                try:
                    func_robo(id_logado, *args_datas, callback_progresso=on_progress, hook_cancelamento=hook_cancelamento)
                    on_progress(1.0, "Sucesso! 🎉")
                    mostrar_aviso(f"{titulo} finalizado!", "green800")
                except Exception as ex:
                    on_progress(0, f"Aviso/Erro: {str(ex)}")
                    mostrar_aviso(f"Erro: {str(ex)}", "red900")
                finally:
                    btn_rodar.visible = True
                    btn_rodar.disabled = False
                    btn_cancelar.visible = False
                    btn_cancelar.disabled = False
                    btn_cancelar.content.value = "CANCELAR"
                    card.update()

            def disparar_automacao(e):
                argumentos_finais = []
                for el in elementos_data:
                    if radio_datas.value == "padrao":
                        argumentos_finais.extend([el['p_ini'], el['p_fim']])
                    else:
                        argumentos_finais.extend([el['ini'].value, el['fim'].value])
                
                btn_rodar.disabled = True
                btn_rodar.visible = False
                btn_cancelar.visible = True
                barra_progresso.visible = True
                texto_progresso.visible = True
                card.update()

                threading.Thread(target=executar_em_background, args=(argumentos_finais,), daemon=True).start()

            btn_rodar.on_click = disparar_automacao

            conteudo_extra = ft.Container(
                content=ft.Column([
                    ft.Text("Configurações", weight=ft.FontWeight.BOLD),
                    radio_datas, 
                    coluna_datas_custom,
                    linha_btn, 
                    linha_progresso,
                    ft.TextButton("Voltar", on_click=lambda e: alternar_tamanho(e), icon=ft.Icons.ARROW_BACK, style=ft.ButtonStyle(color=cor_icone))
                ], spacing=3, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                key="config"
            )

            cabecalho = ft.Container(
                content=ft.Column([
                    ft.Row([ft.Icon(icone, color=cor_icone, size=40), ft.Text(titulo, size=20, weight=ft.FontWeight.BOLD), ft.Container(expand=True), ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)]), 
                    ft.Container(height=10),
                    ft.Text(descricao, size=14, color=ft.Colors.WHITE54)
                ]), 
                on_click=lambda e: alternar_tamanho(e), ink=True, border_radius=10, padding=10, key="front"
            )

            animador = ft.AnimatedSwitcher(content=cabecalho, transition=ft.AnimatedSwitcherTransition.SCALE, duration=300)

            def alternar_tamanho(e):
                animador.content = conteudo_extra if animador.content.key == "front" else cabecalho
                card.update()

            card = ft.Container(
                width=350, height=310, padding=15, border_radius=20, bgcolor="#1E1E1E", 
                shadow=ft.BoxShadow(spread_radius=1, blur_radius=10, color=ft.Colors.BLACK26), 
                content=animador
            )
            return card

        def criar_card_cofre():
            dropdown_servico = ft.Dropdown(label="Qual Site?", options=[ft.dropdown.Option("ADM de Vendas"), ft.dropdown.Option("EBUS")], width=320, height=45)
            status_cadastrado = ft.Text("Selecione um site para ver o status...", color=ft.Colors.WHITE54, size=12)

            def checar_status_site(e):
                login_salvo, _ = buscar_credencial_site(id_logado, dropdown_servico.value)
                if login_salvo:
                    status_cadastrado.value = f"🟢 Já salvo (Login: {login_salvo})"
                    status_cadastrado.color = ft.Colors.GREEN_400
                else:
                    status_cadastrado.value = "🔴 Nenhuma credencial cadastrada."
                    status_cadastrado.color = ft.Colors.RED_400
                status_cadastrado.update()

            dropdown_servico.on_change = checar_status_site
            campo_user = ft.TextField(label="Login", width=320, height=40)
            campo_pass = ft.TextField(label="Senha", width=320, height=40, password=True, can_reveal_password=True)
            
            def salvar_cofre(e):
                if not dropdown_servico.value or not campo_user.value or not campo_pass.value:
                    mostrar_aviso("Preencha todos os campos!", "red900")
                    return
                adicionar_credencial_site(id_logado, dropdown_servico.value, campo_user.value, campo_pass.value)
                mostrar_aviso(f"Salvo para {dropdown_servico.value}!", "green800")
                checar_status_site(None)
                
            btn_salvar = ft.ElevatedButton(content=ft.Text("SALVAR NO COFRE"), bgcolor=ft.Colors.ORANGE_500, color=ft.Colors.WHITE, width=320, on_click=salvar_cofre)
            
            campo_mestra = ft.TextField(label="Senha Mestra", password=True, width=300)
            resultado_consulta = ft.Text("", size=14, color=ft.Colors.BLUE_400, selectable=True)
            
            def validar_mestra(e):
                if verificar_senha_mestra(id_logado, campo_mestra.value):
                    u, s = buscar_credencial_site(id_logado, dropdown_servico.value)
                    resultado_consulta.value = f"Login: {u}\nSenha: {s}"
                    resultado_consulta.color = ft.Colors.GREEN_400
                else:
                    resultado_consulta.value = "Senha incorreta!"
                    resultado_consulta.color = ft.Colors.RED_400
                resultado_consulta.update()

            dialog_mestra = ft.AlertDialog(
                title=ft.Text("Segurança"),
                content=ft.Column([ft.Text("Digite sua senha mestra:"), campo_mestra, resultado_consulta], tight=True),
                actions=[ft.TextButton("Revelar", on_click=validar_mestra), ft.TextButton("Fechar", on_click=lambda e: setattr(dialog_mestra, 'open', False) or page.update())],
            )
            
            btn_consultar = ft.ElevatedButton(content=ft.Text("CONSULTAR"), bgcolor=ft.Colors.BLUE_GREY_700, color=ft.Colors.WHITE, width=320, on_click=lambda e: page.overlay.append(dialog_mestra) or setattr(dialog_mestra, 'open', True) or page.update())
            
            conteudo_extra = ft.Container(
                content=ft.Column([
                    ft.Text("Cofre", weight=ft.FontWeight.BOLD),
                    dropdown_servico, status_cadastrado, campo_user, campo_pass, btn_salvar, btn_consultar,
                    ft.TextButton("Voltar", on_click=lambda e: alternar_tamanho_cofre(e), icon=ft.Icons.ARROW_BACK, style=ft.ButtonStyle(color=ft.Colors.ORANGE_400))
                ], spacing=3, horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                key="config"
            )
            
            cabecalho = ft.Container(
                content=ft.Column([
                    ft.Row([ft.Icon(ft.Icons.SECURITY_ROUNDED, color=ft.Colors.ORANGE_400, size=40), ft.Text("Cofre de Senhas", size=20, weight=ft.FontWeight.BOLD), ft.Container(expand=True), ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)]), 
                    ft.Container(height=10), ft.Text("Guarde acessos dos robôs.", size=14, color=ft.Colors.WHITE54)
                ]), 
                on_click=lambda e: alternar_tamanho_cofre(e), ink=True, border_radius=10, padding=10, key="front"
            )
            
            animador_cofre = ft.AnimatedSwitcher(content=cabecalho, transition=ft.AnimatedSwitcherTransition.SCALE, duration=300)

            def alternar_tamanho_cofre(e):
                animador_cofre.content = conteudo_extra if animador_cofre.content.key == "front" else cabecalho
                card_cofre.update()

            card_cofre = ft.Container(width=350, height=310, padding=15, border_radius=20, bgcolor="#1E1E1E", shadow=ft.BoxShadow(spread_radius=1, blur_radius=10, color=ft.Colors.BLACK26), content=animador_cofre)
            return card_cofre

        def criar_card_pax_calc():
            estilo_f = {"width": 145, "height": 45, "border_radius": 10, "text_size": 14}
            
            campo_preco_atual = ft.TextField(label="Preço Atual", **estilo_f)
            campo_preco_novo = ft.TextField(label="Preço Novo", **estilo_f)
            campo_pax_atual = ft.TextField(label="Pax por Viagem", **estilo_f)
            campo_viagens = ft.TextField(label="Viagens", **estilo_f)
            campo_km = ft.TextField(label="KM Rodados", **estilo_f)
            campo_pedagio = ft.TextField(label="Pedágio (Vlr)", **estilo_f)
            campo_taxa = ft.TextField(label="Taxa Emb. (Vlr)", **estilo_f)
            
            tipo_onibus = ft.Dropdown(
                label="Tipo de Ônibus", width=300, height=45, border_radius=10,
                options=[ft.dropdown.Option(x) for x in ["CONV", "CAMA EXECUTIVO", "EXECUTIVO", "EXECUTIVO CONVENCIONAL", "CAMA CONVENCIONAL", "CAMA SEMILEITO", "SEMILEITO EXECUTIVO", "CONVENCIONAL DD"]],
                value="CONV"
            )

            col_resultado = ft.Column(spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER)
            btn_recalc = ft.IconButton(ft.Icons.REPLAY_ROUNDED, visible=False, on_click=lambda _: alternar_view("inputs"), icon_color=ft.Colors.WHITE70)

            def mostrar_resultados(res):
                def mini_card(titulo, conteudo, expand=True):
                    return ft.Container(
                        padding=12, border_radius=15, bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.WHITE),
                        expand=expand,
                        content=ft.Column([
                            ft.Text(titulo, size=10, weight=ft.FontWeight.BOLD, color=ft.Colors.CYAN_400),
                            conteudo
                        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=5)
                    )

                def fmt_br(v):
                    return f"R$ {v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

                def row_dif(label, original, final, dif):
                    cor = ft.Colors.GREEN_400 if dif <= 0 else ft.Colors.RED_400
                    seta = "▲" if dif <= 0 else "▼"
                    return ft.Column([
                        ft.Text(label, size=9, color=ft.Colors.WHITE54),
                        ft.Row([
                            ft.Text(fmt_br(final), size=14, weight=ft.FontWeight.BOLD),
                            ft.Text(f"{seta} {fmt_br(abs(dif))}", size=10, color=cor, weight=ft.FontWeight.W_500)
                        ], spacing=5, alignment=ft.MainAxisAlignment.CENTER)
                    ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0)

                col_resultado.controls = [
                    mini_card("PASSAGEIROS EXTRAS (Equilíbrio)", ft.Row([
                        ft.Column([ft.Text("↓ Piso", size=9), ft.Text(str(res['pax_extra_floor']), size=22, weight=ft.FontWeight.BOLD, color=ft.Colors.GREEN_400)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0),
                        ft.Column([ft.Text("Exato", size=9), ft.Text(f"{res['pax_extra_vlr']}", size=16, italic=True)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0),
                        ft.Column([ft.Text("↑ Teto", size=9), ft.Text(str(res['pax_extra_ceil']), size=22, weight=ft.FontWeight.BOLD, color=ft.Colors.BLUE_400)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0),
                    ], alignment=ft.MainAxisAlignment.CENTER, spacing=25)),

                    ft.Row([
                        mini_card("RECEITA LÍQUIDA ↓", row_dif("Meta Piso", res['rec_liq_atual'], res['floor']['rec_liq'], res['floor']['dif_rec_liq'])),
                        mini_card("RECEITA LÍQUIDA ↑", row_dif("Meta Teto", res['rec_liq_atual'], res['ceil']['rec_liq'], res['ceil']['dif_rec_liq'])),
                    ], spacing=10),

                    ft.Row([
                        mini_card("RECEITA / KM ↓", row_dif("Meta Piso", res['rec_km_atual'], res['floor']['rec_km'], res['floor']['dif_rec_km'])),
                        mini_card("RECEITA / KM ↑", row_dif("Meta Teto", res['rec_km_atual'], res['ceil']['rec_km'], res['ceil']['dif_rec_km'])),
                    ], spacing=10),

                    ft.Container(
                        padding=10, border_radius=12, bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.WHITE),
                        content=ft.Row([
                            ft.Column([ft.Text("Ocupação", size=9, color=ft.Colors.WHITE54), ft.Text(f"{res['ocupacao_atual']} ➔ {res['ocupacao_meta']}", size=12, weight=ft.FontWeight.W_600)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0),
                            ft.VerticalDivider(width=1, color=ft.Colors.WHITE10),
                            ft.Column([ft.Text("Tarifa Líq.", size=9, color=ft.Colors.WHITE54), ft.Text(f"{fmt_br(res['tarifa_liq_nova'])}", size=12, weight=ft.FontWeight.W_600)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=0),
                        ], alignment=ft.MainAxisAlignment.CENTER, spacing=20)
                    )
                ]
                alternar_view("results")

            def calcular(e):
                try:
                    p_at = float(campo_preco_atual.value.replace(",", "."))
                    p_nv = float(campo_preco_novo.value.replace(",", "."))
                    px_at = float(campo_pax_atual.value.replace(",", "."))
                    vgs = float(campo_viagens.value.replace(",", "."))
                    km = float(campo_km.value.replace(",", "."))
                    ped = float(campo_pedagio.value.replace(",", "."))
                    tax = float(campo_taxa.value.replace(",", "."))
                    res = calculadora_elasticidade_pax(p_at, p_nv, px_at, vgs, get_capacidade(tipo_onibus.value), km, ped, tax)
                    mostrar_resultados(res)
                except: mostrar_aviso("Valores inválidos.")

            btn_calc = ft.ElevatedButton("CALCULAR", bgcolor=ft.Colors.BLUE_700, color=ft.Colors.WHITE, width=300, height=45, on_click=calcular, style=ft.ButtonStyle(shape=ft.RoundedRectangleBorder(radius=10)))

            view_inputs = ft.Column([
                ft.Text("Simulador de Elasticidade", size=16, weight=ft.FontWeight.BOLD),
                ft.Row([campo_preco_atual, campo_preco_novo], alignment=ft.MainAxisAlignment.CENTER, spacing=10),
                ft.Row([campo_pax_atual, campo_viagens], alignment=ft.MainAxisAlignment.CENTER, spacing=10),
                ft.Row([campo_km, campo_pedagio], alignment=ft.MainAxisAlignment.CENTER, spacing=10),
                ft.Row([campo_taxa, tipo_onibus], alignment=ft.MainAxisAlignment.CENTER, spacing=10),
                btn_calc,
            ], spacing=10, horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="inputs", scroll=ft.ScrollMode.HIDDEN)

            view_results = ft.Column([col_resultado], horizontal_alignment=ft.CrossAxisAlignment.CENTER, key="results", scroll=ft.ScrollMode.HIDDEN)

            header = ft.Row([
                ft.IconButton(ft.Icons.ARROW_BACK, on_click=lambda e: alternar_painel(e), icon_color=ft.Colors.CYAN_400),
                ft.Text("Pax Calc Pro", weight=ft.FontWeight.BOLD),
                ft.Container(expand=True),
                btn_recalc
            ], alignment=ft.MainAxisAlignment.START, spacing=0)

            sw_conteudo = ft.AnimatedSwitcher(content=view_inputs, transition=ft.AnimatedSwitcherTransition.FADE, duration=300)

            def alternar_view(qual):
                sw_conteudo.content = view_inputs if qual == "inputs" else view_results
                btn_recalc.visible = (qual == "results")
                card.update()

            conteudo_completo = ft.Column([header, sw_conteudo], spacing=5, horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True)

            cabecalho_front = ft.Container(
                content=ft.Column([
                    ft.Row([ft.Icon(ft.Icons.CALCULATE_ROUNDED, color=ft.Colors.CYAN_400, size=40), ft.Text("Pax Calc", size=20, weight=ft.FontWeight.BOLD), ft.Container(expand=True), ft.Icon(ft.Icons.KEYBOARD_ARROW_RIGHT, color=ft.Colors.WHITE54)]),
                    ft.Container(height=10), ft.Text("Equilíbrio de preço e KM.", size=14, color=ft.Colors.WHITE54)
                ]), on_click=lambda e: alternar_painel(e), ink=True, border_radius=10, padding=10, key="front"
            )

            animador_principal = ft.AnimatedSwitcher(content=cabecalho_front, transition=ft.AnimatedSwitcherTransition.SCALE, duration=300)

            def alternar_painel(e):
                if animador_principal.content.key == "front":
                    alternar_view("inputs")
                    animador_principal.content = ft.Container(content=conteudo_completo, key="back", height=450)
                else:
                    animador_principal.content = cabecalho_front
                card.update()

            card = ft.Container(width=350, height=310, padding=12, border_radius=20, bgcolor="#1E1E1E", shadow=ft.BoxShadow(spread_radius=1, blur_radius=10, color=ft.Colors.BLACK26), content=animador_principal)
            return card

        saudacao = ft.Text(value=f"Olá, {nome_usuario} 👋", size=28, weight=ft.FontWeight.BOLD)
        grade_cards = ft.Row(
            wrap=True, spacing=30, run_spacing=30, vertical_alignment=ft.CrossAxisAlignment.START,
            controls=[
                criar_card_robo("ADM de Vendas", ft.Icons.BAR_CHART_ROUNDED, "Extração de Demandas.", ft.Colors.BLUE_400, executar_adm, [{'label': '', 'ini': ADM_INICIO, 'fim': ADM_FIM}]),
                criar_card_robo("EBUS Revenue", ft.Icons.ATTACH_MONEY_ROUNDED, "Relatório Financeiro.", ft.Colors.GREEN_400, executar_ebus, [{'label': '', 'ini': EBUS_INICIO, 'fim': EBUS_FIM}]),
                criar_card_robo("SR Rio x SP", ft.Icons.EMAIL_ROUNDED, "E-mail e Base Rio.", ft.Colors.ORANGE_400, executar_sr, [
                    {'label': 'E-mail', 'ini': SR_FIM, 'fim': SR_FIM},
                    {'label': 'Base', 'ini': SR_INI, 'fim': SR_INI}
                ]),
                criar_card_pax_calc(),
                criar_card_cofre()
            ]
        )

        page.add(ft.Container(
            content=ft.Column([saudacao, ft.Container(height=30), grade_cards], scroll=ft.ScrollMode.ALWAYS, expand=True),
            padding=ft.padding.all(40), expand=True, alignment=ft.Alignment.TOP_LEFT
        ))
        page.update()

    inicializar_env()
    configurar_banco()
    ir_para_login()

if __name__ == "__main__":
    ft.app(target=main)