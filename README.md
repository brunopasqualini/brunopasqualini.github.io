# Engineering Ops — Build. Break. Learn.

A browser-based engineering **simulation game**. You design cloud architectures, deploy them, watch how they behave
under load and failure, investigate incidents from logs/metrics/traces/changes, and learn from the *consequences* —
not from memorising service names.

* Real, runnable **React + TypeScript + Vite** app. No backend, no account, no cloud calls.
* A deterministic, rule-based **simulation engine** (pure TypeScript, unit-tested) with explainable causal effects.
* **Six playable missions** on one data-driven engine, an **Architecture Lab** sandbox with chaos drills,
  scoring across ten dimensions, skill tree, journal, ADRs and postmortems.
* Everything is **simulated**. Costs are *estimates*, not AWS prices; nothing touches a real cloud account.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 89 unit + integration tests (vitest)
npm run typecheck
npm run build      # static site in dist/ (relative base: host it anywhere, incl. GitHub Pages)
npm run preview
```

Requires Node 20+. Progress is saved in your browser (`localStorage`); Settings → Export/Import moves it between browsers.

## How to play

1. **Command Center** — level, skills, active incidents, recommended next mission. Pick *Beginner / Intermediate / Advanced*.
2. **Mission Control** — start a mission. Read the briefing, constraints and success criteria.
3. **Investigate** — dock panels under the canvas: Metrics, Logs, Traces, Dependencies, Changes & timeline, Database,
   Queues, Network inspector, Cost, Security, Alerts. (In incidents, opening a panel costs a simulated minute outside beginner mode.)
4. **Hypothesise** — record what you think the root cause is (Mission tab). Diagnosis quality is scored.
5. **Design** — drag components from the library, connect them (drag handle → handle), configure them in the Inspector.
   Edits are a *draft*.
6. **Deploy** — Plan tab: review the diff, validation and estimated cost change, then *Deploy*. The simulator shows
   **what changed and why** (e.g. “replicas 4→8 raised DB connections 80→160 of 100; 37% of new connections are refused”).
7. **Handle consequences** — fix side effects, revert a deploy, or retry the mission.
8. **Verify & submit** — runs a verification load test, scores 10 dimensions, shows a structured debrief.

Keyboard: `Space` run/pause, `.` step one minute, `Delete` removes the selected item.

## The missions

| # | Mission | Kind | Teaches |
|---|---|---|---|
| 1 | The Growing Monolith | project | cohesion/coupling, modular monolith vs microservices, shared-database coupling, ADRs |
| 2 | The Database Meltdown | incident | bottleneck analysis, indexes, connection pooling, caching trade-offs, why scaling the app tier backfires |
| 3 | The Unreliable Deployment | incident | CI/CD, integration tests, canary/blue-green, auto-rollback, feature flags, blast radius |
| 4 | The AWS Networking Puzzle | project | VPC, subnets, routes, IGW/NAT, security groups vs NACLs, IAM least privilege — with a layer-by-layer network inspector |
| 5 | The Queue That Never Drains | incident | SQS semantics, visibility timeout, DLQs, idempotency, backpressure, eventual consistency |
| 6 | The Cloud Bill Shock | project | right-sizing, lifecycle, NAT/data-transfer, log costs, tags, cost vs reliability |

Each has multiple valid solutions and tempting wrong ones; `src/game/missions.test.ts` encodes both.

## Architecture

```
src/
  sim/            Pure simulation library (no React)
    catalog.ts      ~80 typed components, config fields, connection rules
    arch.ts         graph helpers, validation, diff
    engine.ts       deterministic solver (capacity, latency, retries, queues, DB connections, cache, autoscaling, chaos)
    net.ts          network reachability + security findings
    cost.ts         explainable cost lines        params.ts  documented constants
    analysis.ts     design/pipeline/observability/recovery reports, causal explanations
    telemetry.ts    logs, traces, alert history, DB stats, cost breakdown
  missions/       Data-driven mission definitions (+ types, helpers)
  game/           session (replayable state machine), scoring, progression, store (zustand + persistence), academy, templates
  ui/             App shell, pages, workspace (canvas, library, inspector, plan), evidence panels, modals
docs/             SIMULATION.md (model & formulas), MISSIONS.md (authoring guide)
```

* **Persistence by replay.** A session is an ordered log of ops (advance / deploy / action / chaos / revert); resuming
  replays them deterministically, so saves stay tiny and exact.
* **Clear boundaries for a future backend:** the store is the only persistence consumer (`zustand/persist`); the
  simulation and scoring are pure functions.
* See [`docs/SIMULATION.md`](docs/SIMULATION.md) for every rule and [`docs/MISSIONS.md`](docs/MISSIONS.md) to add a scenario.

## Design notes

* **Visual states:** healthy, degraded, overloaded, unavailable, insecure, misconfigured, idle — each with a stated cause.
* **Progressive disclosure:** the sandbox unlocks tiers by level (or all, in Settings); missions expose only relevant components.
* **Responsive:** three-pane desktop editor; single-pane workspace with bottom navigation on tablet/phone.
* **Accessibility:** semantic landmarks, labelled controls, dialogs with focus handling, keyboard-operable controls,
  `prefers-reduced-motion` respected, status never conveyed by colour alone (text tags + reasons).

## Limitations (by design)

This is an MVP teaching model: small, internally consistent and defensible, not a faithful cloud simulator.
Terraform/IAM/pipeline artifacts are educational and non-executable. The deployment-strategy and
multi-region behaviours are intentionally coarse.
