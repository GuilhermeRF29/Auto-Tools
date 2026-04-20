import React, { createContext, useContext, useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import type { RunningTask } from '../types';

interface TaskContextData {
  runningTasks: RunningTask[];
  startAutomation: (payload: any) => Promise<string | null>;
  cancelAutomation: (id: string) => Promise<void>;
}

const TaskContext = createContext<TaskContextData>({} as TaskContextData);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);

  const lastActivityRef = useRef<Map<string, number>>(new Map());
  const eventSourcesRef = useRef<Map<string, EventSource>>(new Map());

  const startAutomation = useCallback(async (payload: any): Promise<string | null> => {
    try {
      const response = await fetch('/api/run-automation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const { jobId } = await response.json();
      const repName = payload.name || 'Automação';

      const newTask: RunningTask = {
        id: jobId,
        name: repName,
        progress: 0,
        progressTarget: 0,
        status: 'running',
        startTime: new Date(),
        lastUpdateTime: new Date(),
        lastProgressChangeTime: new Date(),
      };
      
      setRunningTasks(prev => [newTask, ...prev]);
      lastActivityRef.current.set(jobId, Date.now());

      const eventSource = new EventSource(`/api/automation-progress/${jobId}`);
      eventSourcesRef.current.set(jobId, eventSource);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        lastActivityRef.current.set(jobId, Date.now());
        const receivedAt = new Date();

        setRunningTasks(prev => prev.map(t => {
          if (t.id === jobId) {
            const incomingProgress = Number.isFinite(data.progress) ? Number(data.progress) : (t.progressTarget ?? t.progress);
            const clampedProgress = Math.max(0, Math.min(100, incomingProgress));
            const isRunning = data.status === 'running';
            const previousProgress = typeof t.progressTarget === 'number' ? t.progressTarget : t.progress;
            const progressed = clampedProgress > previousProgress;
            return {
              ...t,
              progress: isRunning ? t.progress : clampedProgress,
              progressTarget: clampedProgress,
              status: data.status,
              message: data.message,
              lastUpdateTime: receivedAt,
              lastProgressChangeTime: progressed ? receivedAt : t.lastProgressChangeTime,
            };
          }
          return t;
        }));

        if (data.status === 'completed' || data.status === 'failed') {
          eventSource.close();
          eventSourcesRef.current.delete(jobId);
          lastActivityRef.current.delete(jobId);

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

          setTimeout(() => {
            setRunningTasks(prev => prev.filter(t => t.id !== jobId));
          }, 10000);
        }
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          eventSource.close();
          eventSourcesRef.current.delete(jobId);
          lastActivityRef.current.delete(jobId);
        }
      };

      return jobId;
    } catch (e) {
      console.error('Falha ao iniciar automação', e);
      return null;
    }
  }, []);

  const cancelAutomation = useCallback(async (id: string) => {
    try {
      await fetch(`/api/cancel-automation/${id}`, { method: 'POST' });

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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRunningTasks(prev => {
        let changed = false;
        const next = prev.map(task => {
          const target = typeof task.progressTarget === 'number' ? task.progressTarget : task.progress;

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

  return (
    <TaskContext.Provider value={{ runningTasks, startAutomation, cancelAutomation }}>
      {children}
    </TaskContext.Provider>
  );
};

export const useTasks = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTasks must be used within a TaskProvider');
  }
  return context;
};
