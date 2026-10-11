# Design review (architecture linter)

**Plan & deploy → Design review** checks the draft you are editing against anti-patterns the simulation is known to punish. Each finding has a severity, the reason in plain language, the fix, and (where one fits) a link to the Academy lesson behind it. Select a finding's title to jump to the component to change.

It is **advice, not a gate**: it never blocks a deploy, and a design can be right to break a rule on purpose (the trade-off missions are about exactly that). It complements the **security findings**, which cover exposure and permissions. "Nothing flagged" means none of these rules fired, not that the design meets its requirements.

| Rule | Severity | Fires when | Lesson |
| --- | --- | --- | --- |
| `db-single-az` | high | a database that is called has no Multi-AZ standby | Multi-AZ vs read replicas |
| `retry-no-breaker` | medium, high from 5 retries | a call retries 3+ times with no circuit breaker | Retries, timeouts and breakers |
| `slow-timeout` | low | timeout × (1 + retries) exceeds 12 s | Retries, timeouts and breakers |
| `queue-no-dlq` | medium | a consumed queue has no dead-letter queue | Queues, backpressure and delivery semantics |
| `worker-not-idempotent` | medium | a queue consumer is not marked idempotent | Idempotency by design |
| `single-instance` | medium | a service in the request path has one instance, no autoscaling (Lambda excluded) | |
| `no-alerting` | medium | compute and data exist and there is no alert rule | Golden signals and symptom-based alerts |
| `cache-stale` | medium | cache TTL exceeds the workload's freshness requirement and it does not invalidate on write | Caching and consistency |
| `db-connections` | high now, medium at full scale | callers' pools × replicas exceed the database's connection limit and there is no pooler | Managed does not mean unlimited |
| `no-scaling-for-peak` | medium | traffic peaks at 2× or more and a service cannot scale | Find the bottleneck |
| `shared-database` | medium | two or more microservices call the same data store | Data ownership |
| `cold-data-standard` | low | a bucket of 1,000 GB or more has no lifecycle rule | The big hidden bills |
| `debug-logging` | low | a service logs at debug level | The big hidden bills |
| `no-cost-tags` | low | three or more billable components and none is tagged | Attribute before you optimise |

## Adding a rule

Rules live in `src/engine/lint.ts` (`lintArch`). Read only settings the catalog has, so a finding always points at something the player can change; give it a plain-language `why`, a concrete `fix`, a `lesson` id only if a real lesson fits, and add it to `LINT_RULES`. The tests check that every lesson id exists and that every finding names a component that is in the design.

Lessons can be linked with `/learning?lesson=<id>`.
