# Diagnóstico e Solução de Erro de Execução

## 1. Análise Completa do Projeto
O projeto **Auto Tools** é uma aplicação desktop baseada em:
- **Frontend**: React com Vite, TailwindCSS e Recharts para dashboards.
- **Backend**: Express (Node.js) que atua como API modular, com várias rotas autenticadas.
- **Integração Python**: Utiliza scripts Python para processamento de automações pesadas e banco de dados via um módulo `pythonProxy.js`.
- **Empacotamento**: O projeto utiliza o `electron-builder` com a opção `asar: true` ativada. Arquivos essenciais como scripts Python são extraídos usando a opção `asarUnpack`.

O arquivo principal de entrada do Electron (`electron/main.cjs`) era responsável por inicializar o servidor backend Express como um processo Node.js separado (Worker) antes de abrir a janela.

## 2. Diagnóstico do Erro (A partir da imagem)
O erro exibido na tela (`spawn C:\...\Auto Tools.exe ENOENT`) estava ocorrendo durante a inicialização do aplicativo em produção (versão compilada). 

**Causa Raiz:**
1. O `electron/main.cjs` utilizava o método `spawn` padrão do Node.js chamando `process.execPath` em conjunto com a variável de ambiente `ELECTRON_RUN_AS_NODE=1` para rodar o `server.js` em segundo plano.
2. Como o aplicativo está empacotado em um arquivo ASAR (`app.asar`), o caminho avaliado para o `server.js` e sua pasta local apontava para dentro do arquivo ASAR (Ex: `...\app.asar`).
3. O comando `spawn` do Node.js no Windows falha com erro `ENOENT` se o parâmetro `cwd` (Current Working Directory) for apontado para dentro de um arquivo ASAR. Para o sistema operacional, um arquivo ASAR é apenas um arquivo comum, e não um diretório válido, abortando a criação do processo filho.
4. Além disso, rodar instâncias limpas do Node.js (com `ELECTRON_RUN_AS_NODE`) não concede o suporte nativo a leitura de arquivos dentro do ASAR, o que acarretaria falhas em encontrar o `express` e outros pacotes na pasta `node_modules` empacotada.

## 3. Solução Registrada e Executada
Para corrigir este problema de forma nativa e sem precisar extrair todo o código fonte e as dependências pesadas (`node_modules`), as seguintes modificações foram realizadas no arquivo `electron/main.cjs`:

1. **Substituição por `utilityProcess.fork`**: Substituí o uso de `child_process.spawn` por `utilityProcess.fork` da própria API do Electron. O `utilityProcess` executa scripts Node.js em segundo plano com suporte integral para ler módulos de dentro de pacotes ASAR.
2. **Correção do Diretório de Trabalho (`cwd`)**: O `cwd` do processo do backend foi ajustado para apontar para `dataDir` (que é um caminho físico válido localizado no `%APPDATA%`), evitando imediatamente o erro `ENOENT` do sistema operacional.
3. **Resolução de Caminhos para o Python**: Atualizei a variável de ambiente `AUTOTOOLS_APP_ROOT` passada para o backend. Se o aplicativo estiver rodando empacotado, a variável agora detecta e repassa o caminho correspondente a pasta `.unpacked` (desempacotada). Como os scripts Python são processos externos que não suportam leitura de ASAR, isso garante que qualquer comando Python tenha a raiz resolvida para a pasta correta dos recursos expostos pela configuração `asarUnpack`.

A aplicação agora compilará e rodará corretamente o backend sem erros de caminho não encontrado, mantendo o código-fonte protegido dentro do ASAR.

## 4. Mitigação de Quedas do Backend (Crash) e Vazamento de Processo
Após as primeiras correções, ocorreu um novo cenário: ao tentar ler um arquivo incompatível, o backend processou uma quantidade massiva de dados (elevando o uso de RAM do Electron para quase 2GB) e eventualmente sofreu um travamento (crash) irreversível. Pior ainda, ao encerrar o aplicativo, o processo de fundo permaneceu rodando como "processo zumbi", consumindo recursos sem interface atrelada.

**Diagnóstico Adicional:**
- O servidor backend estava caindo devido a processamento síncrono muito pesado ou falha na lib, mas o Electron não tinha nenhum mecanismo de "Watchdog" para monitorar ou reviver a API se o processo fosse finalizado abruptamente.
- Quando o usuário encerrava a sessão ou o aplicativo fechava enquanto o backend estava inresponsível, o comando original (`taskkill /F /PID ...`) frequentemente falhava silenciosamente se o PID fosse perdido ou se houvessem conflitos de tempo de timeout. A variável que guardava o processo era limpada, o Node não o derrubava, e ele virava um processo orfão ("zumbi") em segundo plano.

**Solução Aplicada:**
1. **Mecanismo de Auto-Restart (Watchdog)**: No arquivo `electron/main.cjs`, adicionei um evento que escuta ativamente pelo encerramento (`exit`) do `utilityProcess` do backend. Caso a queda não seja intencional (como ao fechar o app), o Electron emitirá um aviso pelo console e efetuará um "Restart" automático de 2 segundos de carência chamando a inicialização do backend de novo.
2. **Desligamento Robusto**: Melhorei significativamente a rotina `stopBackend()`. Introduzi uma sinalização global (`isShuttingDown`) para diferenciar uma queda de sistema de um encerramento natural do app, e passei a utilizar o método natural e blindado `.kill()` em conjunto com o `taskkill` do Windows. Isso garante absolutamente que qualquer processo atrelado à `utilityProcess` seja encerrado de forma graciosa ou forçada independentemente do estado em que o Node/Python se encontrem.
