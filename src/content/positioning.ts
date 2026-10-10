/** Product positioning copy as data, so the home page, onboarding and docs share one source. */
export const TAGLINE = 'Build systems. Solve problems. Understand the consequences. Think like an engineer.';

export const VISION =
  'Engineering Ops is a hands-on engineering simulation platform. You step into realistic technology environments, investigate what is going wrong, design and deploy a fix, and watch how your decision changes the whole system.';

export interface Pillar {
  id: string;
  title: string;
  body: string;
}

export const PILLARS: Pillar[] = [
  {
    id: 'sandbox',
    title: 'A sandbox for building systems',
    body: 'Design applications, connect services, configure cloud infrastructure and try different architectures in an interactive canvas.',
  },
  {
    id: 'simulation',
    title: 'A simulation of real problems',
    body: 'Watch traffic, latency, errors, costs and dependencies change as the system runs. See how reasonable decisions cause unexpected failures.',
  },
  {
    id: 'judgement',
    title: 'A place to build judgement',
    body: 'Diagnose incidents, compare solutions, understand trade-offs, and learn when not to add another service or layer of complexity.',
  },
  {
    id: 'progression',
    title: 'A game with real progression',
    body: 'Move from single-application problems to distributed systems and platform-wide challenges, with scores that explain themselves.',
  },
];

export interface Audience {
  id: string;
  who: string;
  need: string;
  practise: string[];
  cta: string;
  to: string;
}

export const AUDIENCES: Audience[] = [
  {
    id: 'career-changers',
    who: 'Aspiring engineers & career changers',
    need: 'You understand some concepts but struggle to connect them into a functioning system.',
    practise: ['How a request travels through a system', 'Why components fail together', 'Reading metrics, logs and traces'],
    cta: 'Start with the Growing Monolith',
    to: '/play/m1-monolith',
  },
  {
    id: 'working-engineers',
    who: 'Working software, cloud, DevOps & platform engineers',
    need: 'You want practical skills beyond tutorials and certification questions.',
    practise: ['Incident diagnosis under time pressure', 'Cost, reliability and security trade-offs', 'Safe deployments and recovery'],
    cta: 'Respond to the Database Meltdown',
    to: '/play/m2-db-meltdown',
  },
  {
    id: 'architects',
    who: 'Developers preparing for system-design responsibility',
    need: 'You want to practise making, and defending, engineering decisions.',
    practise: ['Architecture Decision Records', 'Comparing designs with evidence', 'Postmortems that explain why'],
    cta: 'Open the Architecture Lab',
    to: '/lab',
  },
];
