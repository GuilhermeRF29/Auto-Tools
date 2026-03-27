# ui/components/modern_msg_box.py
from PySide6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
                               QPushButton, QFrame, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt
from PySide6.QtGui import QColor, QCursor

class ModernMessageBox(QDialog):
    def __init__(self, parent, tipo, titulo, mensagem):
        super().__init__(parent)
        
        # O SEGREDINHO MÁGICO: Remove as bordas do Windows e permite fundo transparente
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedWidth(400)

        # Layout principal do Dialog
        layout_principal = QVBoxLayout(self)
        layout_principal.setContentsMargins(20, 20, 20, 20) # Margem para a sombra respirar

        # O Cartão Branco que será a verdadeira janela visual
        card = QFrame()
        card.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 12px;
                border: 1px solid #e2e8f0;
            }
        """)
        
        # Adicionando a sombra no cartão
        sombra = QGraphicsDropShadowEffect()
        sombra.setBlurRadius(25)
        sombra.setXOffset(0)
        sombra.setYOffset(10)
        sombra.setColor(QColor(0, 0, 0, 40)) # Sombra um pouquinho mais forte para o popup saltar
        card.setGraphicsEffect(sombra)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(25, 25, 25, 25)
        card_layout.setSpacing(15)

        # --- Definindo Cores e Ícones Dinâmicos ---
        cor_base = "#3b82f6" # Azul padrão
        icone_txt = "ℹ️"
        
        if tipo == "sucesso":
            cor_base = "#10b981" # Verde
            icone_txt = "✅"
        elif tipo == "erro":
            cor_base = "#ef4444" # Vermelho
            icone_txt = "❌"
        elif tipo == "aviso":
            cor_base = "#f59e0b" # Laranja/Amarelo
            icone_txt = "⚠️"

        # --- Cabeçalho (Ícone + Título) ---
        header_layout = QHBoxLayout()
        header_layout.setSpacing(10)
        
        lbl_icone = QLabel(icone_txt)
        lbl_icone.setStyleSheet(f"font-size: 20px; background: transparent; border: none;")
        
        lbl_titulo = QLabel(titulo)
        lbl_titulo.setStyleSheet(f"color: {cor_base}; font-size: 18px; font-weight: bold; background: transparent; border: none;")
        
        header_layout.addWidget(lbl_icone)
        header_layout.addWidget(lbl_titulo)
        header_layout.addStretch()

        # --- Mensagem ---
        lbl_mensagem = QLabel(mensagem)
        lbl_mensagem.setWordWrap(True) # Faz a quebra de linha automática
        lbl_mensagem.setStyleSheet("color: #475569; font-size: 14px; background: transparent; border: none; margin-top: 5px;")

        # --- Botão OK ---
        btn_layout = QHBoxLayout()
        btn_ok = QPushButton("Entendido")
        btn_ok.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_ok.setFixedHeight(38)
        btn_ok.setStyleSheet(f"""
            QPushButton {{
                background-color: {cor_base};
                color: white;
                border-radius: 6px;
                font-weight: bold;
                font-size: 14px;
                padding: 0 25px;
            }}
            QPushButton:hover {{
                background-color: {cor_base}e6; /* Leve transparência no hover */
            }}
        """)
        btn_ok.clicked.connect(self.accept) # Fecha o dialog
        
        btn_layout.addStretch() # Empurra o botão pra direita
        btn_layout.addWidget(btn_ok)

        # Montando o card
        card_layout.addLayout(header_layout)
        card_layout.addWidget(lbl_mensagem)
        card_layout.addSpacing(10)
        card_layout.addLayout(btn_layout)

        layout_principal.addWidget(card)

    # --- Funções Estáticas para facilitar a chamada ---
    @staticmethod
    def show_info(parent, titulo, mensagem):
        ModernMessageBox(parent, "info", titulo, mensagem).exec()

    @staticmethod
    def show_success(parent, titulo, mensagem):
        ModernMessageBox(parent, "sucesso", titulo, mensagem).exec()

    @staticmethod
    def show_error(parent, titulo, mensagem):
        ModernMessageBox(parent, "erro", titulo, mensagem).exec()

    @staticmethod
    def show_warning(parent, titulo, mensagem):
        ModernMessageBox(parent, "aviso", titulo, mensagem).exec()