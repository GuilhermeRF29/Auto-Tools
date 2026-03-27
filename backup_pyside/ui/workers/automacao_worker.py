# ui/workers/automacao_worker.py
from PySide6.QtCore import QThread, Signal

class AutomacaoWorker(QThread):
    # Sinais que vão conversar com a interface gráfica
    progresso = Signal(float, str)  # Ex: (50.0, "Baixando arquivo...")
    concluido = Signal(dict)        # Ex: {"arquivo_principal": "...", "mensagem": "..."}
    erro = Signal(str)              # Ex: "Erro de login"

    def __init__(self, funcao_automacao, **kwargs):
        """
        funcao_automacao: A função que será executada (ex: executar_adm, executar_ebus)
        kwargs: Os argumentos que a função precisa (data_inicio, id_usuario, etc)
        """
        super().__init__()
        self.funcao_automacao = funcao_automacao
        self.kwargs = kwargs
        self._cancelado = False

    def run(self):
        """Este método roda em segundo plano quando chamamos worker.start()"""
        try:
            # Chama a função de automação passando os callbacks
            resultado = self.funcao_automacao(
                **self.kwargs,
                callback_progresso=self._emitir_progresso,
                hook_cancelamento=self._checar_cancelamento
            )
            # Se terminou sem erros, avisa a interface
            if resultado:
                self.concluido.emit(resultado)
                
        except Exception as e:
            # Se der erro (ou for cancelado), avisa a interface
            self.erro.emit(str(e))

    def _emitir_progresso(self, porcentagem, mensagem):
        # Multiplica por 100 para a barra de progresso do PySide6 (que vai de 0 a 100)
        self.progresso.emit(porcentagem * 100, mensagem)

    def _checar_cancelamento(self):
        return self._cancelado

    def cancelar(self):
        """A interface chama isso quando o usuário clica em Cancelar"""
        self._cancelado = True