/**
 * @module ReportsView
 * @description Tela de automação de relatórios com modal de configuração,
 * fila de processamento com SSE em tempo real, e suporte a re-execução.
 * 
 * Relatórios disponíveis:
 * - Demandas (adm_new) — Selenium scraper
 * - Revenue (ebus_new) — eBus scraper
 * - BASE RIO X SP (sr_new) — Gmail API + Pandas
 */
import { useState, useEffect } from 'react';
import {
  Play, CheckCircle, FileSpreadsheet, Loader2,
  ChevronRight, Clock, X, PlayCircle, Bus,
  Navigation, Download, LayoutDashboard, Search
} from 'lucide-react';
import { cn } from '../utils/cn';
import type { RunningTask } from '../types';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import PulseHighlight from '../components/PulseHighlight';
import CustomDropdown from '../components/CustomDropdown';
import CustomDatePicker from '../components/CustomDatePicker';

const ReportsView = ({ highlightId: hId, reRunData: rrData, onReRunUsed: rrUsed, currentUser }: { highlightId?: string | null, reRunData?: any, onReRunUsed?: () => void, currentUser?: any }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  // Configurações do modal
  const [configAcao, setConfigAcao] = useState('completo');
  const [configBase, setConfigBase] = useState('padrao');
  const [configSaida, setConfigSaida] = useState('padrao');
  const [configPeriodo, setConfigPeriodo] = useState('padrao');
  const [folderPath, setFolderPath] = useState('');
  const [outFolderPath, setOutFolderPath] = useState('');
  const [dataInicial, setDataInicial] = useState<Date | null>(null);
  const [dataFinal, setDataFinal] = useState<Date | null>(null);
  const [defaultDates, setDefaultDates] = useState<{ ini: Date, fim: Date } | null>(null);

  /** Lista de relatórios disponíveis com metadados. */
  const reports = [
    { id: 'adm_new', name: 'Relatório de Demandas', desc: 'Extração e consolidação de demandas e passagens.', time: '~25 min', icon: <FileSpreadsheet size={18} /> },
    { id: 'ebus_new', name: 'Relatório Revenue', desc: 'Processamento de dados do eBus e receitas.', time: '~8 min', icon: <Bus size={18} /> },
    { id: 'sr_new', name: 'Relatório BASE RIO X SP', desc: 'Base consolidada das operações e ocupações.', time: '~6 min', icon: <Navigation size={18} /> },
  ];

  /**
   * Abre o modal de configuração para um relatório específico.
   * Calcula as datas padrão com base no tipo do relatório.
   */
  const handleOpenConfig = (name: string) => {
    setSelectedReport(name);
    setIsModalOpen(true);
    setShowSuccess(false);

    // Lógica de datas padrão por tipo de relatório
    const hoje = new Date();
    let ini = hoje;
    let fim = hoje;

    if (name === 'Relatório de Demandas') {
      ini = new Date(hoje.getFullYear(), 0, 1);
      fim = new Date(hoje.getFullYear(), 11, 31);
    } else if (name === 'Relatório Revenue') {
      ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      fim = new Date(hoje.getFullYear(), hoje.getMonth() + 5, 0);
    }

    setDefaultDates({ ini, fim });
    setDataInicial(ini);
    setDataFinal(fim);

    // Reset de estados de configuração
    setConfigPeriodo('padrao');
    setConfigAcao('completo');
  };

  /**
   * Envia o payload de execução para o backend e inicia a escuta SSE.
   * O backend retorna um jobId que é usado para rastrear o progresso.
   */
  const handleExecute = async () => {
    setIsExecuting(true);
    const repName = selectedReport || 'Relatório Desconhecido';

    const payload = {
      name: selectedReport,
      user_id: currentUser?.id,
      acao: configAcao,
      base: configBase,
      saida: configSaida,
      pasta_personalizada: folderPath,
      pasta_saida: outFolderPath,
      periodo: configPeriodo,
      data_ini: dataInicial?.toISOString() || null,
      data_fim: dataFinal?.toISOString() || null
    };

    try {
      const response = await fetch('/api/run-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const { jobId } = await response.json();

      // Adiciona a tarefa na fila local
      const newTask: RunningTask = { id: jobId, name: repName, progress: 0, status: 'running', startTime: new Date() };
      setRunningTasks(prev => [newTask, ...prev]);

      setShowSuccess(true);
      setIsExecuting(false);

      // Escuta o progresso via Server-Sent Events (SSE)
      const eventSource = new EventSource(`/api/automation-progress/${jobId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        setRunningTasks(prev => prev.map(t => {
          if (t.id === jobId) {
            return {
              ...t,
              progress: data.progress,
              status: data.status,
              message: data.message
            };
          }
          return t;
        }));

        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();

          // Auto-download do arquivo gerado se concluído com sucesso
          if (data.status === 'completed' && data.result) {
            try {
              const resObj = JSON.parse(data.result);
              const path = resObj.arquivo_principal;
              if (path) {
                const link = document.createElement('a');
                link.href = `/api/download?path=${encodeURIComponent(path)}`;
                link.setAttribute('download', '');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            } catch (e) {
              console.error("Erro ao parsear resultado final", e);
            }
          }

          // Auto-remover da fila depois de 10 segundos
          setTimeout(() => {
            setRunningTasks(prev => prev.filter(t => t.id !== jobId));
          }, 10000);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

    } catch (e) {
      console.error("Falha ao iniciar automação", e);
      setIsExecuting(false);
      alert("Erro ao conectar com o servidor.");
    }

    setTimeout(() => {
      setIsModalOpen(false);
      setShowSuccess(false);
    }, 2500);
  };

  /** Cancela uma tarefa em execução via API. */
  const handleCancelTask = async (id: string) => {
    try {
      await fetch(`/api/cancel-automation/${id}`, { method: 'POST' });

      setRunningTasks(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, status: 'cancelled', message: 'Cancelamento solicitado...' };
        }
        return t;
      }));

      setTimeout(() => {
        setRunningTasks(prev => prev.filter(t => t.id !== id));
      }, 5000);
    } catch (e) {
      console.error("Erro ao cancelar tarefa", e);
    }
  };

  // Lógica de re-execução (quando vem do Dashboard ou Histórico via "Play")
  useEffect(() => {
    if (rrData && rrData.reportName && rrUsed) {
      const { reportName, params } = rrData;
      
      handleOpenConfig(reportName);
      
      if (params) {
        if (params.data_ini) setDataInicial(new Date(params.data_ini.split('/').reverse().join('-')));
        if (params.data_fim) setDataFinal(new Date(params.data_fim.split('/').reverse().join('-')));
        if (params.acao) setConfigAcao(params.acao);
        if (params.data_ini || params.data_fim) setConfigPeriodo('custom');
      }

      rrUsed();
    }
  }, [rrData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Automação de Relatórios</h2>
      </div>

      {/* Fila de Processamento (Tarefas em andamento/concluídas) */}
      {runningTasks.length > 0 && (
        <Card className="p-5 border-blue-100 bg-blue-50/50">
          <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Loader2 size={16} className="text-blue-600 animate-spin" />
            Fila de Processamento ({runningTasks.filter(t => t.status === 'running').length})
          </h3>
          <div className="space-y-4">
            {runningTasks.map(task => (
              <div key={task.id} className={`bg-white rounded-2xl p-4 border shadow-sm relative overflow-hidden group transition-all duration-500 
                ${task.status === 'completed' ? 'border-green-100' : (task.status === 'failed' || task.status === 'cancelled') ? 'border-red-100' : 'border-blue-100'}`}>
                {/* Fundo de progresso */}
                <div className="absolute top-0 left-0 bottom-0 bg-slate-50/50 w-full z-0"></div>
                <div
                  className={`absolute top-0 left-0 bottom-0 z-0 transition-all duration-500 ease-out opacity-20
                    ${task.status === 'completed' ? 'bg-green-500' : (task.status === 'failed' || task.status === 'cancelled') ? 'bg-red-500' : 'bg-blue-500'}
                  `}
                  style={{ width: `${task.progress}%` }}
                ></div>

                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl text-white shadow-sm flex-shrink-0 transition-colors
                      ${task.status === 'completed' ? 'bg-green-500 shadow-green-200' :
                        (task.status === 'failed' || task.status === 'cancelled') ? 'bg-red-500 shadow-red-200' : 'bg-blue-600 shadow-blue-200'}`}
                    >
                      {task.status === 'completed' ? <CheckCircle size={16} /> :
                        (task.status === 'failed' || task.status === 'cancelled') ? <X size={16} /> : <Loader2 size={16} className="animate-spin" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-800 text-sm">{task.name}</h4>
                        {task.status === 'completed' && <span className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-0.5 rounded-full uppercase tracking-widest">Concluído</span>}
                        {(task.status === 'failed' || task.status === 'cancelled') && <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-widest">{task.status === 'failed' ? 'Falha' : 'Cancelado'}</span>}
                      </div>
                      <p className="text-[11px] font-bold text-slate-500 uppercase tracking-tight mt-0.5">
                        {task.message || (task.status === 'running' ? `Processando... ${Math.round(task.progress)}%` :
                          task.status === 'completed' ? 'Relatório gerado com sucesso!' : 'Operação interrompida')}
                      </p>
                    </div>
                  </div>

                  {task.status === 'running' && (
                    <button
                      onClick={() => handleCancelTask(task.id)}
                      className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                      title="Cancelar"
                    >
                      <X size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Lista de Relatórios Disponíveis */}
      <div className="flex flex-col gap-4">
        {reports.map((rep) => (
          <PulseHighlight key={rep.id} isHighlighted={hId === rep.id}>
            <Card 
              className={`p-4 sm:p-5 flex flex-col md:flex-row items-center gap-6 transition-all duration-300 border-2 cursor-pointer group 
                ${hId === rep.id 
                  ? 'border-blue-500 shadow-xl shadow-blue-500/10 scale-[1.01] bg-blue-50/20' 
                  : 'border-slate-100 shadow-sm hover:shadow-md hover:border-blue-200'}`}
              onClick={() => handleOpenConfig(rep.name)}
            >
              {/* Ícone e Identificação */}
              <div className="flex items-center gap-5 flex-1 min-w-0">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-all duration-500 group-hover:rotate-6 group-hover:scale-110 
                  ${hId === rep.id ? 'bg-blue-600 text-white shadow-blue-200' : 'bg-blue-50 text-blue-600 shadow-blue-50 group-hover:bg-blue-600 group-hover:text-white'}`}>
                  {rep.icon}
                </div>
                <div className="flex flex-col min-w-0">
                  <h3 className="text-base font-black text-slate-800 tracking-tight uppercase group-hover:text-blue-600 transition-colors truncate">
                    {rep.name}
                  </h3>
                  <p className="text-sm font-medium text-slate-400 mt-1 line-clamp-1 group-hover:text-slate-500 transition-colors">
                    {rep.desc}
                  </p>
                </div>
              </div>

              {/* Informação Técnica Central */}
              <div className="hidden sm:flex items-center gap-8 px-6 border-l border-slate-100">
                <div className="flex flex-col items-start min-w-[100px]">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1.5">Estimativa</span>
                  <div className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">{rep.time}</span>
                  </div>
                </div>
                <div className="flex flex-col items-start min-w-[80px]">
                  <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1.5">Sistema</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    <span className="text-xs font-bold text-slate-600">Online</span>
                  </div>
                </div>
              </div>

              {/* Ação Lateral */}
              <div className="flex items-center gap-4 pl-6 md:border-l border-slate-100">
                <Button 
                  onClick={(e: any) => { e.stopPropagation(); handleOpenConfig(rep.name); }} 
                  variant="secondary" 
                  className="py-2.5 px-6 text-xs font-black uppercase tracking-widest group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all shadow-sm"
                >
                  Configurar <ChevronRight size={14} className="ml-1 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                </Button>
              </div>
            </Card>
          </PulseHighlight>
        ))}
      </div>

      {/* Modal de Configuração do Relatório */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Configurar: ${selectedReport}`}
        footer={!showSuccess && (
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleExecute} className="min-w-[140px] rounded-2xl">
              <Play size={16} className="mr-2" /> Iniciar
            </Button>
          </div>
        )}
      >
        {showSuccess ? (
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-4 animate-in zoom-in duration-300">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
              <PlayCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-slate-800">Tarefa Iniciada!</h3>
            <p className="text-slate-500 text-sm font-medium">Você pode acompanhar o progresso na tela principal.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Período / Cronograma */}
            <div className="space-y-1.5 mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cronograma de Retirada</label>
              <div className="flex items-center gap-1 p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl w-full">
                {[{ id: 'padrao', label: 'Padrão' }, { id: 'modificada', label: 'Modificado' }, { id: 'custom', label: 'Personalizado' }].map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setConfigPeriodo(p.id);
                      if (p.id !== 'custom') setConfigAcao('completo');
                      if (p.id === 'padrao' && defaultDates) {
                        setDataInicial(defaultDates.ini);
                        setDataFinal(defaultDates.fim);
                      } else {
                        setDataInicial(null);
                        setDataFinal(null);
                      }
                    }}
                    className={`flex-1 text-center py-2.5 rounded-xl text-xs font-bold transition-all ${configPeriodo === p.id ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Seletores de data */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
              <CustomDatePicker label="Data Inicial" value={dataInicial} onChange={setDataInicial} disabled={configPeriodo === 'padrao'} />
              <CustomDatePicker label="Data Final" value={dataFinal} onChange={setDataFinal} align="right" disabled={configPeriodo === 'padrao'} />
            </div>

            <div className="grid grid-cols-1 gap-4">
              {/* Ação personalizada */}
              {configPeriodo === 'custom' && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <CustomDropdown
                    label="Ação do Processo"
                    value={configAcao}
                    onChange={setConfigAcao}
                    icon={PlayCircle}
                    options={[
                      { value: 'completo', label: 'Processo completo' },
                      { value: 'download', label: 'Apenas download' },
                      { value: 'download_tratamento', label: 'Download + tratamento' },
                      { value: 'tratamento', label: 'Apenas tratamento' },
                      { value: 'tratamento_envio', label: 'Tratamento + envio' },
                    ]}
                  />
                </div>
              )}

              {/* Base e Saída (apenas para custom e não completo) */}
              {configPeriodo === 'custom' && configAcao !== 'completo' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {configAcao !== 'download' && (
                    <div className="space-y-3">
                      <CustomDropdown
                        label="Base da Automação"
                        value={configBase}
                        onChange={setConfigBase}
                        icon={LayoutDashboard}
                        options={[
                          { value: 'padrao', label: 'Base padrão' },
                          { value: 'sem_base', label: 'Sem base (Pular comparação)' },
                          { value: 'personalizada', label: 'Escolher local (Personalizado)' },
                        ]}
                      />
                      {configBase === 'personalizada' && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                          <input
                            type="text"
                            value={folderPath}
                            onChange={(e) => setFolderPath(e.target.value)}
                            placeholder="C:\\Caminho\\Ate\\a\\Base..."
                            className="flex-1 min-w-0 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const res = await fetch('/api/abrir-explorador-pastas');
                                const data = await res.json();
                                if (data.caminho) setFolderPath(data.caminho);
                              } catch (e) {
                                alert('Servidor py local não rodando ou mockado. Cole o caminho na caixa de texto na web.');
                              }
                            }}
                            className="p-3.5 flex-shrink-0 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-colors"
                            title="Selecionar Pasta"
                          >
                            <Search size={20} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  <div className={`space-y-3 ${configAcao !== 'download' ? 'pt-3 border-t border-slate-100' : ''}`}>
                    <CustomDropdown
                      label="Local de Saída"
                      value={configSaida}
                      onChange={setConfigSaida}
                      icon={Download}
                      options={[
                        { value: 'padrao', label: 'Pasta padrão' },
                        { value: 'personalizada', label: 'Escolher pasta de saída...' },
                      ]}
                    />
                    {configSaida === 'personalizada' && (
                      <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
                        <input
                          type="text"
                          value={outFolderPath}
                          onChange={(e) => setOutFolderPath(e.target.value)}
                          placeholder="C:\\Caminho\\Para\\Saida..."
                          className="flex-1 min-w-0 bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch('/api/abrir-explorador-pastas');
                              const data = await res.json();
                              if (data.caminho) setOutFolderPath(data.caminho);
                            } catch (e) {
                              alert('Servidor py local não rodando. Cole o caminho na caixa de texto.');
                            }
                          }}
                          className="p-3.5 flex-shrink-0 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-colors"
                          title="Selecionar Pasta"
                        >
                          <Search size={20} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ReportsView;
