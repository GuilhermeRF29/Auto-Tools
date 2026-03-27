# ui/views/dashboard_view.py
import qtawesome as qta
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QFrame, QPushButton, QTableWidget, QHeaderView,
                               QTableWidgetItem, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QSize, Signal
from PySide6.QtGui import QCursor, QColor

class DashboardView(QWidget):
    # Sinais para navegação através dos cards de "Ações Rápidas" e "Ver Todos"
    nav_relatorios = Signal()
    nav_cofre = Signal()
    nav_calculadora = Signal()

    def __init__(self):
        super().__init__()
        self.setStyleSheet("background-color: transparent;")
        
        layout_principal = QVBoxLayout(self)
        layout_principal.setContentsMargins(32, 32, 32, 32) # p-8
        layout_principal.setSpacing(24) # space-y-6

        # ==========================================
        # HEADER (Visão Geral)
        # ==========================================
        titulo = QLabel("Visão Geral")
        titulo.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e293b; border: none;") # text-slate-800
        layout_principal.addWidget(titulo)

        # ==========================================
        # AÇÕES RÁPIDAS
        # ==========================================
        acoes_container = QWidget()
        acoes_layout = QVBoxLayout(acoes_container)
        acoes_layout.setContentsMargins(0, 0, 0, 0)
        acoes_layout.setSpacing(12) # mb-3 approx
        
        lbl_acoes = QLabel("AÇÕES RÁPIDAS")
        lbl_acoes.setStyleSheet("font-size: 14px; font-weight: 600; color: #64748b; letter-spacing: 1px; border: none;")
        acoes_layout.addWidget(lbl_acoes)

        cards_layout = QHBoxLayout()
        cards_layout.setSpacing(16) # gap-4

        # Card 1: Relatório de Vendas
        card1 = self._criar_card_acao(
            titulo="Relatório de Vendas", 
            subtitulo="Baixar últimos 7 dias",
            icone_nome='fa5s.play',
            nav_signal=self.nav_relatorios
        )
        # Card 2: Nova Cotação
        card2 = self._criar_card_acao(
            titulo="Nova Cotação", 
            subtitulo="Calculadora de passagens",
            icone_nome='fa5s.calculator',
            nav_signal=self.nav_calculadora
        )
        # Card 3: Acessar Cofre
        card3 = self._criar_card_acao(
            titulo="Acessar Cofre", 
            subtitulo="Gerenciar credenciais",
            icone_nome='fa5s.key',
            nav_signal=self.nav_cofre
        )

        cards_layout.addWidget(card1)
        cards_layout.addWidget(card2)
        cards_layout.addWidget(card3)
        acoes_layout.addLayout(cards_layout)
        
        layout_principal.addWidget(acoes_container)

        # ==========================================
        # GRID INFERIOR (Relatórios x Status)
        # ==========================================
        grid_inferior = QHBoxLayout()
        grid_inferior.setSpacing(24) # gap-6

        # LADO ESQUERDO: Últimos Relatórios (lg:col-span-2)
        relatorios_container = self._criar_painel_relatorios()
        grid_inferior.addWidget(relatorios_container, stretch=2)

        # LADO DIREITO: Status do Sistema (lg:col-span-1)
        status_container = self._criar_painel_status()
        grid_inferior.addWidget(status_container, stretch=1)

        layout_principal.addLayout(grid_inferior)
        layout_principal.addStretch()

    def _criar_card_acao(self, titulo, subtitulo, icone_nome, nav_signal):
        card = QFrame()
        card.setFixedSize(0, 0) # Deixe expandir horizontalmente
        card.setFixedHeight(88) # Aproximadamente p-4 content height
        card.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        
        # Pyside Hover emulation uses StyleSheet or event filters. 
        # Using simple stylesheet for border-blue-400 and shadow-md.
        card.setStyleSheet("""
            QFrame {
                background-color: white; 
                border-radius: 8px; /* rounded-lg equivalent in some designs */
                border: 1px solid #e2e8f0; /* border-slate-200 */
            }
            QFrame:hover {
                border: 1px solid #60a5fa; /* border-blue-400 */
            }
        """)

        # DropShadow effect (shadow-sm normal, mas simularemos shadow-md combinando no hover se precisasse, 
        # mas definimos dinâmico global)
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10)
        shadow.setColor(QColor(0, 0, 0, 15))
        shadow.setXOffset(0); shadow.setYOffset(2)
        card.setGraphicsEffect(shadow)

        layout = QHBoxLayout(card)
        layout.setContentsMargins(16, 16, 16, 16) # p-4

        textos_layout = QVBoxLayout()
        textos_layout.setContentsMargins(0, 0, 0, 0)
        textos_layout.setSpacing(4)
        
        lbl_titulo = QLabel(titulo)
        lbl_titulo.setStyleSheet("""
            QLabel {
                font-weight: 500; 
                color: #1e293b; /* text-slate-800 */
                font-size: 15px; 
                border: none;
                background: transparent;
            }
        """)
        
        lbl_sub = QLabel(subtitulo)
        lbl_sub.setStyleSheet("color: #64748b; font-size: 13px; border: none; background: transparent;") # text-slate-500
        
        textos_layout.addWidget(lbl_titulo)
        textos_layout.addWidget(lbl_sub)
        textos_layout.addStretch()

        icone_bg = QFrame()
        icone_bg.setFixedSize(36, 36)
        # text-slate-600 bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-600 logic
        icone_bg.setStyleSheet("background-color: #f1f5f9; border-radius: 18px; border: none;") # bg-slate-100
        icone_layout = QVBoxLayout(icone_bg)
        icone_layout.setContentsMargins(0, 0, 0, 0)
        
        lbl_icone = QLabel()
        lbl_icone.setPixmap(qta.icon(icone_nome, color='#475569').pixmap(QSize(16, 16))) # text-slate-600
        lbl_icone.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_icone.setStyleSheet("background: transparent; border: none;")
        icone_layout.addWidget(lbl_icone)

        layout.addLayout(textos_layout)
        layout.addStretch()
        layout.addWidget(icone_bg, alignment=Qt.AlignmentFlag.AlignTop)

        # Emitir sinal de navegação ao clicar no card
        btn_overlay = QPushButton(card)
        btn_overlay.resize(800, 800) # Cobre tudo
        btn_overlay.setStyleSheet("background: transparent; border: none;")
        btn_overlay.clicked.connect(nav_signal.emit)

        return card

    def _criar_painel_relatorios(self):
        container = QFrame()
        container.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 8px; /* rounded-lg */
                border: 1px solid #e2e8f0; /* border-slate-200 */
            }
        """)
        
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10); shadow.setColor(QColor(0,0,0,10)); shadow.setYOffset(2); shadow.setXOffset(0)
        container.setGraphicsEffect(shadow)

        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header: Últimos Relatórios (bg-slate-50 rounded-t-lg items-center border-b p-4)
        header = QFrame()
        header.setFixedHeight(56) # Approx p-4 + text
        header.setStyleSheet("background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top-left-radius: 8px; border-top-right-radius: 8px; border-left: none; border-right: none;")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(16, 0, 16, 0)
        
        title_group = QHBoxLayout()
        icon = QLabel()
        icon.setPixmap(qta.icon('fa5s.file-excel', color='#64748b').pixmap(QSize(16, 16)))
        icon.setStyleSheet("border: none; background: transparent;")
        
        lbl = QLabel("Últimos Relatórios Baixados")
        lbl.setStyleSheet("font-size: 15px; font-weight: 600; color: #1e293b; border: none; background: transparent;")
        
        title_group.addWidget(icon)
        title_group.addWidget(lbl)
        
        btn_ver_todos = QPushButton("Ver todos")
        btn_ver_todos.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_ver_todos.setStyleSheet("""
            QPushButton { color: #2563eb; font-weight: 500; font-size: 13px; border: none; background: transparent; }
            QPushButton:hover { color: #1e40af; /* blue-800 */ }
        """)
        btn_ver_todos.clicked.connect(self.nav_relatorios.emit)

        header_layout.addLayout(title_group)
        header_layout.addStretch()
        header_layout.addWidget(btn_ver_todos)
        
        layout.addWidget(header)

        # Tabela (divide-y divide-slate-100)
        self.tabela = QTableWidget(3, 3)
        self.tabela.setHorizontalHeaderLabels(["Arquivo", "Data", "Ação"])
        
        self.tabela.verticalHeader().setDefaultSectionSize(48) # py-3
        self.tabela.verticalHeader().setVisible(False)
        self.tabela.setShowGrid(False)
        self.tabela.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.tabela.setSelectionMode(QTableWidget.SelectionMode.NoSelection)

        self.tabela.setStyleSheet("""
            QTableWidget { 
                border: none; 
                background-color: transparent; 
            }
            QHeaderView::section { 
                background-color: #f8fafc; /* bg-slate-50 */
                padding: 12px 16px; /* px-4 py-3 */
                border: none; 
                border-bottom: 1px solid #e2e8f0; /* border-slate-200 */
                color: #64748b; /* text-slate-500 */
                font-weight: 500; 
                font-size: 14px;
                text-align: left;
            }
            QTableWidget::item {
                border-bottom: 1px solid #f1f5f9; /* divide-slate-100 */
            }
        """)

        h_header = self.tabela.horizontalHeader()
        h_header.setSectionResizeMode(0, QHeaderView.ResizeMode.Stretch)  
        h_header.setSectionResizeMode(1, QHeaderView.ResizeMode.ResizeToContents) 
        h_header.setSectionResizeMode(2, QHeaderView.ResizeMode.Fixed)
        self.tabela.setColumnWidth(2, 60)
        h_header.setDefaultAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)

        dados_mock = [
            ("Rel_Vendas_Marzo.xlsx", "Hoje, 10:45"),
            ("Fechamento_Fev.csv", "Ontem, 18:20"),
            ("Taxas_Emissao_Q1.xlsx", "22 Mar, 09:15")
        ]

        for linha, (arquivo, data) in enumerate(dados_mock):
            # Célula Arquivo (Ícone + Texto)
            w_arquivo = QWidget()
            l_arquivo = QHBoxLayout(w_arquivo)
            l_arquivo.setContentsMargins(16, 0, 16, 0)
            ic = QLabel()
            ic.setPixmap(qta.icon('fa5s.file-alt', color='#94a3b8').pixmap(QSize(14, 14)))
            lb_arq = QLabel(arquivo)
            lb_arq.setStyleSheet("font-weight: 500; color: #334155; font-size: 14px;") # text-slate-700
            l_arquivo.addWidget(ic)
            l_arquivo.addWidget(lb_arq)
            l_arquivo.addStretch()
            self.tabela.setCellWidget(linha, 0, w_arquivo)

            # Célula Data
            w_data = QWidget()
            l_data = QHBoxLayout(w_data)
            l_data.setContentsMargins(16, 0, 16, 0)
            lb_dt = QLabel(data)
            lb_dt.setStyleSheet("color: #64748b; font-size: 14px;") # text-slate-500
            l_data.addWidget(lb_dt)
            self.tabela.setCellWidget(linha, 1, w_data)

            # Célula Ação (Download Widget)
            w_acao = QWidget()
            l_acao = QHBoxLayout(w_acao)
            l_acao.setContentsMargins(0, 0, 16, 0)
            btn_down = QPushButton()
            btn_down.setIcon(qta.icon('fa5s.download', color='#94a3b8'))
            btn_down.setIconSize(QSize(16, 16))
            btn_down.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn_down.setStyleSheet("""
                QPushButton { border: none; background: transparent; }
                QPushButton:hover { qproperty-icon: url(); } /* Requires QIcon trick or just rely on exact hover */
            """)
            # Hack for hover color change using qtawesome + style
            btn_down.setIcon(qta.icon('fa5s.download', color='#94a3b8'))
            l_acao.addWidget(btn_down, alignment=Qt.AlignmentFlag.AlignRight)
            self.tabela.setCellWidget(linha, 2, w_acao)

        layout.addWidget(self.tabela)
        return container


    def _criar_painel_status(self):
        container = QFrame()
        container.setStyleSheet("""
            QFrame {
                background-color: white;
                border-radius: 8px; /* rounded-lg */
                border: 1px solid #e2e8f0; /* border-slate-200 */
            }
        """)
        
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10); shadow.setColor(QColor(0,0,0,10)); shadow.setYOffset(2); shadow.setXOffset(0)
        container.setGraphicsEffect(shadow)

        layout = QVBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header (bg-slate-50 border-b border-slate-200 rounded-t-lg p-4)
        header = QFrame()
        header.setFixedHeight(56) 
        header.setStyleSheet("background-color: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top-left-radius: 8px; border-top-right-radius: 8px; border-left: none; border-right: none;")
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(16, 0, 16, 0)
        
        icon = QLabel()
        icon.setPixmap(qta.icon('fa5s.shield-alt', color='#64748b').pixmap(QSize(16, 16))) # ShieldCheck text-slate-500
        icon.setStyleSheet("border: none; background: transparent;")
        
        lbl = QLabel("Status do Sistema")
        lbl.setStyleSheet("font-size: 15px; font-weight: 600; color: #1e293b; border: none; background: transparent;")
        
        header_layout.addWidget(icon)
        header_layout.addWidget(lbl)
        header_layout.addStretch()
        
        layout.addWidget(header)

        # Body (p-4 space-y-4)
        body = QWidget()
        body_layout = QVBoxLayout(body)
        body_layout.setContentsMargins(16, 16, 16, 16)
        body_layout.setSpacing(16)

        # Card Selenium (bg-green-50 border border-green-100 p-3 rounded-md)
        card_selenium = QFrame()
        card_selenium.setStyleSheet("""
            QFrame {
                background-color: #f0fdf4; /* green-50 */
                border: 1px solid #dcfce7; /* green-100 */
                border-radius: 6px; /* rounded-md */
            }
        """)
        l_sel = QHBoxLayout(card_selenium)
        l_sel.setContentsMargins(12, 12, 12, 12)
        l_sel.setSpacing(12)
        
        ic_sel = QLabel()
        ic_sel.setPixmap(qta.icon('fa5s.check-circle', color='#16a34a').pixmap(QSize(20, 20))) # CheckCircle text-green-600
        ic_sel.setStyleSheet("border: none; background: transparent;")
        
        box_sel = QVBoxLayout()
        box_sel.setSpacing(2)
        lbl_sel_t = QLabel("Selenium WebDriver")
        lbl_sel_t.setStyleSheet("font-size: 14px; font-weight: 500; color: #14532d; border: none; background: transparent;") # text-green-900
        lbl_sel_sub = QLabel("Pronto para execução")
        lbl_sel_sub.setStyleSheet("font-size: 12px; color: #15803d; border: none; background: transparent;") # text-green-700
        box_sel.addWidget(lbl_sel_t)
        box_sel.addWidget(lbl_sel_sub)
        
        l_sel.addWidget(ic_sel)
        l_sel.addLayout(box_sel)
        l_sel.addStretch()

        # Card Cofre (bg-slate-50 border border-slate-200 p-3 rounded-md)
        card_cofre = QFrame()
        card_cofre.setStyleSheet("""
            QFrame {
                background-color: #f8fafc; /* slate-50 */
                border: 1px solid #e2e8f0; /* slate-200 */
                border-radius: 6px; /* rounded-md */
            }
        """)
        l_cof = QHBoxLayout(card_cofre)
        l_cof.setContentsMargins(12, 12, 12, 12)
        l_cof.setSpacing(12)
        
        ic_cof = QLabel()
        ic_cof.setPixmap(qta.icon('fa5s.lock', color='#475569').pixmap(QSize(20, 20))) # Lock text-slate-600
        ic_cof.setStyleSheet("border: none; background: transparent;")
        
        box_cof = QVBoxLayout()
        box_cof.setSpacing(2)
        lbl_cof_t = QLabel("Cofre de Senhas")
        lbl_cof_t.setStyleSheet("font-size: 14px; font-weight: 500; color: #0f172a; border: none; background: transparent;") # text-slate-900
        lbl_cof_sub = QLabel("Bloqueado")
        lbl_cof_sub.setStyleSheet("font-size: 12px; color: #64748b; border: none; background: transparent;") # text-slate-500
        box_cof.addWidget(lbl_cof_t)
        box_cof.addWidget(lbl_cof_sub)
        
        btn_desbl = QPushButton("Desbloquear")
        btn_desbl.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
        btn_desbl.setStyleSheet("""
            QPushButton { background: transparent; color: #2563eb; font-size: 12px; font-weight: 500; padding: 4px 8px; border: none;}
            QPushButton:hover { background: #e2e8f0; border-radius: 4px;}
        """)
        btn_desbl.clicked.connect(self.nav_cofre.emit)

        l_cof.addWidget(ic_cof)
        l_cof.addLayout(box_cof)
        l_cof.addStretch()
        l_cof.addWidget(btn_desbl)

        body_layout.addWidget(card_selenium)
        body_layout.addWidget(card_cofre)
        body_layout.addStretch()

        layout.addWidget(body)

        return container