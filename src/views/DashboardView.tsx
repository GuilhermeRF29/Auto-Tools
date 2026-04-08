/**
 * @module DashboardView
 * @description Tela principal do painel — visão geral com ações rápidas,
 * atividades recentes (relatórios/processos) e status do sistema.
 */
import { useState, useEffect, useMemo } from 'react';
import {
  Play, Download, ShieldCheck, FileSpreadsheet,
  Loader2, ChevronRight, Lock, Fingerprint, Cpu, Sparkles,
  Settings, Activity, Layers, Zap, FolderOpen, BarChart3, TrendingUp, PieChart
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils/cn';
import type { View } from '../types';
import Card from '../components/Card';
import Button from '../components/Button';
import { getWindowsHelloHint, isWindowsHelloAvailable } from '../utils/windowsHello';

const DashboardView = ({ setView, onReRun, onStartAutomation, currentUser, tasksCount, windowsHelloEnabled, serverStatus = 'checking', serverInfo = null }: { 
  setView: (v: View) => void, 
  onReRun?: (item: any) => void, 
  onStartAutomation?: (payload: any) => Promise<string | null>,
  currentUser?: any, 
  tasksCount?: number,
  windowsHelloEnabled?: boolean,
  serverStatus?: 'checking' | 'online' | 'offline',
  serverInfo?: { version?: string; dbStatus?: string; dbMessage?: string } | null,
}) => {
  const [tab, setTab] = useState<'files' | 'history'>('files');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  /** Busca o histórico do banco de dados (sem limite = últimos ~20 registros). */
  const fetchHistory = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/relatorios-history?user_id=${currentUser.id}`);
      const json = await resp.json();
      if (Array.isArray(json)) {
        setData(json);
      } else {
        console.warn("Resposta do histórico não é uma lista:", json);
        setData([]);
      }
    } catch (e) {
      console.error("Erro ao buscar histórico:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [tasksCount]); // Recarrega sempre que o número de tarefas mudas (início/fim)

  /** Abre o Windows Explorer na pasta do arquivo. */
  const handleReveal = async (path: string) => {
    try {
      await fetch(`/api/revelar-arquivo?path=${encodeURIComponent(path)}`);
    } catch (e) {
      console.error("Erro ao revelar arquivo:", e);
    }
  };

  /** Filtra dados conforme a aba ativa (arquivos prontos ou todos os processos). */
  const filteredData = useMemo(() => {
    if (!Array.isArray(data)) return [];
    if (tab === 'files') {
      return data.filter(item => item.path_backup && item.status === 'completed');
    }
    return data;
  }, [data, tab]);

  const windowsHelloHint = getWindowsHelloHint();
  const windowsHelloTokenReady = Boolean(
    windowsHelloHint?.biometricToken
    && windowsHelloHint.userId === currentUser?.id
    && isWindowsHelloAvailable()
  );

  const windowsHelloStatus: 'active' | 'partial' | 'inactive' = windowsHelloEnabled
    ? (windowsHelloTokenReady ? 'active' : 'partial')
    : 'inactive';

  const backendOnline = serverStatus === 'online';
  const databaseOnline = backendOnline && serverInfo?.dbStatus === 'ok';

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
         <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Inicio</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Resumo operacional e acesso a dashboards</p>
         </div>
      </div>

      {/* Dashboards e Apresentacoes */}
      <section>
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3 ml-1">Dashboards e Apresentacoes</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            onClick={() => setView('presentations')}
            className="p-5 hover:border-cyan-300 transition-all bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-900 text-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-white group-hover:text-cyan-100 transition-colors">Revenue Application</h4>
                <p className="text-[10px] text-cyan-100/85 mt-1 font-bold uppercase tracking-tight">Abrir dashboard com filtro de datas e visao completa</p>
              </div>
              <div className="p-3 rounded-2xl transition-all bg-white/15 text-white group-hover:bg-cyan-400 group-hover:text-slate-950 group-hover:scale-110 shadow-sm">
                <BarChart3 size={20} />
              </div>
            </div>
          </Card>

          <Card
            onClick={() => setView('demand')}
            className="p-5 hover:border-emerald-300 transition-all bg-gradient-to-br from-slate-900 via-emerald-900 to-cyan-900 text-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-white group-hover:text-emerald-100 transition-colors">Dashboard de Demanda</h4>
                <p className="text-[10px] text-emerald-100/90 mt-1 font-bold uppercase tracking-tight">Abrir APV por mercado, ADVP e janela D-1 ate D60</p>
              </div>
              <div className="p-3 rounded-2xl transition-all bg-white/15 text-white group-hover:bg-emerald-400 group-hover:text-slate-950 group-hover:scale-110 shadow-sm">
                <TrendingUp size={20} />
              </div>
            </div>
          </Card>

          <Card
            onClick={() => setView('rioShare')}
            className="p-5 hover:border-indigo-300 transition-all bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-white group-hover:text-indigo-100 transition-colors">Dashboard RIO x SP</h4>
                <p className="text-[10px] text-indigo-100/90 mt-1 font-bold uppercase tracking-tight">Share de empresas, pax, viagens e IPV com filtros completos</p>
              </div>
              <div className="p-3 rounded-2xl transition-all bg-white/15 text-white group-hover:bg-indigo-300 group-hover:text-slate-950 group-hover:scale-110 shadow-sm">
                <PieChart size={20} />
              </div>
            </div>
          </Card>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Últimos Relatórios / Processos */}
        <Card className="lg:col-span-2 flex flex-col min-h-[400px]">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/20 backdrop-blur-sm">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className={cn(
                "p-3 rounded-2xl shadow-sm transition-colors duration-500",
                tab === 'files' ? "bg-blue-600 text-white" : "bg-slate-900 text-white"
              )}>
                {tab === 'files' ? <FileSpreadsheet size={18} /> : <Activity size={18} />}
              </div>
              <div>
                <h3 className="font-black text-slate-800 text-sm tracking-tight leading-none mb-1">
                  Atividades Recentes
                </h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">
                  Status de arquivos e execuções
                </p>
              </div>
            </div>
            
            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
              {/* Switch Premium Compacto */}
              <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200/50 shadow-inner">
                 <button
                   onClick={() => setTab('files')}
                   className={cn(
                     "relative px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5",
                     tab === 'files' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
                   )}
                 >
                   <FileSpreadsheet size={12} />
                   Relatórios
                 </button>
                 <button
                   onClick={() => setTab('history')}
                   className={cn(
                     "relative px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-1.5",
                     tab === 'history' ? "bg-white text-blue-600 shadow-sm" : "text-slate-400"
                   )}
                 >
                   <Zap size={12} />
                   Processos
                 </button>
              </div>
            <Button 
              variant="secondary" 
              className="px-4 py-2 h-9 rounded-xl border-slate-200 hover:border-blue-200 hover:text-blue-600 group"
              onClick={() => {
                setView('history');
              }}
            >
              <span className="text-[10px] font-black uppercase tracking-wider">Ver Todos</span>
              <ChevronRight size={14} className="ml-1 group-hover:translate-x-1 transition-transform" />
            </Button>
          </div>
        </div>
          
          <div className="p-0 flex-1 overflow-x-auto custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 gap-3">
                 <Loader2 size={32} className="animate-spin text-blue-500" />
                 <span className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</span>
              </div>
            ) : (!Array.isArray(filteredData) || filteredData.length === 0) ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-slate-400 opacity-60">
                 <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <Layers size={24} className="text-slate-200" />
                 </div>
                 <span className="text-sm font-bold italic">Nenhum registro encontrado</span>
              </div>
            ) : (
              <table className="w-full text-sm text-left border-separate border-spacing-0">
                <thead className="bg-slate-50/50 text-slate-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 sm:px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100">Tarefa / Arquivo</th>
                    <th className="hidden sm:table-cell px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100">Data</th>
                    <th className="px-4 sm:px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredData.slice(0, 6).map((item, i) => (
                    <motion.tr 
                      initial={{ opacity: 0, x: -10 }} 
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={item.id} 
                      className="group hover:bg-slate-50/80 transition-all cursor-default"
                    >
                      <td className="px-4 sm:px-6 py-4 border-b border-slate-50">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-9 h-9 rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform flex-shrink-0",
                            item.status === 'completed' ? "bg-green-50 text-green-600" : 
                            item.status === 'running' ? "bg-blue-50 text-blue-600 animate-pulse ring-2 ring-blue-100" :
                            "bg-red-50 text-red-600"
                          )}>
                            {tab === 'files' ? <FileSpreadsheet size={16} /> : <Zap size={16} />}
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="font-bold text-slate-700 leading-none mb-1 truncate max-w-[140px] sm:max-w-none">
                              {tab === 'files' ? item.arquivo_nome : item.nome_automacao}
                            </span>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                              {item.status === 'running' ? (
                                <span className="text-[10px] text-blue-500 animate-pulse font-bold flex items-center gap-1">
                                  <Loader2 size={10} className="animate-spin" /> Executando...
                                </span>
                              ) : (
                                <>
                                  <span className="text-[9px] sm:text-[10px] text-slate-400 font-medium">
                                    {tab === 'history' && (Object.keys(item.params || {}).length > 2 ? 'Filtros: Custom' : 'Filtros: Padrão')}
                                    {tab === 'files' && 'Pronto para download'}
                                  </span>
                                  {/* Data visível apenas no mobile aqui */}
                                  <span className="sm:hidden text-[9px] text-slate-300 font-bold truncate">
                                    {new Date(item.data).toLocaleDateString('pt-BR')} às {new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="hidden sm:table-cell px-6 py-4 border-b border-slate-50">
                         <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-600">{new Date(item.data).toLocaleDateString('pt-BR')}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                         </div>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right border-b border-slate-50">
                        <div className="flex items-center justify-end gap-1">
                          {tab === 'files' ? (
                            <>
                               <a 
                                 href={`/api/download?path=${encodeURIComponent(item.path_backup)}`}
                                 download
                                 className="p-2 sm:p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                 title="Download"
                               >
                                 <Download size={18} />
                               </a>
                               <button 
                                 onClick={() => handleReveal(item.path_backup)}
                                 className="p-2 sm:p-2.5 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                 title="Abrir Pasta"
                               >
                                 <FolderOpen size={18} />
                               </button>
                            </>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => {
                                  // Limpa o nome para evitar "Nome (Arq) (Arq) (Arq)"
                                  const cleanName = item.nome_automacao.split(' (')[0];
                                  onStartAutomation?.({
                                    name: cleanName,
                                    ...item.params,
                                    user_id: currentUser?.id
                                  });
                                }}
                                className="p-2 sm:p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                title="Executar agora com mesmos filtros"
                              >
                                <Play size={18} />
                              </button>
                              <button 
                                onClick={() => onReRun?.(item)}
                                className="p-2 sm:p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                title="Ajustar Filtros e Rodar"
                              >
                                <Settings size={18} />
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {/* Status do Sistema */}
        <Card className="overflow-hidden border-slate-200 bg-gradient-to-b from-slate-50/90 to-white">
          <div className="relative border-b border-slate-200 px-6 py-5">
            <div className="absolute -right-12 -top-12 h-28 w-28 rounded-full bg-blue-200/30 blur-2xl" />
            <h3 className="relative flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-800">
              <ShieldCheck size={17} className="text-blue-600" />
              Status do Sistema
            </h3>
            <p className="relative mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Segurança, motor e integrações
            </p>
          </div>

          <div className="space-y-3 p-4">
            <div className={cn(
              'group rounded-2xl border p-3 transition-all hover:shadow-sm',
              backendOnline
                ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/40'
                : 'border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100/40'
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'rounded-xl bg-white/80 p-2 shadow-sm',
                  backendOnline ? 'text-emerald-700' : 'text-rose-700'
                )}>
                  <Cpu size={18} />
                </div>
                <div>
                  <p className={cn('text-sm font-black', backendOnline ? 'text-emerald-900' : 'text-rose-900')}>
                    API Backend
                  </p>
                  <p className={cn('text-xs font-semibold', backendOnline ? 'text-emerald-700' : 'text-rose-700')}>
                    {backendOnline ? 'Online e respondendo normalmente' : 'Offline ou sem resposta'}
                  </p>
                </div>
              </div>
            </div>

            <div className={cn(
              'group rounded-2xl border p-3 transition-all hover:shadow-sm',
              databaseOnline
                ? 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/40'
                : 'border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/40'
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'rounded-xl bg-white/80 p-2 shadow-sm',
                  databaseOnline ? 'text-emerald-700' : 'text-amber-700'
                )}>
                  <Layers size={18} />
                </div>
                <div>
                  <p className={cn('text-sm font-black', databaseOnline ? 'text-emerald-900' : 'text-amber-900')}>
                    Banco de Dados
                  </p>
                  <p className={cn('text-xs font-semibold', databaseOnline ? 'text-emerald-700' : 'text-amber-700')}>
                    {databaseOnline
                      ? 'Conexão validada com sucesso'
                      : (serverInfo?.dbMessage || 'Sem conexão validada no momento')}
                  </p>
                </div>
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-3 transition-all hover:shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                    <Lock size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">Cofre de Senhas</p>
                    <p className="text-xs font-semibold text-slate-500">Acesso protegido</p>
                  </div>
                </div>
                <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setView('vault')}>Abrir</Button>
              </div>
            </div>

            <div className={cn(
              'group rounded-2xl border p-3 transition-all hover:shadow-sm',
              windowsHelloStatus === 'active' && 'border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/40',
              windowsHelloStatus === 'partial' && 'border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/40',
              windowsHelloStatus === 'inactive' && 'border-slate-200 bg-white'
            )}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    'rounded-xl p-2',
                    windowsHelloStatus === 'active' && 'bg-white/80 text-emerald-700',
                    windowsHelloStatus === 'partial' && 'bg-white/80 text-amber-700',
                    windowsHelloStatus === 'inactive' && 'bg-slate-100 text-slate-600'
                  )}>
                    <Fingerprint size={18} />
                  </div>
                  <div>
                    <p className={cn(
                      'text-sm font-black',
                      windowsHelloStatus === 'active' && 'text-emerald-900',
                      windowsHelloStatus === 'partial' && 'text-amber-900',
                      windowsHelloStatus === 'inactive' && 'text-slate-900'
                    )}>
                      Biometria (Windows Hello)
                    </p>
                    <p className={cn(
                      'text-xs font-semibold',
                      windowsHelloStatus === 'active' && 'text-emerald-700',
                      windowsHelloStatus === 'partial' && 'text-amber-700',
                      windowsHelloStatus === 'inactive' && 'text-slate-500'
                    )}>
                      {windowsHelloStatus === 'active' && 'Ativa e pronta neste dispositivo.'}
                      {windowsHelloStatus === 'partial' && 'Ativa no sistema, mas o pareamento local precisa ser validado novamente.'}
                      {windowsHelloStatus === 'inactive' && 'Não ativa. Recomendado habilitar em Configurações.'}
                    </p>
                  </div>
                </div>
                {windowsHelloStatus !== 'active' && (
                  <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setView('settings')}>
                    Configurar
                  </Button>
                )}
              </div>
            </div>

            <div className="group rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/40 p-3 transition-all hover:shadow-sm">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-white/80 p-2 text-amber-700 shadow-sm">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-black text-amber-900">Atualização Pendente</p>
                  <p className="text-xs font-semibold text-amber-700">Versão 1.2.4 disponível</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default DashboardView;
