import { Award, FlaskConical, GraduationCap, HelpCircle, Home, NotebookPen, Settings as SettingsIcon, Siren, Target } from 'lucide-react';
import { Link, NavLink } from 'react-router';
import { currentStage } from '@/content/journey';
import { levelFromXp, xpForLevel } from '@/game/progression';
import { useGame } from '@/game/store';
import { BrandMark } from '@/shared/ui/BrandMark';

export const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/missions', label: 'Missions', icon: Target },
  { to: '/incidents', label: 'Incidents', icon: Siren },
  { to: '/lab', label: 'Lab', icon: FlaskConical },
  { to: '/learning', label: 'Learning', icon: GraduationCap },
  { to: '/journal', label: 'Journal', icon: NotebookPen },
  { to: '/achievements', label: 'Achievements', icon: Award },
] as const;

function PlayerBadge() {
  const progress = useGame((s) => s.progress);
  const level = levelFromXp(progress.xp);
  const lo = xpForLevel(level);
  const hi = xpForLevel(level + 1);
  const pct = Math.max(0, Math.min(1, (progress.xp - lo) / (hi - lo)));
  const stage = currentStage(progress.completed);
  return (
    <div className="player" title={`${progress.xp} XP total`}>
      <span className="player-avatar" aria-hidden="true">
        {level}
      </span>
      <div className="player-text">
        <b>
          Level {level} <small>{stage.title}</small>
        </b>
        <div
          className="player-bar"
          role="progressbar"
          aria-label="XP to next level"
          aria-valuenow={Math.round(pct * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i style={{ width: `${pct * 100}%` }} />
        </div>
      </div>
      <span className="player-xp">
        {progress.xp.toLocaleString()} / {hi.toLocaleString()} XP
      </span>
    </div>
  );
}

export function TopNav({ onHelp, onSettings }: { onHelp: () => void; onSettings: () => void }) {
  const mode = useGame((s) => s.settings.mode);
  return (
    <header className="topnav">
      <Link className="brand" to="/" aria-label="Engineering Ops home">
        <BrandMark />
        <span className="brand-text">
          <b>Engineering Ops</b>
          <small>Build. Break. Learn.</small>
        </span>
      </Link>
      <nav className="navtabs" aria-label="Primary">
        {NAV.map((n) => {
          const Icon = n.icon;
          return (
            <NavLink key={n.to} to={n.to} end={'end' in n ? n.end : false} className={({ isActive }) => `navtab ${isActive ? 'on' : ''}`}>
              <Icon size={16} aria-hidden="true" />
              <span>{n.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="top-right">
        <PlayerBadge />
        <span className="modechip" title="Difficulty mode">
          {mode}
        </span>
        <button className="icon-btn" aria-label="How to play" onClick={onHelp}>
          <HelpCircle size={18} />
        </button>
        <button className="icon-btn" aria-label="Settings" onClick={onSettings}>
          <SettingsIcon size={18} />
        </button>
      </div>
    </header>
  );
}
