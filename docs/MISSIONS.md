# Authoring missions

A mission is **data** (`src/missions/*.ts`, typed by `src/missions/types.ts`). The engine, scoring, evidence panels,
persistence and debrief are shared; adding a mission needs no UI work.

```ts
export const myMission: Mission = {
  id: 'm7-example', number: 7, title: '…', tagline: '…',
  difficulty: 'Intermediate', kind: 'incident',           // 'project' | 'incident'
  estMinutes: 25, prerequisites: ['m2-db-meltdown'],
  skills: { sd: 40, sre: 30 },                             // skill XP awarded on pass
  learning: ['…'], story: '…', business: { context: '…', impact: '…' },
  constraints: { budget: 700, availability: 99, p95: 600, notes: ['…'] },
  workload: wl({ baseRps: 30, profile: [{ t: 0, mult: 1 }, { t: 14, mult: 3 }], slowQueryShare: 0.2 }),
  initial: { nodes: [N('users', 'users', 20, 170), …], edges: [E('users', 'lb'), …] },
  components: ['alb', 'ecs', 'rds', …],                    // what the player may place
  startMinute: 18,                                         // minutes pre-simulated so telemetry exists at start
  verifyMinutes: 8, verifyAt: 26,                          // verification load test: duration and traffic level
  deployments: [{ minute: -2880, kind: 'deploy', title: '…', detail: '…', by: '…' }],
  notes: [{ panel: 'notes', title: '…', body: '…' }],
  rootCauses: [{ id, label, correct, evidencePanels: ['database'], why }],
  actions: [{ id, label, description, minutes, available?, apply(arch, flags, minute) }],
  requirements: [{ id, label, hard: true, metric: 'availability', op: '>=', value: 99, why }, { …, check(ctx) }],
  weights: { reliability: 3, diagnosis: 3, correctness: 3, rationale: 2 },
  failure: { maxFailedRequests: 110000, text: '…' },
  onTick: (arch, minute, flags) => { /* scripted events: inject a fault at minute 6 */ },
  hints, debrief, seed, guidance: ['metrics', 'database'], needsPostmortem: true, needsADR: false,
};
```

Then register it in `src/missions/index.ts`.

## Principles

* **Hidden faults, visible evidence.** Inject defects with `Fault` objects on nodes (`errorRate`, `latencyMult`,
  `cpuMult`, `poisonShare`, `log`). Never name the root cause in telemetry text — let the player correlate.
* **Evaluate requirements, not diagrams.** Use `metric`/`op`/`value` for measurable goals and `check()` for custom
  conditions. Mark security and safety as `hard`.
* **Multiple valid solutions.** Write a test in `src/game/missions.test.ts` for each intended solution *and* for the
  tempting wrong fixes (e.g. "scale the app tier"). Calibrate numbers until both behave.
* **Actions take time.** `MissionAction.minutes` advances the clock; customers keep experiencing the system.
* **Scoring is multi-dimensional.** Choose `weights` for the dimensions that matter; others are ignored.
