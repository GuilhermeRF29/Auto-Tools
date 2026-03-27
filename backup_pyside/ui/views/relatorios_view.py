# ui/views/relatorios_view.py
import qtawesome as qta
from PySide6.QtWidgets import (QWidget, QVBoxLayout, QHBoxLayout, QLabel, 
                               QTableWidget, QPushButton, QHeaderView, QFrame, 
                               QProgressBar, QMessageBox, QGraphicsDropShadowEffect)
from PySide6.QtCore import Qt, QSize
from PySide6.QtGui import QCursor, QColor

from ui.components.config_dialog import ConfigDialog
from ui.workers.automacao_worker import AutomacaoWorker

# Importando suas automações reais
from automacoes.adm_new import executar_adm
from automacoes.ebus_new import executar_ebus
from automacoes.sr_new import executar_sr

class RelatoriosView(QWidget):
    def __init__(self):
        super().__init__()
        self.worker = None 
        self.setStyleSheet("background-color: transparent;")
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(32, 32, 32, 32) # p-8
        layout.setSpacing(24) # space-y-6
        
        # =========================================================
        # CABEÇALHO DA TELA
        # =========================================================
        titulo = QLabel("Automação de Relatórios")
        titulo.setStyleSheet("font-size: 24px; font-weight: bold; color: #1e293b; border: none;") # text-slate-800
        
        layout.addWidget(titulo)
        
        # Status Label para o Robô
        self.lbl_status_geral = QLabel("")
        self.lbl_status_geral.setStyleSheet("font-size: 14px; color: #64748b; border: none;")
        self.lbl_status_geral.setVisible(False)
        layout.addWidget(self.lbl_status_geral)

        self.barra_progresso = QProgressBar()
        self.barra_progresso.setVisible(False)
        self.barra_progresso.setFixedHeight(12)
        self.barra_progresso.setTextVisible(False)
        self.barra_progresso.setStyleSheet("""
            QProgressBar {
                background-color: #e2e8f0;
                border: none;
                border-radius: 6px;
            }
            QProgressBar::chunk {
                background-color: #2563eb;
                border-radius: 6px;
            }
        """)
        layout.addWidget(self.barra_progresso)

        # =========================================================
        # CONTAINER DO CARD E TABELA
        # =========================================================
        card = QFrame()
        card.setStyleSheet("""
            QFrame {
                background-color: white; 
                border-radius: 8px; /* rounded-lg equivalent */
                border: 1px solid #e2e8f0;
            }
        """)
        
        shadow = QGraphicsDropShadowEffect()
        shadow.setBlurRadius(10); shadow.setColor(QColor(0,0,0,10)); shadow.setYOffset(2); shadow.setXOffset(0)
        card.setGraphicsEffect(shadow)

        card_layout = QVBoxLayout(card)
        card_layout.setContentsMargins(0, 0, 0, 0)
        card_layout.setSpacing(0)

        # Configuração da Tabela
        self.tabela = QTableWidget(3, 4)
        self.tabela.setHorizontalHeaderLabels(["Nome da Rotina", "Descrição", "Tempo Est.", "Ação"])
        
        self._estilizar_tabela()

        card_layout.addWidget(self.tabela)
        layout.addWidget(card)
        layout.addStretch()

        self.popular_tabela()

    def _estilizar_tabela(self):
        self.tabela.verticalHeader().setDefaultSectionSize(72) # approx py-4
        self.tabela.verticalHeader().setVisible(False)
        self.tabela.setShowGrid(False)
        self.tabela.setFocusPolicy(Qt.FocusPolicy.NoFocus)
        self.tabela.setSelectionMode(QTableWidget.SelectionMode.NoSelection)
        self.tabela.setAlternatingRowColors(False)

        self.tabela.setStyleSheet("""
            QTableWidget { 
                border: none; 
                background-color: transparent; 
            }
            QHeaderView::section { 
                background-color: #f8fafc; /* bg-slate-50 */
                padding: 16px 24px; /* px-6 py-4 */
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
        
        header = self.tabela.horizontalHeader()
        header.setSectionResizeMode(0, QHeaderView.ResizeMode.ResizeToContents) 
        header.setSectionResizeMode(1, QHeaderView.ResizeMode.Stretch)          
        header.setSectionResizeMode(2, QHeaderView.ResizeMode.ResizeToContents) 
        header.setSectionResizeMode(3, QHeaderView.ResizeMode.Fixed)            
        self.tabela.setColumnWidth(3, 160)
        
        header.setDefaultAlignment(Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter)

    def popular_tabela(self):
        self.robos_info = [
            {
                "id": "adm", 
                "nome": "Relatório de Vendas (Completo)", 
                "desc": "Extrai dados de vendas do ERP principal.", 
                "tempo": "~2 min", 
                "func": executar_adm
            },
            {
                "id": "ebus", 
                "nome": "Fechamento Mensal", 
                "desc": "Consolida notas fiscais e recibos do portal.", 
                "tempo": "~5 min", 
                "func": executar_ebus
            },
            {
                "id": "sr", 
                "nome": "Extrato de Taxas", 
                "desc": "Baixa extratos de taxas de embarque das companhias.", 
                "tempo": "~1 min", 
                "func": executar_sr
            }
        ]

        for linha, robo in enumerate(self.robos_info):
            self.tabela.setCellWidget(linha, 0, self._criar_celula_rotina(robo["nome"]))
            self.tabela.setCellWidget(linha, 1, self._criar_celula_texto(robo["desc"], "#64748b")) # text-slate-500
            self.tabela.setCellWidget(linha, 2, self._criar_celula_texto(robo["tempo"], "#64748b", centrar=True))
            
            # Botão Variant Secondary
            btn_config = QPushButton(" Configurar")
            # Adiciona ícone chevron-right
            btn_config.setIcon(qta.icon('fa5s.chevron-right', color='#0f172a'))
            btn_config.setIconSize(QSize(12, 12))
            
            # Para colocar o ícone à direita e o texto à esquerda, podemos usar o estilo ou criar um widget custom.
            # O PySide6 permite RTL layout para o botão como truque fácil:
            btn_config.setLayoutDirection(Qt.LayoutDirection.RightToLeft)
            
            btn_config.setCursor(QCursor(Qt.CursorShape.PointingHandCursor))
            btn_config.setFixedHeight(36)
            btn_config.setStyleSheet("""
                QPushButton {
                    background-color: white; 
                    color: #0f172a; /* text-slate-900 */
                    border: 1px solid #e2e8f0; /* slate-200 */
                    border-radius: 6px; 
                    font-weight: 500;
                    font-size: 13px;
                    padding-left: 12px;
                    padding-right: 12px;
                }
                QPushButton:hover {
                    background-color: #f1f5f9; /* slate-100 */
                }
            """)
            btn_config.clicked.connect(lambda checked, r=robo: self.abrir_modal_config(r))
            
            # Precisamos envolver para aplicar padding sem esticar  
            widget_btn = QWidget()
            layout_btn = QHBoxLayout(widget_btn)
            layout_btn.setContentsMargins(16, 0, 24, 0) # px-6 py-4 equivalent + alignment
            layout_btn.addWidget(btn_config, alignment=Qt.AlignmentFlag.AlignRight)
            
            self.tabela.setCellWidget(linha, 3, widget_btn)

    def _criar_celula_rotina(self, nome):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        layout.setContentsMargins(24, 0, 16, 0) # px-6 approx
        layout.setSpacing(12) # gap-3
        
        # p-2 bg-blue-50 text-blue-600 rounded-md FileSpreadsheet
        icone_bg = QFrame()
        icone_bg.setFixedSize(36, 36)
        icone_bg.setStyleSheet("background-color: #eff6ff; border-radius: 6px; border: none;")
        icone_layout = QVBoxLayout(icone_bg)
        icone_layout.setContentsMargins(0, 0, 0, 0)
        
        lbl_icone = QLabel()
        lbl_icone.setPixmap(qta.icon('fa5s.file-excel', color='#2563eb').pixmap(QSize(18, 18)))
        lbl_icone.setAlignment(Qt.AlignmentFlag.AlignCenter)
        lbl_icone.setStyleSheet("border: none; background: transparent;")
        icone_layout.addWidget(lbl_icone)
        
        lbl_nome = QLabel(nome)
        lbl_nome.setStyleSheet("color: #1e293b; font-weight: 500; font-size: 14px; border: none; background: transparent;") # text-slate-800
        
        layout.addWidget(icone_bg)
        layout.addWidget(lbl_nome)
        layout.addStretch()
        return widget

    def _criar_celula_texto(self, texto, color, centrar=False):
        widget = QWidget()
        layout = QHBoxLayout(widget)
        layout.setContentsMargins(16, 0, 16, 0) # px-6 approx
        
        lbl = QLabel(texto)
        lbl.setWordWrap(True)
        lbl.setStyleSheet(f"color: {color}; font-size: 14px; border: none; background: transparent;")
        
        if centrar:
            layout.addWidget(lbl, alignment=Qt.AlignmentFlag.AlignCenter)
        else:
            layout.addWidget(lbl, alignment=Qt.AlignmentFlag.AlignVCenter | Qt.AlignmentFlag.AlignLeft)
            
        return widget

    def abrir_modal_config(self, robo):
        if self.worker and self.worker.isRunning():
            QMessageBox.warning(self, "Aviso", "Já existe uma automação em execução! Aguarde ou cancele a atual.")
            return

        dialog = ConfigDialog(robo["nome"], self)
        if dialog.exec():
            params = dialog.obter_parametros()
            self.iniciar_robo(robo, params)

    def iniciar_robo(self, robo, params):
        self.barra_progresso.setVisible(True)
        self.lbl_status_geral.setVisible(True)
        self.barra_progresso.setValue(0)
        self.lbl_status_geral.setText(f"🚀 Iniciando robô: {robo['nome']}... Aguarde.")
        self.lbl_status_geral.setStyleSheet("color: #2563eb; font-weight: bold;")

        self.worker = AutomacaoWorker(robo["func"], id_usuario_logado=1, **params)
        self.worker.progresso.connect(self.atualizar_progresso)
        self.worker.concluido.connect(self.finalizar_sucesso)
        self.worker.erro.connect(self.finalizar_erro)
        self.worker.start()

    def atualizar_progresso(self, valor, mensagem):
        self.barra_progresso.setValue(int(valor))
        self.lbl_status_geral.setText(f"⏳ {mensagem}")

    def finalizar_sucesso(self, resultado):
        self.barra_progresso.setVisible(False)
        self.lbl_status_geral.setText(f"✅ Sucesso: {resultado['mensagem']}")
        self.lbl_status_geral.setStyleSheet("color: #16a34a; font-weight: bold;")
        QMessageBox.information(self, "Concluído", f"Finalizado!\n\nSalvo em:\n{resultado.get('arquivo_principal', '')}")

    def finalizar_erro(self, mensagem_erro):
        self.barra_progresso.setVisible(False)
        self.lbl_status_geral.setText(f"❌ Erro na automação: Interrompido.")
        self.lbl_status_geral.setStyleSheet("color: #dc2626; font-weight: bold;")
        QMessageBox.critical(self, "Erro no Robô", f"Problema:\n\n{mensagem_erro}")