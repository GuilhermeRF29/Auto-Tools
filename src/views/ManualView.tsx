import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen, HelpCircle, AppWindow, Fingerprint, BarChart3,
  Play, Lock, Calculator, ArrowLeftRight, History, Settings,
  Search, ArrowRight, Lightbulb, CheckCircle2, AlertCircle
} from 'lucide-react';
import type { View } from '../types';
import { useUI } from '../context/UIContext';
import Card from '../components/Card';

interface Section {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  viewLink?: View;
  viewLinkLabel?: string;
  description: string;
  content: React.ReactNode;
  searchText: string; // Para otimizar a busca textual
}

export default function ManualView() {
  const { setCurrentView } = useUI();
  const [activeTab, setActiveTab] = useState('window-controls');
  const [searchQuery, setSearchQuery] = useState('');

  const sections: Section[] = useMemo(() => [
    {
      id: 'window-controls',
      title: 'Controles de Janela',
      subtitle: 'Controle e redimensionamento',
      icon: AppWindow,
      description: 'Como controlar o aplicativo Auto Tools usando a barra de ferramentas integrada superior.',
      searchText: 'controles de janela customizados minimizar maximizar restaurar fechar tela cheia responsiva fechar encerra processos em segundo plano de forma segura barra superior direita',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Como o Auto Tools foi projetado com uma estética premium e minimalista (sem a moldura cinza padrão do Windows), os botões de navegação e controle de janela ficam integrados na barra de ferramentas superior direita:
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 mt-4">
            <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-col justify-between hover:border-blue-200 transition-colors">
              <div>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-200/50 text-slate-700 font-bold mb-3">➖</span>
                <h4 className="font-bold text-slate-800 mb-1">Minimizar</h4>
                <p className="text-xs text-slate-500">Oculta temporariamente a janela do aplicativo na barra de tarefas do Windows.</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl flex flex-col justify-between hover:border-blue-200 transition-colors">
              <div>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-slate-200/50 text-slate-700 font-bold mb-3">🔲</span>
                <h4 className="font-bold text-slate-800 mb-1">Maximizar / Restaurar</h4>
                <p className="text-xs text-slate-500">Alterna o tamanho da tela entre tela cheia e modo janela. O aplicativo se ajusta de forma responsiva.</p>
              </div>
            </div>
            <div className="p-4 bg-rose-50/30 border border-rose-100/60 rounded-2xl flex flex-col justify-between hover:border-rose-200 transition-colors">
              <div>
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-rose-100/50 text-rose-700 font-bold mb-3">❌</span>
                <h4 className="font-bold text-rose-800 mb-1">Fechar</h4>
                <p className="text-xs text-rose-500/90">Encerra o aplicativo e finaliza todos os processos em segundo plano de forma totalmente segura.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'login-biometrics',
      title: 'Login e Biometria',
      subtitle: 'Acesso seguro com Windows Hello',
      icon: Fingerprint,
      description: 'Como acessar o sistema e configurar chaves biométricas para login rápido.',
      searchText: 'tela de login e biometria windows hello login tradicional autenticação biométrica digital facial registro de primeiro acesso usuario principal senhas banco novo',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Ao abrir a aplicação, você será apresentado à tela de login do Auto Tools. A segurança está integrada no núcleo do aplicativo.
          </p>
          <div className="space-y-3 mt-2">
            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">1</div>
              <div>
                <h4 className="font-bold text-slate-800">Login Tradicional</h4>
                <p className="text-xs text-slate-500 mt-0.5">Insira seu usuário e senha cadastrados e clique em <strong>Entrar</strong>.</p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">2</div>
              <div>
                <h4 className="font-bold text-slate-800">Autenticação Biométrica</h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Se você já tiver ativado a biometria nas configurações da sua conta, basta clicar no ícone de <strong>Biometria (impressão digital)</strong> abaixo do botão de login para entrar rapidamente usando o <strong>Windows Hello</strong> (impressão digital ou reconhecimento facial do computador).
                </p>
              </div>
            </div>
            <div className="flex gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold flex-shrink-0">3</div>
              <div>
                <h4 className="font-bold text-slate-800">Registro de Primeiro Acesso</h4>
                <p className="text-xs text-slate-500 mt-0.5">Se for a primeira vez que você acessa o sistema em um banco novo, registre um usuário principal.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'dashboards-hub',
      title: 'Hub de Dashboards',
      subtitle: 'Visualização de dados analíticos',
      icon: BarChart3,
      viewLink: 'dashboards',
      viewLinkLabel: 'Ir para Dashboards',
      description: 'Acesse os relatórios de Revenue, Demanda, Market Share e Share de Canais.',
      searchText: 'hub de dashboards centraliza principais relatórios dinâmicos faturamento metas diárias mensais demanda forecast previsão futuro passagens ocupação de linhas rio x sp market share rio de janeiro são paulo performance de canais share canais guichês físicos sites corporativos aplicativos parceiros agências terceiras planilhas consolidadas rede corporativa',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            O Hub de Dashboards centraliza os principais relatórios dinâmicos do setor operacional e RM da empresa:
          </p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 list-none">
            <li className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/40">
              <div className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                <span className="text-base">📈</span> Revenue
              </div>
              <p className="text-xs text-slate-500">Análise detalhada de faturamento, metas diárias e mensais da empresa.</p>
            </li>
            <li className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/40">
              <div className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                <span className="text-base">📉</span> Demanda (Forecast)
              </div>
              <p className="text-xs text-slate-500">Previsão de demanda futura de passagens e ocupação de linhas.</p>
            </li>
            <li className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/40">
              <div className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                <span className="text-base">🗺️</span> Rio x SP Market Share
              </div>
              <p className="text-xs text-slate-500">Monitoramento comparativo da participação de mercado entre as praças de Rio de Janeiro e São Paulo.</p>
            </li>
            <li className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/40">
              <div className="font-bold text-slate-800 flex items-center gap-2 mb-1">
                <span className="text-base">🛒</span> Performance de Canais
              </div>
              <p className="text-xs text-slate-500">Análise de vendas em guichês físicos, sites corporativos, aplicativos parceiros e agências terceiras.</p>
            </li>
          </ul>

          <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl flex gap-3 mt-4 items-start text-blue-800">
            <Lightbulb size={18} className="flex-shrink-0 text-blue-600 mt-0.5" />
            <div className="text-xs leading-relaxed font-medium">
              <strong>Dica de Acesso:</strong> Os dados desses dashboards são lidos a partir das planilhas consolidadas geradas pelos robôs de automação. Caso os caminhos de rede corporativa (unidade <code>Z:\</code> ou IP <code>172.16.98.12</code>) não estejam acessíveis, os dashboards carregarão automaticamente arquivos locais de segurança.
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'automations-panel',
      title: 'Painel de Automações',
      subtitle: 'Disparo de robôs e relatórios',
      icon: Play,
      viewLink: 'reports',
      viewLinkLabel: 'Ir para Automações',
      description: 'Como configurar e disparar as automações de extração de dados e monitorar o progresso.',
      searchText: 'painel de automações relatórios acionar monitorar execução excel como executar automação selecionar automação ebus revenue adm demandas bi performance data de inicio fim modo de execução completo apenas download apenas tratamento caminho personalizado iniciar automação monitoramento de progresso card animado barra de carregamento colorida porcentagem status tempo real cancelar',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Nesta tela, você pode acionar e monitorar a execução das automações que buscam dados e geram os relatórios consolidados em Excel.
          </p>

          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest mt-4 mb-2">Como Executar uma Automação</h4>
          <ol className="space-y-2.5 list-decimal pl-4">
            <li>
              <strong>Selecionar Automação</strong>: Escolha qual robô deseja iniciar (Ex: <em>ADM Demandas</em>, <em>eBus Revenue</em>, <em>BI Performance</em>).
            </li>
            <li>
              <strong>Configurar Parâmetros</strong>:
              <ul className="list-disc pl-5 mt-1 space-y-1 text-xs text-slate-500">
                <li><strong>Data de Início</strong> e <strong>Data de Fim</strong> do período analisado.</li>
                <li><strong>Modo de Execução</strong>: <em>Completo</em> (faz o login na web, baixa os arquivos novos e trata), <em>Apenas Download</em> ou <em>Apenas Tratamento</em> (útil se você já tiver os arquivos baixados).</li>
                <li><strong>Caminho Personalizado</strong>: Você pode definir uma pasta específica para salvar o arquivo de saída.</li>
              </ul>
            </li>
            <li>
              <strong>Executar</strong>: Clique no botão <strong>Iniciar Automação</strong>.
            </li>
          </ol>

          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest mt-4 mb-2">Monitoramento de Progresso</h4>
          <ul className="space-y-2 text-slate-500 text-xs pl-4 list-disc">
            <li>Um card animado aparecerá no topo da tela com uma barra de carregamento colorida.</li>
            <li>O aplicativo exibe a porcentagem exata de conclusão (<code>1%</code> a <code>100%</code>) e mensagens de status detalhadas enviadas pelo robô em tempo real (Ex: <em>"Lote 2/5 - Baixando arquivo..."</em>).</li>
            <li>Você pode clicar em <strong>Cancelar</strong> a qualquer momento para interromper a execução do robô com segurança.</li>
          </ul>
        </div>
      )
    },
    {
      id: 'vault-passwords',
      title: 'Cofre de Senhas (Vault)',
      subtitle: 'Armazenamento de credenciais',
      icon: Lock,
      viewLink: 'vault',
      viewLinkLabel: 'Abrir Cofre',
      description: 'Como gerenciar e armazenar com total segurança as senhas dos robôs corporativos.',
      searchText: 'cofre de senhas vault espaço seguro guarda credenciais acesso portais corporativos ebus adm de vendas power bi login automático acessando cofre segurança dupla confirmação senha mestra biometria windows hello gerenciamento de senhas sistemas pré-definidos adicionar novo acesso visualizar copiar',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            O Cofre de Senhas é um espaço seguro onde o sistema guarda as credenciais de acesso aos portais corporativos (eBus, ADM de Vendas, Power BI) para que os robôs consigam realizar o login de forma totalmente automática.
          </p>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3 mt-4">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-blue-600" />
              Acessando o Cofre (Segurança Dupla)
            </h4>
            <p className="text-xs text-slate-500">
              Para abrir o cofre, a aplicação sempre solicitará sua confirmação. Você pode digitar sua <strong>Senha Mestra</strong> ou clicar em <strong>Autenticar Biometria</strong> para ler sua digital via Windows Hello.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3">
            <h4 className="font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-blue-600" />
              Gerenciamento de Senhas
            </h4>
            <ol className="list-decimal pl-4 text-xs text-slate-500 space-y-1.5">
              <li><strong>Sistemas Pré-definidos</strong>: Edite o usuário e senha dos robôs integrados para garantir que eles não parem de rodar por senha expirada na rede.</li>
              <li><strong>Adicionar Novo Acesso</strong>: Você pode cadastrar sites externos adicionando o Nome do Site, URL, Usuário e Senha.</li>
              <li><strong>Visualizar e Copiar</strong>: Clique no ícone de "olho" para ver a senha descriptografada ou no botão de "copiar" para mandar o texto para a área de transferência.</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: 'calculator-pax',
      title: 'Calculadora Pax',
      subtitle: 'Simulações e precificação',
      icon: Calculator,
      viewLink: 'calculator',
      viewLinkLabel: 'Abrir Calculadora',
      description: 'Simule cenários tarifários de viagens, ocupações de pico e break-even líquido.',
      searchText: 'calculadora pax simular cenários tarifários viabilidade financeira queda aumento de tarifas preencha informações básicas preço atual novo preço passageiros atuais qtd de viagens custos agregados pedágio taxa de embarque logística fator de giro capacidade física poltronas resultados obtidos passageiros extra necessários break even ocupação de pico gráfico dinâmico receita por km r$/km',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Ferramenta desenvolvida para simular cenários tarifários rapidamente. Permite avaliar a viabilidade financeira ao planejar uma queda ou aumento de tarifas.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-2">Como Utilizar:</h4>
              <ul className="space-y-1.5 text-xs text-slate-500 list-disc pl-4">
                <li>Preencha as informações básicas do trecho: <strong>Preço Atual</strong>, <strong>Novo Preço</strong>, <strong>Passageiros Atuais</strong> e <strong>Qtd. de Viagens</strong>.</li>
                <li>Informe os custos agregados: valor médio de <strong>Pedágio</strong> por viagem e a <strong>Taxa de Embarque</strong> da rodoviária.</li>
                <li>Adicione as informações de logística do ônibus: <strong>Fator de Giro</strong> e a <strong>Capacidade Física</strong> de poltronas do veículo.</li>
              </ul>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
              <h4 className="font-bold text-slate-800 mb-2">Resultados Obtidos:</h4>
              <ul className="space-y-1.5 text-xs text-slate-500 list-disc pl-4">
                <li><strong>Passageiros Extra Necessários</strong>: Quantos passageiros a mais por viagem você precisa atrair na nova tarifa para empatar o faturamento líquido.</li>
                <li><strong>Ocupação de Pico</strong>: Gráfico dinâmico que compara a ocupação atual versus a ocupação necessária simulada para que a linha não opere no prejuízo.</li>
                <li><strong>Receita por KM (R$/KM)</strong>: Simulação do ganho por quilometragem rodada.</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'file-converter',
      title: 'Conversor de Arquivos',
      subtitle: 'Conversão de bases de dados',
      icon: ArrowLeftRight,
      viewLink: 'tools',
      viewLinkLabel: 'Abrir Conversor',
      description: 'Conversão de alta performance entre Excel, CSV, Parquet e DuckDB.',
      searchText: 'conversor de arquivos convert formatos de bases de dados locais alta velocidade como utilizar arraste selecione arquivo formato de entrada saída excel xlsx xls csv parquet duckdb converter pasta pessoal download',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Permite converter formatos de bases de dados locais com alta velocidade.
          </p>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 mt-2 space-y-3">
            <h4 className="font-bold text-slate-800">Como Utilizar:</h4>
            <ol className="list-decimal pl-4 text-xs text-slate-500 space-y-1.5">
              <li>Arraste ou selecione o arquivo local da sua máquina.</li>
              <li>Escolha o formato de entrada e o formato de saída desejado:
                <ul className="list-disc pl-5 mt-1 space-y-0.5 text-slate-400">
                  <li><strong>Excel (<code>.xlsx</code>, <code>.xls</code>)</strong></li>
                  <li><strong>CSV (<code>.csv</code>)</strong></li>
                  <li><strong>Parquet (<code>.parquet</code>)</strong></li>
                  <li><strong>DuckDB (<code>.duckdb</code>)</strong></li>
                </ul>
              </li>
              <li>Clique em <strong>Converter</strong>. O arquivo resultante estará disponível para download imediatamente na sua pasta pessoal.</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: 'history-backups',
      title: 'Histórico e Backups',
      subtitle: 'Logs e recuperação de arquivos',
      icon: History,
      viewLink: 'history',
      viewLinkLabel: 'Ver Histórico',
      description: 'Visualize execuções anteriores de robôs e baixe relatórios antigos gerados pelo sistema.',
      searchText: 'histórico de execuções e backups concluída backup relatório resultante salvo sistema de arquivos auto tools registrado nesta tela lista cronológica qual usuário executou data hora status tarefa concluído cancelado falhou baixar cópia download cópia exata excel planilha gerada no dia apagada pasta de rede compartilhada',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Sempre que uma automação é concluída, um backup do relatório resultante é salvo no sistema de arquivos do Auto Tools e registrado nesta tela.
          </p>
          <div className="space-y-3 mt-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-slate-200/50 text-slate-600 flex-shrink-0 mt-0.5">
                <History size={16} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">Lista Cronológica</h4>
                <p className="text-xs text-slate-500 mt-0.5">Veja qual usuário executou cada automação, a data e hora exata e o status da tarefa (<em>Concluído</em>, <em>Cancelado</em> ou <em>Falhou</em>).</p>
              </div>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/60 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-slate-200/50 text-slate-600 flex-shrink-0 mt-0.5">
                <ArrowLeftRight size={16} />
              </div>
              <div>
                <h4 className="font-bold text-slate-800">Baixar Cópia de Segurança</h4>
                <p className="text-xs text-slate-500 mt-0.5">Clique no botão de download ao lado de qualquer execução concluída para baixar a cópia exata em Excel da planilha gerada no dia correspondente, mesmo que ela tenha sido apagada da pasta de rede compartilhada da empresa.</p>
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'system-settings',
      title: 'Configurações do Sistema',
      subtitle: 'Parametrizações globais',
      icon: Settings,
      viewLink: 'settings',
      viewLinkLabel: 'Abrir Configurações',
      description: 'Como alterar caminhos de rede e conceder acesso remoto a dispositivos móveis.',
      searchText: 'configurações do sistema parametrizações globais caminhos de relatórios configure pastas físicas robôs ler gravar relatórios dashboards rede compartilhada letra de unidade z:\ x:\ acesso remoto e dispositivos celular outro computador rede corporativa ativar acesso remoto solicitações pendente ip tipo dispositivo autorizar revogar acesso',
      content: (
        <div className="space-y-4 text-slate-600 text-sm">
          <p className="leading-relaxed">
            Esta tela é destinada para parametrizações globais do sistema:
          </p>

          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest mt-4 mb-2">Caminhos de Relatórios</h4>
          <p className="text-xs text-slate-500 pl-4 border-l-2 border-slate-300">
            Configure as pastas físicas onde os robôs devem ler/gravar os relatórios de cada um dos dashboards. Você pode alterar a qualquer momento se a pasta de rede compartilhada mudar de letra de unidade (ex: de <code>Z:\</code> para <code>X:\</code>).
          </p>

          <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest mt-4 mb-2">Acesso Remoto e Dispositivos</h4>
          <p className="text-xs text-slate-500 mb-2">
            Se você deseja acessar os dashboards ou as ferramentas do Auto Tools a partir do seu celular ou de outro computador na mesma rede corporativa, utilize este menu:
          </p>
          <ul className="space-y-1.5 text-xs text-slate-500 pl-4 list-disc">
            <li><strong>Ativar Acesso Remoto</strong>: Habilita o servidor a escutar conexões de fora.</li>
            <li><strong>Aprovar Solicitações</strong>: Dispositivos externos que tentarem acessar a aplicação pela primeira vez entrarão em estado de "pendente". Você verá uma lista com o IP e o tipo do dispositivo na tela de configurações. Clique em <strong>Autorizar</strong> para permitir o acesso definitivo.</li>
            <li><strong>Revogar Acesso</strong>: Remova instantaneamente a permissão de qualquer celular ou computador autorizado anteriormente.</li>
          </ul>
        </div>
      )
    }
  ], [setCurrentView]);

  // Filtragem com base na busca
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const cleanQuery = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return sections.filter(sec => {
      const matchTitle = sec.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(cleanQuery);
      const matchDesc = sec.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(cleanQuery);
      const matchSearchText = sec.searchText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(cleanQuery);
      return matchTitle || matchDesc || matchSearchText;
    });
  }, [searchQuery, sections]);

  // Auto-seleciona a primeira aba filtrada se a atual não estiver nos resultados
  React.useEffect(() => {
    if (filteredSections.length > 0) {
      const exists = filteredSections.some(sec => sec.id === activeTab);
      if (!exists) {
        setActiveTab(filteredSections[0].id);
      }
    }
  }, [filteredSections, activeTab]);

  const activeSection = sections.find(sec => sec.id === activeTab) || sections[0];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header da View */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl shadow-sm border border-blue-100/50">
              <BookOpen size={20} />
            </div>
            <h2 className="text-2xl font-black tracking-tight text-slate-800">Manual de Instruções</h2>
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
            Aprenda a utilizar as funcionalidades e telas do Auto Tools
          </p>
        </div>

        {/* Input de Busca */}
        <div className="relative w-full md:w-72">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Pesquisar manual..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200/80 rounded-2xl text-xs font-bold text-slate-700 placeholder-slate-400 shadow-sm focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-all outline-none"
          />
        </div>
      </div>

      {/* Grid Layout Principal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Painel Lateral de Navegação (Tabs) */}
        <div className="lg:col-span-4 bg-white/60 backdrop-blur-xl rounded-[2rem] border border-slate-200/40 p-4 shadow-sm space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 px-3 mb-2">Tópicos do Manual</p>
          {filteredSections.length > 0 ? (
            filteredSections.map(sec => {
              const TabIcon = sec.icon;
              const isActive = sec.id === activeTab;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveTab(sec.id)}
                  className={`w-full flex items-center text-left gap-3 px-3 py-3 rounded-2xl transition-all duration-300 relative ${
                    isActive
                      ? 'text-blue-600 bg-blue-50/40 border-none'
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="manual-active-pill"
                      className="absolute inset-0 bg-blue-50/60 rounded-2xl border border-blue-100/50 z-0"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                  <div className={`p-2 rounded-xl flex-shrink-0 z-10 transition-colors ${
                    isActive ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <TabIcon size={16} />
                  </div>
                  <div className="min-w-0 z-10 flex-1">
                    <p className={`text-xs font-bold truncate transition-colors ${isActive ? 'text-blue-700' : 'text-slate-700'}`}>
                      {sec.title}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{sec.subtitle}</p>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="p-6 text-center">
              <AlertCircle className="mx-auto text-slate-300 mb-2" size={24} />
              <p className="text-xs font-bold text-slate-400">Nenhum tópico encontrado</p>
            </div>
          )}
        </div>

        {/* Painel Principal de Leitura */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25 }}
            >
              <Card className="p-6 sm:p-8 bg-white border border-slate-200/50 shadow-xl rounded-[2.5rem] overflow-hidden relative">
                {/* Efeito sutil de background decorativo */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-blue-100/30 to-indigo-100/30 rounded-bl-full pointer-events-none opacity-40" />

                {/* Título Principal do Conteúdo */}
                <div className="flex items-center gap-3.5 border-b border-slate-100 pb-5 mb-5 relative z-10">
                  <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl shadow-sm border border-blue-100/40">
                    <activeSection.icon size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">{activeSection.title}</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{activeSection.subtitle}</p>
                  </div>
                </div>

                {/* Corpo do Conteúdo */}
                <div className="relative z-10 leading-relaxed">
                  {activeSection.content}
                </div>

                {/* Rodapé da seção (Navegação Rápida) */}
                {activeSection.viewLink && (
                  <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end relative z-10">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setCurrentView(activeSection.viewLink!)}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-200 hover:shadow-blue-300 transition-all uppercase tracking-wider"
                    >
                      {activeSection.viewLinkLabel}
                      <ArrowRight size={14} />
                    </motion.button>
                  </div>
                )}
              </Card>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
