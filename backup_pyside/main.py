# main.py
import sys
from PySide6.QtWidgets import QApplication, QMainWindow
from PySide6.QtGui import QFont

# Core
from core.banco import inicializar_env, configurar_banco, inicializar_onibus_padrao

# Componentes e Views
from ui.components.fading_stacked_widget import FadingStackedWidget
from ui.login_window import LoginWindow # Renomeie a classe lá dentro para LoginView se quiser, mas funciona igual
from ui.views.cadastro_view import CadastroView
from ui.main_window import MainWindow # Este é o Workspace com a sidebar

class MasterWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("AutoBot Pro")
        self.resize(1280, 800) # Tamanho base e constante
        
        # Fonte global moderna e barras de rolagem
        fonte_moderna = QFont("Segoe UI", 10)
        fonte_moderna.setStyleHint(QFont.StyleHint.SansSerif) 
        self.setFont(fonte_moderna)
        
        self.setStyleSheet("""
            QMainWindow { background-color: #f8fafc; }
            QScrollBar:vertical { border: none; background: transparent; width: 10px; margin: 0px; }
            QScrollBar::handle:vertical { background: #cbd5e1; min-height: 30px; border-radius: 5px; }
            QScrollBar::handle:vertical:hover { background: #94a3b8; }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0px; }
            QToolTip { background-color: #1e293b; color: white; border: none; padding: 5px; border-radius: 4px; }
        """)

        # O StackedWidget Mágico
        self.root_stack = FadingStackedWidget()
        self.setCentralWidget(self.root_stack)

        # Inicializando as 3 "Grandes Telas"
        # Passamos callbacks para elas saberem como "pedir" para trocar de tela
        self.view_login = LoginWindow(
            on_login_success=self.ir_para_workspace,
            on_go_to_cadastro=self.ir_para_cadastro # Você precisa adicionar esse botão no seu login_window.py
        )
        
        self.view_cadastro = CadastroView(
            on_cadastro_success=self.ir_para_login,
            on_voltar_login=self.ir_para_login
        )
        
        self.view_workspace = MainWindow() # A tela principal com a Sidebar

        # Adicionando na ordem
        self.root_stack.addWidget(self.view_login)     # Index 0
        self.root_stack.addWidget(self.view_cadastro)  # Index 1
        self.root_stack.addWidget(self.view_workspace) # Index 2

        # Começa no Login
        self.root_stack.setCurrentIndex(0)

    # --- Funções de Navegação com Fade ---
    def ir_para_login(self):
        self.root_stack.fade_to(0)

    def ir_para_cadastro(self):
        self.root_stack.fade_to(1)

    def ir_para_workspace(self):
        self.root_stack.fade_to(2)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Inicializa BD
    inicializar_env()
    configurar_banco()
    inicializar_onibus_padrao()
    
    window = MasterWindow()
    window.show()
    
    sys.exit(app.exec())