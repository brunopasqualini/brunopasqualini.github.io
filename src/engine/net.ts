import { entryOf } from '@/engine/catalog';
import { nodeById, ofKind } from '@/engine/arch';
import { APP_PORT } from '@/engine/params';
import type { Arch, ArchNode } from '@/engine/types';

export interface FlowStep {
  label: string;
  ok: boolean;
  detail: string;
}
export interface FlowResult {
  ok: boolean;
  steps: FlowStep[];
  blockedAt?: string;
}

export interface SgRule {
  port: number; // 0 = any
  source: string; // 'world' | 'vpc' | sg node id
}

const AWS_PLACED = ['ec2', 'ecs', 'eks', 'lambda', 'alb', 'rds', 'elasticache'];

export function isPlaced(n: ArchNode): boolean {
  return AWS_PLACED.includes(n.kind) && !!n.config.subnet;
}

function result(steps: FlowStep[]): FlowResult {
  const bad = steps.find((s) => !s.ok);
  return { ok: !bad, steps, blockedAt: bad?.label };
}

function igwAttached(arch: Arch, vpcId?: string): boolean {
  return ofKind(arch, 'igw').some((g) => g.config.vpc && (!vpcId || g.config.vpc === vpcId));
}

export function subnetIsPublic(arch: Arch, subnet?: ArchNode): boolean {
  if (!subnet) return false;
  return subnet.config.routeInternet === 'igw' && igwAttached(arch, subnet.config.vpc);
}

function portList(s: string): number[] {
  return String(s ?? '')
    .split(',')
    .map((p) => parseInt(p.trim(), 10))
    .filter((p) => !Number.isNaN(p));
}

/** Can `node` open an outbound connection to the internet on `port`? */
export function egressToInternet(arch: Arch, node: ArchNode, port = 443): FlowResult {
  const steps: FlowStep[] = [];
  const subnet = node.config.subnet ? nodeById(arch, node.config.subnet) : undefined;
  if (!node.config.subnet || !subnet) {
    steps.push({
      label: 'Placement',
      ok: true,
      detail: `${node.label} is not pinned to a VPC subnet in this model, so the default egress path is assumed.`,
    });
    return result(steps);
  }
  steps.push({ label: 'Placement', ok: true, detail: `${node.label} runs in subnet "${subnet.label}" (AZ ${subnet.config.az}).` });
  const route = subnet.config.routeInternet;
  if (route === 'none') {
    steps.push({
      label: 'Route table',
      ok: false,
      detail: `Subnet "${subnet.label}" has only the local route. There is no 0.0.0.0/0 entry, so packets for the internet are dropped.`,
    });
  } else if (route === 'igw') {
    const ok = igwAttached(arch, subnet.config.vpc);
    steps.push({
      label: 'Route table',
      ok,
      detail: ok
        ? `0.0.0.0/0 → internet gateway. "${subnet.label}" is a public subnet.`
        : `0.0.0.0/0 points at an internet gateway, but none is attached to this VPC.`,
    });
  } else {
    const nat = subnet.config.nat ? nodeById(arch, subnet.config.nat) : undefined;
    if (!nat) {
      steps.push({ label: 'Route table', ok: false, detail: `0.0.0.0/0 → NAT gateway, but the route references no existing NAT gateway.` });
    } else {
      steps.push({ label: 'Route table', ok: true, detail: `0.0.0.0/0 → NAT gateway "${nat.label}".` });
      const natSubnet = nat.config.subnet ? nodeById(arch, nat.config.subnet) : undefined;
      const natPublic = subnetIsPublic(arch, natSubnet);
      steps.push({
        label: 'NAT placement',
        ok: natPublic,
        detail: !natSubnet
          ? `NAT gateway "${nat.label}" is not placed in a subnet.`
          : natPublic
            ? `NAT gateway sits in public subnet "${natSubnet.label}" whose route goes to the internet gateway.`
            : `NAT gateway sits in "${natSubnet.label}", which has no route to an internet gateway. A NAT must live in a PUBLIC subnet.`,
      });
    }
  }
  const sg = node.config.sg ? nodeById(arch, node.config.sg) : undefined;
  if (sg) {
    const ports = portList(sg.config.egressPorts);
    const ok = sg.config.egressMode === 'all' || ports.includes(port);
    steps.push({
      label: 'Security group (outbound)',
      ok,
      detail: ok
        ? `"${sg.label}" allows outbound tcp/${port}.`
        : `"${sg.label}" restricts outbound traffic to ports [${ports.join(', ') || 'none'}]; tcp/${port} is not allowed.`,
    });
  }
  const nacl = subnet.config.nacl ? nodeById(arch, subnet.config.nacl) : undefined;
  if (nacl) {
    steps.push({
      label: 'Network ACL (outbound)',
      ok: !!nacl.config.allowOutbound,
      detail: nacl.config.allowOutbound ? 'Outbound allowed.' : `NACL "${nacl.label}" denies outbound traffic from this subnet.`,
    });
    steps.push({
      label: 'Network ACL (return traffic)',
      ok: !!nacl.config.allowEphemeralReturn,
      detail: nacl.config.allowEphemeralReturn
        ? 'Ephemeral return ports allowed.'
        : `NACLs are stateless: "${nacl.label}" does not allow return traffic on ports 1024-65535, so replies are dropped.`,
    });
  }
  const role = node.config.iamRole ? nodeById(arch, node.config.iamRole) : undefined;
  if (node.config.iamRole && role && role.config.canReachExternal === false) {
    steps.push({ label: 'IAM / egress policy', ok: false, detail: `Role "${role.label}" does not permit this call.` });
  }
  return result(steps);
}

/** Can the internet reach `node` (load balancer / instance) on `port`? */
export function ingressFromInternet(arch: Arch, node: ArchNode, port = 443): FlowResult {
  const steps: FlowStep[] = [];
  const subnet = node.config.subnet ? nodeById(arch, node.config.subnet) : undefined;
  if (!node.config.subnet || !subnet) {
    steps.push({
      label: 'Placement',
      ok: true,
      detail: `${node.label} is not pinned to a subnet in this model; public reachability is assumed.`,
    });
    return result(steps);
  }
  const pub = subnetIsPublic(arch, subnet);
  steps.push({
    label: 'Subnet is public',
    ok: pub,
    detail: pub
      ? `"${subnet.label}" routes 0.0.0.0/0 to an internet gateway.`
      : subnet.config.routeInternet === 'igw'
        ? `"${subnet.label}" routes to an internet gateway, but no internet gateway is attached to its VPC.`
        : `"${subnet.label}" has no route to an internet gateway, so it is private. Internet clients cannot reach ${node.label}.`,
  });
  const sg = node.config.sg ? nodeById(arch, node.config.sg) : undefined;
  if (sg) {
    const rules: SgRule[] = sg.config.inbound ?? [];
    const ok = rules.some((r) => (r.port === port || r.port === 0) && r.source === 'world');
    steps.push({
      label: 'Security group (inbound)',
      ok,
      detail: ok
        ? `"${sg.label}" allows tcp/${port} from 0.0.0.0/0.`
        : `"${sg.label}" has no inbound rule allowing tcp/${port} from the internet.`,
    });
  }
  const nacl = subnet.config.nacl ? nodeById(arch, subnet.config.nacl) : undefined;
  if (nacl)
    steps.push({
      label: 'Network ACL',
      ok: !!nacl.config.allowEphemeralReturn,
      detail: nacl.config.allowEphemeralReturn ? 'Allowed.' : `NACL "${nacl.label}" blocks return traffic.`,
    });
  return result(steps);
}

/** Can `from` reach `to` inside the VPC on `port` (app port, database port...)? */
export function internalFlow(arch: Arch, from: ArchNode, to: ArchNode, port: number): FlowResult {
  const steps: FlowStep[] = [];
  const dstSg = to.config.sg ? nodeById(arch, to.config.sg) : undefined;
  if (!dstSg) {
    steps.push({
      label: 'Security group (inbound)',
      ok: true,
      detail: `${to.label} has no security group configured in this model; flow is allowed.`,
    });
    return result(steps);
  }
  const rules: SgRule[] = dstSg.config.inbound ?? [];
  const fromSg = from.config.sg ?? '';
  const match = rules.find(
    (r) => (r.port === port || r.port === 0) && (r.source === 'world' || r.source === 'vpc' || (!!fromSg && r.source === fromSg)),
  );
  steps.push({
    label: 'Security group (inbound)',
    ok: !!match,
    detail: match
      ? `"${dstSg.label}" allows tcp/${port} from ${match.source === 'world' ? '0.0.0.0/0' : match.source === 'vpc' ? 'the VPC CIDR' : `security group "${nodeById(arch, match.source)?.label ?? match.source}"`}.`
      : `"${dstSg.label}" has no inbound rule for tcp/${port} from ${from.label}'s security group, so the connection times out.`,
  });
  return result(steps);
}

export function explainFlow(arch: Arch, srcId: string, dstId: string, port?: number): FlowResult {
  const src = nodeById(arch, srcId);
  const dst = nodeById(arch, dstId);
  if (!src || !dst) return { ok: false, steps: [{ label: 'Resolve', ok: false, detail: 'Unknown source or destination.' }] };
  const dr = entryOf(dst.kind).role;
  if (dr === 'external') return egressToInternet(arch, src, port ?? 443);
  if (entryOf(src.kind).role === 'source') return ingressFromInternet(arch, dst, port ?? 443);
  const p = port ?? (dr === 'db' ? 5432 : dr === 'cache' ? 6379 : APP_PORT);
  return internalFlow(arch, src, dst, p);
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  severity: Severity;
  nodeId?: string;
  title: string;
  detail: string;
  fix: string;
}

const SENSITIVE: Record<number, string> = { 22: 'SSH', 3389: 'RDP', 5432: 'PostgreSQL', 3306: 'MySQL', 6379: 'Redis', 0: 'ALL ports' };

export function securityFindings(arch: Arch): Finding[] {
  const out: Finding[] = [];
  for (const n of arch.nodes) {
    const c = n.config;
    const e = entryOf(n.kind);
    if (n.kind === 'sg') {
      for (const r of (c.inbound ?? []) as SgRule[]) {
        if (r.source === 'world' && r.port in SENSITIVE) {
          const critical = r.port === 0 || r.port === 5432 || r.port === 3306 || r.port === 6379;
          out.push({
            id: `sg-open-${n.id}-${r.port}`,
            severity: critical ? 'critical' : 'high',
            nodeId: n.id,
            title: `${SENSITIVE[r.port]} exposed to the internet`,
            detail: `Security group "${n.label}" allows ${r.port === 0 ? 'every port' : `tcp/${r.port}`} from 0.0.0.0/0.`,
            fix:
              r.port === 22
                ? 'Remove the rule; use SSM Session Manager or a bastion restricted to your office CIDR.'
                : 'Restrict the source to the application security group instead of 0.0.0.0/0.',
          });
        }
      }
    }
    if (e.role === 'storage') {
      if (c.publicAccess)
        out.push({
          id: `pub-bucket-${n.id}`,
          severity: 'critical',
          nodeId: n.id,
          title: 'Storage is publicly accessible',
          detail: `${n.label} allows public reads — anything stored here can be downloaded by anyone.`,
          fix: 'Enable Block Public Access; serve content through CloudFront with an origin access control.',
        });
      if (!c.encrypted)
        out.push({
          id: `unenc-bucket-${n.id}`,
          severity: 'medium',
          nodeId: n.id,
          title: 'Storage is not encrypted at rest',
          detail: `${n.label} has no server-side encryption.`,
          fix: 'Enable SSE-S3 or SSE-KMS.',
        });
    }
    if (e.role === 'db') {
      if (c.publicAccess)
        out.push({
          id: `pub-db-${n.id}`,
          severity: 'critical',
          nodeId: n.id,
          title: 'Database has a public endpoint',
          detail: `${n.label} is publicly accessible. Databases belong in private subnets.`,
          fix: 'Disable public accessibility and allow only the application security group.',
        });
      if (c.encrypted === false)
        out.push({
          id: `unenc-db-${n.id}`,
          severity: 'high',
          nodeId: n.id,
          title: 'Database is not encrypted at rest',
          detail: `${n.label} stores data unencrypted.`,
          fix: 'Enable encryption (requires restore from an encrypted snapshot).',
        });
      if (c.backupRetentionDays === 0)
        out.push({
          id: `nobackup-${n.id}`,
          severity: 'medium',
          nodeId: n.id,
          title: 'Automated backups disabled',
          detail: `${n.label} has 0-day backup retention — no point-in-time recovery.`,
          fix: 'Set backup retention to at least 7 days.',
        });
    }
    if (e.role === 'kv' && c.encrypted === false)
      out.push({
        id: `unenc-kv-${n.id}`,
        severity: 'medium',
        nodeId: n.id,
        title: 'Table is not encrypted',
        detail: `${n.label} is not encrypted at rest.`,
        fix: 'Enable encryption at rest.',
      });
    if (n.kind === 'iam') {
      const users = arch.nodes.filter((x) => x.config.iamRole === n.id).length;
      if (c.policy === 'admin')
        out.push({
          id: `iam-admin-${n.id}`,
          severity: 'high',
          nodeId: n.id,
          title: 'Role has administrator permissions (*:*)',
          detail: `"${n.label}" is attached to ${users} workload(s). A compromised workload can do anything in the account.`,
          fix: 'Replace with a scoped policy listing only the required actions and resources.',
        });
      else if (c.policy === 'broad')
        out.push({
          id: `iam-broad-${n.id}`,
          severity: 'medium',
          nodeId: n.id,
          title: 'Role permissions are broader than needed',
          detail: `"${n.label}" grants service-wide permissions.`,
          fix: 'Narrow actions and resource ARNs to what the workload uses.',
        });
    }
    if (n.kind === 'container-image' && !c.scan)
      out.push({
        id: `img-scan-${n.id}`,
        severity: 'low',
        nodeId: n.id,
        title: 'Images are not vulnerability scanned',
        detail: 'Known CVEs can ship to production unnoticed.',
        fix: 'Enable scanning in the pipeline or registry.',
      });
    if (n.kind === 'alb' && c.subnet && !arch.nodes.some((x) => x.kind === 'waf')) {
      out.push({
        id: `alb-nowaf-${n.id}`,
        severity: 'low',
        nodeId: n.id,
        title: 'Internet-facing load balancer without WAF',
        detail: `${n.label} accepts all HTTP traffic without a web application firewall.`,
        fix: 'Associate AWS WAF with managed rule groups.',
      });
    }
  }
  const aws = arch.nodes.filter((n) => entryOf(n.kind).aws).length;
  if (aws >= 3 && !arch.nodes.some((n) => n.kind === 'cloudtrail')) {
    out.push({
      id: 'no-cloudtrail',
      severity: 'low',
      title: 'No audit trail of API activity',
      detail: 'Without CloudTrail you cannot answer who changed what during an investigation.',
      fix: 'Add AWS CloudTrail.',
    });
  }
  return out;
}
