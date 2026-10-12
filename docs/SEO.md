# Search and AI discoverability

How the site is made findable by search engines and AI crawlers, and how the build keeps it that way.

## Pages

| URL | Source |
| --- | --- |
| `/` CV (`ProfilePage` + `Person` structured data) | `index.html` here |
| `/tools/` both tools, with crawlable text | `tools/index.html` here |
| `/aws-practice-exams/` and one page per exam (SAA-C03, DVA-C02: domain table, 8 sample questions) | generated |
| `/software-architecture-simulator/` and `/missions/<name>/` (one per mission) | generated |
| `/exam-simulator/` | `index.html` in cert-exam-simulator |
| `/engineering-ops/` | built from system-design-simulator |
| `/engineering-ops/dist/` old address: redirects, `noindex`, not in the sitemap | `scripts/build-site.mjs` |

**Why generated pages:** Engineering Ops uses hash routing (`#/play/…`), and search engines treat everything after `#` as one page. Each mission therefore gets a real static URL with its own title, description and text, linking into the app.

## How pages are generated

`scripts/seo/generate.mjs` builds the generated pages, `sitemap.xml` and `llms.txt` into `_site/` on every deploy, from the exam banks and the missions, so they cannot drift from the apps. Nothing generated is committed. To change a bank or a mission, edit its repo; to change the wording or structure of the generated pages, edit `scripts/seo/`. Build steps are in the [README](../README.md).

The generator then checks every indexable page and fails the build if any check fails:

- `<title>` under 70 characters; meta description 50 to 170
- canonical URL matching the sitemap; `lang` on `<html>`
- Open Graph title and image, and the `og:image` file exists in the built site
- exactly one `<h1>`; `alt` on every image
- valid JSON-LD; working internal links
- no duplicate titles or descriptions; no `noindex` on a page in the sitemap
- every published HTML page is in the sitemap or marked `noindex`

Links are checked separately (`scripts/seo/links.mjs`) across every checked page, the sitemap, `llms.txt` and `robots.txt`, including JSON-LD URLs:

- same-site links resolve to a built file, and a `#fragment` exists on its target page
- app links `…/engineering-ops/#/play/<id>` name a real mission; `…/exam-simulator/?cert=<id>` names a real exam
- external links use `https`, and links that open a new tab carry `rel="noopener"`
- external URLs are not fetched, so the build never depends on other sites being up

## Decisions

- **Static, crawlable HTML.** Pages work without JavaScript; the apps carry fallback text and links for the same reason.
- **Metadata.** Unique titles and descriptions per page, canonical URLs, Open Graph and Twitter cards (`assets/og-image.png` for the tools, `assets/og-cv.png` for the CV).
- **Structured data.** `Person` (CV), `WebSite` and `ItemList` (tools), `WebApplication` (apps), `CollectionPage`, `Quiz` and `FAQPage` (exams), `LearningResource` (missions), `BreadcrumbList` (all generated pages). It helps engines and AI understand the pages; it does not promise rich results.
- **`sitemap.xml`** lists every indexable page, without `priority`, `changefreq` or `lastmod` (ignored by Google or unreliable).
- **`robots.txt`** allows everything and names the AI search and assistant crawlers. Blocking training crawlers such as GPTBot or ClaudeBot is one line per bot.
- **`llms.txt`** is a short Markdown guide for AI agents. Support is not established, so it is cheap insurance, not a ranking lever.
- **`404.html`** is `noindex` and links to the main sections.
- **Disclosure.** The practice questions are AI-generated from official AWS documentation and are not official exam content. The exam app, every exam page and the site footer say so, state non-affiliation with AWS, and link to the question-bank contribution guide.
