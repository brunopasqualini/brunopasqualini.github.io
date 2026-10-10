# Frontend architecture

This document records the decisions behind the 2026 identity refactor, and the research they rest on. It is
written as a set of short ADRs so the reasoning survives the code.

Versions below were checked against the npm registry on 2026-10-10.

## Principles

1. **The simulation is a pure library.** `src/engine` has no React, no DOM and no randomness it does not own. UI
   is a client of it. This is what makes the game deterministic, testable and replayable.
2. **Organise by feature, not by file type.** A feature owns its components, hooks, styles and tests. Shared code
   lives in `shared/` and flows one way: `shared → engine/game → features → app`.
3. **Features do not import each other.** They meet in `app/` (routes, shell). Enforced by ESLint
   (`no-restricted-imports`).
4. **Accessibility comes from primitives, not from hand-rolled ARIA.** Tabs, dialogs and tooltips use Base UI.
5. **One source of truth for design.** Colour, space, radius, type and motion are CSS custom properties in
   `styles/tokens.css`; components never hard-code them.

## Layout

```
src/
  app/            entry, providers, router, shell (top nav, onboarding, settings)
  engine/         pure TypeScript simulation (was src/sim)
  content/        data-driven missions, academy, templates, journey stages
  game/           sessions, scoring, progression, zustand store
  features/
    home/ missions/ incidents/ academy/ journal/ achievements/
    workspace/    the playable canvas (missions and the lab): header, library, inspector, dock
  entities/       domain widgets used by several features (mission buttons)
  shared/
    ui/           design-system components (Panel, Chip, Meter, Tabs, Dialog…)
    lib/          formatting, small utilities
    hooks/
  styles/         tokens, base, layout, components, features, responsive (CSS @layer)
  test/
```

## ADR-1: Keep Vite 7 + @vitejs/plugin-react 5, React 19

**Context.** Registry latest is Vite 8 / plugin-react 6 (Babel removed in favour of Oxc) / React 19.3.

**Decision.** React 19.3 stays. Vite stays on 7 for now. Vitest 4 and Vite 8 produced peer-resolution failures
earlier in this project, and plugin-react 6 drops the `babel` option, which would block the React Compiler path.
Revisit when Vitest's Vite 8 support settles.

## ADR-2: React Router 8 (library mode, hash router, lazy routes)

**Context.** The app used a ~25 line hash router. It had no nested routes, no per-route code splitting, no typed
params and no 404.

**Decision.** `createHashRouter` with `route.lazy` for the workspace and heavy pages. Hash routing is deliberate:
the app is a static site (GitHub Pages / a single-file artifact) with no server rewrites. Existing deep links
(`#/play/<id>`, `#/lab?template=`) keep working.

## ADR-3: Base UI for accessible primitives

**Context.** Radix UI primitives are the long-time default, but several 2026 comparisons report its release
cadence has slowed, while Base UI (from the Radix, Floating UI and MUI authors) reached a stable 1.x and is
unstyled like Radix.

**Decision.** `@base-ui/react` for Tabs, Dialog and Tooltip, wrapped once in `shared/ui` so a future swap is a
one-file change. React Aria was considered (strongest a11y story, much larger surface) and rejected as too heavy
for three primitives.

## ADR-4: Layered, token-driven CSS (no Tailwind migration)

**Context.** Tailwind v4 (`@theme`) and CSS Modules are both current. A hybrid is the common recommendation.

**Decision.** Plain CSS organised with `@layer reset, tokens, base, layout, components, features, utilities`, with
tokens as custom properties. Rationale:

- The product identity is a dense, bespoke dashboard (glowing panels, graph canvas, status colour language).
  That is mostly custom CSS in any framework; utility classes would not make it smaller.
- Migrating ~350 existing rules to Tailwind is a large rewrite with visual regression risk and no user benefit.
- Layers give the predictable cascade that utilities were solving, with no build dependency.

**Embedding caveat.** Unlayered CSS always beats layered CSS. A hosting page (for example an artifact viewer) that injects
`body { background: #fff; color: #000 }` or `:root { color-scheme: light }` would override every token-driven rule
and turn headings black on dark panels. The few global rules the theme depends on (`color-scheme`, `html`/`body`
background, text colour, font) therefore live *unlayered* at the end of `styles/index.css`, and `tokens.test.ts`
guards both that and the WCAG AA contrast of the text tokens.

Tailwind can still be adopted later: tokens are plain custom properties and map one-to-one to `@theme`.

## ADR-5: ESLint 10 flat config + Prettier; React Compiler not enabled yet

**Decision.** ESLint flat config with `typescript-eslint` and `eslint-plugin-react-hooks` v7 (which bundles the
compiler-powered rules). Prettier formats. Biome was considered; it cannot run the hooks rules, so ESLint is
needed anyway.

**React Compiler** is stable, but the canvas derives memoised data from a deliberately mutable session object and
a `tick` counter. The compiler would memoise on reads of that object and could show stale canvases. The hook rules
run in lint so the code is compiler-ready; enabling it is a follow-up that needs a store refactor to immutable
snapshots.

## ADR-6: State

- **zustand** for client state (session, settings, progress), with the existing debounced persistence.
- No server state exists, so TanStack Query is intentionally absent.
- URL state (mission id, lab template) lives in the router, not the store.

## ADR-7: Design identity

Dark "command centre" aesthetic: deep navy surfaces, cyan primary, violet for async/learning, amber for warning,
red for critical. Layout is a top navigation bar, a three-column workspace (mission and events / canvas and
telemetry / components and inspector). Nodes are icon tiles with labels beneath, edges are coloured by meaning
(traffic cyan, async violet, error red). Design tokens are documented in `styles/tokens.css`.

## Sources

- [React Folder Structure Best Practices, Robin Wieruch](https://www.robinwieruch.de/react-folder-structure/)
- [How to structure a React app in 2026](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026)
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1)
- [React Router `createHashRouter`](https://reactrouter.com/api/data-routers/createHashRouter.md)
- [Radix UI alternatives (2026)](https://designrevision.com/alternatives/radix-ui)
- [Top headless UI libraries for React in 2026](https://www.greatfrontend.com/blog/top-headless-ui-libraries-for-react-in-2026)
- [Tailwind CSS vs CSS Modules 2026](https://www.kunalganglani.com/blog/tailwind-vs-css-modules-2026.md)
- [ESLint vs Biome 2026](https://reintech.io/blog/eslint-vs-biome-javascript-linting-comparison-2026)

Several of these are secondary blog posts; where they disagree (Radix vs Base UI, Tailwind vs modules) the
decision above states the project-specific reason rather than the consensus.
