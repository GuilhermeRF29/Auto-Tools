import React, { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import {
  Home, FileText, Lock, Search, User,
  CheckCircle, Loader2, Calculator, LogOut,
  X, Settings, Menu, BarChart3, Wrench, BookOpen,
  Download, Activity, RefreshCw
} from 'lucide-react';

import logoApp from '../assets/logo_app.png';
import { cn } from '../utils/cn';
import type { View } from '../types';

import { useAuth } from '../context/AuthContext';
import { useNavigation } from '../context/NavigationContext';
import { useUIPreferences } from '../context/UIPreferencesContext';
import { useUpdate } from '../context/UpdateContext';
import { useTasks } from '../context/TaskContext';
import WindowControls from '../components/WindowControls';
import versionData from '../../version.json';

interface MainLayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { id: 'dashboard', label: 'Inicio', icon: Home },
  { id: 'reports', label: 'Relatórios', icon: FileText },
  { id: 'dashboards', label: 'Dashboards', icon: BarChart3 },
  { id: 'vault', label: 'Cofre de Senhas', icon: Lock },
  { id: 'calculator', label: 'Calculadora', icon: Calculator },
  { id: 'tools', label: 'Ferramentas', icon: Wrench },
] as const;

export default function MainLayout({ children }: MainLayoutProps) {
  const { user, logout } = useAuth();
  const { runningTasks, cancelAutomation } = useTasks();
  const {
    currentView, setCurrentView,
    isSidebarOpen, setIsSidebarOpen,
    isSearchOpen, setIsSearchOpen,
    isProfileOpen, setIsProfileOpen,
  } = useNavigation();
  const { animationsEnabled } = useUIPreferences();
  const { updateStatus, applyUpdate } = useUpdate();

  const [isMaximized, setIsMaximized] = useState(false);
  const [isTasksOpen, setIsTasksOpen] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  const runtime = (window as any).autoToolsRuntime;
  const isElectron = runtime?.isElectron;
  const hasFrame = runtime?.hasFrame;

  useEffect(() => {
    if (isElectron && runtime.windowControls?.onMaximizeChanged) {
      runtime.windowControls.onMaximizeChanged((maximized: boolean) => {
        setIsMaximized(maximized);
      });
    }
  }, [isElectron, runtime]);

  const profileRef = useRef<HTMLDivElement>(null);
  const tasksRef = useRef<HTMLDivElement>(null);
  const updateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
      if (tasksRef.current && !tasksRef.current.contains(event.target as Node)) {
        setIsTasksOpen(false);
      }
      if (updateRef.current && !updateRef.current.contains(event.target as Node)) {
        setIsUpdateOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [setIsProfileOpen]);

  useEffect(() => {
    if (updateStatus.hasUpdate && currentView !== 'dashboard') {
      setShowUpdateToast(true);
      const timer = setTimeout(() => setShowUpdateToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [updateStatus.hasUpdate, currentView]);

  const adjustPopoverPosition = (node: HTMLDivElement | null) => {
    if (node) {
      requestAnimationFrame(() => {
        node.style.transform = 'none';
        const rect = node.getBoundingClientRect();
        const overflowRight = rect.right - (window.innerWidth - 24); // margem de segurança de 24px
        if (overflowRight > 0) {
          node.style.transform = `translateX(-${overflowRight}px)`;
        }
      });
    }
  };

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      <div className={cn(
        "flex flex-col h-screen font-sans overflow-hidden bg-white",
        // Removido rounded-2xl e shadow-2xl pois o Windows 11 cuidará das bordas nativamente com transparent: false
        !animationsEnabled && "animations-disabled"
      )}>
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
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden main-content-wrapper relative">
            {/* Header */}
            <header className="drag-region h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:pr-4 sm:pl-8 shadow-sm z-10 transition-all">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen(true)}
                  className="no-drag p-2 -ml-2 text-slate-600 md:hidden hover:bg-slate-100 rounded-lg transition-colors"
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
                  className="no-drag flex items-center bg-slate-100 rounded-xl px-4 py-2 w-32 xs:w-40 sm:w-[400px] border border-slate-200 transition-all hover:bg-white hover:border-blue-300 group shadow-sm"
                >
                  <Search size={16} className="text-slate-400 mr-3 group-hover:text-blue-600 transition-colors" />
                  <span className="text-xs sm:text-sm font-bold text-slate-400 group-hover:text-slate-600 transition-colors flex-1 text-left">O que você procura?</span>
                  <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-black text-slate-300 uppercase tracking-widest group-hover:text-blue-600 group-hover:border-blue-100 transition-all ml-4">⌘K</div>
                </button>
              </div>

              {/* Controles da Direita */}
              <div className="flex items-center gap-2 sm:gap-4 relative">
                
                {/* Ícone de Tarefas (Aparece se houver tarefas rodando/concluídas na sessão) */}
                {runningTasks.length > 0 && (
                  <div className="relative no-drag" ref={tasksRef}>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setIsTasksOpen(!isTasksOpen); setIsUpdateOpen(false); }}
                      className={cn(
                        "w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center transition-all border relative",
                        isTasksOpen ? "bg-slate-800 text-white border-slate-700 shadow-sm" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                      )}
                    >
                      {runningTasks.some(t => t.status === 'running') ? (
                        <>
                          <Activity size={18} className="sm:size-[20px]" />
                          <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                          <span className="absolute top-2 right-2 w-2 h-2 bg-blue-600 rounded-full" />
                        </>
                      ) : (
                        <CheckCircle size={18} className="sm:size-[20px] text-green-600" />
                      )}
                    </motion.button>

                    <AnimatePresence>
                      {isTasksOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, x: '-33%', scale: 1 }}
                          exit={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                          transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                          style={{ transformOrigin: 'top center' }}
                          className="absolute left-1/2 top-full mt-3 z-[100]"
                        >
                          <div 
                            ref={adjustPopoverPosition}
                            className="w-80 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden max-h-[400px] flex flex-col"
                          >
                          <div className="px-5 py-3.5 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                            <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Atividades</span>
                            <button
                              onClick={() => { setCurrentView('reports'); setIsTasksOpen(false); }}
                              className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
                            >
                              Ver tudo
                            </button>
                          </div>
                          <div className="p-3 space-y-2 overflow-y-auto custom-scrollbar flex-1">
                            {runningTasks.map(task => (
                              <div key={task.id} className={cn(
                                "rounded-3xl p-4 border relative overflow-hidden transition-all",
                                task.status === 'completed' ? 'border-green-100 bg-green-50/50' : 
                                task.status === 'failed' || task.status === 'cancelled' ? 'border-red-100 bg-red-50/50' : 
                                'border-blue-100 bg-blue-50/30'
                              )}>
                                <div
                                  className={cn("absolute top-0 left-0 bottom-0 z-0 transition-all duration-700 ease-out opacity-15",
                                    task.status === 'completed' ? 'bg-green-500' : 
                                    task.status === 'failed' || task.status === 'cancelled' ? 'bg-red-500' : 'bg-blue-500'
                                  )}
                                  style={{ width: `${task.progress}%` }}
                                />
                                <div className="relative z-10 flex items-center justify-between gap-3">
                                  <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-white transition-colors",
                                      task.status === 'completed' ? 'bg-green-500' : 
                                      task.status === 'failed' || task.status === 'cancelled' ? 'bg-red-500' : 'bg-blue-600'
                                    )}>
                                      {task.status === 'completed' ? <CheckCircle size={14} /> :
                                        task.status === 'failed' || task.status === 'cancelled' ? <X size={14} /> :
                                        <Loader2 size={14} className="animate-spin" />}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="text-[11.5px] font-bold text-slate-700 truncate leading-tight">{task.name}</p>
                                      <p className="text-[10px] font-bold text-slate-400 truncate mt-0.5">
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
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Ícone de Updates (Aparece se houver atualização disponivel) */}
                {updateStatus.hasUpdate && (
                  <div className="relative no-drag" ref={updateRef}>
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => { setIsUpdateOpen(!isUpdateOpen); setIsTasksOpen(false); }}
                      className={cn(
                        "w-9 h-9 sm:w-10 sm:h-10 rounded-2xl flex flex-col items-center justify-center transition-all border relative gap-[1px]",
                        isUpdateOpen ? "bg-emerald-600 text-white border-emerald-500 shadow-sm" : "bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100"
                      )}
                    >
                      <Download size={16} className="sm:size-[18px]" />
                      <div className={cn("w-3 h-0.5 rounded-full", isUpdateOpen ? "bg-white" : "bg-emerald-600")} />
                    </motion.button>

                    <AnimatePresence>
                      {showUpdateToast && !isUpdateOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -10, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -10, scale: 0.9 }}
                          className="absolute left-1/2 -translate-x-1/2 top-full mt-2 whitespace-nowrap bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg shadow-lg z-[100]"
                        >
                          Nova atualização
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {isUpdateOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, x: '-33%', scale: 1 }}
                          exit={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                          transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                          style={{ transformOrigin: 'top center' }}
                          className="absolute left-1/2 top-full mt-3 z-[100]"
                        >
                          <div 
                            ref={adjustPopoverPosition}
                            className="w-72 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden"
                          >
                          <div className="p-5 flex items-start gap-4">
                            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                              <RefreshCw className="text-emerald-600" size={20} />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight mb-1">Atualização</h4>
                              <p className="text-[11px] text-slate-500 leading-normal mb-3">
                                Versão <span className="font-bold text-slate-800">{updateStatus.remoteVersion}</span> disponível.
                              </p>
                              <button 
                                onClick={applyUpdate}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2 px-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-colors shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
                              >
                                <Download size={12} /> Reiniciar e Atualizar
                              </button>
                            </div>
                          </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Menu de perfil */}
                <div className="flex items-center gap-2 sm:gap-4 relative no-drag" ref={profileRef}>
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
                      initial={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, x: '-33%', scale: 1 }}
                      exit={{ opacity: 0, y: 10, x: '-33%', scale: 0.95 }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0.3 }}
                      style={{ transformOrigin: 'top center' }}
                      className="absolute left-1/2 top-full mt-3 z-[100]"
                    >
                      <div 
                        ref={adjustPopoverPosition}
                        className="w-64 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden"
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
                          onClick={() => { setCurrentView('manual'); setIsProfileOpen(false); }}
                          className="w-full flex items-center gap-3 p-4 hover:bg-blue-50/50 rounded-2xl transition-all text-sm font-bold text-slate-600 group"
                        >
                          <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-white group-hover:text-blue-600 transition-colors">
                            <BookOpen size={16} />
                          </div>
                          Manual do Usuário
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
                        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">
                          AutoTools v{updateStatus.currentVersion || versionData.version}
                        </p>
                      </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {!hasFrame && <WindowControls />}
            </div>
          </header>


            {/* Área de conteúdo passível com animação */}
            <main className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar relative z-0">
              <div className="max-w-6xl mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>
      </div>
    </MotionConfig>
  );
}
