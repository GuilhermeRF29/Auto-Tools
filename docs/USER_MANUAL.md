# 📖 Manual do Usuário — Auto Tools

Bem-vindo ao **Auto Tools**! Este manual foi elaborado para orientar você, usuário final, sobre o funcionamento de cada tela, botões e recursos disponíveis na nossa plataforma de automação e análises operacionais.

---

## 🖥️ Controles de Janela Customizados
Como o Auto Tools foi projetado com uma estética premium e minimalista (sem a moldura cinza padrão do Windows), os botões de navegação e controle de janela ficam integrados na barra de ferramentas superior direita:

*   **Minimizar (➖)**: Oculta temporariamente a janela do aplicativo na barra de tarefas do Windows.
*   **Maximizar/Restaurar (🔲)**: Alterna o tamanho da tela entre tela cheia e modo janela. O aplicativo se ajusta automaticamente de forma responsiva.
*   **Fechar (❌)**: Encerra o aplicativo e finaliza todos os processos em segundo plano de forma segura.

---

## 🔑 1. Tela de Login e Biometria (Windows Hello)
Ao abrir a aplicação, você será apresentado à tela de login do Auto Tools.

### Funcionalidades:
1.  **Login Tradicional**: Insira seu usuário e senha cadastrados e clique em **Entrar**.
2.  **Autenticação Biométrica**: Se você já tiver ativado a biometria nas configurações da sua conta, basta clicar no ícone de **Biometria (impressão digital)** abaixo do botão de login para entrar rapidamente usando o **Windows Hello** (impressão digital ou reconhecimento facial do computador).
3.  **Registro de Primeiro Acesso**: Se for a primeira vez que você acessa o sistema em um banco novo, registre um usuário principal.

---

## 📊 2. Hub de Dashboards
O Hub de Dashboards centraliza os principais relatórios dinâmicos do setor operacional e RM da empresa:

*   📈 **Revenue**: Análise detalhada de faturamento, metas diárias e mensais.
*   📉 **Demanda (Forecast)**: Previsão de demanda futura de passagens e ocupação de linhas.
*   🗺️ **Rio x SP Market Share**: Monitoramento comparativo da participação de mercado entre as praças de Rio de Janeiro e São Paulo.
*   🛒 **Performance de Canais (Share Canais)**: Análise comparativa do volume e faturamento das vendas em guichês físicos, sites corporativos, aplicativos parceiros e agências terceiras.

> [!TIP]
> Os dados desses dashboards são lidos a partir das planilhas consolidadas geradas pelos robôs de automação. Caso os caminhos de rede corporativa (`Z:\` ou IP `172.16.98.12`) não estejam acessíveis, os dashboards carregarão automaticamente arquivos locais de segurança.

---

## 🤖 3. Painel de Automações (Relatórios)
Nesta tela, você pode acionar e monitorar a execução das automações que buscam dados e geram os relatórios consolidados em Excel.

### Como Executar uma Automação:
1.  **Selecionar Automação**: Escolha qual robô deseja iniciar (Ex: *ADM Demandas*, *eBus Revenue*, *BI Performance*).
2.  **Configurar Parâmetros**:
    *   **Data de Início** e **Data de Fim** do período analisado.
    *   **Modo de Execução**: *Completo* (faz o login na web, baixa os arquivos novos e trata), *Apenas Download* ou *Apenas Tratamento* (útil se você já tiver os arquivos baixados na sua máquina).
    *   **Caminho Personalizado**: Você pode definir uma pasta específica para salvar o arquivo de saída, caso não queira usar o caminho de rede padrão.
3.  **Executar**: Clique no botão **Iniciar Automação**.

### Monitoramento de Progresso:
*   Um card animado aparecerá no topo da tela com uma barra de carregamento colorida.
*   O aplicativo exibe a porcentagem exata de conclusão (`1%` a `100%`) e mensagens de status detalhadas enviadas pelo robô em tempo real (Ex: *"Lote 2/5 - Baixando arquivo..."*, *"Consolidando planilhas..."*).
*   Você pode clicar em **Cancelar** a qualquer momento para interromper a execução do robô com segurança.

---

## 🔒 4. Cofre de Senhas (Vault)
O Cofre de Senhas é um espaço seguro onde o sistema guarda as credenciais de acesso aos portais corporativos (eBus, ADM de Vendas, Power BI) para que os robôs consigam realizar o login de forma totalmente automática.

### Acessando o Cofre (Segurança Dupla):
*   Para abrir o cofre, a aplicação sempre solicitará sua confirmação.
*   Você pode digitar sua **Senha Mestra** ou clicar em **Autenticar Biometria** para ler sua digital via Windows Hello.

### Gerenciamento de Senhas:
1.  **Sistemas Pré-definidos**: Edite o usuário e senha dos robôs integrados para garantir que eles não parem de rodar por senha expirada na rede.
2.  **Adicionar Novo Acesso**: Você pode cadastrar sites externos adicionando o Nome do Site, URL, Usuário e Senha.
3.  **Visualizar e Copiar**: Clique no ícone de "olho" para ver a senha descriptografada ou no botão de "copiar" para mandar o texto para a área de transferência.

---

## 🧮 5. Calculadora Pax
Ferramenta desenvolvida para simular cenários tarifários rapidamente. Permite avaliar a viabilidade financeira ao planejar uma queda ou aumento de tarifas.

### Como Utilizar:
1.  Preencha as informações básicas do trecho: **Preço Atual**, **Novo Preço**, **Passageiros Atuais** e **Qtd. de Viagens**.
2.  Informe os custos agregados: valor médio de **Pedágio** por viagem e a **Taxa de Embarque** da rodoviária.
3.  Adicione as informações de logística do ônibus: **Fator de Giro** (multiponto) e a **Capacidade Física** de poltronas do veículo.
4.  **Resultados Obtidos**:
    *   **Passageiros Extra Necessários**: Quantos passageiros a mais por viagem você precisa atrair na nova tarifa para empatar o faturamento líquido.
    *   **Ocupação de Pico**: Gráfico dinâmico que compara a ocupação atual versus a ocupação necessária simulada para que a linha não opere no prejuízo.
    *   **Receita por KM (R$/KM)**: Simulação do ganho por quilometragem rodada.

---

## 🔄 6. Conversor de Arquivos
Permite converter formatos de bases de dados locais com alta velocidade.

### Como Utilizar:
1.  Arraste ou selecione o arquivo local da sua máquina.
2.  Escolha o formato de entrada e o formato de saída desejado:
    *   **Excel (`.xlsx`, `.xls`)**
    *   **CSV (`.csv`)**
    *   **Parquet (`.parquet`)**
    *   **DuckDB (`.duckdb`)**
3.  Clique em **Converter**. O arquivo resultante estará disponível para download imediatamente na sua pasta pessoal.

---

## 📁 7. Histórico de Execuções e Backups
Sempre que uma automação é concluída, um backup do relatório resultante é salvo no sistema de arquivos do Auto Tools e registrado nesta tela.

### Funcionalidades:
*   **Lista Cronológica**: Veja qual usuário executou cada automação, a data e hora exata e o status da tarefa (*Concluído*, *Cancelado* ou *Falhou*).
*   **Baixar Cópia**: Clique no botão de download ao lado de qualquer execução concluída para baixar a cópia exata em Excel da planilha gerada no dia correspondente, mesmo que ela tenha sido apagada da pasta de rede compartilhada da empresa.

---

## ⚙️ 8. Configurações do Sistema
Esta tela é destinada para parametrizações globais do sistema:

### Caminhos de Relatórios:
*   Configure as pastas físicas onde os robôs devem ler/gravar os relatórios de cada um dos dashboards. Você pode alterar a qualquer momento se a pasta de rede compartilhada mudar de letra de unidade (ex: de `Z:\` para `X:\`).

### Acesso Remoto e Dispositivos:
Se você deseja acessar os dashboards ou as ferramentas do Auto Tools a partir do seu celular ou de outro computador na mesma rede corporativa, utilize este menu:
1.  **Ativar Acesso Remoto**: Habilita o servidor a escutar conexões de fora.
2.  **Aprovar Solicitações**: Dispositivos externos que tentarem acessar a aplicação pela primeira vez entrarão em estado de "pendente". Você verá uma lista com o IP e o tipo do dispositivo na tela de configurações. Clique em **Autorizar** para permitir o acesso definitivo.
3.  **Revogar Acesso**: Remova instantaneamente a permissão de qualquer celular ou computador autorizado anteriormente.
