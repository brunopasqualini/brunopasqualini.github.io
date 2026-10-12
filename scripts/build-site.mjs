// Assembles the site into _site/, ready for GitHub Pages:
//
//   this repository (CV, tools page, 404, robots.txt, assets)  ->  _site/
//   cert-exam-simulator  (the PWA, stamped with its commit)  ->  _site/exam-simulator/
//   system-design-simulator (its Vite build, dist/)          ->  _site/engineering-ops/
//
// The two projects are checked out under _src/ by .github/workflows/deploy.yml (or by hand for a local build), and
// system-design-simulator must already be built (npm ci && npm run build). Run scripts/seo/generate.mjs afterwards to add
// the generated pages, sitemap.xml and llms.txt and to check every page.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAM_SRC, OPS_SRC, OUT, ROOT } from './seo/data.mjs';

const fail = (msg) => {
  console.error(`build-site: ${msg}`);
  process.exit(1);
};
const need = (path, hint) => existsSync(path) || fail(`${path} is missing. ${hint}`);

const sha = (dir) => execFileSync('git', ['-C', dir, 'rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// 1. This repository's own pages (the CV at /, the tools landing page at /tools/). Only what is listed here is published.
for (const name of ['index.html', 'tools', 'styles.css', 'favicon.svg', '404.html', 'robots.txt', 'assets']) {
  cpSync(join(ROOT, name), join(OUT, name), { recursive: true });
}

// 2. The exam simulator: the app shell and the question banks, not the repository's tooling or docs.
need(join(EXAM_SRC, 'index.html'), 'Check out brunopasqualini/cert-exam-simulator into _src/cert-exam-simulator.');
const exam = join(OUT, 'exam-simulator');
for (const name of ['index.html', 'manifest.json', 'banks.json', 'favicon.svg', 'sw.js', 'questions']) {
  cpSync(join(EXAM_SRC, name), join(exam, name), { recursive: true });
}
// The service worker's cache name is the commit being deployed, so every change clears the old caches.
const PLACEHOLDER = '__BUILD_SHA__';
const sw = readFileSync(join(exam, 'sw.js'), 'utf8');
if (!sw.includes(PLACEHOLDER)) fail(`sw.js has no ${PLACEHOLDER} placeholder to stamp; the cache version would never change.`);
writeFileSync(join(exam, 'sw.js'), sw.replaceAll(PLACEHOLDER, sha(EXAM_SRC)));

// 3. Engineering Ops: the production build, served from /engineering-ops/.
need(join(OPS_SRC, 'dist', 'index.html'), 'Build brunopasqualini/system-design-simulator first (npm ci && npm run build).');
cpSync(join(OPS_SRC, 'dist'), join(OUT, 'engineering-ops'), { recursive: true });

// 4. The app used to live at /engineering-ops/dist/. Old links and bookmarks keep working, including #/play/... routes,
//    and the page is kept out of the index so only /engineering-ops/ is listed.
const legacy = join(OUT, 'engineering-ops', 'dist');
mkdirSync(legacy, { recursive: true });
writeFileSync(
  join(legacy, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Engineering Ops has moved</title>
    <meta name="robots" content="noindex" />
    <link rel="canonical" href="https://brunopasqualini.github.io/engineering-ops/" />
    <script>location.replace('/engineering-ops/' + location.hash);</script>
    <noscript><meta http-equiv="refresh" content="0; url=/engineering-ops/" /></noscript>
  </head>
  <body>
    <p>Engineering Ops has moved to <a href="/engineering-ops/">/engineering-ops/</a>.</p>
  </body>
</html>
`,
);

console.log(`Assembled ${OUT} (exam simulator ${sha(EXAM_SRC)}, Engineering Ops ${sha(OPS_SRC)}).`);
