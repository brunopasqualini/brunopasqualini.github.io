# Authoring missions

A mission is **data** (`src/content/missions/*.ts`, typed by `src/content/missions/types.ts`). The engine, scoring, evidence panels,
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

Then register it in `src/content/missions/index.ts`.

## Principles

* **Hidden faults, visible evidence.** Inject defects with `Fault` objects on nodes (`errorRate`, `latencyMult`,
  `cpuMult`, `poisonShare`, `log`). Never name the root cause in telemetry text — let the player correlate.
* **Evaluate requirements, not diagrams.** Use `metric`/`op`/`value` for measurable goals and `check()` for custom
  conditions. Mark security and safety as `hard`.
* **Multiple valid solutions.** Write a test in `src/game/missions.test.ts` for each intended solution *and* for the
  tempting wrong fixes (e.g. "scale the app tier"). Calibrate numbers until both behave.
* **Actions take time.** `MissionAction.minutes` advances the clock; customers keep experiencing the system.
* **Scoring is multi-dimensional.** Choose `weights` for the dimensions that matter; others are ignored.

## Decisions and consequences (interconnected missions)

A mission can remember what the player did and react to what they did earlier.

```ts
// Recorded when the mission is PASSED, derived from the final design:
decisions: (arch, { adrs, flags }) => [
  { tag: 'm7-n-plus-one:fixed-in-code', label: 'You removed the N+1 pattern…', carries: 'Later missions start with healthy query habits.' },
],

// Applied when this mission STARTS, if the matching tag was recorded by an earlier mission:
consequences: [
  { id: 'inherited-bigger-db', tag: 'm7-n-plus-one:bought-a-bigger-database', title: '…', text: '…',
    apply: (arch) => patchNode(arch, 'shop-db', { size: 'large' }), workload: { slowQueryShare: 0.1 } },
],
```

**Debt or justified trade-off?** Mark a decision `shortcut: true` when it trades a lasting cost for speed. The game
then judges it from context (`game/decisions.ts`): with the evidence consulted *and* the reason written down (an ADR that
states its trade-offs, or a postmortem that says what to prevent) it is a **justified trade-off**; otherwise it is
**debt**. Give the matching consequence a `documented` variant: a known cost is cheaper to carry, so it should be
softer (a smaller workload patch, a milder edge weight), never harsher. Decisions that are not shortcuts are
`investment` by default, or set `kind: 'tradeoff'` for a valid choice with a real operating cost.

Rules that keep this honest:

* **Tags are the contract.** `'<mission-id>:<what-they-did>'`. A mission never reads its own tags.
* **Every debt must be repairable** with the tools the earlier missions taught, and the worst-case combination must
  still be passable. `missions.test.ts` has a test that inherits every debt of the capstone and repairs them all.
* **Only passes record decisions**, so a debt must be reachable by a *passing* design. (A bigger database that blows
  the budget is not a recorded decision; a medium one that fits is.)
* **Replay stays deterministic.** The inherited tags are stored with the saved run and passed to `createSession`, so
  resuming rebuilds the same starting state even if the player has since changed their history.
* **Fingerprints.** New missions need a row in `game/simVersion.test.ts`; changing simulation behaviour for existing
  missions requires bumping `SIM_VERSION` (see that file).

## The learning loop every mission must carry

`content/missionQuality.test.ts` fails a mission that skips a step. Each one needs: at least three candidate root causes
(one real, at least one red herring) with the evidence panels that show or refute each; beginner guidance that points at
every panel holding the real cause's evidence; three escalating hints; a debrief with alternatives that say *when* each
is the right call and what it costs, plus the mistakes to avoid and experiments to try; and a golden test block in
`game/missions.test.ts` covering the intended fix and a tempting wrong one. Design projects get hypotheses too: the
question is what is actually wrong with the starting design. Diagnosis only counts toward the score when the mission's
`weights.diagnosis` is set, but the evidence review is always shown.
