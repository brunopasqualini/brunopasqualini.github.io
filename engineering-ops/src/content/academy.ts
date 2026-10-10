import type { SkillId } from '@/content/missions/types';

export interface Lesson {
  id: string;
  title: string;
  /** Skill XP required to unlock. */
  unlockXp: number;
  body: string;
  takeaway: string;
  mission?: string;
}

export const LESSONS: Record<SkillId, Lesson[]> = {
  se: [
    {
      id: 'se-1',
      title: 'Tests that match the failure',
      unlockXp: 0,
      body: 'Unit tests prove logic in isolation. Integration tests prove that components work together with real dependencies. A connection-leak bug passes every unit test because the leak lives in the interaction between code and a pool.',
      takeaway: 'Choose the test level where the failure would actually show up.',
      mission: 'm3-deployment',
    },
    {
      id: 'se-2',
      title: 'Idempotency by design',
      unlockXp: 30,
      body: 'An operation is idempotent if doing it twice has the same effect as doing it once. With at-least-once delivery, retries and timeouts, duplicates are guaranteed to happen eventually. Deduplicate on a request ID or use conditional writes.',
      takeaway: 'Assume every message and request can arrive twice.',
      mission: 'm5-queue',
    },
    {
      id: 'se-3',
      title: 'Backward-compatible change',
      unlockXp: 80,
      body: 'Ship schema and API changes in expand → migrate → contract steps so old and new code can run side by side. This is what makes canaries, rollbacks and blue/green safe.',
      takeaway: 'If you cannot run old and new together, you cannot roll back.',
    },
  ],
  sa: [
    {
      id: 'sa-1',
      title: 'Cohesion and coupling',
      unlockXp: 0,
      body: 'High cohesion keeps things that change together in one place; low coupling limits how many places change at once. Boundaries are valuable only if they are enforced — by interfaces, tooling or separate deployables.',
      takeaway: 'Draw boundaries around domains, not layers.',
      mission: 'm1-monolith',
    },
    {
      id: 'sa-2',
      title: 'Modular monolith first',
      unlockXp: 40,
      body: 'A single deployable with enforced module boundaries gives most of the maintainability of microservices without network failure modes or distributed transactions. Extract a service when one domain has a different scaling, security or release cadence.',
      takeaway: 'Distribute when you must, not because it is fashionable.',
      mission: 'm1-monolith',
    },
    {
      id: 'sa-3',
      title: 'Data ownership',
      unlockXp: 90,
      body: 'Services that share tables are coupled through the schema. Each service should own its data and expose it through an API or events. Shared databases create distributed monoliths.',
      takeaway: 'Own your data or you do not own your deploys.',
    },
  ],
  sd: [
    {
      id: 'sd-1',
      title: 'Find the bottleneck',
      unlockXp: 0,
      body: 'Throughput is limited by the most saturated resource on the request path. Latency grows as 1/(1 − utilisation), so a resource at 95% is already hurting. Measure utilisation tier by tier before adding capacity anywhere.',
      takeaway: 'Scale the constraint, not the comfortable part.',
      mission: 'm2-db-meltdown',
    },
    {
      id: 'sd-2',
      title: 'Retries, timeouts and breakers',
      unlockXp: 40,
      body: 'Retries turn a brief fault into a sustained overload by multiplying traffic. Pair retries with exponential backoff, jitter and a circuit breaker, and keep timeouts shorter than the caller’s own deadline.',
      takeaway: 'A retry is a load multiplier. Budget it.',
      mission: 'm2-db-meltdown',
    },
    {
      id: 'sd-3',
      title: 'Queues, backpressure and delivery semantics',
      unlockXp: 90,
      body: 'Queues smooth spikes by converting overload into delay. Without backpressure the delay is unbounded; without a DLQ, poison messages loop; without idempotency, redelivery corrupts data.',
      takeaway: 'Queues move failure; they do not remove it.',
      mission: 'm5-queue',
    },
    {
      id: 'sd-4',
      title: 'Caching and consistency',
      unlockXp: 150,
      body: 'A cache serves stale data by design. Decide the acceptable staleness from the product, then choose TTL, invalidation on write, or write-through accordingly.',
      takeaway: 'Every cache hit is a bet on staleness.',
    },
  ],
  aws: [
    {
      id: 'aws-1',
      title: 'Regional, zonal and global services',
      unlockXp: 0,
      body: 'Route 53 and IAM are global; S3, SQS and Lambda are regional; EC2, RDS instances and NAT gateways live in an Availability Zone. Resilience means understanding which scope each dependency has.',
      takeaway: 'Know the blast radius of every service you rely on.',
    },
    {
      id: 'aws-2',
      title: 'Multi-AZ vs read replicas',
      unlockXp: 35,
      body: 'In the classic single-standby deployment, Multi-AZ keeps a synchronous standby for availability and the standby does not serve reads. Read replicas add read capacity with replication lag, and on RDS they are not an automatic failover target (Aurora replicas are). Different problems, different tools.',
      takeaway: 'Do not buy a replica to solve an availability problem.',
      mission: 'm2-db-meltdown',
    },
    {
      id: 'aws-3',
      title: 'Managed does not mean unlimited',
      unlockXp: 90,
      body: 'Every managed service has quotas, per-request pricing and consistency semantics. API Gateway throttles, Lambda has concurrency limits, DynamoDB has partition limits. Read the limits before the incident.',
      takeaway: 'Look up the limits before you rely on the service.',
    },
  ],
  net: [
    {
      id: 'net-1',
      title: 'Reachability is a chain',
      unlockXp: 0,
      body: 'For traffic to flow, route table, gateway placement, security group (both ends), NACL and IAM must all agree. Debug by walking the path layer by layer instead of changing things at random.',
      takeaway: 'Test each hop, in order.',
      mission: 'm4-network',
    },
    {
      id: 'net-2',
      title: 'Public vs private subnets',
      unlockXp: 35,
      body: 'A subnet is public if its route table sends 0.0.0.0/0 to an internet gateway. A NAT gateway gives private subnets outbound access but must itself sit in a public subnet. Gateway endpoints keep S3 and DynamoDB traffic off the NAT.',
      takeaway: 'Public is a route, not a label.',
      mission: 'm4-network',
    },
    {
      id: 'net-3',
      title: 'Least privilege',
      unlockXp: 90,
      body: 'Allow the minimum: security groups referencing other security groups rather than CIDRs, IAM policies scoped to the actions and resources used, databases in private subnets. Wildcards are deferred incidents.',
      takeaway: 'Wildcards turn bugs into breaches.',
      mission: 'm4-network',
    },
  ],
  devops: [
    {
      id: 'do-1',
      title: 'Blast radius and progressive delivery',
      unlockXp: 0,
      body: 'Canary, blue/green and rolling deployments limit how many users a bad release can hurt. They are only as good as the automatic abort criteria attached to them.',
      takeaway: 'Every release is an experiment — contain it.',
      mission: 'm3-deployment',
    },
    {
      id: 'do-2',
      title: 'Rollback as a button',
      unlockXp: 40,
      body: 'Rollback should be rehearsed, fast and automated. Forward-only fixes are fine for tiny changes; for risky ones a ten-minute rollback is a ten-minute outage.',
      takeaway: 'Practice the undo before you need it.',
      mission: 'm3-deployment',
    },
    {
      id: 'do-3',
      title: 'Infrastructure as code and drift',
      unlockXp: 90,
      body: 'Declarative infrastructure makes environments reproducible and reviewable. Drift detection finds manual changes that silently diverge from the code.',
      takeaway: 'If it is not in code it will drift.',
    },
  ],
  plat: [
    {
      id: 'pl-1',
      title: 'Golden paths',
      unlockXp: 0,
      body: 'A golden path is the paved, supported way to build a service: templates with CI, logging and alerts pre-wired. Teams adopt it when it is easier than doing it themselves.',
      takeaway: 'Make the right way the easy way.',
    },
    {
      id: 'pl-2',
      title: 'Platform vs infrastructure',
      unlockXp: 40,
      body: 'Building infrastructure answers “can we run this?”. Building a platform answers “can any team run this safely without asking us?”. Self-service, policy as code and good defaults are what make the difference.',
      takeaway: 'A platform is a product with internal customers.',
    },
    {
      id: 'pl-3',
      title: 'Cognitive load',
      unlockXp: 90,
      body: 'Every extra service, pipeline and dashboard is something teams must understand. Platforms succeed by reducing the number of decisions a product team must make.',
      takeaway: 'Measure platform success in teams unblocked.',
    },
  ],
  sre: [
    {
      id: 'sre-1',
      title: 'Golden signals and symptom-based alerts',
      unlockXp: 0,
      body: 'Latency, traffic, errors and saturation tell you whether users are hurting. Page on symptoms customers feel; use causes for dashboards and diagnosis.',
      takeaway: 'Alert on what users feel.',
      mission: 'm3-deployment',
    },
    {
      id: 'sre-2',
      title: 'Diagnose with evidence',
      unlockXp: 40,
      body: 'Form a hypothesis, choose the evidence that would refute it, and look at that first. Correlate timelines: deploys, config changes, traffic and error rate. Do not mitigate blindly.',
      takeaway: 'Hypothesis first, then data.',
      mission: 'm2-db-meltdown',
    },
    {
      id: 'sre-3',
      title: 'SLOs and error budgets',
      unlockXp: 90,
      body: 'An SLO is a reliability target users care about; the error budget is the failure you can afford. Spending it on releases is fine; running out should change priorities.',
      takeaway: 'Reliability is a feature with a budget.',
    },
    {
      id: 'sre-4',
      title: 'Blameless postmortems',
      unlockXp: 150,
      body: 'Describe what happened, how it was detected and restored, what made it worse and what will prevent it — focusing on systems and decisions, not people.',
      takeaway: 'Write it down so the system learns.',
    },
  ],
  data: [
    {
      id: 'da-1',
      title: 'Access patterns drive design',
      unlockXp: 0,
      body: 'Relational schemas model entities; key-value and document stores model access patterns. Start from the queries you must serve and the consistency you need.',
      takeaway: 'Design for the question, not just the data.',
    },
    {
      id: 'da-2',
      title: 'Indexes and query plans',
      unlockXp: 40,
      body: 'A sequential scan reads every row; an index lookup reads a few. Query statistics show which statements dominate time — fixing one hot query can beat any hardware upgrade.',
      takeaway: 'Read the plan before buying a bigger box.',
      mission: 'm2-db-meltdown',
    },
    {
      id: 'da-3',
      title: 'Eventual consistency in pipelines',
      unlockXp: 90,
      body: 'Asynchronous pipelines mean readers can see old data for a while. Make that window explicit, monitor lag, and design user flows that tolerate it.',
      takeaway: 'Eventual means “by when?”.',
      mission: 'm5-queue',
    },
  ],
  finops: [
    {
      id: 'fo-1',
      title: 'Right-size from peak plus failure headroom',
      unlockXp: 0,
      body: 'Size for the busiest hour plus the capacity you lose when a zone fails — not for the average. Low utilisation is waste only when redundancy does not require it.',
      takeaway: 'Headroom for failure is not waste.',
      mission: 'm6-bill-shock',
    },
    {
      id: 'fo-2',
      title: 'The big hidden bills',
      unlockXp: 40,
      body: 'Data transfer, NAT processing, logs and unmanaged storage grow silently. Gateway endpoints, lifecycle policies, log levels and retention are architectural cost levers.',
      takeaway: 'The expensive line is often the one nobody reads.',
      mission: 'm6-bill-shock',
    },
    {
      id: 'fo-3',
      title: 'Attribute before you optimise',
      unlockXp: 90,
      body: 'Cost allocation tags (or accounts) tie spend to owners. Without ownership nobody can trade cost against value. Idle resources are found by looking for spend with no traffic.',
      takeaway: 'Unowned spend never shrinks.',
    },
  ],
};

/** Find a lesson, and the skill branch it belongs to, by its id (for deep links such as /learning?lesson=sd-2). */
export function lessonById(id: string | null | undefined): { skill: SkillId; lesson: Lesson } | undefined {
  if (!id) return undefined;
  for (const skill of Object.keys(LESSONS) as SkillId[]) {
    const lesson = LESSONS[skill].find((l) => l.id === id);
    if (lesson) return { skill, lesson };
  }
  return undefined;
}
