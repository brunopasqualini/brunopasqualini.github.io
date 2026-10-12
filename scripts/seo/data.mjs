// Reads the content the static pages are built from: the exam question banks and the Engineering Ops missions.
// The two projects live in their own repositories. The build checks them out under _src/ (see scripts/build-site.mjs and
// .github/workflows/deploy.yml); override the locations with EXAM_SRC, OPS_SRC and SITE_OUT.
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = resolve(import.meta.dirname, '../..');
export const EXAM_SRC = resolve(process.env.EXAM_SRC ?? join(ROOT, '_src/cert-exam-simulator'));
export const OPS_SRC = resolve(process.env.OPS_SRC ?? join(ROOT, '_src/system-design-simulator'));
/** The assembled site: everything GitHub Pages serves. Generated pages are written here, never into the source tree. */
export const OUT = resolve(process.env.SITE_OUT ?? join(ROOT, '_site'));
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));

/** The two AWS exams in the simulator, with their question counts per exam domain and a spread of sample questions. */
export function loadExams() {
  const banks = json(join(EXAM_SRC, 'banks.json'));
  return banks.certifications.map((cert) => {
    const questions = cert.banks.flatMap((b) => json(join(EXAM_SRC, b.file)).questions);
    const byDomain = new Map();
    for (const q of questions) byDomain.set(q.domain, (byDomain.get(q.domain) ?? 0) + 1);
    return {
      id: cert.id,
      title: cert.title,
      banks: cert.banks.length,
      perBank: questions.length / cert.banks.length,
      total: questions.length,
      domains: [...byDomain].map(([name, count]) => ({ name, count })),
      questions,
    };
  });
}

/** One sample question from each domain in turn, so the page shows the whole exam rather than one topic. */
export function sampleQuestions(exam, n) {
  const pools = exam.domains.map((d) => exam.questions.filter((q) => q.domain === d.name && q.options.length));
  const out = [];
  for (let i = 0; out.length < n && i < 50; i++) for (const pool of pools) if (out.length < n && pool[i * 7]) out.push(pool[i * 7]);
  return out;
}

/** Engineering Ops missions and journey, bundled from the TypeScript source with the esbuild the app already uses. */
export async function loadMissions() {
  const ops = OPS_SRC;
  const { build } = createRequire(join(ops, 'package.json'))('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'seo-missions-'));
  const entry = join(dir, 'entry.ts');
  const out = join(dir, 'out.mjs');
  try {
    const src = join(ops, 'src');
    const lines = [`export { MISSIONS } from '${src}/content/missions/index.ts';`, `export { JOURNEY } from '${src}/content/journey.ts';`];
    await import('node:fs').then((fs) => fs.writeFileSync(entry, lines.join('\n')));
    await build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'silent', alias: { '@': src } });
    const { MISSIONS, JOURNEY } = await import(pathToFileURL(out).href);
    return { missions: MISSIONS, journey: JOURNEY };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
