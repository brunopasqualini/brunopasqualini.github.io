import { Handle, Position, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react';
import { entryOf } from '@/engine/catalog';
import type { ArchNode, NodeMetrics, NodeStatus } from '@/engine/types';
import { NodeIcon } from '@/shared/ui/icons';
import { num } from '@/shared/lib/fmt';
import { toneOfKind } from '@/shared/ui/roleTone';
import { serviceName } from '@/shared/ui/serviceName';
import { QueueDots, Strip, tilesFor, type Tile } from '@/features/workspace/InstanceStrip';
import { breathSeconds, momentLabel, type Moment } from '@/features/workspace/effects/fx';

export interface ArchNodeData extends Record<string, unknown> {
  node: ArchNode;
  metrics?: NodeMetrics;
  status: NodeStatus;
  insecure?: string;
  misconfigured?: string;
  pending: boolean;
  /** Config edited in the draft but not deployed yet: the live system still runs the old settings. */
  changed?: boolean;
  isNetwork: boolean;
  /** An autoscaling policy node is attached to this service. */
  attachedAutoscaling?: boolean;
  minute: number;
  /** Downstream fleet of a load balancer: its targets' instances. */
  fanout?: Tile[];
  fanoutLabel?: string;
  /** Part of the blast radius of an attack being shown. */
  attacked?: boolean;
  /** Something just happened to this component (hit, recovered, scaled, deployed): plays a one-shot effect. */
  moment?: Moment;
}

export function summaryOf(n: ArchNode): string {
  const c = n.config;
  const e = entryOf(n.kind);
  switch (e.role) {
    case 'compute':
      return `${c.replicas ?? 1} × ${c.instanceSize ?? 'small'}${c.autoscale ? ' · auto' : ''}${n.kind === 'monolith' ? ` · ${c.modules} modules` : ''}`;
    case 'worker':
      return `${c.replicas} × ${c.concurrency} conc${c.idempotent ? ' · idempotent' : ''}`;
    case 'db':
      return `${c.size}${c.multiAZ ? ' · Multi-AZ' : ''}${c.readReplicas ? ` · +${c.readReplicas} RR` : ''}${c.connectionPooler ? ' · proxy' : ''}`;
    case 'kv':
      return c.capacityMode;
    case 'cache':
      return `${c.nodes}×${c.size} · ttl ${c.ttlSeconds}s`;
    case 'queue':
      return c.isDlq ? 'dead-letter' : `vis ${c.visibilityTimeoutSec}s · max ${c.maxReceiveCount}`;
    case 'storage':
      return `${num(c.storageGB)} GB${c.lifecycle ? ' · lifecycle' : ''}`;
    case 'lb':
      return `health ${c.healthTimeoutMs}ms`;
    case 'external':
      return `${c.rpsLimit} rps limit`;
    case 'network':
      if (n.kind === 'subnet')
        return `AZ ${c.az} · ${c.routeInternet === 'igw' ? 'public' : c.routeInternet === 'nat' ? 'private (NAT)' : 'isolated'}`;
      if (n.kind === 'sg') return `${(c.inbound ?? []).length} inbound · out ${c.egressMode}`;
      if (n.kind === 'vpc') return c.cidr;
      return e.name;
    case 'identity':
      return n.kind === 'iam' ? c.policy : e.name;
    default:
      return e.name;
  }
}

function stripLabel(n: ArchNode, m: NodeMetrics | undefined): string | undefined {
  if (!m) return undefined;
  if (m.role === 'compute' || m.role === 'worker') return `${m.replicas}${n.config.autoscale ? `/${n.config.maxReplicas}` : ''}`;
  if (m.role === 'db' && n.config.readReplicas) return `${(m.replicaLagSec ?? 0).toFixed(1)}s lag`;
  return undefined;
}

function mini(m: NodeMetrics | undefined) {
  if (!m) return null;
  if (m.queueDepth != null && m.role === 'queue')
    return (
      <>
        <span>depth {num(m.queueDepth)}</span>
        <span>{m.dlqDepth ? `dlq ${num(m.dlqDepth)}` : ''}</span>
      </>
    );
  if (m.connMax)
    return (
      <>
        <span>cpu {(m.util * 100).toFixed(0)}%</span>
        <span>
          conn {(m.connUsed ?? 0).toFixed(0)}/{m.connMax}
        </span>
      </>
    );
  if (m.role === 'cache')
    return (
      <>
        <span>hit {((m.hitRate ?? 0) * 100).toFixed(0)}%</span>
        <span>{num(m.offered)} rps</span>
      </>
    );
  if (['compute', 'worker', 'kv', 'search'].includes(m.role))
    return (
      <>
        <span>{(m.util * 100).toFixed(0)}% util</span>
        <span>{m.errorRate > 0.005 ? `${(m.errorRate * 100).toFixed(1)}% err` : `${num(m.offered)} rps`}</span>
      </>
    );
  if (m.offered > 0)
    return (
      <>
        <span>{num(m.offered)} rps</span>
        <span>{m.errorRate > 0.005 ? `${(m.errorRate * 100).toFixed(1)}% err` : ''}</span>
      </>
    );
  return null;
}

const CARD_ROLES = ['db', 'kv', 'cache', 'search'];
const FLEET_ROLES = ['compute', 'worker'];

export function ArchNodeView({ data, selected }: NodeProps) {
  const d = data as ArchNodeData;
  const n = d.node;
  const e = entryOf(n.kind);
  const util = d.metrics ? Math.min(1, d.metrics.util) : 0;
  const flagged = d.insecure || d.misconfigured || d.status === 'unavailable' || d.status === 'overloaded';
  // data stores read as a card (icon left, label right); everything else is an icon tile with the label beneath
  const card = CARD_ROLES.includes(e.role) && !d.isNetwork;
  const fleet = FLEET_ROLES.includes(e.role) && (d.metrics?.replicas ?? n.config.replicas ?? 1) > 1;
  const asg = FLEET_ROLES.includes(e.role) && (n.config.autoscale || d.attachedAutoscaling);
  const summary = summaryOf(n);
  const showConf = summary !== e.name;
  const service = serviceName(n.kind);
  const working = e.role === 'worker' && (d.metrics?.served ?? 0) > 0;
  const tile = (
    <div className={`anode-tile ${fleet ? 'anode-stacked' : ''}`}>
      <NodeIcon name={e.icon} size={d.isNetwork ? 20 : card ? 22 : 26} />
      {flagged && (
        <span className="anode-alert" title={d.insecure ?? d.misconfigured ?? d.status}>
          {d.insecure ? <ShieldAlert size={12} /> : d.misconfigured ? <AlertTriangle size={12} /> : '!'}
        </span>
      )}
      {n.kind === 'sg' && <Lock className="anode-lock" size={11} />}
      {d.moment && (
        <span key={d.moment.at} className={`fx-moment fx-${d.moment.kind}`} aria-hidden="true">
          {momentLabel(d.moment) && <b>{momentLabel(d.moment)}</b>}
        </span>
      )}
    </div>
  );
  return (
    <div
      className={`anode anode-${d.status} tone-${toneOfKind(n.kind, e.role)} ${card ? 'anode-card' : ''} ${asg ? 'anode-asg' : ''} ${selected ? 'anode-selected' : ''} ${d.pending ? 'anode-pending' : ''} ${d.isNetwork ? 'anode-net' : ''} ${working ? 'anode-working' : ''} ${d.attacked ? 'anode-attacked' : ''}`}
      style={{ ['--bt' as string]: `${breathSeconds(util)}s` }}
      aria-label={`${n.label}, ${d.status}`}
    >
      {asg && (
        <span className="asg-label">
          Auto Scaling
          {n.config.autoscale ? ` · ${d.metrics?.replicas ?? n.config.replicas}/${n.config.maxReplicas}` : ''}
        </span>
      )}
      <Handle type="target" position={Position.Left} id="l" className="h" />
      <Handle type="target" position={Position.Top} id="tt" className="h h-v" />
      <Handle type="target" position={Position.Bottom} id="tb" className="h h-v" />
      {card ? (
        <div className="anode-cardbox">
          {tile}
          <div className="anode-cardtext">
            <div className="anode-title">{n.label}</div>
            <div className="anode-sub">{service}</div>
          </div>
        </div>
      ) : (
        <>
          {tile}
          <div className="anode-title">{n.label}</div>
          <div className="anode-sub">{d.isNetwork ? summary : service}</div>
        </>
      )}
      {!d.isNetwork && (
        <div className="anode-stats">
          {showConf && <div className="anode-conf">{summary}</div>}
          {d.metrics && (
            <>
              {['compute', 'worker', 'db', 'kv', 'search', 'cache'].includes(e.role) && (
                <div className="anode-bar">
                  <div style={{ width: `${util * 100}%` }} />
                </div>
              )}
              {d.fanout && d.fanout.length > 0 ? (
                <Strip tiles={d.fanout} label={d.fanoutLabel} />
              ) : (
                <Strip tiles={tilesFor(n, d.metrics, d.minute)} label={stripLabel(n, d.metrics)} />
              )}
              {e.role === 'queue' && !n.config.isDlq && <QueueDots depth={d.metrics.queueDepth ?? 0} dlq={d.metrics.dlqDepth ?? 0} />}
              <div className="anode-mini">{mini(d.metrics)}</div>
            </>
          )}
        </div>
      )}
      {d.pending && <div className="anode-flag">pending deploy</div>}
      {!d.pending && d.changed && (
        <div
          className="anode-flag"
          title="Settings changed but not deployed: the running system still uses the old ones. Open Plan → Deploy changes."
        >
          edited · not deployed
        </div>
      )}
      {d.status !== 'healthy' && d.status !== 'idle' && !d.isNetwork && <div className={`anode-tag tag-${d.status}`}>{d.status}</div>}
      <Handle type="source" position={Position.Right} id="r" className="h" />
      <Handle type="source" position={Position.Top} id="st" className="h h-v" />
      <Handle type="source" position={Position.Bottom} id="sb" className="h h-v" />
    </div>
  );
}
