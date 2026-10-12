# brunopasqualini.github.io

The GitHub Pages site: a CV portfolio at the root, with a **My Tools** button that leads to a page listing two independent projects. This repository holds only the CV, the tools page, the search-engine setup and the pipeline that assembles and publishes the site. The two projects live in their own
repositories:

| URL | Project | Repository |
| --- | --- | --- |
| `/` | CV portfolio (home page) | this repository |
| `/tools/` | Tools landing page, linked from the CV's **My Tools** button | this repository |
| `/exam-simulator/` | Mock Exam Simulator (PWA, raw HTML/CSS/JS, no build step) | [cert-exam-simulator](https://github.com/brunopasqualini/cert-exam-simulator) |
| `/engineering-ops/` | Engineering Ops (React + Vite + TypeScript) | [system-design-simulator](https://github.com/brunopasqualini/system-design-simulator) |
| `/aws-practice-exams/…`, `/software-architecture-simulator/…` | Crawlable pages about the two tools, plus `sitemap.xml` and `llms.txt` | generated here at build time |

All three share one visual identity (dark navy surfaces, cyan primary, Inter / system sans, 14px base), defined as CSS custom
properties at the top of each project's stylesheet.

## Layout

```
.
├── index.html                           the CV (home page, self-contained: its own CSS and JS)
├── tools/index.html                     tools landing page (uses styles.css)
├── 404.html, styles.css, favicon.svg, robots.txt, assets/   other hand-written site files
├── scripts/build-site.mjs               assembles the site into _site/
├── scripts/seo/                         generator and checker for the generated pages
├── .github/workflows/deploy.yml         build and deploy pipeline
└── docs/SEO.md                          what was done for search and AI discoverability, and why
```

`_src/` (the checked-out projects) and `_site/` (the assembled site) are build workspaces and are not committed.

## How the site is published

[`deploy.yml`](.github/workflows/deploy.yml) builds the whole site and deploys it with GitHub Pages. It runs when:

- either project pushes to its `main` branch: that project's CI sends a `repository_dispatch` event (`project-updated`) to this repository;
- `master` changes here, or someone runs it by hand (`workflow_dispatch`);
- a pull request is opened here: it builds and checks, and does not deploy.

Each run:

1. checks out this repository and the latest `main` of both projects into `_src/`;
2. builds Engineering Ops (`npm ci && npm run build`);
3. `node scripts/build-site.mjs` copies the site files, the exam simulator and the Engineering Ops build into `_site/`, and stamps the exam simulator's service worker cache version with the commit SHA of `cert-exam-simulator`;
4. `node scripts/seo/generate.mjs` generates the crawlable pages, `sitemap.xml` and `llms.txt` from the exam banks and the missions, then checks every indexable page (the checklist is in [docs/SEO.md](docs/SEO.md)); a failing page fails the run;
5. uploads `_site/` and deploys it.

The old address `/engineering-ops/dist/` still works: it redirects to `/engineering-ops/` and keeps any `#/…` route.

### One-time setup

- **Settings → Pages → Build and deployment → Source: GitHub Actions** in this repository.
- In **each project repository** add a secret named `SITE_DISPATCH_TOKEN`: a fine-grained personal access token limited to this repository with **Contents: Read and write** (GitHub requires that permission to send `repository_dispatch`). Without it a project's CI still passes its checks, but its deploy step fails with a clear message and the site is not rebuilt.
- The two project repositories must be public, so the workflow can check them out without credentials.

### Building locally

```bash
git clone https://github.com/brunopasqualini/cert-exam-simulator _src/cert-exam-simulator
git clone https://github.com/brunopasqualini/system-design-simulator _src/system-design-simulator
(cd _src/system-design-simulator && npm ci && npm run build)
node scripts/build-site.mjs
node scripts/seo/generate.mjs
python3 -m http.server -d _site
```

`EXAM_SRC`, `OPS_SRC` and `SITE_OUT` override the locations of the two projects and of the output.

## Search and AI discoverability

What was done, why, and what only the site owner can do (Search Console, links) is in [docs/SEO.md](docs/SEO.md).

## Working on each project

Each project keeps its own README: [cert-exam-simulator](https://github.com/brunopasqualini/cert-exam-simulator#readme) and
[system-design-simulator](https://github.com/brunopasqualini/system-design-simulator#readme). Question banks are contributed to
`cert-exam-simulator` (see its CONTRIBUTING.md).
