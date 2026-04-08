import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { View, SuccessAnimationStyle, AnimationIntensity, UiSettings } from '../types';
import { useAuth } from './AuthContext';

interface UIContextData {
  currentView: View;
  setCurrentView: (view: View) => void;
  
  isSidebarOpen: boolean;
  setIsSidebarOpen: (isOpen: boolean) => void;
  
  isSearchOpen: boolean;
  setIsSearchOpen: (isOpen: boolean) => void;
  
  isProfileOpen: boolean;
  setIsProfileOpen: (isOpen: boolean) => void;
  
  historyItems: any[];
  setHistoryItems: (items: any[]) => void;
  
  highlightId: string | null;
  setHighlightId: (id: string | null) => void;

  reRunData: any | null;
  setReRunData: (data: any | null) => void;

  animationsEnabled: boolean;
  setAnimationsEnabled: (v: boolean) => void;
  
  successAnimationStyle: SuccessAnimationStyle;
  setSuccessAnimationStyle: (v: SuccessAnimationStyle) => void;
  
  successAnimationDurationSec: number;
  setSuccessAnimationDurationSec: (v: number) => void;
  
  successAnimationIntensity: AnimationIntensity;
  setSuccessAnimationIntensity: (v: AnimationIntensity) => void;

  windowsHelloEnabled: boolean;
  setWindowsHelloEnabled: (v: boolean) => void;

  handleDeepSelect: (view: View, id: string) => void;
  handleReRunFromDashboard: (item: any) => void;
}

const UIContext = createContext<UIContextData>({} as UIContextData);

export const UIProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const [historyItems, setHistoryItems] = useState<any[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [reRunData, setReRunData] = useState<any | null>(null);
  
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [successAnimationStyle, setSuccessAnimationStyle] = useState<SuccessAnimationStyle>('premium');
  const [successAnimationDurationSec, setSuccessAnimationDurationSec] = useState(1.6);
  const [successAnimationIntensity, setSuccessAnimationIntensity] = useState<AnimationIntensity>('normal');
  const [windowsHelloEnabled, setWindowsHelloEnabled] = useState(false);

  const SETTINGS_STORAGE_PREFIX = 'autotools:settings';

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

  useEffect(() => {
    if (user?.id) {
      fetch(`/api/relatorios-history?limit=100&user_id=${user.id}`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setHistoryItems(data);
        })
        .catch(err => console.error("Erro ao carregar histórico para busca:", err));
    }
  }, [user, currentView]);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}:${user.id}`);
      if (!raw) {
        setAnimationsEnabled(true);
        setSuccessAnimationStyle('premium');
        setSuccessAnimationDurationSec(1.6);
        setSuccessAnimationIntensity('normal');
        setWindowsHelloEnabled(false);
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
      setWindowsHelloEnabled(parsed.windowsHelloEnabled === true);
    } catch {
      setAnimationsEnabled(true);
      setSuccessAnimationStyle('premium');
      setSuccessAnimationDurationSec(1.6);
      setSuccessAnimationIntensity('normal');
      setWindowsHelloEnabled(false);
    }
  }, [user?.id]);

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
          windowsHelloEnabled,
        } satisfies UiSettings)
      );
    } catch (e) {
      console.error('Falha ao persistir preferências locais', e);
    }
  }, [user?.id, animationsEnabled, successAnimationStyle, successAnimationDurationSec, successAnimationIntensity, windowsHelloEnabled]);

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
    ];
    const report = reports.find(r => r.name === item.nome_automacao);
    if (report) setHighlightId(report.id);
  };

  return (
    <UIContext.Provider value={{
      currentView, setCurrentView,
      isSidebarOpen, setIsSidebarOpen,
      isSearchOpen, setIsSearchOpen,
      isProfileOpen, setIsProfileOpen,
      historyItems, setHistoryItems,
      highlightId, setHighlightId,
      reRunData, setReRunData,
      animationsEnabled, setAnimationsEnabled,
      successAnimationStyle, setSuccessAnimationStyle,
      successAnimationDurationSec, setSuccessAnimationDurationSec,
      successAnimationIntensity, setSuccessAnimationIntensity,
      windowsHelloEnabled, setWindowsHelloEnabled,
      handleDeepSelect, handleReRunFromDashboard
    }}>
      {children}
    </UIContext.Provider>
  );
};

export const useUI = () => {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('useUI must be used within a UIProvider');
  }
  return context;
};
