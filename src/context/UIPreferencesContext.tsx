import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { SuccessAnimationStyle, AnimationIntensity, UiSettings } from '../types';
import { useAuth } from './AuthContext';

interface UIPreferencesContextData {
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
}

const UIPreferencesContext = createContext<UIPreferencesContextData>({} as UIPreferencesContextData);

const SETTINGS_STORAGE_PREFIX = 'autotools:settings';

export const UIPreferencesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [successAnimationStyle, setSuccessAnimationStyle] = useState<SuccessAnimationStyle>('premium');
  const [successAnimationDurationSec, setSuccessAnimationDurationSec] = useState(1.6);
  const [successAnimationIntensity, setSuccessAnimationIntensity] = useState<AnimationIntensity>('normal');
  const [windowsHelloEnabled, setWindowsHelloEnabled] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    try {
      const raw = localStorage.getItem(`${SETTINGS_STORAGE_PREFIX}:${user.id}`);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<UiSettings>;
      setAnimationsEnabled(parsed.animationsEnabled !== false);
      if (parsed.successAnimationStyle === 'premium' || parsed.successAnimationStyle === 'rapido') {
        setSuccessAnimationStyle(parsed.successAnimationStyle);
      }
      if (typeof parsed.successAnimationDurationSec === 'number' && Number.isFinite(parsed.successAnimationDurationSec)) {
        const clamped = Math.min(4, Math.max(0.8, parsed.successAnimationDurationSec));
        setSuccessAnimationDurationSec(Number(clamped.toFixed(1)));
      }
      if (parsed.successAnimationIntensity === 'suave' || parsed.successAnimationIntensity === 'normal' || parsed.successAnimationIntensity === 'intensa') {
        setSuccessAnimationIntensity(parsed.successAnimationIntensity);
      }
      setWindowsHelloEnabled(parsed.windowsHelloEnabled === true);
    } catch {
      // use defaults
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

  return (
    <UIPreferencesContext.Provider value={{
      animationsEnabled, setAnimationsEnabled,
      successAnimationStyle, setSuccessAnimationStyle,
      successAnimationDurationSec, setSuccessAnimationDurationSec,
      successAnimationIntensity, setSuccessAnimationIntensity,
      windowsHelloEnabled, setWindowsHelloEnabled,
    }}>
      {children}
    </UIPreferencesContext.Provider>
  );
};

export const useUIPreferences = () => {
  const context = useContext(UIPreferencesContext);
  if (!context) throw new Error('useUIPreferences must be used within a UIPreferencesProvider');
  return context;
};
