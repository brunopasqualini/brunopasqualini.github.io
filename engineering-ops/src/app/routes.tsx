import type { RouteObject } from 'react-router';
import { redirect } from 'react-router';
import { AppShell } from '@/app/AppShell';
import { NotFound } from '@/app/NotFound';

/**
 * Every page is a lazy route so the landing page ships without the simulator, canvas or charts.
 * Hash routing is deliberate: the app is a static site with no server-side rewrites.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, lazy: async () => ({ Component: (await import('@/features/home/HomePage')).HomePage }) },
      { path: 'missions', lazy: async () => ({ Component: (await import('@/features/missions/MissionsPage')).MissionsPage }) },
      { path: 'incidents', lazy: async () => ({ Component: (await import('@/features/incidents/IncidentsPage')).IncidentsPage }) },
      { path: 'learning', lazy: async () => ({ Component: (await import('@/features/academy/AcademyPage')).AcademyPage }) },
      { path: 'paths', lazy: async () => ({ Component: (await import('@/features/paths/PathsPage')).PathsPage }) },
      { path: 'academy', loader: () => redirect('/learning') },
      { path: 'journal', lazy: async () => ({ Component: (await import('@/features/journal/JournalPage')).JournalPage }) },
      {
        path: 'achievements',
        lazy: async () => ({ Component: (await import('@/features/achievements/AchievementsPage')).AchievementsPage }),
      },
      { path: 'lab', lazy: async () => ({ Component: (await import('@/features/workspace/PlayPage')).LabRoute }) },
      { path: 'play/:missionId', lazy: async () => ({ Component: (await import('@/features/workspace/PlayPage')).PlayRoute }) },
      { path: '*', element: <NotFound /> },
    ],
  },
];
