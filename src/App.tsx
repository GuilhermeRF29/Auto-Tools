/**
 * @module App
 * @description Shell principal da aplicação Auto Tools.
 * Responsabilidades:
 * - Autenticação (Login / Registro)
 * - Navegação entre telas via sidebar com animação
 * - Layout responsivo com header, sidebar e conteúdo
 * - Command Palette (⌘K)
 * - Menu de perfil do usuário
 *
 * Todas as views e componentes são importados de modules separados.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Home, FileText, Lock, Search, User,
  CheckCircle, Loader2, Calculator, LogOut,
  X, Settings, Menu, BarChart3
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import logoApp from '../logo_app.png';

// --- Utilitários e Tipos ---
import { cn } from './utils/cn';
import type { View, RunningTask, SuccessAnimationStyle, AnimationIntensity, UiSettings } from './types';

// --- Componentes ---
import BackgroundAnimation from './components/BackgroundAnimation';
import Button from './components/Button';
import CommandPalette from './components/CommandPalette';

// --- Views ---
import DashboardView from './views/DashboardView';
import ApresentacoesView from './views/ApresentacoesView';
import HistoryView from './views/HistoryView';
import ReportsView from './views/ReportsView';
import VaultView from './views/VaultView';
import CalculatorView from './views/CalculatorView';
import SettingsView from './views/SettingsView';


export default function App() {
  // === Estado de Autenticação ===
  const [user, setUser] = useState<{ id: number, nome: string } | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authData, setAuthData] = useState({ user: '', pass: '', name: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // === Estado do servidor ===
  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<{ version?: string } | null>(null);

  // === Estado de Navegação ===
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // === Estado de Tarefas (global — persiste entre views) ===
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reRunData, setReRunData] = useState<any | null>(null);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [successAnimationStyle, setSuccessAnimationStyle] = useState<SuccessAnimationStyle>('premium');
  const [successAnimationDurationSec, setSuccessAnimationDurationSec] = useState(1.6);
  const [successAnimationIntensity, setSuccessAnimationIntensity] = useState<AnimationIntensity>('normal');

  const SETTINGS_STORAGE_PREFIX = 'autotools:settings';

  /** Timeout de segurança: se nenhuma atualização chegar em 15 min, marca como falha. */
  const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
  const lastActivityRef = useRef<Map<string, number>>(new Map());
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  // ============================
  //  TASK MANAGEMENT (Global)
  // ============================

  /** Inicia uma automação e conecta ao SSE para atualizações em tempo real. */
  const startAutomation = useCallback(async (payload: any): Promise<string | null> => {
    try {
      const response = await fetch('/api/run-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const { jobId } = await response.json();
      const repName = payload.name || 'Automação';

      // Adiciona a tarefa na fila
      const newTask: RunningTask = {
        id: jobId,
        name: repName,
        progress: 0,
        progressTarget: 0,
        status: 'running',
        startTime: new Date()
      };
      setRunningTasks(prev => [newTask, ...prev]);
      lastActivityRef.current.set(jobId, Date.now());

      // Escuta o progresso via SSE
      const eventSource = new EventSource(`/api/automation-progress/${jobId}`);
      eventSourcesRef.current.set(jobId, eventSource);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        lastActivityRef.current.set(jobId, Date.now());

        setRunningTasks(prev => prev.map(t => {
          if (t.id === jobId) {
            const incomingProgress = Number.isFinite(data.progress) ? Number(data.progress) : (t.progressTarget ?? t.progress);
            const clampedProgress = Math.max(0, Math.min(100, incomingProgress));
            const isRunning = data.status === 'running';
            return {
              ...t,
              progress: isRunning ? t.progress : clampedProgress,
              progressTarget: clampedProgress,
              status: data.status,
              message: data.message
            };
          }
          return t;
        }));

        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
          eventSourcesRef.current.delete(jobId);
          lastActivityRef.current.delete(jobId);

          // Auto-download do arquivo gerado se concluído com sucesso
          if (data.status === 'completed' && data.result) {
            try {
              const resObj = JSON.parse(data.result);
              const filePath = resObj.arquivo_principal;
              if (filePath) {
                const link = document.createElement('a');
                link.href = `/api/download?path=${encodeURIComponent(filePath)}`;
                link.setAttribute('download', '');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }
            } catch (e) {
              console.error('Erro ao parsear resultado final', e);
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
        eventSourcesRef.current.delete(jobId);
      };

      return jobId;
    } catch (e) {
      console.error('Falha ao iniciar automação', e);
      return null;
    }
  }, []);

  /** Cancela uma tarefa em execução via API. */
  const cancelAutomation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/cancel-automation/${id}`, { method: 'POST' });

      // Fecha o EventSource associado
      const es = eventSourcesRef.current.get(id);
      if (es) { es.close(); eventSourcesRef.current.delete(id); }
      lastActivityRef.current.delete(id);

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
      console.error('Erro ao cancelar tarefa', e);
    }
  }, []);

  /** Timer de inatividade: verifica a cada 60s se algum job parou de responder. */
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      lastActivityRef.current.forEach((lastTime, jobId) => {
        if (now - lastTime > INACTIVITY_TIMEOUT_MS) {
          console.warn(`[TIMEOUT] Job ${jobId} sem atualização por ${INACTIVITY_TIMEOUT_MS / 60000} min. Marcando como falha.`);
          const es = eventSourcesRef.current.get(jobId);
          if (es) { es.close(); eventSourcesRef.current.delete(jobId); }
          lastActivityRef.current.delete(jobId);

          setRunningTasks(prev => prev.map(t => {
            if (t.id === jobId && t.status === 'running') {
              return { ...t, status: 'failed', message: 'Tempo limite excedido — sem resposta do servidor.' };
            }
            return t;
          }));

          setTimeout(() => {
            setRunningTasks(prev => prev.filter(t => t.id !== jobId));
          }, 15000);
        }
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  /**
   * Suavização contínua da barra de progresso.
   * O backend envia saltos discretos, então interpolamos localmente para uma animação mais fluida.
   */
  useEffect(() => {
    const interval = window.setInterval(() => {
      setRunningTasks(prev => {
        let changed = false;
        const next = prev.map(task => {
          const target = typeof task.progressTarget === 'number' ? task.progressTarget : task.progress;

          // Estados finais exibem o valor exato imediatamente.
          if (task.status !== 'running') {
            if (task.progress !== target) {
              changed = true;
              return { ...task, progress: target };
            }
            return task;
          }

          const cappedTarget = Math.max(task.progress, Math.min(99.8, target));
          if (task.progress >= cappedTarget) return task;

          const delta = cappedTarget - task.progress;
          const step = Math.max(0.15, delta * 0.18);
          const smoothed = Number(Math.min(cappedTarget, task.progress + step).toFixed(2));

          if (smoothed !== task.progress) {
            changed = true;
            return { ...task, progress: smoothed };
          }

          return task;
        });

        return changed ? next : prev;
      });
    }, 80);

    return () => window.clearInterval(interval);
  }, []);

  /** Busca o histórico resumido para a barra de pesquisa global. */
  useEffect(() => {
    if (user?.id) {
      fetch(`/api/relatorios-history?limit=100&user_id=${user.id}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setHistoryItems(data);
        })
        .catch(err => console.error("Erro ao carregar histórico para busca:", err));
    }
  }, [user, currentView]); // Recarrega ao trocar de view para manter atualizado

  // === Refs ===
  /** Ref para o menu de perfil (detecta clique fora para fechar) */
  const profileRef = useRef<HTMLDivElement>(null);

  // ============================
  //  HANDLERS DE NAVEGAÇÃO
  // ============================

  /**
   * Deep-select: navega para uma view e destaca um item específico.
   * Usado pela CommandPalette ao selecionar um relatório.
   */
  const handleDeepSelect = (view: View, id: string) => {
    setCurrentView(view);
    setHighlightId(id);
    // Tempo aumentado para 3.5s para sincronizar com a animação de 0.5s delay + 2.5s pulse
    setTimeout(() => setHighlightId(null), 3500);
  };

  /**
   * Re-execução: prepara dados do histórico para re-executar no ReportsView.
   * Chamado pelo DashboardView e HistoryView ao clicar "Play".
   */
  const handleReRunFromDashboard = (item: any) => {
    const rawParams = typeof item.params === 'string' ? JSON.parse(item.params) : item.params;
    setReRunData({
      reportName: item.nome_automacao,
      params: rawParams
    });

    setCurrentView('reports');

    // Destaque visual no relatório correspondente
    const reports = [
      { id: 'adm_new', name: 'Relatório de Demandas' },
      { id: 'ebus_new', name: 'Relatório Revenue' },
      { id: 'sr_new', name: 'Relatório BASE RIO X SP' },
    ];
    const report = reports.find(r => r.name === item.nome_automacao);
    if (report) setHighlightId(report.id);
  };

  // ============================
  //  EFFECTS GLOBAIS
  // ============================

  /** Fecha o menu de perfil ao clicar fora. */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /** Atalho global ⌘K (ou Ctrl+K) para abrir a Command Palette. */
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

  /** Fecha a sidebar mobile ao trocar de view. */
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentView]);

  /** Verifica o status do servidor backend. */
  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setServerStatus(data.status === 'ok' ? 'online' : 'offline');
        setServerInfo(data);
      })
      .catch(() => setServerStatus('offline'));
  }, []);

  /** Carrega preferências da UI salvas para o usuário logado. */
  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}:${user.id}`);
      if (!raw) {
        setAnimationsEnabled(true);
        setSuccessAnimationStyle('premium');
        setSuccessAnimationDurationSec(1.6);
        setSuccessAnimationIntensity('normal');
        return;
      }

      const parsed = JSON.parse(raw) as Partial<UiSettings>;
      setAnimationsEnabled(parsed.animationsEnabled !== false);

      if (parsed.successAnimationStyle === 'premium' || parsed.successAnimationStyle === 'rapido') {
        setSuccessAnimationStyle(parsed.successAnimationStyle);
      } else {
        setSuccessAnimationStyle('premium');
      }

      if (typeof parsed.successAnimationDurationSec === 'number' && Number.isFinite(parsed.successAnimationDurationSec)) {
        const clamped = Math.min(4, Math.max(0.8, parsed.successAnimationDurationSec));
        setSuccessAnimationDurationSec(Number(clamped.toFixed(1)));
      } else {
        setSuccessAnimationDurationSec(1.6);
      }

      if (parsed.successAnimationIntensity === 'suave' || parsed.successAnimationIntensity === 'normal' || parsed.successAnimationIntensity === 'intensa') {
        setSuccessAnimationIntensity(parsed.successAnimationIntensity);
      } else {
        setSuccessAnimationIntensity('normal');
      }
    } catch {
      setAnimationsEnabled(true);
      setSuccessAnimationStyle('premium');
      setSuccessAnimationDurationSec(1.6);
      setSuccessAnimationIntensity('normal');
    }
  }, [user?.id]);

  /** Persiste preferências da UI por usuário para reaplicar em próximos acessos. */
  useEffect(() => {
    if (!user?.id) return;
    try {
      localStorage.setItem(
        `${SETTINGS_STORAGE_PREFIX}:${user.id}`,
        JSON.stringify({
          animationsEnabled,
          successAnimationStyle,
          successAnimationDurationSec,
          successAnimationIntensity,
        } satisfies UiSettings)
      );
    } catch (e) {
      console.error('Falha ao persistir preferências locais', e);
    }
  }, [user?.id, animationsEnabled, successAnimationStyle, successAnimationDurationSec, successAnimationIntensity]);

  // ============================
  //  AUTENTICAÇÃO
  // ============================

  /** Handler de login com validação robusta do response. */
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

  /** Handler de registro de novo usuário. */
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

  // ============================
  //  TELA DE LOGIN
  // ============================

  if (!user) {
    return (
      <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
        <motion.div className={cn("flex min-h-screen w-full items-center justify-center font-sans p-4 sm:p-10 overflow-y-auto overflow-x-hidden relative bg-slate-50", !animationsEnabled && "animations-disabled")}>
          <BackgroundAnimation />
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.6 }}
            className="flex w-full max-w-4xl h-auto min-h-[520px] my-auto overflow-hidden rounded-[2rem] shadow-2xl bg-white border border-slate-200 relative"
          >

          {/* Lado Esquerdo - Branding */}
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

          {/* Lado Direito - Formulário */}
          <div className="flex-1 p-8 sm:p-12 flex flex-col justify-center overflow-y-auto custom-scrollbar">
            <div className="max-w-xs mx-auto w-full">
              {/* Logo Mobile */}
              <div className="flex flex-col items-center mb-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-500">
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
          </motion.div>
        </motion.div>
      </MotionConfig>
    );
  }

  // ============================
  //  LAYOUT PRINCIPAL (Logado)
  // ============================

  /** Itens de navegação da sidebar. */
  const navItems = [
    { id: 'dashboard', label: 'Inicio', icon: Home },
    { id: 'reports', label: 'Relatórios', icon: FileText },
    { id: 'presentations', label: 'Dashboards', icon: BarChart3 },
    { id: 'vault', label: 'Cofre de Senhas', icon: Lock },
    { id: 'calculator', label: 'Calculadora', icon: Calculator },
  ];

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      <div className={cn("flex flex-col h-screen font-sans overflow-hidden", !animationsEnabled && "animations-disabled")}>
      {/* Estilos inline para ticker e scrollbar */}
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

          {/* Logo da sidebar */}
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

          {/* Links de navegação com pill animado */}
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

                  {/* Pill de seleção com animação de layout */}
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
              {/* Botão hamburger (mobile) */}
              <button
                onClick={() => setIsSidebarOpen(true)}
                className="p-2 -ml-2 text-slate-600 md:hidden hover:bg-slate-100 rounded-lg transition-colors"
                aria-label="Menu"
              >
                <Menu size={20} />
              </button>

              {/* Branding mobile no header */}
              <div className="flex items-center md:hidden gap-2 mr-2">
                <div className="w-8 h-8 flex items-center justify-center">
                  <img src={logoApp} alt="Logo" className="w-full h-full object-contain" />
                </div>
                <span className="text-slate-900 font-black text-xs sm:text-sm uppercase hidden xs:block">AUTO <span className="text-blue-500">TOOLS</span></span>
              </div>

              {/* Barra de busca (abre Command Palette) */}
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

              {/* Dropdown do perfil */}
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

          {/* Widget flutuante global de progresso (visível em qualquer view) */}
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
                      {/* Barra de progresso sutil no fundo */}
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

          {/* Área de conteúdo com animação de transição */}
          <main className="flex-1 overflow-y-auto p-4 sm:p-8 custom-scrollbar relative z-0">
            <CommandPalette 
              isOpen={isSearchOpen} 
              onClose={() => setIsSearchOpen(false)} 
              onSelect={setCurrentView} 
              onDeepSelect={handleDeepSelect}
              historyItems={historyItems}
            />
            <div className="max-w-6xl mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ type: 'spring', stiffness: 350, damping: 35, mass: 0.8 }}
                >
                  {currentView === 'dashboard' && (
                    <DashboardView 
                      setView={setCurrentView} 
                      onReRun={handleReRunFromDashboard} 
                      currentUser={user}
                      tasksCount={runningTasks.length}
                      onStartAutomation={startAutomation}
                    />
                  )}
                  {currentView === 'history' && (
                    <HistoryView 
                      onReRun={handleReRunFromDashboard} 
                      currentUser={user}
                      onStartAutomation={startAutomation}
                      setView={setCurrentView}
                      highlightId={highlightId}
                    />
                  )}
                  {currentView === 'reports' && (
                    <ReportsView 
                      highlightId={highlightId} 
                      reRunData={reRunData} 
                      onReRunUsed={() => setReRunData(null)} 
                      currentUser={user}
                      runningTasks={runningTasks}
                      onStartAutomation={startAutomation}
                      onCancelTask={cancelAutomation}
                      animationsEnabled={animationsEnabled}
                      successAnimationStyle={successAnimationStyle}
                      successAnimationDurationSec={successAnimationDurationSec}
                      successAnimationIntensity={successAnimationIntensity}
                    />
                  )}
                  {currentView === 'presentations' && <ApresentacoesView />}
                  {currentView === 'vault' && <VaultView currentUser={user} />}
                  {currentView === 'calculator' && <CalculatorView />}
                  {currentView === 'settings' && (
                    <SettingsView
                      animationsEnabled={animationsEnabled}
                      onAnimationsEnabledChange={setAnimationsEnabled}
                      successAnimationStyle={successAnimationStyle}
                      onSuccessAnimationStyleChange={setSuccessAnimationStyle}
                      successAnimationDurationSec={successAnimationDurationSec}
                      onSuccessAnimationDurationSecChange={setSuccessAnimationDurationSec}
                      successAnimationIntensity={successAnimationIntensity}
                      onSuccessAnimationIntensityChange={setSuccessAnimationIntensity}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
      </div>
    </MotionConfig>
  );
}
