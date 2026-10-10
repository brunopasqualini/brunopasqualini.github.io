import { ClipboardCheck } from 'lucide-react';
import { useMemo } from 'react';
import { lessonById } from '@/content/academy';
import { lintArch, type LintSeverity } from '@/engine/lint';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { Chip } from '@/shared/ui/common';
import { go } from '@/shared/lib/nav';

const KIND: Record<LintSeverity, 'crit' | 'warn' | 'info'> = { high: 'crit', medium: 'warn', low: 'info' };

/**
 * A review of the draft as you build it: anti-patterns the simulation is known to punish, each with the reason, the fix and
 * the lesson behind it. Advice only: it never blocks a deploy, and some designs break a rule on purpose.
 */
export function DesignReview() {
  const { session } = useLive();
  const select = useGame((s) => s.select);
  const tick = useGame((s) => s.tick);
  const items = useMemo(
    () => (session ? lintArch(session.draft, session.workload) : []),
    // the draft is edited in place and signalled by tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick, session],
  );
  if (!session) return null;
  const count = (s: LintSeverity) => items.filter((i) => i.severity === s).length;

  return (
    <section className="design-review" aria-label="Design review">
      <h4>
        <ClipboardCheck size={14} /> Design review
        {items.length > 0 && (
          <span className="dr-counts">
            {count('high') > 0 && <Chip kind="crit">{count('high')} high</Chip>}
            {count('medium') > 0 && <Chip kind="warn">{count('medium')} medium</Chip>}
            {count('low') > 0 && <Chip kind="info">{count('low')} low</Chip>}
          </span>
        )}
      </h4>
      {items.length === 0 ? (
        <p className="muted tiny">
          Nothing flagged by the rules this simulator knows. That is not the same as a good design: check it against the requirements.
        </p>
      ) : (
        <>
          <p className="muted tiny">
            Reviewing your draft. Advice, not a gate: you can deploy with these, and some designs break a rule on purpose.
          </p>
          <ul className="dr-list">
            {items.map((i) => {
              const lesson = lessonById(i.lesson)?.lesson;
              return (
                <li key={i.id} className={`dr-item dr-${i.severity}`}>
                  <div className="dr-head">
                    <Chip kind={KIND[i.severity]}>{i.severity}</Chip>
                    {i.nodeId ? (
                      <button
                        className="link"
                        onClick={() => select('node', i.nodeId)}
                        title="Select this component to change its settings"
                      >
                        {i.title}
                      </button>
                    ) : (
                      <b>{i.title}</b>
                    )}
                  </div>
                  <details open={i.severity === 'high'}>
                    <summary>Why it matters and how to fix it</summary>
                    <p>{i.why}</p>
                    <p>
                      <b>Fix:</b> {i.fix}
                    </p>
                    {lesson && i.lesson && (
                      <button className="link" onClick={() => go(`/learning?lesson=${i.lesson}`)}>
                        Lesson: {lesson.title}
                      </button>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
