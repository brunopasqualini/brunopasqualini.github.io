import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (f: string) => readFileSync(resolve(import.meta.dirname, f), 'utf8');
const tokens = read('tokens.css');

const token = (name: string): string => {
  const m = tokens.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`token ${name} not found`);
  return m[1];
};

const lin = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('colour tokens meet WCAG AA for text', () => {
  const surfaces = ['--bg', '--bg2', '--panel', '--panel2', '--panel3'];
  for (const fg of ['--text', '--muted', '--faint', '--red-text']) {
    for (const bg of surfaces) {
      it(`${fg} on ${bg} >= 4.5`, () => expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5));
    }
  }
  it('white on the solid red fill (badges, alerts) >= 4.5', () =>
    expect(contrast('#ffffff', token('--red-strong'))).toBeGreaterThanOrEqual(4.5));
  it('primary button text on both ends of its gradient >= 4.5', () => {
    const css = read('components/buttons.css');
    const g = css.match(/\.btn-primary\s*\{[^}]*linear-gradient\(180deg,\s*(#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/i)!;
    for (const end of [g[1], g[2]]) expect(contrast('#ecfeff', end)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('embedding safety', () => {
  it('keeps the global colour scheme, background and text colour unlayered so a host page cannot override them', () => {
    const idx = read('index.css');
    const unlayered = idx.slice(idx.lastIndexOf('*/'));
    expect(unlayered).toMatch(/:root\s*\{\s*color-scheme:\s*dark/);
    expect(unlayered).toMatch(/body\s*\{[^}]*color:\s*var\(--text\)/s);
    expect(unlayered).toMatch(/body\s*\{[^}]*background:/s);
  });
});
