# ui/views/calculadora_view.py
import qtawesome as qta
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QLineEdit, QPushButton, QFrame, QScrollArea, QComboBox,
                               QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QCursor, QColor

class CalculadoraView(QWidget):
    def __init__(self):
        super().__init__()
        self.setStyleSheet("background-color: transparent;")
        
        layout_principal = QVBoxLayout(self)
        layout_principal.setContentsMargins(32, 32, 32, 32) # p-8
        layout_principal.setSpacing(24) # space-y-6

        # =========================================================
        # HEADER (Calculadora de Viagens)
        # ==========================================
        header_layout = QHBoxLayout()
        titulo = QLabel("Calculadora de Viagens")
        titulo.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e293b; border: none;") # text-slate-800
        
        btn_relatorio = QPushButton(f"  Gerar Relatório Final")
        btn_relatorio.setIcon(qta.icon('fa5s.file-alt', color='white'))
        btn_relatorio.setIconSize(QSize(18, 18))
        btn_relatorio.setFixedHeight(40)
        btn_relatorio.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_relatorio.setStyleSheet("""
            QPushButton {
                background-color: #2563eb; /* bg-blue-600 */
                color: white; 
                border-radius: 6px; 
                padding: 0 16px; 
                font-weight: 500;
                font-size: 14px;
                border: none;
            }
            QPushButton:hover { background-color: #1d4ed8; }
        """)

        header_layout.addWidget(titulo)
        header_layout.addStretch()
        header_layout.addWidget(btn_relatorio)
        
        layout_principal.addLayout(header_layout)

        # Container do Grid Resposivo (2/3 Esquerda, 1/3 Direita)
        grid_layout = QHBoxLayout()
        grid_layout.setSpacing(24) # gap-6

        # COLUNA ESQUERDA (xl:col-span-2)
        col_esq = QWidget()
        l_esq = QVBoxLayout(col_esq)
        l_esq.setContentsMargins(0, 0, 0, 0)
        l_esq.setSpacing(24) # space-y-6

        # CARD 1: Dados da Viagem
        card1 = self._criar_card_base()
        c1_layout = QVBoxLayout(card1)
        c1_layout.setContentsMargins(0, 0, 0, 0)
        c1_layout.setSpacing(0)
        
        c1_head = self._criar_card_header("1. Dados da Viagem")
        c1_body = QWidget()
        c1_b_layout = QHBoxLayout(c1_body)
        c1_b_layout.setContentsMargins(24, 24, 24, 24) # p-6
        c1_b_layout.setSpacing(24) # gap-6
        
        # PNR
        self.input_pnr = QLineEdit()
        self.input_pnr.setPlaceholderText("Ex: ABC123")
        self.input_pnr.setStyleSheet(self._estilo_input() + "text-transform: uppercase;")
        self.input_pnr.setFixedHeight(42) # p-2.5
        c1_b_layout.addLayout(self._criar_input_group("Localizador (PNR)", self.input_pnr))
        
        # Cia Aérea
        self.combo_cia = QComboBox()
        self.combo_cia.addItems(["LATAM", "GOL", "AZUL"])
        self.combo_cia.setStyleSheet(self._estilo_input())
        self.combo_cia.setFixedHeight(42)
        c1_b_layout.addLayout(self._criar_input_group("Companhia Aérea", self.combo_cia))
        
        c1_layout.addWidget(c1_head)
        c1_layout.addWidget(c1_body)
        l_esq.addWidget(card1)

        # CARD 2: Passageiros e Valores
        card2 = self._criar_card_base()
        c2_layout = QVBoxLayout(card2)
        c2_layout.setContentsMargins(0, 0, 0, 0)
        c2_layout.setSpacing(0)
        
        c2_head = QWidget()
        c2_head.setFixedHeight(56)
        c2_head.setStyleSheet("background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top-left-radius: 8px; border-top-right-radius: 8px;")
        c2_h_l = QHBoxLayout(c2_head)
        c2_h_l.setContentsMargins(16, 0, 16, 0)
        
        c2_t = QLabel("2. Passageiros e Valores")
        c2_t.setStyleSheet("font-weight: 600; color: #1e293b; font-size: 15px; border: none; background: transparent;")
        
        btn_add = QPushButton(" Adicionar")
        btn_add.setIcon(qta.icon('fa5s.plus', color='#1e293b'))
        btn_add.setIconSize(QSize(12, 12))
        btn_add.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_add.setStyleSheet("""
            QPushButton { color: #1e293b; font-size: 13px; font-weight: 500; border: none; background: transparent; padding: 4px; }
            QPushButton:hover { background-color: #e2e8f0; border-radius: 4px; }
        """)
        btn_add.clicked.connect(lambda: self.adicionar_linha_passageiro())
        
        c2_h_l.addWidget(c2_t)
        c2_h_l.addStretch()
        c2_h_l.addWidget(btn_add)
        
        c2_layout.addWidget(c2_head)
        
        c2_body = QWidget()
        self.pax_layout = QVBoxLayout(c2_body)
        self.pax_layout.setContentsMargins(24, 24, 24, 24) # p-6
        self.pax_layout.setSpacing(16) # space-y-4
        
        c2_layout.addWidget(c2_body)
        l_esq.addWidget(card2)
        l_esq.addStretch()
        
        # Scroll para Coluna Esquerda
        scroll_esq = QScrollArea()
        scroll_esq.setWidgetResizable(True)
        scroll_esq.setStyleSheet("border: none; background: transparent;")
        scroll_esq.setWidget(col_esq)

        grid_layout.addWidget(scroll_esq, stretch=2)

        # COLUNA DIREITA (xl:col-span-1) --- Resumo do Cálculo
        col_dir = QWidget()
        l_dir = QVBoxLayout(col_dir)
        l_dir.setContentsMargins(0, 0, 0, 0)
        l_dir.setSpacing(0)
        
        card3 = self._criar_card_base()
        c3_layout = QVBoxLayout(card3)
        c3_layout.setContentsMargins(0, 0, 0, 0)
        c3_layout.setSpacing(0)
        
        c3_head = QWidget()
        c3_head.setFixedHeight(56) # p-4 bg-slate-800 text-white rounded-t-lg
        c3_head.setStyleSheet("background-color: #1e293b; border-bottom: 1px solid #1e293b; border-top-left-radius: 8px; border-top-right-radius: 8px;")
        c3_h_l = QHBoxLayout(c3_head)
        c3_h_l.setContentsMargins(16, 0, 16, 0)
        c3_t = QLabel("Resumo do Cálculo")
        c3_t.setStyleSheet("font-weight: 600; color: white; font-size: 15px; border: none; background: transparent;")
        c3_h_l.addWidget(c3_t)
        c3_layout.addWidget(c3_head)
        
        c3_body = QWidget()
        c3_b_l = QVBoxLayout(c3_body)
        c3_b_l.setContentsMargins(24, 24, 24, 24) # p-6
        c3_b_l.setSpacing(16) # space-y-4
        
        c3_b_l.addWidget(self._criar_linha_resumo("Subtotal Tarifas", "R$ 1.500,00"))
        
        # Linha Total (pt-4 border-t border-slate-200)
        linha_sep = QFrame()
        linha_sep.setFixedHeight(1)
        linha_sep.setStyleSheet("background-color: #e2e8f0; margin-top: 16px; margin-bottom: 16px;")
        c3_b_l.addWidget(linha_sep)
        
        w_tot = QWidget()
        l_tot = QHBoxLayout(w_tot)
        l_tot.setContentsMargins(0,0,0,0)
        lbl_ft = QLabel("Total Final")
        lbl_ft.setStyleSheet("font-weight: bold; color: #1e293b; font-size: 15px;") # text-slate-800
        lbl_fv = QLabel("R$ 1.500,00")
        lbl_fv.setStyleSheet("font-weight: bold; color: #2563eb; font-size: 20px;") # text-xl text-blue-600
        l_tot.addWidget(lbl_ft)
        l_tot.addStretch()
        l_tot.addWidget(lbl_fv)
        c3_b_l.addWidget(w_tot)
        
        c3_layout.addWidget(c3_body)
        l_dir.addWidget(card3)
        l_dir.addStretch()

        grid_layout.addWidget(col_dir, stretch=1)
        
        layout_principal.addLayout(grid_layout)

        # Primeira Linha default
        self.adicionar_linha_passageiro("João Silva", "1500,00")

    def _criar_card_base(self):
        c = QFrame()
        c.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 8px;
                border: 1px solid #e2e8f0;
            }
        """)
        s = QGraphicsDropShadowEffect(); s.setBlurRadius(10); s.setColor(QColor(0,0,0,10)); s.setYOffset(2); s.setXOffset(0)
        c.setGraphicsEffect(s)
        return c

    def _criar_card_header(self, titulo):
        h = QWidget()
        h.setFixedHeight(56) # approx p-4
        h.setStyleSheet("background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top-left-radius: 8px; border-top-right-radius: 8px;")
        l = QHBoxLayout(h)
        l.setContentsMargins(16, 0, 16, 0)
        t = QLabel(titulo)
        t.setStyleSheet("font-weight: 600; color: #1e293b; font-size: 15px; border: none; background: transparent;")
        l.addWidget(t)
        return h

    def _criar_input_group(self, label, widget):
        v = QVBoxLayout()
        v.setSpacing(4) # mb-1 -> 4px
        l = QLabel(label)
        l.setStyleSheet("font-size: 12px; font-weight: 500; color: #475569; border: none; background: transparent;") # text-xs text-slate-500
        v.addWidget(l)
        v.addWidget(widget)
        return v

    def _estilo_input(self):
        return """
            QLineEdit, QComboBox {
                background-color: white;
                border: 1px solid #cbd5e1; /* border-slate-300 */
                border-radius: 6px;
                padding-left: 10px;
                padding-right: 10px;
                font-size: 14px; /* text-sm */
                color: #0f172a;
            }
            QLineEdit:focus, QComboBox:focus {
                border: 2px solid #3b82f6; /* ring-blue-500 */
                background-color: white;
            }
        """

    def adicionar_linha_passageiro(self, nome="", tarifa=""):
        row = QWidget()
        row_layout = QHBoxLayout(row)
        row_layout.setContentsMargins(0, 0, 0, 0)
        row_layout.setSpacing(16) # gap-4 items-end
        row_layout.setAlignment(Qt.AlignmentFlag.AlignBottom)

        inp_nome = QLineEdit(nome)
        inp_nome.setStyleSheet(self._estilo_input())
        inp_nome.setFixedHeight(38) # p-2 text-sm
        l_nome = self._criar_input_group("Nome do Passageiro", inp_nome)

        inp_tarifa = QLineEdit(tarifa)
        inp_tarifa.setStyleSheet(self._estilo_input())
        inp_tarifa.setFixedHeight(38)
        l_tarifa = self._criar_input_group("Tarifa (R$)", inp_tarifa)
        
        # O container da tarifa é fixo w-32 (128px) aprox
        w_t = QWidget()
        l_t_v = QVBoxLayout(w_t)
        l_t_v.setContentsMargins(0,0,0,0)
        l_t_v.addLayout(l_tarifa)
        w_t.setFixedWidth(128)

        # Botão Trash
        btn_rm = QPushButton()
        btn_rm.setIcon(qta.icon('fa5s.trash-alt', color='#94a3b8')) # text-slate-400
        btn_rm.setFixedSize(32, 32)
        btn_rm.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_rm.setStyleSheet("""
            QPushButton { border: none; background: transparent; margin-bottom: 2px; }
        """)
        btn_rm.clicked.connect(lambda: row.deleteLater())
        
        w_rm = QWidget()
        l_rm = QVBoxLayout(w_rm); l_rm.setContentsMargins(0,0,0,0)
        l_rm.addStretch()
        l_rm.addWidget(btn_rm, alignment=Qt.AlignmentFlag.AlignBottom)

        row_layout.addLayout(l_nome)
        row_layout.addWidget(w_t)
        row_layout.addWidget(w_rm)

        self.pax_layout.addWidget(row)

    def _criar_linha_resumo(self, titulo, valor):
        w = QWidget()
        l = QHBoxLayout(w)
        l.setContentsMargins(0,0,0,0)
        
        lb_t = QLabel(titulo)
        lb_t.setStyleSheet("color: #64748b; font-size: 14px; border: none; background: transparent;") # text-slate-500 test-sm
        lb_v = QLabel(valor)
        lb_v.setStyleSheet("font-weight: 500; color: #1e293b; font-size: 14px; border: none; background: transparent;") # text-slate-800
        
        l.addWidget(lb_t)
        l.addStretch()
        l.addWidget(lb_v)
        return w