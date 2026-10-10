import { E, N, patchNode, wl } from '@/content/missions/helpers';
import type { Mission } from '@/content/missions/types';

const dbOf = (arch: { nodes: { id: string; config: Record<string, any> }[] }) => arch.nodes.find((n) => n.id === 'db');
const hasDr = (arch: { nodes: { kind: string }[] }) => arch.nodes.some((n) => n.kind === 'dr-config');
const withDr = (arch: { nodes: any[]; edges: any[] }, strategy: string) => ({
  ...arch,
  nodes: [...arch.nodes, N('dr-config', 'dr', 700, 400, { strategy }, 'DR plan')],
});

export const m13: Mission = {
  id: 'm13-regional-outage',
  number: 13,
  title: 'The Regional Outage',
  tagline: 'The board asks one question: if our Region disappeared, how long until we are back and what do we lose?',
  difficulty: 'Advanced',
  kind: 'project',
  estMinutes: 30,
  prerequisites: [],
  skills: { sre: 55, plat: 25, aws: 30, sa: 25 },
  learning: [
    'Availability Zone resilience is not Region resilience',
    'RTO and RPO as business numbers, not technical settings',
    'Backup and restore, pilot light, warm standby and active-active: what each buys and costs',
    'Why a plan nobody has exercised is a hope',
  ],
  story:
    'A major cloud Region had a many-hour disruption last month and one of your competitors was offline for most of a day. The board has asked a plain question: if our Region disappeared, how long would it take to be back, and how much data would we lose? Today the orders database is Multi-AZ, backups run nightly in the same Region, and the disaster-recovery page in the wiki says “restore from backup”. Nobody has ever tried it. You have a budget for a better answer, not an unlimited one.',
  business: {
    context:
      'ShopStream marketplace. About 150 requests per second; revenue is roughly $12,000 an hour, so an hour of downtime is expensive but not fatal.',
    impact: 'A full-day outage would cost about a quarter of a million dollars and put enterprise contracts at risk.',
  },
  constraints: {
    budget: 2600,
    availability: 99.9,
    p95: 400,
    notes: [
      'If the Region were lost: service restored within 60 minutes (RTO), and no more than 5 minutes of orders lost (RPO).',
      'Normal operation must keep ≥ 99.9% availability and p95 ≤ 400 ms.',
      'Budget $2,600 / month (simulated estimate). A standby has a price; pick the cheapest design that meets the targets.',
      'Record an ADR that names the targets and the cost you accepted for them.',
    ],
  },
  workload: wl({
    baseRps: 150,
    profile: [{ t: 0, mult: 1 }],
    readRatio: 0.8,
    slowQueryShare: 0,
    cacheableShare: 0,
    payloadKB: 5,
    logGBPerMillionReq: 0.2,
  }),
  initial: {
    nodes: [
      N('users', 'users', 20, 170),
      N('route53', 'dns', 200, 170, {}, 'Amazon Route 53'),
      N('alb', 'lb', 380, 170, { costTag: 'team=orders' }, 'Public ALB'),
      N('ecs', 'api', 560, 170, { replicas: 8, instanceSize: 'medium', dbPoolSize: 10, costTag: 'team=orders' }, 'orders-api'),
      N(
        'rds',
        'db',
        760,
        170,
        { size: 'large', storageGB: 300, multiAZ: true, backupRetentionDays: 7, crossRegionReplica: false, costTag: 'team=orders' },
        'orders-db',
      ),
      N('backup', 'bk', 760, 360, { frequencyHours: 24, retentionDays: 7, crossRegion: false, restoreTested: false }, 'Nightly backup'),
      N('cloudwatch', 'cw', 560, 360, {}),
    ],
    edges: [E('users', 'dns'), E('dns', 'lb'), E('lb', 'api'), E('api', 'db', { weight: 2, timeoutMs: 2000 }), E('bk', 'db')],
  },
  components: [
    'users',
    'route53',
    'alb',
    'ecs',
    'ec2',
    'backend-service',
    'rds',
    'relational-db',
    'dynamodb',
    'elasticache',
    's3',
    'backup',
    'dr-config',
    'cloudwatch',
    'alert-rule',
    'dashboard',
    'health-check',
    'autoscaling',
    'cloudtrail',
    'central-logging',
    'metrics-collector',
  ],
  startMinute: 6,
  verifyMinutes: 6,
  verifyAt: 12,
  deployments: [
    {
      minute: -43200,
      kind: 'infra',
      title: 'orders-db: enable Multi-AZ',
      detail: 'Synchronous standby in a second Availability Zone of the same Region.',
      by: 'platform-team',
    },
    {
      minute: -131400,
      kind: 'infra',
      title: 'Nightly backup job created',
      detail: 'Snapshots stay in the same Region. No restore has been performed since.',
      by: 'platform-team',
    },
  ],
  notes: [
    {
      panel: 'notes',
      title: 'Wiki: Disaster recovery',
      body: '“In a disaster, restore the latest nightly backup into a new environment.” Last reviewed 14 months ago. No named owner, no timings, never rehearsed.',
    },
    {
      panel: 'dependencies',
      title: 'Where does everything live?',
      body: 'Check which components exist outside the primary Region. Multi-AZ and a same-Region backup are both inside it.',
    },
  ],
  rootCauses: [
    {
      id: 'single-region',
      label: 'All the data and its backups live in one Region, so losing the Region loses everything',
      correct: true,
      evidencePanels: ['database', 'dependencies', 'notes'],
      why: 'The database, its standby and its nightly snapshots are all in the primary Region. Nothing exists anywhere else to recover from.',
    },
    {
      id: 'no-plan',
      label: 'There is no tested recovery plan, so even with data elsewhere nobody knows how long recovery takes',
      correct: true,
      evidencePanels: ['notes'],
      why: 'The runbook has no owner, no timings and has never been rehearsed. Recovery time you have not measured is a guess.',
    },
    {
      id: 'multi-az',
      label: 'Multi-AZ already protects us from this',
      correct: false,
      evidencePanels: ['database'],
      why: 'Multi-AZ protects against losing one Availability Zone. A Region loss takes every zone in it, including the standby.',
    },
    {
      id: 'capacity',
      label: 'The system does not have enough capacity',
      correct: false,
      evidencePanels: ['metrics'],
      why: 'Utilisation is low and availability is high in normal operation. This is about a disaster, not load.',
    },
    {
      id: 'dns',
      label: 'We only need a short DNS timeout so traffic can move',
      correct: false,
      evidencePanels: ['dependencies'],
      why: 'DNS can point traffic at another Region, but there has to be a running application and a current copy of the data there first.',
    },
  ],
  actions: [
    {
      id: 'cross-region-replica',
      label: 'Add a cross-Region read replica of the orders database',
      description: 'An asynchronous copy of the data in a second Region. Seconds to minutes behind; it can be promoted to a primary.',
      minutes: 20,
      available: (arch) => !dbOf(arch)?.config.crossRegionReplica,
      apply: (arch) => ({
        arch: patchNode(arch, 'db', { crossRegionReplica: true }),
        log: 'orders-db: a cross-Region read replica was created and is replicating.',
      }),
    },
    {
      id: 'cross-region-backup',
      label: 'Copy backups to a second Region every hour',
      description: 'Snapshots are copied to another Region on a schedule. Recovery means restoring from the latest copy.',
      minutes: 10,
      available: (arch) => arch.nodes.some((n) => n.id === 'bk' && !n.config.crossRegion),
      apply: (arch) => ({
        arch: patchNode(arch, 'bk', { crossRegion: true, frequencyHours: 1 }),
        log: 'Backups are now copied to a second Region every hour.',
      }),
    },
    {
      id: 'pilot-light',
      label: 'Add a pilot-light DR plan',
      description:
        'Keep the data and the core services running at minimum size in the second Region; scale up and switch traffic when needed.',
      minutes: 15,
      available: (arch) => !hasDr(arch),
      apply: (arch) => ({ arch: withDr(arch, 'pilot-light'), log: 'DR plan added: pilot light in the second Region.' }),
    },
    {
      id: 'warm-standby',
      label: 'Add a warm-standby DR plan',
      description: 'Run a scaled-down but fully working copy of the stack in the second Region and fail over by shifting traffic.',
      minutes: 20,
      available: (arch) => !hasDr(arch),
      apply: (arch) => ({ arch: withDr(arch, 'warm-standby'), log: 'DR plan added: warm standby in the second Region.' }),
    },
    {
      id: 'active-active',
      label: 'Run active/active in two Regions',
      description: 'Both Regions serve traffic all the time and each can take the whole load.',
      minutes: 30,
      available: (arch) => !hasDr(arch),
      apply: (arch) => ({ arch: withDr(arch, 'active-active'), log: 'DR plan added: active/active across two Regions.' }),
    },
    {
      id: 'test-restore',
      label: 'Rehearse a restore from backup',
      description: 'Restore the latest backup into a clean environment and time it. Write down what you learned.',
      minutes: 25,
      available: (arch) => arch.nodes.some((n) => n.id === 'bk' && !n.config.restoreTested),
      apply: (arch) => ({
        arch: patchNode(arch, 'bk', { restoreTested: true }),
        log: 'A restore from backup was rehearsed end to end and timed.',
      }),
    },
  ],
  requirements: [
    {
      id: 'rto',
      label: 'If the Region were lost, service returns within 60 minutes',
      hard: true,
      metric: 'regionRto',
      op: '<=',
      value: 60,
      why: 'The board’s recovery time objective.',
    },
    {
      id: 'rpo',
      label: 'If the Region were lost, at most 5 minutes of orders are lost',
      hard: true,
      metric: 'regionRpo',
      op: '<=',
      value: 5,
      why: 'The board’s recovery point objective.',
    },
    {
      id: 'avail',
      label: 'Normal operation: availability ≥ 99.9%',
      hard: true,
      metric: 'availability',
      op: '>=',
      value: 99.9,
      why: 'Disaster recovery must not break everyday service.',
    },
    { id: 'p95', label: 'p95 latency ≤ 400 ms', hard: true, metric: 'p95', op: '<=', value: 400, why: 'Customers still need a fast site.' },
    {
      id: 'budget',
      label: 'Cost ≤ $2,600/mo',
      hard: true,
      metric: 'cost',
      op: '<=',
      value: 2600,
      why: 'Resilience is bought; spend what the risk justifies.',
    },
    {
      id: 'security',
      label: 'No critical security findings',
      hard: true,
      metric: 'criticalFindings',
      op: '<=',
      value: 0,
      why: 'Security is a hard constraint in every mission.',
    },
    {
      id: 'tested',
      label: 'A restore from backup has been rehearsed',
      hard: false,
      check: (c) => {
        const ok = c.arch.nodes.some((n) => n.kind === 'backup' && n.config.restoreTested);
        return { pass: ok, detail: ok ? 'restore rehearsed' : 'never restored' };
      },
      why: 'A backup you have never restored is a hope, not a backup.',
    },
    {
      id: 'adr',
      label: 'The ADR names the targets and the cost accepted',
      hard: false,
      check: (c) => {
        const ok = c.adrs.some((a) => /rto|rpo|recovery (time|point)/i.test(`${a.context} ${a.problem} ${a.decision} ${a.implications}`));
        return { pass: ok, detail: ok ? 'targets named' : 'no ADR names RTO or RPO' };
      },
      why: 'Recovery targets are business decisions; write down who accepted what.',
    },
  ],
  weights: { reliability: 4, performance: 1, cost: 3, diagnosis: 2, correctness: 3, security: 1, rationale: 3 },
  hints: [
    {
      tier: 1,
      text: 'List what exists outside the primary Region today. Is Multi-AZ any help if the whole Region disappears?',
    },
    {
      tier: 2,
      text: 'Two things are needed: a copy of the data in another Region (how fresh?) and a plan that brings the service up there (how fast?). Compare the strategies and their costs.',
    },
    {
      tier: 3,
      text: 'A cross-Region replica gives a fresh copy of the data; a pilot-light or warm-standby plan gives the recovery speed. Pick the cheapest combination that meets 60 minutes and 5 minutes, rehearse a restore, and record an ADR.',
    },
  ],
  debrief: {
    concepts: [
      {
        title: 'Zone resilience is not Region resilience',
        body: 'Multi-AZ and zone-spread services survive the loss of one data centre. A Region-wide event takes every zone, the standby and the same-Region backups with it. Only a copy elsewhere survives.',
      },
      {
        title: 'RTO and RPO are business numbers',
        body: 'RTO is how long you can be down; RPO is how much recent data you can lose. They come from the cost of an outage, and they decide how much redundancy is worth buying.',
      },
      {
        title: 'The four strategies trade cost for speed',
        body: 'Backup and restore is cheapest and takes hours. Pilot light keeps data and a minimal core running. Warm standby runs a working scaled-down copy. Active/active serves from both Regions and recovers in moments, at about double the cost.',
      },
      {
        title: 'A plan you have not run is a guess',
        body: 'Restore times, DNS changes and missing dependencies surface only when you rehearse. The first rehearsal is where the real RTO appears.',
      },
    ],
    rootCause:
      'The data, its Multi-AZ standby and its backups all live in the primary Region, and the recovery runbook has never been exercised. A Region loss would lose the data written since the last copy and recovery time would be unknown.',
    alternatives: [
      {
        name: 'Backup and restore, cross-Region',
        when: 'Hours of downtime and an hour or more of data loss are acceptable, and cost matters most.',
        tradeoffs: 'Cheapest; slowest recovery; data loss equals the backup interval.',
      },
      {
        name: 'Pilot light',
        when: 'Tens of minutes of downtime are acceptable and you want a fresh copy of the data.',
        tradeoffs: 'Low standby cost; you must scale up and switch traffic during the disaster.',
      },
      {
        name: 'Warm standby',
        when: 'Minutes matter and you want to confirm the standby really works by sending it a little traffic.',
        tradeoffs: 'Roughly half the primary’s cost again; still a failover step.',
      },
      {
        name: 'Active/active',
        when: 'Near-zero downtime justifies roughly double the cost and the complexity of multi-Region data.',
        tradeoffs: 'Most expensive; hardest to get right (conflicting writes, data consistency).',
      },
    ],
    mistakes: [
      'Believing Multi-AZ covers a Region failure.',
      'Replicating the data but having no plan, or a plan without the data.',
      'Depending on control-plane actions in the failed Region to start recovery.',
      'Never rehearsing, then discovering the real recovery time during the disaster.',
    ],
    aws: [
      'The AWS Well-Architected whitepaper “Disaster Recovery of Workloads on AWS” defines backup and restore, pilot light, warm standby and multi-site active/active',
      'RDS cross-Region read replicas replicate asynchronously and can be promoted to standalone databases',
      'AWS Backup can copy recovery points to another Region on a schedule',
      'Route 53 health checks and failover routing can send traffic to the standby; DNS TTLs and caches affect how quickly clients follow',
    ],
    experiments: [
      'Add the replica without a DR plan: what is the recovery time?',
      'Add a DR plan without the replica: what is the data loss?',
      'Compare pilot light with warm standby: how much extra does the faster recovery cost?',
    ],
  },
  seed: 113,
  guidance: ['database', 'dependencies', 'notes', 'metrics'],
  needsPostmortem: false,
  needsADR: true,
  baselineCost: 1500,
  decisions: (arch) => {
    const dr = arch.nodes.find((n) => n.kind === 'dr-config');
    if (dr && dbOf(arch)?.config.crossRegionReplica)
      return [
        {
          tag: 'm13-regional-outage:multi-region-recovery',
          label: `You built a ${String(dr.config.strategy).replace('-', ' ')} recovery plan with a copy of the data in another Region.`,
          carries: 'Later designs start by asking what survives the loss of the whole Region.',
        },
      ];
    return [];
  },
};
