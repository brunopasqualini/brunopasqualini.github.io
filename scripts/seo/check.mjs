// The checklist every indexable page has to meet. Returns a list of problems (empty when everything passes).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { OUT } from './data.mjs';
import { SITE } from './site.mjs';

const attr = (html, re) => html.match(re)?.[1];

export function check({ pages }) {
  const problems = [];
  const titles = new Map();
  const descriptions = new Map();
  const sitemap = readFileSync(join(OUT, 'sitemap.xml'), 'utf8');

  const exists = (href) => {
    const path = href.split('#')[0].split('?')[0];
    if (!path || !path.startsWith('/')) return true;
    const target = join(OUT, path);
    if (existsSync(target) && statSync(target).isFile()) return true;
    return existsSync(join(target, 'index.html'));
  };

  for (const { path, file } of pages) {
    const where = `${path} (${file})`;
    if (!existsSync(join(OUT, file))) {
      problems.push(`${where}: file is missing`);
      continue;
    }
    const html = readFileSync(join(OUT, file), 'utf8');
    const title = attr(html, /<title>([^<]*)<\/title>/);
    const description = attr(html, /<meta\s+name="description"\s+content="([^"]*)"/);
    const canonical = attr(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);

    if (!title) problems.push(`${where}: missing <title>`);
    else if (title.length > 70) problems.push(`${where}: title is ${title.length} characters (keep it under 70)`);
    if (!description) problems.push(`${where}: missing meta description`);
    else if (description.length < 50 || description.length > 170) problems.push(`${where}: description is ${description.length} characters (aim for 50-170)`);
    if (canonical !== `${SITE}${path}`) problems.push(`${where}: canonical is ${canonical ?? 'missing'}, expected ${SITE}${path}`);
    if (!/<html[^>]*\slang="/.test(html)) problems.push(`${where}: missing lang on <html>`);
    if (!/property="og:title"/.test(html) || !/property="og:image"/.test(html)) problems.push(`${where}: missing Open Graph title or image`);
    const ogImage = attr(html, /<meta\s+property="og:image"\s+content="([^"]*)"/);
    if (ogImage?.startsWith(SITE) && !exists(ogImage.slice(SITE.length))) problems.push(`${where}: og:image ${ogImage} does not exist in the built site`);
    if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) problems.push(`${where}: is marked noindex but listed in the sitemap`);
    if (!sitemap.includes(`<loc>${SITE}${path}</loc>`)) problems.push(`${where}: not in sitemap.xml`);

    // An app page is client rendered, so its single h1 may sit in the fallback markup inside the root element.
    const h1s = (html.match(/<h1[\s>]/g) ?? []).length;
    if (h1s !== 1) problems.push(`${where}: has ${h1s} <h1> elements (needs exactly one)`);

    for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt=/.test(m[0])) problems.push(`${where}: an <img> has no alt attribute`);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try {
        JSON.parse(m[1]);
      } catch {
        problems.push(`${where}: invalid JSON-LD`);
      }
    }
    const resolvable = file.startsWith('engineering-ops/') ? () => true : exists;
    for (const m of html.matchAll(/\s(?:href|src)="(\/[^"]*|\.\.?\/[^"]*)"/g)) {
      const link = m[1].startsWith('/') ? m[1] : null;
      if (link && !resolvable(link)) problems.push(`${where}: link to ${link} does not resolve`);
    }

    if (title && titles.has(title)) problems.push(`${where}: duplicate title with ${titles.get(title)}`);
    titles.set(title, path);
    if (description && descriptions.has(description)) problems.push(`${where}: duplicate description with ${descriptions.get(description)}`);
    descriptions.set(description, path);
  }

  // A page that is published but neither in the sitemap nor marked noindex is a page search engines may find by accident
  // or never find at all: usually a forgotten entry in HANDWRITTEN or a stray file.
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.html') ? [join(dir, e.name)] : []));
  for (const file of walk(OUT)) {
    const rel = relative(OUT, file).split(sep).join('/');
    const path = rel.endsWith('index.html') ? `/${rel.slice(0, -'index.html'.length)}` : `/${rel}`;
    const html = readFileSync(file, 'utf8');
    if (!sitemap.includes(`<loc>${SITE}${path}</loc>`) && !/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) {
      problems.push(`${path} (${rel}): published but not in sitemap.xml and not marked noindex`);
    }
  }
  return problems;
}
