import { Award, Clock, Flame, Siren, Target, TrendingUp } from 'lucide-react';
import { MISSIONS } from '@/content/missions';
import { ACHIEVEMENTS, levelFromXp, skillLevel, SKILLS, SKILL_THRESHOLDS, SKILL_TITLES, xpForLevel } from '@/game/progression';
import { Chip, Kpi, Meter, Empty } from '@/shared/ui/common';
import { pct0, usd2, when } from '@/shared/lib/fmt';
import { go } from '@/shared/lib/nav';
import { MissionButtons, useMissionState } from '@/entities/mission/MissionButtons';

export function Dashboard() {
  const { progress, saved, status, unmet, recommended, recommendation } = useMissionState();
  const level = levelFromXp(progress.xp);
  const cur = xpForLevel(level);
  const nxt = xpForLevel(level + 1);
  const done = MISSIONS.filter((m) => progress.completed[m.id]?.passed).length;
  const incidents = MISSIONS.filter((m) => m.kind === 'incident' && status(m) !== 'completed');
  const resume = Object.entries(saved)
    .filter(([id, s]) => id !== 'lab' && s.ops.length > 0 && !progress.completed[id])
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
  const best = Object.values(progress.completed);
  const avgAvail = best.length ? best.reduce((s, o) => s + o.metrics.availability, 0) / best.length : undefined;
  const totalCost = best.reduce((s, o) => s + o.metrics.cost, 0);
  const sec = best.length ? best.reduce((s, o) => s + o.metrics.securityScore, 0) / best.length : undefined;
  const topSkills = [...SKILLS].sort((a, b) => progress.skillXp[b.id] - progress.skillXp[a.id]);
  const ach = Object.entries(progress.achievements).sort((a, b) => b[1] - a[1]);

  return (
    <div className="dash">
      <h2 className="section-title">Your progress</h2>
      <div className="grid-kpi">
        <Kpi
          label="Engineer level"
          value={`Level ${level}`}
          sub={
            <>
              <Meter value={progress.xp - cur} max={nxt - cur} kind="info" label="XP to next level" />
              <span className="tiny">
                {progress.xp} XP · {nxt - progress.xp} to level {level + 1}
              </span>
            </>
          }
          kind="info"
        />
        <Kpi
          label="Missions completed"
          value={`${done} / ${MISSIONS.length}`}
          sub={<Meter value={done} max={MISSIONS.length} kind="ok" label="Campaign progress" />}
        />
        <Kpi
          label="Portfolio availability"
          value={avgAvail != null ? pct0(avgAvail) : '—'}
          sub="average of your best solutions"
          kind={avgAvail == null ? undefined : avgAvail >= 99 ? 'ok' : 'warn'}
        />
        <Kpi
          label="Portfolio security"
          value={sec != null ? `${sec.toFixed(0)}/100` : '—'}
          sub={`Estimated spend ${usd2(totalCost)}/mo (simulated)`}
          kind={sec == null ? undefined : sec >= 90 ? 'ok' : 'warn'}
        />
      </div>

      <div className="cols">
        <section className="card">
          <h2>
            <Siren size={16} /> Active incidents
          </h2>
          {incidents.length === 0 ? (
            <Empty title="No open incidents">Everything on call is resolved. Try the chaos drills in the Incident Response section.</Empty>
          ) : (
            <ul className="rows">
              {incidents.map((m) => (
                <li key={m.id}>
                  <div>
                    <b>{m.title}</b>
                    <p className="muted">{m.tagline}</p>
                    <div className="chips">
                      <Chip kind="crit">SEV-{m.difficulty === 'Advanced' ? 1 : 2}</Chip>
                      <Chip>{m.difficulty}</Chip>
                      {saved[m.id]?.ops.length ? <Chip kind="warn">in progress</Chip> : null}
                    </div>
                  </div>
                  <MissionButtons m={m} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>
            <Target size={16} /> Recommended next challenge
          </h2>
          {recommended ? (
            <div className="reco">
              <div className="chips">
                <Chip kind="info">Mission {recommended.number}</Chip>
                <Chip>{recommended.difficulty}</Chip>
                <Chip kind={recommended.kind === 'incident' ? 'crit' : 'info'}>{recommended.kind}</Chip>
                <Chip>
                  <Clock size={11} /> ~{recommended.estMinutes}m
                </Chip>
              </div>
              <h3>{recommended.title}</h3>
              {recommendation && (
                <p className="reco-why">
                  <b>Why this one:</b> {recommendation.reason}
                </p>
              )}
              <p>{recommended.tagline}</p>
              <ul className="list">
                {recommended.learning.slice(0, 3).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              {unmet(recommended).length > 0 && (
                <p className="tiny warn">
                  Recommended first:{' '}
                  {unmet(recommended)
                    .map((id) => MISSIONS.find((x) => x.id === id)?.title)
                    .join(', ')}
                  .
                </p>
              )}
              <MissionButtons m={recommended} />
              {resume && resume[0] !== recommended.id && (
                <p className="tiny muted">
                  You also have{' '}
                  <button className="link" onClick={() => go(`/play/${resume[0]}`)}>
                    {MISSIONS.find((m) => m.id === resume[0])?.title}
                  </button>{' '}
                  in progress.
                </p>
              )}
            </div>
          ) : (
            <Empty title="Campaign complete">
              You have passed every mission. Explore the Architecture Lab or replay missions in a harder mode.
            </Empty>
          )}
        </section>

        <section className="card">
          <h2>
            <TrendingUp size={16} /> Skills
          </h2>
          <ul className="skillbars">
            {topSkills.map((s) => {
              const lv = skillLevel(progress.skillXp[s.id]);
              return (
                <li key={s.id}>
                  <div className="row-between">
                    <span>{s.label}</span>
                    <span className="muted tiny">{SKILL_TITLES[lv]}</span>
                  </div>
                  <Meter value={progress.skillXp[s.id]} max={SKILL_THRESHOLDS[Math.min(5, lv + 1)]} kind="info" label={s.label} />
                </li>
              );
            })}
          </ul>
          <button className="link" onClick={() => go('/learning')}>
            Open Engineering Academy →
          </button>
        </section>

        <section className="card">
          <h2>
            <Award size={16} /> Recent achievements
          </h2>
          {ach.length === 0 ? (
            <Empty title="None yet">Complete missions to earn achievements.</Empty>
          ) : (
            <ul className="rows">
              {ach.slice(0, 5).map(([id, t]) => {
                const a = ACHIEVEMENTS.find((x) => x.id === id)!;
                return (
                  <li key={id}>
                    <div>
                      <b>{a.title}</b>
                      <p className="muted">{a.desc}</p>
                    </div>
                    <span className="muted tiny">{when(t)}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted tiny">
            {ach.length} / {ACHIEVEMENTS.length} unlocked
          </p>
        </section>

        <section className="card span2">
          <h2>
            <Flame size={16} /> Campaign overview
          </h2>
          <div className="campaign-strip">
            {MISSIONS.map((m) => {
              const o = progress.completed[m.id];
              const st = status(m);
              return (
                <button key={m.id} className={`strip-item st-${st}`} onClick={() => go(`/play/${m.id}`)}>
                  <span className="n">{m.number}</span>
                  <b>{m.title}</b>
                  <small>{o ? `Grade ${o.grade} · ${o.overall}` : st === 'progress' ? 'in progress' : m.difficulty}</small>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
