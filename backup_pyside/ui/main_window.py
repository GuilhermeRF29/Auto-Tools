# ui/main_window.py
import qtawesome as qta
from PySide6.QtWidgets import (QMainWindow, QWidget, QHBoxLayout, QVBoxLayout, 
                               QPushButton, QStackedWidget, QFrame, QLabel, 
                               QLineEdit, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QCursor, QFont, QColor, QIcon

# Importando nossas telas atuais
from ui.views.dashboard_view import DashboardView
from ui.views.relatorios_view import RelatoriosView
from ui.views.cofre_view import CofreView
from ui.views.calculadora_view import CalculadoraView

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AutoBot Pro")
        self.resize(1280, 800)
        
        # O Fundo da Aplicação (bg-slate-100)
        self.setStyleSheet("background-color: #f1f5f9;")

        # Fonte Global
        fonte_base = QFont("Segoe UI", 10)
        fonte_base.setStyleHint(QFont.StyleHint.SansSerif) 
        self.setFont(fonte_base)

        # O QSS GLOBAL
        self.setStyleSheet("""
            QMainWindow {
                background-color: #f1f5f9; /* slate-100 */
            }
            
            QScrollBar:vertical {
                border: none;
                background: transparent;
                width: 8px;
                margin: 0px;
            }
            QScrollBar::handle:vertical {
                background: #cbd5e1; /* slate-300 */
                min-height: 30px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical:hover {
                background: #94a3b8; /* slate-400 */
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0px;
            }
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
                background: transparent;
            }
            
            QToolTip {
                background-color: #1e293b;
                color: white;
                border: none;
                padding: 5px;
                border-radius: 4px;
                font-family: 'Segoe UI';
                font-size: 12px;
            }
        """)

        # Widget e Layout Base
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        
        main_layout = QHBoxLayout(main_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # ==========================================
        # BARRA LATERAL (SIDEBAR) (w-64 bg-slate-900 shadow-xl)
        # ==========================================
        self.sidebar = QFrame()
        self.sidebar.setFixedWidth(256) # Tailwind w-64
        self.sidebar.setStyleSheet("""
            QFrame {
                background-color: #0f172a; /* bg-slate-900 */
                border: none;
            }
        """)
        
        # Sombra na sidebar para a direita
        shadow_sidebar = QGraphicsDropShadowEffect()
        shadow_sidebar.setBlurRadius(20)
        shadow_sidebar.setXOffset(5)
        shadow_sidebar.setYOffset(0)
        shadow_sidebar.setColor(QColor(0, 0, 0, 40)) # shadow-xl
        self.sidebar.setGraphicsEffect(shadow_sidebar)

        sidebar_layout = QVBoxLayout(self.sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)

        # Cabeçalho da Sidebar (h-16 px-6 border-b border-slate-800 bg-slate-950)
        logo_container = QFrame()
        logo_container.setFixedHeight(64)
        logo_container.setStyleSheet("background-color: #020617; border-bottom: 1px solid #1e293b;") # slate-950
        logo_layout = QHBoxLayout(logo_container)
        logo_layout.setContentsMargins(24, 0, 24, 0) # px-6
        logo_layout.setSpacing(12) # mr-3
        
        # Ícone do Logo (w-8 h-8 bg-blue-600 rounded flex items-center justify-center shadow-lg)
        logo_icon = QLabel()
        logo_icon.setFixedSize(32, 32)
        logo_icon.setPixmap(qta.icon('fa5s.play', color='white').pixmap(QSize(16, 16)))
        logo_icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo_icon.setStyleSheet("""
            background-color: #2563eb; 
            border-radius: 6px; 
            border: none;
        """)
        
        logo_text = QLabel("AutoBot Pro")
        logo_text.setStyleSheet("color: white; font-size: 16px; font-weight: bold; border: none; letter-spacing: 0.5px;")
        
        logo_layout.addWidget(logo_icon)
        logo_layout.addWidget(logo_text)
        logo_layout.addStretch()
        
        sidebar_layout.addWidget(logo_container)

        # Container dos botões do Menu (py-6 px-3 space-y-1)
        menu_container = QFrame()
        menu_container.setStyleSheet("background-color: transparent; border: none;")
        menu_layout = QVBoxLayout(menu_container)
        menu_layout.setContentsMargins(12, 24, 12, 24)
        menu_layout.setSpacing(4)
        
        # Criando os Botões do Menu com QtAwesome
        self.btn_dashboard = self._criar_botao_menu("Dashboard", 'fa5s.home')
        self.btn_relatorios = self._criar_botao_menu("Relatórios", 'fa5s.file-alt')
        self.btn_cofre = self._criar_botao_menu("Cofre de Senhas", 'fa5s.lock')
        self.btn_calculadora = self._criar_botao_menu("Calculadora", 'fa5s.calculator')

        menu_layout.addWidget(self.btn_dashboard)
        menu_layout.addWidget(self.btn_relatorios)
        menu_layout.addWidget(self.btn_cofre)
        menu_layout.addWidget(self.btn_calculadora)
        menu_layout.addStretch() 

        sidebar_layout.addWidget(menu_container)

        # ==========================================
        # ÁREA DIREITA (TOP BAR + CONTEÚDO)
        # ==========================================
        right_widget = QWidget()
        right_layout = QVBoxLayout(right_widget)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        # --- A. BARRA SUPERIOR (TOP BAR) (h-16 bg-white border-b border-slate-200 px-8 shadow-sm) ---
        top_bar = QFrame()
        top_bar.setFixedHeight(64)
        top_bar.setStyleSheet("""
            QFrame {
                background-color: white;
                border-bottom: 1px solid #e2e8f0;
            }
        """)
        # Sombra sutil embaixo
        shadow_top = QGraphicsDropShadowEffect()
        shadow_top.setBlurRadius(10)
        shadow_top.setXOffset(0)
        shadow_top.setYOffset(2)
        shadow_top.setColor(QColor(0, 0, 0, 10)) # shadow-sm
        top_bar.setGraphicsEffect(shadow_top)
        
        top_bar_layout = QHBoxLayout(top_bar)
        top_bar_layout.setContentsMargins(32, 0, 32, 0)

        # Campo de Busca (bg-slate-100 rounded-md px-3 py-1.5 w-96 border border-slate-200)
        # Colocaremos um QWidget para ter o layout flex com ícone dentro suavemente
        search_container = QFrame()
        search_container.setFixedSize(384, 38) # w-96 = 384px
        search_container.setStyleSheet("""
            QFrame {
                background-color: #f1f5f9; /* slate-100 */
                border: 1px solid #e2e8f0; /* border-slate-200 */
                border-radius: 6px; /* rounded-md */
            }
        """)
        search_layout = QHBoxLayout(search_container)
        search_layout.setContentsMargins(12, 0, 12, 0) # px-3
        search_layout.setSpacing(8)
        
        lbl_search_icon = QLabel()
        lbl_search_icon.setPixmap(qta.icon('fa5s.search', color='#94a3b8').pixmap(QSize(14, 14)))
        lbl_search_icon.setStyleSheet("border: none; background: transparent;")
        
        self.search_bar = QLineEdit()
        self.search_bar.setPlaceholderText("Buscar...")
        self.search_bar.setStyleSheet("""
            QLineEdit {
                background: transparent;
                border: none;
                font-size: 14px;
                color: #334155;
            }
        """)
        
        search_layout.addWidget(lbl_search_icon)
        search_layout.addWidget(self.search_bar)
        
        # Botão/Avatar do Usuário (w-10 h-10 bg-blue-100 rounded-full flex text-blue-700)
        avatar_btn = QPushButton()
        avatar_btn.setIcon(qta.icon('fa5s.user', color='#1d4ed8'))
        avatar_btn.setIconSize(QSize(18, 18))
        avatar_btn.setFixedSize(40, 40)
        avatar_btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        avatar_btn.setStyleSheet("""
            QPushButton {
                background-color: #dbeafe; /* blue-100 */
                border-radius: 20px;
                border: none;
            }
            QPushButton:hover {
                background-color: #bfdbfe; /* blue-200 */
            }
        """)

        top_bar_layout.addWidget(search_container)
        top_bar_layout.addStretch()
        top_bar_layout.addWidget(avatar_btn)

        # --- B. ÁREA DE CONTEÚDO (STACKED WIDGET) ---
        self.stacked_widget = QStackedWidget()
        
        self.tela_dashboard = DashboardView()
        self.tela_relatorios = RelatoriosView()
        self.tela_cofre = CofreView()             
        self.tela_calculadora = CalculadoraView() 

        self.stacked_widget.addWidget(self.tela_dashboard)   # Índice 0
        self.stacked_widget.addWidget(self.tela_relatorios)  # Índice 1
        self.stacked_widget.addWidget(self.tela_cofre)       # Índice 2
        self.stacked_widget.addWidget(self.tela_calculadora) # Índice 3

        # Montando a área direita
        right_layout.addWidget(top_bar)
        right_layout.addWidget(self.stacked_widget)

        # ==========================================
        # MONTAGEM FINAL
        # ==========================================
        main_layout.addWidget(self.sidebar)
        main_layout.addWidget(right_widget)

        # Eventos de clique dos botões
        self.btn_dashboard.clicked.connect(lambda: self.mudar_tela(0, self.btn_dashboard))
        self.btn_relatorios.clicked.connect(lambda: self.mudar_tela(1, self.btn_relatorios))
        self.btn_cofre.clicked.connect(lambda: self.mudar_tela(2, self.btn_cofre))
        self.btn_calculadora.clicked.connect(lambda: self.mudar_tela(3, self.btn_calculadora))

        # ==========================================
        # CONEXÃO DOS SINAIS DO DASHBOARD
        # ==========================================
        self.tela_dashboard.nav_relatorios.connect(lambda: self.mudar_tela(1, self.btn_relatorios))
        self.tela_dashboard.nav_cofre.connect(lambda: self.mudar_tela(2, self.btn_cofre))
        self.tela_dashboard.nav_calculadora.connect(lambda: self.mudar_tela(3, self.btn_calculadora))

        # Iniciamos o app na tela 0 (Dashboard)
        self.mudar_tela(0, self.btn_dashboard)

    def _criar_botao_menu(self, texto, qt_icon_name):
        btn = QPushButton(f"  {texto}")
        # Default text color: slate-300 (#cbd5e1), Icon color: slate-400 (#94a3b8)
        btn.setIcon(qta.icon(qt_icon_name, color='#94a3b8'))
        btn.setIconSize(QSize(18, 18))
        btn.setCheckable(True)
        btn.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn.setFixedHeight(44) # py-2.5 (approx 10px padding * 2 + 24 line)
        
        # The trick for QPushbutton to have text align left and icon next to it is via layout or styling.
        # But Qt's default aligns icon to the left nicely if text-align is left hook.
        btn.setStyleSheet(f"""
            QPushButton {{
                color: #e2e8f0; /* slate-200 base text */
                background-color: transparent;
                border: none;
                border-radius: 6px; /* rounded-md */
                text-align: left;
                padding-left: 12px;
                font-size: 14px;
                font-weight: 500;
                /* Propriedades customizadas que vamos tratar pelo qta.icon */
                qproperty-icon: url(); 
            }}
            QPushButton:hover {{
                background-color: #1e293b; /* hover:bg-slate-800 */
                color: white; /* hover:text-white */
            }}
            QPushButton:checked {{
                background-color: #2563eb; /* bg-blue-600 */
                color: white;
                font-weight: 500;
            }}
        """)
        
        # Guarda uma referência do ícone original para podermos trocar a cor ao clicar
        btn.qt_icon_name = qt_icon_name
        return btn

    def mudar_tela(self, index, botao_ativo):
        self.stacked_widget.setCurrentIndex(index)
        
        for btn in [self.btn_dashboard, self.btn_relatorios, self.btn_cofre, self.btn_calculadora]:
            btn.setChecked(False)
            # Retorna icone para slate-400
            btn.setIcon(qta.icon(btn.qt_icon_name, color='#94a3b8'))
            
        botao_ativo.setChecked(True)
        # O icone ativo muda para text-blue-200 do Tailwind (#bfdbfe) dentro do botão azul
        botao_ativo.setIcon(qta.icon(botao_ativo.qt_icon_name, color='#bfdbfe'))