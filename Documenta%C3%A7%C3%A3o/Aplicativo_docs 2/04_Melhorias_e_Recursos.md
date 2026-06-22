# 📐 04_Melhorias_e_Recursos.md — Pontos de Melhoria e Novas Funcionalidades

Este documento consolida uma análise crítica de engenharia de software sobre a arquitetura atual do **Auto Tools v2.0.1**. Ele identifica gargalos de performance, vulnerabilidades de segurança latentes e apresenta propostas técnicas detalhadas de melhorias arquiteturais e novos recursos para as próximas versões.

---

## 🔗 Conexões
- **Relacionado**: [[01_Arquitetura_Geral]] (arquitetura do sistema), [[02_Stack_Tecnologica]] (inventário de pacotes)
- **Consumidor**: Engenheiros de software e desenvolvedores de RPA que darão manutenção na plataforma.

---

## ⚠️ Pontos de Melhoria Técnica (Gargalos & Débito Técnico)

### 1. Comunicação via Processo Spawn no Proxy Python (`pythonProxy`)
- **Gargalo**: Atualmente, toda query analítica aos arquivos DuckDB, Excel ou Parquet gera um spawn de processo Python (`child_process.spawn`). Isso impõe um overhead de boot ao interpretador Python (cerca de 100ms a 300ms por chamada), além da inicialização de bibliotecas pesadas como Pandas e Polars.
- **Solução Proposta**: Substituir o modelo de spawn temporário por um **Pool de Workers Python Persistentes** (Daemonized Python Workers). O Node.js se comunicaria com um processo Python de longa duração via sockets TCP locais, gRPC ou Pipes Nomeados. Isso eliminaria o overhead de inicialização, reduzindo a latência das queries analíticas a milissegundos.

### 2. Concorrência de Escrita no Banco SQLite (`Userbank.db`)
- **Gargalo**: Tanto o backend Node.js (via `better-sqlite3`) quanto as automações e daemons Python (via `sqlite3`) acessam e escrevem diretamente no mesmo arquivo `Userbank.db`. Em momentos de alta carga ou execuções simultâneas de RPA, o SQLite pode bloquear tabelas, gerando erros do tipo `SQLITE_BUSY`.
- **Solução Proposta**: 
  1. Habilitar o modo **WAL (Write-Ahead Logging)** no SQLite local, permitindo leituras simultâneas sem bloquear escritas.
  2. Isolar todo o acesso ao banco em uma API de dados interna no Express, forçando os scripts Python a efetuarem requisições HTTP locais ou IPC para o backend para salvar estados de logs e históricos, em vez de abrirem conexões diretas com o banco físico.

### 3. Exposição da Chave do Cofre (`.vault_key`) no Disco
- **Vulnerabilidade**: A chave Fernet de criptografia do cofre de senhas é salva na raiz da pasta do aplicativo como um arquivo de texto plano (`.vault_key`). Caso a pasta seja copiada indevidamente ou ocorra um vazamento de acesso no computador, as credenciais operacionais dos sistemas (ADM, EBUS) tornam-se vulneráveis.
- **Solução Proposta**: Utilizar o gerenciador de chaves nativo do sistema operacional do usuário por meio do **Windows Credential Manager (CredWrite/CredRead)** no Windows, Keychain no macOS ou Secret Service no Linux. Isso garante que a chave criptográfica fique guardada no hardware/SO, inacessível a outros usuários sem privilégio.

### 4. Provisionamento e Atualização das Dependências Python
- **Débito**: A instalação de dependências de scripts Python depende de scripts Powershell em tempo de instalação executados na máquina do usuário. Bloqueios de rede corporativa podem fazer com que comandos como `pip install` ou `playwright install` falhem silenciosamente.
- **Solução Proposta**: Distribuir o runtime Python já empacotado com todas as bibliotecas necessárias embutidas (pré-compiladas em formato de pasta estática `.zip` específica do projeto), ou migrar as rotinas analíticas críticas para o Node.js utilizando bindings Rust nativos.

---

## 🚀 Novas Funcionalidades Propostas (Roadmap)

### 1. Centralização Completo do Dashboard Financeiro (`RevenueDashboardView`)
- **Objetivo**: Conectar o endpoint do backend de faturamento (`revenue_dashboard`) a uma interface dedicada no React, exibindo gráficos interativos de evolução de receita, metas mensais e custos de operação.
- **Tecnologias**: Recharts (para gráficos de linha/barra empilhados), componentes de Cards transparentes e filtros temporais baseados no `custom_date_picker`.

### 2. Monitor de Tarefas RPA e Notificações Nativas do OS
- **Objetivo**: Fornecer alertas visuais nativos no Windows (Windows Notifications/Toasts) quando um robô de scraping (ex: `ebus_new` ou `sr_new`) for concluído com sucesso, falhar ou exigir intervenção humana (como resolver CAPTCHAs).
- **Implementação**: Integrar a API de notificações do Electron (`Notification`) com o barramento de progresso SSE.

### 3. Interface Visual para Gestão do Cofre de Credenciais
- **Objetivo**: Permitir que usuários com perfil de Administrador editem, testem conexões e atualizem credenciais dos robôs diretamente na tela do aplicativo (`VaultView`), eliminando a necessidade de editar manualmente arquivos de segredo no servidor.
- **Segurança**: Operações CRUD autenticadas com validação biométrica do Windows Hello.
