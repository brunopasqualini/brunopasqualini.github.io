// Builds the crawlable pages, sitemap.xml and llms.txt into the assembled site (_site/), then holds every indexable page,
// hand-written and generated, to the checklist in check.mjs and exits non-zero if any page fails it.
// Run it after scripts/build-site.mjs has copied the site and both projects into _site/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { check } from './check.mjs';
import { OUT } from './data.mjs';
import { buildPages } from './pages.mjs';
import { CONTRIBUTE, SITE, layout } from './site.mjs';

/** Pages that are not generated here: the landing page and the two apps. They are listed in the sitemap and held to the same checklist. */
export const HANDWRITTEN = [
  { path: '/', file: 'index.html' },
  { path: '/exam-simulator/', file: 'exam-simulator/index.html' },
  { path: '/engineering-ops/', file: 'engineering-ops/index.html' },
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

> Two free, in-browser learning tools that need no signup: AWS certification practice exams (Solutions Architect Associate SAA-C03 and Developer Associate DVA-C02) and Engineering Ops, a software architecture and system design simulator with 14 cloud incident and design missions. Everything runs client-side; nothing is sent to a server. The practice questions are AI-generated from official AWS documentation and are not official exam content; the site is not affiliated with, endorsed by or sponsored by AWS or any other cloud provider. Community question banks are welcome.

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
- [Contribute a question bank](${CONTRIBUTE}): add practice questions for another exam or cloud provider (plain JSON, with a validator)
`;
}

const built = await buildPages();
const outputs = new Map();
for (const page of built.pages) outputs.set(fileOf(page.path), layout(page));
const allPaths = [...HANDWRITTEN.map((p) => p.path), ...built.pages.map((p) => p.path)];
outputs.set('sitemap.xml', sitemap(allPaths));
outputs.set('llms.txt', llms(built));

for (const [file, content] of outputs) {
  const target = join(OUT, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}
console.log(`Wrote ${outputs.size} files (${built.pages.length} pages, sitemap.xml, llms.txt) to ${OUT}.`);

const problems = check({ pages: [...HANDWRITTEN, ...built.pages.map((p) => ({ path: p.path, file: fileOf(p.path) }))] });
if (problems.length) {
  console.error(problems.map((p) => `- ${p}`).join('\n'));
  process.exit(1);
}
console.log(`SEO check passed for ${allPaths.length} pages.`);
