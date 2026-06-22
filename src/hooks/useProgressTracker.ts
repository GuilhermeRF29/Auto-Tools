import { useState, useEffect, useRef, useCallback } from 'react';

interface ProgressState {
  progress: number;
  message: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'idle';
  elapsed: number;
}

export function useProgressTracker(jobId: string | null) {
  const [state, setState] = useState<ProgressState>({
    progress: 0,
    message: '',
    status: 'idle',
    elapsed: 0,
  });
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!jobId) return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(`/api/automation-progress/${jobId}`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setState({
          progress: data.progress ?? 0,
          message: data.message ?? '',
          status: data.status ?? 'running',
          elapsed: data.t ?? 0,
        });

        if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
          es.close();
          eventSourceRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [jobId]);

  useEffect(() => {
    if (jobId && state.status === 'idle') {
      connect();
    }
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [jobId, connect, state.status]);

  const reset = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState({ progress: 0, message: '', status: 'idle', elapsed: 0 });
  }, []);

  return { ...state, connect, reset };
}
