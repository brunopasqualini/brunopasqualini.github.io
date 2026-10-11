# brunopasqualini.github.io

GitHub Pages site (served from this branch) that hosts two independent projects behind a small landing page.

```
.
├── index.html, styles.css, favicon.svg   landing page (raw HTML/CSS, no JS, no dependencies)
├── aws-practice-exams/                   generated pages: AWS practice exam hub and one page per exam
├── software-architecture-simulator/      generated pages: simulator overview and one page per mission
├── sitemap.xml, robots.txt, llms.txt     search engine and AI crawler files (sitemap and llms.txt are generated)
├── scripts/seo/                          generator and checker for the pages above
├── exam-simulator/                       Mock Exam Simulator PWA (raw HTML/CSS/JS, no build step)
└── engineering-ops/                      Engineering Ops (React + Vite + TypeScript)
    ├── src/, docs/, package.json …       source
    └── dist/                             committed production build: this is what Pages serves
```

| URL | Project |
| --- | --- |
| `/` | Landing page |
| `/exam-simulator/` | Mock Exam Simulator |
| `/engineering-ops/dist/` | Engineering Ops |
| `/aws-practice-exams/…`, `/software-architecture-simulator/…` | Static, crawlable pages about the two tools |

All three share one visual identity (dark navy surfaces, cyan primary, Inter / system sans, 14px base), defined as CSS custom properties at the top of each project's stylesheet.

## Working on each project

- **Landing page and exam simulator**: edit the files and reload. Nothing to build. After changing the simulator's shell files, bump `CACHE_VERSION` in `exam-simulator/sw.js`.
- **Engineering Ops**: GitHub Pages cannot run a build, so the build output is committed.
  ```
  cd engineering-ops
  npm install
  npm run check        # typecheck, lint, tests
  npx vite build       # rewrites engineering-ops/dist
  ```
  You don't need to do this by hand: `.github/workflows/build-engineering-ops.yml` runs the checks and rebuilds `dist/` on every merge to `master` that touches `engineering-ops/`, then commits it back as `github-actions[bot]`. Pull requests run the checks and build without committing.

  One-time setup: Settings → Actions → General → Workflow permissions → **Read and write permissions**. If `master` has branch protection, allow `github-actions[bot]` to push to it (or it will be rejected).

## Search and AI discoverability

The static pages, `sitemap.xml` and `llms.txt` are generated from the exam banks and the missions: run `node scripts/seo/generate.mjs` after changing either, and commit the result. The **SEO check** workflow fails a pull request if they are out of date. What was done, why, and what only the site owner can do (Search Console, links) is in [docs/SEO.md](docs/SEO.md).

## Contributing question banks

Anyone can add practice questions for another exam or cloud provider: the banks are plain JSON files. See [CONTRIBUTING.md](CONTRIBUTING.md) for the format and the rules, and check a bank with `node scripts/validate-banks.mjs`. A GitHub check runs the same validator on pull requests.

Each project keeps its own README (`exam-simulator/README.md`, `engineering-ops/README.md`).
