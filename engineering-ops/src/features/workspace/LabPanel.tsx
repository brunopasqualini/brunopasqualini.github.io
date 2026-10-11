import { AttackPanel } from '@/features/workspace/AttackPanel';
import { GameDayPanel } from '@/features/workspace/GameDayPanel';
import { GeographyPanel } from '@/features/workspace/GeographyPanel';
import { useLive } from '@/game/hooks';
import { useGame } from '@/game/store';
import { Chip } from '@/shared/ui/common';
import { ChaosControls } from './lab/ChaosControls';
import { DesignsCompare } from './lab/DesignsCompare';
import { TemplatePicker } from './lab/TemplatePicker';
import { WorkloadControls } from './lab/WorkloadControls';

/** The Lab's sections, top to bottom. Each one is its own component. */
export function LabPanel() {
  const { session } = useLive();
  const drill = useGame((s) => s.drill);
  if (!session) return null;
  return (
    <div className="lab-panel">
      {drill && (
        <div className="callout callout-warn">
          <strong>Drill: {drill.title}</strong>
          <p>{drill.goal}</p>
        </div>
      )}
      <TemplatePicker />
      <WorkloadControls />
      <GameDayPanel />
      <ChaosControls />
      <AttackPanel />
      <DesignsCompare />
      <GeographyPanel />
      <p className="muted tiny">
        All behaviour here is simulated. Costs are estimates, not AWS prices, and nothing touches a real cloud account.{' '}
        <Chip kind="info">sandbox</Chip>
      </p>
    </div>
  );
}
