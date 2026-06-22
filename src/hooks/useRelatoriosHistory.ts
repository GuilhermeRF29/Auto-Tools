import { useState, useEffect, useRef } from 'react';

const CACHE_TTL = 5 * 60 * 1000;

const cache = new Map<string, { data: any[]; timestamp: number }>();

export function useRelatoriosHistory(enabled: boolean, userId?: number, limit = 50) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const disposedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !userId) return;
    disposedRef.current = false;

    const cacheKey = `${userId}:${limit}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setData(cached.data);
      return;
    }

    setLoading(true);
    fetch(`/api/relatorios-history?limit=${limit}&user_id=${userId}`)
      .then(res => res.json())
      .then(json => {
        if (disposedRef.current) return;
        const items = Array.isArray(json) ? json : [];
        cache.set(cacheKey, { data: items, timestamp: Date.now() });
        setData(items);
      })
      .catch(err => console.error('[useRelatoriosHistory]', err))
      .finally(() => {
        if (!disposedRef.current) setLoading(false);
      });

    return () => {
      disposedRef.current = true;
    };
  }, [enabled, userId, limit]);

  return { data, loading };
}
