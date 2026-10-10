import { Audiences } from '@/features/home/Audiences';
import { Dashboard } from '@/features/home/Dashboard';
import { Hero } from '@/features/home/Hero';
import { JourneyMap } from '@/features/home/JourneyMap';
import { Pillars } from '@/features/home/Pillars';
import { useGame } from '@/game/store';

export function HomePage() {
  const returning = useGame((s) => s.progress.xp > 0 || Object.keys(s.progress.completed).length > 0);
  return (
    <div className="page home">
      <Hero />
      {returning && <Dashboard />}
      <JourneyMap />
      <Pillars />
      <Audiences />
      {!returning && <Dashboard />}
    </div>
  );
}
