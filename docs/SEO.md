# Search and AI discoverability

How this site is set up to be found by search engines and by AI search and assistant crawlers, and how to keep it that way.

## What is on the site

| URL | Purpose | Source |
| --- | --- | --- |
| `/` | Home: both tools, plus crawlable text and links to every section | `index.html` (by hand, this repository) |
| `/aws-practice-exams/` | Hub for the free AWS practice exams | generated |
| `/aws-practice-exams/solutions-architect-associate-saa-c03/` | SAA-C03 page: domain table, 8 sample questions with explanations | generated |
| `/aws-practice-exams/developer-associate-dva-c02/` | DVA-C02 page, same shape | generated |
| `/software-architecture-simulator/` | Landing page for Engineering Ops, with all 14 missions | generated |
| `/software-architecture-simulator/missions/<name>/` | One page per mission (scenario, brief, what it teaches) | generated |
| `/exam-simulator/` | The practice exam app, with metadata and crawlable text around it | `index.html` in [cert-exam-simulator](https://github.com/brunopasqualini/cert-exam-simulator) |
| `/engineering-ops/` | The simulator app (a React single-page app) | `index.html` in [system-design-simulator](https://github.com/brunopasqualini/system-design-simulator), built by the site pipeline |
| `/engineering-ops/dist/` | Old address of the app: redirects to `/engineering-ops/`, marked `noindex`, not in the sitemap | `scripts/build-site.mjs` |

The Engineering Ops app uses hash routing (`#/play/...`). Search engines treat everything after `#` as part of one page, so the app
itself can only ever be one indexable URL. The generated pages are what make its content findable: each mission has a real URL
with its own title, description and text, and links into the app.

## How the pages are generated

The generated pages, `sitemap.xml` and `llms.txt` are built from the exam question banks (in `cert-exam-simulator`) and the
Engineering Ops missions (in `system-design-simulator`), so they cannot drift from the apps. They are produced on every deploy
into `_site/` and are not committed. [`deploy.yml`](../.github/workflows/deploy.yml) does this on each push to `master` here and each push
to `main` in either project; to do it yourself, follow "Building locally" in the [README](../README.md).

Change a bank or a mission's title, tagline, story, brief or learning points in its own repository and merge it: the next
deploy regenerates the pages. To change the wording or structure of the generated pages, edit `scripts/seo/` in this repository.

The generator ends by holding every indexable page, hand-written and generated, to a checklist, and exits non-zero (failing the
deploy, or the pull request) if any page does not meet it:

The checklist: a `<title>` under 70 characters, a meta description of 50 to
170 characters, a canonical URL that matches the sitemap, `lang` on `<html>`, Open Graph title and image, exactly one `<h1>`,
`alt` on every image, valid JSON-LD, working internal links, no duplicate titles or descriptions, and no `noindex` on a page that is
in the sitemap.

## What was done and why

Based on Google Search Central's guidance (title links, snippets, JavaScript SEO, sitemaps, helpful content), the OpenAI and
Anthropic crawler documentation, and the general state of AI-search guidance.

- **Unique, descriptive titles and descriptions** on every page, written around what people search for (free AWS practice exam,
  SAA-C03, DVA-C02, software architecture and system design practice) without keyword stuffing.
- **Canonical URLs, Open Graph and Twitter cards**, with a 1200x630 preview image (`assets/og-image.png`).
- **Crawlable content.** Each page is plain server-delivered HTML with headings, text and ordinary `<a href>` links, so it works for
  crawlers that do not run JavaScript. The apps carry fallback text and links for the same reason.
- **Real content on each exam page.** Question counts and domain breakdown come from the data, and eight sample questions with
  explanations are in the HTML, so the page is useful on its own and matches long-tail searches such as "AWS SAA-C03 sample
  question about Glue job bookmarks".
- **Structured data (JSON-LD):** `WebSite` and `ItemList` on the home page, `WebApplication` on the apps,
  `CollectionPage`, `Quiz`/`Question` and `FAQPage` on the exam pages, `LearningResource` on missions, and `BreadcrumbList`
  throughout. Google restricts some rich results (FAQ, for example, to a small set of sites), so treat this as helping search
  engines and AI systems understand the pages, not as a promise of rich results.
- **`sitemap.xml`** listing every indexable page. `priority` and `changefreq` are left out because Google ignores them, and
  `lastmod` is left out because it is only used when it is reliably accurate.
- **`robots.txt`** that allows everything, names the AI search and assistant crawlers (OAI-SearchBot, ChatGPT-User, GPTBot,
  Claude-SearchBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended) and points to the
  sitemap. It blocks nothing.
  Blocking training crawlers such as GPTBot or ClaudeBot while still allowing the search ones is a one-line change per bot if you
  ever want that.
- **`llms.txt`**, a short Markdown guide to the site for AI agents. Support for it is not established among the major crawlers, so
  it is cheap insurance rather than a ranking lever.
- **A custom `404.html`** (marked `noindex`) that links back to the main sections.
- **Honesty about the content.** The practice questions are AI-generated from official AWS documentation and are not official AWS
  material. The exam app's start screen, its footer, every practice-exam page and the site footer say so, together with a
  non-affiliation notice and a link to contribute question banks on GitHub. That matches Google's "people-first, trustworthy content" guidance and avoids trademark and
  "exam dump" problems.
- **Also fixed:** the exam catalog said "Associated" instead of "Associate", and `/exam-simulator/?cert=aws-saa-c03` now opens
  the named exam so the landing pages can link straight to it.

## Things only you can do

A static site cannot do these for itself, and they matter more for ranking than anything in the HTML.

1. **Verify the site in Google Search Console** (URL-prefix property `https://brunopasqualini.github.io/`). The easiest way on
   GitHub Pages is the HTML-tag method: add the `<meta name="google-site-verification" content="...">` tag Google gives you to the
   `<head>` of `index.html` (and to `scripts/seo/site.mjs` if you want it on every page). Then **submit
   `https://brunopasqualini.github.io/sitemap.xml`** and use URL Inspection to **Request indexing** for the home page, the hub,
   and each exam page. Also do this for Bing Webmaster Tools (it can import from Search Console).
2. **Set the repository's description, website and topics** on GitHub (About box): description such as "Free AWS practice exams
   and a software architecture simulator", website `https://brunopasqualini.github.io/`, topics like `aws`, `aws-certification`,
   `practice-exam`, `system-design`, `software-architecture`, `sre`.
3. **Earn links.** Backlinks from real sites are the biggest ranking factor you control. Post it where the audience is (a "Show HN",
   r/AWSCertifications, r/devops, dev.to or Hashnode write-ups, LinkedIn), and ask people who write about AWS study resources.
4. **Consider a custom domain** with a name that says what the site is. A `github.io` subdomain can rank, but a descriptive domain
   builds authority over time and survives moving hosts.

## Expectations

Ranking in the first few results for "free AWS practice exam" is hard: established sites (Tutorials Dojo, Digital Cloud
Training, AWS's own practice questions) have years of links and much larger question banks. A new site with 2 exams and a
`github.io` address is more likely to rank first for narrower searches, such as a specific exam code plus "free practice",
a specific topic, or "software architecture simulator". The pages are built to win those, and to be eligible for the broader ones
as links and content accumulate. Indexing usually takes days to weeks after submitting the sitemap, and results are not guaranteed.
