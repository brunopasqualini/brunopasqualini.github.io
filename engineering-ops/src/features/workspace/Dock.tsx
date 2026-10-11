import { ChevronDown, ChevronUp } from 'lucide-react';
import { useEffect } from 'react';
import { roleOf } from '@/engine/arch';
import type { PanelId } from '@/content/missions/types';
import { missionOf } from '@/game/session';
import { useGame } from '@/game/store';
import { Tabs } from '@/shared/ui/common';
import { useLive } from '@/game/hooks';
import {
  AlertsPanel,
  CostPanel,
  DatabasePanel,
  DependenciesPanel,
  DeploymentsPanel,
  LogsPanel,
  MetricsPanel,
  NetworkPanel,
  NotesPanel,
  QueuesPanel,
  SecurityPanel,
  TracesPanel,
} from '@/features/workspace/panels';
import { OverviewPanel } from '@/features/workspace/panels/overview';

const LABELS: Record<PanelId, string> = {
  overview: 'Overview',
  metrics: 'Metrics',
  logs: 'Logs',
  traces: 'Traces',
  dependencies: 'Dependencies',
  deployments: 'Changes & timeline',
  cost: 'Cost',
  security: 'Security',
  alerts: 'Alerts',
  database: 'Database',
  queues: 'Queues',
  network: 'Network',
  notes: 'Briefing',
};

export function Dock() {
  const { session, report } = useLive();
  const dock = useGame((s) => s.dock);
  const open = useGame((s) => s.dockOpen);
  const setDock = useGame((s) => s.setDock);
  const setOpen = useGame((s) => s.setDockOpen);
  const visit = useGame((s) => s.visitPanel);
  const seen = session?.panelsSeen ?? [];
  const mission = session ? missionOf(session.missionId) : undefined;

  useEffect(() => {
    if (session && open) visit(dock);
  }, [dock, open, session?.missionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!session) return null;
  const roles = new Set(session.live.nodes.map(roleOf));
  const ids: PanelId[] = ['overview', 'metrics', 'logs', 'traces', 'dependencies', 'deployments'];
  if (roles.has('db') || roles.has('kv')) ids.push('database');
  if (roles.has('queue')) ids.push('queues');
  if (roles.has('network')) ids.push('network');
  ids.push('cost', 'security', 'alerts');
  if (mission && mission.id !== 'lab') ids.push('notes');
  const guided = mission?.guidance ?? [];
  const alertBadge =
    report && report.counts.critical + report.counts.high > 0 ? (
      <span className="badge badge-crit">{report.counts.critical + report.counts.high}</span>
    ) : null;

  const view = () => {
    switch (dock) {
      case 'overview':
        return <OverviewPanel />;
      case 'metrics':
        return <MetricsPanel />;
      case 'logs':
        return <LogsPanel />;
      case 'traces':
        return <TracesPanel />;
      case 'dependencies':
        return <DependenciesPanel />;
      case 'deployments':
        return <DeploymentsPanel />;
      case 'cost':
        return <CostPanel />;
      case 'security':
        return <SecurityPanel />;
      case 'alerts':
        return <AlertsPanel />;
      case 'database':
        return <DatabasePanel />;
      case 'queues':
        return <QueuesPanel />;
      case 'network':
        return <NetworkPanel />;
      case 'notes':
        return <NotesPanel />;
    }
  };

  return (
    <section className={`dock ${open ? 'dock-open' : 'dock-closed'}`} aria-label="Investigation panels">
      <div className="dock-bar">
        <Tabs
          label="Investigation panels"
          value={(ids.includes(dock) ? dock : 'overview') as PanelId}
          onChange={setDock}
          tabs={ids.map((id) => ({
            id,
            label: LABELS[id],
            badge:
              id === 'security' ? (
                alertBadge
              ) : guided.includes(id) && !seen.includes(id) && session.mode === 'beginner' ? (
                <span className="badge badge-guide" title="Recommended place to look">
                  look here
                </span>
              ) : seen.includes(id) ? (
                <span className="seen" aria-label="visited" title="Visited" />
              ) : null,
          }))}
        />
        <button
          className="icon-btn"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          aria-expanded={open}
        >
          {open ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {open && <div className="dock-body">{view()}</div>}
    </section>
  );
}
