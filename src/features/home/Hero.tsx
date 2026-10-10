import { ArrowRight, FlaskConical, Play } from 'lucide-react';
import { MISSIONS } from '@/content/missions';
import { currentStage } from '@/content/journey';
import { TAGLINE, VISION } from '@/content/positioning';
import { useMissionState } from '@/entities/mission/MissionButtons';
import { useGame } from '@/game/store';
import { go } from '@/shared/lib/nav';
import { HeroArt } from '@/features/home/HeroArt';

export function Hero() {
  const { progress, saved, status, unmet, recommended, recommendation } = useMissionState();
  const mode = useGame((s) => s.settings.mode);
  const setMode = useGame((s) => s.setMode);
  const stage = currentStage(progress.completed);
  const started = Object.keys(saved).some((id) => saved[id].ops.length > 0) || progress.xp > 0;
  return (
    <header className="home-hero">
      <div className="home-hero-copy">
        <span className="eyebrow">Engineering simulation platform</span>
        <h1>{TAGLINE}</h1>
        <p className="lede">{VISION}</p>
        <p className="muted tiny">Everything is simulated: no cloud account, no real charges, nothing to break but your assumptions.</p>
        <div className="home-hero-cta">
          {recommended ? (
            <>
              <button className="btn btn-primary btn-lg" onClick={() => go(`/play/${recommended.id}`)}>
                <Play size={16} /> {started ? 'Continue: ' : 'Start: '}
                {recommended.title}
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => go('/lab')}>
                <FlaskConical size={16} /> Open the sandbox
              </button>
            </>
          ) : (
            <button className="btn btn-primary btn-lg" onClick={() => go('/lab')}>
              <FlaskConical size={16} /> Campaign complete: explore the sandbox
            </button>
          )}
        </div>
        {recommendation && started && <p className="muted tiny reco-why">Why this one: {recommendation.reason}</p>}
        <div className="home-hero-meta">
          <span className="chip chip-info">
            Stage {stage.level}: {stage.title}
          </span>
          <div className="mode-pick" role="radiogroup" aria-label="Difficulty mode">
            {(['beginner', 'intermediate', 'advanced'] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                className={mode === m ? 'on' : ''}
                onClick={() => setMode(m)}
                title={
                  m === 'beginner'
                    ? 'Explains concepts and guides you'
                    : m === 'intermediate'
                      ? 'Less guidance, independent diagnosis'
                      : 'Ambiguity, noisy evidence, trade-offs'
                }
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <HeroArt />
      <button
        className="scrollcue"
        onClick={() => document.getElementById('journey')?.scrollIntoView({ behavior: 'smooth' })}
        aria-label="See the journey"
      >
        The journey <ArrowRight size={14} />
      </button>
    </header>
  );
}
