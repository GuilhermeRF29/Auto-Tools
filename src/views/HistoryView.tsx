/**
 * @module HistoryView
 * @description Tela completa de histórico de automações.
 * Exibe todos os registros dos últimos 30 dias com busca, ações de download,
 * reveal na pasta e re-execução.
 */
import { useState, useEffect } from 'react';
import {
  Search, FileSpreadsheet, Activity, AlertCircle, Loader2,
  RotateCcw, Download, Settings, Play, Layers, ChevronRight, FolderOpen,
  Trash2, ArrowLeft, AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';
import Card from '../components/Card';
import Button from '../components/Button';
import Modal from '../components/Modal';
import type { View } from '../types';

const HistoryView = ({ onReRun, onStartAutomation, currentUser, setView }: { 
  onReRun?: (item: any) => void, 
  onStartAutomation?: (payload: any) => Promise<string | null>,
  currentUser?: any,
  setView?: (v: View) => void
}) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteItem, setDeleteItem] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  /** Busca o histórico completo (até 500 registros) do banco. */
  const fetchFullHistory = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      const resp = await fetch(`/api/relatorios-history?limit=500&user_id=${currentUser.id}`);
      const json = await resp.json();
      if (Array.isArray(json)) {
        setData(json);
      } else {
        setData([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFullHistory();
  }, []);

  /** Abre a pasta do arquivo no Windows Explorer. */
  const handleReveal = async (path: string) => {
    try {
      await fetch(`/api/revelar-arquivo?path=${encodeURIComponent(path)}`);
    } catch (e) {
      console.error(e);
    }
  };

  /** Filtra os dados pela busca do usuário (nome da automação ou arquivo). */
  const filtered = data.filter(item => 
    item.nome_automacao.toLowerCase().includes(search.toLowerCase()) ||
    (item.arquivo_nome && item.arquivo_nome.toLowerCase().includes(search.toLowerCase()))
  );
  
  /** Executa a exclusão via API. */
  const handleDelete = async (withFile: boolean) => {
    if (!deleteItem) return;
    setIsDeleting(true);
    try {
      const url = `/api/relatorios-history/${deleteItem.id}?deleteFile=${withFile}&path=${encodeURIComponent(deleteItem.path_backup || '')}`;
      const resp = await fetch(url, { method: 'DELETE' });
      if (resp.ok) {
        setDeleteItem(null);
        fetchFullHistory(); // Recarrega a lista
      }
    } catch (e) {
      console.error("Erro ao excluir:", e);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button 
             onClick={() => setView?.('dashboard')}
             className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-blue-600 hover:border-blue-200 rounded-2xl transition-all shadow-sm"
             title="Voltar ao Dashboard"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight">Histórico Completo</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Todos os registros salvos nos últimos 30 dias</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input 
              type="text" 
              placeholder="Buscar no histórico..." 
              className="pl-10 pr-4 py-2.5 bg-slate-100 border-none rounded-2xl text-sm font-bold text-slate-600 focus:ring-2 focus:ring-blue-500 w-full md:w-64 transition-all"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button variant="secondary" className="px-4 py-2.5 h-10 rounded-2xl" onClick={fetchFullHistory}>
            <RotateCcw size={16} className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </div>

      <Card className="min-h-[500px]">
        <div className="overflow-x-auto custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40 gap-4">
              <Loader2 size={32} className="animate-spin text-blue-600" />
              <p className="text-[10px] font-black uppercase text-slate-400">Carregando Histórico...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40 opacity-40">
              <Layers size={48} className="text-slate-200 mb-4" />
              <p className="text-sm font-bold italic text-slate-400">Nenhum registro encontrado</p>
            </div>
          ) : (
            <table className="w-full text-sm text-left border-separate border-spacing-0">
              <thead className="bg-slate-50 text-slate-400 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100">Automação</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100">Status</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100">Data e Hora</th>
                  <th className="px-6 py-4 font-black uppercase tracking-widest text-[10px] border-b border-slate-100 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((item, i) => (
                  <motion.tr 
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="hover:bg-slate-50/50 transition-all group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all group-hover:scale-110",
                          item.status === 'completed' ? "bg-green-50 text-green-600" : 
                          item.status === 'running' ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
                        )}>
                          {item.status === 'completed' ? <FileSpreadsheet size={18} /> : 
                           item.status === 'running' ? <Activity size={18} /> : <AlertCircle size={18} />}
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 leading-none mb-1">{item.nome_automacao}</p>
                          <p className="text-[10px] text-slate-400 font-medium">#{item.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <span className={cn(
                         "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                         item.status === 'completed' ? "bg-green-100 text-green-700" :
                         item.status === 'running' ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                       )}>
                         {item.status === 'completed' ? 'Concluído' :
                          item.status === 'running' ? 'Em andamento' : 'Falhou'}
                       </span>
                    </td>
                    <td className="px-6 py-4">
                       <div className="flex flex-col">
                          <p className="text-xs font-bold text-slate-600">{new Date(item.data).toLocaleDateString('pt-BR')}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{new Date(item.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                       </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {item.path_backup && (
                            <>
                              <a 
                                href={`/api/download?path=${encodeURIComponent(item.path_backup)}`}
                                download
                                className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                title="Download do Backup"
                              >
                                <Download size={18} />
                              </a>
                              <button 
                                onClick={() => handleReveal(item.path_backup)}
                                className="p-2.5 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                                title="Ver na Pasta"
                              >
                                <FolderOpen size={18} />
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => {
                              // Limpa nomes acumulados
                              const cleanName = item.nome_automacao.split(' (')[0];
                              onStartAutomation?.({
                                name: cleanName,
                                ...item.params,
                                user_id: currentUser?.id
                              });
                            }}
                            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                            title="Executar agora com mesmos filtros"
                          >
                            <Play size={18} />
                          </button>
                          <button 
                            onClick={() => onReRun?.(item)}
                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                            title="Ajustar Filtros e Rodar"
                          >
                            <Settings size={18} />
                          </button>
                          <button 
                            onClick={() => setDeleteItem(item)}
                            className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                            title="Excluir"
                          >
                            <Trash2 size={18} />
                          </button>
                       </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {/* Modal de Confirmação de Exclusão */}
      <Modal
        isOpen={!!deleteItem}
        onClose={() => !isDeleting && setDeleteItem(null)}
        title="Confirmar Exclusão"
        footer={
          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <Button 
               variant="secondary" 
               className="flex-1 rounded-xl"
               onClick={() => setDeleteItem(null)}
               disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button 
               variant="primary" 
               className="flex-1 bg-slate-800 hover:bg-slate-900 rounded-xl text-[10px] font-black uppercase"
               onClick={() => handleDelete(false)}
               loading={isDeleting}
            >
              Apenas Registro
            </Button>
            <Button 
               variant="primary" 
               className="flex-1 bg-red-600 hover:bg-red-700 rounded-xl text-[10px] font-black uppercase"
               onClick={() => handleDelete(true)}
               loading={isDeleting}
            >
              Registro e Arquivo
            </Button>
          </div>
        }
      >
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="text-red-600" size={24} />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800 mb-1">Como deseja excluir este item?</p>
            <p className="text-xs text-slate-500 leading-relaxed">
              Você pode remover apenas a linha do histórico ou apagar também o arquivo original do seu computador para economizar espaço.
            </p>
            {deleteItem?.arquivo_nome && (
              <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Arquivo alvo:</p>
                <p className="text-[11px] font-bold text-slate-700 truncate">{deleteItem.arquivo_nome}</p>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default HistoryView;
