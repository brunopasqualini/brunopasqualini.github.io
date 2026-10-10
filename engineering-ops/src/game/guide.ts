import type { Mission, PanelId } from '@/content/missions/types';
import type { Session } from '@/game/session';

export interface GuideStep {
  id: 'investigate' | 'hypothesis' | 'change' | 'observe' | 'verify';
  title: string;
  body: string;
  done: boolean;
  /** A panel the player can open with one click to do this step. */
  panel?: PanelId;
}

/** Whether to walk this player through the loop: only their very first mission, in beginner mode. */
export function isFirstRun(session: Pick<Session, 'mode'>, completedCount: number, attemptedCount: number): boolean {
  return session.mode === 'beginner' && completedCount === 0 && attemptedCount === 0;
}

/**
 * The investigate, hypothesise, change, observe, verify loop as a checklist derived from what the player has actually
 * done, so it ticks itself and always points at the next thing. Pure.
 */
export function guideSteps(session: Session, mission: Mission): GuideStep[] {
  const needed = [...new Set(mission.rootCauses.filter((c) => c.correct).flatMap((c) => c.evidencePanels))];
  const seen = needed.filter((p) => session.panelsSeen.includes(p));
  const nextPanel = needed.find((p) => !session.panelsSeen.includes(p));
  const needSeen = Math.min(2, needed.length);
  const deployed = session.ops.some((o) => o.op === 'deploy') || !!session.explain;
  const acted = deployed || session.ops.some((o) => o.op === 'action');
  const steps: GuideStep[] = [
    {
      id: 'investigate',
      title: 'Look at the evidence before changing anything',
      body: `Open the tabs marked “look here” under the canvas${nextPanel ? ` (try ${nextPanel} next)` : ''}. Real incidents are solved by reading, not guessing.${mission.kind === 'incident' ? ' The incident clock is running: press Pause whenever you want time to think.' : ''} ${seen.length}/${needed.length} key panels opened.`,
      done: seen.length >= needSeen,
      panel: nextPanel,
    },
  ];
  if (mission.rootCauses.length > 0)
    steps.push({
      id: 'hypothesis',
      title: 'Say what you think is wrong',
      body: 'Tick the cause you believe in the Hypothesis list below. You will be told afterwards whether the evidence you read supported it.',
      done: session.chosenCauses.length > 0,
    });
  steps.push(
    {
      id: 'change',
      title: 'Make one change and deploy it',
      body:
        mission.firstMove ??
        'Change one component in the inspector, open Plan, and press Deploy. One change at a time shows you what caused what.',
      done: acted,
    },
    {
      id: 'observe',
      title: 'Read what changed and why',
      body: 'Run the simulation a few minutes (Run or +10m). The Plan tab explains what your change did, what it affected elsewhere, and what to check next.',
      done: !!session.explain?.settled,
    },
    {
      id: 'verify',
      title: 'Verify and submit',
      body: 'When every hard requirement is green, press Verify & submit. The debrief shows what you got right, what the evidence said, and how your design compares with where you started.',
      done: !!session.verified,
    },
  );
  return steps;
}
