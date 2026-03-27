# ui/components/fading_stacked_widget.py
from PySide6.QtWidgets import QStackedWidget, QGraphicsOpacityEffect
from PySide6.QtCore import QPropertyAnimation, QEasingCurve

class FadingStackedWidget(QStackedWidget):
    def __init__(self, parent=None):
        super().__init__(parent)

    def fade_to(self, index, duration=300):
        """Muda para o index especificado aplicando um efeito de Fade In"""
        if index == self.currentIndex():
            return

        # Pega o widget que vai aparecer
        next_widget = self.widget(index)
        
        if next_widget is None:
            return
        
        # Aplica o efeito de opacidade nele
        self.effect = QGraphicsOpacityEffect(next_widget)
        next_widget.setGraphicsEffect(self.effect)

        # Troca a tela imediatamente, mas ela estará invisível (opacidade 0)
        self.setCurrentIndex(index)

        # Anima a opacidade de 0.0 para 1.0
        self.anim = QPropertyAnimation(self.effect, b"opacity")
        self.anim.setDuration(duration)
        self.anim.setStartValue(0.0)
        self.anim.setEndValue(1.0)
        self.anim.setEasingCurve(QEasingCurve.Type.InOutQuad)
        self.anim.start()