// Shared building blocks for the generated pages: head metadata, structured data, header and footer.
export const SITE = 'https://brunopasqualini.github.io';
export const REPO = 'https://github.com/brunopasqualini/brunopasqualini.github.io';
export const REPO_EXAMS = 'https://github.com/brunopasqualini/cert-exam-simulator';
export const REPO_OPS = 'https://github.com/brunopasqualini/system-design-simulator';
export const CONTRIBUTE = `${REPO_EXAMS}/blob/main/CONTRIBUTING.md`;
export const OG_IMAGE = `${SITE}/assets/og-image.png`;
export const SITE_NAME = 'Bruno Pasqualini: free learning tools';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON-LD for a <script> tag; "<" is escaped so the data can never close the script element. */
export const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

export const slug = (s) =>
  s
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/\+/g, ' plus ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const url = (path) => `${SITE}${path}`;

/** The disclosure shown near the top of every page about the practice questions. */
export function notice() {
  return `<aside class="notice" role="note">
        <strong>About these questions.</strong> The practice questions are AI-generated from official AWS documentation. They are
        not official exam content. This website and its tools are not affiliated with, endorsed by or sponsored by AWS or any
        other cloud provider.
        <a href="${CONTRIBUTE}" rel="noopener">Add your own question bank on GitHub</a>.
      </aside>`;
}

export function breadcrumbs(trail) {
  const items = trail.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url(path) }));
  const html =
    '<nav class="crumbs" aria-label="Breadcrumb"><ol>' +
    trail
      .map(([name, path], i) => (i === trail.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${path}">${esc(name)}</a></li>`))
      .join('') +
    '</ol></nav>';
  return { html, ld: { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items } };
}

export function faq(items) {
  const html =
    '<section class="faq" aria-labelledby="faq-h"><h2 id="faq-h">Frequently asked questions</h2>' +
    items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('') +
    '</section>';
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
  return { html, ld: data };
}

const NAV = [
  ['/aws-practice-exams/', 'AWS practice exams'],
  ['/software-architecture-simulator/', 'Software architecture simulator'],
];

/** A complete page. `page.ld` is a list of JSON-LD objects; `page.body` goes inside <main>. */
export function layout(page) {
  const canonical = url(page.path);
  const head = [
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    '<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />',
    '<meta name="theme-color" content="#070c18" />',
    `<meta property="og:site_name" content="${esc(SITE_NAME)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    '<meta property="og:image:width" content="1200" />',
    '<meta property="og:image:height" content="630" />',
    `<meta property="og:image:alt" content="${esc(SITE_NAME)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(page.title)}" />`,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg" />',
    '<link rel="icon" type="image/png" sizes="192x192" href="/assets/icon-192.png" />',
    '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png" />',
    '<link rel="stylesheet" href="/styles.css" />',
    ...page.ld.map(ld),
  ];
  const nav = NAV.map(([href, label]) => `<a href="${href}">${esc(label)}</a>`).join('');
  return `<!doctype html>
<html lang="en">
  <head>
    ${head.join('\n    ')}
  </head>
  <body>
    <a class="skip" href="#main">Skip to content</a>
    <header class="topnav">
      <a class="brand" href="/" aria-label="Home">
        <img class="brandmark" src="/favicon.svg" alt="" width="28" height="28" />
        <span class="brand-text"><b>Bruno Pasqualini</b><small>Learning tools</small></span>
      </a>
      <nav class="topnav-links" aria-label="Main">${nav}</nav>
    </header>
    <main id="main" class="article">
      ${page.body}
    </main>
    <footer class="foot">
      <nav class="foot-links" aria-label="Footer">
        <a href="/">CV</a><a href="/tools/">My tools</a>${nav}<a href="/exam-simulator/">Open the exam simulator</a><a href="/engineering-ops/">Open Engineering Ops</a><a href="${CONTRIBUTE}" rel="noopener">Contribute a question bank</a><a href="${REPO_OPS}" rel="noopener">Simulator on GitHub</a><a href="${REPO_EXAMS}" rel="noopener">Exam simulator on GitHub</a>
      </nav>
      <p>
        Independent study tools. This website and its tools are not affiliated with, endorsed by or sponsored by Amazon Web
        Services, Inc., Google Cloud, Microsoft or any other cloud provider or certification body. AWS and the AWS certification
        names are trademarks of their owners, used here only to describe what the practice material is about. The practice
        questions are AI-generated from official AWS documentation and are not official exam content. Everything runs in your
        browser; nothing is sent to a server.
      </p>
    </footer>
  </body>
</html>
`;
}
