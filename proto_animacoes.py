import flet as ft
import time
import threading

def main(page: ft.Page):
    page.title = "Protótipo de Animações de Carregamento"
    page.theme_mode = ft.ThemeMode.DARK
    page.bgcolor = "#0a0b10"
    page.padding = 40
    page.window_width = 1000
    page.window_height = 800
    
    # Fontes
    page.fonts = {
        "Lexend": "https://fonts.googleapis.com/css2?family=Lexend:wght@300;400;600;700&display=swap"
    }
    page.theme = ft.Theme(font_family="Lexend")

    # Estilo Glassmorphism (Baseado no app_flet_mica.py)
    glass_card_style = {
        "bgcolor": ft.Colors.with_opacity(0.1, ft.Colors.WHITE),
        "blur": ft.Blur(15, 15),
        "border": ft.Border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.WHITE)),
        "border_radius": 25,
        "padding": 25,
    }

    # Camada de Fundo Animado (igual ao app_flet_mica.py)
    camada_fundo = ft.Container(
        gradient=ft.LinearGradient(
            begin=ft.Alignment.TOP_LEFT,
            end=ft.Alignment.BOTTOM_RIGHT,
            colors=["#0f0c29", "#302b63", "#24243e"],
        ),
        animate=ft.Animation(3000, ft.AnimationCurve.EASE_IN_OUT),
        expand=True
    )

    def animar_fundo():
        cores_1 = ["#0f0c29", "#302b63", "#24243e"]
        cores_2 = ["#24243e", "#0f0c29", "#302b63"]
        atual = cores_1
        while True:
            try:
                camada_fundo.gradient.colors = atual
                camada_fundo.update()
                time.sleep(3)
                atual = cores_2 if atual == cores_1 else cores_1
            except: break

    # Estilo Glassmorphism Premium
    glass_card_style = {
        "bgcolor": ft.Colors.with_opacity(0.15, ft.Colors.BLACK),
        "blur": ft.Blur(20, 20),
        "border": ft.Border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.WHITE)),
        "border_radius": 30,
        "padding": 30,
        "shadow": ft.BoxShadow(spread_radius=1, blur_radius=15, color=ft.Colors.with_opacity(0.3, ft.Colors.BLACK))
    }

    # --- OPÇÃO 1: BOTÃO COM ANIMAÇÃO TOTAL ---
    def criar_opcao_botao():
        state = {"loading": False}
        
        # Texto inicial
        btn_text = ft.Text("RODAR ROBÔ", weight="bold", color="white", size=16)
        
        # A barra de progresso que ocupará o fundo do botão
        # O valor None cria a animação de "vai e vem" contínua
        bg_progress = ft.ProgressBar(
            value=None,
            color=ft.Colors.with_opacity(0.3, ft.Colors.WHITE), # Luz passando
            bgcolor="transparent", 
            height=60,
            border_radius=20,
            visible=False
        )

        def on_hover_btn(e):
            if state["loading"]:
                btn_text.color = "red" if e.data == "true" else "white"
            else:
                btn_container.scale = 1.05 if e.data == "true" else 1.0
            btn_container.update()

        def toggle_loading(e):
            state["loading"] = not state["loading"]
            
            if state["loading"]:
                btn_text.value = "CANCELAR"
                btn_text.color = "white"
                # Cor sólida de fundo (mesma do card ou destaque)
                btn_container.bgcolor = ft.Colors.with_opacity(0.3, ft.Colors.BLACK)
                btn_container.border = ft.Border.all(2, ft.Colors.RED_700)
                bg_progress.visible = True
            else:
                btn_text.value = "RODAR ROBÔ"
                btn_text.color = "white"
                btn_container.bgcolor = ft.Colors.BLUE_700
                btn_container.border = None
                bg_progress.visible = False
            
            btn_container.update()

        btn_container = ft.Container(
            content=ft.Stack([
                bg_progress,
                ft.Container(content=btn_text, alignment=ft.Alignment.CENTER, expand=True),
            ]),
            bgcolor=ft.Colors.BLUE_700,
            width=260,
            height=60,
            border_radius=20,
            on_click=toggle_loading,
            on_hover=on_hover_btn,
            animate=ft.Animation(300, "decelerate"),
            clip_behavior=ft.ClipBehavior.HARD_EDGE # Garante que a barra não saia do arredondamento
        )

        return ft.Container(
            **glass_card_style,
            width=420, height=350,
            content=ft.Column([
                ft.Row([ft.Icon(ft.Icons.AUTO_FIX_HIGH, color="blue"), ft.Text("Botão 'Infinite Flow'", size=20, weight="bold")]),
                ft.Text("O botão inteiro torna-se a barra de execução, com rastro de luz contínuo.", color="white70"),
                ft.Container(expand=True),
                ft.Row([btn_container], alignment=ft.MainAxisAlignment.CENTER)
            ])
        )

    # --- OPÇÃO 2: BORDA NEON 'PURE TRAIL' ---
    def criar_opcao_borda():
        state = {"active": False}
        cor_neon = "#d4ff00"
        
        # Apenas a trilha de luz giratória (limpa e nítida)
        glow_trail = ft.Container(
            width=426, height=356,
            border_radius=33,
            border=ft.Border.all(3, cor_neon), # Borda visível apenas na trilha
            gradient=ft.SweepGradient(
                colors=[
                    "transparent", 
                    cor_neon, 
                    "transparent",
                    cor_neon,
                    "transparent"
                ],
                stops=[0, 0.45, 0.5, 0.55, 1],
            ),
            animate_rotation=ft.Animation(1000, "linear"),
            visible=False,
            blur=ft.Blur(8, 8)
        )

        btn_stop = ft.IconButton(
            icon=ft.Icons.STOP_CIRCLE_ROUNDED, 
            icon_color="white70",
            visible=False,
            icon_size=30,
            on_click=lambda _: toggle_active(None),
            on_hover=lambda e: setattr(btn_stop, "icon_color", "red" if e.data == "true" else "white70") or btn_stop.update()
        )

        def animar_efeitos():
            while state["active"]:
                glow_trail.rotation += 6.28
                try: 
                    glow_trail.update()
                except: break
                time.sleep(1.0)

        def toggle_active(e):
            state["active"] = not state["active"]
            glow_trail.visible = state["active"]
            btn_stop.visible = state["active"]
            btn_rodar.visible = not state["active"]
            
            if state["active"]:
                glow_trail.rotation = 0
                card_stack.update()
                threading.Thread(target=animar_efeitos, daemon=True).start()
            else:
                card_stack.update()

        btn_rodar = ft.FilledButton(
            "EXECUTAR RÔBO", 
            style=ft.ButtonStyle(bgcolor=cor_neon, color="black", shape=ft.RoundedRectangleBorder(radius=15)),
            on_click=toggle_active,
            width=260, height=50
        )

        card_content = ft.Container(
            **glass_card_style, # Vidro limpo sem efeitos extras por cima
            width=420, height=350,
            content=ft.Column([
                ft.Row([
                    ft.Icon(ft.Icons.BOLT, color=cor_neon), 
                    ft.Text("Pure Neon Trail", size=20, weight="bold"),
                    ft.Container(expand=True),
                    btn_stop
                ]),
                ft.Text("Foco total na trilha luminosa percorrendo o contorno do card.", color="white70"),
                ft.Container(expand=True),
                ft.Row([btn_rodar], alignment=ft.MainAxisAlignment.CENTER)
            ])
        )

        card_stack = ft.Stack([
            # Camada 1: Apenas a trilha em movimento
            ft.Container(content=glow_trail, alignment=ft.Alignment.CENTER, width=500, height=400),
            # Camada 2: O Card
            ft.Container(content=card_content, alignment=ft.Alignment.CENTER, width=500, height=400),
        ])

        return card_stack

    # Estrutura principal
    def view_showroom():
        return ft.Column([
            ft.Container(
                content=ft.Column([
                    ft.Text("Feedback de Execução v3", size=40, weight="bold", color="white"),
                    ft.Text("O ápice do feedback visual neon irradiante", size=16, color="white54"),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER),
                margin=ft.Padding(0, 0, 0, 40)
            ),
            ft.Row([
                criar_opcao_botao(),
                ft.Container(width=40),
                criar_opcao_borda()
            ], alignment=ft.MainAxisAlignment.CENTER, spacing=0)
        ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, expand=True, alignment=ft.MainAxisAlignment.CENTER)

    # Montagem Final
    layout = ft.Stack([
        camada_fundo,
        ft.Container(content=view_showroom(), padding=50),
    ], expand=True)

    page.add(layout)
    threading.Thread(target=animar_fundo, daemon=True).start()

if __name__ == "__main__":
    ft.run(main)
