import { nodeById, type ArchDiffItem } from './arch';
import type { Arch, MetricChange, Snapshot } from './types';

/** Where in the dock a player should look to verify a metric. */
const EVIDENCE_PANEL: Record<string, string> = {
  success: 'Metrics',
  p95: 'Traces',
  cost: 'Cost',
  dbconn: 'Database',
  util: 'Metrics',
  backlog: 'Queues',
};

export interface ChangeStory {
  /** What the player changed. */
  action: string[];
  /** Metrics that moved because of the components the player touched. */
  immediate: MetricChange[];
  /** Metrics that moved somewhere else in the system as a consequence. */
  propagation: MetricChange[];
  /** What improved and what deteriorated, in the player's own terms. */
  tradeoff: { gained: string[]; lost: string[] };
  /** Dock panels that hold the evidence for the claims above. */
  evidence: string[];
  /** What to investigate next, or how to confirm the result. */
  next: { text: string; panel?: string };
}

/**
 * Turn a deploy diff and the metric changes it caused into the explanation model the player reads:
 * action, immediate effect, propagation, trade-off, evidence, next investigation. Pure: no UI, no randomness.
 */
export function buildChangeStory(diff: ArchDiffItem[], changes: MetricChange[], after: Snapshot, arch: Arch): ChangeStory {
  const touched = new Set(diff.map((d) => d.nodeId).filter((x): x is string => !!x));
  const touchedLabels = [...touched].map((id) => nodeById(arch, id)?.label).filter((x): x is string => !!x);
  const direct = (c: MetricChange) => touchedLabels.some((l) => c.because.startsWith(l));

  const immediate = changes.filter((c) => c.key === 'cost' || direct(c));
  const propagation = changes.filter((c) => !immediate.includes(c));

  const tradeoff = {
    gained: changes.filter((c) => c.better === true).map((c) => c.label),
    lost: changes.filter((c) => c.better === false).map((c) => c.label),
  };

  const evidence = [...new Set(changes.map((c) => EVIDENCE_PANEL[c.key]).filter(Boolean))];

  // The most severe unresolved diagnosis anywhere in the system is the next thing to look at.
  let worst: { id: string; text: string; sev: number } | undefined;
  for (const [id, m] of Object.entries(after.nodes)) {
    if (m.role === 'source') continue;
    for (const r of m.reasons) {
      const sev = r.severity === 'crit' ? 2 : r.severity === 'warn' ? 1 : 0;
      if (sev > 0 && (!worst || sev > worst.sev)) worst = { id, text: r.text, sev };
    }
  }
  const worse = changes.find((c) => c.better === false);
  const next = worst
    ? {
        text: `${nodeById(arch, worst.id)?.label ?? worst.id} still reports: ${worst.text}`,
        panel: worse ? EVIDENCE_PANEL[worse.key] : 'Metrics',
      }
    : worse
      ? {
          text: `${worse.label} got worse. Open ${EVIDENCE_PANEL[worse.key] ?? 'Metrics'} and find which component moved first.`,
          panel: EVIDENCE_PANEL[worse.key],
        }
      : { text: 'Nothing is flagged. Run the simulation through the next load peak to confirm the fix holds.' };

  return { action: diff.map((d) => d.text), immediate, propagation, tradeoff, evidence, next };
}
