import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { View } from '../types';

interface NavigationContextData {
  currentView: View;
  setCurrentView: (view: View) => void;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  isProfileOpen: boolean;
  setIsProfileOpen: (isOpen: boolean) => void;
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;
  handleDeepSelect: (view: View, id: string) => void;
  reRunData: any | null;
  setReRunData: (data: any | null) => void;
  historyItems: any[];
  setHistoryItems: (items: any[]) => void;
  handleReRunFromDashboard: (item: any) => void;
}

const NavigationContext = createContext<NavigationContextData>({} as NavigationContextData);

export const NavigationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reRunData, setReRunData] = useState<any | null>(null);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [currentView]);

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

  const handleDeepSelect = (view: View, id: string) => {
    setCurrentView(view);
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 3500);
  };

  const handleReRunFromDashboard = (item: any) => {
    const rawParams = typeof item.params === 'string' ? JSON.parse(item.params) : item.params;
    setReRunData({
      reportName: item.nome_automacao,
      params: rawParams
    });
    setCurrentView('reports');
    const reports = [
      { id: 'adm_new', name: 'Relatório de Demandas' },
      { id: 'ebus_new', name: 'Relatório Revenue' },
      { id: 'sr_new', name: 'Relatório BASE RIO X SP' },
      { id: 'busca_dados', name: 'Relatório Performance de Canais' },
    ];
    const report = reports.find(r => r.name === item.nome_automacao);
    if (report) setHighlightId(report.id);
  };

  return (
    <NavigationContext.Provider value={{
      currentView, setCurrentView,
      isSidebarOpen, setIsSidebarOpen,
      isSearchOpen, setIsSearchOpen,
      isProfileOpen, setIsProfileOpen,
      historyItems, setHistoryItems,
      highlightId, setHighlightId,
      reRunData, setReRunData,
      handleDeepSelect, handleReRunFromDashboard
    }}>
      {children}
    </NavigationContext.Provider>
  );
};

export const useNavigation = () => {
  const context = useContext(NavigationContext);
  if (!context) throw new Error('useNavigation must be used within a NavigationProvider');
  return context;
};
