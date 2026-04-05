import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

// Contexts
import { AuthProvider, useAuth } from './context/AuthContext';
import { TaskProvider, useTasks } from './context/TaskContext';
import { UIProvider, useUI } from './context/UIContext';

// Layout & Components
import MainLayout from './layout/MainLayout';
import LoginView from './views/LoginView';
import CommandPalette from './components/CommandPalette';

// Views
import DashboardView from './views/DashboardView';
import DashboardsHubView from './views/DashboardsHubView';
import ApresentacoesView from './views/ApresentacoesView';
import DemandDashboardView from './views/DemandDashboardView';
import HistoryView from './views/HistoryView';
import ReportsView from './views/ReportsView';
import VaultView from './views/VaultView';
import CalculatorView from './views/CalculatorView';
import SettingsView from './views/SettingsView';

function AppContent() {
  const { user } = useAuth();
  const { 
    currentView, setCurrentView,
    isSearchOpen, setIsSearchOpen,
    handleDeepSelect, historyItems,
    reRunData, setReRunData, highlightId,
    animationsEnabled, successAnimationStyle,
    successAnimationDurationSec, successAnimationIntensity,
    setAnimationsEnabled, setSuccessAnimationStyle,
    setSuccessAnimationDurationSec, setSuccessAnimationIntensity,
    handleReRunFromDashboard
  } = useUI();
  const { runningTasks, startAutomation, cancelAutomation } = useTasks();

  const [serverStatus, setServerStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [serverInfo, setServerInfo] = useState<{ version?: string } | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        setServerStatus(data.status === 'ok' ? 'online' : 'offline');
        setServerInfo(data);
      })
      .catch(() => setServerStatus('offline'));
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
          {currentView === 'vault' && <VaultView currentUser={user as any} />}
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
    </MainLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TaskProvider>
        <UIProvider>
          <AppContent />
        </UIProvider>
      </TaskProvider>
    </AuthProvider>
  );
}
