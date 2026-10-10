import { useEffect, useState } from 'react';

export type Route = {
  page: 'command' | 'missions' | 'lab' | 'incidents' | 'academy' | 'journal' | 'play';
  id?: string;
  query: URLSearchParams;
};

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const query = new URLSearchParams(qs ?? '');
  const head = parts[0] ?? '';
  if (head === 'play') return { page: 'play', id: parts[1], query };
  if (head === 'missions' || head === 'lab' || head === 'incidents' || head === 'academy' || head === 'journal')
    return { page: head, query };
  return { page: 'command', query };
}

export function useRoute(): Route {
  const [h, setH] = useState(() => (typeof window === 'undefined' ? '' : window.location.hash));
  useEffect(() => {
    const on = () => setH(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return parseHash(h);
}

export const go = (path: string) => {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
};
