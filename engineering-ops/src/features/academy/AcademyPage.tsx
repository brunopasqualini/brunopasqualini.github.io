import { Lock } from 'lucide-react';
import { useState } from 'react';
import { MISSIONS } from '@/content/missions';
import type { SkillId } from '@/content/missions/types';
import { skillLevel, SKILLS, SKILL_THRESHOLDS, SKILL_TITLES } from '@/game/progression';
import { LESSONS } from '@/content/academy';
import { useGame } from '@/game/store';
import { Chip, Meter, Empty } from '@/shared/ui/common';
import { when } from '@/shared/lib/fmt';
import { go } from '@/shared/lib/nav';

export function AcademyPage() {
  const progress = useGame((s) => s.progress);
  const [sel, setSel] = useState<SkillId>('sd');
  const skill = SKILLS.find((s) => s.id === sel)!;
  const xp = progress.skillXp[sel];
  const lv = skillLevel(xp);
  const ev = progress.evidence[sel];
  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Engineering Academy</h1>
          <p className="muted">
            Ten skill branches. Levels are earned from mission outcomes — each level shows the evidence behind it. Lessons unlock as you
            demonstrate the skill.
          </p>
          <button className="btn btn-ghost btn-sm" onClick={() => go('/paths')}>
            Follow a learning path for your role
          </button>
        </div>
      </header>
      <div className="skill-grid">
        {SKILLS.map((s) => {
          const l = skillLevel(progress.skillXp[s.id]);
          return (
            <button
              key={s.id}
              className={`skill-card ${sel === s.id ? 'on' : ''}`}
              onClick={() => setSel(s.id)}
              aria-pressed={sel === s.id}
            >
              <b>{s.label}</b>
              <span className="muted tiny">
                {SKILL_TITLES[l]} · level {l}
              </span>
              <Meter value={progress.skillXp[s.id]} max={SKILL_THRESHOLDS[Math.min(5, l + 1)]} kind="info" label={s.label} />
            </button>
          );
        })}
      </div>
      <section className="card skill-detail">
        <div className="row-between">
          <h2>{skill.label}</h2>
          <Chip kind="info">
            {SKILL_TITLES[lv]} · {xp} XP
          </Chip>
        </div>
        <p className="muted">{skill.blurb}</p>
        <div className="levels">
          {SKILL_THRESHOLDS.slice(1).map((t, i) => (
            <div key={t} className={`lvl ${lv >= i + 1 ? 'on' : ''}`}>
              <b>{SKILL_TITLES[i + 1]}</b>
              <span>{t} XP</span>
            </div>
          ))}
        </div>
        <div className="cols">
          <div>
            <h3>Lessons</h3>
            <ul className="lessons">
              {LESSONS[sel].map((l) => {
                const open = xp >= l.unlockXp;
                return (
                  <li key={l.id} className={open ? '' : 'locked'}>
                    <div className="row-between">
                      <b>
                        {open ? (
                          l.title
                        ) : (
                          <>
                            <Lock size={13} /> {l.title}
                          </>
                        )}
                      </b>
                      {!open && <span className="muted tiny">unlocks at {l.unlockXp} XP</span>}
                    </div>
                    {open ? (
                      <>
                        <p>{l.body}</p>
                        <p className="takeaway">▸ {l.takeaway}</p>
                        {l.mission && (
                          <button className="link" onClick={() => go(`/play/${l.mission}`)}>
                            Practise in: {MISSIONS.find((m) => m.id === l.mission)?.title}
                          </button>
                        )}
                      </>
                    ) : (
                      <p className="muted tiny">
                        Earn {l.unlockXp - xp} more XP in this branch.{' '}
                        {l.mission && `Try “${MISSIONS.find((m) => m.id === l.mission)?.title}”.`}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div>
            <h3>Evidence for this level</h3>
            {ev.length === 0 ? (
              <Empty title="No evidence yet">
                Pass missions that exercise this skill:{' '}
                {MISSIONS.filter((m) => (m.skills[sel] ?? 0) > 0)
                  .map((m) => m.title)
                  .join(', ')}
                .
              </Empty>
            ) : (
              <ul className="rows">
                {ev.map((e, i) => (
                  <li key={i}>
                    <div>
                      <b>{e.title}</b>
                      <p className="muted">{e.note}</p>
                    </div>
                    <span className="muted tiny">{when(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
