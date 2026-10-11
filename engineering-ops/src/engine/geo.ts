import { analyzeObservability, analyzeRecovery } from '@/engine/analysis';
import { ofKind } from '@/engine/arch';
import { SECONDS_PER_MONTH } from '@/engine/params';
import type { Arch, Workload } from '@/engine/types';

/**
 * Multi-Region traffic analysis: where your users are, which Region serves them, what that costs them in latency, how DNS
 * decides, what happens when the primary Region is lost, how far behind a replica in another Region runs, and what moving that
 * data costs.
 *
 * This is an analysis layer over the design, not part of the per-minute solve: it reads the settings the design already has (DR
 * strategy, cross-Region replica and backups, the Route 53 routing policy and health checks, a CDN) and combines them with a
 * simple, explicit network model. The round-trip times are typical figures between these places, rounded, not measurements;
 * they are the same for every design, so comparisons between designs are fair. Pure and deterministic.
 */
export type RegionId = 'us-east-1' | 'eu-west-1' | 'ap-southeast-1';
export type GeoId = 'na' | 'eu' | 'ap';

export const REGIONS: { id: RegionId; name: string }[] = [
  { id: 'us-east-1', name: 'N. Virginia' },
  { id: 'eu-west-1', name: 'Ireland' },
  { id: 'ap-southeast-1', name: 'Singapore' },
];
export const GEOS: { id: GeoId; name: string }[] = [
  { id: 'na', name: 'North America' },
  { id: 'eu', name: 'Europe' },
  { id: 'ap', name: 'Asia-Pacific' },
];

/** Typical round-trip time in ms from a user population to a Region. */
export const USER_RTT: Record<GeoId, Record<RegionId, number>> = {
  na: { 'us-east-1': 25, 'eu-west-1': 85, 'ap-southeast-1': 220 },
  eu: { 'us-east-1': 85, 'eu-west-1': 20, 'ap-southeast-1': 175 },
  ap: { 'us-east-1': 225, 'eu-west-1': 175, 'ap-southeast-1': 25 },
};
/** Typical round-trip time in ms between two Regions. */
export const REGION_RTT: Record<RegionId, Record<RegionId, number>> = {
  'us-east-1': { 'us-east-1': 0, 'eu-west-1': 75, 'ap-southeast-1': 215 },
  'eu-west-1': { 'us-east-1': 75, 'eu-west-1': 0, 'ap-southeast-1': 170 },
  'ap-southeast-1': { 'us-east-1': 215, 'eu-west-1': 170, 'ap-southeast-1': 0 },
};

export const USER_MIXES: { id: string; name: string; share: Record<GeoId, number> }[] = [
  { id: 'na-heavy', name: 'Mostly North America (70 / 20 / 10)', share: { na: 0.7, eu: 0.2, ap: 0.1 } },
  { id: 'global', name: 'Global (40 / 30 / 30)', share: { na: 0.4, eu: 0.3, ap: 0.3 } },
  { id: 'eu-heavy', name: 'Mostly Europe (15 / 70 / 15)', share: { na: 0.15, eu: 0.7, ap: 0.15 } },
  { id: 'ap-heavy', name: 'Mostly Asia-Pacific (10 / 20 / 70)', share: { na: 0.1, eu: 0.2, ap: 0.7 } },
];

/** Round trips a request spends before your code runs (TCP + TLS + request) when users connect to the origin directly. */
export const TRIPS_DIRECT = 3;
/** With a CDN the handshakes end at a nearby edge (~20 ms away) and one round trip crosses to the origin. */
export const EDGE_RTT = 20;
/** A user-facing p95 above this is flagged as slow. */
export const SLOW_P95_MS = 600;
/** Average bytes replicated per write, and what AWS charges to move a GB between Regions. */
export const WRITE_RECORD_KB = 2;
export const INTER_REGION_PER_GB = 0.02;

export interface GeoInput {
  primary: RegionId;
  secondary: RegionId;
  mix: Record<GeoId, number>;
  /** The system's own p95 in ms, before network time. */
  backendP95Ms: number;
}

export interface GeoRow {
  geo: GeoId;
  name: string;
  /** Share of users, normalised to sum to 1. */
  share: number;
  /** Region(s) serving this population in normal operation. */
  servedFrom: RegionId[];
  /** Weighted network round trip to those Region(s). */
  rtt: number;
  p95: number;
  /** p95 if the primary Region were lost and everyone is served from the secondary. */
  p95AfterFailover: number;
  slow: boolean;
}

export type FailoverPath = 'automatic' | 'manual' | 'none';

export interface FailoverReport {
  path: FailoverPath;
  /** Minutes until users are served again after the primary Region is lost. */
  minutes: number;
  /** How the minutes break down, in order. */
  steps: { label: string; minutes: number }[];
  possible: boolean;
}

export interface GeoReport {
  rows: GeoRow[];
  weightedP95: number;
  /** Share of users whose p95 exceeds SLOW_P95_MS. */
  slowShare: number;
  mode: 'single-region' | 'active-active-routed' | 'active-active-split' | 'active-active-unrouted';
  failover: FailoverReport;
  /** Replica lag to the secondary Region in seconds, or null when nothing is replicated continuously. */
  replicationLagSec: number | null;
  /** Estimated cross-Region replication traffic in $/month, or 0 when there is none. */
  transferCostMonthly: number;
  transferGBMonthly: number;
  notes: string[];
}

const normalise = (mix: Record<GeoId, number>): Record<GeoId, number> => {
  const sum = GEOS.reduce((s, g) => s + Math.max(0, mix[g.id] ?? 0), 0);
  return Object.fromEntries(GEOS.map((g) => [g.id, sum > 0 ? Math.max(0, mix[g.id] ?? 0) / sum : 1 / GEOS.length])) as Record<
    GeoId,
    number
  >;
};

const latency = (backend: number, geo: GeoId, region: RegionId, cdn: boolean): number =>
  backend + (cdn ? 2 * EDGE_RTT + USER_RTT[geo][region] : TRIPS_DIRECT * USER_RTT[geo][region]);

export function analyzeGeography(arch: Arch, workload: Workload, input: GeoInput): GeoReport {
  const { primary, secondary } = input;
  const mix = normalise(input.mix);
  const dr = ofKind(arch, 'dr-config')[0];
  const strategy: string = dr?.config.strategy ?? 'backup-restore';
  const activeActive = strategy === 'active-active' && secondary !== primary;
  const dns = ofKind(arch, 'route53')[0];
  const routing: string = dns?.config.routing ?? 'simple';
  const cdn = arch.nodes.some((n) => n.kind === 'cloudfront');
  const recovery = analyzeRecovery(arch);

  let mode: GeoReport['mode'] = 'single-region';
  if (activeActive)
    mode = routing === 'latency' ? 'active-active-routed' : routing === 'weighted' ? 'active-active-split' : 'active-active-unrouted';

  const rows: GeoRow[] = GEOS.map((g) => {
    let served: RegionId[];
    let p95: number;
    if (mode === 'active-active-routed') {
      const nearest = (USER_RTT[g.id][primary] <= USER_RTT[g.id][secondary] ? primary : secondary) as RegionId;
      served = [nearest];
      p95 = latency(input.backendP95Ms, g.id, nearest, cdn);
    } else if (mode === 'active-active-split') {
      served = [primary, secondary];
      p95 = (latency(input.backendP95Ms, g.id, primary, cdn) + latency(input.backendP95Ms, g.id, secondary, cdn)) / 2;
    } else {
      served = [primary];
      p95 = latency(input.backendP95Ms, g.id, primary, cdn);
    }
    const rtt = served.reduce((s, r) => s + USER_RTT[g.id][r], 0) / served.length;
    const after = latency(input.backendP95Ms, g.id, secondary, cdn);
    return { geo: g.id, name: g.name, share: mix[g.id], servedFrom: served, rtt, p95, p95AfterFailover: after, slow: p95 > SLOW_P95_MS };
  });
  const weightedP95 = rows.reduce((s, r) => s + r.share * r.p95, 0);
  const slowShare = rows.filter((r) => r.slow).reduce((s, r) => s + r.share, 0);

  // ---- losing the primary Region ----
  const hasCopy = recovery.crossRegion;
  const healthChecked = !!dns && !!dns.config.healthChecks && routing !== 'simple';
  const mttd = analyzeObservability(arch).mttdMinutes;
  const steps: FailoverReport['steps'] = [];
  let path: FailoverPath;
  if (!hasCopy) {
    path = 'none';
    steps.push({ label: 'Nothing is copied to another Region: wait for the Region to come back', minutes: recovery.regionRtoMinutes });
  } else if (healthChecked) {
    path = 'automatic';
    steps.push(
      { label: 'Health checks fail three times', minutes: 1.5 },
      { label: 'DNS record expires and clients re-resolve', minutes: 1 },
    );
  } else {
    path = 'manual';
    steps.push(
      { label: dns ? 'Someone notices (DNS has no health checks)' : 'Someone notices', minutes: mttd },
      { label: 'Decide and change the DNS record by hand', minutes: 15 },
      { label: 'DNS record expires and clients re-resolve', minutes: 5 },
    );
  }
  if (path !== 'none' && !activeActive)
    steps.push({ label: `Bring the second Region up (${strategy.replace('-', ' ')})`, minutes: recovery.rtoMinutes });
  const failover: FailoverReport = { path, minutes: steps.reduce((s, x) => s + x.minutes, 0), steps, possible: path !== 'none' };

  // ---- the link between Regions ----
  const replica = arch.nodes.some((n) => !!n.config.crossRegionReplica);
  const replicates = replica || activeActive;
  const writeRps = workload.baseRps * (1 - workload.readRatio);
  const interRtt = REGION_RTT[primary][secondary];
  const replicationLagSec = replicates && secondary !== primary ? +(0.2 + interRtt / 1000 + writeRps / 2000).toFixed(2) : null;
  const transferGB = replicates && secondary !== primary ? (writeRps * WRITE_RECORD_KB * SECONDS_PER_MONTH) / 1e6 : 0;

  // ---- what to tell the person ----
  const notes: string[] = [];
  const far = rows.filter((r) => r.share >= 0.1).sort((a, b) => b.p95 - a.p95)[0];
  if (far && !cdn && USER_RTT[far.geo][far.servedFrom[0]] >= 150)
    notes.push(
      `${far.name} users are about ${Math.round(USER_RTT[far.geo][far.servedFrom[0]])} ms from ${far.servedFrom[0]}, and without a CDN each connection spends ${TRIPS_DIRECT} round trips on that distance (about ${Math.round(TRIPS_DIRECT * USER_RTT[far.geo][far.servedFrom[0]])} ms) before your code runs. A CDN ends the handshakes at a nearby edge.`,
    );
  if (activeActive && mode === 'active-active-unrouted')
    notes.push(
      `The DR strategy is active/active, but ${dns ? `the ${routing} routing policy` : 'there is no DNS routing policy'} sends everyone to the primary Region, so the second Region idles. Use latency routing to serve each user from the nearest Region.`,
    );
  if (mode === 'active-active-split')
    notes.push(
      'Weighted routing splits users 50/50 whatever their location, so half of every population is served from the far Region. Latency routing serves each from the nearest.',
    );
  if (activeActive && !replica && !arch.nodes.some((n) => n.kind === 'dynamodb'))
    notes.push(
      'Active/active needs the data in both Regions. Without a cross-Region replica or a global table, the second Region has nothing to serve.',
    );
  if (activeActive)
    notes.push(
      'Writing in both Regions means the same record can change in both at once. Decide how conflicts are resolved (last write wins, or per-record ownership) before you rely on it.',
    );
  if (path === 'automatic' && !activeActive)
    notes.push(
      `Failover itself takes about ${Math.round(steps[0].minutes + steps[1].minutes)} minutes, but the second Region takes ${recovery.rtoMinutes} more to be ready: DNS is not the slow part.`,
    );
  if (path === 'manual')
    notes.push(
      'Failover depends on a person. Add health checks and a failover or latency routing policy so DNS moves traffic without waiting for one.',
    );
  if (path === 'none')
    notes.push(
      'Nothing is stored outside this Region. Add a cross-Region replica or backup copy and a DR strategy to have a place to fail over to.',
    );
  if (path !== 'none' && secondary !== primary) {
    const worst = [...rows].sort((a, b) => b.p95AfterFailover - a.p95AfterFailover)[0];
    if (worst.p95AfterFailover > SLOW_P95_MS && worst.share >= 0.1)
      notes.push(
        `After failover ${worst.name} users are served from ${secondary} at about ${Math.round(worst.p95AfterFailover)} ms p95. Pick a secondary Region closer to where your users are.`,
      );
  }
  if (replicationLagSec !== null && replicationLagSec > 1)
    notes.push(`The replica runs about ${replicationLagSec.toFixed(1)} s behind, so a Region loss could lose that much recent data.`);

  return {
    rows,
    weightedP95,
    slowShare,
    mode,
    failover,
    replicationLagSec,
    transferCostMonthly: transferGB * INTER_REGION_PER_GB,
    transferGBMonthly: transferGB,
    notes,
  };
}
