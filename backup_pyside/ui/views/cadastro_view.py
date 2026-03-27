# ui/views/cadastro_view.py
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QLineEdit, QPushButton, QFrame, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt
from PySide6.QtGui import QCursor, QColor

from core.banco import cadastrar_usuario_principal
from ui.components.modern_msg_box import ModernMessageBox

class CadastroView(QWidget):
    def __init__(self, on_cadastro_success, on_voltar_login):
        super().__init__()
        self.on_cadastro_success = on_cadastro_success
        self.on_voltar_login = on_voltar_login
        
        # Mesmo fundo gradiente elegante do Login
        self.setStyleSheet("""
            CadastroView {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1, stop:0 #0f172a, stop:1 #1e3a8a);
            }
        """)

        main_layout = QVBoxLayout(self)
        main_layout.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # O Cartão de Cadastro
        card = QFrame()
        card.setFixedSize(400, 520) # Um pouco mais alto que o login para caber o 3º input
        card.setStyleSheet("QFrame { background-color: rgba(255, 255, 255, 0.95); border-radius: 16px; }")

        sombra = QGraphicsDropShadowEffect()
        sombra.setBlurRadius(40)
        sombra.setYOffset(15)
        sombra.setColor(QColor(0, 0, 0, 80))
        card.setGraphicsEffect(sombra)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(40, 40, 40, 40)
        card_layout.setSpacing(15)

        lbl_titulo = QLabel("Criar Conta")
        lbl_titulo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_titulo.setStyleSheet("color: #0f172a; font-size: 26px; font-weight: bold; background: transparent;")
        
        lbl_sub = QLabel("Cadastre-se para acessar o AutoBot")
        lbl_sub.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_sub.setStyleSheet("color: #64748b; font-size: 14px; background: transparent; margin-bottom: 10px;")

        self.input_user = self._criar_input("Novo Usuário")
        self.input_pass = self._criar_input("Senha Mestra", is_password=True)
        self.input_pass_confirm = self._criar_input("Confirmar Senha Mestra", is_password=True)

        btn_cadastrar = QPushButton("Registrar")
        btn_cadastrar.setFixedHeight(45)
        btn_cadastrar.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_cadastrar.setStyleSheet("""
            QPushButton { background-color: #10b981; color: white; border-radius: 8px; font-size: 15px; font-weight: bold; margin-top: 10px;}
            QPushButton:hover { background-color: #059669; }
        """)
        btn_cadastrar.clicked.connect(self.tentar_cadastro)

        btn_voltar = QPushButton("← Voltar para o Login")
        btn_voltar.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_voltar.setStyleSheet("QPushButton { color: #3b82f6; background: transparent; border: none; font-weight: bold; margin-top: 10px;} QPushButton:hover { color: #1d4ed8; text-decoration: underline; }")
        btn_voltar.clicked.connect(self.on_voltar_login)

        card_layout.addWidget(lbl_titulo)
        card_layout.addWidget(lbl_sub)
        card_layout.addWidget(self.input_user)
        card_layout.addWidget(self.input_pass)
        card_layout.addWidget(self.input_pass_confirm)
        card_layout.addWidget(btn_cadastrar)
        card_layout.addWidget(btn_voltar)
        card_layout.addStretch()

        main_layout.addWidget(card)

    def _criar_input(self, placeholder, is_password=False):
        inp = QLineEdit()
        inp.setPlaceholderText(placeholder)
        inp.setFixedHeight(45)
        if is_password: inp.setEchoMode(QLineEdit.EchoMode.Password)
        inp.setStyleSheet("QLineEdit { background-color: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0 15px; font-size: 14px; color: #0f172a; } QLineEdit:focus { border: 2px solid #2563eb; background-color: white; }")
        return inp

    def tentar_cadastro(self):
        usuario = self.input_user.text().strip()
        senha = self.input_pass.text().strip()
        confirmacao = self.input_pass_confirm.text().strip()

        if not usuario or not senha:
            ModernMessageBox.show_warning(self, "Atenção", "Preencha todos os campos!")
            return
        if senha != confirmacao:
            ModernMessageBox.show_error(self, "Erro", "As senhas não coincidem!")
            return

        # Cadastra usando seu banco
        if cadastrar_usuario_principal(usuario, senha, confirmacao):
            ModernMessageBox.show_success(self, "Bem-vindo!", "Conta criada com sucesso! Faça login para continuar.")
            self.input_user.clear(); self.input_pass.clear(); self.input_pass_confirm.clear()
            self.on_cadastro_success() # Volta pro login automaticamente
        else:
            ModernMessageBox.show_error(self, "Erro", "Este usuário já existe!")