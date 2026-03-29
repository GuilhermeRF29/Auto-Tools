import tkinter as tk
from tkinter import filedialog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Criação do servidor FastAPI
app = FastAPI()

# Permissão para o React (Rodando na porta 5173 do Vite) conversar com este Python sem bloqueios (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/abrir-explorador-pastas")
def abrir_explorador():
    # Criação da janela do Windows de forma oculta e nativa
    root = tk.Tk()
    root.withdraw()
    
    # MUITO IMPORTANTE: Forçar a janela do Windows a saltar pra frente do navegador
    root.attributes('-topmost', True) 
    root.focus_force()

    # Abre de fato a tela para selecionar a pasta
    caminho_escolhido = filedialog.askdirectory(title="Configuração do Relatório: Selecione a Pasta")
    
    # Limpa a janela da memória
    root.destroy()

    if caminho_escolhido:
        # Substitui barras invertidas para garantir compatibilidade com caminhos C:\ no Windows
        caminho_pronto = caminho_escolhido.replace('/', '\\')
        return {"caminho": caminho_pronto}
    
    return {"caminho": ""}

# Rota temporária para simular quando clicarem em 'Iniciar'
@app.post("/api/run-automation")
def executar_automacao(payload: dict):
    print("O React solicitou uma execução com os dados:")
    print(payload)
    return {"status": "sucesso", "mensagem": "Robô iniciado"}
