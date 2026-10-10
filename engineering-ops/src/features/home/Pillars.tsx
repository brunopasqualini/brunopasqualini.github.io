import { Boxes, Gauge, Scale, Trophy } from 'lucide-react';
import { PILLARS } from '@/content/positioning';

const ICON = { sandbox: Boxes, simulation: Gauge, judgement: Scale, progression: Trophy } as const;
const TONE = { sandbox: 'compute', simulation: 'edge', judgement: 'storage', progression: 'messaging' } as const;

export function Pillars() {
  return (
    <section aria-labelledby="pillars-h">
      <h2 id="pillars-h" className="section-title">
        What this is
      </h2>
      <div className="pillars">
        {PILLARS.map((p) => {
          const Icon = ICON[p.id as keyof typeof ICON];
          return (
            <article key={p.id} className="pillar">
              <span className={`pillar-ico tone-${TONE[p.id as keyof typeof TONE]}`}>
                <Icon size={20} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
