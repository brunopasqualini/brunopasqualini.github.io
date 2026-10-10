# brunopasqualini.github.io

GitHub Pages site (served from this branch) that hosts two independent projects behind a small landing page.

```
.
├── index.html, styles.css, favicon.svg   landing page (raw HTML/CSS, no JS, no dependencies)
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

Each project keeps its own README (`exam-simulator/README.md`, `engineering-ops/README.md`).
