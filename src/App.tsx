import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Home, FileText, Lock, Settings, Search, User,
  Play, Download, CheckCircle, ShieldCheck, FileSpreadsheet,
  Key, Copy, Trash2, Eye, EyeOff, Plus, X, AlertCircle, Loader2,
  Calendar, ChevronRight, LayoutDashboard, Columns, LogOut,
  ArrowLeft, RotateCcw, Percent, DollarSign, TrendingUp, Bus, ArrowRight,
  Info, TrendingDown, Gauge, PlayCircle, Clock, ChevronDown, Save,
  Repeat, Navigation, Map, Calculator, Menu, Activity, Bell, FileDown, Layers, Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import logoApp from '../logo_app.png';

// --- Utilitários ---
const cn = (...classes: any[]) => classes.filter(Boolean).join(' ');

const BackgroundAnimation = () => (
  <div className="absolute inset-0 overflow-hidden -z-10 bg-[#fafafb]">
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
        opacity: [0.3, 0.5, 0.3],
        x: [0, 20, 0],
        y: [0, -20, 0]
      }}
      transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-200/30 rounded-full blur-[120px]"
    />
    <motion.div
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.2, 0.4, 0.2],
        x: [0, -30, 0],
        y: [0, 30, 0]
      }}
      transition={{ duration: 15, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-200/20 rounded-full blur-[120px]"
    />
    <motion.div
      animate={{
        opacity: [0.1, 0.2, 0.1],
        y: [0, 50, 0]
      }}
      transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      className="absolute top-[20%] right-[5%] w-[30%] h-[30%] bg-indigo-100/40 rounded-full blur-[100px]"
    />
    <style>{`
      * {
        scrollbar-width: thin;
        scrollbar-color: #cbd5e1 transparent;
      }
      .custom-scrollbar::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .custom-scrollbar::-webkit-scrollbar-track {
        background: transparent;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb {
        background: #e2e8f0;
        border-radius: 20px;
        border: 2px solid transparent;
        background-clip: content-box;
      }
      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
        background: #cbd5e1;
        border: 1px solid transparent;
        background-clip: content-box;
      }
      .animate-ticker {
        display: inline-block;
        white-space: nowrap;
        animation: ticker 10s ease-in-out infinite;
        min-width: max-content;
      }
      @keyframes ticker {
        0%, 15% { transform: translateX(0); }
        45%, 55% { transform: translateX(var(--scroll-dist, 0px)); }
        85%, 100% { transform: translateX(0); }
      }
    `}</style>
  </div>
);

// --- Tipos ---
type View = 'dashboard' | 'reports' | 'vault' | 'calculator' | 'settings';
type Proposal = 'A' | 'B';

// --- Componentes Genéricos ---
const Card = ({ children, className = '', onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <motion.div
    whileHover={onClick ? { y: -4, scale: 1.01, transition: { duration: 0.2 } } : {}}
    whileTap={onClick ? { scale: 0.98 } : {}}
    onClick={onClick}
    className={cn(
      "bg-white border border-slate-200 rounded-[2rem] shadow-sm transition-all overflow-hidden",
      onClick && "cursor-pointer hover:shadow-xl hover:border-blue-200",
      className
    )}
  >
    {children}
  </motion.div>
);

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, type = "button" }: any) => {
  const baseStyle = "inline-flex items-center justify-center px-6 py-3 text-sm font-black transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-lg shadow-blue-500/20 hover:shadow-blue-500/40",
    secondary: "bg-white text-slate-700 border-2 border-slate-100 hover:bg-slate-50 hover:border-slate-200 focus:ring-slate-500 shadow-sm",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-lg shadow-red-500/20",
    ghost: "bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800"
  };
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyle, (variants as any)[variant], className)}
    >
      {children}
    </motion.button>
  );
};

const Modal = ({ isOpen, onClose, title, children, footer }: any) => {
  if (!isOpen) return null;
  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg flex flex-col relative border border-slate-200 overflow-visible my-auto"
        >
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-white rounded-t-[2rem]">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">{title}</h3>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
              <X size={20} />
            </button>
          </div>
          <div className="px-6 py-4 overflow-visible relative">
            <div className="overflow-visible">
              {children}
            </div>
          </div>
          {footer && (
            <div className="px-6 py-4 border-t border-slate-100 bg-white rounded-b-[2rem] shrink-0">
              {footer}
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const CommandPalette = ({ isOpen, onClose, onSelect }: { isOpen: boolean, onClose: () => void, onSelect: (s: View) => void }) => {
  const [search, setSearch] = useState('');

  const items = [
    { id: 'dashboard', label: 'Dashboard Principal', icon: <LayoutDashboard size={18} />, shortcut: 'D' },
    { id: 'reports', label: 'Automações e Fluxos', icon: <FileDown size={18} />, shortcut: 'F' },
    { id: 'vault', label: 'Cofre de Segurança', icon: <Lock size={18} />, shortcut: 'C' },
    { id: 'calculator', label: 'Calculadora de PAX', icon: <Calculator size={18} />, shortcut: 'L' },
  ];

  const filtered = items.filter(i => i.label.toLowerCase().includes(search.toLowerCase()));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[300] bg-slate-950/40 backdrop-blur-md flex items-start justify-center pt-[15vh] p-6 px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -20 }}
            className="bg-white rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden border border-slate-100"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-5 border-b border-slate-50 flex items-center gap-4">
              <Search className="text-blue-500" size={20} />
              <input
                autoFocus
                placeholder="Para onde você quer ir agora?"
                className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-700 placeholder:text-slate-300"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <div className="px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-black text-slate-400 tracking-widest leading-none">ESC</div>
            </div>
            <div className="p-2 max-h-80 overflow-y-auto">
              {filtered.length > 0 ? filtered.map(item => (
                <button
                  key={item.id}
                  onClick={() => { onSelect(item.id as View); onClose(); }}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-50/50 rounded-2xl transition-all group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:rotate-6 transition-all">
                      {item.icon}
                    </div>
                    <span className="text-sm font-bold text-slate-600 group-hover:text-slate-900">{item.label}</span>
                  </div>
                  <div className="px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[10px] font-black text-slate-300 tracking-widest group-hover:text-blue-600 group-hover:border-blue-100 transition-colors uppercase">{item.shortcut}</div>
                </button>
              )) : (
                <div className="p-8 text-center text-slate-400 font-medium italic text-sm">Nenhum resultado encontrado...</div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Telas ---

const DashboardView = ({ setView }: { setView: (v: View) => void }) => {
  const [isRunning, setIsRunning] = useState(false);

  const handleQuickRun = async () => {
    setIsRunning(true);
    try {
      await fetch('/api/run-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Relatório de Vendas' })
      });
      setIsRunning(false);
    } catch (error) {
      console.error(error);
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>

      {/* Ações Rápidas */}
      <section>
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Ações Rápidas</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card
            onClick={handleQuickRun}
            className="p-5 hover:border-blue-300 transition-all bg-gradient-to-br from-white to-slate-50/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-slate-800 group-hover:text-blue-600 transition-colors">Relatório de Vendas</h4>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-tight">Baixar últimos 7 dias</p>
              </div>
              <div className={cn(
                "p-3 rounded-2xl transition-all",
                isRunning ? 'bg-blue-100 text-blue-600' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110 shadow-sm'
              )}>
                {isRunning ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              </div>
            </div>
          </Card>

          <Card
            onClick={() => setView('calculator')}
            className="p-5 hover:border-blue-300 transition-all bg-gradient-to-br from-white to-slate-50/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-slate-800 group-hover:text-blue-600 transition-colors">Nova Cotação</h4>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-tight">Calculadora de passagens</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110 transition-all shadow-sm">
                <Calculator size={20} />
              </div>
            </div>
          </Card>

          <Card
            onClick={() => setView('vault')}
            className="p-5 hover:border-blue-300 transition-all bg-gradient-to-br from-white to-slate-50/50"
          >
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-black text-slate-800 group-hover:text-blue-600 transition-colors">Acessar Cofre</h4>
                <p className="text-[10px] text-slate-500 mt-1 font-bold uppercase tracking-tight">Gerenciar credenciais</p>
              </div>
              <div className="p-3 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white group-hover:scale-110 transition-all shadow-sm">
                <Key size={20} />
              </div>
            </div>
          </Card>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Últimos Relatórios */}
        <Card className="lg:col-span-2 flex flex-col">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-lg">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-slate-500" />
              Últimos Relatórios Baixados
            </h3>
            <button onClick={() => setView('reports')} className="text-sm text-blue-600 hover:text-blue-800 font-medium">Ver todos</button>
          </div>
          <div className="p-0 flex-1 overflow-x-auto">
            <table className="w-full text-sm text-left min-w-[500px]">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-medium">Arquivo</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { name: 'Rel_Vendas_Marzo.xlsx', date: 'Hoje, 10:45' },
                  { name: 'Fechamento_Fev.csv', date: 'Ontem, 18:20' },
                  { name: 'Taxas_Emissao_Q1.xlsx', date: '22 Mar, 09:15' },
                ].map((file, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-700 flex items-center gap-2">
                      <FileText size={16} className="text-slate-400" />
                      {file.name}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{file.date}</td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-slate-400 hover:text-blue-600 transition-colors" title="Abrir pasta">
                        <Download size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Status do Sistema */}
        <Card>
          <div className="p-4 border-b border-slate-200 bg-slate-50 rounded-t-lg">
            <h3 className="font-semibold text-slate-800 flex items-center gap-2">
              <ShieldCheck size={18} className="text-slate-500" />
              Status do Sistema
            </h3>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between p-3 bg-green-50 border border-green-100 rounded-md">
              <div className="flex items-center gap-3">
                <CheckCircle size={20} className="text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Selenium WebDriver</p>
                  <p className="text-xs text-green-700">Pronto para execução</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div className="flex items-center gap-3">
                <Lock size={20} className="text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Cofre de Senhas</p>
                  <p className="text-xs text-slate-500">Bloqueado</p>
                </div>
              </div>
              <Button variant="ghost" className="text-xs px-2 py-1" onClick={() => setView('vault')}>Desbloquear</Button>
            </div>

            <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
              <div className="flex items-center gap-3">
                <AlertCircle size={20} className="text-amber-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Atualização Pendente</p>
                  <p className="text-xs text-slate-500">Versão 1.2.4 disponível</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

interface RunningTask {
  id: string;
  name: string;
  progress: number;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  message?: string;
}

const CustomDropdown = ({ label, value, options, onChange, icon: Icon }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // UseLayoutEffect para calcular a posição ANTES da pintura na tela e evitar piscadas
  React.useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 250);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o: any) => o.value === value) || options[0];

  return (
    <div className="space-y-1.5 overflow-visible relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
        >
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Icon size={16} />
              </div>
            )}
            <span className="truncate">{selectedOption?.label || value}</span>
          </div>
          <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 shrink-0 ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
        </button>

        {isOpen && (
          <div className={`absolute left-0 right-0 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[500] max-h-56 overflow-y-auto animate-in duration-300 ${dropUp ? 'bottom-full mb-2 slide-in-from-bottom-2 origin-bottom' : 'top-full mt-2 slide-in-from-top-2 origin-top'}`}>
            <div className="grid grid-cols-1 gap-1">
              {options.map((opt: any) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 transition-all ${value === opt.value ? 'bg-blue-50 text-blue-700 font-bold' : 'hover:bg-slate-50 text-slate-600 font-medium'}`}
                >
                  <span className="text-sm truncate">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const CustomDatePicker = ({ label, value, onChange, align = 'left', disabled = false }: any) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? new Date(value) : new Date());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropUp, setDropUp] = useState(false);

  // Atualiza a visualização interna quando o valor externo muda
  useEffect(() => {
    if (value) setCurrentDate(new Date(value));
  }, [value]);

  React.useLayoutEffect(() => {
    if (isOpen && dropdownRef.current) {
      const rect = dropdownRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 380);
    }
  }, [isOpen]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const handlePrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const handlePrevYear = () => setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
  const handleNextYear = () => setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const blanks = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const weekDays = ["D", "S", "T", "Q", "Q", "S", "S"];

  const isSelected = (day: number) => value &&
    value.getDate() === day &&
    value.getMonth() === currentDate.getMonth() &&
    value.getFullYear() === currentDate.getFullYear();

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day &&
      today.getMonth() === currentDate.getMonth() &&
      today.getFullYear() === currentDate.getFullYear();
  };

  const formattedDate = value ? `${value.getDate().toString().padStart(2, '0')}/${(value.getMonth() + 1).toString().padStart(2, '0')}/${value.getFullYear()}` : "Selecionar data";

  return (
    <div className="space-y-1.5 overflow-visible relative">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{label}</label>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          className={`w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-bold text-slate-700 flex items-center justify-between shadow-sm outline-none transition-all ${disabled ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'hover:border-slate-300 focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10'}`}
        >
          <Calendar size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
          <span className={value ? "text-slate-700" : "text-slate-400"}>{formattedDate}</span>
        </button>

        {isOpen && (
          <div className={`absolute bg-white border-2 border-slate-100 rounded-3xl shadow-2xl p-4 z-[500] min-w-[280px] sm:min-w-[320px] animate-in duration-200 ${dropUp ? 'bottom-full mb-2 slide-in-from-bottom-95 origin-bottom' : 'top-full mt-2 slide-in-from-top-95 origin-top'} ${align === 'right' ? 'right-0' : 'left-0'}`}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button type="button" onClick={handlePrevYear} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all flex -space-x-2"><ChevronRight size={16} className="rotate-180" /><ChevronRight size={16} className="rotate-180" /></button>
              <button type="button" onClick={handlePrevMonth} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all"><ChevronRight size={16} className="rotate-180" /></button>
              <div className="font-bold text-[13px] sm:text-sm text-slate-800 tracking-tight text-center flex-1">
                {monthNames[currentDate.getMonth()]} <span className="text-slate-400">{currentDate.getFullYear()}</span>
              </div>
              <button type="button" onClick={handleNextMonth} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all"><ChevronRight size={16} /></button>
              <button type="button" onClick={handleNextYear} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg hover:text-slate-700 transition-all flex -space-x-2"><ChevronRight size={16} /><ChevronRight size={16} /></button>
            </div>

            {/* Week Days */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((d, i) => (
                <div key={i} className="text-[10px] font-black text-slate-400 text-center">{d}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {blanks.map(b => <div key={`blank-${b}`} className="w-8 h-8"></div>)}
              {days.map(day => {
                const selected = isSelected(day);
                const today = isToday(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      onChange(new Date(currentDate.getFullYear(), currentDate.getMonth(), day));
                      setIsOpen(false);
                    }}
                    className={`
                      w-8 h-8 flex items-center justify-center text-[11px] sm:text-xs font-bold rounded-full transition-all mx-auto
                      ${selected ? 'bg-blue-600 text-white shadow-md shadow-blue-200 scale-110' :
                        today ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-slate-600 hover:bg-slate-100'}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ReportsView = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  const [configAcao, setConfigAcao] = useState('completo');
  const [configBase, setConfigBase] = useState('padrao');
  const [configSaida, setConfigSaida] = useState('padrao');
  const [configPeriodo, setConfigPeriodo] = useState('padrao');
  const [folderPath, setFolderPath] = useState('');
  const [outFolderPath, setOutFolderPath] = useState('');
  const [dataInicial, setDataInicial] = useState<Date | null>(null);
  const [dataFinal, setDataFinal] = useState<Date | null>(null);
  const [defaultDates, setDefaultDates] = useState<{ ini: Date, fim: Date } | null>(null);

  const reports = [
    { id: 'adm_new', name: 'Relatório de Demandas', desc: 'Extração e consolidação de demandas e passagens.', time: '~25 min', icon: <FileSpreadsheet size={18} /> },
    { id: 'ebus_new', name: 'Relatório Revenue', desc: 'Processamento de dados do eBus e receitas.', time: '~8 min', icon: <Bus size={18} /> },
    { id: 'sr_new', name: 'Relatório BASE RIO X SP', desc: 'Base consolidada das operações e ocupações.', time: '~6 min', icon: <Navigation size={18} /> },
  ];

  const handleOpenConfig = (name: string) => {
    setSelectedReport(name);
    setIsModalOpen(true);
    setShowSuccess(false);

    // Lógica de Datas Padrão conforme o Relatório (Baseado no Backend)
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


  const handleExecute = async () => {
    setIsExecuting(true);
    const repName = selectedReport || 'Relatório Desconhecido';

    const payload = {
      name: selectedReport,
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

      // Inicia a tarefa no frontend
      const newTask: RunningTask = { id: jobId, name: repName, progress: 0, status: 'running', startTime: new Date() };
      setRunningTasks(prev => [newTask, ...prev]);

      setShowSuccess(true);
      setIsExecuting(false);

      // Escuta o progresso via SSE
      const eventSource = new EventSource(`/api/automation-progress/${jobId}`);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);

        setRunningTasks(prev => prev.map(t => {
          if (t.id === jobId) {
            const updated = {
              ...t,
              progress: data.progress,
              status: data.status,
              // Armazenar a mensagem (que está no 'data') em uma propriedade extra ou abusar do status
              message: data.message
            };
            return updated;
          }
          return t;
        }));

        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();


          if (data.status === 'completed' && data.result) {
            try {
              const resObj = JSON.parse(data.result);
              const path = resObj.arquivo_principal;
              if (path) {
                // Trigger download via hidden link
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


          // Auto-remover depois de 10 segundos se concluído
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


  const handleCancelTask = async (id: string) => {
    try {
      await fetch(`/api/cancel-automation/${id}`, { method: 'POST' });

      setRunningTasks(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, status: 'cancelled', message: 'Cancelamento solicitado...' };
        }
        return t;
      }));

      // Auto-remover também se cancelado manualmente
      setTimeout(() => {
        setRunningTasks(prev => prev.filter(t => t.id !== id));
      }, 5000);
    } catch (e) {
      console.error("Erro ao cancelar tarefa", e);
    }
  };


  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-slate-800">Automação de Relatórios</h2>
      </div>

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


      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[700px]">
            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4 font-bold">Nome da Rotina</th>
                <th className="px-6 py-4 font-bold">Descrição</th>
                <th className="px-6 py-4 font-bold">Tempo Est.</th>
                <th className="px-6 py-4 font-bold text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {reports.map((rep) => (
                <tr key={rep.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-5 font-bold text-slate-800 flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl transition-transform group-hover:scale-110">
                      {rep.icon}
                    </div>
                    {rep.name}
                  </td>
                  <td className="px-6 py-5 text-slate-500 font-medium">{rep.desc}</td>
                  <td className="px-6 py-5 text-slate-500 font-bold">{rep.time}</td>
                  <td className="px-6 py-5 text-right">
                    <Button onClick={() => handleOpenConfig(rep.name)} variant="secondary" className="shadow-sm rounded-xl py-2 px-4 text-xs font-bold whitespace-nowrap">
                      Configurar <ChevronRight size={14} className="ml-1" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

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
            <div className="space-y-1.5 mb-1">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Cronograma de Retirada</label>
              <div className="flex items-center gap-1 p-1 bg-slate-50 border-2 border-slate-100 rounded-2xl w-full">
                {[{ id: 'padrao', label: 'Padrão' }, { id: 'modificada', label: 'Modificado' }, { id: 'custom', label: 'Personalizado' }].map(p => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setConfigPeriodo(p.id);
                      if (p.id !== 'custom') setConfigAcao('completo');

                      // Nova Lógica: Se for padrão, volta para as datas automáticas. Caso contrário, limpa para escolha.
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

            {/* Inputs de Data - Calendário Premium */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
              <CustomDatePicker label="Data Inicial" value={dataInicial} onChange={setDataInicial} disabled={configPeriodo === 'padrao'} />
              <CustomDatePicker label="Data Final" value={dataFinal} onChange={setDataFinal} align="right" disabled={configPeriodo === 'padrao'} />
            </div>

            <div className="grid grid-cols-1 gap-4">
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

              {/* 4. Base da Automação e Local de Saída (Apenas para custom e não completo) */}
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

const PREDEFINED_SITES = [
  { name: 'EBUS', host: 'connext.controlesoftware.com.br', url: 'http://10.61.65.84/auth/login' },
  { name: 'ADM de Vendas', host: 'adm.autobots.com.br', url: 'http://ttadm01.jcatlm.com.br:8080/ventaboletosadm/index.zul;jsessionid=xFIW8nh_t8n9-74topChhriraeW-2Y5y-MKUCIG3.gcp-pd-ttadm-01' },
];

const VaultView = ({ currentUser }: { currentUser: any }) => {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isLocking, setIsLocking] = useState(false);
  const [password, setPassword] = useState('');
  const [credentials, setCredentials] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState<number | null | string>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newCred, setNewCred] = useState({ site: '', user: '', pass: '', customSite: '', customName: '' });
  const [isSiteDropdownOpen, setIsSiteDropdownOpen] = useState(false);
  const siteDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (siteDropdownRef.current && !siteDropdownRef.current.contains(event.target as Node)) {
        setIsSiteDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchCredentials = async () => {
    try {
      const response = await fetch(`/api/credentials/${currentUser.id}`);
      const data = await response.json();
      if (Array.isArray(data)) {
        setCredentials(data);
      } else {
        console.error("Erro: Retorno do servidor não é um array", data);
        setCredentials([]);
      }
    } catch (error) {
      console.error("Erro ao buscar credenciais:", error);
      setCredentials([]);
    }
  };

  useEffect(() => {
    if (isUnlocked) fetchCredentials();
  }, [isUnlocked]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: currentUser.usuario, senha: password })
      });
      const data = await response.json();
      if (data.success) {
        setIsUnlocking(true);
        setTimeout(() => {
          setIsUnlocked(true);
          setIsUnlocking(false);
        }, 800);
      } else {
        alert('Senha incorreta.');
      }
    } catch (error) {
      alert('Erro ao validar senha.');
    }
  };

  const handleLock = () => {
    setIsLocking(true);
    setTimeout(() => {
      setIsUnlocked(false);
      setIsLocking(false);
      setPassword('');
      setShowPassword(null);
    }, 600);
  };

  const handleAddCred = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCred.site) { alert('Selecione o destino'); return; }

    const isCustom = newCred.site === 'SITE PRÓPRIO';
    // Se for personalizado, usa customName como 'site' e customSite como 'url'
    const siteDisplayName = isCustom ? (newCred.customName || newCred.customSite) : newCred.site;
    const siteUrl = isCustom ? newCred.customSite : '';

    try {
      await fetch('/api/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUser.id,
          servico: siteDisplayName,
          login: newCred.user,
          senha: newCred.pass,
          eh_personalizado: isCustom,
          url: siteUrl
        })
      });
      setIsAdding(false);
      setNewCred({ site: '', user: '', pass: '', customSite: '', customName: '' });
      fetchCredentials();
    } catch (error) {
      alert('Erro ao salvar');
    }
  };

  const handleDelete = async (id: number, type: string) => {
    if (confirm('Excluir esta credencial?')) {
      await fetch(`/api/credentials/${id}?type=${type}`, { method: 'DELETE' });
      fetchCredentials();
    }
  };

  const openSite = (cred: any) => {
    if (cred.type === 'system') {
      const predefined = PREDEFINED_SITES.find(s => s.name === cred.site);
      if (predefined) window.open(predefined.url, '_blank');
    } else {
      const url = cred.url_custom || cred.site;
      if (url.includes('.') || url.includes('http')) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        window.open(fullUrl, '_blank');
      }
    }
  };

  return (
    <AnimatePresence mode="wait">
      {!isUnlocked ? (
        <motion.div
          key="locked"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.05, filter: 'blur(20px)' }}
          transition={{ duration: 0.5 }}
          className="h-[60vh] flex items-center justify-center p-4"
        >
          <Card className={cn(
            "w-full max-w-md p-10 text-center relative",
            isUnlocking && "pointer-events-none"
          )}>
            <div className="relative w-20 h-20 mx-auto mb-6">
              <div className={`absolute inset-0 bg-slate-100 rounded-full flex items-center justify-center transition-all duration-500 ${isUnlocking ? 'scale-150 opacity-0' : 'scale-100 opacity-100'}`}>
                <Lock size={32} className="text-slate-400" />
              </div>
              {isUnlocking && (
                <div className="absolute inset-0 bg-green-100 rounded-full flex items-center justify-center animate-in zoom-in duration-300">
                  <ShieldCheck size={32} className="text-green-600" />
                </div>
              )}
            </div>

            <div className={`${isUnlocking ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'} transition-all duration-500 delay-100`}>
              <h2 className="text-2xl font-black text-slate-800 mb-2">Cofre de Senhas</h2>
              <p className="text-slate-500 mb-8 text-xs font-medium">Insira sua chave mestre para acessar as credenciais.</p>

              <form onSubmit={handleUnlock} className="space-y-6">
                <div className="relative group">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors">
                    <Key size={18} />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="PALAVRA-CHAVE MESTRE"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-12 pr-4 py-4 text-center text-sm font-bold tracking-[0.2em] focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none uppercase placeholder:text-slate-300 placeholder:tracking-normal placeholder:font-medium"
                    autoFocus
                  />
                </div>
                <Button type="submit" className="w-full py-4 text-xs font-black uppercase tracking-widest bg-slate-900 hover:bg-black shadow-xl shadow-slate-200 rounded-2xl transition-all active:scale-95">
                  DESBLOQUEAR COFRE
                </Button>
              </form>
            </div>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          key="unlocked"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.5 }}
          className="space-y-8 pb-20"
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-slate-100 rounded-xl text-slate-500">
                  <Lock size={20} />
                </div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight text-xl">Cofre de Segurança</h2>
              </div>
              <p className="text-slate-500 text-[11px] font-bold ml-12 uppercase tracking-tighter opacity-70">Total de {Array.isArray(credentials) ? credentials.length : 0} credenciais ativas</p>
            </div>
            <div className="flex gap-4">
              <button
                onClick={handleLock}
                className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-white border-2 border-slate-100 text-slate-500 font-bold text-xs hover:bg-slate-50 hover:border-slate-200 transition-all active:scale-95"
              >
                <Lock size={16} /> BLOQUEAR
              </button>
              <button
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-blue-600 text-white font-black text-xs hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 active:scale-95"
              >
                <Plus size={18} /> NOVA CREDENCIAL
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <Card className="border-none shadow-none bg-transparent">
              <div className="overflow-hidden bg-white border border-slate-200 rounded-[2rem] shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left min-w-[800px]">
                    <thead>
                      <tr className="bg-slate-50/80 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 font-mono">
                        <th className="px-8 py-5">Identificação / Site</th>
                        <th className="px-8 py-5">Credencial</th>
                        <th className="px-8 py-5">Senha</th>
                        <th className="px-8 py-5 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 text-xs">
                      {!Array.isArray(credentials) || credentials.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-medium italic">
                            Nenhuma credencial cadastrada.
                          </td>
                        </tr>
                      ) : (
                        credentials.map((cred) => (
                          <tr key={`${cred.type}-${cred.id}`} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-5">
                              <div
                                onClick={() => openSite(cred)}
                                className="flex items-center gap-3 cursor-pointer group/site w-fit"
                              >
                                <div className={`p-2.5 rounded-xl ${cred.type === 'system' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'} transition-transform group-hover/site:scale-105`}>
                                  {cred.type === 'system' ? <LayoutDashboard size={20} /> : <Home size={20} />}
                                </div>
                                <div>
                                  <div className="font-bold text-slate-800 text-sm group-hover/site:text-blue-600 transition-all flex items-center gap-1.5">
                                    {cred.site}
                                    <ChevronRight size={12} className="opacity-0 -translate-x-2 group-hover/site:opacity-100 group-hover/site:translate-x-0 transition-all text-blue-400" />
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                                    {cred.type === 'system' ? 'Sistema AutoBot' : (cred.url_custom || 'Site Próprio')}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <div className="font-mono text-xs text-slate-700 font-bold bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                                {cred.user}
                              </div>
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-xs tracking-wider transition-all ${showPassword === `${cred.type}-${cred.id}` ? 'text-blue-700 font-bold' : 'text-slate-400'}`}>
                                  {showPassword === `${cred.type}-${cred.id}` ? cred.pass : '••••••••••••'}
                                </span>
                                <button
                                  onClick={() => setShowPassword(showPassword === `${cred.type}-${cred.id}` ? null : `${cred.type}-${cred.id}`)}
                                  className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
                                >
                                  {showPassword === `${cred.type}-${cred.id}` ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                              </div>
                            </td>
                            <td className="px-8 py-5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(cred.pass);
                                    alert('Senha copiada!');
                                  }}
                                  className="p-2 text-slate-400 hover:text-blue-700 transition-all"
                                  title="Copiar"
                                >
                                  <Copy size={18} />
                                </button>
                                <button
                                  onClick={() => handleDelete(cred.id, cred.type)}
                                  className="p-2 text-slate-400 hover:text-red-600 transition-all"
                                  title="Excluir"
                                >
                                  <Trash2 size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          </div>

          <Modal isOpen={isAdding} onClose={() => setIsAdding(false)} title="Nova Credencial">
            <div className="-mt-6 mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200">
                <ShieldCheck size={20} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-800 tracking-tight">Segurança de Dados</h4>
                <p className="text-[10px] text-slate-500 font-medium">As informações serão criptografadas antes do salvamento.</p>
              </div>
            </div>

            <form onSubmit={handleAddCred} className="space-y-5">
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5 overflow-visible">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Tipo de Acesso</label>
                  <div className="relative" ref={siteDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsSiteDropdownOpen(!isSiteDropdownOpen)}
                      className="w-full bg-white border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-black text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-500/10"
                    >
                      <div className="flex items-center gap-3">
                        {newCred.site ? (
                          <>
                            <div className={`p-1.5 rounded-lg ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-50 text-indigo-600' : 'bg-blue-50 text-blue-600'}`}>
                              {newCred.site === 'SITE PRÓPRIO' ? <Home size={16} /> : <LayoutDashboard size={16} />}
                            </div>
                            <span className="truncate max-w-[200px]">{newCred.site}</span>
                          </>
                        ) : (
                          <span className="text-slate-400 font-bold">Selecione o destino...</span>
                        )}
                      </div>
                      <ChevronDown size={20} className={`text-slate-400 transition-transform duration-300 shrink-0 ${isSiteDropdownOpen ? 'rotate-180 text-blue-600' : ''}`} />
                    </button>

                    {isSiteDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[60] max-h-56 overflow-y-auto animate-in slide-in-from-top-2 duration-300">
                        <div className="grid grid-cols-1 gap-1">
                          {PREDEFINED_SITES.map(s => (
                            <button
                              key={s.name}
                              type="button"
                              onClick={() => {
                                setNewCred({ ...newCred, site: s.name });
                                setIsSiteDropdownOpen(false);
                              }}
                              className={`w-full text-left px-4 py-2 rounded-xl flex items-center gap-3 transition-all ${newCred.site === s.name ? 'bg-blue-50 text-blue-700 font-black' : 'hover:bg-slate-50 text-slate-600'}`}
                            >
                              <div className={`p-1.5 rounded-lg ${newCred.site === s.name ? 'bg-blue-100' : 'bg-slate-100 opacity-70'}`}>
                                <LayoutDashboard size={14} />
                              </div>
                              <span className="font-bold text-[11px] truncate">{s.name} (SISTEMA)</span>
                            </button>
                          ))}
                          <div className="h-[1px] bg-slate-100 my-1 mx-2"></div>
                          <button
                            type="button"
                            onClick={() => {
                              setNewCred({ ...newCred, site: 'SITE PRÓPRIO' });
                              setIsSiteDropdownOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 rounded-xl flex items-center gap-3 transition-all ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-50 text-indigo-700 font-black' : 'hover:bg-indigo-50/50 text-slate-600 font-bold'}`}
                          >
                            <div className={`p-1.5 rounded-lg ${newCred.site === 'SITE PRÓPRIO' ? 'bg-indigo-100' : 'bg-indigo-100/50'}`}>
                              <Home size={14} />
                            </div>
                            <span className="font-bold text-[11px]">PROPRIO / PERSONALIZADO</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {newCred.site === 'SITE PRÓPRIO' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-2 duration-300">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome de Exibição (Opcional)</label>
                      <input
                        type="text"
                        value={newCred.customName}
                        onChange={e => setNewCred({ ...newCred, customName: e.target.value })}
                        placeholder="Ex: Banco do Brasil"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">URL do Site</label>
                      <input
                        required
                        type="text"
                        value={newCred.customSite}
                        onChange={e => setNewCred({ ...newCred, customSite: e.target.value })}
                        placeholder="Ex: bb.com.br"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Usuário / Login</label>
                    <input
                      required
                      type="text"
                      value={newCred.user}
                      onChange={e => setNewCred({ ...newCred, user: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Senha</label>
                    <input
                      required
                      type="text"
                      value={newCred.pass}
                      onChange={e => setNewCred({ ...newCred, pass: e.target.value })}
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-4 py-3.5 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 focus:bg-white transition-all outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-6 py-3 rounded-2xl bg-slate-50 text-slate-500 font-bold text-xs hover:bg-slate-100 transition-all active:scale-95"
                >
                  CANCELAR
                </button>
                <button
                  type="submit"
                  className="px-8 py-3 rounded-2xl bg-slate-900 text-white font-black text-xs hover:bg-black transition-all shadow-lg shadow-slate-200 active:scale-95"
                >
                  SALVAR ACESSO
                </button>
              </div>
            </form>
          </Modal>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Calculadora de Viagens (Pax Calc) ---
const CalculatorView = () => {
  const [isCalculated, setIsCalculated] = useState(false);
  const [calculationResult, setCalculationResult] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calcMode, setCalcMode] = useState<'final' | 'reduction'>('final');
  const [metricMode, setMetricMode] = useState<'value' | 'percent'>('value');
  const [busTypes, setBusTypes] = useState<any[]>([]);
  const [isBusDropdownOpen, setIsBusDropdownOpen] = useState(false);
  const [isSavingBus, setIsSavingBus] = useState(false);
  const [customBusName, setCustomBusName] = useState('');

  const [inputs, setInputs] = useState({
    preco_atual: '',
    preco_input: '',
    pax_atual: '',
    qtd_viagens: '',
    km_rodado: '',
    pedagio: '',
    taxa_embarque: '',
    capacidade: '',
    tipo_onibus: 'SELECIONE O VEÍCULO'
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [scrollDistance, setScrollDistance] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (containerRef.current && spanRef.current) {
        const containerWidth = containerRef.current.clientWidth;
        const textWidth = spanRef.current.scrollWidth;

        if (textWidth > containerWidth) {
          setScrollDistance(textWidth - containerWidth + 24);
        } else {
          setScrollDistance(0);
        }
      }
    }, 100);

    window.addEventListener('resize', () => setScrollDistance(0));
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', () => setScrollDistance(0));
    };
  }, [inputs.tipo_onibus, isCalculated]);

  useEffect(() => {
    fetch('/api/onibus')
      .then(res => res.json())
      .then(data => {
        const mapped = (data || []).map((b: any, idx: number) => ({
          id: idx,
          nome: Array.isArray(b) ? b[0] : (b.nome || ''),
          capacidade: Array.isArray(b) ? b[1] : (b.capacidade || 0)
        }));
        setBusTypes(mapped);
      })
      .catch(() => { });
  }, []);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCalculating(true);

    const p_nv = calcMode === 'reduction'
      ? Number(inputs.preco_atual) - Number(inputs.preco_input)
      : Number(inputs.preco_input);

    try {
      const response = await fetch('/api/calculate-pax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preco_atual: Number(inputs.preco_atual),
          preco_novo: p_nv,
          pax_atual: Number(inputs.pax_atual),
          qtd_viagens: Number(inputs.qtd_viagens),
          capacidade: Number(inputs.capacidade),
          km_rodado: Number(inputs.km_rodado),
          pedagio: Number(inputs.pedagio),
          taxa_embarque: Number(inputs.taxa_embarque)
        })
      });
      const data = await response.json();
      if (data.success) {
        setCalculationResult(data.result);
        setIsCalculated(true);
      } else {
        alert('Erro no cálculo: ' + data.error);
      }
    } catch (error) {
      alert('Erro ao conectar com o servidor de cálculo.');
    } finally {
      setIsCalculating(false);
    }
  };

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const handleBusChange = (name: string, cap?: string) => {
    if (name === 'PERSONALIZADO') {
      setInputs({ ...inputs, tipo_onibus: 'PERSONALIZADO', capacidade: '' });
    } else {
      setInputs({ ...inputs, tipo_onibus: name, capacidade: cap || '' });
    }
    setIsBusDropdownOpen(false);
  };

  const handleSaveBus = async () => {
    if (!customBusName || !inputs.capacidade) return;
    setIsSavingBus(true);
    try {
      const response = await fetch('/api/onibus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: customBusName,
          capacidade: Number(inputs.capacidade)
        })
      });
      const data = await response.json();
      if (data.success) {
        setBusTypes([...busTypes, { id: data.id, nome: customBusName, capacidade: Number(inputs.capacidade) }]);
        setInputs({ ...inputs, tipo_onibus: customBusName });
        setCustomBusName('');
      } else {
        alert('Erro ao salvar veículo personalizado.');
      }
    } catch (e) {
      console.error(e);
      alert('Erro de conexão ao salvar veículo.');
    } finally {
      setIsSavingBus(false);
    }
  };

  const ComplexResultCard = ({ title, current, floor, ceil, isCurrency = true, isInt = false, exceedsCapFloor = false, exceedsCapCeil = false }: any) => {
    const format = (v: any) => {
      if (v === null || v === undefined) return '-';
      if (typeof v === 'string') return v;
      if (isInt) return Math.round(v);
      return isCurrency ? formatBRL(v) : v.toFixed(1);
    };

    const getDiff = (original: number, final: number) => {
      const diff = final - original;
      if (metricMode === 'percent') {
        if (!original) return null;
        const pct = (diff / original) * 100;
        return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`, color: pct >= 0 ? 'text-green-600' : 'text-red-500', trend: pct >= 0 ? '+' : '-' };
      }
      const text = isCurrency ? formatBRL(Math.abs(diff)) : Math.abs(diff).toFixed(isInt ? 0 : 1);
      return { text: `${diff >= 0 ? '▲' : '▼'} ${text}`, color: diff >= 0 ? 'text-green-600' : 'text-red-500', trend: diff >= 0 ? '+' : '-' };
    };

    const diffFloor = current !== undefined ? getDiff(current, floor) : null;
    const diffCeil = current !== undefined ? getDiff(current, ceil) : null;

    return (
      <Card className="p-4 bg-slate-50/50 border-slate-200">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">{title}</h4>
        <div className="flex items-center justify-between gap-2">
          {current !== undefined && (
            <div className="flex-1 text-center">
              <span className="text-[8px] font-bold text-slate-400 block mb-1">ATUAL</span>
              <span className="text-xs font-semibold text-slate-600">{format(current)}</span>
              <div className="h-4"></div>
            </div>
          )}
          {current !== undefined && <div className="w-[1px] h-10 bg-slate-200"></div>}

          <div className="flex-1 text-center">
            <span className="text-[8px] font-bold text-amber-700 block mb-1 uppercase">{floor === ceil ? 'VALOR NOVO' : 'PISO'}</span>
            <span className={`text-base font-bold ${exceedsCapFloor ? 'text-red-600' : (floor === ceil ? 'text-blue-600' : 'text-amber-600')}`}>{format(floor)}</span>
            {diffFloor && <span className={`text-[10px] font-bold block ${diffFloor.color}`}>{diffFloor.text}</span>}
          </div>

          {floor !== ceil && (
            <>
              <div className="w-[1px] h-10 bg-slate-200"></div>
              <div className="flex-1 text-center">
                <span className="text-[8px] font-bold text-sky-700 block mb-1">TETO</span>
                <span className={`text-base font-bold ${exceedsCapCeil ? 'text-red-600' : 'text-sky-600'}`}>{format(ceil)}</span>
                {diffCeil && <span className={`text-[10px] font-bold block ${diffCeil.color}`}>{diffCeil.text}</span>}
              </div>
            </>
          )}
        </div>
      </Card>
    );
  };

  return (
    <AnimatePresence mode="wait">
      {isCalculated && calculationResult ? (
        <motion.div
          key="results"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
          className="space-y-6 pb-20"
        >
          {(() => {
            const res = calculationResult;
            const isFloorInfeasible = res.floor.pax_total > Number(inputs.capacidade);
            const isCeilInfeasible = res.ceil.pax_total > Number(inputs.capacidade);

            return (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <button
                    onClick={() => setIsCalculated(false)}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 transition-colors py-2 px-3 rounded-xl hover:bg-slate-100 font-bold text-xs"
                  >
                    <ArrowLeft size={18} /> <span>VOLTAR PARA AJUSTES</span>
                  </button>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200">
                      <button
                        onClick={() => setMetricMode('value')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${metricMode === 'value' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                      >
                        <DollarSign size={12} className="inline mr-1" /> VALORES
                      </button>
                      <button
                        onClick={() => setMetricMode('percent')}
                        className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all ${metricMode === 'percent' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500'}`}
                      >
                        <Percent size={12} className="inline mr-1" /> PERCENTUAL
                      </button>
                    </div>

                    <button
                      onClick={() => setIsCalculated(false)}
                      className="bg-slate-800 text-white px-3 md:px-4 py-2.5 rounded-2xl text-[10px] font-bold flex items-center gap-2 hover:bg-slate-900 transition-all shadow-lg shadow-slate-900/10"
                    >
                      <RotateCcw size={14} /> <span className="hidden md:inline">REFAZER ANÁLISE</span>
                    </button>
                  </div>
                </div>

                <Card className="p-6 bg-white border-slate-100 shadow-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {[
                      { icon: DollarSign, label: 'Preço Atual', value: formatBRL(Number(inputs.preco_atual)), color: 'text-slate-600' },
                      { icon: PlayCircle, label: calcMode === 'final' ? 'Preço Novo' : 'Redução', value: formatBRL(Number(inputs.preco_input)), color: 'text-blue-600' },
                      { icon: User, label: 'Pax Atual', value: `${inputs.pax_atual} pass.`, color: 'text-slate-600' },
                      { icon: Repeat, label: 'Viagens', value: `${inputs.qtd_viagens} unid.`, color: 'text-slate-600' },
                      { icon: Navigation, label: 'Distância', value: `${inputs.km_rodado} km`, color: 'text-slate-600' },
                      { icon: Map, label: 'Pedágio', value: formatBRL(Number(inputs.pedagio)), color: 'text-slate-600' },
                      { icon: FileSpreadsheet, label: 'Taxa Embarque', value: formatBRL(Number(inputs.taxa_embarque)), color: 'text-slate-600' },
                      { icon: Bus, label: 'Tipo Ônibus', value: inputs.tipo_onibus, color: 'text-indigo-600' },
                      { icon: Gauge, label: 'Capacidade', value: `${inputs.capacidade} pax`, color: 'text-slate-600' },
                      { icon: Calculator, label: 'Modo Calculadora', value: calcMode === 'final' ? 'PREÇO NOVO' : 'VALOR REDUÇÃO', color: 'text-slate-900' }
                    ].map((item, idx) => {
                      const Icon = item.icon;
                      return (
                        <div key={idx} className="flex flex-col items-center justify-center p-4 rounded-3xl bg-slate-50/50 border border-slate-100 hover:bg-white hover:shadow-lg transition-all group border-transparent hover:border-slate-200">
                          <div className="p-2 rounded-xl bg-white shadow-sm mb-3 group-hover:scale-110 transition-transform">
                            <Icon size={20} className={item.color} />
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-center h-4">{item.label}</span>
                          <span className={`text-sm font-black ${item.color} text-center truncate w-full`}>{item.value}</span>
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {(isFloorInfeasible || isCeilInfeasible) && (
                  <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-4 animate-in zoom-in duration-300">
                    <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-red-500/20">
                      <AlertCircle size={20} className="text-white" />
                    </div>
                    <div>
                      <h4 className="text-red-800 font-bold text-sm uppercase">Inviabilidade Técnica</h4>
                      <p className="text-red-700 text-[10px] font-medium leading-tight">O volume de passageiros necessário excede a capacidade física do veículo ({inputs.capacidade} pax).</p>
                    </div>
                  </div>
                )}

                <div className={`border rounded-2xl p-6 flex items-start gap-5 ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-50 border-red-100' : 'bg-indigo-50 border-indigo-100'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-600' : 'bg-indigo-600'}`}>
                    <TrendingUp size={24} className="text-white" />
                  </div>
                  <div>
                    <h3 className={`font-bold mb-1 ${isFloorInfeasible || isCeilInfeasible ? 'text-red-900' : 'text-indigo-900'}`}>CONCLUSÃO ESTRATÉGICA</h3>
                    <p className={`text-sm leading-relaxed ${isFloorInfeasible || isCeilInfeasible ? 'text-red-800/80' : 'text-indigo-800/80'}`}>
                      Redução bruta de <span className="font-bold">{formatBRL(res.reducao_valor)}</span> exige um aumento de volume p/ viagem de
                      <span className={`font-bold px-1.5 ${isFloorInfeasible || isCeilInfeasible ? 'text-red-600' : ''}`}>+{res.pax_extra_floor} a +{res.pax_extra_ceil}</span> passageiros.
                      {isFloorInfeasible || isCeilInfeasible
                        ? <span className="font-black underline ml-1 text-red-700">O ônibus não comporta esse volume.</span>
                        : <span>O ponto de equilíbrio técnico é atingido com <span className="font-bold">{res.pax_extra_vlr}</span> novos pax.</span>
                      }
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                  <ComplexResultCard
                    title="Passageiros Extra Necessários"
                    current={0}
                    floor={res.pax_extra_floor}
                    ceil={res.pax_extra_ceil}
                    isInt
                    isCurrency={false}
                    exceedsCapFloor={isFloorInfeasible}
                    exceedsCapCeil={isCeilInfeasible}
                  />
                  <ComplexResultCard
                    title="Novo Volume Total de Pax"
                    current={Number(inputs.pax_atual)}
                    floor={res.floor.pax_total}
                    ceil={res.ceil.pax_total}
                    isInt
                    isCurrency={false}
                    exceedsCapFloor={isFloorInfeasible}
                    exceedsCapCeil={isCeilInfeasible}
                  />
                  <ComplexResultCard
                    title="Novo Ticket Médio (Bruto)"
                    current={Number(inputs.preco_atual)}
                    floor={res.tarifa_liq_nova + Number(inputs.pedagio) + Number(inputs.taxa_embarque)}
                    ceil={res.tarifa_liq_nova + Number(inputs.pedagio) + Number(inputs.taxa_embarque)}
                  />
                  <ComplexResultCard
                    title="Faturamento Bruto Total"
                    current={res.rec_bruta_atual}
                    floor={res.floor.rec_bruta}
                    ceil={res.ceil.rec_bruta}
                  />
                  <ComplexResultCard
                    title="Rentabilidade (R$ / KM)"
                    current={res.rec_km_atual}
                    floor={res.floor.rec_km}
                    ceil={res.ceil.rec_km}
                  />
                  <ComplexResultCard
                    title="Receita Líquida Total (Profit)"
                    current={res.rec_liq_atual}
                    floor={res.floor.rec_liq}
                    ceil={res.ceil.rec_liq}
                  />
                  <div className="col-span-full space-y-3 mt-10">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Painel Técnico de Monitoramento</h4>
                    <Card className="p-6 sm:p-8 bg-slate-50 border-slate-200 shadow-sm border-t-4 border-t-blue-600">
                      <div className="flex flex-wrap items-center justify-center gap-y-10 gap-x-6 sm:gap-x-12 lg:gap-x-20">
                        
                        {/* Grupo Preço Inverso */}
                        <div className="flex flex-col items-center text-center group min-w-[140px] flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 opacity-70">Preço Calculado</p>
                          <div className="bg-blue-100/50 text-blue-700 px-6 py-3 rounded-2xl font-black text-lg shadow-sm border border-blue-200/50 w-full sm:w-auto">
                             {calcMode === 'final' 
                               ? formatBRL(Number(inputs.preco_atual) - Number(inputs.preco_input))
                               : formatBRL(Number(inputs.preco_atual) - Number(inputs.preco_input))
                             }
                          </div>
                        </div>

                        {/* Grupo Ocupação como Fluxo Realocado */}
                        <div className="flex flex-col items-center gap-5 flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest opacity-60">Curva de Ocupação</p>
                          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                            <div className="bg-slate-100 text-slate-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-slate-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-slate-400 mb-0.5 font-bold tracking-widest uppercase">Atual</span>
                              {res.ocupacao_atual.toFixed(1)}%
                            </div>
                            
                            <ArrowRight size={18} className="text-slate-300 animate-pulse hidden xs:block" />
                            
                            <div className="bg-amber-100/60 text-amber-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-amber-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-amber-500/70 mb-0.5 font-bold tracking-widest uppercase">Piso EQ</span>
                              {res.floor.ocupacao_pico.toFixed(1)}%
                            </div>

                            <ArrowRight size={18} className="text-slate-300 animate-pulse hidden xs:block" />

                            <div className="bg-sky-100/60 text-sky-600 px-4 sm:px-5 py-3 rounded-2xl font-black text-lg border border-sky-200 shadow-sm flex flex-col items-center min-w-[85px]">
                              <span className="text-[7px] text-sky-500/70 mb-0.5 font-bold tracking-widest uppercase">Teto EQ</span>
                              {res.ceil.ocupacao_pico.toFixed(1)}%
                            </div>
                          </div>
                        </div>

                        {/* Status de Viabilidade */}
                        <div className="flex flex-col items-center text-center group min-w-[150px] flex-1 sm:flex-none">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 opacity-70">Conclusão Base</p>
                          <div className={`px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.15em] flex items-center justify-center gap-3 shadow-md border-2 w-full sm:w-auto ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-50 text-red-600 border-red-100 shadow-red-100' : 'bg-green-50 text-green-600 border-green-100 shadow-green-100'}`}>
                            <div className={`w-3 h-3 rounded-full ${isFloorInfeasible || isCeilInfeasible ? 'bg-red-600' : 'bg-green-600'} animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.4)]`}></div>
                            {isFloorInfeasible || isCeilInfeasible ? 'INVIÁVEL' : 'VIÁVEL'}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </div>
                </div>
              </>
            );
          })()}
        </motion.div>
      ) : (
        <motion.div
          key="inputs"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200">
                <Calculator size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cálculo de Viabilidade</h2>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-widest opacity-60">Analise o impacto de redução de tarifas</p>
              </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
              <button
                type="button"
                onClick={() => setCalcMode('final')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${calcMode === 'final' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                PREÇO FINAL
              </button>
              <button
                type="button"
                onClick={() => setCalcMode('reduction')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${calcMode === 'reduction' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                VALOR REDUÇÃO
              </button>
            </div>
          </div>

          <form onSubmit={handleCalculate} className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            <Card className="lg:col-span-3 p-6 sm:p-10 !overflow-visible">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Preço Atual (BRL)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={inputs.preco_atual}
                    onChange={(e) => setInputs({ ...inputs, preco_atual: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                    {calcMode === 'final' ? 'Novo Preço Alvo' : 'Valor da Redução'}
                  </label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={inputs.preco_input}
                    onChange={(e) => setInputs({ ...inputs, preco_input: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none border-blue-100"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Quantidade de passageiros</label>
                  <input
                    required
                    type="number"
                    value={inputs.pax_atual}
                    onChange={(e) => setInputs({ ...inputs, pax_atual: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Quantidade de viagens</label>
                  <input
                    required
                    type="number"
                    value={inputs.qtd_viagens}
                    onChange={(e) => setInputs({ ...inputs, qtd_viagens: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">KM da Viagem</label>
                  <input
                    required
                    type="number"
                    value={inputs.km_rodado}
                    onChange={(e) => setInputs({ ...inputs, km_rodado: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Pedágio (Total)</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={inputs.pedagio}
                    onChange={(e) => setInputs({ ...inputs, pedagio: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Taxa de Embarque</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    value={inputs.taxa_embarque}
                    onChange={(e) => setInputs({ ...inputs, taxa_embarque: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-4 focus:ring-blue-500/10 focus:border-blue-600 focus:bg-white transition-all outline-none"
                    placeholder="0,00"
                  />
                </div>

                <div className="space-y-2 overflow-visible">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Veículo / Capacidade</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setIsBusDropdownOpen(!isBusDropdownOpen)}
                      className="w-full bg-white border-2 border-slate-100 rounded-2xl px-4 py-4 text-xs font-black text-slate-700 flex items-center justify-between hover:border-slate-300 transition-all shadow-sm outline-none"
                    >
                      <span className="truncate mr-2 uppercase">{inputs.tipo_onibus}</span>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${isBusDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {isBusDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-slate-100 rounded-2xl shadow-2xl p-2 z-[100] animate-in slide-in-from-top-2 duration-300 max-h-48 overflow-y-auto">
                        <div className="grid grid-cols-1 gap-1">
                          {busTypes.map(bus => (
                            <button
                              key={bus.id}
                              type="button"
                              onClick={() => handleBusChange(bus.nome, bus.capacidade.toString())}
                              className="w-full text-left px-4 py-3 rounded-xl hover:bg-slate-50 flex items-center justify-between group transition-all"
                            >
                              <span className="font-bold text-xs text-slate-600 group-hover:text-blue-600 uppercase">{bus.nome}</span>
                              <span className="text-[10px] font-black bg-slate-100 px-2 py-1 rounded-lg text-slate-400">{bus.capacidade} PAX</span>
                            </button>
                          ))}
                          <div className="h-[1px] bg-slate-100 my-1 mx-2"></div>
                          <button
                            type="button"
                            onClick={() => handleBusChange('PERSONALIZADO')}
                            className="w-full text-left px-4 py-3 rounded-xl hover:bg-blue-50 flex items-center gap-2 group transition-all"
                          >
                            <Plus size={14} className="text-blue-600" />
                            <span className="font-bold text-xs text-blue-600">CADASTRAR NOVO</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Capacidade do Veículo</label>
                  <input
                    disabled
                    type="number"
                    value={inputs.capacidade}
                    className="w-full bg-slate-100 border-2 border-slate-200 rounded-2xl px-5 py-4 text-sm font-bold text-slate-500 cursor-not-allowed"
                    placeholder="0"
                  />
                </div>

                {inputs.tipo_onibus === 'PERSONALIZADO' && (
                  <div className="space-y-4 animate-in slide-in-from-top-2 duration-300 lg:col-span-2 bg-blue-50/30 p-5 rounded-3xl border border-blue-100 mt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-600 uppercase">Nome do Veículo</label>
                        <input
                          type="text"
                          value={customBusName}
                          onChange={(e) => setCustomBusName(e.target.value)}
                          placeholder="EX: DD 15 METROS"
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-blue-600 uppercase">Capacidade Real</label>
                        <input
                          type="number"
                          value={inputs.capacidade}
                          onChange={(e) => setInputs({ ...inputs, capacidade: e.target.value })}
                          placeholder="EX: 60"
                          className="w-full bg-white border-2 border-slate-100 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <Button onClick={handleSaveBus} disabled={isSavingBus} className="w-full py-3 text-[10px] font-black uppercase tracking-widest">
                      {isSavingBus ? 'SALVANDO...' : 'CADASTRAR E SELECIONAR VEÍCULO'}
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-12 flex items-center gap-4">
                <Button type="submit" disabled={isCalculating} className="flex-1 py-5 text-sm font-black uppercase tracking-widest shadow-2xl shadow-blue-500/20">
                  {isCalculating ? (
                    <><Loader2 size={20} className="animate-spin mr-2" /> CALCULANDO IMPACTO...</>
                  ) : (
                    <><TrendingDown size={20} className="mr-2" /> SIMULAR IMPACTO ESTRATÉGICO</>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => setInputs({ preco_atual: '', preco_input: '', pax_atual: '', qtd_viagens: '', km_rodado: '', pedagio: '', taxa_embarque: '', capacidade: '', tipo_onibus: 'SELECIONE O VEÍCULO' })}
                  className="px-8 py-5 rounded-2xl bg-slate-50 text-slate-400 font-bold hover:bg-slate-100 transition-all border-2 border-transparent hover:border-slate-200"
                >
                  LIMPAR
                </button>
              </div>
            </Card>

            {/* Card Lateral de Ajuda/Dica */}
            <div className="lg:col-span-1 space-y-6">
              <Card className="p-6 bg-slate-900 border-none text-white relative overflow-hidden">
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-blue-500/20 rounded-full blur-3xl"></div>
                <Info className="text-blue-400 mb-4" size={32} />
                <h4 className="text-lg font-bold mb-2">Simulação de Equilíbrio</h4>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Este simulador utiliza o modelo de elasticidade para prever quantos novos passageiros são necessários para compensar uma redução de preço.
                </p>
                <ul className="space-y-3 text-xs text-slate-300">
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Considera custos de pedágio</li>
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Abate taxas de embarque do lucro</li>
                  <li className="flex items-center gap-2"><CheckCircle size={14} className="text-blue-500" /> Calcula rentabilidade por KM</li>
                </ul>
              </Card>

              <Card className="p-6 border-slate-200">
                <h4 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2"><Clock size={16} /> Últimos Parâmetros</h4>
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Modo Ativo</span>
                    <span className="font-bold text-blue-600 uppercase">{calcMode === 'final' ? 'Preço Final' : 'Redução'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Ônibus Ativo</span>
                    <span className="font-bold text-slate-800">{inputs.tipo_onibus}</span>
                  </div>
                </div>
              </Card>
            </div>
          </form>
        </motion.div>
      )}
    </AnimatePresence>
  );
};


export default function App() {
  const [user, setUser] = useState<{ id: number, nome: string } | null>(null);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isRegistering, setIsRegistering] = useState(false);
  const [authData, setAuthData] = useState({ user: '', pass: '', name: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  const [serverInfo, setServerInfo] = useState<{ version?: string } | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentView]);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setServerStatus(data.status === 'ok' ? 'online' : 'offline');
        setServerInfo(data);
      })
      .catch(() => setServerStatus('offline'));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Servidor respondeu com erro ${response.status}. Conteúdo: ${errText.substring(0, 50)}...`);
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const badText = await response.text();
        throw new Error(`O servidor não retornou JSON corretamente. Ele retornou: ${badText.substring(0, 30)}...`);
      }

      const data = await response.json();
      if (data && data.success === true) {
        setUser(data.user);
      } else {
        const msg = data?.error || 'Erro desconhecido ao autenticar.';
        alert(msg + (data?.details ? "\n\nDetalhes:\n" + data.details : ""));
      }
    } catch (error: any) {
      alert('Erro ao conectar com o servidor: ' + (error.message || error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario: authData.user, senha: authData.pass, nome: authData.name })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Falha no registro: Status ${response.status}. Detalhes: ${errText.substring(0, 50)}...`);
      }

      const data = await response.json();
      if (data.success) {
        alert('Usuário criado! Agora faça login.');
        setIsRegistering(false);
      } else {
        alert(data.error + (data.details ? "\n\nDetalhes:\n" + data.details : ""));
      }
    } catch (error: any) {
      alert('Erro ao criar usuário / Conexão falhou: ' + (error.message || error));
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center font-sans p-4 sm:p-10 overflow-y-auto overflow-x-hidden relative bg-slate-50">
        <BackgroundAnimation />
        {/* Usando altura flexível para se adaptar a diferentes telas */}
        <div className="flex w-full max-w-4xl h-auto min-h-[520px] my-auto overflow-hidden rounded-[2rem] shadow-2xl bg-white animate-in zoom-in duration-500 border border-slate-200 relative">

          {/* Lado Esquerdo - Info/Branding */}
          <div className="hidden md:flex w-1/3 bg-slate-900 relative p-8 text-white flex-col justify-between overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-10">
                <div className="w-12 h-12 flex items-center justify-center">
                  <img src={logoApp} alt="AutoBot Logo" className="w-full h-full object-contain filter drop-shadow-lg" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-white">AUTO <span className="text-blue-500">TOOLS</span></h1>
              </div>
              <h2 className="text-2xl font-bold leading-tight mb-4">Automação Inteligente</h2>
              <p className="text-slate-400 text-sm">Acesse sua plataforma segura de relatórios.</p>
            </div>

            <div className="relative z-10 space-y-3">
              <div className="flex items-center gap-2 opacity-80 transition-all">
                {serverStatus === 'online' ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
                )}
                <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                  {serverStatus === 'online' ? 'Banco de Dados: Userbank.db' : 'Banco: Sistema Fora de Linha'}
                </span>
              </div>
              <div className="flex items-center gap-2 opacity-80 transition-all">
                {serverStatus === 'online' ? (
                  <CheckCircle size={14} className="text-green-500" />
                ) : (
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse mx-1.5 shadow-[0_0_8px_rgba(239,44,44,0.5)]"></div>
                )}
                <span className="text-[11px] font-bold text-slate-300 tracking-tight">
                  Servidor: {serverStatus === 'online' ? (serverInfo?.version || 'Rodando (v1.5.0)') : 'Servidor Desconectado'}
                </span>
              </div>
            </div>

            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600/20 rounded-full blur-3xl -mr-16 -mt-16"></div>
          </div>

          {/* Lado Direito - Form (Ajuste de scroll para telas curtas) */}
          <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center overflow-y-auto custom-scrollbar">
            <div className="max-w-xs mx-auto w-full">
              <div className="flex flex-col items-center mb-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-500">
                {/* Badge de Status Mobile */}
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-50 border border-slate-200 mb-6 shadow-sm overflow-hidden">
                  <div className={`w-1.5 h-1.5 rounded-full ${serverStatus === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500 animate-pulse'}`}></div>
                  <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest truncate max-w-[150px]">
                    {serverStatus === 'online' ? 'Infra Ativa: ' + (serverInfo?.version || 'V1.5.0') : 'Offline - Verifique Conexão'}
                  </span>
                </div>

                <div className="w-16 h-16 mb-3">
                  <img src={logoApp} alt="Logo" className="w-full h-full object-contain drop-shadow-sm" />
                </div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">AUTO <span className="text-blue-500">TOOLS</span></h1>
                <div className="relative mt-2">
                  <div className="h-1.5 w-16 bg-blue-600 rounded-full relative z-10"></div>
                  {/* Efeito Glow/Blur que se expande para o branco */}
                  <div className="absolute inset-0 bg-blue-600 blur-xl opacity-40 -top-4 scale-x-150"></div>
                </div>
              </div>

              <h3 className="text-2xl font-bold text-slate-800 mb-1 flex items-center justify-between">
                <span>{isRegistering ? 'Nova Conta' : 'Acessar'}</span>
              </h3>
              <p className="text-slate-500 text-sm mb-6">
                {isRegistering ? 'Preencha os dados abaixo' : 'Insira suas credenciais'}
              </p>

              <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-4">
                {isRegistering && (
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Seu Nome</label>
                    <input
                      required
                      type="text"
                      value={authData.name}
                      onChange={e => setAuthData({ ...authData, name: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                      placeholder="João Silva"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Usuário / ID</label>
                  <input
                    required
                    type="text"
                    value={authData.user}
                    onChange={e => setAuthData({ ...authData, user: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium"
                    placeholder="ex: admin"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 px-1 uppercase tracking-widest opacity-80">Senha</label>
                  <input
                    required
                    type="password"
                    value={authData.pass}
                    onChange={e => setAuthData({ ...authData, pass: e.target.value })}
                    className="w-full border border-slate-200 rounded-lg p-3 text-base outline-none focus:ring-2 focus:ring-blue-500 transition-all bg-slate-50 font-medium font-mono"
                    placeholder="••••••••"
                  />
                </div>

                <Button type="submit" disabled={isLoggingIn} className="w-full py-4 text-sm font-black uppercase tracking-[0.15em] shadow-xl shadow-blue-500/30 mt-4 rounded-2xl hover:scale-[1.02] transition-all duration-300">
                  {isLoggingIn ? (
                    <><Loader2 size={18} className="animate-spin mr-2" /> Carregando...</>
                  ) : (
                    isRegistering ? 'CADASTRAR CONTA' : 'ACESSAR AGORA'
                  )}
                </Button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-800 transition-colors"
                >
                  {isRegistering ? 'Voltar ao Login' : 'Criar nova conta corporativa'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'vault', label: 'Cofre de Senhas', icon: Lock },
    { id: 'calculator', label: 'Calculadora', icon: Calculator },
  ];

  return (
    <div className="flex flex-col h-screen font-sans overflow-hidden">
      <style>{`
        .animate-ticker {
          display: inline-block;
          white-space: nowrap;
          animation: ticker 10s ease-in-out infinite;
          min-width: max-content;
        }
        @keyframes ticker {
          0%, 15% { transform: translateX(0); }
          45%, 55% { transform: translateX(var(--scroll-dist, 0px)); }
          85%, 100% { transform: translateX(0); }
        }
        .mask-fade-right {
          -webkit-mask-image: linear-gradient(to right, black 85%, transparent 100%);
          mask-image: linear-gradient(to right, black 85%, transparent 100%);
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
      <div className="flex-1 flex overflow-hidden relative bg-slate-100">
        {/* Mobile Overlay */}
        {isSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside className={`${isSidebarOpen
          ? 'fixed inset-0 z-[100] w-full translate-x-0'
          : 'absolute inset-y-0 left-0 -translate-x-full md:relative md:translate-x-0'
          } transition-transform duration-300 ease-in-out w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl z-[100] md:z-20`}>

          <div className="h-20 flex items-center justify-between px-6 border-b border-white/5 bg-slate-950/50 backdrop-blur-md">
            <div className="flex items-center">
              <div className="w-10 h-10 flex items-center justify-center mr-3">
                <img src={logoApp} alt="Logo" className="w-full h-full object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-black tracking-tight text-sm uppercase">Auto <span className="text-blue-500">Tools</span></span>
                <span className="text-[10px] font-bold text-slate-500 -mt-1 uppercase tracking-widest">Automation</span>
              </div>
            </div>
            {/* Close button for mobile */}
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="md:hidden p-2 text-slate-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          <nav className="flex-1 py-6 px-3 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id as View)}
                  className={cn(
                    "w-full flex items-center px-4 py-3 rounded-2xl transition-all duration-300 relative group",
                    isActive ? "text-white" : "text-slate-400 hover:text-slate-100"
                  )}
                >
                  <Icon size={18} className={cn("mr-3 transition-colors relative z-10", isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300")} />
                  <span className="font-bold text-xs uppercase tracking-widest relative z-10">{item.label}</span>

                  {isActive && (
                    <motion.div
                      layoutId="sidebar-pill"
                      className="absolute inset-0 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20"
                      transition={{ type: "spring", duration: 0.6, bounce: 0.2 }}
                    />
                  )}
                </button>
              );
            })}
          </nav>

        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shadow-sm z-10 transition-all">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-slate-600 md:hidden hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Menu"
              >
                <Menu size={20} />
              </button>

              {/* Mobile Branding - Visível apenas em telas menores que o breakpoint desktop (md) */}
              <div className="flex items-center md:hidden gap-2 mr-2">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src={logoApp} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-slate-900 font-black text-xs sm:text-sm uppercase hidden xs:block">AUTO <span className="text-blue-500">TOOLS</span></span>
              </div>

              <button
                onClick={() => setIsSearchOpen(true)}
                className="flex items-center bg-slate-100 rounded-xl px-4 py-2 w-32 xs:w-40 sm:w-[400px] border border-slate-200 transition-all hover:bg-white hover:border-blue-300 group shadow-sm"
              >
                <Search size={16} className="text-slate-400 mr-3 group-hover:text-blue-600 transition-colors" />
                <span className="text-xs sm:text-sm font-bold text-slate-400 group-hover:text-slate-600 transition-colors flex-1 text-left">O que você procura?</span>
                <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-blue-600 group-hover:border-blue-100 transition-all ml-4">⌘K</div>
              </button>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 relative" ref={profileRef}>
              <div className="text-right hidden xs:block cursor-pointer" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                <p className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[120px]">{user.nome}</p>
                <p className="text-[10px] sm:text-xs text-slate-500 font-medium opacity-70">Operacional</p>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className={cn(
                  "w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all border shadow-sm",
                  isProfileOpen ? "bg-blue-600 text-white border-blue-500 shadow-blue-200" : "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100"
                )}
              >
                <User size={18} className="sm:size-[20px]" />
              </motion.button>

              <AnimatePresence>
                {isProfileOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95, transformOrigin: 'top right' }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                    className="absolute right-0 top-full mt-3 w-64 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden z-[100]"
                  >
                    <div className="p-6 bg-slate-50/50 border-b border-slate-50 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-200">
                        <User size={24} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-slate-800 truncate">{user.nome}</div>
                        <div className="text-[10px] font-black text-blue-600 uppercase tracking-widest mt-0.5">Operador Base</div>
                      </div>
                    </div>

                    <div className="p-2">
                      <button
                        onClick={() => { setCurrentView('dashboard'); setIsProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-4 hover:bg-blue-50/50 rounded-2xl transition-all text-sm font-bold text-slate-600 group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                          <User size={16} />
                        </div>
                        Meu Perfil
                      </button>
                      <button
                        onClick={() => { setCurrentView('dashboard'); setIsProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-4 hover:bg-blue-50/50 rounded-2xl transition-all text-sm font-bold text-slate-600 group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                          <Settings size={16} />
                        </div>
                        Configurações
                      </button>

                      <div className="h-[1px] bg-slate-50 my-2 mx-3" />

                      <button
                        onClick={() => { setUser(null); setIsProfileOpen(false); }}
                        className="w-full flex items-center gap-3 p-4 hover:bg-rose-50 text-rose-600 rounded-2xl transition-all text-sm font-black group"
                      >
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-400 flex items-center justify-center group-hover:bg-white group-hover:rotate-12 transition-all">
                          <LogOut size={16} />
                        </div>
                        Sair do Sistema
                      </button>
                    </div>

                    <div className="p-3 bg-slate-50/50 text-center">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">AutoTools v1.5.0</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          <main className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar relative z-0">
            <CommandPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSelect={setCurrentView} />
            <div className="max-w-6xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  {currentView === 'dashboard' && <DashboardView setView={setCurrentView} />}
                  {currentView === 'reports' && <ReportsView />}
                  {currentView === 'vault' && <VaultView currentUser={user} />}
                  {currentView === 'calculator' && <CalculatorView />}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

