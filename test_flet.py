import flet as ft

def main(page: ft.Page):
    page.title = "Showroom de Layouts - Guilherme"
    page.theme_mode = ft.ThemeMode.DARK
    page.bgcolor = "#0a0b10"
    page.padding = 0
    page.window_width = 1100
    page.window_height = 800

    conteudo_principal = ft.Container(expand=True, padding=20)

    # --- MODELO 1: SIDEBAR ---
    def view_sidebar():
        sidebar_ref = ft.Ref[ft.Container]()

        def alternar_sidebar(e):
            sidebar_ref.current.width = 60 if sidebar_ref.current.width == 250 else 250
            sidebar_ref.current.update()

        return ft.Row([
            ft.Container(
                ref=sidebar_ref,
                width=250,
                bgcolor="#11131c",
                padding=10,
                animate=ft.Animation(300, "decelerate"),
                content=ft.Column([
                    ft.IconButton(ft.Icons.MENU, on_click=alternar_sidebar),
                    ft.Divider(color="transparent", height=20),
                    ft.ListTile(leading=ft.Icon(ft.Icons.AUTO_MODE), title=ft.Text("Automações")),
                    ft.ListTile(leading=ft.Icon(ft.Icons.LOCK_PERSON), title=ft.Text("Senhas")),
                    ft.Container(expand=True),
                    ft.ListTile(leading=ft.Icon(ft.Icons.LOGOUT, color="red"), title=ft.Text("Sair", color="red")),
                ])
            ),
            ft.VerticalDivider(width=1, color="white10"),
            ft.Column([
                ft.Text("Dashboard Profissional", size=30, weight="bold"),
                ft.Text("Navegação lateral fixa ou retrátil."),
            ], ft.Container(
                expand=True, padding=20))
        ], expand=True)

    # --- MODELO 2: CARDS ---
    def view_cards_responsivos():
        return ft.Column([
            ft.Text("Dashboard de Cards", size=30, weight="bold"),
            ft.ResponsiveRow([
                ft.Container(
                    bgcolor="#161821", padding=25, border_radius=15, col={"sm": 12, "md": 6, "xl": 4},
                    border=ft.border.all(1, "white10"),
                    content=ft.Column([
                        ft.Icon(ft.Icons.ATTACH_MONEY, color="blue"),
                        ft.Text("EBUS Revenue", weight="bold"),
                        ft.ElevatedButton("Configurar", bgcolor="blue", color="white")
                    ])
                ),
                ft.Container(
                    bgcolor="#161821", padding=25, border_radius=15, col={"sm": 12, "md": 6, "xl": 4},
                    border=ft.border.all(1, "white10"),
                    content=ft.Column([
                        ft.Icon(ft.Icons.SECURITY, color="amber"),
                        ft.Text("Cofre de Senhas", weight="bold"),
                        ft.ElevatedButton("Acessar", bgcolor="amber", color="black")
                    ])
                ),
            ], spacing=20)
        ], scroll=ft.ScrollMode.AUTO)

    # --- MODELO 3: EXPANSION ---
    def view_expansion_bars():
        return ft.Column([
            ft.Text("Barras Expansíveis", size=30, weight="bold"),
            ft.Container(height=10),
            ft.ExpansionTile(
                title=ft.Text("Configurações do Robô"),
                leading=ft.Icon(ft.Icons.SETTINGS, color="blue"),
                collapsed_icon_color="#161821",
                controls=[ft.Container(padding=20, content=ft.Text("Campos de ajuste aqui..."))]
            ),
            ft.ExpansionTile(
                title=ft.Text("Cofre de Senhas"),
                leading=ft.Icon(ft.Icons.LOCK, color="amber"),
                collapsed_icon_color="#161821",
                controls=[ft.Container(padding=20, content=ft.Text("Dados de senha aqui..."))]
            ),
        ], spacing=10)

    def on_tab_change(e):
        idx = e.control.selected_index
        if idx == 0:
            conteudo_principal.content = view_cards_responsivos()
            conteudo_principal.padding = 20
        elif idx == 1:
            conteudo_principal.content = view_sidebar()
            conteudo_principal.padding = 0
        elif idx == 2:
            conteudo_principal.content = view_expansion_bars()
            conteudo_principal.padding = 20
        page.update()

    # SELETOR CORRIGIDO
    seletor_tabs = ft.Tabs(
        length=3,
        selected_index=0,
        on_change=on_tab_change,
        content=ft.TabBar(
            tabs=[
            ft.Tab(label="CARDS", icon=ft.Icons.DASHBOARD),
            ft.Tab(label="SIDEBAR", icon=ft.Icons.MENU_OPEN),
            ft.Tab(label="EXPANSION", icon=ft.Icons.VIEW_STREAM),
        ],)
    )

    page.add(
        ft.Container(bgcolor="#11131c", content=seletor_tabs),
        conteudo_principal
    )

    # Início padrão
    conteudo_principal.content = view_cards_responsivos()
    page.update()

ft.app(target=main)