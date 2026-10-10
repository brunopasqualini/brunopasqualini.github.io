import { Award, Lock } from 'lucide-react';
import { ACHIEVEMENTS, levelFromXp, xpForLevel } from '@/game/progression';
import { useGame } from '@/game/store';
import { Kpi, Meter } from '@/shared/ui/common';
import { when } from '@/shared/lib/fmt';

export function AchievementsPage() {
  const progress = useGame((s) => s.progress);
  const unlocked = ACHIEVEMENTS.filter((a) => progress.achievements[a.id]);
  const level = levelFromXp(progress.xp);
  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Achievements</h1>
          <p className="muted">
            Earned for engineering behaviour, not clicking: unaided fixes, least privilege, blameless postmortems, staying under budget.
          </p>
        </div>
      </header>
      <div className="grid-kpi">
        <Kpi label="Unlocked" value={`${unlocked.length} / ${ACHIEVEMENTS.length}`} kind="info" />
        <Kpi label="Level" value={level} sub={`${progress.xp} XP total`} />
        <Kpi label="Next level" value={`${xpForLevel(level + 1) - progress.xp} XP`} sub={`at ${xpForLevel(level + 1)} XP`} />
        <Kpi label="Missions passed" value={Object.values(progress.completed).filter((o) => o.passed).length} />
      </div>
      <ul className="badges-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = progress.achievements[a.id];
          return (
            <li key={a.id} className={`ach ${at ? 'ach-on' : ''}`}>
              <span className="ach-ico" aria-hidden="true">
                {at ? <Award size={22} /> : <Lock size={18} />}
              </span>
              <div>
                <b>{a.title}</b>
                <p>{a.desc}</p>
                <small className="muted">{at ? `Unlocked ${when(at)}` : 'Locked'}</small>
              </div>
            </li>
          );
        })}
      </ul>
      <h2 className="section-title">Skill branches</h2>
      <p className="muted tiny">
        Levels in each branch are earned from mission outcomes. See the Learning page for the evidence behind each level.
      </p>
      <div className="meters-grid">
        {Object.entries(progress.skillXp).map(([id, xp]) => (
          <div key={id}>
            <div className="row-between tiny">
              <span>{id.toUpperCase()}</span>
              <span className="muted mono">{xp} XP</span>
            </div>
            <Meter value={xp} max={400} kind="info" label={`${id} skill XP`} />
          </div>
        ))}
      </div>
    </div>
  );
}
