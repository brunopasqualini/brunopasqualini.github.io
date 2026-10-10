import { useEffect, useMemo } from 'react';
import { createHashRouter, RouterProvider } from 'react-router';
import { routes } from '@/app/routes';
import { bindNavigator } from '@/shared/lib/nav';

export default function App() {
  const router = useMemo(() => createHashRouter(routes), []);
  useEffect(() => {
    bindNavigator((to) => router.navigate(to));
    return () => router.dispose();
  }, [router]);
  return <RouterProvider router={router} />;
}
