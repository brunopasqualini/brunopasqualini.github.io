import { Play as PlayIcon, Siren } from 'lucide-react';
import { MISSIONS } from '@/content/missions';
import { TEMPLATES } from '@/content/templates';
import { Chip } from '@/shared/ui/common';
import { go } from '@/shared/lib/nav';
import { MissionButtons, useMissionState } from '@/entities/mission/MissionButtons';

export function IncidentsPage() {
  const { saved, status } = useMissionState();
  const incidents = MISSIONS.filter((m) => m.kind === 'incident');
  const drills = TEMPLATES.filter((t) => t.drill);
  return (
    <div className="page">
      <header className="hero hero-crit">
        <div>
          <h1>
            <Siren size={26} /> Incident Response
          </h1>
          <p className="muted">
            Time-sensitive simulated incidents. The clock runs, customers are hurting, and the evidence is incomplete. Investigate,
            stabilise, then prevent recurrence — and write the postmortem.
          </p>
        </div>
      </header>
      <h2 className="section-title">Live incident scenarios</h2>
      <div className="grid-cards">
        {incidents.map((m) => (
          <article key={m.id} className="card incident">
            <div className="chips">
              <Chip kind="crit">SEV-{m.difficulty === 'Advanced' ? 1 : 2}</Chip>
              <Chip>{m.difficulty}</Chip>
              {status(m) === 'completed' && <Chip kind="ok">resolved</Chip>}
              {saved[m.id]?.ops.length ? <Chip kind="warn">in progress</Chip> : null}
            </div>
            <h3>{m.title}</h3>
            <p>{m.tagline}</p>
            <p className="muted tiny">{m.business.impact}</p>
            <MissionButtons m={m} />
          </article>
        ))}
      </div>
      <h2 className="section-title">Chaos drills in the sandbox</h2>
      <p className="muted">
        Short, unscored drills on starter architectures. Inject a failure, then change the design until the system survives it.
      </p>
      <div className="grid-cards">
        {drills.map((t) => (
          <article key={t.id} className="card incident">
            <div className="chips">
              <Chip kind="warn">drill</Chip>
            </div>
            <h3>{t.drill!.title}</h3>
            <p>{t.blurb}</p>
            <p className="tiny">
              <b>Goal:</b> {t.drill!.goal}
            </p>
            <button className="btn btn-primary btn-sm" onClick={() => go(`/lab?template=${t.id}`)}>
              <PlayIcon size={14} /> Start drill
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
