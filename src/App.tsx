import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Contexts
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider, useTasks } from './context/TaskContext';
import { UIProvider, useUI } from './context/UIContext';
import { DialogProvider, useDialog } from './context/DialogContext';

// Layout & Components
import MainLayout from './layout/MainLayout';
import LoginView from './views/LoginView';
import CommandPalette from './components/CommandPalette';

// Views
import DashboardView from './views/DashboardView';
import DashboardsHubView from './views/DashboardsHubView';
import ApresentacoesView from './views/ApresentacoesView';
import DemandDashboardView from './views/DemandDashboardView';
import RioShareDashboardView from './views/RioShareDashboardView';
import ChannelShareDashboardView from './views/ChannelShareDashboardView';
import HistoryView from './views/HistoryView';
import ReportsView from './views/ReportsView';
import VaultView from './views/VaultView';
import CalculatorView from './views/CalculatorView';
import ToolsView from './views/ToolsView';
import SettingsView from './views/SettingsView';
import {
  clearWindowsHelloHint,
  disableWindowsHello,
  getWindowsHelloServerState,
  isWindowsHelloAvailable,
  registerWindowsHello,
} from './utils/windowsHello';

type ServerHealthInfo = {
  status?: 'ok' | 'degraded' | 'offline';
  version?: string;
  python?: string;
  dbStatus?: 'ok' | 'error' | 'offline';
  dbMessage?: string;
  checkedAt?: string;
};

function AppContent() {
  const { user } = useAuth();
  const { showAlert, showPrompt } = useDialog();
  const { 
    currentView, setCurrentView,
    isSearchOpen, setIsSearchOpen,
    handleDeepSelect, historyItems,
    reRunData, setReRunData, highlightId,
    animationsEnabled, successAnimationStyle,
    successAnimationDurationSec, successAnimationIntensity,
    setAnimationsEnabled, setSuccessAnimationStyle,
    setSuccessAnimationDurationSec, setSuccessAnimationIntensity,
    windowsHelloEnabled, setWindowsHelloEnabled,
    handleReRunFromDashboard
  } = useUI();
  const { runningTasks, startAutomation, cancelAutomation } = useTasks();
  const [windowsHelloBusy, setWindowsHelloBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const syncWindowsHelloState = async () => {
      if (!user?.id) {
        setWindowsHelloEnabled(false);
        return;
      }

      try {
        const enabled = await getWindowsHelloServerState(Number(user.id));
        if (cancelled) return;
        setWindowsHelloEnabled(enabled);
        if (!enabled) {
          clearWindowsHelloHint();
        }
      } catch {
        // Keep local UI state if backend state is temporarily unavailable.
      }
    };

    syncWindowsHelloState();
    return () => {
      cancelled = true;
    };
  }, [user?.id, setWindowsHelloEnabled]);

  const handleWindowsHelloToggle = async (nextEnabled: boolean) => {
    if (!user?.usuario) {
      await showAlert('Usuário inválido para configurar Windows Hello. Faça login novamente.');
      return;
    }

    if (nextEnabled && !isWindowsHelloAvailable()) {
      await showAlert('Este navegador/dispositivo não suporta WebAuthn (Windows Hello).');
      return;
    }

    if (nextEnabled) {
      try {
        const alreadyEnabled = await getWindowsHelloServerState(Number(user.id));
        if (alreadyEnabled) {
          setWindowsHelloEnabled(true);
          await showAlert({
            title: 'Windows Hello Já Ativo',
            message: 'A biometria já está ativa para este usuário. Não é necessário cadastrar novamente.',
            tone: 'info',
          });
          return;
        }
      } catch {
        // If state check fails, keep normal activation flow.
      }

      const password = await showPrompt({
        title: 'Ativar Windows Hello',
        message: 'Confirme sua senha para ativar o Windows Hello.',
        inputType: 'password',
        placeholder: 'Digite sua senha',
        confirmText: 'Ativar',
        cancelText: 'Cancelar',
        tone: 'warning',
      });
      if (!password || !password.trim()) return;
      setWindowsHelloBusy(true);
      try {
        await registerWindowsHello(user, password.trim());
        setWindowsHelloEnabled(true);
        await showAlert({
          title: 'Windows Hello Ativado',
          message: 'Windows Hello foi ativado com sucesso. Você pode continuar usando normalmente e, no próximo login ou no Cofre, usar o botão de autenticação biométrica.',
          tone: 'success',
        });
      } catch (e: any) {
        await showAlert({
          title: 'Falha na Ativação',
          message: e?.message || 'Falha ao ativar Windows Hello.',
          tone: 'danger',
        });
      } finally {
        setWindowsHelloBusy(false);
      }
      return;
    }

    const password = await showPrompt({
      title: 'Desativar Windows Hello',
      message: 'Confirme sua senha para desativar o Windows Hello.',
      inputType: 'password',
      placeholder: 'Digite sua senha',
      confirmText: 'Desativar',
      cancelText: 'Cancelar',
      tone: 'warning',
    });
    if (!password || !password.trim()) return;

    setWindowsHelloBusy(true);
    try {
      await disableWindowsHello(user, password.trim());
      clearWindowsHelloHint();
      setWindowsHelloEnabled(false);
      await showAlert({
        title: 'Windows Hello Desativado',
        message: 'A credencial/token local foi removida.',
        tone: 'success',
      });
    } catch (e: any) {
      await showAlert({
        title: 'Falha na Desativação',
        message: e?.message || 'Falha ao desativar Windows Hello.',
        tone: 'danger',
      });
    } finally {
      setWindowsHelloBusy(false);
    }
  };

  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<ServerHealthInfo | null>(null);

  useEffect(() => {
    let disposed = false;

    const checkServerStatus = async () => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 5000);

      try {
        const response = await fetch('/api/status', { signal: controller.signal });
        const data = await response.json();
        if (disposed) return;

        setServerStatus(data?.status === 'ok' ? 'online' : 'offline');
        setServerInfo(data);
      } catch {
        if (disposed) return;
        setServerStatus('offline');
        setServerInfo((prev) => ({
          version: prev?.version || 'AutoTools API',
          status: 'offline',
          dbStatus: 'offline',
          dbMessage: 'Sem comunicação com o backend no momento.',
        }));
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    checkServerStatus();
    const intervalId = window.setInterval(checkServerStatus, 10000);

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
    };
  }, []);

  if (!user) {
    return (
      <LoginView 
        serverStatus={serverStatus} 
        serverInfo={serverInfo} 
        animationsEnabled={true}
      />
    );
  }

  return (
    <MainLayout>
      <CommandPalette 
        isOpen={isSearchOpen} 
        onClose={() => setIsSearchOpen(false)} 
        onSelect={setCurrentView} 
        onDeepSelect={handleDeepSelect}
        historyItems={historyItems}
      />
      <AnimatePresence mode="wait">
        <motion.div
          key={currentView}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ type: 'spring', stiffness: 350, damping: 35, mass: 0.8 }}
          className="w-full h-full"
        >
          {currentView === 'dashboard' && (
            <DashboardView 
              setView={setCurrentView} 
              onReRun={handleReRunFromDashboard} 
              currentUser={user}
              tasksCount={runningTasks.length}
              onStartAutomation={startAutomation}
              windowsHelloEnabled={windowsHelloEnabled}
              serverStatus={serverStatus}
              serverInfo={serverInfo}
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
          {currentView === 'dashboards' && <DashboardsHubView setView={setCurrentView} />}
          {currentView === 'presentations' && <ApresentacoesView />}
          {currentView === 'demand' && <DemandDashboardView />}
          {currentView === 'rioShare' && <RioShareDashboardView />}
          {currentView === 'channelShare' && <ChannelShareDashboardView />}
          {currentView === 'vault' && (
            <VaultView
              currentUser={user as any}
              windowsHelloEnabled={windowsHelloEnabled}
            />
          )}
          {currentView === 'calculator' && <CalculatorView />}
          {currentView === 'tools' && <ToolsView />}
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
              windowsHelloEnabled={windowsHelloEnabled}
              onWindowsHelloEnabledChange={handleWindowsHelloToggle}
              windowsHelloBusy={windowsHelloBusy}
              currentUserId={(user as any)?.id ?? null}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </MainLayout>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <AuthProvider>
        <TaskProvider>
          <UIProvider>
            <AppContent />
          </UIProvider>
        </TaskProvider>
      </AuthProvider>
    </DialogProvider>
  );
}
