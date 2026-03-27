# ui/login_window.py
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QLineEdit, QPushButton, QFrame, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt
from PySide6.QtGui import QCursor, QFont, QColor

# Importando o banco e nosso componente de mensagem!
from core.banco import login_principal
from ui.components.modern_msg_box import ModernMessageBox

class LoginWindow(QWidget):
    def __init__(self, on_login_success, on_go_to_cadastro):
        super().__init__()
        
        # Callback para avisar o main.py que o login deu certo
        self.on_login_success = on_login_success 
        self.on_go_to_cadastro = on_go_to_cadastro
        
        self.setWindowTitle("Login - AutoBot Pro")
        self.resize(1000, 650)
        self.setObjectName("LoginWindow") # Usado para o CSS pegar só o fundo
        
        # Fonte global moderna
        fonte_moderna = QFont("Segoe UI", 10)
        fonte_moderna.setStyleHint(QFont.StyleHint.SansSerif) 
        self.setFont(fonte_moderna)

        # O FUNDO GRADIENTE (Estilo moderno)
        self.setStyleSheet("""
            QWidget#LoginWindow {
                background: qlineargradient(
                    x1:0, y1:0, x2:1, y2:1, 
                    stop:0 #0f172a, /* Azul marinho muito escuro */
                    stop:1 #1e3a8a  /* Azul royal profundo */
                );
            }
        """)

        # Layout principal que vai centralizar o Cartão
        main_layout = QVBoxLayout(self)
        main_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # =========================================================
        # O CARTÃO DE LOGIN (Simulando Glass/Clean)
        # =========================================================
        card = QFrame()
        card.setFixedSize(400, 480)
        card.setStyleSheet("""
            QFrame {
                background-color: rgba(255, 255, 255, 0.95); /* Branco levemente translúcido */
                border-radius: 16px;
            }
        """)

        # A Sombra que faz o cartão "flutuar" no fundo azul
        sombra = QGraphicsDropShadowEffect()
        sombra.setBlurRadius(40)
        sombra.setXOffset(0)
        sombra.setYOffset(15)
        sombra.setColor(QColor(0, 0, 0, 80))
        card.setGraphicsEffect(sombra)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(40, 50, 40, 50)
        card_layout.setSpacing(20)

        # --- Logo e Títulos ---
        lbl_logo = QLabel("▶")
        lbl_logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_logo.setStyleSheet("color: #2563eb; font-size: 45px; background: transparent;")

        lbl_titulo = QLabel("AutoBot Pro")
        lbl_titulo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_titulo.setStyleSheet("color: #0f172a; font-size: 26px; font-weight: bold; background: transparent;")
        
        lbl_sub = QLabel("Faça login para continuar")
        lbl_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_sub.setStyleSheet("color: #64748b; font-size: 14px; background: transparent; margin-bottom: 15px;")

        # --- Inputs ---
        self.input_user = self._criar_input("Usuário")
        self.input_pass = self._criar_input("Senha", is_password=True)

        # Permitir login com "Enter"
        self.input_pass.returnPressed.connect(self.tentar_login)

        # --- Botão de Login ---
        btn_login = QPushButton("Entrar no Sistema")
        btn_login.setFixedHeight(45)
        btn_login.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_login.setStyleSheet("""
            QPushButton {
                background-color: #2563eb;
                color: white;
                border-radius: 8px;
                font-size: 15px;
                font-weight: bold;
                margin-top: 10px;
            }
            QPushButton:hover {
                background-color: #1d4ed8;
            }
        """)
        btn_login.clicked.connect(self.tentar_login)

        btn_cadastro = QPushButton("Realizar cadastro")
        btn_cadastro.setFixedHeight(45)
        btn_cadastro.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_cadastro.setStyleSheet("""
            QPushButton {
                background-color: #4ac246;
                color: white;
                border-radius: 8px;
                font-size: 15px;
                font-weight: bold;
                margin-top: 10px;
            }
            QPushButton:hover {
                background-color: #3da539;
            }
        """)
        btn_cadastro.clicked.connect(self.on_go_to_cadastro)

        # Montagem do Card
        card_layout.addWidget(lbl_logo)
        card_layout.addWidget(lbl_titulo)
        card_layout.addWidget(lbl_sub)
        card_layout.addWidget(self.input_user)
        card_layout.addWidget(self.input_pass)
        card_layout.addWidget(btn_login)
        card_layout.addWidget(btn_cadastro)
        card_layout.addStretch()

        main_layout.addWidget(card)

    def _criar_input(self, placeholder, is_password=False):
        """Helper para padronizar os campos de texto do login"""
        inp = QLineEdit()
        inp.setPlaceholderText(placeholder)
        inp.setFixedHeight(45)
        if is_password:
            inp.setEchoMode(QLineEdit.EchoMode.Password)
            
        inp.setStyleSheet("""
            QLineEdit {
                background-color: #f1f5f9;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                padding: 0 15px;
                font-size: 14px;
                color: #0f172a;
            }
            QLineEdit:focus {
                border: 2px solid #2563eb;
                background-color: white;
            }
        """)
        return inp

    def tentar_login(self):
        usuario = self.input_user.text().strip()
        senha = self.input_pass.text().strip()

        if not usuario or not senha:
            ModernMessageBox.show_warning(self, "Campos Vazios", "Por favor, preencha o usuário e a senha.")
            return

        # Chama o seu banco.py
        # NOTA: Adapte o retorno abaixo conforme sua função login_principal funciona.
        # Geralmente ela retorna True/False ou o ID do usuário.
        if login_principal(usuario, senha):
            self.on_login_success() # Chama o callback para abrir o app principal
        else:
            self.input_pass.clear()
            ModernMessageBox.show_error(self, "Acesso Negado", "Usuário ou senha incorretos.")