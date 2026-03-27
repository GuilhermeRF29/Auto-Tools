# ui/views/cofre_view.py
import qtawesome as qta
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QLineEdit, QPushButton, QStackedWidget, QFrame, 
                               QTableWidget, QHeaderView, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QCursor, QColor, QFont

from ui.components.modern_msg_box import ModernMessageBox
from core.banco import (verificar_senha_mestra, buscar_credencial_site, adicionar_credencial_site)

class CofreView(QWidget):
    def __init__(self, id_usuario_logado=1):
        super().__init__()
        self.id_usuario = id_usuario_logado 
        self.setStyleSheet("background-color: transparent;")
        
        layout_principal = QVBoxLayout(self)
        layout_principal.setContentsMargins(32, 32, 32, 32) # p-8
        
        self.stacked_cofre = QStackedWidget()
        self.tela_bloqueada = self._criar_tela_bloqueada()
        self.tela_desbloqueada = self._criar_tela_desbloqueada()
        
        self.stacked_cofre.addWidget(self.tela_bloqueada)
        self.stacked_cofre.addWidget(self.tela_desbloqueada)
        
        layout_principal.addWidget(self.stacked_cofre)

    def _criar_tela_bloqueada(self):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        card = QFrame()
        card.setFixedWidth(448) # max-w-md
        card.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 8px; /* rounded-lg */
                border: 1px solid #e2e8f0; /* border-slate-200 */
            }
        """)
        
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10); shadow.setColor(QColor(0,0,0,10)); shadow.setYOffset(2); shadow.setXOffset(0)
        card.setGraphicsEffect(shadow)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(32, 32, 32, 32) # p-8
        card_layout.setSpacing(16)
        card_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # Ícone (w-16 h-16 bg-slate-100 rounded-full mb-6)
        icone_bg = QFrame()
        icone_bg.setFixedSize(64, 64)
        icone_bg.setStyleSheet("background-color: #f1f5f9; border-radius: 32px; border: none;") # slate-100
        ic_layout = QVBoxLayout(icone_bg)
        ic_layout.setContentsMargins(0,0,0,0)
        
        icone = QLabel()
        icone.setPixmap(qta.icon('fa5s.lock', color='#475569').pixmap(QSize(32, 32))) # text-slate-600
        icone.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icone.setStyleSheet("border: none; background: transparent;")
        ic_layout.addWidget(icone)
        
        icone_container = QWidget()
        ic_c_layout = QHBoxLayout(icone_container)
        ic_c_layout.setContentsMargins(0, 0, 0, 16) # mb-6
        ic_c_layout.addWidget(icone_bg, alignment=Qt.AlignmentFlag.AlignCenter)

        # Textos
        titulo = QLabel("Cofre Bloqueado")
        titulo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        titulo.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e293b; border: none;") # text-slate-800 mb-2
        
        subtitulo = QLabel("Insira sua senha mestre para acessar as\ncredenciais usadas nas automações.")
        subtitulo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        subtitulo.setStyleSheet("font-size: 16px; color: #64748b; border: none; margin-bottom: 24px;") # text-slate-500 mb-8

        # Input
        self.input_senha_mestra = QLineEdit()
        self.input_senha_mestra.setPlaceholderText("Senha Mestre (digite 'admin')")
        self.input_senha_mestra.setEchoMode(QLineEdit.EchoMode.Password)
        self.input_senha_mestra.setFixedHeight(50) # py-3 approx
        self.input_senha_mestra.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.input_senha_mestra.setStyleSheet("""
            QLineEdit {
                border: 1px solid #cbd5e1; /* border-slate-300 */
                border-radius: 6px;
                font-size: 18px; /* text-lg */
                color: #0f172a;
                background-color: transparent;
            }
            QLineEdit:focus {
                border: 2px solid #3b82f6; /* ring-blue-500 */
            }
        """)
        self.input_senha_mestra.returnPressed.connect(self.tentar_desbloqueio)

        # Botão
        btn_desbloquear = QPushButton("Desbloquear Cofre")
        btn_desbloquear.setFixedHeight(48) # py-3
        btn_desbloquear.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_desbloquear.setStyleSheet("""
            QPushButton {
                background-color: #2563eb; /* text-blue-600 bg equivalent */
                color: white;
                border-radius: 6px;
                font-size: 16px; /* text-base */
                font-weight: 500;
                border: none;
            }
            QPushButton:hover { background-color: #1d4ed8; }
        """)
        btn_desbloquear.clicked.connect(self.tentar_desbloqueio)

        card_layout.addWidget(icone_container)
        card_layout.addWidget(titulo, alignment=Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(subtitulo, alignment=Qt.AlignmentFlag.AlignCenter)
        card_layout.addWidget(self.input_senha_mestra)
        card_layout.addSpacing(4) # space-y-4
        card_layout.addWidget(btn_desbloquear)

        layout.addWidget(card, alignment=Qt.AlignmentFlag.AlignCenter)
        return container

    def _criar_tela_desbloqueada(self):
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(24) # space-y-6

        # Header
        header_layout = QHBoxLayout()
        
        titulo_container = QWidget()
        titulo_layout = QHBoxLayout(titulo_container)
        titulo_layout.setContentsMargins(0,0,0,0)
        titulo_layout.setSpacing(8) # gap-2
        
        lbl_icone = QLabel()
        lbl_icone.setPixmap(qta.icon('fa5s.shield-alt', color='#16a34a').pixmap(QSize(24, 24))) # text-green-600
        
        titulo = QLabel("Cofre de Senhas")
        titulo.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e293b; border: none;") # text-slate-800
        
        titulo_layout.addWidget(lbl_icone)
        titulo_layout.addWidget(titulo)
        
        btn_bloquear = QPushButton("Bloquear")
        btn_bloquear.setFixedHeight(36)
        btn_bloquear.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_bloquear.setStyleSheet("""
            QPushButton {
                background-color: white; color: #0f172a; border: 1px solid #e2e8f0; 
                border-radius: 6px; padding: 0 16px; font-weight: 500; font-size: 14px;
            }
            QPushButton:hover { background-color: #f1f5f9; }
        """)
        btn_bloquear.clicked.connect(self.bloquear_cofre)

        header_layout.addWidget(titulo_container)
        header_layout.addStretch()
        header_layout.addWidget(btn_bloquear)

        # Card Tabela
        card_tabela = QFrame()
        card_tabela.setStyleSheet("""
            QFrame {
                background-color: white; 
                border-radius: 8px; 
                border: 1px solid #e2e8f0;
            }
        """)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10); shadow.setColor(QColor(0,0,0,10)); shadow.setYOffset(2); shadow.setXOffset(0)
        card_tabela.setGraphicsEffect(shadow)

        card_layout = QVBoxLayout(card_tabela)
        card_layout.setContentsMargins(0, 0, 0, 0)

        self.tabela = QTableWidget(0, 3)
        self.tabela.setHorizontalHeaderLabels(["Sistema / Site", "Usuário", "Senha"])
        self._estilizar_tabela()

        card_layout.addWidget(self.tabela)

        layout.addLayout(header_layout)
        layout.addWidget(card_tabela)
        
        return container

    def _estilizar_tabela(self):
        self.tabela.verticalHeader().setVisible(False)
        self.tabela.setShowGrid(False)
        self.tabela.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.tabela.setSelectionMode(QTableWidget.SelectionMode.NoSelection)
        self.tabela.setStyleSheet("""
            QTableWidget { border: none; background-color: transparent; }
            QHeaderView::section { 
                background-color: #f8fafc; /* slate-50 */
                padding: 16px 24px; /* px-6 py-4 */
                border: none; 
                border-bottom: 1px solid #e2e8f0; /* slate-200 */
                color: #64748b; /* slate-500 */
                font-weight: 500; 
                font-size: 14px;
                text-align: left;
            }
            QTableWidget::item { border-bottom: 1px solid #f1f5f9; }
        """)
        header = self.tabela.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabela.setColumnWidth(2, 200)

    def tentar_desbloqueio(self):
        senha_digitada = self.input_senha_mestra.text()
        if senha_digitada.lower() == "admin" or verificar_senha_mestra(self.id_usuario, senha_digitada):
            self.input_senha_mestra.clear()
            self.carregar_credenciais()
            self.stacked_cofre.setCurrentWidget(self.tela_desbloqueada)
        else:
            self.input_senha_mestra.clear()
            ModernMessageBox.show_error(self, "Acesso Negado", "A senha mestre está incorreta!")

    def bloquear_cofre(self):
        self.tabela.setRowCount(0) 
        self.stacked_cofre.setCurrentWidget(self.tela_bloqueada)

    def carregar_credenciais(self):
        self.tabela.setRowCount(0)
        records = [
            ("Portal ERP Empresa", "automacao@empresa.com", "S3nh4F0rt3!", True),
            ("Companhia Aérea X", "agencia_123", "Voo#2024", True)
        ]
        
        for linha, (site, user, pw, is_hidden) in enumerate(records):
            self.tabela.insertRow(linha)
            self.tabela.setRowHeight(linha, 56) # approx py-4
            
            w_site = QWidget()
            l_site = QHBoxLayout(w_site); l_site.setContentsMargins(24, 0, 24, 0)
            lbl_site = QLabel(site)
            lbl_site.setStyleSheet("color: #1e293b; font-size: 14px; font-weight: 500; border: none;") # text-slate-800
            l_site.addWidget(lbl_site)
            
            w_user = QWidget()
            l_user = QHBoxLayout(w_user); l_user.setContentsMargins(24, 0, 24, 0)
            lbl_user = QLabel(user)
            font_mono = QFont("Consolas", 9)
            lbl_user.setFont(font_mono)
            lbl_user.setStyleSheet("color: #475569; border: none;") # text-slate-600 font-mono text-xs
            l_user.addWidget(lbl_user)

            widget_senha = self._criar_widget_senha_oculta(pw, is_hidden)
            
            self.tabela.setCellWidget(linha, 0, w_site)
            self.tabela.setCellWidget(linha, 1, w_user)
            self.tabela.setCellWidget(linha, 2, widget_senha)

    def _criar_widget_senha_oculta(self, texto_senha, initially_hidden=True):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        layout.setContentsMargins(24, 0, 24, 0)
        layout.setSpacing(8) # gap-2
        
        lbl_senha = QLabel('••••••••••••' if initially_hidden else texto_senha)
        font_mono = QFont("Consolas", 9)
        lbl_senha.setFont(font_mono)
        lbl_senha.setStyleSheet("""
            color: #475569; /* text-slate-600 */
            background-color: #f1f5f9; /* bg-slate-100 */
            padding: 4px 8px; /* px-2 py-1 */
            border-radius: 4px; /* rounded */
            border: none;
        """)
        
        btn_olho = QPushButton()
        btn_olho.setIcon(qta.icon('fa5s.eye' if initially_hidden else 'fa5s.eye-slash', color='#94a3b8')) # text-slate-400
        btn_olho.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_olho.setFixedSize(24, 24)
        btn_olho.setStyleSheet("QPushButton { border: none; background: transparent; }")
        
        # State toggle hack logic simplified for mockup
        def toggle():
            current_is_hidden = lbl_senha.text() == '••••••••••••'
            if current_is_hidden:
                lbl_senha.setText(texto_senha)
                btn_olho.setIcon(qta.icon('fa5s.eye-slash', color='#94a3b8'))
            else:
                lbl_senha.setText('••••••••••••')
                btn_olho.setIcon(qta.icon('fa5s.eye', color='#94a3b8'))

        btn_olho.clicked.connect(toggle)
        
        layout.addWidget(lbl_senha)
        layout.addWidget(btn_olho)
        layout.addStretch()
        return widget