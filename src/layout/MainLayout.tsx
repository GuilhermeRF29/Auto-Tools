import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  Home, FileText, Lock, Search, User,
  CheckCircle, Loader2, Calculator, LogOut,
  X, Settings, Menu, BarChart3
} from 'lucide-react';

import logoApp from '../../logo_app.png';
import { cn } from '../utils/cn';
import type { View } from '../types';

import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import { useTasks } from '../context/TaskContext';

interface MainLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'reports', label: 'Relatórios', icon: FileText },
  { id: 'dashboards', label: 'Dashboards', icon: BarChart3 },
  { id: 'vault', label: 'Cofre de Senhas', icon: Lock },
  { id: 'calculator', label: 'Calculadora', icon: Calculator },
] as const;

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const { runningTasks, cancelAutomation } = useTasks();
  const {
    currentView, setCurrentView,
    isSidebarOpen, setIsSidebarOpen,
    isSearchOpen, setIsSearchOpen,
    isProfileOpen, setIsProfileOpen,
    animationsEnabled
  } = useUI();

  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsProfileOpen]);

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      <div className={cn("flex flex-col h-screen font-sans overflow-hidden", !animationsEnabled && "animations-disabled")}>
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
          .animations-disabled *, .animations-disabled *::before, .animations-disabled *::after {
            animation: none !important;
            transition-duration: 0ms !important;
            transition-delay: 0ms !important;
            scroll-behavior: auto !important;
          }
        `}</style>

        <div className="flex-1 flex overflow-hidden relative bg-slate-100">
          {/* Overlay mobile para sidebar */}
          {isSidebarOpen && (
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[90] md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}

          {/* === SIDEBAR === */}
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

          {/* === CONTEÚDO PRINCIPAL === */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Header */}
            <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-8 shadow-sm z-10 transition-all">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 -ml-2 text-slate-600 md:hidden hover:bg-slate-100 rounded-lg transition-colors"
                  aria-label="Menu"
                >
                  <Menu size={20} />
                </button>

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

              {/* Menu de perfil */}
              <div className="flex items-center gap-2 sm:gap-4 relative" ref={profileRef}>
                <div className="text-right hidden xs:block cursor-pointer" onClick={() => setIsProfileOpen(!isProfileOpen)}>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 truncate max-w-[120px]">{user?.nome}</p>
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
                          <div className="text-sm font-black text-slate-800 truncate">{user?.nome}</div>
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
                          onClick={() => { setCurrentView('settings'); setIsProfileOpen(false); }}
                          className="w-full flex items-center gap-3 p-4 hover:bg-blue-50/50 rounded-2xl transition-all text-sm font-bold text-slate-600 group"
                        >
                          <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                            <Settings size={16} />
                          </div>
                          Configurações
                        </button>

                        <div className="h-[1px] bg-slate-50 my-2 mx-3" />

                        <button
                          onClick={() => { logout(); setIsProfileOpen(false); }}
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

            {/* Widget flutuante global de progresso (visível em qualquer view exceto reports) */}
            {runningTasks.length > 0 && currentView !== 'reports' && (
              <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-500">
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200 p-4 w-80 max-h-[320px] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Loader2 size={16} className="text-blue-600 animate-spin" />
                      </div>
                      <span className="text-xs font-black text-slate-600 uppercase tracking-widest">
                        {runningTasks.filter(t => t.status === 'running').length} em execução
                      </span>
                    </div>
                    <button
                      onClick={() => setCurrentView('reports')}
                      className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
                    >
                      Ver tudo
                    </button>
                  </div>
                  <div className="space-y-2">
                    {runningTasks.map(task => (
                      <div key={task.id} className={`rounded-xl p-3 border relative overflow-hidden transition-all
                        ${task.status === 'completed' ? 'border-green-100 bg-green-50/50' : 
                          task.status === 'failed' || task.status === 'cancelled' ? 'border-red-100 bg-red-50/50' : 
                          'border-blue-100 bg-blue-50/30'}`}
                      >
                        <div
                          className={`absolute top-0 left-0 bottom-0 z-0 transition-all duration-700 ease-out opacity-15
                            ${task.status === 'completed' ? 'bg-green-500' : 
                              task.status === 'failed' || task.status === 'cancelled' ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${task.progress}%` }}
                        />
                        <div className="relative z-10 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-white transition-colors
                              ${task.status === 'completed' ? 'bg-green-500' : 
                                task.status === 'failed' || task.status === 'cancelled' ? 'bg-red-500' : 'bg-blue-600'}`}
                            >
                              {task.status === 'completed' ? <CheckCircle size={12} /> :
                                task.status === 'failed' || task.status === 'cancelled' ? <X size={12} /> :
                                <Loader2 size={12} className="animate-spin" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[11px] font-bold text-slate-700 truncate">{task.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 truncate">
                                {task.message || `${Math.round(task.progress)}%`}
                              </p>
                            </div>
                          </div>
                          {task.status === 'running' && (
                            <button
                              onClick={() => cancelAutomation(task.id)}
                              className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                              title="Cancelar"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Área de conteúdo passível com animação */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar relative z-0">
              <div className="max-w-6xl mx-auto">
                <AnimatePresence mode="wait">
                  {children}
                </AnimatePresence>
              </div>
            </main>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
