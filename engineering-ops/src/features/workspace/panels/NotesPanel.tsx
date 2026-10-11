import { missionOf } from '@/game/session';
import { Empty } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';
import { Section } from './shared';

export function NotesPanel() {
  const { session } = useLive();
  if (!session) return null;
  const m = missionOf(session.missionId);
  if (session.missionId === 'lab')
    return (
      <Empty title="Sandbox">
        Build freely. Use the Plan tab to review and deploy your changes, and the Lab controls to change workload and inject failures.
      </Empty>
    );
  return (
    <div className="panel-body notes">
      <Section title="Scenario">
        <p>{m.story}</p>
        <p>
          <b>Business context:</b> {m.business.context}
        </p>
        <p>
          <b>Impact:</b> {m.business.impact}
        </p>
      </Section>
      {m.notes.map((n, i) => (
        <Section key={i} title={n.title}>
          <p>{n.body}</p>
        </Section>
      ))}
    </div>
  );
}
