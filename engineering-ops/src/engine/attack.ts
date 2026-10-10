import { roleOf } from '@/engine/arch';
import { emptyState, solve } from '@/engine/engine';
import { securityFindings } from '@/engine/net';
import type { Arch, ArchNode, Snapshot, Workload } from '@/engine/types';

/**
 * Attack simulation. Instead of a score, this walks an attack through the design one stage at a time and shows which
 * defences held, which failed and why, how far the damage spreads, and how long it would take to notice.
 *
 * Two of the attacks are rule-based, reading the same settings the security findings read (IAM policy, encryption, public
 * access, audit trail, backups). The DDoS runs through the real simulation engine, so its numbers are measured, not asserted.
 * It is deterministic and never touches the running simulation: it analyses a design, it does not change it.
 *
 * Timings ("T+5 min") are illustrative orders of magnitude for how an attack unfolds, not measurements.
 */
export type AttackId = 'leaked-credential' | 'public-exposure' | 'ddos';
export type StageStatus = 'held' | 'partial' | 'failed' | 'info';
export type Outcome = 'contained' | 'partial' | 'breach' | 'n/a';

export interface Stage {
  name: string;
  /** What is supposed to stop it at this step. */
  defence: string;
  status: StageStatus;
  detail: string;
  /** Minutes after the attack starts (illustrative); null when it never happens (nothing detects it). */
  at: number | null;
  /** What to change, when the stage failed or only partly held. */
  fix?: string;
}

export interface AttackResult {
  attack: AttackId;
  title: string;
  summary: string;
  outcome: Outcome;
  stages: Stage[];
  /** Components the attacker reaches or controls: highlight these on the canvas. */
  blastRadius: string[];
  /** One line on what it cost. */
  impact: string;
  /** DDoS only: what the engine measured. */
  measured?: {
    baselineAvailability: number;
    availability: number;
    p95: number;
    baselineP95: number;
    costMonthly: number;
    baselineCostMonthly: number;
  };
}

export const ATTACKS: { id: AttackId; title: string; blurb: string }[] = [
  {
    id: 'leaked-credential',
    title: 'Leaked credential',
    blurb: 'An access key is committed to a public repository. How much can the person who finds it reach, and would you know?',
  },
  {
    id: 'public-exposure',
    title: 'Open data store',
    blurb: 'A scanner finds a bucket or database reachable from the internet. What does it expose, and does encryption help?',
  },
  {
    id: 'ddos',
    title: 'HTTP flood (DDoS)',
    blurb: 'Eight times normal traffic, mostly junk, for several minutes. Which layers filter it and what does the rest cost you?',
  },
];

const isData = (n: ArchNode) => ['db', 'kv', 'storage'].includes(roleOf(n));
const byKind = (arch: Arch, kind: string) => arch.nodes.filter((n) => n.kind === kind);
const names = (ns: ArchNode[]) => ns.map((n) => n.label).join(', ');
const unencrypted = (n: ArchNode) => (roleOf(n) === 'storage' ? !n.config.encrypted : n.config.encrypted === false);

/** How an incident would be noticed, from the audit trail and alerting the design has. */
function detection(arch: Arch): Pick<Stage, 'status' | 'detail' | 'at' | 'fix'> {
  const trail = arch.nodes.some((n) => n.kind === 'cloudtrail');
  const alert = arch.nodes.some((n) => n.kind === 'alert-rule');
  if (trail && alert)
    return {
      status: 'held',
      at: 10,
      detail: 'API activity is logged and an alert rule exists, so unusual activity can page someone within minutes.',
    };
  if (trail)
    return {
      status: 'partial',
      at: 360,
      detail: 'API activity is logged, but nothing alerts on it. It would be found when someone reviews the log, hours later.',
      fix: 'Add an alert rule so unusual activity pages someone instead of waiting to be found.',
    };
  return {
    status: 'failed',
    at: null,
    detail:
      'There is no audit trail and no alert. Nothing records what the attacker did, so you would learn about it from a customer or the attacker.',
    fix: 'Add CloudTrail for the audit trail and an alert rule so it is noticed.',
  };
}

function leakedCredential(arch: Arch): AttackResult {
  const title = 'Leaked credential';
  const roles = byKind(arch, 'iam');
  const holders = arch.nodes.filter((n) => typeof n.config.iamRole === 'string' && roles.some((r) => r.id === n.config.iamRole));
  if (!roles.length || !holders.length)
    return {
      attack: 'leaked-credential',
      title,
      summary: 'This design has no IAM role attached to a workload, so there is nothing for a leaked key to belong to.',
      outcome: 'n/a',
      stages: [
        {
          name: 'No identity to steal',
          defence: 'IAM roles',
          status: 'info',
          at: 0,
          detail:
            'In a real account every workload runs as a role. Add an IAM role and attach it to a service (its IAM role field) to see how the role’s permissions limit the damage.',
        },
      ],
      blastRadius: [],
      impact: 'Not applicable to this design.',
    };

  const rank = { admin: 3, broad: 2, scoped: 1 } as Record<string, number>;
  const used = new Set(holders.map((h) => h.config.iamRole));
  const role = roles
    .filter((r) => used.has(r.id))
    .sort((a, b) => (rank[b.config.policy] ?? 1) - (rank[a.config.policy] ?? 1) || a.label.localeCompare(b.label))[0];
  const policy: string = role.config.policy ?? 'scoped';
  const attached = holders.filter((h) => h.config.iamRole === role.id);
  const all = arch.nodes.filter(isData);
  // a scoped role reaches what its workloads legitimately call; a broad or admin role reaches everything
  const called = new Set(arch.edges.filter((e) => attached.some((a) => a.id === e.source)).map((e) => e.target));
  const reach = policy === 'scoped' ? all.filter((d) => called.has(d.id)) : all;

  const stages: Stage[] = [];
  stages.push({
    name: 'Key obtained',
    defence: 'Secret scanning and rotation',
    status: 'info',
    at: 0,
    detail: `A key for "${role.label}" is found in a public repository. It belongs to ${attached.length === 1 ? attached[0].label : `${attached.length} workloads`}, so the attacker acts with that role.`,
  });
  stages.push({
    name: 'What the key can do',
    defence: 'Least-privilege policy',
    at: 1,
    status: policy === 'admin' ? 'failed' : policy === 'broad' ? 'partial' : 'held',
    detail:
      policy === 'admin'
        ? 'The role has administrator permissions (*:*): the attacker can do anything in the account, including creating their own users.'
        : policy === 'broad'
          ? 'The role grants service-wide permissions, far more than the workload needs, so the attacker can read or change every resource of those services.'
          : 'The role is scoped to the actions and resources the workload uses, so the attacker is limited to them.',
    fix: policy === 'scoped' ? undefined : 'Replace the policy with one that lists only the actions and resources the workload needs.',
  });
  stages.push({
    name: 'Data reached',
    defence: 'Blast-radius limits',
    at: 3,
    status: reach.length === 0 ? 'held' : policy === 'scoped' ? 'partial' : 'failed',
    detail: reach.length
      ? `${policy === 'scoped' ? 'Reaches only what the workload itself uses' : `Reaches every data store (${all.length})`}: ${names(reach)}.`
      : 'No data store is reachable with this role.',
    fix:
      policy === 'scoped'
        ? undefined
        : 'A narrower policy shrinks this to the stores the workload actually uses; separate roles per service shrinks it further.',
  });
  const canReadSecrets = !!role.config.canReadSecrets;
  stages.push({
    name: 'Secrets and lateral movement',
    defence: 'Secrets access control',
    at: 4,
    status: canReadSecrets ? 'failed' : 'held',
    detail: canReadSecrets
      ? 'The role can read secrets, so the attacker can pick up database passwords and API keys and move into other systems.'
      : 'The role cannot read secrets, so the attacker cannot use it to reach systems beyond this account’s data.',
    fix: canReadSecrets
      ? 'Remove secret-read permission from this role; fetch secrets with a role that only the one service that needs them can use.'
      : undefined,
  });
  const clear = reach.filter(unencrypted);
  stages.push({
    name: 'Readability of the data',
    defence: 'Encryption at rest',
    at: 5,
    status: clear.length ? 'failed' : policy === 'admin' ? 'failed' : policy === 'broad' ? 'partial' : 'held',
    detail: clear.length
      ? `${names(clear)} ${clear.length === 1 ? 'is' : 'are'} not encrypted, so the data is readable as it stands.`
      : policy === 'admin'
        ? 'The data is encrypted, but an administrator can use the key to decrypt it, so encryption adds nothing against this attacker.'
        : policy === 'broad'
          ? 'The data is encrypted, but a broad role may include permission to use the key, so protection depends on what "broad" grants.'
          : 'The data is encrypted and the scoped role has no permission to use the key.',
    fix: clear.length
      ? 'Enable encryption at rest.'
      : policy === 'scoped'
        ? undefined
        : 'Encryption only protects data from roles that cannot use the key. Narrow the policy as well.',
  });
  const det = detection(arch);
  stages.push({ name: 'Detection', defence: 'Audit trail and alerting', ...det });
  const stores = reach.filter((n) => roleOf(n) === 'db' || roleOf(n) === 'storage');
  const restorable = stores.filter((n) => (roleOf(n) === 'db' ? (n.config.backupRetentionDays ?? 0) > 0 : !!n.config.versioning));
  stages.push({
    name: 'Recovery',
    defence: 'Backups and versioning',
    at: det.at === null ? null : det.at + 30,
    status: stores.length === 0 ? 'held' : restorable.length === stores.length ? 'held' : restorable.length ? 'partial' : 'failed',
    detail:
      stores.length === 0
        ? 'Nothing the attacker can reach needs restoring.'
        : restorable.length === stores.length
          ? 'If the attacker deletes or encrypts data, backups and versioning let you restore it.'
          : `If the attacker deletes data, ${stores.length - restorable.length} of ${stores.length} store(s) cannot be restored: ${names(stores.filter((s) => !restorable.includes(s)))}.`,
    fix: restorable.length === stores.length ? undefined : 'Turn on backup retention for databases and versioning for buckets.',
  });

  const breach = policy !== 'scoped' || clear.length > 0 || canReadSecrets;
  const outcome: Outcome = breach
    ? 'breach'
    : det.status === 'held' && stages[stages.length - 1].status === 'held'
      ? 'contained'
      : 'partial';
  return {
    attack: 'leaked-credential',
    title,
    summary: `A key for "${role.label}" (${policy} policy) leaks.`,
    outcome,
    stages,
    blastRadius: [role.id, ...attached.map((a) => a.id), ...reach.map((r) => r.id)],
    impact: `${reach.length} of ${all.length} data store${all.length === 1 ? '' : 's'} exposed${det.at === null ? '; never detected' : `; detected after about ${det.at < 60 ? `${det.at} min` : `${Math.round(det.at / 60)} h`}`}.`,
  };
}

function publicExposure(arch: Arch): AttackResult {
  const title = 'Open data store';
  const findings = securityFindings(arch);
  const dataPortSgs = new Set(
    findings.filter((f) => f.id.startsWith('sg-open-') && /PostgreSQL|MySQL|Redis|ALL ports/.test(f.title)).map((f) => f.nodeId),
  );
  const buckets = arch.nodes.filter((n) => roleOf(n) === 'storage' && n.config.publicAccess);
  const publicDbs = arch.nodes.filter((n) => roleOf(n) === 'db' && n.config.publicAccess);
  const sgOpen = arch.nodes.filter((n) => ['db', 'cache'].includes(roleOf(n)) && dataPortSgs.has(n.config.sg) && !publicDbs.includes(n));
  const exposed = [...buckets, ...publicDbs, ...sgOpen];
  if (!exposed.length)
    return {
      attack: 'public-exposure',
      title,
      summary: 'A scanner sweeps for open buckets and database ports.',
      outcome: 'contained',
      stages: [
        {
          name: 'Discovery',
          defence: 'No public endpoints',
          status: 'held',
          at: 0,
          detail:
            'No bucket allows public reads, no database has a public endpoint, and no security group opens a database port to the world. The scan finds nothing to connect to.',
        },
      ],
      blastRadius: [],
      impact: 'Nothing exposed.',
    };

  const clear = exposed.filter(unencrypted);
  const stages: Stage[] = [
    {
      name: 'Discovery',
      defence: 'No public endpoints',
      status: 'failed',
      at: 5,
      detail: `${names(exposed)} ${exposed.length === 1 ? 'is' : 'are'} reachable from the internet. Scanners sweep the whole address space and the list of public buckets continuously, so exposed stores are typically found within hours.`,
      fix: 'Block public access on buckets, make databases private, and close database ports to the world.',
    },
    {
      name: 'Access control',
      defence: 'Authentication',
      at: 6,
      status: buckets.length ? 'failed' : 'partial',
      detail: buckets.length
        ? `${names(buckets)} allow${buckets.length === 1 ? 's' : ''} anonymous reads: no credentials are needed to list and download every object.`
        : `${names([...publicDbs, ...sgOpen])} can be reached, but the attacker still needs valid credentials. That exposes it to password guessing and any unpatched engine vulnerability.`,
      fix: buckets.length
        ? 'Enable Block Public Access and serve content through a CDN with an origin access control.'
        : 'Keep databases in private subnets and allow only the application security group.',
    },
    {
      name: 'Encryption at rest',
      defence: 'Encryption',
      at: 6,
      status: 'failed',
      detail: clear.length
        ? `${names(clear)} ${clear.length === 1 ? 'is' : 'are'} not encrypted either. And even when it is enabled, encryption at rest does not help here: the service decrypts data for any request it permits, including an anonymous one.`
        : 'It is enabled, but that does not help here. Encryption at rest protects a stolen disk; the service decrypts transparently for any request it permits, including an anonymous one.',
      fix: 'Close the exposure itself. Encryption is worth having, but it is not the control that stops this.',
    },
  ];
  const det = detection(arch);
  stages.push({
    name: 'Detection',
    defence: 'Audit trail and alerting',
    ...det,
    detail: det.detail + (buckets.length ? ' Downloads of public objects usually need access logging to be recorded at all.' : ''),
  });
  return {
    attack: 'public-exposure',
    title,
    summary: `${exposed.length} data store${exposed.length === 1 ? ' is' : 's are'} reachable from the internet.`,
    outcome: buckets.length ? 'breach' : 'partial',
    stages,
    blastRadius: exposed.map((n) => n.id),
    impact: buckets.length ? `Anyone can read ${names(buckets)}.` : `${names(exposed)} reachable; credentials still required.`,
  };
}

const FLOOD = { mult: 8, malicious: 0.8, minutes: 10 };

function measure(arch: Arch, workload: Workload, attack: boolean): { availability: number; p95: number; cost: number } {
  const w: Workload = attack ? { ...workload, maliciousShare: FLOOD.malicious } : workload;
  const chaos = attack ? [{ type: 'spike' as const, mult: FLOOD.mult }] : [];
  let state = emptyState();
  const window: Snapshot[] = [];
  for (let m = 0; m < FLOOD.minutes; m++) {
    const r = solve(arch, w, m, state, chaos);
    state = r.next;
    window.push(r.snapshot);
  }
  const last = window.slice(-3);
  const avg = (get: (s: Snapshot) => number) => last.reduce((s, x) => s + get(x), 0) / last.length;
  return {
    availability: avg((s) => s.system.successRate) * 100,
    p95: avg((s) => s.system.p95),
    cost: window[window.length - 1].system.costMonthly,
  };
}

function ddos(arch: Arch, workload: Workload): AttackResult {
  const title = 'HTTP flood (DDoS)';
  const has = (kind: string) => arch.nodes.some((n) => n.kind === kind);
  const waf = byKind(arch, 'waf')[0];
  const compute = arch.nodes.filter((n) => ['compute', 'worker'].includes(roleOf(n)) && n.kind !== 'lambda');
  const autoscaled = arch.nodes.some((n) => n.config.autoscale || n.kind === 'lambda' || n.kind === 'autoscaling');
  const throttled =
    arch.nodes.some((n) => (n.kind === 'api-gateway' || n.kind === 'apigw') && (n.config.throttleRps ?? 0) > 0) ||
    has('rate-limiter') ||
    (waf?.config.rateLimit ?? 0) > 0;
  const base = measure(arch, workload, false);
  const hit = measure(arch, workload, true);

  const stages: Stage[] = [
    {
      name: 'Flood arrives',
      defence: 'Provider network',
      status: 'info',
      at: 0,
      detail: `Traffic jumps to ${FLOOD.mult}× normal, ${Math.round(FLOOD.malicious * 100)}% of it junk, and stays there for the test.`,
    },
    {
      name: 'Edge absorption',
      defence: 'CDN',
      at: 1,
      status: has('cloudfront') ? 'partial' : 'failed',
      detail: has('cloudfront')
        ? 'A CDN serves cacheable content without touching your origin, but a flood aimed at uncached, dynamic endpoints passes straight through.'
        : 'There is no CDN, so every request, cacheable or not, reaches your origin.',
      fix: has('cloudfront') ? undefined : 'Put a CDN in front: it absorbs the cacheable share and keeps the flood off the origin.',
    },
    {
      name: 'Filtering',
      defence: 'Web application firewall',
      at: 1,
      status: !waf ? 'failed' : waf.config.managedRules ? ((waf.config.rateLimit ?? 0) > 0 ? 'held' : 'partial') : 'failed',
      detail: !waf
        ? 'There is no web application firewall, so junk requests are indistinguishable from real ones until they hit your servers.'
        : waf.config.managedRules
          ? (waf.config.rateLimit ?? 0) > 0
            ? 'Managed rules drop known-bad patterns and a rate limit caps any one client.'
            : 'Managed rules drop known-bad patterns, but a flood of normal-looking requests needs a rate limit as well.'
          : 'A firewall is present but its managed rules are off, so it filters nothing.',
      fix: !waf
        ? 'Add a web application firewall with managed rules and a rate limit.'
        : waf.config.managedRules && (waf.config.rateLimit ?? 0) > 0
          ? undefined
          : 'Turn on managed rules and set a rate limit.',
    },
    {
      name: 'Throttling at the front door',
      defence: 'Gateway throttle / rate limiter',
      at: 2,
      status: throttled ? 'partial' : 'failed',
      detail: throttled
        ? 'A throttle caps the request rate and protects the services, but it cannot tell junk from customers, so real users are rejected too once it bites. It works best behind filtering.'
        : 'Nothing caps the request rate, so the flood is passed on to the services at full volume.',
      fix: throttled
        ? waf?.config.managedRules
          ? undefined
          : 'Put filtering (a firewall with managed rules) in front, so the throttle only has to catch what filtering misses.'
        : 'Set a throttle on the gateway, add a rate limiter, or set a rate limit on the firewall.',
    },
    {
      name: 'Absorbing capacity',
      defence: 'Autoscaling',
      at: 3,
      status: compute.length === 0 && !autoscaled ? 'info' : autoscaled ? 'partial' : 'failed',
      detail: autoscaled
        ? 'Services scale out, which can ride out the flood, but with a delay, and you pay for every extra instance for as long as it lasts.'
        : 'Capacity is fixed, so once the flood exceeds it requests queue and fail.',
      fix: autoscaled
        ? 'Scaling is a backstop, not a defence: filter and throttle first so you are not paying to serve junk.'
        : 'Enable autoscaling, but filter and throttle first.',
    },
  ];
  const avail = hit.availability;
  const costUp = hit.cost - base.cost;
  stages.push({
    name: 'Measured impact (simulated)',
    defence: 'The whole design',
    at: FLOOD.minutes,
    status: avail >= 99 ? 'held' : avail >= 90 ? 'partial' : 'failed',
    detail: `With the flood: ${avail.toFixed(1)}% available and p95 ${Math.round(hit.p95)} ms (normally ${base.availability.toFixed(1)}% and ${Math.round(base.p95)} ms). Run-rate cost ${costUp >= 1 ? `rises by $${Math.round(costUp).toLocaleString('en-US')}/month` : 'barely moves'} while it lasts.`,
  });
  const outcome: Outcome = avail >= 99 ? 'contained' : avail >= 90 ? 'partial' : 'breach';
  return {
    attack: 'ddos',
    title,
    summary: `${FLOOD.mult}× normal traffic, ${Math.round(FLOOD.malicious * 100)}% junk, for ${FLOOD.minutes} minutes.`,
    outcome,
    stages,
    blastRadius: arch.nodes.filter((n) => ['edge', 'cdn', 'waf', 'gateway', 'lb', 'compute'].includes(roleOf(n))).map((n) => n.id),
    impact: `${avail.toFixed(1)}% available under the flood${costUp >= 1 ? `, about $${Math.round(costUp).toLocaleString('en-US')}/month more to serve it` : ''}.`,
    measured: {
      baselineAvailability: base.availability,
      availability: avail,
      p95: hit.p95,
      baselineP95: base.p95,
      costMonthly: hit.cost,
      baselineCostMonthly: base.cost,
    },
  };
}

export function runAttack(id: AttackId, arch: Arch, workload: Workload): AttackResult {
  switch (id) {
    case 'leaked-credential':
      return leakedCredential(arch);
    case 'public-exposure':
      return publicExposure(arch);
    case 'ddos':
      return ddos(arch, workload);
  }
}

/** Distinct fixes for the stages that failed or only partly held, most serious first. */
export function whatToChange(result: AttackResult): string[] {
  const order = { failed: 0, partial: 1, held: 2, info: 3 } as const;
  return [
    ...new Set(
      result.stages
        .filter((s) => s.fix && (s.status === 'failed' || s.status === 'partial'))
        .sort((a, b) => order[a.status] - order[b.status])
        .map((s) => s.fix!),
    ),
  ];
}
