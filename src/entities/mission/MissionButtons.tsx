import { Play as PlayIcon, RotateCcw } from 'lucide-react';
import type { Mission } from '@/content/missions/types';
import { useGame } from '@/game/store';
import { go } from '@/app/router';

export function useMissionState() {
  const progress = useGame((s) => s.progress);
  const saved = useGame((s) => s.saved);
  const status = (m: Mission): 'completed' | 'progress' | 'new' => (progress.completed[m.id]?.passed ? 'completed' : saved[m.id] && saved[m.id].ops.length > 0 ? 'progress' : 'new');
  const unmet = (m: Mission) => m.prerequisites.filter((p) => !progress.completed[p]?.passed);
  return { progress, saved, status, unmet };
}

export function MissionButtons({ m }: { m: Mission }) {
  const { status } = useMissionState();
  const retry = useGame((s) => s.retryMission);
  const st = status(m);
  return (
    <div className="row-gap">
      <button className="btn btn-primary btn-sm" onClick={() => go(`/play/${m.id}`)}><PlayIcon size={14} /> {st === 'progress' ? 'Continue' : st === 'completed' ? 'Review / replay' : m.kind === 'incident' ? 'Respond' : 'Start'}</button>
      {st !== 'new' && <button className="btn btn-ghost btn-sm" onClick={() => { retry(m.id); go(`/play/${m.id}`); }}><RotateCcw size={14} /> Fresh attempt</button>}
    </div>
  );
}
