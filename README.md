# Engineering Ops — Build. Break. Learn.

An **engineering simulation platform**: _Build systems. Solve problems. Understand the consequences. Think like an
engineer._ You design cloud architectures, deploy them, watch how they behave under load and failure, investigate
incidents from logs/metrics/traces/changes, and learn from the _consequences_, not from memorising service names.

It is built for aspiring engineers and career changers who need to connect concepts into a working system, working
software/cloud/DevOps/platform engineers who want practice beyond tutorials and certification questions, and developers
growing into system-design responsibility who need to make and defend decisions. Progress runs through five stages of
problem complexity (Software Engineer → System Designer → Cloud Engineer → Platform/SRE → Principal/Architect). Every
stage has scenarios, and the capstone starts from the platform _you_ built: earlier decisions come back as named debts
or benefits.

- Real, runnable **React + TypeScript + Vite** app. No backend, no account, no cloud calls.
- A deterministic, rule-based **simulation engine** (pure TypeScript, unit-tested) with explainable causal effects.
- **Fourteen playable missions** on one data-driven engine, an **Architecture Lab** sandbox with chaos drills,
  scoring across ten dimensions, skill tree, journal, ADRs and postmortems.
- Everything is **simulated**. Costs are _estimates_, not AWS prices; nothing touches a real cloud account.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + integration tests (vitest)
npm run typecheck
npm run lint       # ESLint 10 flat config (react-hooks rules, import boundaries)
npm run format     # Prettier
npm run check      # typecheck + lint + tests
npm run build      # static site in dist/ (relative base: host it anywhere, incl. GitHub Pages)
npm run preview
```

Requires Node 20+. Progress is saved in your browser (`localStorage`); Settings → Export/Import moves it between browsers.

## How to play

1. **Home** — the product promise, the five-stage journey, your progress and the recommended next mission. Pick _Beginner / Intermediate / Advanced_.
2. **Missions** — start a mission. Read the briefing, constraints and success criteria.
3. **Investigate** — dock panels under the canvas: Metrics, Logs, Traces, Dependencies, Changes & timeline, Database,
   Queues, Network inspector, Cost, Security, Alerts. (In incidents, opening a panel costs a simulated minute outside beginner mode.)
4. **Hypothesise** — record what you think the root cause is (mission panel, left). Diagnosis quality is scored.
5. **Design** — drag components from the library, connect them (drag handle → handle), configure them in the Selected panel (right).
   Edits are a _draft_.
6. **Deploy** — Plan & deploy tab: review the diff, validation and estimated cost change, then _Deploy_. The simulator shows
   **what changed and why** (e.g. “replicas 4→8 raised DB connections 80→160 of 100; 37% of new connections are refused”).
7. **Handle consequences** — fix side effects, revert a deploy, or retry the mission.
8. **Verify & submit** — runs a verification load test, scores 10 dimensions, shows a structured debrief.

Keyboard: `Space` run/pause, `.` step one minute, `Delete` removes the selected item.

## The missions

| #   | Mission                     | Kind     | Teaches                                                                                                                                  |
| --- | --------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The Growing Monolith        | project  | cohesion/coupling, modular monolith vs microservices, shared-database coupling, ADRs                                                     |
| 2   | The Database Meltdown       | incident | bottleneck analysis, indexes, connection pooling, caching trade-offs, why scaling the app tier backfires                                 |
| 3   | The Unreliable Deployment   | incident | CI/CD, integration tests, canary/blue-green, auto-rollback, feature flags, blast radius                                                  |
| 4   | The AWS Networking Puzzle   | project  | VPC, subnets, routes, IGW/NAT, security groups vs NACLs, IAM least privilege — with a layer-by-layer network inspector                   |
| 5   | The Queue That Never Drains | incident | SQS semantics, visibility timeout, DLQs, idempotency, backpressure, eventual consistency                                                 |
| 6   | The Cloud Bill Shock        | project  | right-sizing, lifecycle, NAT/data-transfer, log costs, tags, cost vs reliability                                                         |
| 7   | The N+1 Endpoint            | project  | N+1 queries, fixing the cause vs a bigger database or a cache, queries per request as a budget                                           |
| 8   | The Impatient Client        | project  | timeouts as contracts, retry budgets, circuit breakers, why replicas do not fix a slow dependency                                        |
| 9   | The Merger (capstone)       | project  | competing requirements, what to converge, data ownership, audit and peak readiness, ADRs; **inherits debts from missions 1, 2, 7 and 8** |
| 10  | The Stale Receipt           | incident | asynchronous replication, replica lag, read-your-writes, why capacity lowers lag but never removes it                                    |
| 11  | The Hot Key                 | incident | DynamoDB per-item limits, throttling with spare capacity, write sharding and what it costs                                               |
| 12  | The Noisy Neighbour         | incident | per-client rate limiting, why a global limit and more capacity fail, backpressure with 429s                                              |
| 13  | The Regional Outage         | project  | Region versus zone resilience, RTO and RPO, backup and restore, pilot light, warm standby, active/active                                 |
| 14  | The Blank Page              | project  | designing from requirements: contended inventory, short-TTL caching, zone survival, complexity as a cost                                 |

Journey order: Level 1 = missions 2, 7, 8 · Level 2 = 1, 5, 10 · Level 3 = 4, 6, 11 · Level 4 = 3, 12, 13 · Level 5 = 14, 9. New players start with Mission 2: something is visibly failing, which teaches the investigate-and-fix loop faster than an open design brief.

Each has multiple valid solutions and tempting wrong ones; `src/game/missions.test.ts` encodes both.

## Architecture

```
src/
  app/            entry, providers, routes (React Router, hash + lazy), shell (top nav), dialogs
  engine/         pure simulation library (no React): catalog, arch, engine, net, cost, analysis, telemetry, params
  content/        data-driven missions, academy lessons, sandbox templates, journey stages, positioning copy
  game/           replayable session state machine, scoring, progression, zustand store + persistence, hooks
  entities/       cross-feature domain widgets (mission buttons)
  features/       home, missions, incidents, lab/workspace, academy, journal, achievements (no cross-imports)
  shared/         ui (design-system components on Base UI), lib, hooks
  styles/         tokens, base, layout, components, features, responsive: CSS cascade layers
docs/             ARCHITECTURE.md (stack decisions and research), SIMULATION.md (model), MISSIONS.md (authoring)
```

- **Persistence by replay.** A session is an ordered log of ops (advance / deploy / action / chaos / revert); resuming
  replays them deterministically, so saves stay tiny and exact.
- **Clear boundaries for a future backend:** the store is the only persistence consumer (`zustand/persist`); the
  simulation and scoring are pure functions.
- See [`docs/SIMULATION.md`](docs/SIMULATION.md) for every rule and [`docs/MISSIONS.md`](docs/MISSIONS.md) to add a scenario.

## Design notes

- **Visual states:** healthy, degraded, overloaded, unavailable, insecure, misconfigured, idle — each with a stated cause.
- **Progressive disclosure:** the sandbox unlocks tiers by level (or all, in Settings); missions expose only relevant components.
- **Responsive:** three-column desktop workspace (mission | canvas + evidence | components + inspector) with the side columns collapsible; single-pane workspace with bottom navigation on tablet/phone.
- **Identity:** dark command-centre palette defined as design tokens in `src/styles/tokens.css`; nodes are category-coloured icon tiles; the canvas shows the real fleet behind each node (instances, replicas, queue depth).
- **Accessibility:** semantic landmarks, labelled controls, dialogs with focus handling, keyboard-operable controls,
  `prefers-reduced-motion` respected, status never conveyed by colour alone (text tags + reasons).

## Limitations (by design)

This is an MVP teaching model: small, internally consistent and defensible, not a faithful cloud simulator.
Terraform/IAM/pipeline artifacts are educational and non-executable. The deployment-strategy and
multi-region behaviours are intentionally coarse.
