<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# 🛠️ Auto Tools

**Plataforma de automação e dashboards para análise operacional**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?logo=python&logoColor=white)](https://python.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org/)

</div>

---

## 📋 Sobre o Projeto

**Auto Tools** é uma aplicação interna de automação que combina um frontend moderno em React com um backend Node.js/Express que orquestra scripts Python para processamento de dados.

### Principais funcionalidades:

- 📊 **Dashboards interativos** — Revenue, Demanda (Forecast), Rio x SP Market Share, e Performance de Canais
- 🤖 **Automações** — Geração automatizada de relatórios Excel a partir de múltiplas fontes (EBUS, ADM Vendas, BI/Power BI, Gmail)
- 🔒 **Cofre de senhas** — Armazenamento seguro de credenciais com criptografia Fernet (AES-128-CBC)
- 👤 **Autenticação biométrica** — Suporte a Windows Hello via WebAuthn
- 🧮 **Calculadora Pax** — Cálculo de elasticidade de preço por passageiro
- 🔄 **Conversor de arquivos** — Conversão entre formatos (Excel, CSV, DuckDB, Parquet)
- 📁 **Histórico de execuções** — Rastreamento completo com backup automático

---

## 🏗️ Arquitetura

```
Auto Tools
├── Frontend (React + TypeScript + Tailwind CSS)
│   ├── Views — DashboardView, ReportsView, VaultView, etc.
│   ├── Contexts — AuthContext, TaskContext, UIContext, DialogContext
│   └── Components — CommandPalette, MainLayout, gráficos Recharts
│
├── Backend (Node.js + Express)
│   ├── server.js — Ponto de entrada do servidor API
│   ├── routes/ — Rotas modularizadas
│   │   ├── authRoutes.js — Login/cadastro
│   │   ├── vaultRoutes.js — Cofre de senhas
│   │   ├── automationRoutes.js — Execução de automações
│   │   ├── systemRoutes.js — Ferramentas de sistema
│   │   ├── webauthnRoutes.js — Windows Hello
│   │   └── dashboard/ — Módulos de dashboard
│   │       ├── dashboardUtils.js — Funções utilitárias compartilhadas
│   │       ├── revenueDashboard.js — Dashboard Revenue
│   │       ├── demandDashboard.js — Dashboard Demanda
│   │       ├── rioShareDashboard.js — Dashboard Rio x SP
│   │       └── channelShareDashboard.js — Dashboard Share Canais
│   └── utils/ — pythonProxy.js (ponte Node↔Python)
│
├── Python (core/ + automacoes/)
│   ├── core/banco.py — Banco de dados SQLite + criptografia
│   ├── core/google_auth.py — Autenticação Google API
│   └── automacoes/ — Scripts de automação (EBUS, ADM, SR, etc.)
│
└── Dados
    ├── Userbank.db — Banco SQLite principal
    └── backups_sistema/ — Backups de relatórios gerados
```

---

## 🚀 Instalação e Execução

### Pré-requisitos

- **Node.js** 18+ — [Download](https://nodejs.org/)
- **Python** 3.10+ — [Download](https://python.org/)
- **Git** — [Download](https://git-scm.com/)

### 1. Clonar o repositório

```bash
git clone https://github.com/GuilhermeRF29/Auto-Tools.git
cd Auto-Tools
```

### 2. Instalar dependências Node.js

```bash
npm install
```

### 3. Configurar ambiente Python

```bash
# Criar ambiente virtual
python -m venv venv

# Ativar (Windows)
venv\Scripts\activate

# Instalar dependências Python
pip install -r requirements.txt

# Instalar browser do Playwright (se for usar automações web)
playwright install chromium
```

### 4. Configurar variáveis de ambiente

```bash
# Copiar template
copy .env.example .env

# Editar .env e preencher a CHAVE_LOGIN (gerada automaticamente na primeira execução)
```

### 5. Inicializar o banco de dados

```bash
python setup_db.py
```

### 6. Executar o sistema

```bash
# Terminal 1 — Backend (servidor API na porta 3001)
npm run server

# Terminal 2 — Frontend (dev server Vite na porta 3000)
npm run dev
```

Acesse em: **http://localhost:3000**

---

## ⚙️ Configuração de Caminhos

Os caminhos padrão dos dashboards podem ser configurados na interface em **Configurações**:

| Dashboard | Variável | Padrão |
|-----------|----------|--------|
| Revenue | `baseDir` | `Z:\DASH REVENUE APPLICATION\BASE` |
| Demanda | `baseDir` | `Z:\Forecast\Forecast2` |
| Rio x SP | `baseDir` | `Z:\Dash RIO` |
| Channel Share | `baseDir` | `Z:\Forecast\Forecast2` |

Se os caminhos padrão não estiverem acessíveis, o sistema utiliza fallbacks locais automaticamente.

---

## 🔒 Segurança

- **Senhas de usuário** — Hash com bcrypt (salt automático)
- **Cofre de senhas** — Criptografia Fernet (AES-128-CBC), chave mestra no `.env`
- **WebAuthn** — Autenticação biométrica via Windows Hello
- **Sessão** — SessionStorage no navegador (não persiste entre abas)
- **Path Traversal** — Proteção em todos os endpoints de download/exclusão
- **SQL Injection** — Todas as queries usam parâmetros preparados

### Arquivos sensíveis (NÃO commitar)

- `.env` — Chave mestra de criptografia
- `token.json` — Tokens OAuth do Google
- `core/credentials.json` — Credenciais da API do Google
- `Userbank.db` — Banco de dados com senhas

---

## 🧪 Scripts disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o frontend em modo desenvolvimento |
| `npm run server` | Inicia o backend (Express API) |
| `npm run build` | Build de produção do frontend |
| `npm run lint` | Verificação de tipos TypeScript |
| `npm run preview` | Preview do build de produção |
| `npm run electron:start` | Inicia a shell Electron apontando para o backend local |
| `npm run electron:dev` | Fluxo dev do Electron (Vite + Electron) |
| `npm run electron:build` | Gera instalador Windows (NSIS) |
| `npm run electron:build:portable` | Gera executável portátil Windows |

---

## 🖥️ Compilação Electron (.exe)

### Objetivo

Gerar um `.exe` que funcione em máquinas sem Python, Node.js, VS Code ou IDEs instaladas.

### Pré-requisitos na máquina de build

1. Dependências Node instaladas (`npm install`)
2. Ambiente Python do projeto criado em `venv/`
3. Dependências Python instaladas com `pip install -r requirements.txt`

> O pacote final inclui a pasta `venv` como runtime Python embutido.

### Gerar instalador

```bash
npm run electron:build
```

### Gerar versão portátil

```bash
npm run electron:build:portable
```

Artefatos são gerados em `release/`.

### Como o runtime funciona no app empacotado

- Electron inicia `server.js` automaticamente ao abrir o app.
- O backend usa o Python embutido em `resources/venv/Scripts/python.exe`.
- Dados de execução (banco SQLite, `.env`, store de WebAuthn e autorização de dispositivos) são gravados no diretório de dados do usuário, não na pasta de instalação.

---

## 🔐 Acesso Remoto com Aprovação de Dispositivo

Foi adicionada uma seção em **Configurações → Acesso Remoto e Dispositivos** com:

- Habilitar/desabilitar acesso remoto
- Exigir aprovação de novos dispositivos
- Amarrar token ao IP de aprovação
- Definir validade do token de dispositivo
- Aprovar/rejeitar solicitações pendentes
- Revogar dispositivos autorizados

### Fluxo remoto

1. Cliente remoto abre o app via IP/URL do desktop.
2. Se não autorizado, fica em estado de "Aguardando aprovação".
3. Operador aprova no desktop na seção de configurações.
4. O cliente remoto recebe token e passa a acessar normalmente.

---

## 📁 Estrutura de Diretórios

```
Project_Automation3/
├── .env                    # Variáveis de ambiente (NÃO COMMITAR)
├── .env.example            # Template de configuração
├── .gitignore              # Regras de exclusão do Git
├── package.json            # Dependências Node.js
├── requirements.txt        # Dependências Python
├── server.js               # Ponto de entrada do backend
├── setup_db.py             # Inicializador do banco de dados
├── vite.config.ts          # Configuração do Vite (frontend)
├── tsconfig.json           # Configuração do TypeScript
├── index.html              # HTML raiz do frontend
│
├── src/                    # Frontend React
│   ├── App.tsx             # Componente raiz
│   ├── main.tsx            # Entry point React
│   ├── index.css           # Estilos globais
│   ├── assets/             # Imagens e recursos estáticos
│   ├── components/         # Componentes reutilizáveis
│   ├── context/            # Providers (Auth, UI, Task, Dialog)
│   ├── layout/             # Layout principal
│   ├── types/              # Definições TypeScript
│   ├── utils/              # Utilitários do frontend
│   └── views/              # Telas da aplicação
│
├── src_backend/            # Backend Node.js
│   ├── config.js           # Configuração de paths
│   ├── routes/             # Rotas Express
│   │   ├── dashboard/      # Módulos de dashboard
│   │   └── ...             # Outras rotas
│   ├── scripts/            # Scripts Python auxiliares
│   ├── utils/              # Utilitários (pythonProxy.js)
│   └── data/               # Dados locais do backend
│
├── core/                   # Lógica Python core
│   ├── banco.py            # Acesso ao banco de dados
│   ├── google_auth.py      # Autenticação Google
│   └── credentials.json    # Credenciais Google (NÃO COMMITAR)
│
└── automacoes/             # Scripts de automação Python
    ├── adm_new.py          # Automação ADM de Vendas
    ├── ebus_new.py         # Automação EBUS
    ├── sr_new.py           # Automação SR Gmail/Base
    ├── paxcalc.py          # Calculadora de elasticidade Pax
    └── ...                 # Outros scripts
```

---

## 🔮 Roadmap

- [x] Compilação como aplicativo desktop via **Electron**
- [ ] Configurações de caminhos persistidas no banco
- [ ] Sistema de notificações para conclusão de automações
- [ ] Suporte a múltiplos usuários com perfis
- [ ] Exportação de dashboards como PDF

---

## 📄 Licença

Projeto privado — uso interno apenas.

---

<div align="center">
<sub>Desenvolvido com ❤️ por Guilherme Felix</sub>
</div>
