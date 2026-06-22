import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface UpdateStatus {
  hasUpdate: boolean;
  currentVersion: string;
  remoteVersion: string;
  isUpdating: boolean;
  isCompleted: boolean;
}

interface UpdateContextData {
  updateStatus: UpdateStatus;
  checkForUpdates: () => Promise<void>;
  applyUpdate: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextData>({} as UpdateContextData);

export const UpdateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    hasUpdate: false,
    currentVersion: '',
    remoteVersion: '',
    isUpdating: false,
    isCompleted: false
  });

  const checkForUpdates = async () => {
    try {
      const response = await fetch('/api/system/update/check');
      const data = await response.json();
      if (data.success) {
        setUpdateStatus(prev => ({
          ...prev,
          hasUpdate: data.hasUpdate,
          currentVersion: data.currentVersion,
          remoteVersion: data.remoteVersion
        }));
      }
    } catch (err) {
      console.error('[UPDATE] Erro ao verificar atualizações:', err);
    }
  };

  const applyUpdate = async () => {
    setUpdateStatus(prev => ({ ...prev, isUpdating: true }));
    try {
      await new Promise(r => setTimeout(r, 1500));
      const response = await fetch('/api/system/update/apply', { method: 'POST' });
      if (response.ok) {
        setUpdateStatus(prev => ({ ...prev, isCompleted: true }));
      }
    } catch (err) {
      console.error('[UPDATE] Erro ao aplicar atualização:', err);
      setUpdateStatus(prev => ({ ...prev, isUpdating: false }));
    }
  };

  useEffect(() => {
    checkForUpdates();
    const intervalId = window.setInterval(checkForUpdates, 3600000);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <UpdateContext.Provider value={{ updateStatus, checkForUpdates, applyUpdate }}>
      {children}
    </UpdateContext.Provider>
  );
};

export const useUpdate = () => {
  const context = useContext(UpdateContext);
  if (!context) throw new Error('useUpdate must be used within a UpdateProvider');
  return context;
};
