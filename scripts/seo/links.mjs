// Link integrity for the built site. Every link in every checked page, the sitemap and llms.txt must point somewhere real:
//  - same-site links resolve to a built file, and a #fragment exists on the target page
//  - app links into Engineering Ops (#/play/<id>) name a real mission, and ?cert=<id> links name a real exam
//  - external links use https, and links that open a new tab carry rel="noopener"
// External URLs are not fetched here (the build must not depend on other sites being up).
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { OUT } from './data.mjs';
import { SITE } from './site.mjs';

const ORIGIN = new URL(SITE).origin;
const SKIP = /^(mailto:|tel:|javascript:|data:)/i;

/** The built file a same-site path points at, or null. */
function fileFor(pathname) {
  const target = join(OUT, decodeURIComponent(pathname));
  if (existsSync(target) && statSync(target).isFile()) return target;
  const index = join(target, 'index.html');
  return existsSync(index) ? index : null;
}

const ids = new Map();
const idsIn = (file) => {
  if (!ids.has(file)) {
    const html = readFileSync(file, 'utf8');
    ids.set(file, new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  }
  return ids.get(file);
};

/** Strings under link-like keys in JSON-LD (never `@id`, which names an entity and is not a link). */
function jsonLdUrls(value, out = []) {
  if (Array.isArray(value)) value.forEach((v) => jsonLdUrls(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (['url', 'item', 'image', 'contentUrl', 'sameAs'].includes(k)) [v].flat().forEach((u) => typeof u === 'string' && out.push(u));
      jsonLdUrls(v, out);
    }
  }
  return out;
}

/** Every link in a page: [url, kind, tag]. Scripts are stripped first so strings in JavaScript are not mistaken for links. */
function linksIn(html) {
  const found = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      for (const u of jsonLdUrls(JSON.parse(m[1]))) found.push([u, 'json-ld', '']);
    } catch {
      /* invalid JSON-LD is reported by check.mjs */
    }
  }
  const body = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const m of body.matchAll(/<(a|link|img|script|source|iframe|form)\b[^>]*>/g)) {
    const tag = m[0];
    if (m[1] === 'link' && /\brel="(preconnect|dns-prefetch)"/.test(tag)) continue;
    const attr = m[1] === 'form' ? 'action' : /\b(?:href|src)="/.test(tag) ? (/\bhref="/.test(tag) ? 'href' : 'src') : null;
    const url = attr && tag.match(new RegExp(`\\s${attr}="([^"]*)"`))?.[1];
    if (url !== null && url !== undefined) found.push([url, m[1], tag]);
  }
  for (const m of body.matchAll(/<meta\b[^>]*(?:property|name)="(?:og:image|og:url|twitter:image)"[^>]*content="([^"]*)"/g)) found.push([m[1], 'meta', '']);
  return found;
}

/**
 * @param {{ pages: {path: string, file: string}[], missionIds: string[], certIds: string[] }} args
 * @returns {string[]} problems
 */
export function checkLinks({ pages, missionIds, certIds }) {
  const problems = [];
  const missions = new Set(missionIds);
  const certs = new Set(certIds);

  const verify = (where, raw, base, kind, tag) => {
    const url = raw.trim();
    if (url === '' && kind !== 'a') return;
    if (SKIP.test(url)) return;
    let u;
    try {
      u = new URL(url, base);
    } catch {
      problems.push(`${where}: "${raw}" is not a valid URL`);
      return;
    }
    if (u.origin !== ORIGIN) {
      if (u.protocol !== 'https:') problems.push(`${where}: ${url} is not https`);
      if (/\btarget="_blank"/.test(tag) && !/\brel="[^"]*noopener/.test(tag)) problems.push(`${where}: ${url} opens a new tab without rel="noopener"`);
      return;
    }
    const file = fileFor(u.pathname);
    if (!file) {
      problems.push(`${where}: ${url} does not exist in the built site`);
      return;
    }
    const fragment = decodeURIComponent(u.hash.slice(1));
    if (fragment.startsWith('/')) {
      // A hash route inside the Engineering Ops app, e.g. #/play/m4-network.
      const play = fragment.match(/^\/play\/([^/?]+)/);
      if (!u.pathname.startsWith('/engineering-ops/')) problems.push(`${where}: ${url} is a hash route outside the app`);
      else if (play && !missions.has(play[1])) problems.push(`${where}: ${url} names a mission that does not exist`);
    } else if (fragment && file.endsWith('.html') && !idsIn(file).has(fragment)) {
      problems.push(`${where}: ${url} points at #${fragment}, which does not exist on that page`);
    }
    const cert = u.searchParams.get('cert');
    if (cert !== null && u.pathname === '/exam-simulator/' && !certs.has(cert)) problems.push(`${where}: ${url} names an exam (${cert}) that does not exist`);
  };

  for (const { path, file } of pages) {
    const full = join(OUT, file);
    if (!existsSync(full)) continue; // reported by check.mjs
    for (const [url, kind, tag] of linksIn(readFileSync(full, 'utf8'))) verify(`${path} (${file})`, url, `${SITE}${path}`, kind, tag);
  }

  const sitemap = readFileSync(join(OUT, 'sitemap.xml'), 'utf8');
  for (const m of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) verify('sitemap.xml', m[1], `${SITE}/`, 'sitemap', '');
  for (const m of readFileSync(join(OUT, 'llms.txt'), 'utf8').matchAll(/\]\((https?:\/\/[^)\s]+)\)/g)) verify('llms.txt', m[1], `${SITE}/`, 'llms', '');
  const robots = readFileSync(join(OUT, 'robots.txt'), 'utf8').match(/^Sitemap:\s*(\S+)/m)?.[1];
  if (!robots) problems.push('robots.txt: no Sitemap line');
  else verify('robots.txt', robots, `${SITE}/`, 'robots', '');
  return problems;
}
