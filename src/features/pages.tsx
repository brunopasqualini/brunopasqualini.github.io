import { Award, Clock, Flame, Lock, Play as PlayIcon, RotateCcw, Siren, Target, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { MISSIONS } from '@/content/missions';
import type { Mission, SkillId } from '@/content/missions/types';
import { ACHIEVEMENTS, levelFromXp, skillLevel, SKILLS, SKILL_THRESHOLDS, SKILL_TITLES, xpForLevel } from '@/game/progression';
import { LESSONS } from '@/content/academy';
import { TEMPLATES } from '@/content/templates';
import { useGame } from '@/game/store';
import { Chip, Kpi, Meter, Empty, Tabs } from '@/shared/ui/common';
import { pct0, usd2, when } from '@/shared/lib/fmt';
import { go } from '@/app/router';

function useMissionState() {
  const progress = useGame((s) => s.progress);
  const saved = useGame((s) => s.saved);
  const status = (m: Mission): 'completed' | 'progress' | 'new' => (progress.completed[m.id]?.passed ? 'completed' : saved[m.id] && saved[m.id].ops.length > 0 ? 'progress' : 'new');
  const unmet = (m: Mission) => m.prerequisites.filter((p) => !progress.completed[p]?.passed);
  return { progress, saved, status, unmet };
}

function MissionButtons({ m }: { m: Mission }) {
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

export function CommandCenter() {
  const { progress, saved, status, unmet } = useMissionState();
  const mode = useGame((s) => s.settings.mode);
  const setMode = useGame((s) => s.setMode);
  const level = levelFromXp(progress.xp);
  const cur = xpForLevel(level);
  const nxt = xpForLevel(level + 1);
  const done = MISSIONS.filter((m) => progress.completed[m.id]?.passed).length;
  const recommended = MISSIONS.find((m) => status(m) !== 'completed' && unmet(m).length === 0) ?? MISSIONS.find((m) => status(m) !== 'completed');
  const incidents = MISSIONS.filter((m) => m.kind === 'incident' && status(m) !== 'completed');
  const resume = Object.entries(saved).filter(([id, s]) => id !== 'lab' && s.ops.length > 0 && !progress.completed[id]).sort((a, b) => b[1].updatedAt - a[1].updatedAt)[0];
  const best = Object.values(progress.completed);
  const avgAvail = best.length ? best.reduce((s, o) => s + o.metrics.availability, 0) / best.length : undefined;
  const totalCost = best.reduce((s, o) => s + o.metrics.cost, 0);
  const sec = best.length ? best.reduce((s, o) => s + o.metrics.securityScore, 0) / best.length : undefined;
  const topSkills = [...SKILLS].sort((a, b) => progress.skillXp[b.id] - progress.skillXp[a.id]);
  const ach = Object.entries(progress.achievements).sort((a, b) => b[1] - a[1]);

  return (
    <div className="page">
      <header className="hero">
        <div>
          <h1>Command Center</h1>
          <p className="muted">Build. Break. Learn. Practise engineering judgment on simulated systems — nothing here touches a real cloud account.</p>
        </div>
        <div className="mode-pick" role="radiogroup" aria-label="Difficulty mode">
          {(['beginner', 'intermediate', 'advanced'] as const).map((m) => <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)} title={m === 'beginner' ? 'Explains concepts and guides you' : m === 'intermediate' ? 'Less guidance, independent diagnosis' : 'Ambiguity, noisy evidence, trade-offs'}>{m}</button>)}
        </div>
      </header>

      <div className="grid-kpi">
        <Kpi label="Engineer level" value={`Level ${level}`} sub={<><Meter value={progress.xp - cur} max={nxt - cur} kind="info" label="XP to next level" /><span className="tiny">{progress.xp} XP · {nxt - progress.xp} to level {level + 1}</span></>} kind="info" />
        <Kpi label="Missions completed" value={`${done} / ${MISSIONS.length}`} sub={<Meter value={done} max={MISSIONS.length} kind="ok" label="Campaign progress" />} />
        <Kpi label="Portfolio availability" value={avgAvail != null ? pct0(avgAvail) : '—'} sub="average of your best solutions" kind={avgAvail == null ? undefined : avgAvail >= 99 ? 'ok' : 'warn'} />
        <Kpi label="Portfolio security" value={sec != null ? `${sec.toFixed(0)}/100` : '—'} sub={`Estimated spend ${usd2(totalCost)}/mo (simulated)`} kind={sec == null ? undefined : sec >= 90 ? 'ok' : 'warn'} />
      </div>

      <div className="cols">
        <section className="card">
          <h2><Siren size={16} /> Active incidents</h2>
          {incidents.length === 0 ? <Empty title="No open incidents">Everything on call is resolved. Try the chaos drills in the Incident Response section.</Empty> : (
            <ul className="rows">
              {incidents.map((m) => (
                <li key={m.id}>
                  <div><b>{m.title}</b><p className="muted">{m.tagline}</p><div className="chips"><Chip kind="crit">SEV-{m.difficulty === 'Advanced' ? 1 : 2}</Chip><Chip>{m.difficulty}</Chip>{saved[m.id]?.ops.length ? <Chip kind="warn">in progress</Chip> : null}</div></div>
                  <MissionButtons m={m} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2><Target size={16} /> Recommended next challenge</h2>
          {recommended ? (
            <div className="reco">
              <div className="chips"><Chip kind="info">Mission {recommended.number}</Chip><Chip>{recommended.difficulty}</Chip><Chip kind={recommended.kind === 'incident' ? 'crit' : 'info'}>{recommended.kind}</Chip><Chip><Clock size={11} /> ~{recommended.estMinutes}m</Chip></div>
              <h3>{recommended.title}</h3>
              <p>{recommended.tagline}</p>
              <ul className="list">{recommended.learning.slice(0, 3).map((l) => <li key={l}>{l}</li>)}</ul>
              {unmet(recommended).length > 0 && <p className="tiny warn">Recommended first: {unmet(recommended).map((id) => MISSIONS.find((x) => x.id === id)?.title).join(', ')}.</p>}
              <MissionButtons m={recommended} />
              {resume && resume[0] !== recommended.id && <p className="tiny muted">You also have <button className="link" onClick={() => go(`/play/${resume[0]}`)}>{MISSIONS.find((m) => m.id === resume[0])?.title}</button> in progress.</p>}
            </div>
          ) : <Empty title="Campaign complete">You have passed every mission. Explore the Architecture Lab or replay missions in a harder mode.</Empty>}
        </section>

        <section className="card">
          <h2><TrendingUp size={16} /> Skills</h2>
          <ul className="skillbars">
            {topSkills.map((s) => { const lv = skillLevel(progress.skillXp[s.id]); return <li key={s.id}><div className="row-between"><span>{s.label}</span><span className="muted tiny">{SKILL_TITLES[lv]}</span></div><Meter value={progress.skillXp[s.id]} max={SKILL_THRESHOLDS[Math.min(5, lv + 1)]} kind="info" label={s.label} /></li>; })}
          </ul>
          <button className="link" onClick={() => go('/academy')}>Open Engineering Academy →</button>
        </section>

        <section className="card">
          <h2><Award size={16} /> Recent achievements</h2>
          {ach.length === 0 ? <Empty title="None yet">Complete missions to earn achievements.</Empty> : <ul className="rows">{ach.slice(0, 5).map(([id, t]) => { const a = ACHIEVEMENTS.find((x) => x.id === id)!; return <li key={id}><div><b>{a.title}</b><p className="muted">{a.desc}</p></div><span className="muted tiny">{when(t)}</span></li>; })}</ul>}
          <p className="muted tiny">{ach.length} / {ACHIEVEMENTS.length} unlocked</p>
        </section>

        <section className="card span2">
          <h2><Flame size={16} /> Campaign overview</h2>
          <div className="campaign-strip">
            {MISSIONS.map((m) => { const o = progress.completed[m.id]; const st = status(m); return <button key={m.id} className={`strip-item st-${st}`} onClick={() => go(`/play/${m.id}`)}><span className="n">{m.number}</span><b>{m.title}</b><small>{o ? `Grade ${o.grade} · ${o.overall}` : st === 'progress' ? 'in progress' : m.difficulty}</small></button>; })}
          </div>
        </section>
      </div>
    </div>
  );
}

export function MissionControl() {
  const { progress, saved, status, unmet } = useMissionState();
  return (
    <div className="page">
      <header className="hero"><div><h1>Mission Control</h1><p className="muted">A campaign of progressively harder engineering scenarios. Each is data-driven: evidence, constraints and success criteria — not a single “right” diagram.</p></div></header>
      <ol className="campaign">
        {MISSIONS.map((m) => {
          const st = status(m);
          const o = progress.completed[m.id];
          const missing = unmet(m);
          return (
            <li key={m.id} className={`mission-card st-${st}`}>
              <div className="mc-num">{m.number}</div>
              <div className="mc-body">
                <div className="row-between"><h3>{m.title}</h3><div className="chips"><Chip kind={m.kind === 'incident' ? 'crit' : 'info'}>{m.kind}</Chip><Chip kind={m.difficulty === 'Beginner' ? 'ok' : m.difficulty === 'Intermediate' ? 'warn' : 'crit'}>{m.difficulty}</Chip><Chip><Clock size={11} /> ~{m.estMinutes}m</Chip></div></div>
                <p>{m.tagline}</p>
                <div className="mc-cols">
                  <div><h5>Learning objectives</h5><ul className="list">{m.learning.map((l) => <li key={l}>{l}</li>)}</ul></div>
                  <div><h5>Constraints</h5><ul className="list">{m.constraints.notes.slice(0, 4).map((l) => <li key={l}>{l}</li>)}</ul></div>
                  <div><h5>Prerequisites &amp; status</h5>
                    {m.prerequisites.length === 0 ? <p className="muted">None — start here.</p> : <ul className="list">{m.prerequisites.map((p) => <li key={p}>{progress.completed[p]?.passed ? '✓' : '○'} {MISSIONS.find((x) => x.id === p)?.title}</li>)}</ul>}
                    {missing.length > 0 && <p className="tiny warn"><Lock size={11} /> Recommended after the above, but you can still start.</p>}
                    <p>{st === 'completed' ? <Chip kind="ok">Completed · Grade {o.grade} · {o.overall}/100 · {progress.attempts[m.id] ?? 1} attempt(s)</Chip> : st === 'progress' ? <Chip kind="warn">In progress</Chip> : <Chip>Not started</Chip>}</p>
                  </div>
                </div>
                <MissionButtons m={m} />
                {saved[m.id] && st !== 'completed' && saved[m.id].ops.length > 0 && <span className="muted tiny"> Saved {when(saved[m.id].updatedAt)}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function IncidentResponse() {
  const { saved, status } = useMissionState();
  const incidents = MISSIONS.filter((m) => m.kind === 'incident');
  const drills = TEMPLATES.filter((t) => t.drill);
  return (
    <div className="page">
      <header className="hero hero-crit"><div><h1><Siren size={26} /> Incident Response</h1><p className="muted">Time-sensitive simulated incidents. The clock runs, customers are hurting, and the evidence is incomplete. Investigate, stabilise, then prevent recurrence — and write the postmortem.</p></div></header>
      <h2 className="section-title">Live incident scenarios</h2>
      <div className="grid-cards">
        {incidents.map((m) => (
          <article key={m.id} className="card incident">
            <div className="chips"><Chip kind="crit">SEV-{m.difficulty === 'Advanced' ? 1 : 2}</Chip><Chip>{m.difficulty}</Chip>{status(m) === 'completed' && <Chip kind="ok">resolved</Chip>}{saved[m.id]?.ops.length ? <Chip kind="warn">in progress</Chip> : null}</div>
            <h3>{m.title}</h3>
            <p>{m.tagline}</p>
            <p className="muted tiny">{m.business.impact}</p>
            <MissionButtons m={m} />
          </article>
        ))}
      </div>
      <h2 className="section-title">Chaos drills in the sandbox</h2>
      <p className="muted">Short, unscored drills on starter architectures. Inject a failure, then change the design until the system survives it.</p>
      <div className="grid-cards">
        {drills.map((t) => (
          <article key={t.id} className="card incident">
            <div className="chips"><Chip kind="warn">drill</Chip></div>
            <h3>{t.drill!.title}</h3>
            <p>{t.blurb}</p>
            <p className="tiny"><b>Goal:</b> {t.drill!.goal}</p>
            <button className="btn btn-primary btn-sm" onClick={() => go(`/lab?template=${t.id}`)}><PlayIcon size={14} /> Start drill</button>
          </article>
        ))}
      </div>
    </div>
  );
}

export function Academy() {
  const progress = useGame((s) => s.progress);
  const [sel, setSel] = useState<SkillId>('sd');
  const skill = SKILLS.find((s) => s.id === sel)!;
  const xp = progress.skillXp[sel];
  const lv = skillLevel(xp);
  const ev = progress.evidence[sel];
  return (
    <div className="page">
      <header className="hero"><div><h1>Engineering Academy</h1><p className="muted">Ten skill branches. Levels are earned from mission outcomes — each level shows the evidence behind it. Lessons unlock as you demonstrate the skill.</p></div></header>
      <div className="skill-grid">
        {SKILLS.map((s) => { const l = skillLevel(progress.skillXp[s.id]); return (
          <button key={s.id} className={`skill-card ${sel === s.id ? 'on' : ''}`} onClick={() => setSel(s.id)} aria-pressed={sel === s.id}>
            <b>{s.label}</b><span className="muted tiny">{SKILL_TITLES[l]} · level {l}</span><Meter value={progress.skillXp[s.id]} max={SKILL_THRESHOLDS[Math.min(5, l + 1)]} kind="info" label={s.label} />
          </button>
        ); })}
      </div>
      <section className="card skill-detail">
        <div className="row-between"><h2>{skill.label}</h2><Chip kind="info">{SKILL_TITLES[lv]} · {xp} XP</Chip></div>
        <p className="muted">{skill.blurb}</p>
        <div className="levels">{SKILL_THRESHOLDS.slice(1).map((t, i) => <div key={t} className={`lvl ${lv >= i + 1 ? 'on' : ''}`}><b>{SKILL_TITLES[i + 1]}</b><span>{t} XP</span></div>)}</div>
        <div className="cols">
          <div>
            <h3>Lessons</h3>
            <ul className="lessons">
              {LESSONS[sel].map((l) => { const open = xp >= l.unlockXp; return (
                <li key={l.id} className={open ? '' : 'locked'}>
                  <div className="row-between"><b>{open ? l.title : <><Lock size={13} /> {l.title}</>}</b>{!open && <span className="muted tiny">unlocks at {l.unlockXp} XP</span>}</div>
                  {open ? <><p>{l.body}</p><p className="takeaway">▸ {l.takeaway}</p>{l.mission && <button className="link" onClick={() => go(`/play/${l.mission}`)}>Practise in: {MISSIONS.find((m) => m.id === l.mission)?.title}</button>}</> : <p className="muted tiny">Earn {l.unlockXp - xp} more XP in this branch. {l.mission && `Try “${MISSIONS.find((m) => m.id === l.mission)?.title}”.`}</p>}
                </li>
              ); })}
            </ul>
          </div>
          <div>
            <h3>Evidence for this level</h3>
            {ev.length === 0 ? <Empty title="No evidence yet">Pass missions that exercise this skill: {MISSIONS.filter((m) => (m.skills[sel] ?? 0) > 0).map((m) => m.title).join(', ')}.</Empty> : (
              <ul className="rows">{ev.map((e, i) => <li key={i}><div><b>{e.title}</b><p className="muted">{e.note}</p></div><span className="muted tiny">{when(e.at)}</span></li>)}</ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function Journal() {
  const progress = useGame((s) => s.progress);
  const [tab, setTab] = useState<'missions' | 'adrs' | 'pms' | 'exp' | 'lessons' | 'designs'>('missions');
  const title = (id: string) => MISSIONS.find((m) => m.id === id)?.title ?? id;
  const outcomes = useMemo(() => [...progress.outcomes].reverse(), [progress.outcomes]);
  return (
    <div className="page">
      <header className="hero"><div><h1>Engineering Journal</h1><p className="muted">Your record: completed missions, architecture decisions, postmortems, experiments and lessons learned.</p></div></header>
      <Tabs label="Journal sections" value={tab} onChange={setTab} tabs={[
        { id: 'missions', label: `Missions (${progress.outcomes.length})` }, { id: 'adrs', label: `Decisions (${progress.adrs.length})` }, { id: 'pms', label: `Postmortems (${progress.postmortems.length})` },
        { id: 'exp', label: `Experiments (${progress.experiments.length})` }, { id: 'lessons', label: `Lessons (${progress.lessons.length})` }, { id: 'designs', label: `Saved designs (${progress.designs.length})` },
      ]} />
      <div className="card">
        {tab === 'missions' && (outcomes.length === 0 ? <Empty title="Nothing recorded yet">Submit a mission to see its scorecard here.</Empty> : (
          <ul className="rows">{outcomes.map((o, i) => (
            <li key={i}><div><b>{title(o.missionId)}</b> <Chip kind={o.passed ? 'ok' : 'warn'}>{o.passed ? 'passed' : 'not yet'}</Chip> <Chip>Grade {o.grade}</Chip> <span className="muted tiny">attempt {o.attempt} · {o.hintsUsed} hints</span>
              <div className="dimline">{o.dims.filter((d) => d.weight > 0 && d.score != null).map((d) => <span key={d.id} title={d.note}>{d.label.split(' ')[0]} <b>{d.score}</b></span>)}</div></div><span className="muted tiny">{when(o.finishedAt)}</span></li>
          ))}</ul>
        ))}
        {tab === 'adrs' && (progress.adrs.length === 0 ? <Empty title="No ADRs yet">Record Architecture Decision Records inside missions.</Empty> : progress.adrs.map((a) => (
          <article key={a.id} className="doc"><h3>{a.title}</h3><p className="muted tiny">{title(a.missionId)} · {when(a.at)}</p><dl><dt>Context</dt><dd>{a.context}</dd><dt>Problem</dt><dd>{a.problem}</dd><dt>Options considered</dt><dd>{a.options}</dd><dt>Decision</dt><dd>{a.decision}</dd><dt>Advantages</dt><dd>{a.pros}</dd><dt>Disadvantages</dt><dd>{a.cons}</dd><dt>Implications</dt><dd>{a.implications}</dd></dl></article>
        )))}
        {tab === 'pms' && (progress.postmortems.length === 0 ? <Empty title="No postmortems yet">Incident missions ask you to write one.</Empty> : progress.postmortems.map((p, i) => (
          <article key={i} className="doc"><h3>Postmortem — {title(p.missionId)}</h3><p className="muted tiny">{when(p.at)}</p><dl><dt>What happened</dt><dd>{p.pm.what}</dd><dt>Customer impact</dt><dd>{p.pm.impact}</dd><dt>Evidence</dt><dd>{p.pm.evidence}</dd><dt>Restored by</dt><dd>{p.pm.restored}</dd><dt>Made it worse</dt><dd>{p.pm.worsened}</dd><dt>Prevention</dt><dd>{p.pm.prevent}</dd></dl></article>
        )))}
        {tab === 'exp' && (progress.experiments.length === 0 ? <Empty title="No experiments logged">Compare designs in the Architecture Lab and log what you learn.</Empty> : <ul className="rows">{progress.experiments.map((e) => <li key={e.id}><div><b>{e.name}</b><p>{e.note || <i className="muted">No note</i>}</p><p className="muted tiny">availability {e.metrics.availability?.toFixed(1)}% · p95 {e.metrics.p95?.toFixed(0)}ms · cost {usd2(e.metrics.cost ?? 0)}</p></div><span className="muted tiny">{when(e.at)}</span></li>)}</ul>)}
        {tab === 'lessons' && (progress.lessons.length === 0 ? <Empty title="No lessons yet">Lessons from debriefs and your own “made it worse” notes collect here.</Empty> : <ul className="rows">{[...progress.lessons].reverse().map((l, i) => <li key={i}><div><b>{title(l.missionId)}</b><p>{l.text}</p></div><span className="muted tiny">{when(l.at)}</span></li>)}</ul>)}
        {tab === 'designs' && (progress.designs.length === 0 ? <Empty title="No saved designs">Save designs from the Architecture Lab.</Empty> : <ul className="rows">{progress.designs.map((d) => <li key={d.id}><div><b>{d.name}</b><p className="muted tiny">{d.arch.nodes.length} components · {d.arch.edges.length} connections</p></div><span className="muted tiny">{when(d.savedAt)}</span></li>)}</ul>)}
      </div>
    </div>
  );
}
