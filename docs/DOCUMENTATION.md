# 🛠️ Documentação Técnica — Auto Tools

Esta documentação descreve de forma aprofundada a arquitetura, estrutura interna e detalhes de implementação do **Auto Tools**, especificando a responsabilidade de cada arquivo e a segurança do ecossistema.

---

## 1. Visão Geral da Arquitetura

O Auto Tools utiliza uma arquitetura híbrida e modular, projetada para rodar localmente ou de forma empacotada no desktop do usuário final. Ele é estruturado em três camadas principais:

```mermaid
graph TD
    subgraph Frontend (React + TS)
        UI[Views & Componentes] -->|IPC/HTTP| PC[Preload / Runtime]
    end
    
    subgraph Container Desktop (Electron)
        EL[main.cjs] -->|Spawns| SRV[server.js]
        PC -->|Expose API| UI
    end
    
    subgraph Backend (Node.js + Express)
        SRV -->|Routes| RT[Modular Routes /api]
        RT -->|pythonProxy.js| PY_EXEC[Executável Python]
    end
    
    subgraph Armazenamento & Dados
        PY_EXEC -->|banco.py| DB[(SQLite: Userbank.db)]
        PY_EXEC -->|Nuvem Sync| FB[(Firebase Firestore)]
        PY_EXEC -->|Downloads| FS[(Sistema de Arquivos / Backups)]
    end
```

- **Frontend (React 19 + TypeScript + Tailwind CSS)**: Interface moderna desenvolvida sobre o Vite. Comunica-se com o backend via requisições REST tradicionais e Server-Sent Events (SSE) para atualização de progresso de automações em tempo real.
- **Container Desktop (Electron)**: Empacota a aplicação web em uma janela nativa do Windows. Possui controles de janela personalizados (fechar, minimizar e maximizar sem moldura nativa) e orquestra a inicialização e encerramento do backend em Node.js.
- **Backend (Node.js + Express)**: Servidor local que roda na porta `3001` (ou na porta configurada via `.env`). Centraliza as rotas de API, serve o frontend estático compilado em produção e atua como ponte para a execução de scripts Python.
- **Lógica e Automações (Python 3.10+)**: Scripts especializados que lidam com leitura pesada de planilhas Excel, web scraping corporativo (Selenium / Playwright), cálculos de elasticidade e persistência de dados.

---

## 2. Estrutura de Diretórios e Arquivos Individuais

Abaixo está o detalhamento técnico de cada arquivo e diretório da aplicação:

### 📁 Raiz do Projeto
*   `README.md`: Visão geral rápida sobre o projeto, pré-requisitos, instalação rápida de dependências e comandos úteis para desenvolvimento.
*   [package.json](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/package.json): Gerenciador de pacotes do Node.js. Define os scripts de execução (dev, build, electron) e as dependências nativas e de compilação do instalador desktop (`electron-builder`).
*   [requirements.txt](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/requirements.txt): Lista de dependências Python necessárias para rodar os scripts de automação e core (Selenium, Playwright, Pandas, PyArrow, Cryptography, bcrypt, etc.).
*   [server.js](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/server.js): Arquivo de entrada principal do backend Express. Inicializa o banco de dados via Python, configura middlewares, define rotas da API modular (`/api`), lida com o túnel remoto (se configurado) e serve os arquivos estáticos compilados do React em ambiente de produção.
*   [setup_db.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/setup_db.py): Script utilitário em Python para inicializar ou atualizar a estrutura do banco SQLite `Userbank.db` de maneira isolada.
*   [vite.config.ts](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/vite.config.ts): Arquivo de configuração do compilador Vite. Define o proxy local em ambiente de desenvolvimento (redirecionando chamadas `/api` da porta `3000` para a porta `3001` do Express) e gerencia plugins como React e Tailwind.

---

### 📁 electron/ (Container Desktop)
*   [main.cjs](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/electron/main.cjs): Ponto de entrada do processo principal (Main Process) do Electron. Lida com a criação da janela principal (sem borda nativa/chromeless), escuta eventos IPC (Inter-Process Communication) enviados pelo frontend para controle de janelas (minimizar, maximizar, fechar), inicia o backend local (`server.js`) em background e gerencia o encerramento seguro dos processos filhos do Python quando o app é fechado.
*   [preload.cjs](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/electron/preload.cjs): Script de pré-carregamento (Preload). Expõe APIs seguras do Electron no objeto global `window.autoToolsRuntime` da página web React através do `contextBridge`, mantendo o isolamento de contexto (segurança contra injeção de scripts remotos).

---

### 📁 src_backend/ (Servidor e Rotas Node.js)
*   [config.js](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/src_backend/config.js): Define caminhos globais importantes, como a raiz do projeto, o diretório de dados em execução (`AppData` do usuário em ambiente compilado) e resolve dinamicamente o executável do Python portátil (`python-runtime/python.exe`) ou virtual environment (`venv/Scripts/python.exe`).
*   `utils/pythonProxy.js`: Ponte de integração Node-Python. Expõe funções como `runPythonCmd` (execução rápida de código inline via `spawn`) e `spawnPythonScript` (execução assíncrona com envio de parâmetros e canal bidirecional para streaming).
*   `routes/authRoutes.js`: Processa o login e registro de usuários chamando a lógica do banco criptografado do Python.
*   `routes/automationRoutes.js`: Orquestra a execução das automações. Inicia os robôs Python, cria fluxos de Server-Sent Events (SSE) para emitir progresso percentual (0 a 100%) em tempo real e persiste o histórico de execuções no SQLite.
*   `routes/deviceAccessRoutes.js`: Implementa controle e segurança para acesso remoto. Permite habilitar/desabilitar conexões de outros IPs e gerencia a aprovação pendente ou revogação de tokens de dispositivos clientes.
*   `routes/settingsRoutes.js`: CRUD de caminhos de base dos diretórios de dados dos relatórios e parametrizações gerais do sistema.
*   `routes/systemRoutes.js`: Fornece diagnósticos do sistema (uso de memória, porta em uso, status do banco de dados local e caminhos resolvidos).
*   `routes/tunnelRoutes.js`: Gerencia a exposição da porta local do Express para conexões remotas seguras através de tunelamento ngrok ou localtunnel.
*   `routes/updateRoutes.js`: Verifica e aplica atualizações online do executável final baixando novos arquivos comprimidos e executando scripts de substituição.
*   `routes/vaultRoutes.js`: Endpoints para gerenciar o cofre de credenciais de sistemas pré-definidos ou URLs personalizadas.
*   `routes/webauthnRoutes.js`: Processa os desafios FIDO2/WebAuthn necessários para autenticação biométrica via Windows Hello.
*   `routes/dashboard/`: Contém arquivos que carregam, filtram e estruturam dados operacionais em JSON a partir de planilhas locais para os gráficos do frontend (Revenue, Demanda, Rio x SP e Performance de Canais).

---

### 📁 core/ (Módulos Python de Negócio/Criptografia)
*   [banco.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/core/banco.py): Coração de dados do sistema em Python. Responsável por:
    *   Criar o banco SQLite (`Userbank.db`) e executar migrações de schema.
    *   Hashear e validar senhas de usuários com a biblioteca `bcrypt`.
    *   Criptografar e descriptografar senhas do cofre usando `cryptography.fernet` (AES-128-CBC) combinada à chave armazenada no `.env`.
    *   Sincronizar dados em background com o **Firebase Firestore** (Nuvem) quando há conexão e credenciais configuradas, permitindo a portabilidade rápida de cofres de senhas de forma segura.
*   `google_auth.py`: Gerencia a autenticação e renovação de tokens OAuth do Google Workspace para as automações que leem e-mails diretamente de caixas do Gmail.

---

### 📁 automacoes/ (Scripts de Execução Python)
*   [adm_new.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/automacoes/adm_new.py): Robô do setor de Vendas (ADM). Utiliza o Selenium (Edge) em segundo plano para efetuar login no portal de passagens da empresa, extrair relatórios diários de vendas segmentados mensalmente para driblar timeouts, descarregar arquivos na pasta local de downloads do sistema e consolidar os dados tratados usando Pandas de forma otimizada.
*   [ebus_new.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/automacoes/ebus_new.py): Robô do setor de Revenue (eBus). Acessa o portal corporativo com limpeza prévia de cookies via CDP (Chrome DevTools Protocol), faz download dos relatórios do mês e executa a lógica de conciliação histórica:
    *   Compara a planilha com a versão em `BASE NOVA`.
    *   Atribui estados: `Novo` (linhas inseridas), `Manteve` (linhas idênticas) ou `Excluido` (linhas removidas na versão web).
    *   Aplica regras de "Justificativa" baseadas no "Status Revenue" (como preencher "Aprovado" ou "Concorrência").
    *   Exporta em múltiplos formatos: Excel formatado (`XlsxWriter` com formatação brasileira de valores monetários), Parquet, SQLite e DuckDB.
*   [busca_dados.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/automacoes/busca_dados.py): Robô de Canais (Performance). Abre o Chromium do Playwright, realiza login no Power BI corporativo, clica nos menus e submenus, navega até a aba "R$ Hora", interage dinamicamente com pedaços do gráfico de pizza para extrair o Ticket Médio de canais online/offline e transplanta os dados preenchidos de forma reversa em uma planilha gabarito usando `openpyxl` sem corromper as fórmulas nativas.
*   [paxcalc.py](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/automacoes/paxcalc.py): Script matemático utilitário. Calcula o equilíbrio de passageiros (Break-Even de elasticidade) necessário para justificar reduções ou reajustes no preço de passagens. Desconta custos fixos como pedágio, taxas de embarque e considera viagens multiponto (fator de giro do ônibus).
*   `extension_converter.py`: Conversor universal de formatos de dados do backend, convertendo dinamicamente entre Excel, CSV, DuckDB e Parquet.

---

### 📁 src/ (Frontend React)
*   [App.tsx](file:///c:/Users/guilherme.felix/Documents/Temporário VS/Project_Automation3/src/App.tsx): Componente raiz do frontend. Gerencia a navegação entre as telas (`currentView`), o fluxo global de autenticação biométrica local e o acionamento de alertas e diálogos personalizados.
*   `context/`: Centraliza o estado da aplicação:
    *   `AuthContext.tsx`: Gerencia sessão ativa, dados do usuário logado e tokens.
    *   `UIContext.tsx`: Mantém preferências de interface (animações habilitadas, tema, visualização atual e dados de re-execuções).
    *   `TaskContext.tsx`: Controla a lista de automações rodando em background e o progresso SSE recebido.
    *   `DialogContext.tsx`: Permite acionar modais estilizados de Alerta, Confirmação e Prompts com suporte a temas e tons.
*   `layout/MainLayout.tsx`: Estrutura do painel principal (Sidebar lateral, barra de ferramentas de topo com botões personalizados de janela e container das views).
*   `views/`: Módulos de telas individuais (Dashboards Hub, Reports/Automações, Password Vault, Calculadora de Elasticidade, Conversor de Extensões, Configurações do Sistema e Histórico Geral).

---

## 3. Fluxo de Execução de Automações

A integração assíncrona entre o Node.js e os scripts Python ocorre conforme o fluxo abaixo:

1.  **Solicitação**: O frontend envia uma requisição `POST /api/run-automation` passando o nome da automação, ID do usuário e parâmetros configurados.
2.  **Preparação e Codificação**: O backend mapeia o script correto e serializa todos os parâmetros JSON em uma string **Base64**. Isso previne erros de encoding e injeção de caracteres especiais no terminal do Windows.
3.  **Processamento**: O Node inicializa o processo do Python via `spawnPythonScript` injetando o argumento em Base64:
    ```javascript
    const child = spawnPythonScript(scriptPath, [paramsBase64]);
    ```
4.  **Acompanhamento de Progresso**: O script Python em execução escreve na saída padrão (`stdout`) marcadores padronizados de progresso de forma síncrona:
    ```python
    print("PROGRESS:{\"p\": 50, \"m\": \"Processando dados...\"}", flush=True)
    ```
5.  **Streaming SSE**: O backend captura essa saída, processa o JSON usando Regex no Express e envia imediatamente ao cliente conectado via Server-Sent Events (SSE) na rota `/api/automation-progress/:jobId`.
6.  **Persistência**: Ao encerrar o processo Python, o backend lê se houve sucesso (código de saída `0`), move os relatórios finais para o diretório de backups da aplicação e atualiza o histórico no banco de dados local.

---

## 4. Estrutura de Segurança e Conformidade

O Auto Tools possui medidas severas de segurança para garantir a conformidade dos dados:

*   **Hasheamento de Senhas**: As senhas de acesso à aplicação nunca são guardadas legíveis. O banco SQLite salva apenas a representação criptográfica gerada por saltos e hash usando a biblioteca **bcrypt**.
*   **Criptografia do Cofre de Senhas**: As senhas de portais cadastrados no cofre são encriptadas localmente usando **Fernet (AES-128-CBC)**. A chave mestra gerada na primeira execução fica segura no arquivo `.env` na máquina do usuário final e está configurada no `.gitignore` para nunca ser enviada para repositórios Git.
*   **Controle de Acesso Remoto**: O middleware `deviceAccessGuard` protege os endpoints da API. Quando o acesso remoto está ativado, dispositivos tentando entrar pela rede interna (ex: celulares ou outros computadores) devem solicitar autorização e são travados até que o operador principal clique em "Aprovar dispositivo" no painel local do Desktop. Os tokens de dispositivos autorizados são atrelados ao IP cliente para prevenir falsificação de cookies.
*   **Windows Hello (WebAuthn)**: Integração nativa com Windows Hello. Desafios biométricos de criptografia assimétrica de chave pública/privada (WebAuthn) impedem que um usuário remoto ou local acesse as credenciais descriptografadas do cofre sem aprovação biométrica do dispositivo físico.
*   **SQL Injection e Path Traversal**: Todas as interações com o SQLite são parametrizadas (uso de placeholders `?` no conector Python/JS). Para downloads de relatórios e manipulação de arquivos, a função de validação `isPathSafe` garante que caminhos arbitrários passados pela rede não causem vazamento de arquivos do sistema operacional (Path Traversal).
