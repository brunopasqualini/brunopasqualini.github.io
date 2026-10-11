import { describe, expect, it } from 'vitest';
import { FEEDBACK_CAP, NOTE_MAX, cleanNote, exportJson, find, issueUrl, summarize, toText, upsert, type Feedback } from '@/game/feedback';

const fb = (o: Partial<Feedback> = {}): Feedback => ({
  missionId: 'm2-db-meltdown',
  attempt: 1,
  at: 1,
  mode: 'beginner',
  passed: true,
  overall: 80,
  hintsUsed: 0,
  minutes: 12,
  simVersion: 1,
  ...o,
});

describe('upsert', () => {
  it('adds a response, and answering the same attempt again updates it instead of duplicating', () => {
    let l = upsert([], fb({ difficulty: 'too-hard' }));
    l = upsert(l, fb({ difficulty: 'about-right', clarity: 'clear' }));
    expect(l).toHaveLength(1);
    expect(l[0].difficulty).toBe('about-right');
    expect(l[0].clarity).toBe('clear');
  });
  it('keeps a separate response per attempt and per mission', () => {
    let l = upsert([], fb());
    l = upsert(l, fb({ attempt: 2 }));
    l = upsert(l, fb({ missionId: 'm5-queue' }));
    expect(l).toHaveLength(3);
  });
  it('drops the oldest entries past the cap', () => {
    let l: Feedback[] = [];
    for (let i = 0; i < FEEDBACK_CAP + 5; i++) l = upsert(l, fb({ attempt: i + 1 }));
    expect(l).toHaveLength(FEEDBACK_CAP);
    expect(l[0].attempt).toBe(6);
  });
  it('tidies the note: collapses whitespace, caps the length, drops an empty one', () => {
    expect(cleanNote('  too   many\n\nspaces  ')).toBe('too many spaces');
    expect(cleanNote('x'.repeat(NOTE_MAX + 100))).toHaveLength(NOTE_MAX);
    expect(cleanNote('   ')).toBeUndefined();
    expect(upsert([], fb({ note: '   ' }))[0].note).toBeUndefined();
  });
  it('does not mutate the list it is given', () => {
    const l = [fb()];
    upsert(l, fb({ attempt: 2 }));
    expect(l).toHaveLength(1);
  });
  it('finds a response by mission and attempt', () => {
    const l = upsert([], fb({ attempt: 3, difficulty: 'too-easy' }));
    expect(find(l, 'm2-db-meltdown', 3)?.difficulty).toBe('too-easy');
    expect(find(l, 'm2-db-meltdown', 1)).toBeUndefined();
  });
});

describe('summarize', () => {
  it('tallies per mission and puts the most troubled mission first', () => {
    const l: Feedback[] = [
      fb({ missionId: 'a', difficulty: 'about-right', clarity: 'clear' }),
      fb({ missionId: 'b', attempt: 1, difficulty: 'too-hard', clarity: 'unclear', passed: false }),
      fb({ missionId: 'b', attempt: 2, difficulty: 'too-hard' }),
      fb({ missionId: 'c', difficulty: 'too-easy' }),
    ];
    const s = summarize(l);
    expect(s.map((x) => x.missionId)).toEqual(['b', 'a', 'c']);
    expect(s[0]).toMatchObject({ responses: 2, tooHard: 2, unclear: 1, passed: 1 });
    expect(s.find((x) => x.missionId === 'c')!.tooEasy).toBe(1);
  });
  it('is empty for no feedback', () => expect(summarize([])).toEqual([]));
});

describe('export and sharing', () => {
  it('exports valid JSON that round-trips', () => {
    const l = [fb({ difficulty: 'too-hard', note: 'where is the DB panel?' })];
    const parsed = JSON.parse(exportJson(l));
    expect(parsed.v).toBe(1);
    expect(parsed.feedback).toEqual(l);
  });
  it('writes a readable text summary with notes', () => {
    const t = toText([fb({ difficulty: 'too-hard', clarity: 'unclear', passed: false, hintsUsed: 2, note: 'lost at step 3' })]);
    expect(t).toContain('m2-db-meltdown');
    expect(t).toContain('Too hard');
    expect(t).toContain('Confusing');
    expect(t).toContain('not passed');
    expect(t).toContain('2 hints');
    expect(t).toContain('"lost at step 3"');
    expect(toText([])).toBe('No feedback recorded yet.');
  });
  it('builds a pre-filled issue link that stays a sensible length however much feedback exists', () => {
    const many = Array.from({ length: 150 }, (_, i) => fb({ attempt: i + 1, note: 'n'.repeat(200) }));
    const url = issueUrl(many, 'https://github.com/o/r');
    expect(url.startsWith('https://github.com/o/r/issues/new?title=')).toBe(true);
    expect(url.length).toBeLessThan(9000);
    const q = new URL(url).searchParams;
    expect(q.get('title')).toBe('Engineering Ops feedback');
    expect(q.get('body')).toContain('Mission feedback');
  });
  it('escapes characters that would break the link', () => {
    const url = issueUrl([fb({ note: 'a & b = c? #1 "quoted"' })], 'https://github.com/o/r');
    expect(new URL(url).searchParams.get('body')).toContain('a & b = c? #1 "quoted"');
  });
});
