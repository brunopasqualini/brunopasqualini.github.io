// Builds the crawlable pages, sitemap.xml and llms.txt. `node scripts/seo/generate.mjs --check` verifies the committed
// files are up to date and that every page meets the checklist in check.mjs, without writing anything.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { check } from './check.mjs';
import { ROOT } from './data.mjs';
import { buildPages } from './pages.mjs';
import { SITE, layout } from './site.mjs';

/** Pages written by hand rather than generated. They are listed in the sitemap and held to the same checklist. */
export const HANDWRITTEN = [
  { path: '/', file: 'index.html' },
  { path: '/exam-simulator/', file: 'exam-simulator/index.html' },
  // The built app lives at /engineering-ops/dist/ and is produced from this source file by the build workflow.
  { path: '/engineering-ops/dist/', file: 'engineering-ops/index.html' },
];

const fileOf = (path) => join(path.slice(1), 'index.html');

function sitemap(paths) {
  const urls = paths.map((p) => `  <url><loc>${SITE}${p}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function llms({ exams, missions, helpers }) {
  const exam = (e) => `- [${e.title.replace('Associated', 'Associate')}](${SITE}${helpers.examPath(e)}): ${e.total} free practice questions in ${e.banks} timed exams, with explanations`;
  const mission = (m) => `- [${m.title}](${SITE}${helpers.missionPath(m)}): ${m.tagline}`;
  return `# Bruno Pasqualini: free learning tools

> Two free, in-browser learning tools that need no signup: AWS certification practice exams (Solutions Architect Associate SAA-C03 and Developer Associate DVA-C02) and Engineering Ops, a software architecture and system design simulator with 14 cloud incident and design missions. Everything runs client-side; nothing is sent to a server. The practice questions are original AI-generated material, not official AWS exam content, and the site is not affiliated with AWS.

## Free AWS practice exams

- [AWS practice exams overview](${SITE}${helpers.HUB}): free timed mock exams with an explanation for every answer, a score by exam domain and a retest of missed questions
${exams.map(exam).join('\n')}
- [Open the exam simulator](${SITE}/exam-simulator/): the app itself (works offline, installable)

## Software architecture and system design simulator

- [Software architecture simulator overview](${SITE}${helpers.SIM}): how a mission works and what it teaches
- [Open Engineering Ops](${SITE}${helpers.APP_OPS}): the simulator itself
${missions.map(mission).join('\n')}

## Optional

- [Source code and documentation](https://github.com/brunopasqualini/brunopasqualini.github.io): the repository, including the simulator's architecture and simulation docs
`;
}

const mode = process.argv.includes('--check') ? 'check' : 'write';
const built = await buildPages();
const outputs = new Map();
for (const page of built.pages) outputs.set(fileOf(page.path), layout(page));
const allPaths = [...HANDWRITTEN.map((p) => p.path), ...built.pages.map((p) => p.path)];
outputs.set('sitemap.xml', sitemap(allPaths));
outputs.set('llms.txt', llms(built));

if (mode === 'write') {
  for (const [file, content] of outputs) {
    const target = join(ROOT, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  console.log(`Wrote ${outputs.size} files (${built.pages.length} pages, sitemap.xml, llms.txt).`);
} else {
  const stale = [...outputs].filter(([file, content]) => !existsSync(join(ROOT, file)) || readFileSync(join(ROOT, file), 'utf8') !== content).map(([f]) => f);
  const problems = check({ pages: [...HANDWRITTEN, ...built.pages.map((p) => ({ path: p.path, file: fileOf(p.path) }))] });
  for (const f of stale) problems.push(`${f} is out of date: run "node scripts/seo/generate.mjs" and commit the result.`);
  if (problems.length) {
    console.error(problems.map((p) => `- ${p}`).join('\n'));
    process.exit(1);
  }
  console.log(`SEO check passed for ${allPaths.length} pages.`);
}
