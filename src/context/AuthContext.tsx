import React, { createContext, useContext, useState, ReactNode } from 'react';
import type { User } from '../types';

interface AuthContextData {
  user: User | null;
  setUser: (user: User | null) => void;
  isLoggingIn: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);
const AUTH_USER_STORAGE_KEY = 'autotools:auth:user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [userState, setUserState] = useState<User | null>(() => {
    try {
      // Keep auth only for the current browser tab/session for better security.
      const raw = sessionStorage.getItem(AUTH_USER_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<User>;
      if (!parsed || typeof parsed !== 'object') return null;
      if (!parsed.id || !parsed.usuario) return null;
      return parsed as User;
    } catch {
      return null;
    }
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const setUser = (nextUser: User | null) => {
    setUserState(nextUser);
    try {
      if (!nextUser) {
        sessionStorage.removeItem(AUTH_USER_STORAGE_KEY);
        localStorage.removeItem(AUTH_USER_STORAGE_KEY); // cleanup legacy persistence
        return;
      }
      sessionStorage.setItem(AUTH_USER_STORAGE_KEY, JSON.stringify(nextUser));
      localStorage.removeItem(AUTH_USER_STORAGE_KEY); // cleanup legacy persistence
    } catch {
      // Se o storage falhar, a sessão em memória continua válida.
    }
  };

  // Load from local storage if desired, but currently it was just state initialized to null
  // We'll keep the same behavior: just state, no local storage for now (as in original App.tsx)

  const logout = () => {
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user: userState, setUser, isLoggingIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
