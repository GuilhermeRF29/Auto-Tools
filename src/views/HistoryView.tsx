/**
 * @module HistoryView
 * @description Tela completa de histórico de automações.
 * Exibe todos os registros dos últimos 30 dias com busca, ações de download,
 * reveal na pasta e re-execução.
 */
import { useState, useEffect } from 'react';
import {
  Search, FileSpreadsheet, Activity, AlertCircle, Loader2,
  RotateCcw, Download, Settings, Play, Layers, ChevronRight
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../utils/cn';
import Card from '../components/Card';
import Button from '../components/Button';

const HistoryView = ({ onReRun, currentUser }: { onReRun?: (item: any) => void, currentUser?: any }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Histórico Completo</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Todos os registros salvos nos últimos 30 dias</p>
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
                                <Settings size={18} />
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => onReRun?.(item)}
                            className="p-2.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl transition-all hover:shadow-sm"
                            title="Repetir Automação"
                          >
                            <Play size={18} />
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
    </div>
  );
};

export default HistoryView;
