/**
 * @module CommandPalette
 * @description Paleta de comandos inspirada no ⌘K do VS Code.
 * Permite busca global por páginas e relatórios com deep-linking.
 * 
 * Fluxo: Usuário abre com Ctrl+K → digita → seleciona → navega direto
 * para a tela/relatório com destaque visual via PulseHighlight.
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, LayoutDashboard, FileDown, Lock, Calculator,
  FileText, ChevronRight
} from 'lucide-react';
import type { View } from '../types';

const CommandPalette = ({ isOpen, onClose, onSelect, onDeepSelect }: { 
  isOpen: boolean, 
  onClose: () => void, 
  onSelect: (s: View) => void,
  onDeepSelect: (view: View, id: string) => void
}) => {
  const [search, setSearch] = useState('');

  /** Itens de navegação principal (telas). */
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard Principal', icon: <LayoutDashboard size={18} />, shortcut: 'D', category: 'Navegação' },
    { id: 'reports', label: 'Automações e Fluxos', icon: <FileDown size={18} />, shortcut: 'F', category: 'Navegação' },
    { id: 'vault', label: 'Cofre de Segurança', icon: <Lock size={18} />, shortcut: 'C', category: 'Navegação' },
    { id: 'calculator', label: 'Calculadora de PAX', icon: <Calculator size={18} />, shortcut: 'L', category: 'Navegação' },
  ];

  /** Itens de relatórios individuais (deep-link para ReportsView). */
  const reportItems = [
    { id: 'adm_new', label: 'Relatório de Demandas', view: 'reports' as View, category: 'Relatórios' },
    { id: 'ebus_new', label: 'Relatório Revenue', view: 'reports' as View, category: 'Relatórios' },
    { id: 'sr_new', label: 'Relatório BASE RIO X SP', view: 'reports' as View, category: 'Relatórios' },
  ];

  const filteredMenu = menuItems.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));
  const filteredReports = reportItems.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));

  /** Navega para a view, com deep-select se for um relatório específico. */
  const handleSelect = (view: View, id?: string) => {
    if (id && id !== view) {
      onDeepSelect(view, id);
    } else {
      onSelect(view);
    }
    setSearch('');
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[500] bg-slate-950/40 backdrop-blur-md flex items-start justify-center pt-[15vh] p-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -20 }}
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Barra de busca */}
            <div className="p-6 border-b border-slate-50 flex items-center gap-4">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                <Search size={20} />
              </div>
              <input
                autoFocus
                placeholder="Busque por telas, relatórios ou senhas..."
                className="flex-1 bg-transparent outline-none text-base font-bold text-slate-700 placeholder:text-slate-300"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd className="px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-black text-slate-400 tracking-widest leading-none shadow-sm">ESC</kbd>
            </div>

            {/* Resultados */}
            <div className="p-3 max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
              {/* Seção de Navegação */}
              {filteredMenu.length > 0 && (
                <div className="mb-4">
                  <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Páginas</div>
                  {filteredMenu.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.id as View)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-blue-50/50 rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:rotate-6 transition-all shadow-sm">
                          {item.icon}
                        </div>
                        <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">{item.label}</span>
                      </div>
                      <kbd className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-black text-slate-300 tracking-widest group-hover:text-blue-600 group-hover:border-blue-100 transition-colors uppercase">{item.shortcut}</kbd>
                    </button>
                  ))}
                </div>
              )}

              {/* Seção de Relatórios */}
              {filteredReports.length > 0 && (
                <div>
                  <div className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Relatórios & Detalhes</div>
                  {filteredReports.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleSelect(item.view, item.id)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-blue-50/50 rounded-2xl transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-amber-500 group-hover:text-white group-hover:scale-110 transition-all shadow-sm">
                          <FileText size={18} />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">{item.label}</span>
                          <span className="text-[10px] font-medium text-slate-400">Abrir em Automações</span>
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </button>
                  ))}
                </div>
              )}

              {/* Estado vazio */}
              {filteredMenu.length === 0 && filteredReports.length === 0 && (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={24} className="text-slate-200" />
                  </div>
                  <p className="text-sm font-bold text-slate-400 italic">Nenhum resultado para "{search}"</p>
                </div>
              )}
            </div>
            
            {/* Rodapé com atalhos */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-6">
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                 <kbd className="p-1 bg-white border border-slate-200 rounded shadow-sm text-slate-600">Enter</kbd> Selecionar
               </div>
               <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                 <kbd className="p-1 bg-white border border-slate-200 rounded shadow-sm text-slate-600">↑↓</kbd> Navegar
               </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
