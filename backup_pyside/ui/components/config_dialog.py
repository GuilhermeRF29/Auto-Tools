# ui/components/config_dialog.py
from PySide6.QtWidgets import (QDialog, QVBoxLayout, QHBoxLayout, QLabel, 
                               QComboBox, QPushButton, QDateEdit, QFrame, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QDate
from PySide6.QtGui import QColor, QCursor
import qtawesome as qta # A biblioteca mágica de ícones!

class ConfigDialog(QDialog):
    def __init__(self, nome_robo, parent=None):
        super().__init__(parent)
        
        # 1. A MÁGICA DO LIGHTBOX: Remove bordas e ativa fundo translúcido
        self.setWindowFlags(Qt.WindowType.Dialog | Qt.WindowType.FramelessWindowHint)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        
        # A janela do Dialog pega o tamanho exato da janela principal (parent)
        if parent:
            self.resize(parent.size())
            # Opcional: Centraliza o modal em relação à tela principal (se ela for movida)
            self.move(parent.mapToGlobal(parent.rect().topLeft()))
        else:
            self.resize(1280, 800)

        # O fundo azul-marinho com 60% de opacidade que cobre tudo
        self.setStyleSheet("QDialog { background-color: rgba(15, 23, 42, 0.6); }")

        # Layout que vai segurar o nosso cartão e centralizá-lo na tela
        layout_principal = QVBoxLayout(self)
        layout_principal.setAlignment(Qt.AlignmentFlag.AlignCenter)

        # =======================================================
        # O CARTÃO BRANCO DO MODAL
        # =======================================================
        card = QFrame()
        card.setFixedSize(450, 420) # Tamanho fixo apenas para o cartão
        card.setStyleSheet("""
            QFrame { background-color: white; border-radius: 16px; border: 1px solid #e2e8f0; }
            QLabel { color: #334155; font-size: 14px; font-weight: bold; border: none; background: transparent;}
            QDateEdit, QComboBox { 
                padding: 10px 15px; border: 1px solid #cbd5e1; 
                border-radius: 8px; background-color: #f8fafc; color: #0f172a;
            }
            QDateEdit:focus, QComboBox:focus { border: 2px solid #3b82f6; background-color: white; }
            QComboBox::drop-down { border: none; padding-right: 10px; }
        """)
        
        # A sombra do cartão (ainda mais bonita no fundo escuro)
        sombra = QGraphicsDropShadowEffect()
        sombra.setBlurRadius(40); sombra.setYOffset(15); sombra.setColor(QColor(0, 0, 0, 80))
        card.setGraphicsEffect(sombra)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(35, 35, 35, 35)
        card_layout.setSpacing(15)

        # Cabeçalho (Usando qtawesome!)
        header_layout = QHBoxLayout()
        # Ícone de engrenagem da família FontAwesome 5 Solid (fa5s)
        lbl_icone = QLabel()
        lbl_icone.setPixmap(qta.icon('fa5s.cog', color='#3b82f6').pixmap(24, 24)) 
        lbl_icone.setStyleSheet("background: transparent; border: none;")
        
        lbl_titulo = QLabel(f"Configurar: {nome_robo}")
        lbl_titulo.setStyleSheet("font-size: 18px; color: #0f172a; font-weight: bold;")
        
        header_layout.addWidget(lbl_icone)
        header_layout.addWidget(lbl_titulo)
        header_layout.addStretch()
        card_layout.addLayout(header_layout)
        card_layout.addSpacing(10)

        # Inputs do Robô
        card_layout.addWidget(QLabel("Data Início:"))
        self.input_data_inicio = QDateEdit()
        self.input_data_inicio.setCalendarPopup(True)
        self.input_data_inicio.setDate(QDate.currentDate().addDays(-30))
        card_layout.addWidget(self.input_data_inicio)

        card_layout.addWidget(QLabel("Data Final:"))
        self.input_data_final = QDateEdit()
        self.input_data_final.setCalendarPopup(True)
        self.input_data_final.setDate(QDate.currentDate())
        card_layout.addWidget(self.input_data_final)

        card_layout.addWidget(QLabel("Modo de Execução:"))
        self.input_modo = QComboBox()
        self.input_modo.addItems(["completo", "download", "tratamento", "download_tratamento"])
        card_layout.addWidget(self.input_modo)

        card_layout.addStretch()

        # Botões (Usando ícones)
        botoes_layout = QHBoxLayout()
        btn_cancelar = QPushButton(" Cancelar")
        btn_cancelar.setIcon(qta.icon('fa5s.times', color='#475569')) # Ícone de X
        btn_cancelar.setFixedHeight(45)
        btn_cancelar.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_cancelar.setStyleSheet("""
            QPushButton { background-color: white; border: 1px solid #cbd5e1; color: #475569; border-radius: 8px; font-weight: bold; padding: 0 15px; } 
            QPushButton:hover { background-color: #f1f5f9; }
        """)
        btn_cancelar.clicked.connect(self.reject)

        btn_iniciar = QPushButton(" Iniciar Automação")
        btn_iniciar.setIcon(qta.icon('fa5s.play', color='white')) # Ícone de Play
        btn_iniciar.setFixedHeight(45)
        btn_iniciar.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_iniciar.setStyleSheet("""
            QPushButton { background-color: #2563eb; color: white; border-radius: 8px; font-weight: bold; padding: 0 15px; border: none; } 
            QPushButton:hover { background-color: #1d4ed8; }
        """)
        btn_iniciar.clicked.connect(self.accept)

        botoes_layout.addWidget(btn_cancelar)
        botoes_layout.addWidget(btn_iniciar)
        
        card_layout.addLayout(botoes_layout)
        
        # Adiciona o cartão centralizado na nossa "tela escura"
        layout_principal.addWidget(card)

    def obter_parametros(self):
        return {
            "data_inicio": self.input_data_inicio.date().toString("dd/MM/yyyy"),
            "data_final": self.input_data_final.date().toString("dd/MM/yyyy"),
            "modo_execucao": self.input_modo.currentText()
        }