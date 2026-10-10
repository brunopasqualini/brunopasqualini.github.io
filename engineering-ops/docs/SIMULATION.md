# Simulation model

The simulation is a **small, deterministic, explainable** model — not a cloud emulator. It lives in
`src/engine/` and has no React dependency, so it is unit-tested directly (`src/engine/*.test.ts`).

> All numbers are _simulated estimates_ chosen so trade-offs are visible. They are **not** AWS list prices and
> **not** production measurements. Nothing in this project calls AWS or any cloud API.

## Time

One tick = one virtual minute. `solve(arch, workload, minute, prevState, chaos)` returns a `Snapshot` plus the
next carried `SimState` (queue backlogs, autoscaled replica counts). Same inputs → same outputs.

Workload traffic is a piecewise-linear multiplier profile over minutes (`rpsAt`).

## Solving a snapshot

1. Build the dependency graph from _flow_ edges (`traffic` and `async`). `attach` and `deploy` edges are metadata.
2. Compute static facts per node (replicas, capacity, base latency, injected faults, chaos).
3. Compute network reachability for each edge (`net.ts`): ingress, egress via route/NAT/IGW/SG/NACL, internal SG rules.
4. Iterate (≤10×, damped) a forward load pass and a backward success/latency pass until failure probabilities and
   latencies converge. This is what makes retry storms, health-check evictions and timeouts _emergent_.

### Rules (causal mechanisms with tuned constants)

| Component          | Rule                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compute            | `capacity = replicas × perReplicaRps × sizeMult / cpuMult`. Offered load above capacity is rejected (error). Latency `= base / (1 − utilisation)` (capped); tail `p95 ≈ own × (1.4 + 1.2·u²)`.                                                                                                                                                                                                                                                                                                          |
| Autoscaling        | Target replicas from last tick's load (60% target). Scale-up is stepped (+50% or +2 per minute), scale-down −1/min → capacity _lags_ demand.                                                                                                                                                                                                                                                                                                                                                            |
| Load balancer      | Splits traffic among same-kind targets, weighted toward healthy ones. Health check evicts targets whose probe latency (`latency × 1.35`) exceeds the timeout.                                                                                                                                                                                                                                                                                                                                           |
| Retries            | Attempts per call `= (1 − f^(r+1)) / (1 − f)` where `f` is the callee's failure probability (incl. timeouts). Backoff halves the effective amplification. A circuit breaker opens when `f` exceeds its threshold: load drops to ~10%, callers fail fast.                                                                                                                                                                                                                                                |
| Timeouts           | If callee p95 > timeout, `1 − timeout/p95` of calls fail.                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Relational DB      | Work units: read = 1 (×12 if a slow unindexed scan), write = 3. Reads are spread over replicas. Connections demanded `= Σ callers' replicas × pool size`; without a pooler, excess demand is refused (`1 − max/demand`). Replica lag grows with write utilisation.                                                                                                                                                                                                                                      |
| Cache              | `hit = cacheable × (1 − e^(−ttl/reuse)) × memoryFit`, where `reuse` is the workload’s average seconds between requests for the same key (45 by default; a few seconds for an on-sale page). Reduces read traffic to sibling databases. Staleness `= ttl` (or ~1 s with invalidate-on-write) is compared with the workload's freshness requirement.                                                                                                                                                      |
| Read replicas      | Replica lag `= 0.2 + 3 × min(1.5, writeAndReplayLoad / capacity)` seconds, so a bigger primary lowers lag but it never reaches zero. A share of reads follow the user's own write (`readAfterWriteShare`); the fraction of those that miss it grows linearly once lag exceeds 0.3 s, over a 2 s window. Pinning those reads to the primary (`readYourWrites: primary`) removes the staleness and moves their load onto the primary. A Multi-AZ standby serves no reads and does not change any of this. |
| Key-value hot item | A single item takes at most about 1,000 writes per second, in provisioned and on-demand mode alike. `hotKeyShare` of the writes target one item; `writeShards` divides that rate by N. Writes above the ceiling are throttled even when the table has spare capacity.                                                                                                                                                                                                                                   |
| Region loss        | Only a cross-Region replica (about a minute of data loss) or a cross-Region backup (as old as its schedule) survives. With no copy elsewhere, recovery is "when the Region returns" (48 h) and data loss is up to a week. With a copy, recovery time comes from the DR strategy: 240 min backup and restore, 60 min pilot light, 15 min warm standby, 2 min active/active. A standby stack costs a share of the primary stack: 0%, 10%, 50%, 100%.                                                      |
| Traffic sources    | `share` scales a source's traffic. A source marked `excludeFromSlo` (for example a client over its quota) does not count toward availability or latency.                                                                                                                                                                                                                                                                                                                                                |
| Queue              | Fluid model per tick: `depth' = depth + (workArrival − drain)·60`, `drain = min(consumerCapacity, workArrival + depth/60)`. Poison messages: with a DLQ they cost `maxReceive` attempts then park; without one they stay forever and waste `stuck/visibilityTimeout` receives per second. Visibility timeout shorter than ~2.2× processing time causes redelivery; non-idempotent consumers turn redelivery into data corruption.                                                                       |
| Network            | A subnet is public iff `0.0.0.0/0 → IGW`. NAT must be in a public subnet. SG egress/ingress, NACL outbound and **return** traffic are all checked; every layer is reported, not just the first failure.                                                                                                                                                                                                                                                                                                 |
| AZ outage (chaos)  | Compute pinned to the failed AZ loses all replicas, otherwise half; single-AZ databases fail.                                                                                                                                                                                                                                                                                                                                                                                                           |

## Fidelity and limits

What is real and what is a teaching simplification, so a player never mistakes one for the other.

- **Mechanisms are real; constants are tuned.** Connection exhaustion, retry amplification, queueing delay near
  saturation, visibility-timeout redelivery, stateless versus stateful network layers and NAT placement all behave as
  they do in production. The constants (per-replica throughput, the 12× cost of an unindexed scan, a 100-connection
  limit on the small database, the 60% autoscaling target) are chosen to make the trade-off visible, not measured.
- **Database connection limit.** 100 on the small size is the PostgreSQL default. RDS derives its own default from
  instance memory, so real instances often allow more; the lesson (clients × pool size can exceed the limit) holds
  either way.
- **Latency** uses a single-queue approximation (`1 / (1 − utilisation)`). Real systems have fatter tails, noisy
  neighbours and garbage collection that this does not model.
- **Zone loss** assumes replicas are spread evenly across two zones, so compute loses half its capacity.
- **Visibility timeout.** Redelivery below about 2.2× the processing time is a proxy for variance in processing time.
  In SQS any message still being processed when the timeout expires becomes visible again.
- **Prices** match the structure of AWS pricing (hourly instances, per-GB NAT processing, per-request fees, log
  ingestion) and are roughly the order of magnitude of us-east-1 list prices, but they are estimates and drift as AWS
  changes pricing. Never use them to budget real infrastructure.
- **Not modelled:** regional outages, DNS propagation, noisy-neighbour effects, cold-start latency, cross-AZ data
  transfer charges beyond a flat rate, and most per-service quotas.
- **Product names move.** Scenario notes reference AWS products as of the last review (for example CloudWatch Database
  Insights has replaced RDS Performance Insights, and App Mesh has been discontinued). Re-check them when content is
  added.

## Cost

`cost.ts`: instance-hours, per-request fees, GB-month storage with lifecycle, NAT hourly + per-GB, load balancer
LCUs, data transfer out, log ingestion × level × retention, fixed fees for tooling. Lines are shown per component
in the Cost panel and in the Inspector.

## Analysis layer (`analysis.ts`)

- **Design** — cohesion from module boundaries and domain ownership; coupling from shared databases; operational
  complexity from deployable units, Kubernetes, missing tracing/CD; developer productivity from independent
  deployability and delivery automation.
- **Pipeline** — release safety from tests (unit/integration/e2e), rollout strategy, auto-abort, rollback, flags.
- **Observability** — coverage and mean time to detect from metrics/logs/traces/alerts/synthetics.
- **Recovery** — RPO/RTO from backups, restore tests, Multi-AZ and DR strategy.
- **Causal explanations** — `explainChanges(before, after)` names the component and mechanism behind each
  significant metric change after a deploy.

## Trust

The model is only useful if it never contradicts itself. `engine/invariants.test.ts` runs every mission start and
every lab template through properties that must hold for any architecture: finite and bounded numbers, determinism,
cost equal to the sum of its parts, more traffic never raising the success rate, faults never improving what a
working system serves, a slower dependency never lowering latency, more replicas never lowering capacity, and bigger
instances never costing less. Two exceptions are deliberate and documented in the test: queues may serve more than
arrives while draining a backlog, and a design that has already collapsed can nudge up by fractions of a percent when
a fault removes capacity, because that lowers retry amplification. `game/missions.test.ts` holds the golden
scenarios: for each mission, the intended fix passes, tempting wrong fixes fail for the stated reason, and valid
alternatives differ in cost or score.

## Extending

- New component → add an entry in `src/engine/catalog.ts` (role decides behaviour), parameters in `params.ts`.
- New rule → extend `solve()` in `engine.ts` and add a test in `engine.test.ts` that asserts the _causal_ effect.
