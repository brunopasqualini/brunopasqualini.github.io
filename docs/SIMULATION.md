# Simulation model

The simulation is a **small, deterministic, explainable** model — not a cloud emulator. It lives in
`src/sim/` and has no React dependency, so it is unit-tested directly (`src/sim/*.test.ts`).

> All numbers are *simulated estimates* chosen so trade-offs are visible. They are **not** AWS list prices and
> **not** production measurements. Nothing in this project calls AWS or any cloud API.

## Time

One tick = one virtual minute. `solve(arch, workload, minute, prevState, chaos)` returns a `Snapshot` plus the
next carried `SimState` (queue backlogs, autoscaled replica counts). Same inputs → same outputs.

Workload traffic is a piecewise-linear multiplier profile over minutes (`rpsAt`).

## Solving a snapshot

1. Build the dependency graph from *flow* edges (`traffic` and `async`). `attach` and `deploy` edges are metadata.
2. Compute static facts per node (replicas, capacity, base latency, injected faults, chaos).
3. Compute network reachability for each edge (`net.ts`): ingress, egress via route/NAT/IGW/SG/NACL, internal SG rules.
4. Iterate (≤10×, damped) a forward load pass and a backward success/latency pass until failure probabilities and
   latencies converge. This is what makes retry storms, health-check evictions and timeouts *emergent*.

### Rules (all causal, none arbitrary)

| Component | Rule |
|---|---|
| Compute | `capacity = replicas × perReplicaRps × sizeMult / cpuMult`. Offered load above capacity is rejected (error). Latency `= base / (1 − utilisation)` (capped); tail `p95 ≈ own × (1.4 + 1.2·u²)`. |
| Autoscaling | Target replicas from last tick's load (60% target). Scale-up is stepped (+50% or +2 per minute), scale-down −1/min → capacity *lags* demand. |
| Load balancer | Splits traffic among same-kind targets, weighted toward healthy ones. Health check evicts targets whose probe latency (`latency × 1.35`) exceeds the timeout. |
| Retries | Attempts per call `= (1 − f^(r+1)) / (1 − f)` where `f` is the callee's failure probability (incl. timeouts). Backoff halves the effective amplification. A circuit breaker opens when `f` exceeds its threshold: load drops to ~10%, callers fail fast. |
| Timeouts | If callee p95 > timeout, `1 − timeout/p95` of calls fail. |
| Relational DB | Work units: read = 1 (×12 if a slow unindexed scan), write = 3. Reads are spread over replicas. Connections demanded `= Σ callers' replicas × pool size`; without a pooler, excess demand is refused (`1 − max/demand`). Replica lag grows with write utilisation. |
| Cache | `hit = cacheable × (1 − e^(−ttl/45)) × memoryFit`. Reduces read traffic to sibling databases. Staleness `= ttl` (or ~1 s with invalidate-on-write) is compared with the workload's freshness requirement. |
| Queue | Fluid model per tick: `depth' = depth + (workArrival − drain)·60`, `drain = min(consumerCapacity, workArrival + depth/60)`. Poison messages: with a DLQ they cost `maxReceive` attempts then park; without one they stay forever and waste `stuck/visibilityTimeout` receives per second. Visibility timeout shorter than ~2.2× processing time causes redelivery; non-idempotent consumers turn redelivery into data corruption. |
| Network | A subnet is public iff `0.0.0.0/0 → IGW`. NAT must be in a public subnet. SG egress/ingress, NACL outbound and **return** traffic are all checked; every layer is reported, not just the first failure. |
| AZ outage (chaos) | Compute pinned to the failed AZ loses all replicas, otherwise half; single-AZ databases fail. |

## Cost

`cost.ts`: instance-hours, per-request fees, GB-month storage with lifecycle, NAT hourly + per-GB, load balancer
LCUs, data transfer out, log ingestion × level × retention, fixed fees for tooling. Lines are shown per component
in the Cost panel and in the Inspector.

## Analysis layer (`analysis.ts`)

* **Design** — cohesion from module boundaries and domain ownership; coupling from shared databases; operational
  complexity from deployable units, Kubernetes, missing tracing/CD; developer productivity from independent
  deployability and delivery automation.
* **Pipeline** — release safety from tests (unit/integration/e2e), rollout strategy, auto-abort, rollback, flags.
* **Observability** — coverage and mean time to detect from metrics/logs/traces/alerts/synthetics.
* **Recovery** — RPO/RTO from backups, restore tests, Multi-AZ and DR strategy.
* **Causal explanations** — `explainChanges(before, after)` names the component and mechanism behind each
  significant metric change after a deploy.

## Extending

* New component → add an entry in `src/sim/catalog.ts` (role decides behaviour), parameters in `params.ts`.
* New rule → extend `solve()` in `engine.ts` and add a test in `engine.test.ts` that asserts the *causal* effect.
