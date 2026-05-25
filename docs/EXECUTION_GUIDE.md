# 🚀 Guia de Execução e Compilação — Auto Tools

Este guia foi elaborado para explicar detalhadamente os procedimentos de execução em desenvolvimento, o processo de empacotamento (build) e como o usuário final executa o aplicativo portátil de forma totalmente autocontida.

---

## 💻 1. Execução em Ambiente de Desenvolvimento (Dev)

Se você é um desenvolvedor e deseja realizar modificações ou rodar o aplicativo a partir do código-fonte, siga as instruções abaixo:

### Pré-requisitos
*   **Node.js** v18 ou superior.
*   **Python** 3.10 ou superior (adicionado ao PATH do Windows).
*   **Git** instalado.

### Passo 1: Instalar dependências do Node.js
No diretório raiz do projeto, instale as dependências listadas no `package.json`:
```bash
npm install
```

### Passo 2: Configurar o Ambiente Virtual Python (venv)
É necessário criar e ativar uma `venv` local na pasta raiz para isolar os pacotes das automações:
```powershell
# Criação do ambiente virtual
python -m venv venv

# Ativação do ambiente (no Windows PowerShell)
.\venv\Scripts\activate

# Instalação das bibliotecas obrigatórias
pip install -r requirements.txt

# Instalação do navegador Chromium para o robô Playwright (busca_dados.py)
playwright install chromium
```

### Passo 3: Inicializar o Banco de Dados e Variáveis
Crie o arquivo `.env` com a chave mestra de criptografia e inicialize a estrutura das tabelas no SQLite:
```bash
# Inicializa a chave mestra e o arquivo .env
python -c "from core.banco import inicializar_env; inicializar_env()"

# Executa as migrações e tabelas
python setup_db.py
```

### Passo 4: Executar a Aplicação
Você pode rodar a aplicação em modo web tradicional ou em modo desktop integrado:

*   **Opção A — Modo Web (Separado)**:
    ```bash
    # Terminal 1 — Executa o Servidor Express (API) na porta 3001
    npm run server
    
    # Terminal 2 — Executa o servidor de desenvolvimento do Vite na porta 3000
    npm run dev
    ```
    *Acesse o sistema em: http://localhost:3000*

*   **Opção B — Modo Desktop Dev (Electron + Vite)**:
    ```bash
    # Terminal único — Abre a janela do Electron que faz proxy para o Vite dev
    npm run electron:dev
    ```

---

## 📦 2. Processo de Compilação (Build)

O objetivo principal do build é compilar o código em um arquivo executável (`.exe`) e autocontido, que funcione no computador do usuário final sem que ele precise instalar Node, Python, bibliotecas ou IDEs.

### Como gerar o pacote final:
Execute o script de compilação oficial:
```bash
npm run electron:build
```

### O que o compilador faz nos bastidores:
1.  **Build do Frontend**: Compila os arquivos TypeScript e React em pacotes otimizados estáticos de HTML/JS/CSS dentro da pasta `/dist`.
2.  **Preparação de Arquivos**: O `electron-builder` lê a seção `"build"` do [package.json](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/package.json) e copia as pastas de código-fonte importantes (`dist/`, `core/`, `automacoes/`, `src_backend/` e `server.js`).
3.  **Inclusão do Python Portátil**: A pasta `python-runtime/` (que contém uma distribuição mínima portátil do Python com todas as dependências pré-instaladas) é embutida como recurso estático da aplicação (`extraResources` no ASAR do Electron).
4.  **Geração dos Artefatos**: Produz os pacotes na pasta `/release`:
    *   Um instalador `.exe` (usando NSIS para instalar na máquina).
    *   Uma pasta descompactada pronta para execução em `/release/win-unpacked`.
    *   Um arquivo compactado `.zip` contendo todos os recursos do aplicativo portátil.

---

## 🏃 3. Guia de Execução para o Usuário Final (Modo Portátil)

Se o aplicativo foi distribuído no formato portátil (arquivo `.zip`), o usuário final deve seguir estes passos simples para rodá-lo:

### Passo 1: Extração
1.  Receba o arquivo compactado do Auto Tools (ex: `AutoTools-1.0.0-win-x64.zip`).
2.  Clique com o botão direito sobre o arquivo `.zip` e selecione **Extrair Tudo...**.
3.  Escolha uma pasta de destino segura na sua máquina (ex: `C:\AutoTools` ou na Área de Trabalho).
    > [!IMPORTANT]
    > Certifique-se de que a extração foi concluída 100%. Não tente executar o aplicativo de dentro do arquivo `.zip` sem extrair antes.

### Passo 2: Execução
1.  Abra a pasta extraída.
2.  Dê dois cliques sobre o arquivo executável principal: **`Auto Tools.exe`** (identificado pelo ícone oficial da ferramenta).
3.  O sistema operacional pode exibir um alerta do Windows Defender SmartScreen (*"O Windows protegeu o seu computador"*). Isso ocorre por ser um executável corporativo interno não assinado publicamente. Clique em **Mais informações** e depois em **Executar assim mesmo**.

---

## 🔍 4. Como funciona o Runtime Portátil (Transparência de Processos)

Ao abrir o **`Auto Tools.exe`**, a seguinte sequência é executada automaticamente pelo container do Electron:

```
[Usuário abre Auto Tools.exe]
         │
         ├──► 1. Electron cria pasta persistente de dados do usuário:
         │      C:\Users\<Usuario>\AppData\Roaming\auto-tools\runtime-data
         │
         ├──► 2. Electron inicia o servidor backend local (Express):
         │      Executa server.js associado a variáveis de ambiente estritas
         │
         ├──► 3. O backend resolve o caminho do Python portátil embutido:
         │      resources/python-runtime/python.exe (ou recursos locais)
         │
         ├──► 4. Inicializa o SQLite Userbank.db e limpa logs antigos na pasta AppData
         │
         └──► 5. Janela do Electron carrega o index.html compilado (/dist)
```

### Onde os dados são salvos?
Para evitar perda de dados durante atualizações da aplicação, nenhuma informação sensível ou banco de dados é guardado dentro da pasta de instalação/extração:
*   **Banco de dados local (`Userbank.db`)**, arquivos de log do servidor e credenciais temporárias do Gmail ficam salvos de forma isolada na pasta de dados do usuário no Windows:
    `C:\Users\<Nome_Usuario>\AppData\Roaming\auto-tools\runtime-data`
*   As planilhas consolidadas geradas são salvas na pasta padrão de rede ou no diretório especificado na aba **Configurações** da interface.
