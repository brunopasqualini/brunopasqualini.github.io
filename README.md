# brunopasqualini.github.io

Source of <https://brunopasqualini.github.io/>: the CV and portfolio of Bruno Pasqualini, a full stack software engineer in Brisbane, Australia (AWS serverless, event-driven architecture, React, TypeScript), plus two free learning tools.

This repository holds the CV, the tools page, the SEO setup and the pipeline that builds and publishes everything. The two apps live in their own repositories and are built into the site at deploy time.

| URL | What | Source |
| --- | --- | --- |
| `/` | CV (home page) | this repo |
| `/tools/` | Page listing the two tools, linked from the CV's **My Tools** button | this repo |
| `/exam-simulator/` | Mock Exam Simulator: AWS practice exams (PWA) | [cert-exam-simulator](https://github.com/brunopasqualini/cert-exam-simulator) |
| `/engineering-ops/` | Engineering Ops: system design simulator (React) | [system-design-simulator](https://github.com/brunopasqualini/system-design-simulator) |
| `/aws-practice-exams/…`, `/software-architecture-simulator/…`, `sitemap.xml`, `llms.txt` | Crawlable pages about the tools | generated at build time |

## Layout

```
index.html              CV (self-contained: own CSS and JS)
tools/index.html        tools page (uses styles.css)
404.html, styles.css, favicon.svg, robots.txt, assets/
scripts/build-site.mjs  assembles the site into _site/
scripts/seo/            generates and checks the SEO pages
.github/workflows/deploy.yml
docs/SEO.md             search and AI discoverability: decisions and checklist
```

`_src/` (checked-out projects) and `_site/` (assembled site) are build workspaces and are not committed.

## How it is published

`deploy.yml` builds the whole site and deploys it with GitHub Pages. It runs on:

- a push to `main` in either project: that project's CI sends a `repository_dispatch` event (`project-updated`) here;
- a push to `master` here, or a manual run;
- a pull request here: build and checks only, no deploy.

Each run:

1. checks out this repo and the latest `main` of both projects into `_src/`;
2. builds Engineering Ops (`npm ci && npm run build`);
3. `scripts/build-site.mjs` copies the site, the exam simulator and the Engineering Ops build into `_site/`, and stamps the exam simulator's service worker cache version with its commit SHA;
4. `scripts/seo/generate.mjs` generates the crawlable pages, `sitemap.xml` and `llms.txt`, then checks every page; a failing page fails the run;
5. uploads `_site/` and deploys.

The old URL `/engineering-ops/dist/` redirects to `/engineering-ops/` and keeps any `#/…` route.

## One-time setup

- This repo: **Settings → Pages → Source: GitHub Actions**.
- Both project repos: a secret `SITE_DISPATCH_TOKEN`, a fine-grained token limited to this repo with **Contents: Read and write** (needed to send `repository_dispatch`). Without it a project's checks still pass but its deploy step fails and the site is not rebuilt.
- Both project repos must be public (the workflow checks them out without credentials).

## Build locally

```bash
git clone https://github.com/brunopasqualini/cert-exam-simulator _src/cert-exam-simulator
git clone https://github.com/brunopasqualini/system-design-simulator _src/system-design-simulator
(cd _src/system-design-simulator && npm ci && npm run build)
node scripts/build-site.mjs && node scripts/seo/generate.mjs
python3 -m http.server -d _site
```

`EXAM_SRC`, `OPS_SRC` and `SITE_OUT` override the project and output locations.
