# Attack simulation

**Lab → Attack simulation** runs an attack against the **deployed** design and shows how it unfolds, one stage at a time: which defences held, which partly held, which failed and why, how far the damage spreads (marked in red on the canvas), and what to change. It analyses the system; it never changes your run, your draft or your saves.

It is deterministic. Two attacks are rule-based, reading the same settings the security findings read. The third runs through the real simulation engine, so its numbers are measured, not asserted. The timings shown ("T+10 min", "never") are illustrative orders of magnitude for how such an attack unfolds, not measurements, and the panel says so.

## The attacks

### Leaked credential
An access key is committed to a public repository. The attacker acts as the **most privileged IAM role that is attached to a workload** in the design.

| Stage | Defence | Held / partly / failed |
| --- | --- | --- |
| What the key can do | Least-privilege policy | scoped / broad / administrator |
| Data reached | Blast-radius limits | A scoped role reaches only the stores its workload calls; broad and administrator reach every data store |
| Secrets and lateral movement | Secrets access control | fails if the role can read secrets |
| Readability of the data | Encryption at rest | fails if a reachable store is unencrypted; **does not help against an administrator**, who can use the key; partly helps against a broad role |
| Detection | Audit trail and alerting | trail + alert rule: found in minutes; trail only: found when someone reviews it, hours later; neither: never |
| Recovery | Backups and versioning | database backup retention above zero, bucket versioning on |

Outcome: **breach** for a broad or administrator role, an unencrypted reachable store, or readable secrets; **contained** only when the role is scoped, the data is encrypted, the attack is detected and the data is recoverable; otherwise **partly exposed**. A design with no IAM role attached to a workload is **not applicable**, and the panel says how to add one.

### Open data store
A scanner finds a bucket or database reachable from the internet: public buckets, databases with a public endpoint, and database or cache ports open to `0.0.0.0/0` through a security group.

- A **public bucket** is a breach: anonymous reads need no credentials.
- A **public database endpoint** or open port is a partial exposure: the attacker still needs credentials, but is exposed to password guessing and unpatched vulnerabilities.
- **Encryption at rest is shown not to help** here: the service decrypts for any request it permits, including an anonymous one.
- Nothing public: **nothing exposed**.

### HTTP flood (DDoS)
Eight times normal traffic, 80% of it junk, for ten minutes. The stages are the CDN (partial protection: it absorbs cacheable content, not a flood aimed at dynamic endpoints), the firewall (managed rules, plus a rate limit for a flood of normal-looking requests), throttling at the front door, and autoscaling (a backstop that costs money). The last stage is **measured with the simulation engine**: availability and p95 under the flood against normal, and the run-rate cost while it lasts.

A blunt throttle is deliberately **not** reported as holding: it cannot tell junk from customers, so it rejects real users too once it bites. The numbers show this.

## Adding an attack

Attacks live in `src/engine/attack.ts`. Add an `AttackId`, an entry in `ATTACKS`, a function returning an `AttackResult`, and a case in `runAttack`. Read only settings the catalog has, give every failed stage a `fix`, list the affected component ids in `blastRadius` so the canvas can mark them, and label any timing as illustrative. The tests check that every attack runs on every template, that blast radii name real components, and that nothing is mutated.
